import fs from "fs";
import { groq } from "../configs/groq.js";
import { logger } from "../utils/logger.js";


export async function transcribeAudio(audioPath: string): Promise<string> {
    try {
        logger.info(`Transcribing audio with Groq STT: ${audioPath}`);
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-large-v3-turbo",
            response_format: "json",
        });

        const text = transcription.text ? transcription.text.trim() : "";
        logger.info(`Groq transcription completed successfully (${text.length} chars)`);
        return text;
    } catch (error) {
        logger.error(`Failed to transcribe audio with Groq for ${audioPath}:`, error);
        throw error;
    }
}
