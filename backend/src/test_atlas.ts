import { getDb } from './database/mongo.js';
import { embeddings } from './configs/gemini.js';
import { env } from './utils/env.js';

async function testAtlas() {
    const db = await getDb();
    const embCol = db.collection('Embeddings');
    const count = await embCol.countDocuments();
    console.log('Total documents in Embeddings collection:', count);

    const sample = await embCol.findOne();
    console.log('Sample document:', {
        sessionId: sample?.sessionId,
        chunkId: sample?.chunkId,
        notesLength: sample?.notes?.length,
        embeddingLength: sample?.embeddings?.length
    });

    const queryVector = await embeddings.embedQuery('malloc dynamic memory allocation');
    console.log('Query vector generated length:', queryVector.length);

    try {
        const resultsWithFilter = await embCol.aggregate([
            {
                $vectorSearch: {
                    index: env.VECTOR_INDEX || 'default',
                    path: 'embeddings',
                    queryVector: queryVector,
                    filter: { sessionId: sample?.sessionId },
                    numCandidates: 50,
                    limit: 6,
                },
            },
            {
                $project: {
                    sessionId: 1,
                    notes: 1,
                    score: { $meta: 'vectorSearchScore' }
                }
            }
        ]).toArray();
        console.log('Results WITH filter:', resultsWithFilter.length);
    } catch (e: any) {
        console.log('Results WITH filter error:', e.message);
    }

    try {
        const resultsNoFilter = await embCol.aggregate([
            {
                $vectorSearch: {
                    index: env.VECTOR_INDEX || 'default',
                    path: 'embeddings',
                    queryVector: queryVector,
                    numCandidates: 50,
                    limit: 6,
                },
            },
            {
                $project: {
                    sessionId: 1,
                    notes: 1,
                    score: { $meta: 'vectorSearchScore' }
                }
            }
        ]).toArray();
        console.log('Results WITHOUT filter:', resultsNoFilter.length);
    } catch (e: any) {
        console.log('Results WITHOUT filter error:', e.message);
    }
}

testAtlas().catch(console.error);
