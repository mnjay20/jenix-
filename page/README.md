# Jenix AI Frontend Documentation

Welcome to the frontend developer documentation for the **Jenix AI** study assistant web interface.

Jenix AI provides an interactive, obsidian dark-themed workspace designed for video lecture analysis, real-time structured note generation, lecture transcript inspection, visual screenshot frame viewing, PDF downloading, playback speed rate control, and conversational AI semantic search (RAG).

---

## 1. Overview & Architecture

The frontend is a single-page React 19 application built with TypeScript and Vite 8. It interfaces with the backend server via **REST APIs** (for user authentication sync, session creation/history, and PDF exports) and **Socket.IO WebSockets** (for real-time audio chunking, note generation pacing, live logs, and streaming AI updates).

```mermaid
graph TD
    A[App Component] --> B[Sidebar Drawer]
    A --> C[Left Column: Video Workspace]
    A --> D[Right Column: Feature Section]

    B --> B1[Session Stack & History]
    B --> B2[New Session Form & YT API Duration Fetcher]

    C --> C1[YouTube Player Component]
    C --> C2[ControlsBar & Live Execution Terminal]
    C2 --> C2a[Playback Progress Indicator]
    C2 --> C2b[Video Speed Dropdown Select: 1x, 1.25x, 1.5x, 1.75x, 2x]
    C2 --> C2c[Pause / Resume AI Loop Button]

    D --> D1[Notes Renderer Tab]
    D --> D2[Transcript Renderer Tab]
    D --> D3[Screenshots Renderer Tab]
    D --> D4[AI Chat / RAG Search Tab]

    D1 --> D1a[Copy Notes & Download PDF /download-pdf]
    D4 --> D4a[Conversational RAG Search /api/search]

    subgraph State Management (Zustand)
        Z1[socketStore.ts]
        Z2[userStore.ts]
    end

    C1 <--> Z1
    C2 <--> Z1
    D <--> Z1
    B <--> Z2
```

### Core Features
- **Collapsible Sessions Drawer**: View saved lecture sessions, switch active sessions, create new sessions with YouTube URL validation and automated video duration retrieval via YouTube iFrame API.
- **Synchronized Video Player**: Custom YouTube player wrapper with progress tracking, pause/resume synchronization with note generation, and micro time overlay.
- **Video Speed Selector**: Integrated playback speed dropdown selector supporting `1x`, `1.25x`, `1.5x`, `1.75x`, and `2x` playback speeds.
- **Paced AI Note Generation Loop**: Automatically controls note synthesis timing so structured notes appear in sync with video progress.
- **Live Terminal Execution Log**: Displays real-time system state updates, socket logs, audio chunk progress, and execution error banners.
- **Structured Notes Renderer**: Displays topics, subtopics, bulleted/numbered lists, callouts, tables, formulas, and Mermaid.js diagrams with one-click Markdown copy and styled PDF export (`/download-pdf`).
- **Conversational RAG AI Chat**: Provides interactive Q&A over lecture notes powered by MongoDB Atlas Vector Search with similarity scores and citation metadata cards.
- **Visual Screenshot Captures**: Displays lecture frames captured directly from the video stream with timestamps and captions.

---

## 2. Tech Stack & Styling Design System

### Technologies
- **UI Framework**: React 19 + TypeScript
- **Build Tool**: Vite 8
- **State Management**: Zustand v5 (with `localStorage` persistence)
- **Real-Time Communication**: Socket.IO Client v4
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons**: Lucide React
- **Diagrams**: Mermaid.js v11
- **UI Components**: React Aria Components & Shadcn UI

### Obsidian Dark Aesthetics & Design Palette
The application follows a dark obsidian design system matching the following color variables:
- **`theme-charcoal` (`#0C0A12`)**: Primary app background and main containers.
- **`theme-plum` (`#13111C`)**: Card backgrounds, drawer panels, and structural elements.
- **`theme-accent` (`#8B5CF6` / `#7C3AED`)**: Primary action buttons, active tab indicators, and progress highlights.
- **Typography**: Outfit font for headings (`font-heading`) and DM Sans for body content (`font-sans`).

---

## 3. Core Component Architecture

### 1. `App.tsx`
Main dashboard container managing overall layout:
- Renders `Sidebar` (left drawer), Video Column (65% width), and Feature Section (35% width).
- Manages full-screen layout and login state gate (`userStore.isLoggedIn`).

### 2. `Sidebar.tsx` ([src/components/sidebar/Sidebar.tsx](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/components/sidebar/Sidebar.tsx))
Collapsible session navigation drawer:
- Syncs user session history from backend (`GET /api/users/:userId/sessions`).
- Renders "New Study Session" creation form with explicit text colors for input fields (`text-zinc-100 placeholder:text-zinc-500`).
- Embeds a hidden temporary YouTube player instance to automatically resolve video duration before submitting session creation (`POST /api/sessions`).

### 3. `YoutuvePlayer.tsx` ([src/components/leftsection/YoutuvePlayer.tsx](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/components/leftsection/YoutuvePlayer.tsx))
Interactive YouTube player component:
- Listens to `videoSpeed` state from `socketStore` and updates YouTube iFrame API `setPlaybackRate(videoSpeed)`.
- Syncs video play/pause events with Zustand `isNotesGenerating` state.
- Updates current playback progress (`updateVideoProgress`) to drive the paced note generation loop.

