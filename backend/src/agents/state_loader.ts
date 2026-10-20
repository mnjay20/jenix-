import { getOrRebuildTranscriptContext } from "../utils/redis_cache.js";
import type { State } from "./graph.js";
import type { TranscriptChunk } from "../schmas/transcript_chunk.js";
import { logger } from "../utils/logger.js";
import { getSessionCollection } from "../database/collections.js";

export const stateLoader = async (state: State) => {
    const sessionId = state.sessionId;
    const { currentChunk, previousChunk, summary, source } = await getOrRebuildTranscriptContext(sessionId, {
        videoTitle: state.videoTitle,
        videoUrl: state.videoUrl,
        chunkIndex: state.chunkIndex,
        startTimestamp: state.startTimestamp,
        endTimestamp: state.endTimestamp,
        transcript: state.transcript,
    });

    if (!currentChunk) {
        logger.error(`No current chunk found for session: ${sessionId} (source: ${source})`);
        throw new Error(`No current chunk found for session: ${sessionId}`);
    }

    let videoUrl = (currentChunk as any).videoUrl || state.videoUrl || '';
    if (!videoUrl) {
        try {
            const col = await getSessionCollection();
            const sessionDb = await col.findOne({ sessionId });
            videoUrl = sessionDb?.videoUrl || '';
        } catch (e) {}
    }

    logger.info(
        `Successfully loaded context chunk index ${currentChunk.chunkIndex} for session: ${sessionId} (source: ${source})`
    );

    return {
        chunkIndex: currentChunk.chunkIndex,
        videoTitle: currentChunk.videoTitle ?? state.videoTitle ?? '',
        videoUrl,
        rollingSummary: summary || state.rollingSummary || '',
        previousTranscript: previousChunk?.text ?? state.previousTranscript ?? '',
        transcript: currentChunk?.text ?? state.transcript ?? '',
        startTimestamp: currentChunk.startAt ?? state.startTimestamp ?? 0,
        endTimestamp: currentChunk.endAt ?? state.endTimestamp ?? 0,
        frames: state.frames || [],
    };
};
