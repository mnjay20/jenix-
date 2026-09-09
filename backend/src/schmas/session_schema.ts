import { z } from "zod";

export const SessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  videoTitle: z.string().min(1, "title is needed"),
  videoUrl: z.string().url().min(1, 'url is needed'),
  duration: z.number().nonnegative(),
  status: z.enum([
    "creating",
    "active",
    "paused",
    "ended",
    "failed",
  ]),
  progress: z.number(),
  createdAt: z.coerce.date(),
});

export const RedisSessionSchema = SessionSchema.extend({

  status: z.enum([
    "creating",
    "active",
    "paused",
    "ended",
    "failed",
  ]),
  progress: z.number(),
  lastActivity: z.coerce.date().optional(),
});
export type RedisSessionType = z.infer<typeof RedisSessionSchema>

export const SessionStatus =  z.enum([
  "creating",
  "active",
  "paused",
  "ended",
  "failed",
]);
 export type SessionStatusType = z.infer<typeof SessionStatus>

export type SessionType= z.infer<typeof SessionSchema>


export const CreateSessionPayloadSchema = z.object({
  userId: z.string(), // Remove this later when authentication is implemented
  videoTitle: z.string().min(1, "Title is required"),
  videoUrl: z.string().url("Invalid video URL"),
  duration: z.number().nonnegative(),
});

export type CreateSessionPayload = z.infer<
  typeof CreateSessionPayloadSchema
>;

export type SessionResponse =
  | {
      success: true;
      message: string;
      notes?: any[];
      topics?: any[];
    }
  | {
      success: false;
      message: string;
    }
  | {
      success: true;
      sessionId: string;
      notes?: any[];
      topics?: any[];
    } 

export const JoinSessionPayloadSchema = z.object({
  sessionId: z.string()
})
export type JoinSessionPayload = z.infer<typeof JoinSessionPayloadSchema>;


export const LeaveSessionPayloadSchema = z.object({
  sessionId: z.string(),
})
export type LeaveSessionPayload = z.infer<typeof LeaveSessionPayloadSchema>;

export const UpdateProgressPayloadSchema = z.object({
  progress: z.number().min(0).max(100),
});
export type UpdateProgressPayload = z.infer<typeof UpdateProgressPayloadSchema>;

export const UpdateStatusPayloadSchema = z.object({
  status: SessionStatus,
});
export type UpdateStatusPayload = z.infer<typeof UpdateStatusPayloadSchema>;