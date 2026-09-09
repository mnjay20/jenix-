import { spawn } from 'child_process';
import { spawnYtdlp } from './load_audio.js';
import { mkdir, rm } from "fs/promises";
import { getIO } from '../webSockets/server.js';
import { Events } from './events.js';
import { logger } from './logger.js';

function ffmpegSpawn(chunk_size: number, sessionId: string) {
    return spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-f', 'segment',
        '-segment_time', `${chunk_size}`,
        '-c:a', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        `./cache/${sessionId}/%04d.wav`
    ]);
}

export async function audioChunker(url: string, chunk_size: number, sessionId: string) {
    await rm(`cache/${sessionId}`, { recursive: true, force: true });
    await mkdir(`cache/${sessionId}`, { recursive: true });

    const ytdlp = spawnYtdlp(url);
    const ffmpeg = ffmpegSpawn(chunk_size, sessionId);

    ytdlp.stdout.pipe(ffmpeg.stdin);

    ffmpeg.stderr.on("data", (data) => {
        logger.error(`ffmpeg stderr: ${data.toString()}`);
    });

    ytdlp.stderr.on("data", (data) => {
        logger.error(`yt-dlp stderr: ${data.toString()}`);
    });

    const io = getIO();
    const events = Events;

    return new Promise<{ ytdlp: typeof ytdlp, ffmpeg: typeof ffmpeg }>((resolve, reject) => {
        let finished = false;
        let ytdlpClosed = false;
        let ffmpegClosed = false;
        let ytdlpExitCode: number | null = null;
        let ffmpegExitCode: number | null = null;

        const handleError = (err: Error) => {
            if (finished) return;
            finished = true;

            if (ytdlp.exitCode === null && !ytdlp.killed) {
                ytdlp.kill();
            }
            if (ffmpeg.exitCode === null && !ffmpeg.killed) {
                ffmpeg.kill();
            }

            if (io) {
                io.to(sessionId).emit(events.ERROR.GENERAL, {
                    sessionId,
                    error: err.message,
                });
            }

            reject(err);
        };

        const checkCompletion = () => {
            if (finished) return;

            if (ytdlpClosed && ytdlpExitCode !== 0 && ytdlpExitCode !== null) {
                handleError(new Error(`yt-dlp exited with code ${ytdlpExitCode}`));
                return;
            }
            if (ffmpegClosed && ffmpegExitCode !== 0 && ffmpegExitCode !== null) {
                handleError(new Error(`ffmpeg exited with code ${ffmpegExitCode}`));
                return;
            }

            if (ytdlpClosed && ffmpegClosed) {
                finished = true;
                resolve({ ytdlp, ffmpeg });
            }
        };

        ytdlp.on("error", (err) => {
            handleError(new Error(`yt-dlp process error: ${err.message}`));
        });

        ffmpeg.on("error", (err) => {
            handleError(new Error(`ffmpeg process error: ${err.message}`));
        });

        ytdlp.stdout.on("error", (err) => {
            handleError(new Error(`yt-dlp stdout stream error: ${err.message}`));
        });

        ffmpeg.stdin.on("error", (err) => {
            handleError(new Error(`ffmpeg stdin stream error: ${err.message}`));
        });

        ffmpeg.stderr.on("error", (err) => {
            handleError(new Error(`ffmpeg stderr stream error: ${err.message}`));
        });

        ytdlp.stderr.on("error", (err) => {
            handleError(new Error(`yt-dlp stderr stream error: ${err.message}`));
        });

        ytdlp.on("close", (code) => {
            ytdlpClosed = true;
            ytdlpExitCode = code;
            if (code === 0 && !ffmpegClosed) {
                ffmpeg.stdin.end();
            }
            checkCompletion();
        });

        ffmpeg.on("close", (code) => {
            ffmpegClosed = true;
            ffmpegExitCode = code;
            checkCompletion();
        });
    });
}