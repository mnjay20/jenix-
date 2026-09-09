# Jenix AI Backend Documentation

Welcome to the backend developer documentation for **Jenix AI**, an intelligent lecture session and study assistant platform.

Jenix AI streams video audio, performs local high-fidelity speech-to-text (STT) transcription, extracts video stream frames, compiles structured multimodal notes using Gemini and LangGraph, generates PDF exports, and provides conversational semantic search (RAG) over lecture materials.

---

## 1. Overview & Core Capabilities

The backend is built as a TypeScript Node.js service offering both **RESTful API endpoints** (for user sync, session creation/history, status patches, RAG search, and PDF exports) and **Socket.IO WebSockets** (for real-time audio chunking, note generation pacing, live logs, and streaming events).

### Core Features
- **Server-Side Audio Stream Extraction**: Directly pipes `yt-dlp` output into `ffmpeg` to extract and segment audio into 16kHz PCM WAV chunks on-the-fly without client-side canvas capture.
- **Multimodal Video Frame Extraction**: Dynamically captures representative video frames (`.jpg`) corresponding to audio chunk timestamps.
- **Worker Thread STT**: Offloads speech-to-text inference to Node.js worker threads running Hugging Face Transformers.js (`onnx-community/whisper-base`).
- **Multimodal LangGraph Workflow**: Passes transcript segments and attached video frames to Gemini via a state graph pipeline (`stateLoaderNode` -> `notesAgentNode` -> `summaryAgentNode` -> `sendAndsaveNode` -> `embeddingNode`).
- **Atlas Vector Search RAG**: Generates embeddings for accumulated note windows and provides conversational question answering over study materials.
- **PDF Export Engine**: Converts generated Markdown study notes into styled PDF documents.

---

## 2. System Architecture & Lifecycle

The sequence diagram below outlines the full lifecycle from user login to session creation, audio streaming, STT worker processing, LangGraph note generation, and RAG search:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client (React)
    participant REST as Express REST API
    participant Sockets as Socket.IO Server
    participant STT as Whisper Worker Threads
    participant DB as MongoDB Database
    participant Redis as Redis Cache & Queue
    participant LangGraph as Gemini Multimodal Pipeline

    Client->>REST: POST /api/users/sync (Upsert User Profile)
    Client->>REST: POST /api/sessions (Create or Fetch Session)
    REST->>DB: Persist Session Metadata (status: creating)
    REST->>Redis: Cache Session State & Progress

    Client->>Sockets: session:join { sessionId }
    Client->>Sockets: audio:download_started { videoUrl }
    Note over Sockets: Spawn yt-dlp | ffmpeg (Segments PCM WAV chunks to cache/sessionId/)
    Sockets->>Redis: Push chunk paths to audio_queue:sessionId
    Sockets-->>Client: Emit audio:chunking_completed

    loop Paced Transcription & Note Generation Loop
        Client->>Sockets: transcript:next_chunk
        Sockets->>STT: Offload chunk.wav to Worker Thread (Whisper ONNX)
        STT-->>Sockets: Transcribed text chunk
        Sockets->>Sockets: Extract 3 visual frames via yt-dlp/ffmpeg
        Sockets->>LangGraph: Execute State Graph Pipeline
        
        rect rgb(20, 18, 30)
            Note over LangGraph: 1. stateLoaderNode: Load context & frames
            Note over LangGraph: 2. notesAgentNode: Gemini generates structured notes with frames
            Note over LangGraph: 3. summaryAgentNode: Update rolling summary
            LangGraph->>DB: 4. sendAndsaveNode: Save Notes & Transcript
            LangGraph->>DB: 5. embeddingNode: Compute & save Atlas Vector embedding
        end

        Sockets-->>Client: Emit notes:chunk_ready { topics, transcript, frames }
        Client->>Sockets: Update video progress & trigger next chunk
    end

    Client->>REST: POST /api/search (Ask question via RAG)
    REST->>DB: MongoDB $vectorSearch on Embeddings
    REST-->>Client: Return RAG answer with source citations

    Client->>REST: POST /download-pdf (Request PDF export)
    REST-->>Client: Stream PDF document
```

### Tech Stack
- **Runtime**: Node.js v18+ (with `tsx` for development, `tsc` for production compilation)
- **Frameworks**: Express.js, Socket.IO
- **Databases**:
  - **MongoDB**: Persistent storage for sessions, structured note blocks, transcript chunks, and vector embeddings (Atlas Vector Search).
  - **Redis**: Active state cache, session status hashes, and sorted audio queues.
- **AI Orchestration**: LangChain Core, LangGraph (stateful multi-agent workflows), Google Gemini models (`gemini-2.5-flash` / `gemini-3-flash-preview` and `text-embedding-004`).
- **Speech-to-Text**: Hugging Face Transformers.js (`onnx-community/whisper-base`) running in Node.js worker threads.
- **Media Utilities**: `yt-dlp` (video streaming) and `ffmpeg` (audio partitioning and frame capture).
- **Document Processing**: `md-to-pdf` for exporting lecture notes.

---

## 3. REST API Endpoint Reference

### Base URL: `http://localhost:3000/api`

