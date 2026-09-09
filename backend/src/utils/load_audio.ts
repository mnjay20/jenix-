import { spawn } from "child_process";

export function cleanYoutubeUrl(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = match && match[2] && match[2].length === 11 ? match[2] : null;
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return url;
}

export function spawnYtdlp(url: string) {
  const cleanUrl = cleanYoutubeUrl(url);
  const child = spawn(
    "yt-dlp",
    [
      "--format",
      "bestaudio[acodec=opus]/bestaudio/best",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      "--no-cookies-from-browser",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "--extractor-args",
      "youtube:player-client=android,web",
      "--output",
      "-",
      cleanUrl,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.on("error", (err) => {
    console.error("Failed to start yt-dlp:", err);
  });

  return child;
}
