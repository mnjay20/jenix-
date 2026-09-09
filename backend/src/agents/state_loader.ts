import { redis } from "../configs/redis.js";
import type { State } from "./graph.js";
import type { TranscriptChunk } from "../schmas/transcript_chunk.js";
import { logger } from "../utils/logger.js";
import { getSessionCollection } from "../database/collections.js";

export const stateLoader = async (state: State) => {
    const sessionId = state.sessionId;
    const context = await redis.hgetall(`context:${sessionId}`);

    if (!context.currentChunk) {
        logger.error(`No current chunk found for session: ${sessionId}`);
        throw new Error(`No current chunk found for session: ${sessionId}`);
    }
    const currentChunk = JSON.parse(context.currentChunk) as TranscriptChunk;
    const previousChunk = context.previousChunk ? JSON.parse(context.previousChunk) as TranscriptChunk : null;

    let videoUrl = (currentChunk as any).videoUrl || '';
    if (!videoUrl) {
        try {
            const col = await getSessionCollection();
            const sessionDb = await col.findOne({ sessionId });
            videoUrl = sessionDb?.videoUrl || '';
        } catch (e) {}
    }

    logger.info(`Successfully loaded context chunk index ${currentChunk.chunkIndex} for session: ${sessionId}`);
    return {
        chunkIndex: currentChunk.chunkIndex,
        videoTitle: currentChunk.videoTitle ?? '',
        videoUrl,
        rollingSummary: context.summary ?? '',
        previousTranscript: previousChunk?.text ?? '',
        transcript: currentChunk?.text ?? '',
        startTimestamp: currentChunk.startAt,
        endTimestamp: currentChunk.endAt,
        frames: state.frames || [],
    };
};
