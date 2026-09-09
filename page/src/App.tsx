import { useEffect } from "react"
import { ControlsBar } from "./components/leftsection/ControlsBar"
import YoutubePlayer from "./components/leftsection/YoutuvePlayer"
import { FeatureSection } from "./components/rightsection/featureSection"
import { Sidebar } from "./components/sidebar/Sidebar"
import { LoginPage } from "./components/loginPage/login"
import { useSocketStore } from "./store/socketstore"
import { useUserStore } from "./store/userStore"
import { VideoOff } from "lucide-react"

function extractVideoId(url: string | null): string {
  if (!url) return "RbAXpZAoQUk";
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : "RbAXpZAoQUk";
  } catch {
    return "RbAXpZAoQUk";
  }
}

function App() {
  const isLoggedIn = useUserStore(state => state.isLoggedIn)
  const { videoUrl, sessionId, isNotesGenerating } = useSocketStore()
  const videoId = extractVideoId(videoUrl)

  useEffect(() => {
    return () => {
      console.log("[App] Component unmounting. Disconnecting socket...");
      useSocketStore.getState().disconnectSocket();
    };
  }, []);

  return (
    <>
      {isLoggedIn ? (
        <div className="h-screen w-screen flex flex-row overflow-hidden bg-theme-charcoal">
          {/* Collapsible sidebar for sessions */}
          <Sidebar />
          {/* Main page content container filling remaining space */}
          <div className="flex-1 flex flex-row h-full overflow-hidden">
            {/* YouTube video player container */}
            <div className="flex h-full flex-col gap-1 w-[65%] bg-theme-plum/20 p-1 border-r border-zinc-800/40 justify-center">
              {sessionId ? (
                <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-zinc-800/60 aspect-video shrink-0 bg-black">
                  <YoutubePlayer key={sessionId} videoId={videoId} className="w-full h-full" />
                  
                  {/* Pointer-blocking Overlay when note generation loop is active */}
                  {isNotesGenerating && (
                    <div className="absolute inset-0 bg-transparent z-30" />
                  )}
                </div>
              ) : (
                <div className="w-full aspect-video rounded-3xl bg-theme-plum/10 border border-zinc-800/40 flex flex-col items-center justify-center p-6 text-center shrink-0">
                  <div className="w-14 h-14 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-850 mb-3 text-zinc-600">
                    <VideoOff size={24} className="text-zinc-500" />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-300">No Lecture Session Loaded</h3>
                  <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-normal">
                    Expand the **Sessions** sidebar and create a new session or click an existing card to load the video and begin note generation.
                  </p>
                </div>
              )}

              {/* Controls bar */}
              <div className="flex-1 overflow-y-auto rounded-2xl">
                <ControlsBar />
              </div>
            </div>

            {/* Main section with feature tabs */}
            <div className="flex flex-col w-[35%] bg-theme-charcoal">
              <FeatureSection />
            </div>
          </div>
        </div>
      ) : (
        <LoginPage />
      )}
    </>
  )
}

export default App
