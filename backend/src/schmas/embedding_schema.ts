import z from "zod";



export const embeddingSchema = z.object({
    sessionId: z.string(),
    chunkId: z.number(),
    notes: z.string(),
    embeddings: z.array(z.number()).nonempty(),
    createdAt: z.coerce.date()
})

export type embeddingSchemaType = z.infer<typeof embeddingSchema>