import React, { useState } from "react";
import type { TranscriptChunkItem } from "../../store/socketstore";
import { Search, Copy, Check, FileText } from "lucide-react";
import { Button } from "../ui/button";

interface TranscriptRendererProps {
  transcripts: TranscriptChunkItem[];
}

export const TranscriptRenderer: React.FC<TranscriptRendererProps> = ({ transcripts }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyFullTranscript = () => {
    if (transcripts.length === 0) return;
    const fullText = transcripts
      .map(
        (chunk) =>
          `[${formatTimestamp(chunk.startAt)} - ${formatTimestamp(chunk.endAt)}]\n${chunk.text}`
      )
      .join("\n\n");

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTranscripts = transcripts.filter((chunk) =>
    chunk.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (transcripts.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
        <div className="w-12 h-12 rounded-full bg-zinc-900/80 border border-zinc-800/60 flex items-center justify-center mb-3 text-zinc-400">
          <FileText size={20} />
        </div>
        <p className="text-sm font-semibold text-zinc-300">No Transcriptions Yet</p>
        <p className="text-xs text-zinc-500 max-w-xs mt-1">
          Transcription chunks will appear here in real-time as the lecture audio is processed.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header Controls: Search & Copy */}
      <div className="flex items-center gap-2 sticky top-0 bg-theme-charcoal/95 backdrop-blur-md pb-2 z-10 border-b border-zinc-800/40">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/90 border border-zinc-800 text-zinc-200 placeholder-zinc-500 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-theme-accent/50 transition-colors"
          />
        </div>
        <Button
          onClick={handleCopyFullTranscript}
          variant="outline"
          size="xs"
          className="text-xs h-8 px-3 rounded-lg flex items-center gap-1.5 font-medium border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer active:scale-95 transition-all"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>

      {/* Transcript Chunk List */}
      <div className="flex flex-col gap-3">
        {filteredTranscripts.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6">No matching transcript segments found.</p>
        ) : (
          filteredTranscripts.map((chunk) => (
            <div
              key={chunk.chunkIndex}
              className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3.5 flex flex-col gap-2 hover:border-zinc-700/60 transition-all shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-theme-accent/10 border border-theme-accent/20 text-theme-accent">
                  {formatTimestamp(chunk.startAt)} - {formatTimestamp(chunk.endAt)}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Chunk #{chunk.chunkIndex + 1}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap">
                {chunk.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
