import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useSocketStore } from "../../store/socketstore";
import { NotesRenderer } from "./NotesRenderer";
import { TranscriptRenderer } from "./TranscriptRenderer";
import { ScreenshotsRenderer } from "./ScreenshotsRenderer";
import { NotesQueryChat } from "./NotesQueryChat";
import { Button } from "../ui/button";
import { Download, Loader2, MessageSquare } from "lucide-react";

export const FeatureSection = () => {
  const topics = useSocketStore(state => state.topics);
  const transcripts = useSocketStore(state => state.transcripts);
  const frames = useSocketStore(state => state.frames);
  const sessionStatus = useSocketStore(state => state.sessionStatus);
  const sessionId = useSocketStore(state => state.sessionId);
  const title = useSocketStore(state => state.videoTitle);
  const isDownloading = useSocketStore(state => state.isDownloading);
  const isChunking = useSocketStore(state => state.isChunking);
  const isTranscribing = useSocketStore(state => state.isTranscribing);
  const isNotesGenerating = useSocketStore(state => state.isNotesGenerating);

  const isCompleted = sessionStatus === "completed";
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const isGenerating = isDownloading || isChunking || isTranscribing || (isNotesGenerating && (sessionStatus === "active" || sessionStatus === "creating" || sessionStatus === "downloading" || sessionStatus === "transcribing"));

  const getGenerationStatus = () => {
    if (isDownloading) return "Downloading Video Audio...";
    if (isChunking) return "Segmenting Audio...";
    if (isTranscribing) return "Transcribing & Structuring Notes...";
    if (sessionStatus === "creating") return "Initializing Session...";
    return "Generating Notes...";
  };

  const handleDownloadPDF = async () => {
    if (!sessionId) {
      console.warn("Cannot download PDF: No active session ID found.");
      return;
    }

    try {
      setIsDownloadingPdf(true);
      const response = await fetch(`http://localhost:3000/download-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned error ${response.status}`);
      }

      const data = await response.blob();
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      
      const sanitizedTitle = title ? title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() : 'study_notes';
      a.download = `${sanitizedTitle || 'study_notes'}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Download PDF Error]:", err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="w-full h-full bg-theme-charcoal flex flex-col">
      <Tabs defaultSelectedKey="notes" className="w-full h-full flex flex-col">
        <TabsList className="w-full bg-theme-plum/60 border-b border-zinc-800/60 rounded-none h-12 flex items-center justify-around px-2 shrink-0">
          <TabsTrigger
            id="notes"
            className="text-zinc-400 hover:text-zinc-100 data-[state=active]:text-theme-accent data-[state=active]:border-b-2 data-[state=active]:border-theme-accent rounded-none bg-transparent h-full px-4 text-xs font-semibold cursor-pointer transition-all"
          >
            Notes
          </TabsTrigger>
          <TabsTrigger
            id="qa"
            className="text-zinc-400 hover:text-zinc-100 data-[state=active]:text-theme-accent data-[state=active]:border-b-2 data-[state=active]:border-theme-accent rounded-none bg-transparent h-full px-4 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
          >
            <MessageSquare size={13} className="text-theme-accent" />
            <span>Notes Q&A</span>
          </TabsTrigger>
          <TabsTrigger
            id="screenshots"
            className="text-zinc-400 hover:text-zinc-100 data-[state=active]:text-theme-accent data-[state=active]:border-b-2 data-[state=active]:border-theme-accent rounded-none bg-transparent h-full px-4 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
          >
            <span>Screenshots</span>
            {frames && frames.length > 0 && (
              <span className="bg-theme-plum/60 text-theme-accent text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                {frames.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            id="transcript"
            className="text-zinc-400 hover:text-zinc-100 data-[state=active]:text-theme-accent data-[state=active]:border-b-2 data-[state=active]:border-theme-accent rounded-none bg-transparent h-full px-4 text-xs font-semibold cursor-pointer transition-all"
          >
            Transcript
          </TabsTrigger>
          <TabsTrigger
            id="quiz"
            isDisabled
            className="text-zinc-600 cursor-not-allowed opacity-50 rounded-none bg-transparent h-full px-4 text-xs font-semibold"
          >
            Quiz
          </TabsTrigger>
        </TabsList>

        <TabsContent id="notes" className="flex-grow flex-1 min-h-0 bg-theme-charcoal">
          <Card className="w-full h-full border-0 bg-transparent rounded-none flex flex-col shadow-none">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/30 shrink-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">Study Session Notes</CardTitle>
              <CardAction>
                <Button
                  isDisabled={!isCompleted || isDownloadingPdf}
                  onClick={handleDownloadPDF}
                  variant="outline"
                  size="xs"
                  className={`text-[10px] h-7 px-2.5 rounded-lg flex items-center gap-1.5 font-semibold transition-all border
                    ${!isCompleted || isDownloadingPdf
                      ? "bg-zinc-900/50 border-zinc-800/60 text-zinc-600 cursor-not-allowed opacity-50"
                      : "bg-theme-accent/10 border-theme-accent/30 text-theme-accent hover:bg-theme-accent/25 hover:text-white cursor-pointer active:scale-95"
                    }`}
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download size={12} />
                      <span>Download PDF</span>
                    </>
                  )}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
              <NotesRenderer 
                topics={topics} 
                isGenerating={isGenerating} 
                generationStatus={getGenerationStatus()} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent id="qa" className="flex-grow flex-1 min-h-0 bg-theme-charcoal">
          <NotesQueryChat />
        </TabsContent>

        <TabsContent id="screenshots" className="flex-grow flex-1 min-h-0 bg-theme-charcoal">
          <Card className="w-full h-full border-0 bg-transparent rounded-none flex flex-col shadow-none">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/30 shrink-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">Lecture Video Screenshots</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
              <ScreenshotsRenderer 
                frames={frames}
                isGenerating={isGenerating}
                generationStatus={getGenerationStatus()}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent id="transcript" className="flex-grow flex-1 min-h-0 bg-theme-charcoal">
          <Card className="w-full h-full border-0 bg-transparent rounded-none flex flex-col shadow-none">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/30 shrink-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">Audio Transcription</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
              <TranscriptRenderer transcripts={transcripts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent id="quiz" className="flex-grow bg-theme-charcoal/20 p-4 text-xs text-zinc-500">
          Quizzes are currently locked for this session.
        </TabsContent>
      </Tabs>
    </div>
  );
};


