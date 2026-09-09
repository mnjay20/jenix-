import type { Socket } from "socket.io";
import { Events } from "../../utils/events.js";
import { redis } from "../../configs/redis.js";
import { transcribeAudio } from "../../transcription/index.js";
import { unlink } from 'fs/promises';
import type { TranscriptChunk } from "../../schmas/transcript_chunk.js";
import { env } from "../../utils/env.js";
import { graph } from "../../agents/graph.js";
import { getSessionCollection } from "../../database/collections.js";
import { logger } from "../../utils/logger.js";


export function transcriptHandler(socket: Socket) {
    const events = Events;

    const processNextChunk = async () => {
        const sessionId = socket.data.sessionId;
        if (!sessionId) {
            logger.error(`Session ID not found for socket: ${socket.id}`);
            return;
        }

        if (socket.data.isProcessingChunk) {
            logger.warn(`Session ${sessionId} is already processing a chunk. Queuing next_chunk request.`);
            socket.data.hasPendingNextChunkRequest = true;
            return;
        }

        socket.data.isProcessingChunk = true;

        try {
            logger.info(`Requested transcription for next chunk in session: ${sessionId}`);
            const audioChunk = await redis.zpopmin(`audio_queue:${sessionId}`);
            if (!audioChunk || audioChunk.length === 0) {
                logger.info(`No more audio chunks available for session: ${sessionId}`);
                socket.emit(events.TRANSCRIPT.COMPLETED, { message: "All audio chunks processed" });
                return;
            }

            const paresedChunk = JSON.parse(audioChunk[0]!);
            logger.info(`Processing chunkIndex: ${paresedChunk.chunkIndex} in session: ${sessionId}`);
            
            const fs = await import("fs");
            if (!fs.existsSync(paresedChunk.path)) {
                logger.warn(`Audio chunk file not found on disk: ${paresedChunk.path}. Skipping chunk transcription.`);
                socket.emit(events.ERROR.GENERAL, {
                    success: false,
                    message: `Audio chunk file missing: chunk index ${paresedChunk.chunkIndex}`
                });
                return;
            }

            const sessionCol = await getSessionCollection();
            const session = await sessionCol.findOne({ sessionId });
            const videoTitle = session?.videoTitle ?? "Unknown Video";
            const videoUrl = session?.videoUrl || "";

            const startAt = paresedChunk.chunkIndex * env.CHUNK_SIZE;
            const endAt = (paresedChunk.chunkIndex + 1) * env.CHUNK_SIZE;

            logger.info(
                `Starting sequential chunk processing pipeline for session: ${sessionId}, chunkIndex: ${paresedChunk.chunkIndex} [${startAt}s - ${endAt}s]`
            );

            // Step 1: Generate audio transcription
            const sttStart = Date.now();
            let rawTranscript: any;
            try {
                rawTranscript = await transcribeAudio(paresedChunk.path);
            } finally {
                try {
                    await unlink(paresedChunk.path);
                } catch (err) {
                    logger.error(`Failed to delete temporary audio file: ${paresedChunk.path}`, err);
                }
            }
            const transcript = typeof rawTranscript === "string" ? rawTranscript : String(rawTranscript || "");
            const sttMs = Date.now() - sttStart;
            logger.info(`[Step 1/2] Groq Audio STT finished in ${sttMs}ms for chunk ${paresedChunk.chunkIndex}`);

            const transcriptChunk: TranscriptChunk = {
                sessionId,
                videoTitle,
                chunkIndex: paresedChunk.chunkIndex,
                startAt,
                endAt,
                text: transcript,
            };

            const isKeyExists = await redis.exists(`context:${sessionId}`);
            if (isKeyExists === 0) {
                await redis.hset(`context:${sessionId}`, {
                    summary: '',
                    previousChunk: '',
                    currentChunk: JSON.stringify(transcriptChunk)
                });
            } else {
                const previousChunk = await redis.hget(`context:${sessionId}`, 'currentChunk');
                await redis.hset(`context:${sessionId}`, {
                    previousChunk: previousChunk ?? '',
                    currentChunk: JSON.stringify(transcriptChunk)
                });
            }
            await redis.expire(`context:${sessionId}`, 60 * 60 * 24);

            // Verify socket is still listening to this session before graph invocation
            if (socket.data.sessionId !== sessionId) {
                logger.warn(`Socket switched away from session ${sessionId} to ${socket.data.sessionId}. Aborting remaining pipeline.`);
                return;
            }

            // Step 2: Invoke LangGraph state machine (notes agent autonomously extracts frames using getFrames tool)
            const notesGenStart = Date.now();
            logger.info(
                `[Step 2/2] Invoking LangGraph notes pipeline for session: ${sessionId}, chunkIndex: ${transcriptChunk.chunkIndex}`
            );
            await graph.invoke({
                sessionId,
                videoTitle: transcriptChunk.videoTitle,
                videoUrl,
                chunkIndex: paresedChunk.chunkIndex,
                startTimestamp: startAt,
                endTimestamp: endAt,
                transcript,
            });
            const notesGenMs = Date.now() - notesGenStart;
            const totalChunkMs = sttMs + notesGenMs;

            logger.info(
                `[Chunk Pipeline Complete] Chunk ${paresedChunk.chunkIndex} fully processed in ${totalChunkMs}ms (STT: ${sttMs}ms, NotesGen: ${notesGenMs}ms)`
            );

        } catch (err) {
            logger.error("Error handling next chunk event:", err);
            socket.emit(events.ERROR.GENERAL, { success: false, message: "Error handling next chunk event" });
        } finally {
            socket.data.isProcessingChunk = false;
            if (socket.data.hasPendingNextChunkRequest && socket.data.sessionId === sessionId) {
                socket.data.hasPendingNextChunkRequest = false;
                logger.info(`Executing queued next_chunk request for session: ${socket.data.sessionId}`);
                processNextChunk();
            } else {
                socket.data.hasPendingNextChunkRequest = false;
            }
        }
    };

    socket.on(events.TRANSCRIPT.NEXT_CHUNK, processNextChunk);
}