import { readdir } from "fs/promises";
import fs from "fs";
import path from "path";
import { redis } from "../configs/redis.js";
import {
  getSessionCollection,
  getTranscriptionCollection,
  getNotesCollection,
} from "../database/collections.js";
import { logger } from "./logger.js";
import type { SessionStatusType } from "../schmas/session_schema.js";
import type { TranscriptChunk } from "../schmas/transcript_chunk.js";

/**
 * Standard Time-To-Live (TTL) for all Redis keys: 24 hours (86,400 seconds).
 */
export const REDIS_24H_TTL = 86400;

export const RedisKeys = {
  session: (sessionId: string) => `session:${sessionId}`,
  audioQueue: (sessionId: string) => `audio_queue:${sessionId}`,
  context: (sessionId: string) => `context:${sessionId}`,
};

export interface AudioQueueChunkItem {
  chunkIndex: number;
  path: string;
}

export interface SessionStatusCacheResult {
  status: SessionStatusType;
  progress: number;
  source: "cache" | "db";
}

export interface TranscriptContextResult {
  currentChunk: TranscriptChunk | null;
  previousChunk: TranscriptChunk | null;
  summary: string;
  source: "cache" | "db";
}

/**
 * Updates or sets the session hash in Redis, always applying a 24-hour TTL.
 */
export async function setSessionCache(
  sessionId: string,
  data: {
    status?: string;
    progress?: number;
    lastActivity?: string;
    summary?: string;
  }
): Promise<void> {
  const key = RedisKeys.session(sessionId);
  const payload: Record<string, string | number> = {
    ...data,
    lastActivity: data.lastActivity || new Date().toISOString(),
  };

  await redis.hset(key, payload);
  await redis.expire(key, REDIS_24H_TTL);
  logger.debug(`[RedisCache] Updated ${key} with 24h TTL`);
}

/**
 * Retrieves the session status and progress.
 * On cache miss (key expired or missing status), queries MongoDB Sessions collection,
 * rebuilds the Redis cache with 24-hour TTL, and returns the recovered state.
 */
export async function getOrRebuildSessionStatus(
  sessionId: string
): Promise<SessionStatusCacheResult | null> {
  const key = RedisKeys.session(sessionId);

  try {
    const cached = await redis.hgetall(key);
    if (cached && cached.status) {
      // Cache hit: refresh 24h TTL
      await redis.expire(key, REDIS_24H_TTL);
      return {
        status: cached.status as SessionStatusType,
        progress: Number(cached.progress || 0),
        source: "cache",
      };
    }
  } catch (err: any) {
    logger.warn(`[RedisCache] Error checking cache for ${key}: ${err.message}. Falling back to DB.`);
  }

  // Cache miss: Rebuild from MongoDB
  logger.info(`[RedisCache] Cache miss for session status (${key}). Rebuilding from database...`);
  try {
    const col = await getSessionCollection();
    const sessionDb = await col.findOne({ sessionId });

    if (!sessionDb) {
      logger.warn(`[RedisCache] Session ${sessionId} not found in database during status rebuild.`);
      return null;
    }

    // Rebuild Redis cache
    await redis.hset(key, {
      status: sessionDb.status,
      progress: sessionDb.progress || 0,
      lastActivity: new Date().toISOString(),
    });
    await redis.expire(key, REDIS_24H_TTL);

    logger.info(
      `[RedisCache] Successfully rebuilt session cache for ${sessionId} from DB (status: ${sessionDb.status}, 24h TTL)`
    );

    return {
      status: sessionDb.status as SessionStatusType,
      progress: sessionDb.progress || 0,
      source: "db",
    };
  } catch (dbErr: any) {
    logger.error(`[RedisCache] Failed to fetch session ${sessionId} from database: ${dbErr.message}`);
    return null;
  }
}

/**
 * Populates the audio chunk queue sorted set in Redis with 24-hour TTL.
 */
export async function populateAudioQueue(
  sessionId: string,
  chunks: AudioQueueChunkItem[]
): Promise<void> {
  const key = RedisKeys.audioQueue(sessionId);
  if (chunks.length === 0) return;

  const pipeline = redis.pipeline();
  for (const chunk of chunks) {
    pipeline.zadd(key, chunk.chunkIndex, JSON.stringify(chunk));
  }
  pipeline.expire(key, REDIS_24H_TTL);
  await pipeline.exec();

  logger.info(`[RedisCache] Populated ${key} with ${chunks.length} chunks (24h TTL).`);
}

