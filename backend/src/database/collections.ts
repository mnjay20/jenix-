import type { Collection } from "mongodb";
import { getDb } from "./mongo.js";


let NotesCollection: Promise<Collection> | null = null
let SessionCollection: Promise<Collection> | null = null
let EmbeddingsCollection: Promise<Collection> | null = null

export async function getNotesCollection(): Promise<Collection> {
    if (!NotesCollection) {
        NotesCollection = (async () => {
            try {
                const db = await getDb()
                const col = db.collection("Notes")
                await col.createIndex({ sessionId: 1 }, { unique: true })
                return col
            } catch (err) {
                NotesCollection = null;
                throw err;
            }
        })()
        return NotesCollection!
    }
    return NotesCollection!
}

export async function getSessionCollection(): Promise<Collection> {
    if (!SessionCollection) {
        SessionCollection = (async () => {
            try {
                const db = await getDb()
                const sessions = db.collection('Sessions')
                await Promise.all([
                    sessions.createIndex({ sessionId: 1 }, { unique: true }),
                    sessions.createIndex({ userId: 1 }),
                ]);
                return sessions
            } catch (err) {
                SessionCollection = null;
                throw err;
            }
        })()
        return SessionCollection!
    }
    return SessionCollection!
}

export async function getEmbeddingsCollection(): Promise<Collection> {
    if (!EmbeddingsCollection) {
        EmbeddingsCollection = (async () => {
            try {
                const db = await getDb()
                const col = db.collection("Embeddings")
                try {
                    await col.dropIndex("sessionId_1");
                } catch (e) {}
                await col.createIndex({ sessionId: 1, chunkId: 1 }, { unique: true })
                return col
            } catch (err) {
                EmbeddingsCollection = null;
                throw err;
            }
        })()
        return EmbeddingsCollection!
    }
    return EmbeddingsCollection!
}

let UserCollection: Promise<Collection> | null = null;

export async function getUserCollection(): Promise<Collection> {
    if (!UserCollection) {
        UserCollection = (async () => {
            try {
                const db = await getDb()
                const col = db.collection("Users")
                try {
                    await col.dropIndex("email_1");
                } catch (e) {}
                await col.createIndex({ userId: 1 }, { unique: true })
                return col
            } catch (err) {
                UserCollection = null;
                throw err;
            }
        })()
        return UserCollection!
    }
    return UserCollection!
}

let TranscriptionCollection: Promise<Collection> | null = null;

export async function getTranscriptionCollection(): Promise<Collection> {
    if (!TranscriptionCollection) {
        TranscriptionCollection = (async () => {
            try {
                const db = await getDb()
                const col = db.collection("Transcriptions")
                await col.createIndex({ sessionId: 1 }, { unique: true })
                return col
            } catch (err) {
                TranscriptionCollection = null;
                throw err;
            }
        })()
        return TranscriptionCollection!
    }
    return TranscriptionCollection!
}