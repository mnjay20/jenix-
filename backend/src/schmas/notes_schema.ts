import { z } from "zod";

export const FrameSchema = z.object({
  timestamp: z.number().describe("Timestamp in seconds when the frame was captured"),
  imageUrl: z.string().describe("Cloudinary URL or data URL of the screenshot"),
  caption: z.string().optional().describe("Optional short caption describing the screenshot"),
});
export type FrameType = z.infer<typeof FrameSchema>;

export const NoteBlock = z.object({
  type: z.enum([
    "heading",
    "paragraph",
    "list",
    "general",
    "image",
  ]).describe("The type of notes block. Must be one of: 'heading', 'paragraph', 'list', 'general', or 'image'."),
  content: z.string().optional().describe("The content of the block (used for heading or paragraph)."),
  title: z.string().optional().describe("Optional title for heading or list block."),
  items: z.array(z.string()).optional().describe("Array of items/points for 'list' type block."),
  style: z.enum(["bullet", "numbered"]).optional().describe("Style for 'list' block ('bullet' or 'numbered')."),
  imageUrl: z.string().optional().describe("Image URL for 'image' block showing a video screenshot."),
  caption: z.string().optional().describe("Caption for 'image' block."),
  timestamp: z.number().optional().describe("Timestamp in seconds for the screenshot."),
}).passthrough();

export type NoteBlockType = z.infer<typeof NoteBlock>;

export const TopicSchema = z.object({
  title: z.string().describe("The title of the topic/chapter."),
  blocks: z.array(NoteBlock).describe("Array of content blocks for this topic."),
  frames: z.array(FrameSchema).optional().describe("Screenshots captured for this topic."),
});
export type TopicType = z.infer<typeof TopicSchema>;

export const NotesSchema = z.object({
  topics: z.array(TopicSchema),
});
export type NotesSchemaType = z.infer<typeof NotesSchema>;

export const LecturNotesSchema = z.object({
  sessionId: z.string(),
  videoTitle: z.string(),
  topics: z.array(TopicSchema),
  summary: z.string().optional().describe("Rolling summary of the lecture notes"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type LectureNotesType = z.infer<typeof LecturNotesSchema>;