### User Endpoints (`/api/users`)
- **`POST /api/users/sync`**
  - **Payload**: `{ "userId": "string", "email": "string" }`
  - **Description**: Upserts user profile in MongoDB `Users` collection.
  - **Response**: `{ "success": true, "message": "User synced successfully" }`

- **`GET /api/users/:userId/sessions`**
  - **Description**: Retrieves all saved study sessions for a user sorted by creation date.
  - **Response**: `{ "success": true, "sessions": Array<Session> }`

---

### Session Endpoints (`/api/sessions`)
- **`POST /api/sessions`**
  - **Payload**: `{ "userId": "string", "videoTitle": "string", "videoUrl": "string", "duration": number }`
  - **Description**: Creates a new session or returns an existing session for the given user and video URL.
  - **Response**: `{ "success": true, "sessionId": "string", "isNew": boolean, "session": Session }`

- **`GET /api/sessions/:sessionId`**
  - **Description**: Fetches session state, structured note topics, transcripts, and captured screenshot frames.
  - **Response**: `{ "success": true, "sessionId": "string", "videoTitle": "string", "videoUrl": "string", "duration": number, "status": "string", "progress": number, "topics": Array, "transcripts": Array, "frames": Array }`

- **`PATCH /api/sessions/:sessionId/progress`**
  - **Payload**: `{ "progress": number }`
  - **Description**: Updates playback progress percentage (0-100) in Redis and MongoDB.

- **`PATCH /api/sessions/:sessionId/status`**
  - **Payload**: `{ "status": "creating" | "active" | "paused" | "completed" | "failed" }`
  - **Description**: Updates session status across cache and persistent storage.

- **`POST /api/sessions/:sessionId/leave`**
  - **Description**: Marks session status as `paused`.

- **`POST /api/sessions/:sessionId/end`**
  - **Description**: Marks session status as `ended`, clears Redis audio queues, and removes local cached files (`cache/:sessionId`).

---

### Search & Export Endpoints
- **`POST /api/search`**
  - **Payload**: `{ "sessionId": "string", "userId": "string", "query": "string" }`
  - **Description**: Performs RAG vector search across session embeddings and generates a conversational answer with citations.
  - **Response**: `{ "success": true, "answer": "string", "citations": Array, "score": number, "query": "string" }`

- **`POST /download-pdf`**
  - **Payload**: `{ "sessionId": "string" }`
  - **Description**: Generates and returns a downloadable PDF document of the structured lecture notes.

---

## 4. WebSocket Event Catalogue

All real-time communications operate via Socket.IO defined in [`src/utils/events.ts`](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/backend/src/utils/events.ts):

| Event Name | Direction | Payload Shape | Purpose |
|---|---|---|---|
| `session:join` | Client -> Server | `{ sessionId: string }` | Registers client socket to session room |
| `session:leave` | Client -> Server | `{ sessionId: string }` | Unregisters socket from room and pauses session |
| `audio:download_started` | Client -> Server | `{ videoUrl: string, userId: string, sessionId: string }` | Triggers `yt-dlp` & `ffmpeg` audio streaming and chunking |
| `audio:chunking_completed` | Server -> Client | `{ success: true, sessionId: string }` | Notifies frontend audio chunks are ready in cache/queue |
| `transcript:next_chunk` | Client -> Server | None | Requests processing of the next audio chunk |
| `notes:processing_started` | Server -> Client | `{ sessionId: string }` | Signals LLM transcription and note synthesis has started |
| `notes:chunk_ready` | Server -> Client | `{ sessionId, topics, startAt, endAt, transcript, frames }` | Delivers structured notes block, transcript, and frames |
| `transcript:completed` | Server -> Client | `{ sessionId: string }` | Signals all chunks are processed and session notes are complete |
| `search:query` | Client -> Server | `{ query: string, sessionId: string }` | Issue RAG question via WebSocket |
| `search:results` | Server -> Client | `{ success, answer, score, chunks }` | Returns RAG answer over WebSocket |
| `error` | Server -> Client | `{ success: false, message: string }` | General WebSocket error notification |

---

## 5. File & Directory Structure

