import { Socket, io } from "socket.io-client";
import { create } from "zustand";
import { userStore } from "./userStore";

const BACKEND_URL = "http://localhost:3000";

export type NoteBlockType = "heading" | "paragraph" | "list" | "image" | string;
export type GeneralFormat = "diagram" | "formula" | "table" | "code" | "example" | string;

export interface FrameItem {
    timestamp: number;
    imageUrl: string;
    caption?: string;
    chunkIndex?: number;
}

export interface NoteBlock {
    type: NoteBlockType;
    content?: string;
    title?: string;
    items?: string[];
    style?: "bullet" | "numbered" | string;
    imageUrl?: string;
    caption?: string;
    timestamp?: number;
    format?: GeneralFormat;
    language?: string;
    headers?: string[];
    rows?: string[][];
    level?: number;
    variant?: string;
}

export interface Topic {
    title: string;
    blocks: NoteBlock[];
    frames?: FrameItem[];
}

export interface StudySession {
    sessionId: string;
    title: string;
    url: string;
}

export interface TranscriptChunkItem {
    chunkIndex: number;
    startAt: number;
    endAt: number;
    text: string;
}

export interface SocketState {
    socket: Socket | null;
    isConnected: boolean;

    // Active session details
    sessionId: string | null;
    videoTitle: string | null;
    videoUrl: string | null;
    duration: number;
    currentTime: number;
    playbackProgress: number;
    videoSpeed: number;
    sessionStatus: "creating" | "downloading" | "transcribing" | "generating_notes" | "completed" | "failed" | "active" | "paused" | "ended" | null;

    // Real-time audio & transcription state
    isDownloading: boolean;
    isChunking: boolean;
    isTranscribing: boolean;
    topics: Topic[];
    transcripts: TranscriptChunkItem[];
    frames: FrameItem[];

    // History and completion
    sessions: StudySession[];
    completedSessionIds: string[];

    // Feedback & pacing
    logs: string[];
    lastError: string | null;
    isNotesGenerating: boolean;
    lastProcessedEndAt: number;
    pendingNextChunkTriggerTime: number | null;
    lastPausedTime: number | null;

    // UI state
    isSidebarOpen: boolean;
    isSidebarFormOpen: boolean;

    // Actions
    connectSocket: (url?: string) => void;
    disconnectSocket: () => void;

    fetchUserSessions: (userId: string) => Promise<void>;
    createSession: (userId: string, title: string, url: string, duration: number) => Promise<string | null>;
    joinSession: (sessionId: string) => Promise<void>;
    leaveSession: () => Promise<void>;
    changeSession: (sessionId: string) => Promise<void>;
    updateVideoProgress: (currentTime: number) => void;
    updateSessionStatus: (status: "active" | "paused" | "ended" | "creating" | "failed") => Promise<void>;
    triggerNextChunk: () => void;
    checkAndTriggerNextChunkPaced: () => void;
    resetSessionState: () => void;
    clearError: () => void;

    setSidebarOpen: (isOpen: boolean) => void;
    setSidebarFormOpen: (isOpen: boolean) => void;
    setVideoSpeed: (speed: number) => void;

    startNotesGeneration: () => void;
    pauseNotesGeneration: (specificPauseTime?: number) => void;
    completeSession: (sessionId: string) => Promise<void>;
}

let lastProgressUpdateCall = 0;