/**
 * Pops the next audio chunk from Redis.
 * If the queue is expired/empty (cache miss), inspects the session cache folder `./cache/${sessionId}`:
 * - If the folder exists and contains remaining .wav chunks, rebuilds the queue in ascending numeric order with 24h TTL and pops the first chunk.
 * - If the folder does not exist or is empty, returns null (meaning session audio processing is completed).
 */
export async function popAudioChunkWithRebuild(
  sessionId: string
): Promise<AudioQueueChunkItem | null> {
  const key = RedisKeys.audioQueue(sessionId);

  try {
    const popped = await redis.zpopmin(key);
    if (popped && popped.length > 0 && popped[0]) {
      // Chunk retrieved from existing queue; refresh 24h TTL if items remain
      const remainingCount = await redis.zcard(key);
      if (remainingCount > 0) {
        await redis.expire(key, REDIS_24H_TTL);
      }
      return JSON.parse(popped[0]) as AudioQueueChunkItem;
    }
  } catch (err: any) {
    logger.warn(`[RedisCache] Error popping from ${key}: ${err.message}. Checking disk cache folder.`);
  }

  // Queue is empty or expired -> Check disk cache for session folder
  const cacheDir = path.resolve(`./cache/${sessionId}`);
  logger.info(`[RedisCache] Audio queue cache miss for ${key}. Checking disk folder: ${cacheDir}`);

  if (!fs.existsSync(cacheDir)) {
    logger.info(`[RedisCache] Cache folder ${cacheDir} does not exist. Session ${sessionId} is completed.`);
    return null;
  }

  try {
    const dirEntries = await readdir(cacheDir);
    const wavFiles = dirEntries.filter((f) => f.toLowerCase().endsWith(".wav"));

    if (wavFiles.length === 0) {
      logger.info(`[RedisCache] Cache folder ${cacheDir} is empty. Session ${sessionId} is completed.`);
      return null;
    }

    // Unprocessed audio chunks remain on disk! Rebuild queue in natural ascending numerical order.
    const sortedFiles = wavFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/\.wav$/i, ""), 10);
      const numB = parseInt(b.replace(/\.wav$/i, ""), 10);
      return numA - numB;
    });

    logger.info(
      `[RedisCache] Found ${sortedFiles.length} remaining chunks on disk for session ${sessionId}. Rebuilding Redis audio queue...`
    );

    const pipeline = redis.pipeline();
    for (const file of sortedFiles) {
      const chunkIndex = parseInt(file.replace(/\.wav$/i, ""), 10);
      const audioPath = `./cache/${sessionId}/${file}`;
      const item: AudioQueueChunkItem = { chunkIndex, path: audioPath };
      pipeline.zadd(key, chunkIndex, JSON.stringify(item));
    }
    pipeline.expire(key, REDIS_24H_TTL);
    await pipeline.exec();

    logger.info(`[RedisCache] Successfully rebuilt ${key} with ${sortedFiles.length} chunk(s) (24h TTL).`);

    // Pop the next chunk from the rebuilt queue
    const poppedRebuilt = await redis.zpopmin(key);
    if (poppedRebuilt && poppedRebuilt.length > 0 && poppedRebuilt[0]) {
      const remainingCount = await redis.zcard(key);
      if (remainingCount > 0) {
        await redis.expire(key, REDIS_24H_TTL);
      }
      return JSON.parse(poppedRebuilt[0]) as AudioQueueChunkItem;
    }

    return null;
  } catch (dirErr: any) {
    logger.error(`[RedisCache] Error reading cache folder ${cacheDir}: ${dirErr.message}`);
    return null;
  }
}

/**
 * Updates the context in Redis with currentChunk, advancing previousChunk.
 * On cache miss (e.g. key expired before this chunk), fetches prior transcript chunks
 * and rolling summary from MongoDB to preserve continuity, then sets 24-hour TTL.
 */
