import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI, { toFile } from 'openai'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3001)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))
})

app.use(cors({ origin: ['http://localhost:5174', 'http://127.0.0.1:5174'] }))
app.use(express.json({ limit: '1mb' }))

function client() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('服务端尚未配置 OPENAI_API_KEY')
    error.status = 503
    throw error
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const sizes = { '1:1': '1024x1024', '4:3': '1536x1024', '16:9': '1536x1024', '3:4': '1024x1536', '9:16': '1024x1536' }
const options = body => ({
  model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  prompt: body.prompt.trim(),
  size: sizes[body.ratio] || '1024x1024',
  n: Math.min(4, Math.max(1, Number(body.count) || 1)),
  output_format: 'png'
})
const images = result => result.data.map(item => `data:image/png;base64,${item.b64_json}`)
const mockEnabled = process.env.MOCK_OPENAI === 'true'
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
function mockImages(body) {
  const count = Math.min(4, Math.max(1, Number(body.count) || 1))
  const [width, height] = (sizes[body.ratio] || '1024x1024').split('x').map(Number)
  const title = escapeXml(body.prompt.trim().slice(0, 36))
  return Array.from({ length: count }, (_, index) => {
    const hue = (255 + index * 47) % 360
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 70% 22%)"/><stop offset=".55" stop-color="hsl(${hue + 42} 72% 55%)"/><stop offset="1" stop-color="hsl(${hue + 95} 76% 72%)"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="28"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="72%" cy="28%" r="${Math.min(width, height) * .17}" fill="#fff" opacity=".26" filter="url(#b)"/><path d="M0 ${height * .72} Q ${width * .3} ${height * .45} ${width * .56} ${height * .72} T ${width} ${height * .62} V ${height} H0Z" fill="#11162b" opacity=".72"/><text x="7%" y="84%" fill="white" font-family="Arial,sans-serif" font-size="${Math.max(24, width * .03)}" font-weight="700">${title}</text><text x="7%" y="90%" fill="white" opacity=".65" font-family="Arial,sans-serif" font-size="${Math.max(16, width * .018)}">LOCAL MOCK · ${index + 1}/${count}</text></svg>`
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  })
}

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY), mock: mockEnabled, model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2' }))

app.post('/api/images/generate', async (req, res, next) => {
  try {
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    if (mockEnabled) return setTimeout(() => res.json({ images: mockImages(req.body), mock: true }), 900)
    res.json({ images: images(await client().images.generate(options(req.body))) })
  } catch (error) { next(error) }
})

app.post('/api/images/edit', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传参考图片' })
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    if (mockEnabled) return setTimeout(() => res.json({ images: mockImages(req.body), mock: true }), 900)
    const image = await toFile(req.file.buffer, req.file.originalname, { type: req.file.mimetype })
    res.json({ images: images(await client().images.edit({ ...options(req.body), image })) })
  } catch (error) { next(error) }
})

app.use(express.static(path.join(rootDir, 'dist')))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(rootDir, 'dist', 'index.html'))
})

app.use((error, _req, res, _next) => {
  const status = error.status || error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500)
  const message = error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 10MB' : (error.error?.message || error.message || '生成失败，请稍后重试')
  console.error('[api]', status, message)
  res.status(status).json({ error: message })
})

app.listen(port, () => console.log(`AI API server running at http://localhost:${port}`))
