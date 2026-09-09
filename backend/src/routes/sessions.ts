import { Router } from "express";
import { nanoid } from "nanoid";
import { rm } from "fs/promises";
import {
  CreateSessionPayloadSchema,
  SessionSchema,
  UpdateProgressPayloadSchema,
  UpdateStatusPayloadSchema,
  type SessionType,
} from "../schmas/session_schema.js";
import {
  getSessionCollection,
  getUserCollection,
  getNotesCollection,
  getTranscriptionCollection,
} from "../database/collections.js";
import { redis } from "../configs/redis.js";
import { logger } from "../utils/logger.js";
import { cleanYoutubeUrl } from "../utils/load_audio.js";

const router = Router();

// POST /api/sessions - Create or retrieve existing session
router.post("/", async (req, res) => {
  try {
    const parsedPayload = CreateSessionPayloadSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: " + parsedPayload.error.issues.map(i => i.message).join(", ")
      });
    }

    const { userId, videoTitle, videoUrl: rawUrl, duration } = parsedPayload.data;
    const videoUrl = cleanYoutubeUrl(rawUrl);
    const col = await getSessionCollection();

    // Check if an existing session for the user and video URL already exists
    const existingSession = await col.findOne({ userId, videoUrl });
    if (existingSession) {
      logger.info(`Found existing session: ${existingSession.sessionId} for user: ${userId}`);
      return res.status(200).json({
        success: true,
        sessionId: existingSession.sessionId,
        isNew: false,
        status: existingSession.status,
        session: {
          sessionId: existingSession.sessionId,
          userId: existingSession.userId,
          videoTitle: existingSession.videoTitle,
          videoUrl: existingSession.videoUrl,
          duration: existingSession.duration,
          status: existingSession.status,
          progress: existingSession.progress,
        }
      });
    }

    const sessionId = nanoid(16);
    const session: SessionType = {
      sessionId,
      userId,
      videoTitle,
      videoUrl,
      duration,
      status: "creating",
      progress: 0,
      createdAt: new Date(),
    };

    const parsed = SessionSchema.safeParse(session);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Session format invalid: " + parsed.error.issues.map(i => i.message).join(", ")
      });
    }

    await col.insertOne(parsed.data);

    // Sync session in Users collection
    try {
      const userCol = await getUserCollection();
      await userCol.updateOne(
        { userId },
        {
          $addToSet: { sessions: sessionId },
          $setOnInsert: { createdAt: new Date() },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      );
    } catch (userErr) {
      logger.error(`Failed to link session ${sessionId} to user ${userId}:`, userErr);
    }

    // Cache initial session state in Redis
    await redis.hset(`session:${sessionId}`, {
      status: "creating",
      progress: 0,
    });
    await redis.expire(`session:${sessionId}`, 86400);

    logger.info(`Session created via REST: ${sessionId} for video "${videoTitle}" (user: ${userId})`);
    return res.status(201).json({
      success: true,
      sessionId,
      isNew: true,
      status: "creating",
      session
    });
  } catch (error) {
    logger.error("Error in POST /api/sessions:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// GET /api/sessions/:sessionId - Retrieve session details, notes, and transcripts
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    const col = await getSessionCollection();
    const sessionDb = await col.findOne({ sessionId });
    if (!sessionDb) {
      await redis.del(`session:${sessionId}`);
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    // Synchronize Redis cache with MongoDB
    await redis.hset(`session:${sessionId}`, {
      status: sessionDb.status,
      progress: sessionDb.progress,
    });
    await redis.expire(`session:${sessionId}`, 86400);

    // Fetch existing notes topics
    const notesCol = await getNotesCollection();
    const notesDoc = await notesCol.findOne({ sessionId });
    const topics = notesDoc?.topics || [];

    // Extract all captured screenshots
    const frames: any[] = [];
    const frameKeySet = new Set<string>();
    topics.forEach((t: any) => {
      if (t.frames && Array.isArray(t.frames)) {
        t.frames.forEach((f: any) => {
          const k = `${f.timestamp}_${f.imageUrl}`;
          if (f.imageUrl && !frameKeySet.has(k)) {
            frameKeySet.add(k);
            frames.push(f);
          }
        });
      }
      (t.blocks || []).forEach((b: any) => {
        if (b.type === "image" && b.imageUrl) {
          const k = `${b.timestamp ?? 0}_${b.imageUrl}`;
          if (!frameKeySet.has(k)) {
            frameKeySet.add(k);
            frames.push({
              timestamp: b.timestamp ?? 0,
              imageUrl: b.imageUrl,
              caption: b.caption || `Screenshot at ${b.timestamp ?? 0}s`,
            });
          }
        }
      });
    });

    // Ensure topics served to client are text-only notes
    const cleanTopics = topics.map((t: any) => ({
      ...t,
      blocks: (t.blocks || []).filter((b: any) => b && b.type !== "image"),
    }));

    // Fetch existing transcripts
    const transCol = await getTranscriptionCollection();
    const transDoc = await transCol.findOne({ sessionId });
    const transcripts = transDoc?.transcripts || [];

    return res.status(200).json({
      success: true,
      sessionId: sessionDb.sessionId,
      userId: sessionDb.userId,
      videoTitle: sessionDb.videoTitle,
      videoUrl: sessionDb.videoUrl,
      duration: sessionDb.duration,
      status: sessionDb.status,
      progress: sessionDb.progress || 0,
      topics: cleanTopics,
      transcripts,
      frames,
      createdAt: sessionDb.createdAt
    });
  } catch (error) {
    logger.error("Error in GET /api/sessions/:sessionId:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// PATCH /api/sessions/:sessionId/progress - Update video playback progress
router.patch("/:sessionId/progress", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const parsedPayload = UpdateProgressPayloadSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid progress payload: " + parsedPayload.error.issues.map(i => i.message).join(", ")
      });
    }

    const { progress } = parsedPayload.data;

    await redis.hset(`session:${sessionId}`, {
      progress,
      lastActivity: new Date().toISOString(),
    });

    const col = await getSessionCollection();
    const result = await col.updateOne(
      { sessionId },
      { $set: { progress } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    return res.status(200).json({ success: true, message: "Progress updated successfully", progress });
  } catch (error) {
    logger.error("Error in PATCH /api/sessions/:sessionId/progress:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// PATCH /api/sessions/:sessionId/status - Update session status
router.patch("/:sessionId/status", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const parsedPayload = UpdateStatusPayloadSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status payload: " + parsedPayload.error.issues.map(i => i.message).join(", ")
      });
    }

    const { status } = parsedPayload.data;
    const col = await getSessionCollection();
    const existing = await col.findOne({ sessionId });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    // Do not overwrite session status if it has already ended
    if (existing.status === "ended" && status !== "ended") {
      logger.info(`Session ${sessionId} is already ended. Ignoring request to update status to "${status}".`);
      return res.status(200).json({ success: true, message: "Session is already ended", status: "ended" });
    }

    await redis.hset(`session:${sessionId}`, {
      status,
      lastActivity: new Date().toISOString(),
    });

    await col.updateOne(
      { sessionId },
      { $set: { status } }
    );

    logger.info(`Session ${sessionId} status updated to "${status}" via REST`);
    return res.status(200).json({ success: true, message: "Status updated successfully", status });
  } catch (error) {
    logger.error("Error in PATCH /api/sessions/:sessionId/status:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// POST /api/sessions/:sessionId/leave - Mark session as paused
router.post("/:sessionId/leave", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const col = await getSessionCollection();
    const existing = await col.findOne({ sessionId });

    if (existing && existing.status === "ended") {
      logger.info(`Session ${sessionId} is already ended. Ignoring leave request.`);
      return res.status(200).json({ success: true, message: `Session ${sessionId} is ended` });
    }

    await redis.hset(`session:${sessionId}`, {
      status: "paused",
      lastActivity: new Date().toISOString(),
    });

    if (existing) {
      await col.updateOne(
        { sessionId },
        { $set: { status: "paused" } }
      );
    }

    logger.info(`Session ${sessionId} marked as paused via REST`);
    return res.status(200).json({ success: true, message: `Left session ${sessionId}` });
  } catch (error) {
    logger.error("Error in POST /api/sessions/:sessionId/leave:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// POST /api/sessions/:sessionId/end - End session & clean up queues and cache
router.post("/:sessionId/end", async (req, res) => {
  try {
    const { sessionId } = req.params;

    await redis.hset(`session:${sessionId}`, {
      status: "ended",
      progress: 100,
      lastActivity: new Date().toISOString(),
    });

    await redis.del(`audio_queue:${sessionId}`);

    try {
      await rm(`cache/${sessionId}`, { recursive: true, force: true });
    } catch (err) {
      logger.error(`Failed to clean up cache for session ${sessionId}:`, err);
    }

    const col = await getSessionCollection();
    await col.updateOne(
      { sessionId },
      { $set: { status: "ended", progress: 100 } }
    );

    logger.info(`Session ${sessionId} ended and progress set to 100% via REST`);
    return res.status(200).json({ success: true, message: `Ended session ${sessionId}` });
  } catch (error) {
    logger.error("Error in POST /api/sessions/:sessionId/end:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

export default router;
