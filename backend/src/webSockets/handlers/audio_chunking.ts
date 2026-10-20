import { readdir } from "fs/promises";
import {
  downloadStartedPayloadSchema,
  type DownloadStartedPayload,
} from "../../schmas/transcript_chunk.js";
import { audioChunker } from "../../utils/audio_chunk.js";
import { env } from "../../utils/env.js";
import { Events } from "../../utils/events.js";
import { getIO } from "../server.js";
import { populateAudioQueue } from "../../utils/redis_cache.js";
import { logger } from "../../utils/logger.js";
import { getSessionCollection } from "../../database/collections.js";

export function downloadAndChunkingHandler(socket: any) {
  const io = getIO();
  const events = Events;
  socket.on(
    events.AUDIO.DOWNLOAD_STARTED,
    async (data: DownloadStartedPayload) => {
      let sessionId = socket.data.sessionId;
      try {
        const parsedData = downloadStartedPayloadSchema.safeParse(data);
        if (!parsedData.success) {
          throw new Error(`Invalid data for download started event: ${parsedData.error.message}`);
        }

        const { videoUrl, userId, sessionId: payloadSessionId } = parsedData.data;

        if (payloadSessionId) {
          sessionId = payloadSessionId;
          socket.data.sessionId = sessionId;
          await socket.join(sessionId);
        }

        if (!sessionId) {
          const col = await getSessionCollection();
          if (col) {
            const sessionDb = await col.findOne({ userId, videoUrl });
            if (sessionDb) {
              sessionId = sessionDb.sessionId;
              socket.data.sessionId = sessionId;
              await socket.join(sessionId);
              logger.info(`Recovered missing sessionId ${sessionId} for socket: ${socket.id}`);
            }
          }
        }

        if (!sessionId) {
          throw new Error(`Session ID not found for socket: ${socket.id}`);
        }


        logger.info(`Download started for video: ${videoUrl}, user: ${userId}, session: ${sessionId}`);

        io?.to(sessionId)?.emit(events.AUDIO.DOWNLOAD_STARTED, {
          success: true,
          message: `Download started for video: ${videoUrl}`,
          videoUrl,
          userId,
          sessionId,
        });
        await audioChunker(videoUrl, env.CHUNK_SIZE, sessionId);

        const files = (await readdir(`./cache/${sessionId}`))
          .filter((file) => file.endsWith(".wav"))
          .sort((a, b) => {
            const numA = parseInt(a.replace(/\.wav$/i, ""), 10);
            const numB = parseInt(b.replace(/\.wav$/i, ""), 10);
            return numA - numB;
          });

        const chunkItems = files.map((file) => {
          const chunkIndex = parseInt(file.replace(/\.wav$/i, ""), 10);
          return {
            chunkIndex,
            path: `./cache/${sessionId}/${file}`,
          };
        });

        await populateAudioQueue(sessionId, chunkItems);

        logger.info(`Audio chunking completed for session ${sessionId} (${files.length} chunks)`);
        io?.to(sessionId)?.emit(events.AUDIO.CHUNKING_COMPLETED, {
          success: true,
          message: `Audio chunking completed for video: ${videoUrl}`,
          videoUrl,
          userId,
          sessionId,
        });
      } catch (err) {
        logger.error("Error in downloadStartedHandler:", err);
        if (sessionId) {
          io?.to(sessionId)?.emit(events.AUDIO.DOWNLOAD_STARTED, {
            success: false,
            message: `Error processing download started event: ${err instanceof Error ? err.message : String(err)}`,
            sessionId,
          });
        }
      }
    },
  );
}


