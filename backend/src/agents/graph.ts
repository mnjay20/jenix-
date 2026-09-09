import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { type NotesSchemaType } from "../schmas/notes_schema.js";
import { type ExtractedFrame } from "../utils/frame_extractor.js";
import { stateLoader } from "./state_loader.js";
import { notesAgentNode } from "./notes_agent.js";
import { summaryAgentNode } from "./summaryAgent.js";
import { sendAndsaveNode } from "./store_in_db.js";

export const GraphState = Annotation.Root({
  chunkIndex: Annotation<number>(),
  videoTitle: Annotation<string>(),
  videoUrl: Annotation<string>(),
  sessionId: Annotation<string>(),
  transcript: Annotation<string>(),
  rollingSummary: Annotation<string>(),
  previousTranscript: Annotation<string>(),
  startTimestamp: Annotation<number>(),
  endTimestamp: Annotation<number>(),
  frames: Annotation<ExtractedFrame[]>({
    reducer: (_, current) => current ?? [],
    default: () => [],
  }),
  notes: Annotation<NotesSchemaType | null>(),
});

export type State = typeof GraphState.State;

export const graph = new StateGraph(GraphState)
  .addNode("stateLoaderNode", stateLoader)
  .addNode("notesAgentNode", notesAgentNode)
  .addNode("summaryAgentNode", summaryAgentNode)
  .addNode("sendAndsaveNode", sendAndsaveNode)
  .addEdge(START, "stateLoaderNode")
  .addEdge("stateLoaderNode", "notesAgentNode")
  .addEdge("notesAgentNode", "summaryAgentNode")
  .addEdge("notesAgentNode", "sendAndsaveNode")
  .addEdge("summaryAgentNode", END)
  .addEdge("sendAndsaveNode", END)
  .compile();


