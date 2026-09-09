import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import dns from 'dns'

dns.setServers(['8.8.8.8', '8.8.4.4'])

import { initSocketServer } from './webSockets/server.js'
import { env } from './utils/env.js'

import { registerSocketHandlers } from './webSockets/connections.js';

import { logger } from './utils/logger.js'
import { convertMdToPdf } from './agents/md_to_pdf_maker.js'

import usersRouter from './routes/users.js';
import sessionsRouter from './routes/sessions.js';
import searchRouter from './routes/search.js';

const app = express()

app.use(cors({
    origin: '*'
}))
app.use(express.json())

// REST API Routes
app.use('/api/users', usersRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/search', searchRouter)

app.post("/download-pdf", async (req, res) => {
    try {
        const { sessionId } = req.body || {}
        if (!sessionId) {
            return res.status(400).json({ error: "sessionId is required" })
        }

        const pdf = await convertMdToPdf(sessionId)
        if (!pdf) {
            return res.status(500).json({ error: "Failed to generate PDF content" })
        }

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'attachment; filename=notes.pdf')
        res.send(pdf)
    } catch (err: any) {
        logger.error("Error in /download-pdf endpoint:", err)
        res.status(500).json({ error: err?.message || "Internal server error generating PDF" })
    }
})

const httpServer = createServer(app)


initSocketServer(httpServer)
registerSocketHandlers()

httpServer.listen(env.PORT, () => {
    logger.info(`server is listening on port ${env.PORT}`)
})

