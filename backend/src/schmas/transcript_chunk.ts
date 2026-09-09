import { z } from "zod";


export const downloadStartedPayloadSchema = z.object({
  videoUrl: z.string().url().min(1, "video url is required"),
  userId: z.string().min(1, "user id is required"),
  sessionId: z.string().optional(),
})
export type DownloadStartedPayload = z.infer<typeof downloadStartedPayloadSchema>

export const TranscriptChunkSchema = z.object({
  sessionId: z.string(),
  videoTitle: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  startAt: z.number().nonnegative(),
  endAt: z.number().nonnegative(),
  text: z.string(),
  
});

export type TranscriptChunk = z.infer<typeof TranscriptChunkSchema>;

export const TranscriptChunkItemSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  startAt: z.number().nonnegative(),
  endAt: z.number().nonnegative(),
  text: z.string(),
});

export type TranscriptChunkItem = z.infer<typeof TranscriptChunkItemSchema>;

export const SessionTranscriptionSchema = z.object({
  sessionId: z.string(),
  videoTitle: z.string(),
  transcripts: z.array(TranscriptChunkItemSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type SessionTranscriptionType = z.infer<typeof SessionTranscriptionSchema>;