# Stage 1: Build TypeScript source
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime container with FFmpeg, Python3, yt-dlp, and Chromium for PDF rendering
FROM node:20-alpine AS runner
WORKDIR /app

# Install FFmpeg, Python3, yt-dlp, and Chromium for Puppeteer PDF generation
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
RUN mkdir -p cache logs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

CMD ["node", "dist/index.js"]
