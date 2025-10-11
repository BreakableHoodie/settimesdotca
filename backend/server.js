import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import compression from 'compression'
import helmet from 'helmet'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}))
app.use(compression())
app.use(express.json())

// Serve static files from frontend build
const staticPath = join(__dirname, 'public')
app.use(express.static(staticPath))

// API routes (placeholder for future expansion)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(staticPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Serving static files from: ${staticPath}`)
})
