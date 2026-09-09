import { stuctModelProvider } from "../configs/gemini.js";
import { summaryAgentPrompt } from "./prompts/prompts.js";
import type { State } from "./graph.js";
import { redis } from "../configs/redis.js";
import { logger } from "../utils/logger.js";

const summaryModel = stuctModelProvider("google");

export const summaryAgentNode = async (state: State) => {
    try {
        logger.info(`Invoking summary LLM for session: ${state.sessionId}`);
        
        const response = await summaryModel.invoke([
            {
                role: "system",
                content: summaryAgentPrompt,
            },
            {
                role: "user",
                content: `Previous Rolling Summary:\n${state.rollingSummary || "None"}\n\nNew Notes Segment:\n${JSON.stringify(state.notes, null, 2)}`,
            },
        ]);

        logger.info(`Summary LLM call completed for session: ${state.sessionId}`);
        const contentStr = typeof response.content === "string" 
            ? response.content 
            : (Array.isArray(response.content) ? response.content.map((c: any) => c.text || "").join("\n") : String(response.content || ""));
        
        const updatedSummary = contentStr.trim() || state.rollingSummary || "";

        if (updatedSummary) {
            await redis.hset(`context:${state.sessionId}`, "summary", updatedSummary);
        }

        return {
            rollingSummary: updatedSummary,
        };
    } catch (error) {
        logger.error("Error in summaryAgentNode:", error);
        return {
            rollingSummary: state.rollingSummary || "",
        };
    }
};