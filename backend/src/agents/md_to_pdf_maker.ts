import { stuctModelProvider, embeddings } from "../configs/gemini.js";
import { getNotesCollection, getEmbeddingsCollection } from "../database/collections.js";
import { logger } from "../utils/logger.js";
import { mdGeneratorPrompt } from "./prompts/prompts.js";
import { mdToPdf } from "md-to-pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embeddingSchema } from "../schmas/embedding_schema.js";

async function generateEmbeddingsForNotes(sessionId: string, md: string) {
    try {
        const embeddingsCol = await getEmbeddingsCollection();
        const existingCount = await embeddingsCol.countDocuments({ sessionId });
        if (existingCount > 0) {
            logger.info(`Embeddings already exist for session ${sessionId}. Skipping generation.`);
            return;
        }

        const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const documents = await splitter.createDocuments([md]);
        if (!documents || documents.length === 0) {
            logger.warn(`No text chunks created from markdown for session ${sessionId}`);
            return;
        }

        const texts = documents.map(doc => doc.pageContent);
        const vectors = await embeddings.embedDocuments(texts);

        const records = [];
        for (let i = 0; i < texts.length; i++) {
            const parsed = embeddingSchema.safeParse({
                sessionId,
                chunkId: i,
                notes: texts[i],
                embeddings: vectors[i],
                createdAt: new Date(),
            });
            if (parsed.success) {
                records.push(parsed.data);
            } else {
                logger.error(`Error parsing embedding schema for chunk ${i}:`, parsed.error);
            }
        }

        if (records.length > 0) {
            await embeddingsCol.insertMany(records);
            logger.info(`Successfully stored ${records.length} embeddings for session ${sessionId}`);
        }
    } catch (err) {
        logger.error(`Failed to generate embeddings for session ${sessionId}:`, err);
    }
}

async function convertNotesToMd(sessionId: string) {
    try {
        const col = await getNotesCollection()
        if (!col) {
            logger.error("Notes collection not found")
            throw new Error("Notes collection not found")
        }
        const notes = await col.find({ sessionId: sessionId }, {
            projection: {
                topics: 1,
                _id: 0
            }
        }).toArray()
        if (!notes || notes.length === 0) {
            logger.error(`No notes found for session ${sessionId}`)
            throw new Error(`No notes found for session ${sessionId}`)
        }
        const llm = stuctModelProvider("google");
        const result = await llm.invoke([
            { role: "system", content: mdGeneratorPrompt },
            { role: "user", content: JSON.stringify(notes) }
        ])

        const mdText = typeof result.content === 'string' ? result.content : String(result.content || '')
        return mdText
    } catch (err) {
        logger.error("Error converting notes to md", err)
        throw err
    }
}

export async function convertMdToPdf(sessionId: string) {
    try {
        const md = await convertNotesToMd(sessionId)

        // Verify if embeddings exist, and generate using LangChain functions if missing
        await generateEmbeddingsForNotes(sessionId, md)

        const pdf = await mdToPdf(
            { content: md },
            {
                launch_options: {
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            }
        )
        if (!pdf || !pdf.content) {
            logger.error("PDF generation failed: pdf or pdf.content is missing")
            throw new Error("Failed to generate PDF document")
        }
        return pdf.content
    } catch (err) {
        logger.error("Error converting md to pdf", err)
        throw err
    }
}