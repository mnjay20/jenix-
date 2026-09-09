import React, { useState } from 'react';
import type { FrameItem } from '../../store/socketstore';
import { 
    Download, Image as ImageIcon, Check, ExternalLink, Sparkles, Eye, X 
} from 'lucide-react';
import { Button } from '../ui/button';
import { GhostLoader } from './GhostLoader';

interface ScreenshotsRendererProps {
    frames: FrameItem[];
    isGenerating?: boolean;
    generationStatus?: string;
}

export const ScreenshotsRenderer: React.FC<ScreenshotsRendererProps> = ({
    frames,
    isGenerating = false,
    generationStatus
}) => {
    const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
    const [previewImage, setPreviewImage] = useState<{ url: string; timestamp?: number; caption?: string } | null>(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);

    const formatTimestamp = (sec?: number) => {
        if (sec === undefined || isNaN(sec)) return "00:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const handleDownloadSingle = async (url: string, timestamp?: number) => {
        const key = `${timestamp}_${url.slice(0, 20)}`;
        const filename = `screenshot_${timestamp !== undefined ? `${timestamp}s` : 'frame'}.jpg`;

        try {
            if (url.startsWith('data:')) {
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            }

            setDownloadedMap((prev) => ({ ...prev, [key]: true }));
            setTimeout(() => {
                setDownloadedMap((prev) => ({ ...prev, [key]: false }));
            }, 2000);
        } catch (err) {
            console.error("Failed to download frame:", err);
            window.open(url, '_blank');
        }
    };

    const handleDownloadAll = async () => {
        if (frames.length === 0 || isDownloadingAll) return;
        setIsDownloadingAll(true);

        try {
            for (let i = 0; i < frames.length; i++) {
                const f = frames[i];
                await handleDownloadSingle(f.imageUrl, f.timestamp);
                // Slight delay to prevent browser download throttling
                await new Promise((res) => setTimeout(res, 200));
            }
        } finally {
            setIsDownloadingAll(false);
        }
    };

    if (!frames || frames.length === 0) {
        if (isGenerating) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] h-full text-center p-6 font-sans">
                    <GhostLoader 
                        label={generationStatus || "Capturing Video Screenshots..."} 
                        sublabel="Extracting high-resolution visual frames from lecture stream"
                    />
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-zinc-500 font-sans">
                <ImageIcon size={36} className="mb-2 text-zinc-600 opacity-60 animate-pulse" />
                <p className="text-sm font-semibold">No screenshots captured yet</p>
                <p className="text-xs text-zinc-600 max-w-xs mt-1">
                    Play the video or start note generation to automatically extract visual frames and whiteboard slides.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-20 custom-scrollbar select-text overflow-y-auto max-h-[85vh] pr-2">
            {/* Header info & batch download bar */}
            <div className="flex items-center justify-between px-2 py-2 bg-theme-plum/15 border border-zinc-800/60 rounded-xl">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-theme-accent" />
                    <span className="text-xs font-semibold text-zinc-200">
                        {frames.length} {frames.length === 1 ? 'Screenshot' : 'Screenshots'} Captured
                    </span>
                </div>
                <Button
                    onClick={handleDownloadAll}
                    isDisabled={isDownloadingAll}
                    variant="outline"
                    size="xs"
                    className="text-[10px] h-7 px-2.5 rounded-lg flex items-center gap-1.5 font-semibold transition-all border bg-theme-accent/10 border-theme-accent/30 text-theme-accent hover:bg-theme-accent/25 hover:text-white cursor-pointer active:scale-95"
                >
                    <Download size={12} />
                    <span>{isDownloadingAll ? "Downloading..." : "Download All"}</span>
                </Button>
            </div>

            {/* Screenshots grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {frames.map((frame, idx) => {
                    const key = `${frame.timestamp}_${frame.imageUrl.slice(0, 20)}`;
                    const isDownloaded = !!downloadedMap[key];
                    const tsFormatted = formatTimestamp(frame.timestamp);

                    return (
                        <div 
                            key={idx}
                            className="border border-zinc-800/80 bg-zinc-950/70 rounded-xl overflow-hidden shadow-md flex flex-col justify-between transition-all hover:border-zinc-700/90 group"
                        >
                            {/* Card Top Banner */}
                            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800/60 text-[10px] text-zinc-400">
                                <div className="flex items-center gap-1.5 font-mono">
                                    <span className="bg-theme-plum/40 text-theme-accent px-1.5 py-0.5 rounded font-semibold text-[9px]">
                                        {tsFormatted}
                                    </span>
                                    <span className="text-zinc-500 text-[9px] truncate max-w-[120px]">
                                        {frame.caption || `Segment Frame #${idx + 1}`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPreviewImage({ url: frame.imageUrl, timestamp: frame.timestamp, caption: frame.caption })}
                                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                                        title="Preview Fullscreen"
                                    >
                                        <Eye size={11} />
                                    </button>
                                    <button
                                        onClick={() => handleDownloadSingle(frame.imageUrl, frame.timestamp)}
                                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1 cursor-pointer"
                                        title="Download Screenshot"
                                    >
                                        {isDownloaded ? <Check size={11} className="text-emerald-400" /> : <Download size={11} />}
                                    </button>
                                    <a
                                        href={frame.imageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                                        title="Open in new tab"
                                    >
                                        <ExternalLink size={11} />
                                    </a>
                                </div>
                            </div>

                            {/* Image Container */}
                            <div 
                                className="relative bg-zinc-950/40 p-1 flex items-center justify-center cursor-pointer overflow-hidden"
                                onClick={() => setPreviewImage({ url: frame.imageUrl, timestamp: frame.timestamp, caption: frame.caption })}
                            >
                                <img
                                    src={frame.imageUrl}
                                    alt={frame.caption || `Screenshot at ${tsFormatted}`}
                                    className="w-full h-36 object-contain rounded-lg group-hover:scale-[1.02] transition-transform duration-200"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {isGenerating && (
                <div className="pt-4 border-t border-zinc-800/40">
                    <div className="bg-theme-plum/20 border border-zinc-800/60 rounded-2xl p-4 flex flex-col items-center justify-center backdrop-blur-sm">
                        <GhostLoader 
                            compact 
                            label="Extracting Next Video Frames..." 
                            sublabel="Capturing visual slide content for incoming segment"
                        />
                    </div>
                </div>
            )}

            {/* Fullscreen Preview Lightbox Modal */}
            {previewImage && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4">
                    <div className="relative max-w-4xl w-full bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
                            <div className="flex items-center gap-2">
                                <ImageIcon size={14} className="text-theme-accent" />
                                <span className="text-xs font-semibold text-zinc-200">
                                    {previewImage.caption || `Screenshot at ${formatTimestamp(previewImage.timestamp)}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => handleDownloadSingle(previewImage.url, previewImage.timestamp)}
                                    size="xs"
                                    variant="outline"
                                    className="text-[10px] h-7 px-2 bg-theme-accent/15 border-theme-accent/30 text-theme-accent hover:bg-theme-accent/30 flex items-center gap-1 cursor-pointer"
                                >
                                    <Download size={11} />
                                    <span>Download</span>
                                </Button>
                                <button
                                    onClick={() => setPreviewImage(null)}
                                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="p-3 flex items-center justify-center bg-black/50 max-h-[75vh] overflow-auto">
                            <img
                                src={previewImage.url}
                                alt="Full preview"
                                className="max-h-[70vh] w-auto object-contain rounded-lg"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
