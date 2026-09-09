import { Router } from "express";
import z from "zod";
import { search } from "../agents/utils/search.js";
import { logger } from "../utils/logger.js";

const router = Router();

const searchPayloadSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  query: z.string().min(1, "query is required").max(1000, "query is too long"),
});

// POST /api/search - Perform RAG search across session lecture notes
router.post("/", async (req, res) => {
  try {
    const parsed = searchPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: " + parsed.error.issues.map(i => i.message).join(", ")
      });
    }

    const { sessionId, userId, query } = parsed.data;
    logger.info(`REST Search: Invoking RAG pipeline for session: ${sessionId || 'all'}, userId: ${userId || 'anon'}, query: "${query}"`);

    const searchAnswer = await search(sessionId, query, userId);

    logger.info(`REST Search: Completed answer for query: "${query}" with ${searchAnswer.citations.length} citations`);
    return res.status(200).json({
      success: true,
      answer: searchAnswer.answer,
      citations: searchAnswer.citations,
      score: searchAnswer.score,
      query: searchAnswer.query
    });
  } catch (error) {
    logger.error("Error in POST /api/search:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error during search"
    });
  }
});

export default router;