```
backend/
├── cache/                            # Temporary local audio chunks (*.wav) grouped by sessionId
├── src/
│   ├── index.ts                      # Main Express HTTP server, REST router mounts, and Socket.IO initialization
│   ├── agents/                       # LangGraph multi-agent workflow & LLM services
│   │   ├── graph.ts                  # LangGraph StateGraph pipeline definition
│   │   ├── notes_agent.ts            # Multimodal Gemini note generation node
│   │   ├── summaryAgent.ts           # Rolling lecture summary synthesis node
│   │   ├── state_loader.ts           # State & Redis context loader node
│   │   ├── store_in_db.ts            # MongoDB persistence & Socket.IO chunk emitter node
│   │   ├── embedding.ts              # Sliding window vector embeddings node (Gemini Embeddings API)
│   │   ├── md_to_pdf_maker.ts        # Markdown to PDF converter utility
│   │   └── utils/
│   │       ├── search.ts             # MongoDB Atlas Vector Search ($vectorSearch) RAG service
│   │       └── frame_extractor.ts    # yt-dlp/ffmpeg video frame extraction utility
│   ├── configs/                      # Service configurations
│   │   ├── gemini.ts                 # ChatGoogleGenerativeAI & GoogleGenerativeAIEmbeddings instances
│   │   ├── redis.ts                  # ioredis client initialization and event handlers
│   │   └── whisper_model.ts          # Hugging Face Transformers.js Whisper pipeline setup
│   ├── database/                     # MongoDB client & collection helpers
│   │   ├── mongo.ts                  # MongoClient connection lifecycle
│   │   └── collections.ts            # Collection getters (Sessions, Users, Notes, Transcriptions, Embeddings)
│   ├── routes/                       # Express REST API routes
│   │   ├── users.ts                  # User sync & user session history routes
│   │   ├── sessions.ts               # Session CRUD, status, progress, leave, and end routes
│   │   └── search.ts                 # RAG search REST endpoint
│   ├── schmas/                       # Zod validation schemas & TypeScript interfaces
│   │   ├── notes_schema.ts           # Structured notes, topics, and NoteBlock definitions
│   │   ├── session_schema.ts         # Session lifecycle schemas and payload definitions
│   │   ├── embedding_schema.ts       # Vector embedding document schemas
│   │   ├── transcript_chunk.ts       # Transcript chunk schemas
│   │   └── user_schema.ts            # User profile schemas
│   ├── utils/                        # System utilities
│   │   ├── audio_chunk.ts            # yt-dlp stdout to ffmpeg stdin audio chunking pipeline
│   │   ├── audio_transcription.ts    # Worker thread dispatcher for speech-to-text
│   │   ├── env.ts                    # Strongly typed Zod environment variable validator
│   │   ├── events.ts                 # Centralized Socket.IO event name constants
│   │   ├── load_audio.ts             # yt-dlp URL cleaner & process helpers
│   │   ├── logger.ts                 # Winston logger configuration
│   │   └── whisper.ts                # Audio buffer preprocessing & Transformers.js pipeline execution
│   ├── webSockets/                   # Real-time WebSocket handlers
│   │   ├── server.ts                 # Socket.IO server initialization
│   │   ├── connections.ts            # Socket connection lifecycle & route handlers
│   │   └── handlers/                 # Event-specific socket handlers
│   │       ├── audio_chunking.ts     # Handles download initialization events
│   │       ├── search_query.ts       # Handles RAG search over sockets
│   │       ├── sessions.ts           # Handles room joins and leaves
│   │       └── transcription.ts      # Handles chunk requests & triggers LangGraph
│   └── workers/
│       └── chunk_worker.ts           # Node.js Worker Thread executing local Whisper STT
├── Dockerfile                        # Production Docker container definition
├── docker-compose.yml                # Multi-container orchestration (Backend + MongoDB + Redis)
├── package.json                      # npm dependencies & script definitions
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## 6. Environment & Configuration

All environment variables are validated at startup using Zod in [`src/utils/env.ts`](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/backend/src/utils/env.ts).

### Sample `.env` File
```ini
# Google Gemini AI Studio API Key
GOOGLE_API_KEY=AIzaSy...

# Gemini Model Settings
MODEL=gemini-2.5-flash
EMBEDDING_MODEL=text-embedding-004

# Server Configuration
PORT=3000

# Database Configuration
MONGO_DB_URI=mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=jenix_db
VECTOR_INDEX=vector_index

# Redis Cache Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Audio Chunking Settings
CHUNK_SIZE=30
```

---

## 7. Setup & Execution

### Prerequisites
1. **Node.js**: v18+ installed.
2. **MongoDB**: A running instance (Atlas required for Atlas Vector Search `$vectorSearch`).
3. **Redis**: Running locally or on cloud (`redis-server`).
4. **yt-dlp**: Installed globally and available in system PATH.
5. **ffmpeg**: Installed globally and available in system PATH.

### Development Commands
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start development server (with tsx hot reload)
npm run dev

# 4. Compile TypeScript
npm run build

# 5. Start production server
npm run start
```

### Docker Orchestration
Run the entire backend stack (Backend API, MongoDB, Redis) via Docker Compose:
```bash
docker-compose up --build -d
```
