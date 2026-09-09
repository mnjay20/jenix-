# Stage 1: Build TypeScript source
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime image with FFmpeg and yt-dlp
FROM node:20-alpine AS runner
WORKDIR /app

# Install FFmpeg, Python3, and yt-dlp executable
RUN apk add --no-cache ffmpeg python3 py3-pip curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

CMD ["node", "dist/index.js"]
