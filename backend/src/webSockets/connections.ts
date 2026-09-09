import { getSessionCollection } from "../database/collections.js";
import { Events } from "../utils/events.js";
import { getIO } from "./server.js";
import { logger } from "../utils/logger.js";
import { redis } from "../configs/redis.js";
import { SessionJoinHandler, SessionLeaveHandler } from "./handlers/sessions.js";
import { downloadAndChunkingHandler } from "./handlers/audio_chunking.js";
import { transcriptHandler } from "./handlers/transcription.js";

export function registerSocketHandlers() {
    const io = getIO();

    io.on('connection', (socket) => {
        logger.info(`WebSocket connected with socket ID: ${socket.id}`);

        // Global error wrapper for all socket event listeners
        const originalOn = socket.on;
        (socket as any).on = function (event: string, listener: (...args: any[]) => void) {
            return originalOn.call(this, event, async (...args: any[]) => {
                const expectedParamsCount = listener.length;
                if (expectedParamsCount > 1) {
                    const actualParamsCount = args.length;
                    if (actualParamsCount < expectedParamsCount) {
                        while (args.length < expectedParamsCount - 1) {
                            args.push(undefined);
                        }
                        args.push(() => {});
                    } else if (typeof args[expectedParamsCount - 1] !== 'function') {
                        args[expectedParamsCount - 1] = () => {};
                    }
                }
                try {
                    await listener(...args);
                } catch (error) {
                    logger.error(`Unhandled error in socket event "${event}" on socket ${socket.id}:`, error);
                    socket.emit(Events.ERROR.GENERAL, {
                        success: false,
                        message: error instanceof Error ? error.message : "Internal Server Error",
                    });
                }
            });
        };

        // Real-time live session video & transcription event handlers only
        SessionJoinHandler(socket);
        SessionLeaveHandler(socket);
        downloadAndChunkingHandler(socket);
        transcriptHandler(socket);

        // Disconnect handler
        socket.on('disconnect', async () => {
            const sessionId = socket.data.sessionId;
            if (sessionId) {
                logger.info(`Socket ${socket.id} disconnected. Pausing session ${sessionId}`);
                await redis.hset(`session:${sessionId}`, {
                    status: "paused",
                    lastActivity: new Date().toISOString(),
                });
                const col = await getSessionCollection();
                if (col) {
                    await col.updateOne(
                        { sessionId: sessionId },
                        { $set: { status: "paused" } }
                    );
                }
            }
        });
    });
}