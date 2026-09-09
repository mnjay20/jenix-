import 'dotenv/config'

import { z } from 'zod'

const envSchema = z.object({
    GOOGLE_API_KEY: z.string().min(1, "Google API key is required!"),
    STT_KEY: z.string().min(1, "Groq STT key is required!"),
    MODEL: z.string().default("gemini-3.5-flash-lite"),
    STRUCT_MODEL: z.string().default("gemini-3.5-flash-lite"),
    EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGO_DB_URI: z.string().min(1, "Mongodb uri is required"),
    MONGO_DB_NAME: z.string().min(1, "Mongodb name is required"),
    REDIS_HOST: z.string().default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().default(6379),
    CHUNK_SIZE: z.coerce.number().int().min(1).default(120),
    FRAME_COUNT: z.coerce.number().int().min(0).max(10).default(1),
    VECTOR_INDEX: z.string().min(1, "Vector index is required"),
    CLOUDINARY_CLOUD_NAME: z.string().default("jenix-ai"),
    CLOUDINARY_API_KEY: z.string().default(""),
    CLOUDINARY_API_SECRET: z.string().default(""),
    API_KEY: z.string().min(1, "api key is required")
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.format())
    process.exit(1)
}

export const env = Object.freeze(parsed.data)
