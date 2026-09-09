import { Router } from "express";
import { getUserCollection, getSessionCollection } from "../database/collections.js";
import { logger } from "../utils/logger.js";
import z from "zod";

const router = Router();

const syncUserSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  email: z.string().email("Invalid email format"),
});

// POST /api/users/sync - Upsert user profile
router.post("/sync", async (req, res) => {
  try {
    const parsed = syncUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: " + parsed.error.issues.map(i => i.message).join(", ")
      });
    }

    const { userId, email } = parsed.data;
    const col = await getUserCollection();

    await col.updateOne(
      { userId },
      {
        $set: {
          email,
          updatedAt: new Date()
        },
        $setOnInsert: {
          sessions: [],
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    logger.info(`User successfully synced via REST API: ${userId} (${email})`);
    return res.status(200).json({ success: true, message: "User synced successfully" });
  } catch (error) {
    logger.error("Error in POST /api/users/sync:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// GET /api/users/:userId/sessions - Get all sessions for a user
router.get("/:userId/sessions", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId parameter is required" });
    }

    const sessionCol = await getSessionCollection();
    const sessions = await sessionCol
      .find({ userId })
      .sort({ createdAt: -1 })
      .project({ _id: 0 })
      .toArray();

    return res.status(200).json({
      success: true,
      sessions
    });
  } catch (error) {
    logger.error("Error in GET /api/users/:userId/sessions:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

export default router;
