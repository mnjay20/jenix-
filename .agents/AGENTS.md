# Workspace Rules - Jenix AI

When editing the Jenix AI codebase, follow the frontend architecture design system and guidelines documented in:
- [frontend/agents.md](file:///c:/Users/dell/OneDrive/Desktop/study%20extension/frontend/agents.md)
- [study_extension_builder_guide.md](file:///C:/Users/dell/.gemini/antigravity-ide/brain/4756ac21-bd8c-4976-b230-0ac8ff4b4f18/study_extension_builder_guide.md)

## Development Constraints
1. **State Management**: Use Zustand store (`src/store/socketStore.ts`) and `chrome.storage.local` listeners for React components. Do not introduce Redux, MobX, or prop drilling.
2. **Styling**: Use Tailwind CSS v4, custom theme variables, and shadcn/ui components. Maintain the dark-themed obsidian aesthetics (`#0C0A12` and `#13111C`).
3. **No Client-Side Frame Capture**: Video frame capture is handled on the server side using `yt-dlp` and `ffmpeg` direct streaming. Do not write canvas capturing or tab capture code in the client-side extension components.
4. **WebSocket Flow**: Maintain the paced transcription loop where the frontend triggers the next chunk upon receiving notes.
