// events.ts

export const Events = {
  SESSION: {
    JOIN: "session:join",
    LEAVE: "session:leave",
    CREATE: "session:create",
    UPDATE: {
      PROGRESS: "session:update:progress",
      STATUS: "session:update:status",
    },
    END: "session:end",
  },





  AUDIO: {
    DOWNLOAD_STARTED: "audio:download_started",

    CHUNKING_COMPLETED: "audio:chunking_completed",
  },

  TRANSCRIPT: {
    CHUNK_READY: "transcript:chunk_ready",
    NEXT_CHUNK: "transcript:next_chunk",
    COMPLETED: "transcript:completed",
  },



  NOTES: {
    PROCESSING_STARTED: "notes:processing_started",
    CHUNK_READY: "notes:chunk_ready",

    COMPLETED: "notes:completed",
  },

  EMBEDDING: {
    STARTED: "embedding:started",
    COMPLETED: "embedding:completed",
  },

  FLASHCARDS: {
    STARTED: "flashcards:started",
    READY: "flashcards:ready",
  },

  SUMMARY: {
    STARTED: "summary:started",
    READY: "summary:ready",
  },

  CHAT: {
    MESSAGE: "chat:message",
    STREAM_START: "chat:stream_start",
    TOKEN: "chat:token",
    STREAM_END: "chat:stream_end",
    ERROR: "chat:error",
  },

  SEARCH: {
    QUERY: "search:query",
    RESULTS: "search:results",
  },

  JOB: {
    QUEUED: "job:queued",
    STARTED: "job:started",
    COMPLETED: "job:completed",
    FAILED: "job:failed",
  },


  USER: {
    ONLINE: "user:online",
    OFFLINE: "user:offline",
    SYNC: "user:sync",
  },

  ERROR: {
    GENERAL: "error",
  },
} as const;