export async function updateTranscriptContext(
  sessionId: string,
  currentChunk: TranscriptChunk
): Promise<{ previousChunk: TranscriptChunk | null; summary: string }> {
  const key = RedisKeys.context(sessionId);
  let previousChunk: TranscriptChunk | null = null;
  let summary = "";

  const isKeyExists = await redis.exists(key);

  if (isKeyExists === 1) {
    // Cache hit: read previous currentChunk to become previousChunk
    const prevCurrentStr = await redis.hget(key, "currentChunk");
    if (prevCurrentStr) {
      try {
        previousChunk = JSON.parse(prevCurrentStr) as TranscriptChunk;
      } catch (e) {}
    }
    summary = (await redis.hget(key, "summary")) || "";
  } else {
    // Cache miss: Rebuild prior context from MongoDB Transcriptions and Notes collections
    logger.info(`[RedisCache] Cache miss for ${key} during chunk update. Rebuilding prior context from DB...`);
    try {
      // 1. Fetch previous transcript chunk from database
      const transCol = await getTranscriptionCollection();
      const transDoc = await transCol.findOne({ sessionId });
      if (transDoc && Array.isArray(transDoc.transcripts) && transDoc.transcripts.length > 0) {
        // Filter out any chunk that might match currentChunk index, taking the latest prior one
        const priorTranscripts = transDoc.transcripts.filter(
          (t: any) => t.chunkIndex < currentChunk.chunkIndex
        );
        const lastPrior = priorTranscripts.length > 0
          ? priorTranscripts[priorTranscripts.length - 1]
          : transDoc.transcripts[transDoc.transcripts.length - 1];

        if (lastPrior) {
          previousChunk = {
            sessionId,
            videoTitle: transDoc.videoTitle || currentChunk.videoTitle,
            chunkIndex: lastPrior.chunkIndex,
            startAt: lastPrior.startAt,
            endAt: lastPrior.endAt,
            text: lastPrior.text,
          };
        }
      }

      // 2. Fetch rolling summary from Notes or Sessions
      const notesCol = await getNotesCollection();
      const notesDoc = await notesCol.findOne({ sessionId });
      if (notesDoc && typeof (notesDoc as any).summary === "string") {
        summary = (notesDoc as any).summary;
      } else {
        const sessCol = await getSessionCollection();
        const sessDoc = await sessCol.findOne({ sessionId });
        if (sessDoc && typeof sessDoc.summary === "string") {
          summary = sessDoc.summary;
        }
      }

      logger.info(
        `[RedisCache] Rebuilt prior context for ${sessionId}: previousChunkIndex=${previousChunk?.chunkIndex ?? "none"}, summaryLength=${summary.length}`
      );
    } catch (dbErr: any) {
      logger.warn(`[RedisCache] Could not rebuild prior context from DB: ${dbErr.message}`);
    }
  }

  // Update Redis context with new current chunk, previous chunk, summary, and 24h TTL
  await redis.hset(key, {
    summary: summary || "",
    previousChunk: previousChunk ? JSON.stringify(previousChunk) : "",
    currentChunk: JSON.stringify(currentChunk),
  });
  await redis.expire(key, REDIS_24H_TTL);

  return { previousChunk, summary };
}

/**
 * Retrieves the transcript context for LangGraph state machine execution.
 * On cache miss, rebuilds current chunk, previous chunk, and rolling summary from MongoDB and state fallback,
 * repopulates Redis with 24-hour TTL, and returns the state.
 */
