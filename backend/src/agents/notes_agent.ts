import { NotesModelProvider, stuctModelProvider } from "../configs/gemini.js";
import { NotesSchema, type NotesSchemaType } from "../schmas/notes_schema.js";
import type { State } from "./graph.js";
import { getIO } from "../webSockets/server.js";
import { Events } from "../utils/events.js";
import { logger } from "../utils/logger.js";
import { getFramesTool } from "../tools/frame.js";
import { uploadFrameToCloudinary } from "../utils/cloudinary.js";
import { frameSelectionPrompt, structureNotesPrompt } from "./prompts/prompts.js";
import { type ExtractedFrame } from "../utils/frame_extractor.js";

const toolCallingModel = stuctModelProvider("google").bindTools([getFramesTool]);
const notesModel = NotesModelProvider("google");

async function getBase64DataUrl(frame: any): Promise<string | null> {
  if (frame.base64) {
    return frame.base64.startsWith("data:") ? frame.base64 : `data:image/jpeg;base64,${frame.base64}`;
  }
  if (frame.imageUrl) {
    if (frame.imageUrl.startsWith("data:")) return frame.imageUrl;
    try {
      const res = await fetch(frame.imageUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const b64 = Buffer.from(buffer).toString("base64");
        const contentType = res.headers.get("content-type") || "image/jpeg";
        return `data:${contentType};base64,${b64}`;
      }
    } catch (e) {
      logger.warn(`Could not fetch image URL ${frame.imageUrl} for base64 conversion`, e);
    }
  }
  return null;
}

