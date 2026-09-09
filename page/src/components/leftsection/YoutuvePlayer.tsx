import { useState, useRef, useEffect } from 'react';
import YouTube, { type YouTubeProps } from 'react-youtube';
import { useSocketStore } from '../../store/socketstore';

export interface YoutubePlayerProps {
    videoId?: string;
    onReady?: (event: any) => void;
    onPlay?: (event: any) => void;
    onPause?: (event: any) => void;
    onStateChange?: (event: any) => void;
    className?: string;
}

export function YoutubePlayer({
    videoId = 'dQw4w9WgXcQ', // default placeholder video ID
    onReady,
    onPlay,
    onPause,
    onStateChange,
    className = '',
}: YoutubePlayerProps) {
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const playerRef = useRef<any>(null);
    const intervalRef = useRef<number | null>(null);

    const isNotesGenerating = useSocketStore(state => state.isNotesGenerating);
    const isDownloading = useSocketStore(state => state.isDownloading);
    const isChunking = useSocketStore(state => state.isChunking);
    const lastPausedTime = useSocketStore(state => state.lastPausedTime);
    const sessionId = useSocketStore(state => state.sessionId);
    const videoSpeed = useSocketStore(state => state.videoSpeed);

    // When videoId/sessionId changes, reset player state to paused
    useEffect(() => {
        setIsPlaying(false);
        if (playerRef.current) {
            try {
                playerRef.current.pauseVideo();
            } catch (e) {}
        }
    }, [videoId, sessionId]);

    // Sync playback speed rate with YouTube player whenever videoSpeed changes
    useEffect(() => {
        if (!playerRef.current) return;
        try {
            if (typeof playerRef.current.setPlaybackRate === 'function') {
                playerRef.current.setPlaybackRate(videoSpeed);
            }
        } catch (e) {
            console.error("[Player] Error setting playback rate:", e);
        }
    }, [videoSpeed]);

    // Sync play/pause of the player when the ControlsBar button toggles isNotesGenerating
    useEffect(() => {
        if (!playerRef.current) return;
        try {
            if (isNotesGenerating && !isDownloading && !isChunking) {
                // If user sought backward or forward while paused, restore to where they left off for consistent study progress
                const currentPos = playerRef.current.getCurrentTime() || 0;
                if (lastPausedTime !== null && lastPausedTime > 0 && Math.abs(currentPos - lastPausedTime) > 1.5) {
                    console.log(`[Player] Resuming notes generation: restoring seek from ${currentPos}s to paused study timestamp ${lastPausedTime}s`);
                    playerRef.current.seekTo(lastPausedTime, true);
                    setCurrentTime(lastPausedTime);
                }
                playerRef.current.playVideo();
                setIsPlaying(true);
            } else if (!isNotesGenerating) {
                playerRef.current.pauseVideo();
                setIsPlaying(false);
            }
        } catch (e) {
            console.error("[Player] Error syncing playback with notes generation status:", e);
        }
    }, [isNotesGenerating, isDownloading, isChunking]);

    // onReady handler
    const handleReady = (event: any) => {
        playerRef.current = event.target;
        const dur = event.target.getDuration() || 0;
        setDuration(dur);
        useSocketStore.setState({ duration: dur });

        // Apply selected playback speed to the player
        try {
            if (typeof event.target.setPlaybackRate === 'function') {
                event.target.setPlaybackRate(videoSpeed);
            }
        } catch (e) {}

        // Seek to the saved progress of this specific session
        const { playbackProgress, sessionStatus } = useSocketStore.getState();
        if ((playbackProgress >= 100 || sessionStatus === 'completed') && dur > 0) {
            console.log(`[Player] Seeking to completed session duration: ${dur}s`);
            event.target.seekTo(dur, true);
            setCurrentTime(dur);
        } else if (playbackProgress > 0 && dur > 0) {
            const targetTime = (playbackProgress / 100) * dur;
            console.log(`[Player] Seeking to saved session progress: ${playbackProgress}% (${targetTime}s)`);
            event.target.seekTo(targetTime, true);
            setCurrentTime(targetTime);
        } else {
            event.target.seekTo(0, true);
            setCurrentTime(0);
        }
        
        // Ensure video is strictly paused until user plays it
        try {
            event.target.pauseVideo();
            setIsPlaying(false);
        } catch (e) {}

        if (onReady) {
            onReady(event);
        }
    };

    // onPlay handler - fires when video is played from the YouTube player UI
    const handlePlay = (event: any) => {
        setIsPlaying(true);
        if (playerRef.current) {
            const currentPos = playerRef.current.getCurrentTime() || 0;
            const { lastPausedTime, isNotesGenerating, startNotesGeneration, sessionStatus } = useSocketStore.getState();

            // Do not restrict seeking or force start notes loop if session is already completed
            if (sessionStatus !== 'completed') {
                if (lastPausedTime !== null && lastPausedTime > 0 && Math.abs(currentPos - lastPausedTime) > 1.5) {
                    console.log(`[Player] Seeking back from seeked timestamp ${currentPos}s to study timestamp ${lastPausedTime}s`);
                    playerRef.current.seekTo(lastPausedTime, true);
                    setCurrentTime(lastPausedTime);
                }

                // Keep notes generation in sync with video play
                if (!isNotesGenerating) {
                    startNotesGeneration();
                }
            }
        }

        if (onPlay) {
            onPlay(event);
        }
    };

    // onPause handler - fires when video is paused from the YouTube player UI
    const handlePause = (event: any) => {
        setIsPlaying(false);
        const pauseTime = playerRef.current ? playerRef.current.getCurrentTime() : currentTime;
        const { isNotesGenerating, pauseNotesGeneration } = useSocketStore.getState();

        // Keep notes generation in sync with video pause
        if (isNotesGenerating) {
            pauseNotesGeneration(pauseTime);
        } else {
            useSocketStore.setState({ lastPausedTime: pauseTime });
            useSocketStore.getState().updateSessionStatus("paused");
        }

        if (onPause) {
            onPause(event);
        }
    };

    // onEnd handler - triggers session completion
    const handleEnd = () => {
        const { sessionId, completeSession } = useSocketStore.getState();
        if (sessionId) {
            console.log("[Player] Video playback ended. Marking session completed:", sessionId);
            completeSession(sessionId);
        }
    };

    // State Change handler
    const handleStateChange = (event: any) => {
        if (onStateChange) {
            onStateChange(event);
        }
    };

    // Effect to update current time when playing
    useEffect(() => {
        if (isPlaying) {
            intervalRef.current = window.setInterval(() => {
                if (playerRef.current) {
                    const time = playerRef.current.getCurrentTime();
                    setCurrentTime(time);
                    // Sync video progress with Zustand store & backend
                    useSocketStore.getState().updateVideoProgress(time);
                }
            }, 1000);
        } else {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
            }
        };
    }, [isPlaying]);

    // Format helper for display
    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const opts: YouTubeProps['opts'] = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            origin: window.location.origin,
        },
    };

    return (
        <div className={`relative w-full h-full flex flex-col bg-zinc-950 overflow-hidden ${className}`}>
            {/* YouTube Player Container */}
            <div className="relative flex-1 w-full h-full">
                <YouTube
                    videoId={videoId}
                    opts={opts}
                    onReady={handleReady}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnd={handleEnd}
                    onStateChange={handleStateChange}
                    className="w-full h-full"
                    iframeClassName="w-full h-full border-0"
                />
            </div>

            {/* Micro time info indicator overlay */}
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 border border-zinc-800 pointer-events-none z-10 flex gap-1">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
            </div>
        </div>
    );
}

export default YoutubePlayer;
