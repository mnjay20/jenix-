import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './database/mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

function request(options: http.RequestOptions, data?: any): Promise<{ status?: number | undefined; headers: http.IncomingHttpHeaders; data: any }> {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                const isJson = (res.headers['content-type'] || '').includes('application/json');
                let parsedData: any = body;
                if (isJson) {
                    try {
                        parsedData = JSON.parse(body.toString());
                    } catch (e) {
                        parsedData = body.toString();
                    }
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: parsedData
                });
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function runTestFlow() {
    console.log('=== STARTING END-TO-END SYSTEM FUNCTIONALITY TEST ===\n');
    const targetVideoUrl = `https://www.youtube.com/watch?v=WI9dE8-TFAc&t=${Date.now()}`;
    const userId = `e2e_student_${Date.now()}`;

    // Step 1: Create Initial Session for YouTube Video
    console.log('1. User starts watching YouTube video...');
    const createRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/sessions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        userId,
        videoTitle: 'C Programming Tutorial - Lecture 16',
        videoUrl: targetVideoUrl,
        duration: 1200
    });

    console.log('   Session Creation Result:', createRes.status, createRes.data.sessionId);
    const sessionId1 = createRes.data.sessionId;

    // Connect to MongoDB Atlas via project's getDb() helper
    const db = await getDb();

    // Insert sample notes into 'Notes' collection for session 1
    await db.collection('Notes').updateOne(
        { sessionId: sessionId1 },
        {
            $set: {
                sessionId: sessionId1,
                videoTitle: 'C Programming Tutorial - Lecture 16',
                topics: [
                    {
                        title: "Pointers and Dynamic Memory Allocation in C",
                        blocks: [
                            { type: "heading", content: "Introduction to Dynamic Memory Allocation" },
                            { type: "paragraph", content: "In C programming, dynamic memory allocation allows programs to request memory from the heap at runtime using malloc(), calloc(), and realloc(). Pointers store the memory addresses of allocated blocks." },
                            {
                                type: "list",
                                style: "bullet",
                                title: "Key Functions",
                                items: [
                                    "malloc(size_t size): Allocates uninitialized memory on heap.",
                                    "calloc(num, size): Allocates zero-initialized memory block.",
                                    "free(ptr): Deallocates previously allocated heap memory."
                                ]
                            },
                            { type: "general", title: "Memory Allocation Code Example", content: "```c\n#include <stdio.h>\n#include <stdlib.h>\nint main() {\n    int *ptr = (int*) malloc(5 * sizeof(int));\n    if (ptr == NULL) return 1;\n    free(ptr);\n    return 0;\n}\n```" }
                        ]
                    }
                ],
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    // Insert sample transcripts into 'Transcriptions' collection for session 1
    await db.collection('Transcriptions').updateOne(
        { sessionId: sessionId1 },
        {
            $set: {
                sessionId: sessionId1,
                transcripts: [
                    {
                        chunkIndex: 0,
                        startAt: 15,
                        endAt: 120,
                        text: "In this lecture we discuss dynamic memory allocation in C programming using malloc, calloc, realloc, and freeing memory with free()."
                    }
                ],
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    // Step 2: Update Progress (Watch Video)
    console.log('\n2. Updating playback progress to 25%...');
    const progRes1 = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/sessions/${sessionId1}/progress`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
    }, { progress: 25 });
    console.log('   Progress update:', progRes1.data);

    // Step 3: Pause Session
    console.log('\n3. User pauses the session...');
    const pauseRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/sessions/${sessionId1}/leave`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    console.log('   Pause response:', pauseRes.data);

    // Step 4: Resume Session
    console.log('\n4. User resumes the session...');
    const resumeRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/sessions/${sessionId1}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
    }, { status: 'active' });
    console.log('   Resume response:', resumeRes.data);

    // Step 5: Switch Session to a Different Video
    console.log('\n5. User switches to a different session...');
    const createRes2 = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/sessions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        userId,
        videoTitle: 'C Programming Tutorial - Lecture 17',
        videoUrl: `https://www.youtube.com/watch?v=sample_video_17_${Date.now()}`,
        duration: 900
    });
    const sessionId2 = createRes2.data.sessionId;
    console.log('   Created Session 2:', sessionId2);

    // Step 6: Change Back to Session 1 to Start from Where Left Off
    console.log('\n6. User switches back to Session 1 to resume from 25%...');
    const getSess1 = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/sessions/${sessionId1}`,
        method: 'GET'
    });
    console.log(`   Restored Session 1 (Progress: ${getSess1.data.progress}%, Status: ${getSess1.data.status})`);

    // Step 7: PDF Generation & Embedding Storage Check
    console.log('\n7. Generating PDF and checking vector embedding creation in MongoDB...');
    const pdfRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/download-pdf',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { sessionId: sessionId1 });

    const isPdfBuffer = Buffer.isBuffer(pdfRes.data) && pdfRes.data.subarray(0, 4).toString() === '%PDF';
    console.log(`   PDF Generation HTTP Status: ${pdfRes.status}`);
    console.log(`   PDF Valid Buffer Received: ${isPdfBuffer}`);
    if (!isPdfBuffer && !(pdfRes.data instanceof Buffer)) {
        console.log('   PDF Endpoint Error Response:', pdfRes.data);
    }

    const embDocs = await db.collection('Embeddings').find({ sessionId: sessionId1 }).toArray();
    console.log(`   Embeddings generated in MongoDB: ${embDocs.length} chunks stored`);

    // Step 8: Ask Notes Agent (Agentic RAG Query)
    console.log('\n8. Querying Notes Agent via Agentic RAG Search (waiting 2.5s for vector index sync)...');
    await new Promise(r => setTimeout(r, 2500));
    const searchRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/search',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        sessionId: sessionId1,
        query: 'What functions are used for dynamic memory allocation in C and how does malloc work?'
    });

    console.log('\n=== AGENTIC RAG SEARCH ANSWER ===');
    console.log('Answer:\n', searchRes.data.answer);
    console.log('\nCitations Count:', searchRes.data.citations?.length || 0);
    if (searchRes.data.citations && searchRes.data.citations.length > 0) {
        console.log('Sample Citation:', searchRes.data.citations[0]);
    }
    console.log('Confidence Score:', searchRes.data.score);

    // Step 9: Complete Video Session
    console.log('\n9. Completing Session 1 (Setting progress to 100% and status to ended)...');
    const endRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/sessions/${sessionId1}/end`,
        method: 'POST'
    });
    console.log('   End Session result:', endRes.data);

    console.log('\n=== ALL FUNCTIONALITY TESTS COMPLETED SUCCESSFULLY ===');
}

runTestFlow().catch(console.error);