export const notesAgentNode = async (state: State) => {
  try {
    const io = getIO();
    if (io?.to) {
      io.to(state.sessionId).emit(Events.NOTES.PROCESSING_STARTED);
    }

    logger.info(
      `[NotesAgentNode] Starting pipeline for session: ${state.sessionId}, chunkIndex: ${state.chunkIndex} [${state.startTimestamp}s - ${state.endTimestamp}s]`
    );

    // --- Step 1: Tool-Calling Agent Pass for Frame Selection ---
    let fetchedFrames: ExtractedFrame[] = state.frames || [];

    if (state.videoUrl) {
      try {
        const selectionPromptText = `LECTURE SEGMENT INFO:
- Video Title: ${state.videoTitle || 'Lecture Video'}
- Timeframe: ${state.startTimestamp}s - ${state.endTimestamp}s (Chunk #${state.chunkIndex})
- Video URL: ${state.videoUrl}

=== TRANSCRIPT ===
"""
${state.transcript}
"""

INSTRUCTIONS:
Determine which exact timestamps (in seconds) between ${state.startTimestamp}s and ${state.endTimestamp}s require visual video frame snapshots. Call the 'getFrames' tool ONCE with an array of selected timestamps (maximum 6 timestamps).`;

        const toolResponse = await toolCallingModel.invoke([
          { role: "system", content: frameSelectionPrompt },
          { role: "user", content: selectionPromptText },
        ]);

        const toolCalls = toolResponse.tool_calls || [];
        const frameCall = toolCalls.find((tc: any) => tc.name === "getFrames");

        if (frameCall && frameCall.args) {
          const rawTimestamps = frameCall.args.timestamps || [];
          const validTimestamps = (Array.isArray(rawTimestamps) ? rawTimestamps : [])
            .map((t: any) => Number(t))
            .filter((t: number) => !isNaN(t) && t >= state.startTimestamp && t <= state.endTimestamp)
            .slice(0, 6);

          if (validTimestamps.length > 0) {
            logger.info(`[NotesAgentNode] Tool 'getFrames' invoked for ${validTimestamps.length} timestamp(s): [${validTimestamps.join(", ")}s]`);
            const toolResultStr = await getFramesTool.invoke({
              timestamps: validTimestamps,
              videoUrl: state.videoUrl,
              sessionId: state.sessionId,
            });
            const extracted = JSON.parse(toolResultStr || "[]") as ExtractedFrame[];
            if (extracted && extracted.length > 0) {
              fetchedFrames = extracted;
              logger.info(`[NotesAgentNode] Tool 'getFrames' returned ${fetchedFrames.length} visual snapshot(s)`);
            }
          }
        }
      } catch (toolErr: any) {
        logger.warn(`[NotesAgentNode] Frame tool selection failed (${toolErr.message}). Continuing with existing frames.`);
      }
    }

    // --- Step 2: Direct Structured JSON Notes Generation Pass (Explicit System Prompt Schema) ---
    const frameInfoText = fetchedFrames.length > 0
      ? `\nAttached are ${fetchedFrames.length} video frame snapshot(s) captured at timestamps: ${fetchedFrames.map((f) => `${f.timestamp}s`).join(", ")}.`
      : "";

    const userTextPrompt = `### LECTURE SEGMENT INFORMATION
- Video Title: ${state.videoTitle || 'Lecture Video'}
- Timeframe: ${state.startTimestamp}s - ${state.endTimestamp}s (Chunk #${state.chunkIndex})
- Video URL: ${state.videoUrl || ''}
- Session ID: ${state.sessionId}
${state.previousTranscript ? `\n=== PREVIOUS TRANSCRIPT (FOR CONTINUITY & CONTEXT) ===\n"""\n${state.previousTranscript}\n"""\n` : ''}
${state.rollingSummary ? `\n=== PREVIOUS ROLLING SUMMARY ===\n${state.rollingSummary}\n` : ''}
=== CURRENT TRANSCRIPT (SEGMENT TO NOTE) ===
"""
${state.transcript}
"""
${frameInfoText}

INSTRUCTIONS:
Generate comprehensive, textbook-quality study notes in structured JSON format matching the schema instructions in the system prompt. Return ONLY the valid JSON object.`;

    const messageContent: any[] = [
      {
        type: "text",
        text: userTextPrompt,
      },
    ];

    for (const frame of fetchedFrames) {
      const dataUrl = await getBase64DataUrl(frame);
      if (dataUrl) {
        messageContent.push({
          type: "text",
          text: `Frame snapshot at ${frame.timestamp}s:`,
        });
        messageContent.push({
          type: "image_url",
          image_url: {
            url: dataUrl,
          },
        });
      }
    }

    const notesStart = Date.now();
    logger.info(`[NotesGen] Generating direct structured JSON study notes for session: ${state.sessionId}`);

    const llmResponse = await notesModel.invoke([
      {
        role: "system",
        content: structureNotesPrompt,
      },
      {
        role: "user",
        content: messageContent,
      },
    ]);

    const rawText = typeof llmResponse.content === "string"
      ? llmResponse.content
      : (Array.isArray(llmResponse.content) ? llmResponse.content.map((c: any) => c.text || "").join("\n") : String(llmResponse.content || ""));

    // Extract JSON string (handling any ```json ... ``` code fence)
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
    const jsonStr = (jsonMatch[1] || rawText).trim();

    let structuredNotes: NotesSchemaType;
    try {
      structuredNotes = safeJsonParse<NotesSchemaType>(jsonStr);
    } catch (parseErr: any) {
      logger.warn(`[NotesGen] JSON.parse failed (${parseErr.message}). Fallback to default block.`);
      structuredNotes = {
        topics: [
          {
            title: state.videoTitle || "Lecture Notes",
            blocks: [
              {
                type: "paragraph",
                content: rawText,
              },
            ],
          },
        ],
      };
    }

    logger.info(`[NotesGen] Notes generation finished in ${Date.now() - notesStart}ms for session: ${state.sessionId}`);

    const sanitizedNotes = await sanitizeNotes(structuredNotes, fetchedFrames, state.sessionId);

    return {
      notes: sanitizedNotes,
      frames: fetchedFrames,
    };
  } catch (error) {
    logger.error("Error in notesAgentNode:", error);
    throw new Error(
      `Error in notesAgentNode: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Sanitizes structured notes: formats general blocks, cleans lists, uploads base64 frames to Cloudinary,
 * and filters out repetitive word loops or junk blocks.
 */
async function sanitizeNotes(
  notes: NotesSchemaType,
  frames: any[] = [],
  sessionId?: string
): Promise<NotesSchemaType> {
  if (!notes || !notes.topics) return notes;

  const formattedFrames = await Promise.all(
    frames.map(async (f) => {
      let url = f.imageUrl;
      if (!url || url.startsWith("data:")) {
        if (f.base64) {
          const publicId = sessionId ? `${sessionId}_frame_${f.timestamp}s` : `frame_${f.timestamp}s`;
          url = await uploadFrameToCloudinary(f.base64, publicId);
        } else {
          url = url || "";
        }
      }
      return {
        timestamp: f.timestamp,
        imageUrl: url,
        caption: f.caption || `Screenshot at ${f.timestamp}s`,
      };
    })
  );

  const sanitizedTopics = notes.topics.map((topic) => {
    const sanitizedBlocks = (topic.blocks || []).map((block: any) => {
      const b = { ...block };

      if (["code", "diagram", "table", "formula", "example", "quote", "callout"].includes(b.type)) {
        b.type = "general";
      }

      if (b.type === "general" && (!b.content || b.content.trim() === "")) {
        b.content = b.title || (Array.isArray(b.items) ? b.items.join("\n") : "");
      }

      if (b.type === "list") {
        if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
          const fallbackText = b.content || b.title || "";
          if (fallbackText) b.items = [fallbackText];
        }
        if (!b.style) b.style = "bullet";
      }

      if (b.type === "heading" && (!b.content || b.content.trim() === "")) {
        b.content = b.title || "Section";
      }

      if (b.type === "paragraph" && (!b.content || b.content.trim() === "")) {
        b.content = b.title || (Array.isArray(b.items) ? b.items.join("\n") : "");
      }

      if (b.type === "image") return null;

      // Detect and strip repetitive keyword loops
      if (typeof b.content === "string" && isRepetitiveWordLoop(b.content)) {
        logger.warn(`[NotesAgentNode] Filtered out block with repetitive word loop: "${b.content.substring(0, 60)}..."`);
        return null;
      }

      return b;
    }).filter((b: any) => {
      if (!b) return false;
      if (b.type === "list") return b.items && b.items.length > 0;
      return typeof b.content === "string" && b.content.trim().length > 0;
    });

    return {
      ...topic,
      blocks: sanitizedBlocks,
      frames: formattedFrames,
    };
  }).filter((t) => t.blocks && t.blocks.length > 0);

  return {
    ...notes,
    topics: sanitizedTopics,
  };
}

/**
 * Detects repetitive word loops and low-entropy filler paragraphs.
 */
function isRepetitiveWordLoop(text: string): boolean {
  if (!text || text.length < 50) return false;
  // Ignore Markdown tables and code blocks
  if (text.includes("|") && (text.includes("---") || text.includes("|"))) return false;
  if (text.startsWith("```") || text.includes("```")) return false;

  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  if (words.length < 15) return false;

  const uniqueWords = new Set(words);
  const ratio = uniqueWords.size / words.length;
  if (ratio < 0.20) return true;

  const trigrams: Record<string, number> = {};
  for (let i = 0; i < words.length - 2; i++) {
    const tri = `${words[i]} ${words[i+1]} ${words[i+2]}`;
    trigrams[tri] = (trigrams[tri] || 0) + 1;
    if (trigrams[tri]! > 3) return true;
  }

  return false;
}

/**
 * Robust JSON parser that handles raw unescaped control characters (newlines, tabs) inside string literals
 * and automatically repairs truncated JSON outputs.
 */
function safeJsonParse<T>(rawStr: string): T {
  let cleaned = rawStr.trim();
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // Step 1: Sanitize unescaped control characters inside quoted string literals
    const sanitized = sanitizeControlCharsInQuotes(cleaned);
    try {
      return JSON.parse(sanitized) as T;
    } catch (e2) {
      // Step 2: Auto-close truncated JSON (unclosed quotes, dangling commas, open brackets)
      const repaired = autoCloseTruncatedJson(sanitized);
      return JSON.parse(repaired) as T;
    }
  }
}

function sanitizeControlCharsInQuotes(str: string): string {
  let inString = false;
  let escaped = false;
  let result = "";

  for (const char of str) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      if (char === "\n") result += "\\n";
      else if (char === "\r") result += "\\r";
      else if (char === "\t") result += "\\t";
      else if (char.charCodeAt(0) < 32) result += "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
      else result += char;
    } else {
      result += char;
    }
  }
  return result;
}

function autoCloseTruncatedJson(str: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of str) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}" || char === "]") {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          if ((char === "}" && top === "{") || (char === "]" && top === "[")) {
            stack.pop();
          }
        }
      }
    }
  }

  let repaired = str.trim();

  if (inString) {
    repaired += '"';
  }

  repaired = repaired.replace(/,\s*$/, "");
  repaired = repaired.replace(/("[^"]+"\s*:\s*)$/, '$1""');

  while (stack.length > 0) {
    const open = stack.pop();
    repaired = repaired.replace(/,\s*$/, "");
    repaired += open === "{" ? "}" : "]";
  }

  return repaired;
}
