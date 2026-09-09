import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { env } from '../utils/env.js';



export function stuctModelProvider(provider: string = "google"): any {

    return new ChatGoogleGenerativeAI({
        apiKey: env.GOOGLE_API_KEY,
        model: env.STRUCT_MODEL,
        temperature: 0.1,
        maxRetries: 2
    });
}

export function NotesModelProvider(provider: string = "google"): any {
    return new ChatGoogleGenerativeAI({
        apiKey: env.GOOGLE_API_KEY,
        model: env.MODEL || "gemini-2.0-flash",
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        maxRetries: 2
    } as any);
}

export const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: env.GOOGLE_API_KEY,
    model: env.EMBEDDING_MODEL,
});