export async function getOrRebuildTranscriptContext(
  sessionId: string,
  fallbackState?: {
    videoTitle?: string;
    videoUrl?: string;
    chunkIndex?: number;
    startTimestamp?: number;
    endTimestamp?: number;
    transcript?: string;
  }
): Promise<TranscriptContextResult> {
  const key = RedisKeys.context(sessionId);

  try {
    const context = await redis.hgetall(key);
    if (context && context.currentChunk) {
      await redis.expire(key, REDIS_24H_TTL);
      const current = JSON.parse(context.currentChunk) as TranscriptChunk;
      const previous = context.previousChunk ? (JSON.parse(context.previousChunk) as TranscriptChunk) : null;
      return {
        currentChunk: current,
        previousChunk: previous,
        summary: context.summary || "",
        source: "cache",
      };
    }
  } catch (err: any) {
    logger.warn(`[RedisCache] Error reading ${key}: ${err.message}. Attempting DB rebuild.`);
  }

  // Cache miss: Rebuild from DB
  logger.info(`[RedisCache] Context cache miss for ${key}. Rebuilding from database...`);

  let currentChunk: TranscriptChunk | null = null;
  let previousChunk: TranscriptChunk | null = null;
  let summary = "";

  try {
    const transCol = await getTranscriptionCollection();
    const transDoc = await transCol.findOne({ sessionId });
    const transcripts: any[] = transDoc?.transcripts || [];

    // Reconstruct current chunk
    if (fallbackState && fallbackState.chunkIndex !== undefined && fallbackState.transcript !== undefined) {
      currentChunk = {
        sessionId,
        videoTitle: fallbackState.videoTitle || transDoc?.videoTitle || "Lecture Video",
        chunkIndex: fallbackState.chunkIndex,
        startAt: fallbackState.startTimestamp ?? 0,
        endAt: fallbackState.endTimestamp ?? 0,
        text: fallbackState.transcript,
      };
    } else if (transcripts.length > 0) {
      const last = transcripts[transcripts.length - 1];
      currentChunk = {
        sessionId,
        videoTitle: transDoc?.videoTitle || "Lecture Video",
        chunkIndex: last.chunkIndex,
        startAt: last.startAt,
        endAt: last.endAt,
        text: last.text,
      };
    }

    // Reconstruct previous chunk
    if (currentChunk && transcripts.length > 0) {
      const priors = transcripts.filter((t) => t.chunkIndex < currentChunk!.chunkIndex);
      if (priors.length > 0) {
        const lastPrior = priors[priors.length - 1];
        previousChunk = {
          sessionId,
          videoTitle: transDoc?.videoTitle || currentChunk.videoTitle,
          chunkIndex: lastPrior.chunkIndex,
          startAt: lastPrior.startAt,
          endAt: lastPrior.endAt,
          text: lastPrior.text,
        };
      }
    }

    // Reconstruct rolling summary
    const notesCol = await getNotesCollection();
    const notesDoc = await notesCol.findOne({ sessionId });
    if (notesDoc && typeof (notesDoc as any).summary === "string") {
      summary = (notesDoc as any).summary;
    } else {
      const sessCol = await getSessionCollection();
      const sessDoc = await sessCol.findOne({ sessionId });
      if (sessDoc && typeof sessDoc.summary === "string") {
        summary = sessDoc.summary;
      }
    }

    // If currentChunk is found, populate Redis with 24h TTL
    if (currentChunk) {
      await redis.hset(key, {
        summary: summary || "",
        previousChunk: previousChunk ? JSON.stringify(previousChunk) : "",
        currentChunk: JSON.stringify(currentChunk),
      });
      await redis.expire(key, REDIS_24H_TTL);
      logger.info(`[RedisCache] Rebuilt ${key} in Redis from DB with 24h TTL.`);
    }

    return {
      currentChunk,
      previousChunk,
      summary,
      source: "db",
    };
  } catch (rebuildErr: any) {
    logger.error(`[RedisCache] Error rebuilding context from DB: ${rebuildErr.message}`);
    return {
      currentChunk,
      previousChunk,
      summary,
      source: "db",
    };
  }
}

/**
 * Updates rolling summary in Redis with 24-hour TTL and persists it to MongoDB Notes
 * and Sessions collections so it is preserved across cache expirations.
 */
export async function saveRollingSummary(
  sessionId: string,
  summary: string
): Promise<void> {
  const key = RedisKeys.context(sessionId);

  // 1. Update in Redis with 24h TTL
  await redis.hset(key, "summary", summary);
  await redis.expire(key, REDIS_24H_TTL);

  // 2. Persist to MongoDB Notes collection
  try {
    const notesCol = await getNotesCollection();
    await notesCol.updateOne(
      { sessionId },
      { $set: { summary, updatedAt: new Date() } }
    );
  } catch (err: any) {
    logger.warn(`[RedisCache] Failed to save rolling summary to Notes DB: ${err.message}`);
  }

  // 3. Also update Sessions collection
  try {
    const sessCol = await getSessionCollection();
    await sessCol.updateOne(
      { sessionId },
      { $set: { summary } }
    );
  } catch (err: any) {
    logger.warn(`[RedisCache] Failed to save rolling summary to Sessions DB: ${err.message}`);
  }

  logger.debug(`[RedisCache] Persisted rolling summary for session ${sessionId} to Redis (24h TTL) and DB`);
}
