import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, FolderPlus, Video, X, Loader2, CheckCircle2, LogOut } from "lucide-react";
import { useSocketStore } from "../../store/socketstore";
import { useUserStore } from "../../store/userStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const getYoutubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
};

let ytApiPromise: Promise<void> | null = null;

const injectYouTubeAPI = (): Promise<void> => {
    if ((window as any).YT && (window as any).YT.Player) {
        return Promise.resolve();
    }
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve) => {
        const previousOnReady = (window as any).onYouTubeIframeAPIReady;
        (window as any).onYouTubeIframeAPIReady = () => {
            if (previousOnReady) previousOnReady();
            resolve();
        };

        const existingScript = document.getElementById("youtube-iframe-api-script");
        if (!existingScript) {
            const tag = document.createElement("script");
            tag.id = "youtube-iframe-api-script";
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName("script")[0];
            if (firstScriptTag && firstScriptTag.parentNode) {
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            } else {
                document.head.appendChild(tag);
            }
        }
    });

    return ytApiPromise;
};

const fetchYoutubeDuration = async (videoId: string): Promise<number> => {
    await injectYouTubeAPI();

    return new Promise((resolve, reject) => {
        const tempDiv = document.createElement("div");
        tempDiv.id = `temp-yt-player-${Date.now()}`;
        tempDiv.style.position = "absolute";
        tempDiv.style.top = "-9999px";
        tempDiv.style.left = "-9999px";
        tempDiv.style.width = "0px";
        tempDiv.style.height = "0px";
        tempDiv.style.opacity = "0";
        tempDiv.style.pointerEvents = "none";
        document.body.appendChild(tempDiv);

        let player: any = null;
        let checkInterval: any = null;

        const cleanup = () => {
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            if (player && typeof player.destroy === "function") {
                try {
                    player.destroy();
                } catch (e) {
                    console.error("[Sidebar] Error destroying temporary YouTube player:", e);
                }
            }
            if (tempDiv.parentNode) {
                tempDiv.parentNode.removeChild(tempDiv);
            }
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Timeout: Failed to fetch video duration. Please make sure the video is embeddable and public."));
        }, 15000);

        try {
            player = new (window as any).YT.Player(tempDiv.id, {
                videoId: videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                },
                events: {
                    onReady: (event: any) => {
                        let attempts = 0;
                        checkInterval = setInterval(() => {
                            attempts++;
                            try {
                                const duration = event.target.getDuration();
                                if (duration && duration > 0) {
                                    clearTimeout(timeoutId);
                                    cleanup();
                                    resolve(Math.round(duration));
                                } else if (attempts > 50) {
                                    clearTimeout(timeoutId);
                                    cleanup();
                                    reject(new Error("Unable to retrieve duration from video player."));
                                }
                            } catch (err) {
                                clearTimeout(timeoutId);
                                cleanup();
                                reject(err);
                            }
                        }, 100);
                    },
                    onError: (event: any) => {
                        clearTimeout(timeoutId);
                        cleanup();
                        reject(new Error(`YouTube Player API error: ${event.data}`));
                    }
                }
            });
        } catch (err) {
            clearTimeout(timeoutId);
            cleanup();
            reject(err);
        }
    });
};

