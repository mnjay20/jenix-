import { useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { useSocketStore } from "../../store/socketstore";
import { 
  Play, Loader2, Terminal, 
  CheckCircle, ShieldAlert, XCircle, Gauge, Clock 
} from "lucide-react";

export const ControlsBar = () => {
  const { 
    currentTime,
    duration,
    sessionStatus, 
    lastError, 
    logs, 
    isDownloading, 
    isChunking, 
    isTranscribing, 
    sessionId,
    isNotesGenerating,
    clearError,
    videoSpeed,
    setVideoSpeed
  } = useSocketStore();

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (time: number) => {
    if (!time || isNaN(time) || time < 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-scroll the system logs terminal to the bottom as new logs arrive
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleButtonClick = () => {
    if (!sessionId || sessionStatus === "failed") {
      console.log("[ControlsBar] No active session. Opening sidebar creation form...");
      useSocketStore.setState({ 
        isSidebarOpen: true, 
        isSidebarFormOpen: true 
      });
      useSocketStore.setState((state) => ({ 
        logs: [...state.logs, "[System] Please enter the video title and URL in the sidebar form on the left to start a new session."] 
      }));
    } else {
      if (isNotesGenerating) {
        console.log("[ControlsBar] Pausing notes generation loop...");
        useSocketStore.getState().pauseNotesGeneration();
      } else {
        console.log("[ControlsBar] Resuming notes generation loop...");
        useSocketStore.getState().startNotesGeneration();
      }
    }
  };

  const getStatusText = () => {
    if (isDownloading) return "Downloading Video Audio...";
    if (isChunking) return "Segmenting Audio Chunks...";
    if (isTranscribing) return "AI Transcription Active...";
    if (sessionStatus === "creating") return "Creating Study Room...";
    if (sessionStatus === "completed") return "Already Generated";
    if (sessionStatus === "failed") return "Extraction Failed";
    if (sessionId) {
      return isNotesGenerating ? "Analysis Loop Active" : "Analysis Loop Paused";
    }
    return "Ready to Analyze";
  };

  const getButtonContent = () => {
    if (isDownloading || isChunking || sessionStatus === "creating") {
      return (
        <>
          <Loader2 size={12} className="animate-spin" />
          <span>Processing</span>
        </>
      );
    }
    if (sessionStatus === "completed") {
      return (
        <>
          <CheckCircle size={12} />
          <span>Already Generated</span>
        </>
      );
    }
    if (sessionId) {
      if (isNotesGenerating) {
        return (
          <>
            <Loader2 size={12} className="animate-spin mr-0.5" />
            <span>Pause AI</span>
          </>
        );
      } else {
        return (
          <>
            <Play size={10} className="fill-current" />
            <span>Resume AI</span>
          </>
        );
      }
    }
    return (
      <>
        <Play size={10} className="fill-current" />
        <span>Generate</span>
      </>
    );
  };

  const isWorking = (isDownloading || isChunking || sessionStatus === "creating" || sessionStatus === "downloading") && sessionStatus !== "active" && sessionStatus !== "paused";
  const isDisabled = isWorking || sessionStatus === "completed";

  return (
    <div className="w-full h-full rounded-2xl bg-theme-plum border border-zinc-800/60 flex flex-col min-h-0 overflow-hidden font-sans">
      
      {/* Video controls & Session status */}
      <div className="w-full h-[32%] bg-theme-charcoal/80 px-4 py-3 border-b border-zinc-800/40 flex items-center justify-between gap-3 shrink-0">
        {/* Simple Video Time Component */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shrink-0">
          <Clock size={13} className="text-theme-accent shrink-0" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider hidden sm:inline">Time</span>
          <span className="text-xs font-mono font-semibold text-zinc-200">
            {formatTime(currentTime)} <span className="text-zinc-500 font-normal">/</span> {formatTime(duration)}
          </span>
        </div>
        
        {/* Video Speed Dropdown Select */}
        <div className="flex items-center gap-1.5 shrink-0 bg-zinc-900/80 px-2.5 py-1 rounded-xl border border-zinc-800/80">
          <Gauge size={13} className="text-theme-accent shrink-0" />
          <label htmlFor="video-speed-select" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider hidden sm:inline">Speed</label>
          <select
            id="video-speed-select"
            value={videoSpeed}
            onChange={(e) => setVideoSpeed(Number(e.target.value))}
            className="bg-theme-plum/50 text-zinc-200 text-xs font-mono font-semibold rounded-lg px-2 py-1 border border-zinc-700/60 focus:outline-none focus:border-theme-accent cursor-pointer hover:bg-zinc-800/80 transition-colors"
          >
            <option value={1} className="bg-zinc-900 text-zinc-200">1x</option>
            <option value={1.25} className="bg-zinc-900 text-zinc-200">1.25x</option>
            <option value={1.5} className="bg-zinc-900 text-zinc-200">1.5x</option>
            <option value={1.75} className="bg-zinc-900 text-zinc-200">1.75x</option>
            <option value={2} className="bg-zinc-900 text-zinc-200">2x</option>
          </select>
        </div>

        {/* Action Button */}
        <div className="w-[20%] min-w-[90px] flex justify-end shrink-0">
          <Button 
            onClick={handleButtonClick}
            isDisabled={isDisabled}
            className={`w-full text-xs font-semibold py-2 h-9 rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer 
              ${isWorking 
                ? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed" 
                : sessionStatus === "completed"
                ? "bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 cursor-not-allowed"
                : "bg-theme-accent hover:bg-theme-hover text-white shadow-theme-accent/20 active:scale-[0.98]"
              }`}
          >
            {getButtonContent()}
          </Button>
        </div>
      </div>

      {/* Video transcript & system logs terminal */}
      <div className="w-full h-[68%] p-3 flex flex-col min-h-0 bg-theme-charcoal/30">
        <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800/40 shrink-0 text-zinc-400">
          <Terminal size={12} className="text-theme-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider">System Execution Logs & State</span>
          <div className="ms-auto flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isNotesGenerating ? "bg-emerald-500 animate-pulse" : isWorking ? "bg-amber-500 animate-pulse" : sessionId ? "bg-zinc-500" : "bg-zinc-600"}`} />
            <span className="text-[9px] font-semibold uppercase font-mono tracking-wider">{getStatusText()}</span>
          </div>
        </div>

        {/* Scrolling Log Area */}
        <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 font-mono text-[10px] text-zinc-400 min-h-0 custom-scrollbar select-text">
          {/* Error Banner inside logs */}
          {lastError && (
            <div className="p-2.5 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl flex items-start gap-2 mb-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1">
                <div className="font-bold text-[9px] uppercase tracking-wider text-red-300">Execution Error</div>
                <p className="mt-0.5 text-[10px] leading-relaxed">{lastError}</p>
              </div>
              <button onClick={clearError} className="text-red-400 hover:text-white cursor-pointer self-start p-0.5">
                <XCircle size={12} />
              </button>
            </div>
          )}

          {logs.length === 0 ? (
            <div className="text-zinc-600 text-center py-8 italic">
              Terminal idle. Click "Generate" to start extracting study notes.
            </div>
          ) : (
            logs.map((log, index) => {
              let colorClass = "text-zinc-400";
              if (log.includes("[Socket]")) colorClass = "text-theme-accent/90";
              else if (log.includes("[Audio]")) colorClass = "text-amber-400/95";
              else if (log.includes("[AI Agent]")) colorClass = "text-theme-accent";
              else if (log.includes("[Error]") || log.includes("[Session Error]")) colorClass = "text-red-400";
              else if (log.includes("[System]")) colorClass = "text-emerald-400 font-semibold";
              
              return (
                <div key={index} className={`leading-relaxed whitespace-pre-wrap ${colorClass}`}>
                  <span className="text-zinc-600 select-none mr-1.5">&gt;</span>
                  {log}
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>

    </div>
  );
};