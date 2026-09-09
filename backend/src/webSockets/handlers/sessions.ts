import type { Socket } from "socket.io";
import { JoinSessionPayloadSchema, type JoinSessionPayload, type SessionResponse } from "../../schmas/session_schema.js";
import { Events } from "../../utils/events.js";
import { getSessionCollection } from "../../database/collections.js";
import { logger } from "../../utils/logger.js";

/**
 * Handles socket joining a specific session room to receive real-time video chunking and notes events.
 */
export function SessionJoinHandler(socket: Socket) {
  const events = Events;
  socket.on(
    events.SESSION.JOIN,
    async (
      sessionData: JoinSessionPayload,
      callback?: (response: SessionResponse) => void,
    ) => {
      try {
        const parsedPayload = JoinSessionPayloadSchema.safeParse(sessionData);
        if (!parsedPayload.success) {
          logger.warn("Join session schema validation failed for socket %s: %O", socket.id, parsedPayload.error);
          if (callback) callback({ success: false, message: "Invalid session data" });
          return;
        }

        const { sessionId } = parsedPayload.data;
        const col = await getSessionCollection();
        const sessionDb = await col.findOne({ sessionId });
        if (!sessionDb) {
          logger.warn("Join session socket room failed: session %s does not exist", sessionId);
          if (callback) callback({ success: false, message: "Session does not exist" });
          return;
        }

        const prevSessionId = socket.data.sessionId;
        if (prevSessionId && prevSessionId !== sessionId) {
          socket.leave(prevSessionId);
          logger.info(`Socket ${socket.id} left previous room ${prevSessionId}`);
        }

        await socket.join(sessionId);
        socket.data.sessionId = sessionId;
        socket.data.isProcessingChunk = false;
        socket.data.hasPendingNextChunkRequest = false;

        logger.info(`Socket ${socket.id} joined live room for session ${sessionId}`);
        if (callback) {
          callback({
            success: true,
            message: `Joined live room for session ${sessionId}`,
            sessionId,
          });
        }
      } catch (error) {
        logger.error("Error in SessionJoinHandler:", error);
        if (callback) {
          callback({
            success: false,
            message: error instanceof Error ? error.message : "Unknown error joining room",
          });
        }
      }
    },
  );
}

/**
 * Handles socket leaving a session room when switching or pausing sessions.
 */
export function SessionLeaveHandler(socket: Socket) {
  const events = Events;
  socket.on(events.SESSION.LEAVE, async (payload?: { sessionId?: string }) => {
    const targetSessionId = payload?.sessionId || socket.data.sessionId;
    if (targetSessionId) {
      socket.leave(targetSessionId);
      logger.info(`Socket ${socket.id} explicitly left room ${targetSessionId}`);
    }
    if (socket.data.sessionId === targetSessionId) {
      socket.data.sessionId = null;
      socket.data.isProcessingChunk = false;
      socket.data.hasPendingNextChunkRequest = false;
    }
  });
}