export const socketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,

    sessionId: null,
    videoTitle: null,
    videoUrl: null,
    duration: 0,
    currentTime: 0,
    playbackProgress: 0,
    videoSpeed: 1,
    sessionStatus: null,
    isDownloading: false,
    isChunking: false,
    isTranscribing: false,
    topics: [],
    transcripts: [],
    frames: [],

    sessions: [],
    completedSessionIds: [],

    logs: [],
    lastError: null,
    isNotesGenerating: false,
    lastProcessedEndAt: 0,
    pendingNextChunkTriggerTime: null,
    lastPausedTime: null,
    isSidebarOpen: true,
    isSidebarFormOpen: false,

    fetchUserSessions: async (userId: string) => {
        if (!userId) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/users/${userId}/sessions`);
            const data = await response.json();
            if (response.ok && data.success && Array.isArray(data.sessions)) {
                const mappedSessions: StudySession[] = data.sessions.map((s: any) => ({
                    sessionId: s.sessionId,
                    title: s.videoTitle || s.title || "Lecture Video",
                    url: s.videoUrl || s.url || "",
                }));
                const completedIds = data.sessions
                    .filter((s: any) => s.status === "ended" || s.status === "completed")
                    .map((s: any) => s.sessionId);

                set({
                    sessions: mappedSessions,
                    completedSessionIds: completedIds,
                });

                localStorage.setItem(`jenix_sessions_${userId}`, JSON.stringify(mappedSessions));
                localStorage.setItem(`jenix_completed_sessions_${userId}`, JSON.stringify(completedIds));
                set((state) => ({ logs: [...state.logs, `[Session Sync] Fetched ${mappedSessions.length} user sessions from MongoDB.`] }));
            }
        } catch (err) {
            console.warn("[Session Sync Error] Failed to fetch user sessions from MongoDB:", err);
        }
    },

    connectSocket: (url = BACKEND_URL) => {
        const existingSocket = get().socket;
        if (existingSocket && existingSocket.connected) {
            return;
        }
        if (existingSocket) {
            existingSocket.disconnect();
        }

        const socket = io(url, { transports: ["websocket"] });

        // Load persisted sessions list for user
        const userId = userStore.getState().user?.userId || "dev-user";
        const savedSessions = localStorage.getItem(`jenix_sessions_${userId}`) || localStorage.getItem(`notemind_sessions_${userId}`);
        const sessions = savedSessions ? JSON.parse(savedSessions) : [];

        const savedCompleted = localStorage.getItem(`jenix_completed_sessions_${userId}`) || localStorage.getItem(`notemind_completed_sessions_${userId}`);
        const completedSessionIds = savedCompleted ? JSON.parse(savedCompleted) : [];

        set({
            socket,
            sessions,
            completedSessionIds,
            logs: ["[Socket] Connecting to live session server..."],
        });

        // Trigger asynchronous MongoDB session sync
        if (userId && userId !== "dev-user") {
            get().fetchUserSessions(userId);
        }

        socket.on("connect", () => {
            set({ isConnected: true, lastError: null });
            set((state) => ({ logs: [...state.logs, "[Socket] Connected for real-time video processing."] }));
            const currentSession = get().sessionId;
            if (currentSession) {
                socket.emit("session:join", { sessionId: currentSession });
            }
            const activeUser = userStore.getState().user?.userId;
            if (activeUser) {
                get().fetchUserSessions(activeUser);
            }
        });

        socket.on("disconnect", () => {
            set({ isConnected: false });
            set((state) => ({ logs: [...state.logs, "[Socket] Disconnected from session stream."] }));
        });

        socket.on("connect_error", (error) => {
            set({ isConnected: false, lastError: "WebSocket connection error: " + error.message });
            set((state) => ({ logs: [...state.logs, `[Socket Error] ${error.message}`] }));
        });

        // Audio processing events
        socket.on("audio:download_started", (payload: any) => {
            const currentSessionId = get().sessionId;
            if (payload.sessionId && payload.sessionId !== currentSessionId) {
                return;
            }

            if (payload.success === false) {
                set({
                    isDownloading: false,
                    isChunking: false,
                    sessionStatus: "failed",
                    isNotesGenerating: false,
                    lastError: payload.message || "Failed to download audio",
                });
                set((state) => ({ logs: [...state.logs, `[Audio Error] ${payload.message}`] }));
            } else {
                set({
                    isDownloading: true,
                    isChunking: true,
                    sessionStatus: "downloading",
                    isNotesGenerating: true,
                    lastError: null,
                });
                set((state) => ({ logs: [...state.logs, "[Audio] Downloading video audio stream..."] }));
            }
        });

        socket.on("audio:chunking_completed", (payload: any) => {
            const currentSessionId = get().sessionId;
            if (payload?.sessionId && payload.sessionId !== currentSessionId) {
                return;
            }

            set({
                isDownloading: false,
                isChunking: false,
                sessionStatus: "paused",
                isNotesGenerating: false,
                lastError: null,
                lastProcessedEndAt: 0,
                pendingNextChunkTriggerTime: null,
            });
            set((state) => ({ logs: [...state.logs, "[Audio] Video prepared. Press Play or Start to begin study session."] }));
        });

        // Real-time Notes generation events
        socket.on("notes:processing_started", (payload?: any) => {
            const currentSessionId = get().sessionId;
            if (payload?.sessionId && payload.sessionId !== currentSessionId) {
                return;
            }
            set({ isTranscribing: true, lastError: null });
            set((state) => ({ logs: [...state.logs, "[AI Agent] Transcribing & structuring notes for next segment..."] }));
        });

        socket.on("notes:chunk_ready", (payload: { sessionId?: string; topics: Topic[]; startAt: number; endAt: number; transcript?: TranscriptChunkItem; frames?: FrameItem[] }) => {
            const currentSessionId = get().sessionId;
            // Guard: Ignore notes chunk if it does not belong to the currently viewed session in the UI
            if (payload.sessionId && payload.sessionId !== currentSessionId) {
                console.log(`[Socket] Ingested chunk for background session ${payload.sessionId}. Saved in DB.`);
                return;
            }

            // Canonical frames source is payload.frames (with fallback to topic.frames if payload.frames is missing)
            const incomingFrames: FrameItem[] = [];
            if (payload.frames && Array.isArray(payload.frames) && payload.frames.length > 0) {
                incomingFrames.push(...payload.frames);
            } else if (payload.topics) {
                payload.topics.forEach(t => {
                    if (t.frames && Array.isArray(t.frames)) {
                        incomingFrames.push(...t.frames);
                    }
                });
            }

            set({ isTranscribing: false, lastError: null });
            set((state) => {
                const existingKeys = new Set(state.frames.map(f => `${f.timestamp}_${f.imageUrl}`));
                const uniqueNewFrames: FrameItem[] = [];

                incomingFrames.forEach((f) => {
                    const key = `${f.timestamp}_${f.imageUrl}`;
                    if (f.imageUrl && !existingKeys.has(key)) {
                        existingKeys.add(key);
                        uniqueNewFrames.push(f);
                    }
                });

                return {
                    topics: [...state.topics, ...(payload.topics || [])],
                    transcripts: payload.transcript ? [...state.transcripts, payload.transcript] : state.transcripts,
                    frames: [...state.frames, ...uniqueNewFrames],
                    lastProcessedEndAt: payload.endAt,
                    logs: [...state.logs, `[AI Agent] Notes ready for segment ${payload.startAt}s - ${payload.endAt}s (${uniqueNewFrames.length} screenshots)`],
                };
            });

            if (get().isNotesGenerating) {
                get().checkAndTriggerNextChunkPaced();
            }
        });

        socket.on("transcript:completed", (payload?: any) => {
            const currentSessionId = get().sessionId;
            if (payload?.sessionId && payload.sessionId !== currentSessionId) {
                return;
            }

            set({
                isTranscribing: false,
                sessionStatus: "completed",
                isNotesGenerating: false,
                lastError: null,
            });
            set((state) => ({ logs: [...state.logs, "[System] All video segments transcribed and notes generated!"] }));

            const currentRoomId = get().sessionId;
            if (currentRoomId) {
                get().completeSession(currentRoomId);
            }
        });

        socket.on("error", (err: any) => {
            set({
                lastError: err?.message || "Server error occurred",
                isDownloading: false,
                isChunking: false,
                isTranscribing: false,
                isNotesGenerating: false,
            });
            set((state) => ({ logs: [...state.logs, `[Error] ${err?.message || 'Server error'}`] }));
        });
    },

    disconnectSocket: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false });
        }
    },

    changeSession: async (newSessionId: string) => {
        const currentSessionId = get().sessionId;
        if (currentSessionId === newSessionId) return;

        // 1. Pause current session on backend and socket before switching (unless it is already completed)
        if (currentSessionId) {
            const { socket, currentTime, sessionStatus } = get();
            
            if (sessionStatus !== "completed") {
                set({
                    lastPausedTime: currentTime,
                    isNotesGenerating: false,
                    sessionStatus: "paused",
                });

                // Pause status on backend
                fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "paused" }),
                }).catch(() => {});
            }

            // Leave socket room of previous session
            if (socket) {
                socket.emit("session:leave", { sessionId: currentSessionId });
            }
        }

        // 2. Clear state before loading new session
        set({
            sessionId: newSessionId,
            isNotesGenerating: false,
            isDownloading: false,
            isChunking: false,
            isTranscribing: false,
            currentTime: 0,
            playbackProgress: 0,
            lastPausedTime: 0,
            lastProcessedEndAt: 0,
            pendingNextChunkTriggerTime: null,
            topics: [],
            transcripts: [],
            frames: [],
        });

        await get().joinSession(newSessionId);
    },

    createSession: async (userId: string, title: string, url: string, duration: number): Promise<string | null> => {
        try {
            set({ 
                sessionStatus: "creating", 
                isNotesGenerating: true, 
                lastError: null,
                isDownloading: false,
                isChunking: false,
                isTranscribing: false,
                currentTime: 0,
                playbackProgress: 0,
                lastPausedTime: 0,
                lastProcessedEndAt: 0,
                pendingNextChunkTriggerTime: null,
                topics: [],
                transcripts: [],
                frames: [],
            });
            set((state) => ({ logs: [...state.logs, `[Session] Creating session for "${title}"...`] }));

            // 1. Create session via REST API
            const response = await fetch(`${BACKEND_URL}/api/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, videoTitle: title, videoUrl: url, duration }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to create session.");
            }

            const sid = data.sessionId;
            const sessionsList = get().sessions;
            let newSessions = sessionsList;
            if (!sessionsList.some(s => s.sessionId === sid)) {
                newSessions = [...sessionsList, { sessionId: sid, title, url }];
            }

            const savedProgress = data.session?.progress || 0;
            const existingTopics = data.session?.topics || [];
            const existingTranscripts = data.session?.transcripts || [];
            const rawFrames: FrameItem[] = [
                ...(data.session?.frames || []),
            ];
            if (rawFrames.length === 0) {
                existingTopics.forEach((t: Topic) => {
                    if (t.frames && Array.isArray(t.frames)) rawFrames.push(...t.frames);
                });
            }

            const createKeySet = new Set<string>();
            const existingFrames: FrameItem[] = [];
            rawFrames.forEach(f => {
                const k = `${f.timestamp}_${f.imageUrl}`;
                if (f.imageUrl && !createKeySet.has(k)) {
                    createKeySet.add(k);
                    existingFrames.push(f);
                }
            });

            const initialEndAt = existingTranscripts.length > 0
                ? Math.max(...existingTranscripts.map((t: TranscriptChunkItem) => t.endAt || ((t.chunkIndex !== undefined ? t.chunkIndex + 1 : 0) * 120)))
                : 0;

            const isAlreadyCompleted = get().completedSessionIds.includes(sid) || data.status === "ended" || data.status === "completed" || (data.session?.progress && data.session.progress >= 100);
            const finalStatus = isAlreadyCompleted ? "completed" : (data.status === "ended" ? "completed" : (data.isNew ? "downloading" : "paused"));
            const finalProgress = isAlreadyCompleted ? 100 : savedProgress;
            const finalSavedTime = duration > 0 ? (isAlreadyCompleted ? duration : (finalProgress / 100) * duration) : 0;

            set({
                sessionId: sid,
                videoTitle: title,
                videoUrl: url,
                duration,
                currentTime: finalSavedTime,
                playbackProgress: finalProgress,
                lastPausedTime: finalSavedTime,
                lastProcessedEndAt: initialEndAt,
                sessionStatus: finalStatus,
                topics: existingTopics,
                transcripts: existingTranscripts,
                frames: existingFrames,
                sessions: newSessions,
                isNotesGenerating: false, // Strictly paused until user initiates playback
                isDownloading: data.isNew === true,
                isChunking: data.isNew === true,
                isTranscribing: false,
            });

            localStorage.setItem(`jenix_sessions_${userId}`, JSON.stringify(newSessions));
            set((state) => ({ logs: [...state.logs, `[Session] Session ready: ${sid}`] }));

            // 2. Connect WebSocket to stream video download & note chunk generation
            get().connectSocket();
            const socket = get().socket;
            if (socket) {
                socket.emit("session:join", { sessionId: sid });
                if (data.isNew) {
                    set({ isDownloading: true, isChunking: true });
                    socket.emit("audio:download_started", { videoUrl: url, userId, sessionId: sid });
                }
            }

            return sid;
        } catch (error: any) {
            const msg = error.message || "Error creating session";
            set({ 
                sessionStatus: "failed", 
                isNotesGenerating: false, 
                lastError: msg,
                isDownloading: false,
                isChunking: false,
            });
            set((state) => ({ logs: [...state.logs, `[Session Error] ${msg}`] }));
            return null;
        }
    },

    joinSession: async (sessionId: string) => {
        try {
            set({ 
                lastError: null,
                isDownloading: false,
                isChunking: false,
                isTranscribing: false,
            });
            set((state) => ({ logs: [...state.logs, `[Session] Fetching data for session ${sessionId}...`] }));

            // Fetch session state, topics, and transcripts via REST API
            const response = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to load session details.");
            }

            const isAlreadyCompleted = get().completedSessionIds.includes(sessionId) || data.status === "ended" || data.status === "completed" || (data.progress && data.progress >= 100);
            const completedList = get().completedSessionIds;
            const updatedCompletedList = isAlreadyCompleted && !completedList.includes(sessionId) ? [...completedList, sessionId] : completedList;

            const topicsList = data.topics || [];
            const transcriptsList = data.transcripts || [];
            const rawFrames: FrameItem[] = [
                ...(data.frames || []),
            ];
            if (rawFrames.length === 0) {
                topicsList.forEach((t: Topic) => {
                    if (t.frames && Array.isArray(t.frames)) rawFrames.push(...t.frames);
                });
            }

            const frameKeySet = new Set<string>();
            const loadedFrames: FrameItem[] = [];
            rawFrames.forEach(f => {
                const k = `${f.timestamp}_${f.imageUrl}`;
                if (f.imageUrl && !frameKeySet.has(k)) {
                    frameKeySet.add(k);
                    loadedFrames.push(f);
                }
            });

            const lastEnd = transcriptsList.length > 0
                ? Math.max(...transcriptsList.map((t: TranscriptChunkItem) => t.endAt || ((t.chunkIndex !== undefined ? t.chunkIndex + 1 : 0) * 120)))
                : 0;
            const rawStatus = data.status || "paused";
            const finalStatus = isAlreadyCompleted ? "completed" : (rawStatus === "active" ? "paused" : rawStatus);

            const dur = data.duration || 0;
            const progressPct = isAlreadyCompleted ? 100 : (data.progress || 0);
            const savedTime = dur > 0 ? (isAlreadyCompleted ? dur : (progressPct / 100) * dur) : 0;

            set({
                sessionId,
                videoUrl: data.videoUrl,
                videoTitle: data.videoTitle,
                duration: dur,
                currentTime: savedTime,
                playbackProgress: progressPct,
                lastPausedTime: savedTime,
                topics: topicsList,
                transcripts: transcriptsList,
                frames: loadedFrames,
                sessionStatus: finalStatus,
                completedSessionIds: updatedCompletedList,
                isNotesGenerating: false, // Start paused on join/switch to prevent runaway playback
                lastProcessedEndAt: lastEnd,
                pendingNextChunkTriggerTime: null,
                isDownloading: false,
                isChunking: false,
                isTranscribing: false,
            });

            set((state) => ({
                logs: [
                    ...state.logs,
                    `[Session] Loaded session with ${topicsList.length} topics, ${transcriptsList.length} transcript chunks, and ${loadedFrames.length} screenshots.`,
                ],
            }));

            // Connect socket room if session is not ended
            if (!isAlreadyCompleted && data.status !== "ended") {
                get().connectSocket();
                const socket = get().socket;
                if (socket) {
                    socket.emit("session:join", { sessionId });
                }
            }
        } catch (error: any) {
            const msg = error.message || "Error joining session";
            set({ 
                lastError: msg, 
                sessionStatus: "failed",
                isDownloading: false,
                isChunking: false,
            });
            set((state) => ({ logs: [...state.logs, `[Session Error] ${msg}`] }));
        }
    },

    leaveSession: async () => {
        const { sessionId, socket } = get();
        if (!sessionId) return;

        try {
            if (socket) {
                socket.emit("session:leave", { sessionId });
            }
            await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/leave`, { method: "POST" });
        } catch (err) {
            console.error("Error leaving session:", err);
        } finally {
            set({
                sessionId: null,
                sessionStatus: null,
                videoTitle: null,
                videoUrl: null,
                duration: 0,
                currentTime: 0,
                playbackProgress: 0,
                topics: [],
                transcripts: [],
                frames: [],
                isNotesGenerating: false,
                isDownloading: false,
                isChunking: false,
                isTranscribing: false,
                lastPausedTime: 0,
            });
        }
    },

    updateVideoProgress: (currentTime: number) => {
        const { duration, sessionId, sessionStatus, lastProcessedEndAt, isNotesGenerating, isTranscribing, isDownloading, isChunking } = get();
        if (duration <= 0 || !sessionId) return;

        const progressPercent = Math.min(100, Math.max(0, Math.floor((currentTime / duration) * 100)));
        set({ currentTime, playbackProgress: progressPercent });

        // Throttle REST PATCH update to once every 5 seconds
        const now = Date.now();
        if (now - lastProgressUpdateCall > 5000) {
            lastProgressUpdateCall = now;
            fetch(`${BACKEND_URL}/api/sessions/${sessionId}/progress`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ progress: progressPercent }),
            }).catch(() => {});
        }

        // Auto-complete session if video reaches the end
        if (duration > 0 && (currentTime >= duration - 0.5 || progressPercent >= 100)) {
            if (sessionStatus !== "completed") {
                console.log(`[Progress] Video progress reached end (${currentTime}s / ${duration}s). Completing session.`);
                get().completeSession(sessionId);
            }
            return;
        }

        // Paced transcription check - trigger next chunk only when video progress enters that chunk's timeframe
        if (isNotesGenerating && sessionStatus === "active" && !isTranscribing && !isDownloading && !isChunking) {
            if (duration > 0 && lastProcessedEndAt >= duration) {
                return;
            }
            if (currentTime >= lastProcessedEndAt) {
                get().triggerNextChunk();
            }
        }
    },

    updateSessionStatus: async (status) => {
        const { sessionId } = get();
        if (!sessionId) return;

        set({ sessionStatus: status });
        try {
            await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
        } catch (err) {
            console.error("Failed to update status via REST:", err);
        }
    },

    triggerNextChunk: () => {
        const { socket, sessionId, isNotesGenerating, isTranscribing, isDownloading, isChunking, sessionStatus, duration, lastProcessedEndAt } = get();
        if (!socket || !sessionId || !isNotesGenerating || isTranscribing || isDownloading || isChunking || sessionStatus === "completed" || sessionStatus === "failed") {
            return;
        }
        if (duration > 0 && lastProcessedEndAt >= duration) {
            return;
        }

        set({ isTranscribing: true, pendingNextChunkTriggerTime: null });
        socket.emit("transcript:next_chunk");
    },

    checkAndTriggerNextChunkPaced: () => {
        const { currentTime, lastProcessedEndAt, isNotesGenerating, sessionStatus, isTranscribing, isDownloading, isChunking, duration } = get();
        if (!isNotesGenerating || sessionStatus === "completed" || sessionStatus === "failed" || isTranscribing || isDownloading || isChunking) {
            return;
        }
        if (duration > 0 && lastProcessedEndAt >= duration) {
            return;
        }

        if (currentTime >= lastProcessedEndAt) {
            get().triggerNextChunk();
        } else {
            set({ pendingNextChunkTriggerTime: lastProcessedEndAt });
        }
    },

    resetSessionState: () => {
        set({
            sessionId: null,
            videoTitle: null,
            videoUrl: null,
            duration: 0,
            currentTime: 0,
            playbackProgress: 0,
            sessionStatus: null,
            isDownloading: false,
            isChunking: false,
            isTranscribing: false,
            topics: [],
            transcripts: [],
            frames: [],
            logs: [],
            lastError: null,
            isNotesGenerating: false,
            lastProcessedEndAt: 0,
            pendingNextChunkTriggerTime: null,
            lastPausedTime: 0,
        });
    },

    clearError: () => set({ lastError: null }),
    setSidebarOpen: (isOpen: boolean) => set({ isSidebarOpen: isOpen }),
    setSidebarFormOpen: (isOpen: boolean) => set({ isSidebarFormOpen: isOpen }),
    setVideoSpeed: (speed: number) => set({ videoSpeed: speed }),

    startNotesGeneration: () => {
        const { sessionId, sessionStatus } = get();
        if (!sessionId || sessionStatus === "completed" || sessionStatus === "failed") {
            return;
        }

        set({ isNotesGenerating: true, sessionStatus: "active" });
        get().updateSessionStatus("active");

        const { socket } = get();
        if (socket && sessionId) {
            get().checkAndTriggerNextChunkPaced();
        }
    },

    pauseNotesGeneration: (specificPauseTime?: number) => {
        const { sessionId, sessionStatus, currentTime } = get();
        const pauseTime = typeof specificPauseTime === "number" ? specificPauseTime : currentTime;
        set({ 
            isNotesGenerating: false,
            lastPausedTime: pauseTime,
            pendingNextChunkTriggerTime: null,
        });

        if (sessionStatus === "active") {
            set({ sessionStatus: "paused" });
            if (sessionId) {
                get().updateSessionStatus("paused");
            }
        }
    },

    completeSession: async (sessionId: string) => {
        const userId = userStore.getState().user?.userId || "dev-user";
        const completed = get().completedSessionIds;
        let newCompleted = completed;
        if (!completed.includes(sessionId)) {
            newCompleted = [...completed, sessionId];
        }

        set({
            sessionStatus: "completed",
            isNotesGenerating: false,
            playbackProgress: 100,
            completedSessionIds: newCompleted,
        });

        localStorage.setItem(`jenix_completed_sessions_${userId}`, JSON.stringify(newCompleted));

        try {
            await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/end`, { method: "POST" });
        } catch (err) {
            console.error("Failed to end session via REST:", err);
        }
    },
}));

export const useSocketStore = socketStore;