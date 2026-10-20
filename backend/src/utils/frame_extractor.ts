import { exec } from "child_process";
import { promisify } from "util";
import { cleanYoutubeUrl } from "./load_audio.js";
import { uploadFrameToCloudinary } from "./cloudinary.js";
import { logger } from "./logger.js";
import { env } from "./env.js";

const execPromise = promisify(exec);

export interface ExtractedFrame {
  timestamp: number;
  base64: string;
  imageUrl?: string;
  caption?: string;
}

// In-memory cache for direct video stream URLs to avoid redundant yt-dlp queries
interface CachedStreamUrl {
  streamUrl: string;
  expiresAt: number;
}
const streamUrlCache = new Map<string, CachedStreamUrl>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Retrieves the direct video stream URL using yt-dlp, caching results for 30 minutes.
 * Prioritizes high-resolution HLS (m3u8_native) or DASH video streams up to 1080p.
 */
async function getVideoStreamUrl(cleanUrl: string, forceRefresh = false): Promise<string> {
  const cached = streamUrlCache.get(cleanUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.streamUrl;
  }

  logger.info(`Fetching direct high-quality video stream URL via yt-dlp for: ${cleanUrl}`);
  const { stdout } = await execPromise(
    `yt-dlp --no-playlist --user-agent "${USER_AGENT}" -f "bestvideo[protocol=m3u8_native][height<=1080]/bestvideo[height<=1080]/bestvideo/best" -g "${cleanUrl}"`,
    { timeout: 20000 }
  );

  const streamUrl = stdout.toString().trim();
  if (!streamUrl) {
    throw new Error("yt-dlp returned an empty stream URL");
  }

  streamUrlCache.set(cleanUrl, {
    streamUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return streamUrl;
}

/**
 * Detects scene changes within [startAt, endAt] using FFmpeg scene diffing (gt(scene, threshold))
 * and mpdecimate (duplicate frame removal), enforcing a minimum gap (minGapSeconds).
 */
async function detectSceneTimestamps(
  streamUrl: string,
  startAt: number,
  endAt: number,
  minGapSeconds = 2.0,
  sceneThreshold = 0.20
): Promise<number[]> {
  logger.info(`Running FFmpeg scene diffing + mpdecimate scan on timeframe [${startAt}s - ${endAt}s]...`);

  try {
    const { stderr } = await execPromise(
      `ffmpeg -y -ss ${startAt} -to ${endAt} -user_agent "${USER_AGENT}" -i "${streamUrl}" -vf "select='gt(scene,${sceneThreshold})',mpdecimate,showinfo" -f null -`,
      { timeout: 15000 }
    );

    const regex = /pts_time:\s*([\d\.]+)/g;
    let match;
    const rawTimestamps: number[] = [];

    while ((match = regex.exec(stderr)) !== null) {
      const matchStr = match[1];
      if (matchStr) {
        const relativePts = parseFloat(matchStr);
        if (!isNaN(relativePts)) {
          const absoluteTs = Math.round((startAt + relativePts) * 10) / 10;
          if (absoluteTs >= startAt && absoluteTs <= endAt) {
            rawTimestamps.push(absoluteTs);
          }
        }
      }
    }

    // Filter scene timestamps to enforce a minimum gap of minGapSeconds (e.g. 2.0s)
    const filteredTimestamps: number[] = [];
    let lastTs = -1;

    for (const ts of rawTimestamps) {
      if (lastTs === -1 || (ts - lastTs) >= minGapSeconds) {
        filteredTimestamps.push(ts);
        lastTs = ts;
      }
    }

    logger.info(
      `FFmpeg scene diffing found ${rawTimestamps.length} raw changes -> ${filteredTimestamps.length} timestamps after min ${minGapSeconds}s gap filter`
    );

    return filteredTimestamps;
  } catch (err: any) {
    logger.warn(`Scene detection scan failed/timed out (${err.message}). Falling back to default spacing.`);
    return [];
  }
}

/**
 * Extracts a single high-quality JPEG frame at a given timestamp in seconds from a direct stream URL.
 * Preserves high resolution (up to 1080p Full HD) with pristine JPEG quality (q:v 2).
 */
async function extractSingleFrame(
  streamUrl: string,
  timestampSeconds: number
): Promise<string> {
  const { stdout: buffer } = await execPromise(
    `ffmpeg -y -ss ${timestampSeconds} -user_agent "${USER_AGENT}" -i "${streamUrl}" -vf "scale='min(1920,iw)':-2" -q:v 2 -vframes 1 -f image2pipe -vcodec mjpeg -`,
    { encoding: "buffer", maxBuffer: 25 * 1024 * 1024, timeout: 20000 }
  );

  return (buffer as Buffer).toString("base64");
}

/**
 * Fallback helper: Computes evenly spaced timestamps across a timeframe [startAt, endAt].
 */
export function calculateEvenlySpacedTimestamps(
  startAt: number,
  endAt: number,
  count = env.FRAME_COUNT
): number[] {
  if (count <= 0) return [];
  const duration = Math.max(0, endAt - startAt);
  if (duration === 0) {
    return [Math.round(startAt)];
  }

  const timestamps: number[] = [];
  for (let i = 1; i <= count; i++) {
    const ts = Math.round(startAt + (i / (count + 1)) * duration);
    timestamps.push(ts);
  }
  return timestamps;
}

/**
 * Concurrently extracts video frames using FFmpeg scene diffing + mpdecimate (min 2s gap).
 * Falls back to evenly spaced timestamps if no scene changes are detected.
 */
export async function extractFramesForChunk(
  videoUrl: string,
  startAt: number,
  endAt: number,
  count = env.FRAME_COUNT,
  sessionId?: string
): Promise<ExtractedFrame[]> {
  if (!videoUrl || videoUrl.trim() === "") {
    logger.warn("extractFramesForChunk called with empty videoUrl");
    return [];
  }

  const cleanUrl = cleanYoutubeUrl(videoUrl);

  try {
    let streamUrl = await getVideoStreamUrl(cleanUrl);

    // 1. Run FFmpeg scene diffing + mpdecimate with min 2.0s gap
    let timestamps = await detectSceneTimestamps(streamUrl, startAt, endAt, 2.0, 0.20);

    // Cap maximum frames per chunk to prevent token explosion (e.g. max 3 frames per 2-min chunk)
    const maxFrames = Math.max(count || 1, 3);
    if (timestamps.length > maxFrames) {
      const step = (timestamps.length - 1) / (maxFrames - 1);
      const sampled: number[] = [];
      for (let i = 0; i < maxFrames; i++) {
        const val = timestamps[Math.round(i * step)];
        if (val !== undefined) {
          sampled.push(val);
        }
      }
      timestamps = Array.from(new Set(sampled)).sort((a, b) => a - b);
    }

    // 2. Fall back to evenly spaced timestamps if no scene change was detected in this chunk
    if (timestamps.length === 0) {
      logger.info(`No scene diffs detected in [${startAt}s - ${endAt}s]. Falling back to evenly spaced timestamp.`);
      timestamps = calculateEvenlySpacedTimestamps(startAt, endAt, count);
    }

    logger.info(
      `Extracting ${timestamps.length} frames for chunk [${startAt}s - ${endAt}s] at timestamps: [${timestamps.join(
        ", "
      )}s]`
    );

    // Concurrently extract frames for detected scene timestamps
    const framePromises = timestamps.map(async (ts): Promise<ExtractedFrame | null> => {
      try {
        const base64 = await extractSingleFrame(streamUrl, ts);
        const publicId = sessionId ? `${sessionId}_frame_${ts}s` : `frame_${ts}s`;
        const imageUrl = await uploadFrameToCloudinary(base64, publicId);
        return { timestamp: ts, base64, imageUrl };
      } catch (err: any) {
        logger.warn(
          `Initial frame extraction failed at ${ts}s (${err.message}). Retrying with fresh stream URL...`
        );
        try {
          const freshStreamUrl = await getVideoStreamUrl(cleanUrl, true);
          const base64 = await extractSingleFrame(freshStreamUrl, ts);
          const publicId = sessionId ? `${sessionId}_frame_${ts}s` : `frame_${ts}s`;
          const imageUrl = await uploadFrameToCloudinary(base64, publicId);
          return { timestamp: ts, base64, imageUrl };
        } catch (retryErr: any) {
          logger.error(`Frame extraction retry failed at ${ts}s: ${retryErr.message}`);
          return null;
        }
      }
    });

    const results = await Promise.all(framePromises);
    const validFrames = results.filter((f): f is ExtractedFrame => f !== null && !!f.base64);

    logger.info(
      `Successfully extracted ${validFrames.length}/${timestamps.length} scene-diffed frames for chunk [${startAt}s - ${endAt}s]`
    );

    return validFrames;
  } catch (error: any) {
    logger.error(`Failed to extract frames for chunk [${startAt}s - ${endAt}s]: ${error.message}`);
    return [];
  }
}

/**
 * Directly extracts frames at specific LLM-selected timestamps.
 */
export async function extractFramesAtTimestamps(
  videoUrl: string,
  timestamps: number[],
  sessionId?: string
): Promise<ExtractedFrame[]> {
  if (!videoUrl || videoUrl.trim() === "" || !timestamps || timestamps.length === 0) {
    return [];
  }

  const cleanUrl = cleanYoutubeUrl(videoUrl);

  try {
    const streamUrl = await getVideoStreamUrl(cleanUrl);

    logger.info(`Extracting frames at ${timestamps.length} LLM-selected timestamps: [${timestamps.join(", ")}s]`);

    const framePromises = timestamps.map(async (ts): Promise<ExtractedFrame | null> => {
      try {
        const base64 = await extractSingleFrame(streamUrl, ts);
        const publicId = sessionId ? `${sessionId}_frame_${ts}s` : `frame_${ts}s`;
        const imageUrl = await uploadFrameToCloudinary(base64, publicId);
        return { timestamp: ts, base64, imageUrl };
      } catch (err: any) {
        logger.warn(`Frame extraction failed at ${ts}s (${err.message}). Retrying with fresh stream URL...`);
        try {
          const freshStreamUrl = await getVideoStreamUrl(cleanUrl, true);
          const base64 = await extractSingleFrame(freshStreamUrl, ts);
          const publicId = sessionId ? `${sessionId}_frame_${ts}s` : `frame_${ts}s`;
          const imageUrl = await uploadFrameToCloudinary(base64, publicId);
          return { timestamp: ts, base64, imageUrl };
        } catch (retryErr: any) {
          logger.error(`Frame extraction retry failed at ${ts}s: ${retryErr.message}`);
          return null;
        }
      }
    });

    const results = await Promise.all(framePromises);
    return results.filter((f): f is ExtractedFrame => f !== null && !!f.base64);
  } catch (error: any) {
    logger.error(`Failed to extract frames at target timestamps: ${error.message}`);
    return [];
  }
}
