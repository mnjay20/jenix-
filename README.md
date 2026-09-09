# Jenix AI - Multimodal Lecture Synthesis & Agentic Study Assistant

Jenix AI is an advanced, multimodal AI-powered lecture synthesis and study assistant platform. It processes spoken video lecture content in real-time, extracts high-density textbook-quality study notes, captures visual slide/board snapshots, provides an **Agentic RAG Notes Q&A Assistant**, and compiles downloadable Master PDF Study Guides.

---

## 🏗️ Overall System Architecture

Jenix AI is built as a decoupled **monorepo** consisting of a React frontend client and a Node.js/TypeScript backend service:

```
+-----------------------------------------------------------------------------------+
|                                 JENIX AI MONOREPO                                 |
+-----------------------------------------------------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                                                               |
          v                                                               v
+-------------------+                                           +-------------------+
|  Frontend (page/) |                                           | Backend (backend/)|
| React + Tailwind  |                                           | Node.js + Express |
|  Zustand + Vite   |                                           | LangGraph Agents  |
+-------------------+                                           +-------------------+
          |                                                               |
          +--- WebSocket (Socket.io) <---> Live Session Events -----------+
          |                                                               |
          +--- REST API (/api/sessions, /api/search, /download-pdf) -----+
                                                                          |
                                      +-----------------------------------+
                                      |
                                      v
           +-----------------------------------------------------+
           |                 INFRASTRUCTURE                      |
           | MongoDB Atlas (Notes, Sessions, Vector Embeddings)  |
           | Redis Cache (Session Status & Queues)               |
           | Google Gemini AI (Multimodal LLM & Embeddings)      |
           +-----------------------------------------------------+
```

---

## 🎨 Frontend Architecture (`page/`)

The frontend is a modern React 18 single-page application and Chrome extension built with Vite, TypeScript, Tailwind CSS v4, and shadcn/ui components.

### Core Frontend Stack
- **UI Framework**: React 18, Vite, TypeScript
- **Styling & Aesthetics**: Tailwind CSS v4 with custom Obsidian dark theme (`#0C0A12` and `#13111C`), Lucide icons, and custom CSS scrollbars.
- **State Management**: **Zustand** (`src/store/socketstore.ts` & `src/store/userStore.ts`) for centralized session state, audio chunk pacing, active topics, and user context.

### Key Frontend Components
1. **Video Player & Session Controls (`YoutuvePlayer.tsx`, `ControlsBar.tsx`)**:
   - Manages YouTube video playback synchronization.
   - Handles session control actions: pause session, resume session, switch session, and complete session.
   - Restores playback progress seamlessly when returning to previous sessions.
2. **Real-time Notes Renderer (`NotesRenderer.tsx`)**:
   - Renders structured textbook study notes received over WebSocket events.
   - Supports LaTeX mathematical equations (`$$...$$`), Mermaid diagrams (`MermaidRenderer.tsx`), styled code blocks (`Code2`), and Markdown tables (`MarkdownTableRenderer`).
3. **Agentic Notes Q&A Assistant (`NotesQueryChat.tsx`)**:
   - Interactive Q&A chat interface allowing students to query their lecture notes.
   - Powered by `CuratedAnswerRenderer` to format AI answers with rich markdown headers, syntax-highlighted code blocks, bullet points, and inline formatting.
   - Displays expandable source citation cards with clickable timestamp badges (`00:15`) and context snippets.
4. **Slide Snapshot Gallery (`ScreenshotsRenderer.tsx`)**:
   - Displays visual board/slide frame snapshots captured during lecture audio processing.

---

## ⚡ Backend Architecture (`backend/`)

The backend is built with Node.js, Express, TypeScript, Socket.io, LangChain, LangGraph, MongoDB Atlas, and Redis.

### Core Backend Components

