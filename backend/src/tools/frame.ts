import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { extractFramesAtTimestamps } from "../utils/frame_extractor.js";
import { logger } from "../utils/logger.js";

export const getFramesTool = tool(
  async ({ timestamps, videoUrl, sessionId }: { timestamps: number[]; videoUrl: string; sessionId?: string }) => {
    try {
      if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
        logger.info("[FrameTool] No timestamps provided for frame extraction.");
        return JSON.stringify([]);
      }

      logger.info(`[FrameTool] Invoking frame extractor for ${timestamps.length} timestamp(s): [${timestamps.join(", ")}s]`);
      const frames = await extractFramesAtTimestamps(videoUrl, timestamps, sessionId);
      logger.info(`[FrameTool] Extracted ${frames.length} valid frame(s)`);
      return JSON.stringify(frames);
    } catch (err: any) {
      logger.error(`[FrameTool] Error in getFrames tool: ${err.message}`);
      return JSON.stringify([]);
    }
  },
  {
    name: "getFrames",
    description: "Extract video visual frame snapshots at specific timestamps in seconds. Call this once with an array of all timestamps where important visual content (slides, diagrams, code blocks, formulas) is presented.",
    schema: z.object({
      timestamps: z.array(z.number()).describe("Array of timestamps in seconds where video visual frame snapshots should be extracted"),
      videoUrl: z.string().describe("The YouTube video URL to extract frames from"),
      sessionId: z.string().optional().describe("Optional session ID"),
    }),
  }
);