### 4. `ControlsBar.tsx` ([src/components/leftsection/ControlsBar.tsx](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/components/leftsection/ControlsBar.tsx))
Video control header & live system execution terminal:
- **Playback Progress Bar**: Displays percentage and visual progress.
- **Video Speed Dropdown**: Select element allowing speed rates `1x`, `1.25x`, `1.5x`, `1.75x`, `2x`.
- **Action Button**: Toggle button to Generate, Pause, or Resume AI note generation.
- **System Log Terminal**: Auto-scrolling terminal log displaying WebSocket events, audio processing status, and error alerts.

### 5. `featureSection.tsx` & Right Section Renderers ([src/components/rightsection/](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/components/rightsection/))
Tabbed container providing four views:
- **`NotesRenderer.tsx`**: Formats structured notes with copy-to-clipboard and PDF download (`/download-pdf`).
- **`TranscriptRenderer.tsx`**: Renders timestamped audio transcripts.
- **`ScreenshotsRenderer.tsx`**: Displays visual screenshot frames captured from the video stream.
- **`NotesQueryChat.tsx`**: Interactive AI chat supporting RAG semantic search queries (`POST /api/search`).
- **`MermaidRenderer.tsx`**: Renders interactive Mermaid diagrams for conceptual flowcharts.

---

## 4. State Management (`socketStore.ts` & `userStore.ts`)

All application state is managed cleanly using Zustand stores located in `src/store/`:

### `socketStore.ts` ([src/store/socketstore.ts](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/store/socketstore.ts))
Main WebSocket and video state store handling:
- **Session State**: `sessionId`, `videoTitle`, `videoUrl`, `duration`, `currentTime`, `playbackProgress`, `sessionStatus`.
- **Playback Speed**: `videoSpeed` (default `1`) and `setVideoSpeed` action.
- **Real-Time Data**: `topics`, `transcripts`, `frames`, `logs`, `lastError`.
- **Pacing & Loop Controls**: `isNotesGenerating`, `isDownloading`, `isChunking`, `isTranscribing`, `startNotesGeneration()`, `pauseNotesGeneration()`.

### `userStore.ts` ([src/store/userStore.ts](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/page/src/store/userStore.ts))
User profile store handling login state and `localStorage` persistence (`jenix_user`).

---

## 5. File & Directory Structure

```
page/
├── public/                           # Static public assets & icons
├── src/
│   ├── assets/                       # Images & SVG assets
│   ├── components/                   # React components
│   │   ├── leftsection/              # Video player & control bar components
│   │   │   ├── ControlsBar.tsx       # Progress bar, speed selector (1x-2x), resume button & log terminal
│   │   │   └── YoutuvePlayer.tsx     # YouTube player wrapper with speed & pause sync
│   │   ├── loginPage/                # Authentication screen
│   │   │   └── login.tsx             # User login form
│   │   ├── rightsection/             # Notes, Transcripts, Screenshots & RAG Chat tabs
│   │   │   ├── featureSection.tsx    # Tabbed container header & navigation
│   │   │   ├── GhostLoader.css       # Skeleton loader animations
│   │   │   ├── GhostLoader.tsx       # Skeleton loader component
│   │   │   ├── MermaidRenderer.tsx   # Mermaid.js diagram renderer
│   │   │   ├── NotesQueryChat.tsx    # Conversational RAG search interface
│   │   │   ├── NotesRenderer.tsx     # Structured note renderer & PDF export button
│   │   │   ├── ScreenshotsRenderer.tsx# Video screenshot frame viewer
│   │   │   └── TranscriptRenderer.tsx# Timestamped transcript viewer
│   │   ├── sidebar/                  # Collapsible session drawer
│   │   │   └── Sidebar.tsx           # Session history drawer & new session form
│   │   └── ui/                       # Base design system primitives (Shadcn UI / React Aria)
│   │       ├── avatar.tsx            # Avatar primitive
│   │       ├── badge.tsx             # Badge primitive
│   │       ├── button.tsx            # Button primitive
│   │       ├── card.tsx              # Card primitive
│   │       ├── input.tsx             # Input primitive (with explicit text-foreground styling)
│   │       ├── progress.tsx          # Progress bar primitive
│   │       ├── separator.tsx         # Separator primitive
│   │       ├── tabs.tsx              # Tabs primitive
│   │       └── textarea.tsx          # Textarea primitive
│   ├── hooks/                        # Custom React hooks
│   │   └── use-mobile.ts             # Responsive viewport detection hook
│   ├── lib/                          # Classname merger utility
│   │   └── utils.ts                  # clsx & tailwind-merge helper
│   ├── store/                        # Central Zustand state management stores
│   │   ├── socketstore.ts            # Socket.IO, active session, playback speed & notes store
│   │   └── userStore.ts              # User auth state & localStorage persistence store
│   ├── App.tsx                       # Main dashboard layout container
│   ├── index.css                     # Global styles, Tailwind v4 imports & custom theme variables
│   └── main.tsx                      # React root entry point
├── eslint.config.js                  # ESLint configuration
├── index.html                        # Main HTML template
├── package.json                      # npm scripts & dependencies
├── tsconfig.json                     # TypeScript config
└── vite.config.ts                    # Vite build configuration
```

---

## 6. Setup & Development

### Prerequisites
- **Node.js**: v18 or higher.
- **Backend API**: Running backend server (default: `http://localhost:3000`).

### Development Commands
```bash
# 1. Install dependencies
npm install

# 2. Start Vite development server with HMR
npm run dev

# 3. Run TypeScript check & build for production
npm run build

# 4. Preview compiled production build
npm run preview
```
