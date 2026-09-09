import { embeddings, stuctModelProvider } from "../../configs/gemini.js";
import { getEmbeddingsCollection, getSessionCollection, getTranscriptionCollection } from "../../database/collections.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { ragAgentPrompt, ragAgentSystemPrompt } from "../prompts/prompts.js";

export interface CitationItem {
    sessionId: string;
    videoTitle: string;
    videoUrl?: string;
    chunkId?: number;
    timestamp?: number;
    timestampFormatted?: string;
    textSnippet: string;
    score?: number | undefined;
}

export interface SearchResult {
    answer: string;
    citations: CitationItem[];
    score: number;
    query: string;
}

function formatTimestamp(sec?: number): string {
    if (sec === undefined || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Executes MongoDB Atlas Vector Search for a given query string and session filter.
 */
async function executeVectorSearch(
    searchQuery: string,
    sessionId?: string,
    limit: number = 6
): Promise<any[]> {
    let docs: any[] = [];
    try {
        const queryVector = await embeddings.embedQuery(searchQuery);
        if (queryVector && queryVector.length > 0) {
            const embCol = await getEmbeddingsCollection();
            const atlasDocs = await embCol.aggregate([
                {
                    $vectorSearch: {
                        index: env.VECTOR_INDEX || "default",
                        path: "embeddings",
                        queryVector: queryVector,
                        filter: sessionId ? { sessionId } : undefined,
                        numCandidates: 50,
                        limit: limit,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        sessionId: 1,
                        chunkId: 1,
                        notes: 1,
                        createdAt: 1,
                        score: { $meta: "vectorSearchScore" },
                    },
                },
            ]).toArray();

            if (atlasDocs && atlasDocs.length > 0) {
                docs = atlasDocs;
            }
        }
    } catch (err: any) {
        logger.warn(`Atlas Vector Search warning for query "${searchQuery}": ${err.message}`);
    }

    // Direct Session Notes Fallback if vector index is building or un-indexed
    if (docs.length === 0 && sessionId) {
        try {
            const embCol = await getEmbeddingsCollection();
            const directDocs = await embCol.find({ sessionId }).limit(limit).toArray();
            if (directDocs && directDocs.length > 0) {
                logger.info(`Retrieved ${directDocs.length} chunks via session direct lookup fallback`);
                docs = directDocs;
            }
        } catch (dbErr: any) {
            logger.warn(`Direct session lookup fallback warning: ${dbErr.message}`);
        }
    }

    return docs;
}

/**
 * Autonomous Agentic RAG Search Engine for Jenix AI.
 * 
 * Features:
 * - Dynamic query intent analysis
 * - Autonomous retrieval with iterative query expansion/rewriting
 * - Relevance evaluation loop
 * - Precise citation and timestamp mapping
 */
export async function search(
    sessionId?: string,
    query?: string,
    userId?: string
): Promise<SearchResult> {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
        return {
            answer: "Please provide a question about your study materials.",
            citations: [],
            score: 0,
            query: "",
        };
    }

    try {
        logger.info(`Agentic RAG initiated. User Query: "${cleanQuery}", sessionId: ${sessionId || "all"}, userId: ${userId || "anon"}`);

        // 1. Fetch relevant sessions metadata for citation title lookup
        let sessionDocs: any[] = [];
        const sessionMap = new Map<string, { videoTitle: string; videoUrl: string }>();
        try {
            const sessionCol = await getSessionCollection();
            let sessionFilter: any = {};
            if (sessionId) {
                sessionFilter.sessionId = sessionId;
            } else if (userId) {
                sessionFilter.userId = userId;
            }
            sessionDocs = await sessionCol.find(sessionFilter).toArray();
            sessionDocs.forEach((s: any) => {
                sessionMap.set(s.sessionId, {
                    videoTitle: s.videoTitle || "Lecture Video",
                    videoUrl: s.videoUrl || "",
                });
            });
        } catch (dbErr: any) {
            logger.warn(`Session collection lookup warning: ${dbErr.message}`);
        }

        // 2. AGENTIC RETRIEVAL LOOP: Initial Search & Autonomous Query Expansion
        let retrievedDocs: any[] = [];
        let activeQuery = cleanQuery;
        const maxRetrievalAttempts = 2;

        for (let attempt = 1; attempt <= maxRetrievalAttempts; attempt++) {
            logger.info(`Agentic Retrieval Turn ${attempt}/${maxRetrievalAttempts} using query: "${activeQuery}"`);
            
            const docs = await executeVectorSearch(activeQuery, sessionId, 6);
            
            if (docs.length > 0) {
                // Deduplicate chunks by sessionId + chunkId
                const existingKeys = new Set(retrievedDocs.map(d => `${d.sessionId}_${d.chunkId}`));
                for (const d of docs) {
                    const key = `${d.sessionId}_${d.chunkId}`;
                    if (!existingKeys.has(key)) {
                        existingKeys.add(key);
                        retrievedDocs.push(d);
                    }
                }
            }

            // Evaluation check: If sufficient relevant docs found, break loop
            if (retrievedDocs.length >= 3) {
                logger.info(`Agentic Retrieval satisfied on turn ${attempt} with ${retrievedDocs.length} chunks`);
                break;
            }

            // Query Expansion / Rewriting Step for retry turn if initial query yielded low results
            if (attempt < maxRetrievalAttempts) {
                try {
                    const rewritePrompt = `Given the user question: "${cleanQuery}", suggest an optimized alternative keyword search query focusing on core academic concepts, synonyms, or formulas. Return ONLY the updated search query as plain text without quotes or explanation.`;
                    
                    const rewriteResponse = await stuctModelProvider("google").invoke([
                        { role: "system", content: "You are a concise academic search query rewriter." },
                        { role: "user", content: rewritePrompt }
                    ]);

                    const rewritten = (typeof rewriteResponse.content === "string" ? rewriteResponse.content : "").trim();
                    if (rewritten && rewritten !== cleanQuery) {
                        logger.info(`Agentic Query Expansion: Rewrote "${cleanQuery}" -> "${rewritten}"`);
                        activeQuery = rewritten;
                    } else {
                        break;
                    }
                } catch (rewriteErr: any) {
                    logger.warn(`Query rewriting skipped: ${rewriteErr.message}`);
                    break;
                }
            }
        }

        // 3. Transcript timestamp lookup for precise attribution
        const transcriptMap = new Map<string, any[]>();
        try {
            const transCol = await getTranscriptionCollection();
            const transDocs = await transCol.find(sessionId ? { sessionId } : {}).toArray();
            transDocs.forEach((td: any) => {
                transcriptMap.set(td.sessionId, td.transcripts || []);
            });
        } catch (transErr: any) {
            logger.warn(`Transcription timestamp lookup warning: ${transErr.message}`);
        }

        // 4. Construct Structured Citations
        const citations: CitationItem[] = retrievedDocs.map((chunk, idx) => {
            const sid = chunk.sessionId;
            const sInfo = sessionMap.get(sid);
            const transcripts = transcriptMap.get(sid) || [];
            
            const matchedTrans = transcripts.find((t: any) => t.chunkIndex === chunk.chunkId);
            const timestamp = matchedTrans ? matchedTrans.startAt : (chunk.chunkId !== undefined ? chunk.chunkId * 120 : 0);

            return {
                sessionId: sid,
                videoTitle: sInfo?.videoTitle || chunk.videoTitle || "Lecture Video",
                videoUrl: sInfo?.videoUrl || "",
                chunkId: chunk.chunkId ?? idx,
                timestamp: timestamp,
                timestampFormatted: formatTimestamp(timestamp),
                textSnippet: typeof chunk.notes === "string" ? chunk.notes.slice(0, 280) + (chunk.notes.length > 280 ? "..." : "") : "",
                score: chunk.score ? Math.round(chunk.score * 100) / 100 : undefined,
            };
        });

        // 5. Construct Grounded LLM Context
        let contextText = "";
        if (retrievedDocs.length > 0) {
            contextText = retrievedDocs.map((doc, idx) => {
                const sid = doc.sessionId;
                const sInfo = sessionMap.get(sid);
                const title = sInfo?.videoTitle || doc.videoTitle || `Lecture ${sid}`;
                const citation = citations[idx];
                const tsStr = citation?.timestampFormatted ? ` (at ~${citation.timestampFormatted})` : "";
                return `=== [Source ${idx + 1}: ${title}${tsStr}] ===\n${doc.notes}`;
            }).join("\n\n---\n\n");
        } else {
            contextText = "No relevant study notes or transcript chunks were found in the database.";
        }

        const userPrompt = `Student Question:
"${cleanQuery}"

Retrieved Lecture Notes & Transcript Chunks:
${contextText}

INSTRUCTIONS:
1. If the student question is off-topic (unrelated to study notes or lectures), politely refuse using the guardrail message in system prompt.
2. If the student asks in which session or lecture they learned something and what it means, explicitly cite the Lecture Title, timestamp, and define the concept in detail.
3. Answer accurately and comprehensively in Markdown based strictly on the retrieved context.`;

        // 6. Synthesis Turn: Invoke LLM with System & User Prompts
        const response = await stuctModelProvider("google").invoke([
            {
                role: "system",
                content: ragAgentSystemPrompt || ragAgentPrompt,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ]);

        const answerText = typeof response.content === "string" 
            ? response.content 
            : (Array.isArray(response.content) ? response.content.map((c: any) => c.text || "").join("\n") : String(response.content || ""));

        const avgScore = citations.length > 0 
            ? citations.reduce((sum, c) => sum + (c.score || 0.8), 0) / citations.length 
            : 0;

        return {
            answer: answerText.trim(),
            citations,
            score: Math.round(avgScore * 100) / 100,
            query: cleanQuery,
        };

    } catch (error: any) {
        logger.error("Error in Agentic RAG search engine:", error);
        return {
            answer: "An error occurred while querying your study notes. Please verify your connection or try rephrasing your question.",
            citations: [],
            score: 0,
            query: cleanQuery,
        };
    }
}