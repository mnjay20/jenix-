import { getNotesCollection, getTranscriptionCollection } from "../database/collections.js";
import type { LectureNotesType } from "../schmas/notes_schema.js";
import type { SessionTranscriptionType, TranscriptChunkItem } from "../schmas/transcript_chunk.js";
import { Events } from "../utils/events.js";
import { getIO } from "../webSockets/server.js";
import type { State } from "./graph.js";
import { logger } from "../utils/logger.js";
import { uploadFrameToCloudinary } from "../utils/cloudinary.js";

export const sendAndsaveNode = async (state: State) => {
    if (!state.notes) {
        return;
    }
    try {
        logger.info(`Sending notes and transcript chunk to client and saving in DB for session: ${state.sessionId}, chunkIndex: ${state.chunkIndex}`);
        const events = Events.NOTES;
        const transcriptItem: TranscriptChunkItem = {
            chunkIndex: state.chunkIndex,
            startAt: state.startTimestamp,
            endAt: state.endTimestamp,
            text: state.transcript || '',
        };

        const io = getIO();
        const formattedFrames = await Promise.all(
            (state.frames || []).map(async (f) => {
                let url = f.imageUrl;
                if (!url || url.startsWith("data:")) {
                    if (f.base64) {
                        const publicId = state.sessionId ? `${state.sessionId}_frame_${f.timestamp}s` : `frame_${f.timestamp}s`;
                        url = await uploadFrameToCloudinary(f.base64, publicId);
                    } else {
                        url = url || "";
                    }
                }
                return {
                    timestamp: f.timestamp,
                    imageUrl: url,
                    caption: f.caption || `Screenshot at ${f.timestamp}s`,
                    chunkIndex: state.chunkIndex,
                };
            })
        );

        if (io?.to) {
            io.to(state.sessionId).emit(events.CHUNK_READY, {
                sessionId: state.sessionId,
                topics: state.notes.topics,
                startAt: state.startTimestamp,
                endAt: state.endTimestamp,
                transcript: transcriptItem,
                frames: formattedFrames,
            });
        } else {
            logger.warn(`Socket.IO (io) not initialized. Skipping CHUNK_READY event for session: ${state.sessionId}`);
        }
        
        // 1. Save notes to database
        const col = await getNotesCollection();
        const notesData = await col.findOne({ sessionId: state.sessionId });
        if(!notesData){
            await col.insertOne({
                sessionId: state.sessionId,
                videoTitle: state.videoTitle,
                topics: state.notes.topics,
                updatedAt: new Date(),
                createdAt: new Date(),
            } as LectureNotesType);
            logger.info(`Created new notes document in database for session: ${state.sessionId}`);
        } else if (state.notes.topics.length > 0) {
            await col.updateOne(
                { sessionId: state.sessionId },
                { 
                    $push: { topics: { $each: state.notes.topics } as any },
                    $set: { updatedAt: new Date() }
                }
            );
            logger.info(`Appended notes chunk to existing document for session: ${state.sessionId}`);
        }


        // 2. Save transcription to database
        const transcriptionCol = await getTranscriptionCollection();
        const transDoc = await transcriptionCol.findOne({ sessionId: state.sessionId });
        if (!transDoc) {
            await transcriptionCol.insertOne({
                sessionId: state.sessionId,
                videoTitle: state.videoTitle,
                transcripts: [transcriptItem],
                updatedAt: new Date(),
                createdAt: new Date(),
            } as SessionTranscriptionType);
            logger.info(`Created new transcription document in database for session: ${state.sessionId}`);
        } else {
            await transcriptionCol.updateOne(
                { sessionId: state.sessionId },
                {
                    $push: { transcripts: transcriptItem as any },
                    $set: { updatedAt: new Date() }
                }
            );
            logger.info(`Appended transcription chunk to existing document for session: ${state.sessionId}`);
        }

        return {}
    } catch (error) {
        logger.error("Error in sendAndsaveNode:", error);
        throw new Error(
          `Error in sendAndsaveNode: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}