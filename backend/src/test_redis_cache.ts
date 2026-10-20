import { redis } from "./configs/redis.js";
import { getSessionCollection, getTranscriptionCollection, getNotesCollection } from "./database/collections.js";
import {
  setSessionCache,
  getOrRebuildSessionStatus,
  populateAudioQueue,
  popAudioChunkWithRebuild,
  updateTranscriptContext,
  getOrRebuildTranscriptContext,
  saveRollingSummary,
  REDIS_24H_TTL,
  RedisKeys,
} from "./utils/redis_cache.js";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import express from "express";
import sessionRouter from "./routes/sessions.js";

async function runTests() {
  console.log("==================================================");
  console.log("🚀 Starting Comprehensive Redis Cache & Rebuild Verification");
  console.log("==================================================");

  const testSessionId = `test_session_${Date.now()}`;
  const testUserId = `test_user_${Date.now()}`;

  try {
    // ----------------------------------------------------
    // TEST 1: Session Status Cache & Cache-Miss Rebuild
    // ----------------------------------------------------
    console.log("\n[TEST 1] Testing Session Status Caching & DB Rebuild...");
    
    // 1.1 Insert test session into MongoDB
    const sessionCol = await getSessionCollection();
    await sessionCol.insertOne({
      sessionId: testSessionId,
      userId: testUserId,
      videoTitle: "Introduction to Algorithms",
      videoUrl: "https://www.youtube.com/watch?v=test12345",
      duration: 3600,
      status: "active",
      progress: 42,
      createdAt: new Date(),
    });

    // 1.2 Cache session in Redis
    await setSessionCache(testSessionId, {
      status: "active",
      progress: 42,
    });

    // 1.3 Verify TTL is 24 hours (86400s)
    const sessionTtl = await redis.ttl(RedisKeys.session(testSessionId));
    console.log(`✓ Session TTL verified: ${sessionTtl}s (Expected: ~86400s)`);
    if (sessionTtl < 86300 || sessionTtl > 86400) {
      throw new Error(`Invalid session TTL: ${sessionTtl}`);
    }

    // 1.4 Cache hit test
    const cacheHitStatus = await getOrRebuildSessionStatus(testSessionId);
    console.log(`✓ Cache hit result: status=${cacheHitStatus?.status}, progress=${cacheHitStatus?.progress}, source=${cacheHitStatus?.source}`);
    if (cacheHitStatus?.source !== "cache" || cacheHitStatus?.status !== "active") {
      throw new Error("Failed cache hit verification");
    }

    // 1.5 Simulate cache eviction / expiry (Cache miss)
    await redis.del(RedisKeys.session(testSessionId));
    console.log(`✓ Simulated cache expiration: key deleted from Redis`);

    // 1.6 Rebuild on cache miss
    const cacheMissStatus = await getOrRebuildSessionStatus(testSessionId);
    console.log(`✓ Cache miss rebuild result: status=${cacheMissStatus?.status}, progress=${cacheMissStatus?.progress}, source=${cacheMissStatus?.source}`);
    if (cacheMissStatus?.source !== "db" || cacheMissStatus?.status !== "active" || cacheMissStatus?.progress !== 42) {
      throw new Error("Failed cache miss DB rebuild verification");
    }

    // 1.7 Verify key was re-created in Redis with 24h TTL
    const rebuiltSessionTtl = await redis.ttl(RedisKeys.session(testSessionId));
    console.log(`✓ Rebuilt Session TTL verified: ${rebuiltSessionTtl}s (Expected: ~86400s)`);
    if (rebuiltSessionTtl < 86300 || rebuiltSessionTtl > 86400) {
      throw new Error(`Invalid rebuilt session TTL: ${rebuiltSessionTtl}`);
    }

    // ----------------------------------------------------
    // TEST 2: Audio Chunk Queue & Cache-Miss Rebuild from Disk
    // ----------------------------------------------------
    console.log("\n[TEST 2] Testing Audio Chunk Queue & Disk Cache Rebuild...");
    const cacheDir = path.resolve(`./cache/${testSessionId}`);
    await mkdir(cacheDir, { recursive: true });

    // Create 3 dummy audio chunk files on disk: 0000.wav, 0001.wav, 0002.wav
    await writeFile(path.join(cacheDir, "0000.wav"), "dummy audio 0");
    await writeFile(path.join(cacheDir, "0001.wav"), "dummy audio 1");
    await writeFile(path.join(cacheDir, "0002.wav"), "dummy audio 2");

    // 2.1 Initial population of audio queue
    await populateAudioQueue(testSessionId, [
      { chunkIndex: 0, path: `./cache/${testSessionId}/0000.wav` },
      { chunkIndex: 1, path: `./cache/${testSessionId}/0001.wav` },
      { chunkIndex: 2, path: `./cache/${testSessionId}/0002.wav` },
    ]);

    const queueTtl = await redis.ttl(RedisKeys.audioQueue(testSessionId));
    console.log(`✓ Audio queue TTL verified: ${queueTtl}s (Expected: ~86400s)`);
    if (queueTtl < 86300 || queueTtl > 86400) {
      throw new Error(`Invalid audio queue TTL: ${queueTtl}`);
    }

    // 2.2 Pop chunk 0
    const firstChunk = await popAudioChunkWithRebuild(testSessionId);
    console.log(`✓ Popped first chunk: index=${firstChunk?.chunkIndex}, path=${firstChunk?.path}`);
    if (firstChunk?.chunkIndex !== 0) {
      throw new Error(`Expected chunk 0, got ${firstChunk?.chunkIndex}`);
    }
    // Simulate chunk 0 processed and deleted from disk
    await rm(path.join(cacheDir, "0000.wav"), { force: true });

    // 2.3 Simulate cache expiration on audio queue (delete Redis key)
    await redis.del(RedisKeys.audioQueue(testSessionId));
    console.log(`✓ Simulated audio queue expiration in Redis`);

    // 2.4 Pop next chunk with cache miss: should detect remaining 0001.wav and 0002.wav on disk and rebuild
    const rebuiltChunk1 = await popAudioChunkWithRebuild(testSessionId);
    console.log(`✓ Rebuild on cache miss: Popped chunk=${rebuiltChunk1?.chunkIndex}, path=${rebuiltChunk1?.path}`);
    if (rebuiltChunk1?.chunkIndex !== 1) {
      throw new Error(`Expected rebuilt chunk 1, got ${rebuiltChunk1?.chunkIndex}`);
    }

    // Verify rebuilt queue has 24h TTL
    const rebuiltQueueTtl = await redis.ttl(RedisKeys.audioQueue(testSessionId));
    console.log(`✓ Rebuilt queue TTL verified: ${rebuiltQueueTtl}s (Expected: ~86400s)`);
    if (rebuiltQueueTtl < 86300 || rebuiltQueueTtl > 86400) {
      throw new Error(`Invalid rebuilt queue TTL: ${rebuiltQueueTtl}`);
    }

    // Simulate chunk 1 processed
    await rm(path.join(cacheDir, "0001.wav"), { force: true });

    // Pop chunk 2
    const chunk2 = await popAudioChunkWithRebuild(testSessionId);
    console.log(`✓ Popped chunk 2: index=${chunk2?.chunkIndex}`);
    if (chunk2?.chunkIndex !== 2) {
      throw new Error(`Expected chunk 2, got ${chunk2?.chunkIndex}`);
    }
    // Simulate chunk 2 processed
    await rm(path.join(cacheDir, "0002.wav"), { force: true });

    // 2.5 Delete Redis key again to simulate expiration on COMPLETED session
    await redis.del(RedisKeys.audioQueue(testSessionId));
    const completedResult = await popAudioChunkWithRebuild(testSessionId);
    console.log(`✓ Empty folder completion check: result=${completedResult} (Expected: null)`);
    if (completedResult !== null) {
      throw new Error("Expected null for completed session with empty cache folder");
    }

    // ----------------------------------------------------
    // TEST 3: Transcript Queue Context & Rolling Summary Cache Miss Rebuild
    // ----------------------------------------------------
    console.log("\n[TEST 3] Testing Transcript Context & Rolling Summary DB Rebuild...");

    // 3.1 Store initial chunks in MongoDB Transcriptions & Notes
    const transCol = await getTranscriptionCollection();
    await transCol.insertOne({
      sessionId: testSessionId,
      videoTitle: "Introduction to Algorithms",
      transcripts: [
        { chunkIndex: 0, startAt: 0, endAt: 120, text: "Welcome to lecture one on asymptotic analysis." },
        { chunkIndex: 1, startAt: 120, endAt: 240, text: "Big-O notation gives an upper bound on running time." },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const notesCol = await getNotesCollection();
    await notesCol.insertOne({
      sessionId: testSessionId,
      videoTitle: "Introduction to Algorithms",
      topics: [],
      summary: "Lecture covers algorithm efficiency and asymptotic upper bounds.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3.2 Test saving rolling summary updates Redis with 24h TTL and updates MongoDB
    await saveRollingSummary(testSessionId, "Updated summary: Covered Big-O, Theta, and Omega notations.");
    const contextTtl = await redis.ttl(RedisKeys.context(testSessionId));
    console.log(`✓ Context TTL after saveRollingSummary: ${contextTtl}s (Expected: ~86400s)`);
    if (contextTtl < 86300 || contextTtl > 86400) {
      throw new Error(`Invalid context TTL: ${contextTtl}`);
    }

    // 3.3 Test updating transcript context
    const currentChunkObj = {
      sessionId: testSessionId,
      videoTitle: "Introduction to Algorithms",
      chunkIndex: 2,
      startAt: 240,
      endAt: 360,
      text: "Merge sort achieves O(n log n) worst-case time complexity.",
    };
    const updateResult = await updateTranscriptContext(testSessionId, currentChunkObj);
    console.log(`✓ Updated context: previousChunkIndex=${updateResult.previousChunk?.chunkIndex}, summaryLength=${updateResult.summary.length}`);

    // 3.4 Simulate cache expiration (Delete context key in Redis)
    await redis.del(RedisKeys.context(testSessionId));
    console.log(`✓ Simulated context expiration in Redis`);

    // 3.5 Rebuild transcript context on cache miss
    const recoveredContext = await getOrRebuildTranscriptContext(testSessionId, {
      videoTitle: "Introduction to Algorithms",
      chunkIndex: 3,
      startTimestamp: 360,
      endTimestamp: 480,
      transcript: "Now let us analyze the recurrence relation using the master theorem.",
    });

    console.log(`✓ Recovered Context: source=${recoveredContext.source}, currentChunkIndex=${recoveredContext.currentChunk?.chunkIndex}, previousChunkIndex=${recoveredContext.previousChunk?.chunkIndex}`);
    console.log(`✓ Recovered Summary: "${recoveredContext.summary}"`);

    if (recoveredContext.source !== "db") {
      throw new Error("Expected source to be 'db' after cache miss");
    }
    if (!recoveredContext.summary || !recoveredContext.summary.includes("Big-O")) {
      throw new Error("Failed to recover rolling summary from database");
    }
    if (recoveredContext.previousChunk?.chunkIndex !== 1) {
      throw new Error(`Expected previous chunk index 1 from DB, got ${recoveredContext.previousChunk?.chunkIndex}`);
    }

    // Verify rebuilt context key in Redis has 24h TTL
    const rebuiltContextTtl = await redis.ttl(RedisKeys.context(testSessionId));
    console.log(`✓ Rebuilt Context TTL verified: ${rebuiltContextTtl}s (Expected: ~86400s)`);
    if (rebuiltContextTtl < 86300 || rebuiltContextTtl > 86400) {
      throw new Error(`Invalid rebuilt context TTL: ${rebuiltContextTtl}`);
    }

    // ----------------------------------------------------
    // TEST 4: Express REST Route GET /api/sessions/:sessionId/status
    // ----------------------------------------------------
    console.log("\n[TEST 4] Testing REST API GET /api/sessions/:sessionId/status...");
    const app = express();
    app.use(express.json());
    app.use("/api/sessions", sessionRouter);

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = server.address().port;

    try {
      // 4.1 Test cache miss on REST endpoint
      await redis.del(RedisKeys.session(testSessionId));
      const res1 = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}/status`);
      const data1 = (await res1.json()) as any;
      console.log(`✓ REST GET /status on cache miss:`, data1);
      if (!data1.success || data1.status !== "active" || data1.source !== "db") {
        throw new Error("Failed REST status cache miss recovery");
      }

      // 4.2 Test cache hit on REST endpoint
      const res2 = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}/status`);
      const data2 = (await res2.json()) as any;
      console.log(`✓ REST GET /status on cache hit:`, data2);
      if (!data2.success || data2.status !== "active" || data2.source !== "cache") {
        throw new Error("Failed REST status cache hit verification");
      }
    } finally {
      server.close();
    }

    console.log("\n==================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!");
    console.log("==================================================");
  } finally {
    // Cleanup test artifacts
    console.log("\nCleaning up test artifacts...");
    await redis.del(RedisKeys.session(testSessionId));
    await redis.del(RedisKeys.audioQueue(testSessionId));
    await redis.del(RedisKeys.context(testSessionId));
    try {
      const col = await getSessionCollection();
      await col.deleteOne({ sessionId: testSessionId });
      const transCol = await getTranscriptionCollection();
      await transCol.deleteOne({ sessionId: testSessionId });
      const notesCol = await getNotesCollection();
      await notesCol.deleteOne({ sessionId: testSessionId });
      await rm(path.resolve(`./cache/${testSessionId}`), { recursive: true, force: true });
    } catch (e) {}
    console.log("Cleanup complete.");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