#### 1. LangGraph Live Lecture Processing Pipeline ([graph.ts](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/backend/src/agents/graph.ts))
Processes spoken audio chunks in real-time using a stateful `@langchain/langgraph` workflow:
- **`stateLoaderNode`**: Loads session state, prior transcripts, and cumulative rolling summary.
- **`notesAgentNode`**: Multimodal synthesis engine combining audio transcripts and visual frame snapshots (up to 6 images/chunk) to produce structured JSON study notes.
- **`summaryAgentNode`**: Generates and updates a cumulative, textbook-quality rolling lecture summary.
- **`sendAndsaveNode`**: Persists generated notes into MongoDB and emits real-time WebSocket events to the frontend client.

#### 2. Agentic RAG Search Engine ([search.ts](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/backend/src/agents/utils/search.ts))
An autonomous RAG Q&A pipeline that resolves student questions:
- **Autonomous Query Expansion**: Features a multi-turn retry loop. If initial vector search returns low relevance, the agent uses Gemini to dynamically rewrite the search query with technical terms/synonyms.
- **MongoDB Atlas Vector Search**: Executes `$vectorSearch` aggregate queries against stored embeddings.
- **Attribution & Timestamp Mapping**: Resolves exact transcript start/end timestamps and session video titles.
- **Domain Guardrails**: Enforces domain boundaries (`ragAgentSystemPrompt`) to politely refuse off-topic requests.

#### 3. PDF Generator & Vector Embedding Compiler ([md_to_pdf_maker.ts](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/backend/src/agents/md_to_pdf_maker.ts))
- Synthesizes session notes into a unified Master Study Guide Markdown document.
- Splits markdown using `RecursiveCharacterTextSplitter` and generates vector embeddings via `GoogleGenerativeAIEmbeddings`.
- Renders and downloads high-quality PDF files via `md-to-pdf` (Puppeteer).

---

## 🛠️ Installation & Setup Guide

### Prerequisites
Make sure you have the following installed on your system:
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm**
- **MongoDB**: MongoDB Atlas cluster (with a Vector Search Index) or local MongoDB instance
- **Redis**: Local Redis server or Redis Cloud instance
- **Google Gemini API Key**: API key for Google Generative AI models

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/mnjay20/jenix-.git
cd jenix-
```

---

### Step 2: Backend Setup & Configuration

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in `backend/.env` with your credentials:
   ```env
   PORT=3000
   GOOGLE_API_KEY=your_google_gemini_api_key
   MODEL=gemini-2.0-flash
   STRUCT_MODEL=gemini-2.0-flash
   EMBEDDING_MODEL=gemini-embedding-001
   MONGO_DB_URI=your_mongodb_connection_string
   MONGO_DB_NAME=ai_study_ext
   VECTOR_INDEX=ai_study_extension
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   CHUNK_SIZE=120
   ```

4. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend server will start listening at `http://localhost:3000`.

---

### Step 3: Frontend Setup & Configuration

1. Open a new terminal window and navigate to the frontend directory:
   ```bash
   cd page
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the frontend Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will be accessible at `http://localhost:5173`.

---

### Step 4: Docker Setup (Optional)

You can also run both services using Docker Compose:

```bash
docker-compose up --build
```

---

## 📜 API Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sessions` | Create or retrieve a lecture study session |
| `GET` | `/api/sessions/:sessionId` | Retrieve session metadata, notes, and transcripts |
| `PATCH` | `/api/sessions/:sessionId/progress` | Update video playback progress percentage |
| `PATCH` | `/api/sessions/:sessionId/status` | Update session status (`active`, `paused`, `ended`) |
| `POST` | `/api/sessions/:sessionId/leave` | Pause active study session |
| `POST` | `/api/sessions/:sessionId/end` | End session and clean up resources |
| `POST` | `/api/search` | Execute Agentic RAG Q&A search across study notes |
| `POST` | `/download-pdf` | Compile master Markdown study guide and download PDF |

---

## 📄 License

This project is licensed under the ISC License.