export const Sidebar = () => {
    const [title, setTitle] = useState("");
    const [videoUrl, setVideoUrl] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const { 
        sessions, 
        sessionId: activeSessionId, 
        completedSessionIds, 
        createSession, 
        changeSession,
        isSidebarOpen: isOpen,
        setSidebarOpen: setIsOpen,
        isSidebarFormOpen: showForm,
        setSidebarFormOpen: setShowForm
    } = useSocketStore();
    const user = useUserStore(state => state.user);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !videoUrl.trim()) return;

        setIsCreating(true);
        setFormError(null);

        try {
            const userId = user?.userId || "dev-user";
            console.log("[Sidebar] Submitting session creation:", { userId, title, videoUrl });
            
            const videoId = getYoutubeVideoId(videoUrl.trim());
            if (!videoId) {
                throw new Error("Invalid YouTube URL. Please provide a valid YouTube video URL.");
            }

            const duration = await fetchYoutubeDuration(videoId);
            console.log("[Sidebar] Fetched video duration:", duration);

            const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const resultSessionId = await createSession(userId, title.trim(), cleanUrl, duration);
            
            if (resultSessionId) {
                // Clear fields & close form on success
                setTitle("");
                setVideoUrl("");
                setShowForm(false);
            } else {
                setFormError("Failed to create session on server.");
            }
        } catch (err: any) {
            setFormError(err.message || "An unexpected error occurred.");
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className={`relative h-full flex-shrink-0 z-40 select-none transition-all duration-300 ease-in-out ${isOpen ? "w-64" : "w-14"}`}>
            <div className={`absolute left-0 top-0 h-full bg-zinc-950/95 backdrop-blur-md transition-all duration-300 ease-in-out flex flex-col shadow-2xl ${isOpen ? "w-64 border-r border-zinc-800/80" : "w-14 border-r border-zinc-800/80"}`}>
                
                {/* Toggle Handle */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="absolute top-4 right-3 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 shadow-md transition-all duration-300 cursor-pointer"
                    title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>

                {/* Collapsed Create Button */}
                {!isOpen && (
                    <button
                        onClick={() => {
                            setIsOpen(true);
                            setShowForm(true);
                        }}
                        className="absolute top-16 right-3 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-theme-accent hover:text-theme-hover hover:bg-theme-plum/40 shadow-md transition-all duration-300 cursor-pointer"
                        title="New Session"
                    >
                        <Plus size={16} />
                    </button>
                )}

                {/* Content wrapper */}
                <div className={`h-full w-64 flex flex-col overflow-hidden transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                    
                    {/* Header */}
                    <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between shrink-0">
                        <h2 className="text-sm font-semibold text-zinc-100 tracking-wide">Sessions</h2>
                        {!showForm && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="text-theme-accent hover:text-theme-hover hover:bg-theme-plum/40 p-1.5 rounded-lg transition-colors cursor-pointer"
                                title="New Session"
                            >
                                <Plus size={16} />
                            </button>
                        )}
                    </div>

                    {/* Scrolling Section */}
                    <div className="flex-grow overflow-y-auto p-3 space-y-4 custom-scrollbar">
                        
                        {/* New Session Form */}
                        {showForm && (
                            <form onSubmit={handleSubmit} className="p-3 bg-theme-plum border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex justify-between items-center pb-1.5 border-b border-zinc-850">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
                                        <FolderPlus size={12} />
                                        <span>New Study Session</span>
                                    </span>
                                    <button 
                                        type="button" 
                                        onClick={() => { setShowForm(false); setFormError(null); }}
                                        className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>

                                {formError && (
                                    <div className="p-2 text-[9px] bg-red-950/40 border border-red-900/40 text-red-400 rounded-lg">
                                        {formError}
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Video Title</label>
                                    <Input 
                                        type="text"
                                        placeholder="e.g. Intro to Binary Search"
                                        required
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        disabled={isCreating}
                                        className="h-7 text-xs text-zinc-100 bg-zinc-950 border-zinc-850 focus-visible:border-theme-accent py-1 placeholder:text-zinc-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">YouTube URL</label>
                                    <Input 
                                        type="url"
                                        placeholder="https://www.youtube.com/..."
                                        required
                                        value={videoUrl}
                                        onChange={(e) => setVideoUrl(e.target.value)}
                                        disabled={isCreating}
                                        className="h-7 text-xs text-zinc-100 bg-zinc-950 border-zinc-850 focus-visible:border-theme-accent py-1 placeholder:text-zinc-500"
                                    />
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <Button 
                                        type="submit"
                                        isDisabled={isCreating}
                                        className="flex-grow bg-theme-accent hover:bg-theme-hover text-white text-[10px] font-bold py-1 h-7 rounded-lg cursor-pointer"
                                    >
                                        {isCreating ? <Loader2 size={10} className="animate-spin mr-1" /> : null}
                                        Create
                                    </Button>
                                    <Button 
                                        type="button"
                                        isDisabled={isCreating}
                                        onClick={() => { setShowForm(false); setFormError(null); }}
                                        variant="outline"
                                        className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold py-1 h-7 rounded-lg cursor-pointer"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Sessions Stack */}
                        <div className="space-y-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                                Saved Sessions ({sessions.length})
                            </span>
                            
                            {sessions.length === 0 ? (
                                <div className="text-center py-10 text-[10px] text-zinc-600 italic">
                                    No sessions saved yet.<br />Click the plus icon to add one!
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {sessions.map((session) => {
                                        const isActive = session.sessionId === activeSessionId;
                                        const isCompleted = completedSessionIds.includes(session.sessionId);
                                        return (
                                            <div
                                                key={session.sessionId}
                                                onClick={() => {
                                                    console.log("[Sidebar] Switching to session:", session.sessionId);
                                                    changeSession(session.sessionId);
                                                }}
                                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all hover:bg-zinc-900 group relative overflow-hidden
                                                    ${isActive 
                                                        ? "bg-theme-plum border-theme-accent/80 shadow-md shadow-theme-plum/20" 
                                                        : "bg-theme-plum/40 border-zinc-800/60 hover:border-zinc-700"
                                                    }`}
                                            >
                                                {/* Left Accent indicator for active card */}
                                                {isActive && (
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-theme-accent" />
                                                )}

                                                <div className="flex items-start gap-2.5">
                                                    <Video size={14} className={`shrink-0 mt-0.5 ${isActive ? "text-theme-accent" : "text-zinc-500 group-hover:text-zinc-400"}`} />
                                                    <div className="flex-1 min-w-0 space-y-0.5">
                                                        <div className="flex items-center justify-between gap-1.5">
                                                            <h4 className={`text-xs font-bold truncate leading-snug ${isActive ? "text-zinc-100" : "text-zinc-300 group-hover:text-white"}`}>
                                                                {session.title}
                                                            </h4>
                                                            {isCompleted && (
                                                                <span title="Completed Session" className="shrink-0 flex items-center">
                                                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[9px] font-mono text-zinc-500 truncate leading-none">
                                                            {session.url}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-zinc-800/60 flex items-center justify-between shrink-0 text-zinc-500 text-[10px]">
                        <div className="flex items-center gap-1.5 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="truncate max-w-[120px]" title={user?.userId || "Guest"}>
                                {user?.userId || "Guest"}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                console.log("[Sidebar] Logging out user...");
                                useUserStore.getState().logout();
                                useSocketStore.getState().disconnectSocket();
                                useSocketStore.getState().resetSessionState();
                            }}
                            className="flex items-center gap-1 text-zinc-500 hover:text-red-400 font-semibold cursor-pointer transition-colors"
                            title="Logout"
                        >
                            <LogOut size={11} />
                            <span>Logout</span>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};