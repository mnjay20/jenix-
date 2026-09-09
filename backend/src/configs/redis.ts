import {Redis} from "ioredis";
import { env } from "../utils/env.js";

export const redis = new Redis({
  host: env.REDIS_HOST || "127.0.0.1",
  port: Number(env.REDIS_PORT) || 6379,
});


redis.on("connect", () => {
  console.log("🟢 Connected to Redis");
});

redis.on("ready", () => {
  console.log("✅ Redis is ready");
});

redis.on("error", (err) => {
  console.error("🔴 Redis Error:", err);
});

redis.on("close", () => {
  console.log("🟡 Redis connection closed");
});

export async function closeRedis() {
  await redis.quit();
}