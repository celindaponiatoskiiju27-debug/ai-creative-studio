import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI, { toFile } from 'openai'
import { fal } from '@fal-ai/client'
import ffmpegPath from 'ffmpeg-static'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

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

const CREDIT_PRICES = Object.freeze({ copy: 1, image: 2, imageEdit: 3, gif: 6, video: 25 })
const CREDIT_PACKAGES = Object.freeze([
  { id: 'trial', name: '首充体验', priceFen: 190, credits: 10, firstPurchaseOnly: true },
  { id: 'starter', name: '入门套餐', priceFen: 990, credits: 60 },
  { id: 'popular', name: '热销套餐', priceFen: 2990, credits: 200, recommended: true },
  { id: 'creator', name: '创作者套餐', priceFen: 5990, credits: 420 },
  { id: 'business', name: '商用套餐', priceFen: 9900, credits: 720 }
])
const publicPackage = item => ({
  id: item.id, name: item.name, price: (item.price_fen ?? item.priceFen) / 100, credits: item.credits,
  firstPurchaseOnly: Boolean(item.first_purchase_only ?? item.firstPurchaseOnly),
  recommended: Boolean(item.recommended), active: item.active !== false, sortOrder: item.sort_order ?? 0
})

async function loadCreditPackages(activeOnly = true) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return CREDIT_PACKAGES
  let query = supabaseAdmin().from('credit_packages').select('id,name,price_fen,credits,first_purchase_only,recommended,active,sort_order,updated_at').order('sort_order')
  if (activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  if (error) {
    if (error.code === '42P01') return CREDIT_PACKAGES
    throw error
  }
  return data
}

function client() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('服务端尚未配置 OPENAI_API_KEY')
    error.status = 503
    throw error
  }
  const baseURL = process.env.OPENAI_BASE_URL?.trim()
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(baseURL ? { baseURL: baseURL.replace(/\/$/, '') } : {})
  })
}

let supabaseInstance
const registrationAttempts = new Map()
function supabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error('服务端尚未配置 Supabase')
    error.status = 503
    throw error
  }
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  }
  return supabaseInstance
}

async function requireUser(req, _res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) { const error = new Error('请先登录'); error.status = 401; throw error }
    const { data, error } = await supabaseAdmin().auth.getUser(token)
    if (error || !data.user) { const authError = new Error('登录已过期，请重新登录'); authError.status = 401; throw authError }
    req.user = data.user
    next()
  } catch (error) { next(error) }
}

async function profileFor(userId) {
  const { data, error } = await supabaseAdmin().from('profiles').select('id,email,credits,is_admin,created_at').eq('id', userId).single()
  if (error) throw error
  return data
}

async function requireAdmin(req, _res, next) {
  try {
    const profile = await profileFor(req.user.id)
    if (!profile.is_admin) { const error = new Error('需要管理员权限'); error.status = 403; throw error }
    req.profile = profile
    next()
  } catch (error) { next(error) }
}

async function reserveGeneration(userId, body, requestedCredits, outputCount) {
  const credits = requestedCredits ?? Math.min(4, Math.max(1, Number(body.count) || 1))
  const { data, error } = await supabaseAdmin().rpc('reserve_generation', {
    p_user_id: userId, p_credits: credits, p_count: outputCount ?? credits, p_prompt: body.prompt
  })
  if (error) {
    if (error.message?.includes('INSUFFICIENT_CREDITS')) { error.status = 402; error.message = '算力不足' }
    throw error
  }
  if (body.action && data) {
    const { error: actionError } = await supabaseAdmin().from('usage_records').update({ action: String(body.action).slice(0, 50) }).eq('id', data)
    if (actionError) throw actionError
  }
  return data
}

function configureFal() {
  if (!process.env.FAL_KEY) {
    const error = new Error('服务端尚未配置 FAL_KEY')
    error.status = 503
    throw error
  }
  fal.config({ credentials: process.env.FAL_KEY })
}

function falTextModel(imageModel) {
  if (process.env.VIDEO_TEXT_MODEL) return process.env.VIDEO_TEXT_MODEL
  if (imageModel === 'fal-ai/ltx-video/image-to-video') return 'fal-ai/ltx-video'
  return imageModel.replace('/image-to-video', '/text-to-video')
}

function textClient() {
  if (!process.env.OPENAI_TEXT_API_KEY) {
    const error = new Error('服务端尚未配置 OPENAI_TEXT_API_KEY')
    error.status = 503
    throw error
  }
  const baseURL = (process.env.OPENAI_TEXT_BASE_URL || process.env.OPENAI_BASE_URL)?.trim()
  return new OpenAI({
    apiKey: process.env.OPENAI_TEXT_API_KEY,
    ...(baseURL ? { baseURL: baseURL.replace(/\/$/, '') } : {})
  })
}

function responseText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text.trim()
  const outputText = response?.output
    ?.flatMap(item => Array.isArray(item.content) ? item.content : [])
    .map(item => typeof item.text === 'string' ? item.text : (typeof item.output_text === 'string' ? item.output_text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
  if (outputText) return outputText
  const choiceText = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.text
  if (typeof choiceText === 'string' && choiceText.trim()) return choiceText.trim()
  const collected = []
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      if (['text', 'output_text', 'content', 'message', 'response', 'answer'].includes(key) && value.trim()) collected.push(value.trim())
      return
    }
    if (Array.isArray(value)) { value.forEach(item => visit(item, key)); return }
    if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey))
  }
  visit(response)
  if (collected.length) return [...new Set(collected)].join('\n')
  return ''
}

function videoProvider() {
  return (process.env.VIDEO_PROVIDER || 'fal').trim().toLowerCase()
}

function dashScopeBaseUrl() {
  const baseUrl = process.env.DASHSCOPE_BASE_URL?.trim()
  if (!process.env.DASHSCOPE_API_KEY || !baseUrl) {
    const error = new Error('服务端尚未完整配置百炼 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL')
    error.status = 503
    throw error
  }
  return baseUrl.replace(/\/$/, '')
}

async function dashScopeRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(120000)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || payload.code || `百炼接口请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  return payload
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function generateAliyunVideo({ file, mode, prompt }) {
  const baseUrl = dashScopeBaseUrl()
  const imageModel = process.env.VIDEO_MODEL || 'wan2.6-i2v-flash'
  const textModel = process.env.VIDEO_TEXT_MODEL || 'wan2.6-t2v'
  const model = mode === 'image'
    ? (imageModel.startsWith('fal-ai/') ? 'wan2.6-i2v-flash' : imageModel)
    : (textModel.startsWith('fal-ai/') ? 'wan2.6-t2v' : textModel)
  const input = { prompt: prompt.trim() }
  if (mode === 'image') input.img_url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  const submitted = await dashScopeRequest(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({
      model,
      input,
      parameters: {
        resolution: '720P', duration: 5, prompt_extend: true, watermark: false,
        ...(mode === 'image' && model === 'wan2.6-i2v-flash' ? { audio: false, shot_type: 'single' } : {})
      }
    })
  })
  const taskId = submitted.output?.task_id
  if (!taskId) throw new Error('百炼未返回视频任务 ID')
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await wait(5000)
    const task = await dashScopeRequest(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`)
    const status = task.output?.task_status
    if (status === 'SUCCEEDED') {
      if (!task.output?.video_url) throw new Error('百炼任务成功但未返回视频文件')
      return task.output.video_url
    }
    if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
      throw new Error(task.output?.message || task.message || `百炼视频生成失败（${status}）`)
    }
  }
  const error = new Error('百炼视频生成超时，请稍后重试')
  error.status = 504
  throw error
}

async function generateFalVideo({ file, mode, prompt, ratio }) {
  configureFal()
  const imageModel = process.env.VIDEO_MODEL || 'fal-ai/ltx-video/image-to-video'
  const model = mode === 'image' ? imageModel : falTextModel(imageModel)
  const input = { prompt: prompt.trim() }
  if (mode === 'image') input.image_url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  if (mode === 'text') input.aspect_ratio = ['16:9', '9:16', '1:1'].includes(ratio) ? ratio : '16:9'
  const result = await fal.subscribe(model, { input, logs: true })
  const videoUrl = result.data?.video?.url
  if (!videoUrl) throw new Error('fal.ai 未返回视频文件')
  return videoUrl
}

async function generateVideo(options) {
  return videoProvider() === 'aliyun' ? generateAliyunVideo(options) : generateFalVideo(options)
}

async function videoToGif(videoUrl) {
  if (!ffmpegPath) throw new Error('服务器缺少 GIF 转换组件')
  const workDir = await mkdtemp(path.join(tmpdir(), 'lingjing-gif-'))
  const videoFile = path.join(workDir, 'source.mp4')
  const gifFile = path.join(workDir, 'result.gif')
  try {
    const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`下载视频失败（${response.status}）`)
    await writeFile(videoFile, Buffer.from(await response.arrayBuffer()))
    await new Promise((resolve, reject) => {
      const filter = 'fps=12,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3'
      const process = spawn(ffmpegPath, ['-y', '-i', videoFile, '-filter_complex', filter, '-loop', '0', gifFile], { windowsHide: true })
      let errorOutput = ''
      process.stderr.on('data', chunk => { errorOutput += chunk.toString().slice(-4000) })
      process.on('error', reject)
      process.on('close', code => code === 0 ? resolve() : reject(new Error(`GIF 转换失败：${errorOutput.slice(-500)}`)))
    })
    return `data:image/gif;base64,${(await readFile(gifFile)).toString('base64')}`
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function archiveOutputs(userId, usageId, urls) {
  const archived = []
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }
  for (let index = 0; index < urls.length; index += 1) {
    const source = urls[index]
    let buffer
    let contentType
    const dataMatch = /^data:([^;,]+);base64,(.+)$/s.exec(source)
    if (dataMatch) {
      contentType = dataMatch[1].toLowerCase()
      buffer = Buffer.from(dataMatch[2], 'base64')
    } else {
      const response = await fetch(source, { signal: AbortSignal.timeout(180000) })
      if (!response.ok) throw new Error(`下载生成作品失败（${response.status}）`)
      contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
      buffer = Buffer.from(await response.arrayBuffer())
    }
    const extension = extensions[contentType]
    if (!extension) throw new Error(`不支持归档的文件格式：${contentType || 'unknown'}`)
    const objectPath = `${userId}/${usageId}/${index + 1}.${extension}`
    const { error } = await supabaseAdmin().storage.from('generated-assets').upload(objectPath, buffer, { contentType, upsert: true, cacheControl: '31536000' })
    if (error) throw error
    archived.push(supabaseAdmin().storage.from('generated-assets').getPublicUrl(objectPath).data.publicUrl)
  }
  const { error } = await supabaseAdmin().from('usage_records').update({ output_urls: archived }).eq('id', usageId)
  if (error) throw error
  return archived
}

async function archiveOrOriginal(userId, usageId, urls) {
  try { return await archiveOutputs(userId, usageId, urls) }
  catch (error) { console.error('[archive]', usageId, error.message); return urls }
}

async function finishGeneration(usageId, success) {
  if (!usageId) return
  const { error } = await supabaseAdmin().rpc('finish_generation', { p_usage_id: usageId, p_success: success })
  if (error) throw error
}

function allowRegistration(ip) {
  const now = Date.now()
  const attempts = (registrationAttempts.get(ip) || []).filter(time => now - time < 60 * 60 * 1000)
  if (attempts.length >= 10) return false
  attempts.push(now)
  registrationAttempts.set(ip, attempts)
  return true
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

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  configured: Boolean(process.env.OPENAI_API_KEY),
  textConfigured: Boolean(process.env.OPENAI_TEXT_API_KEY),
  videoConfigured: videoProvider() === 'aliyun'
    ? Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL)
    : Boolean(process.env.FAL_KEY),
  mock: mockEnabled,
  model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  videoModel: process.env.VIDEO_MODEL || (videoProvider() === 'aliyun' ? 'wan2.6-i2v-flash' : 'fal-ai/ltx-video/image-to-video'),
  videoProvider: videoProvider(),
  provider: process.env.OPENAI_BASE_URL ? 'openai-compatible' : 'openai'
}))

app.post('/api/auth/register', async (req, res, next) => {
  try {
    if (!allowRegistration(req.ip)) return res.status(429).json({ error: '注册过于频繁，请稍后再试' })
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: '请输入有效邮箱' })
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' })
    const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return res.status(409).json({ error: '该邮箱已经注册，请直接登录' })
      throw error
    }
    res.status(201).json({ user: { id: data.user.id, email: data.user.email } })
  } catch (error) { next(error) }
})

app.get('/api/me', requireUser, async (req, res, next) => {
  try { res.json({ user: await profileFor(req.user.id) }) } catch (error) { next(error) }
})

app.get('/api/usage', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('usage_records').select('id,action,image_count,credits,status,prompt,output_urls,output_text,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    res.json({ records: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/users', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim()
    let query = supabaseAdmin().from('profiles').select('id,email,credits,is_admin,created_at').order('created_at', { ascending: false }).limit(200)
    if (search) query = query.ilike('email', `%${search}%`)
    const [{ data: users, error: usersError }, { data: usage, error: usageError }] = await Promise.all([
      query,
      supabaseAdmin().from('usage_records').select('user_id,image_count,credits,status,created_at').eq('status', 'completed')
    ])
    if (usersError) throw usersError
    if (usageError) throw usageError
    const totals = new Map()
    for (const row of usage) {
      const item = totals.get(row.user_id) || { credits_used: 0, images_generated: 0, generation_count: 0, last_used_at: null }
      item.credits_used += row.credits
      item.images_generated += row.image_count
      item.generation_count += 1
      if (!item.last_used_at || row.created_at > item.last_used_at) item.last_used_at = row.created_at
      totals.set(row.user_id, item)
    }
    res.json({ users: users.map(user => ({ ...user, ...(totals.get(user.id) || { credits_used: 0, images_generated: 0, generation_count: 0, last_used_at: null }) })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/usage', requireUser, requireAdmin, async (req, res, next) => {
  try {
    let query = supabaseAdmin().from('usage_records').select('id,user_id,action,image_count,credits,status,prompt,created_at').order('created_at', { ascending: false }).limit(200)
    if (req.query.user_id) query = query.eq('user_id', req.query.user_id)
    const { data, error } = await query
    if (error) throw error
    res.json({ records: data })
  } catch (error) { next(error) }
})

app.post('/api/admin/users/:id/credits', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount)
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) return res.status(400).json({ error: '请输入有效的算力调整数量' })
    const { data, error } = await supabaseAdmin().rpc('admin_adjust_credits', {
      p_admin_id: req.user.id,
      p_user_id: req.params.id,
      p_amount: amount,
      p_reason: String(req.body.reason || '')
    })
    if (error) throw error
    res.json({ credits: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/recharge-orders', requireUser, requireAdmin, async (req, res, next) => {
  try {
    let query = supabaseAdmin().from('recharge_orders').select('id,order_no,user_id,package_id,amount_fen,credits,payment_reference,status,created_at,paid_at').order('created_at', { ascending: false }).limit(200)
    if (req.query.status) query = query.eq('status', req.query.status)
    const { data: orders, error } = await query
    if (error) throw error
    const userIds = [...new Set(orders.map(item => item.user_id))]
    const { data: profiles, error: profileError } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [], error: null }
    if (profileError) throw profileError
    const emails = new Map(profiles.map(item => [item.id, item.email]))
    res.json({ orders: orders.map(item => ({ ...item, email: emails.get(item.user_id) || '' })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/payment-settings', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('payment_settings').select('qr_url,instructions,updated_at').eq('id', 'default').single()
    if (error) throw error
    res.json({ settings: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/credit-packages', requireUser, requireAdmin, async (_req, res, next) => {
  try { res.json({ packages: (await loadCreditPackages(false)).map(publicPackage) }) } catch (error) { next(error) }
})

app.post('/api/admin/credit-packages', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '新套餐').trim().slice(0, 30)
    const priceFen = Math.round(Number(req.body.price || 9.9) * 100)
    const credits = Number(req.body.credits || 50)
    if (!name || !Number.isInteger(priceFen) || priceFen < 1 || !Number.isInteger(credits) || credits < 1) return res.status(400).json({ error: '请输入有效的套餐名称、价格和算力数量' })
    const id = `package_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const existing = await loadCreditPackages(false)
    const sortOrder = existing.length ? Math.max(...existing.map(item => Number(item.sort_order ?? item.sortOrder) || 0)) + 10 : 10
    const { data, error } = await supabaseAdmin().from('credit_packages').insert({ id, name, price_fen: priceFen, credits, active: true, recommended: false, first_purchase_only: false, sort_order: sortOrder }).select('id,name,price_fen,credits,first_purchase_only,recommended,active,sort_order').single()
    if (error) throw error
    res.status(201).json({ package: publicPackage(data) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/credit-packages/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 30)
    const priceFen = Math.round(Number(req.body.price) * 100)
    const credits = Number(req.body.credits)
    const sortOrder = Number(req.body.sortOrder)
    if (!name) return res.status(400).json({ error: '请输入套餐名称' })
    if (!Number.isInteger(priceFen) || priceFen < 1 || priceFen > 1000000) return res.status(400).json({ error: '请输入有效套餐价格' })
    if (!Number.isInteger(credits) || credits < 1 || credits > 1000000) return res.status(400).json({ error: '请输入有效算力数量' })
    if (!Number.isInteger(sortOrder)) return res.status(400).json({ error: '套餐排序必须是整数' })
    const recommended = req.body.recommended === true
    if (recommended) {
      const { error: clearError } = await supabaseAdmin().from('credit_packages').update({ recommended: false }).neq('id', req.params.id)
      if (clearError) throw clearError
    }
    const { data, error } = await supabaseAdmin().from('credit_packages').update({
      name, price_fen: priceFen, credits, active: req.body.active === true,
      recommended, sort_order: sortOrder, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select('id,name,price_fen,credits,first_purchase_only,recommended,active,sort_order').single()
    if (error) throw error
    res.json({ package: publicPackage(data) })
  } catch (error) { next(error) }
})

app.delete('/api/admin/credit-packages/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { count: activeCount, error: activeError } = await supabaseAdmin().from('credit_packages').select('id', { count: 'exact', head: true }).eq('active', true)
    if (activeError) throw activeError
    const { data: target, error: targetError } = await supabaseAdmin().from('credit_packages').select('id,active').eq('id', req.params.id).single()
    if (targetError) throw targetError
    if (target.active && activeCount <= 1) return res.status(409).json({ error: '至少需要保留一个启用中的充值套餐' })
    const { count: orderCount, error: orderError } = await supabaseAdmin().from('recharge_orders').select('id', { count: 'exact', head: true }).eq('package_id', req.params.id)
    if (orderError) throw orderError
    if (orderCount > 0) {
      const { error } = await supabaseAdmin().from('credit_packages').update({ active: false, recommended: false, updated_at: new Date().toISOString() }).eq('id', req.params.id)
      if (error) throw error
      return res.json({ deleted: false, archived: true })
    }
    const { error } = await supabaseAdmin().from('credit_packages').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ deleted: true, archived: false })
  } catch (error) { next(error) }
})

app.post('/api/admin/payment-settings', requireUser, requireAdmin, upload.single('qr'), async (req, res, next) => {
  try {
    const instructions = String(req.body.instructions || '').trim().slice(0, 500)
    if (!req.file && !instructions) return res.status(400).json({ error: '请选择收款码图片或填写付款说明' })
    const { data: current, error: currentError } = await supabaseAdmin().from('payment_settings').select('qr_url,qr_path,instructions').eq('id', 'default').single()
    if (currentError) throw currentError
    let qrUrl = current.qr_url || null
    let qrPath = current.qr_path || null
    if (req.file) {
      if (req.file.size > 5 * 1024 * 1024) return res.status(413).json({ error: '收款码图片不能超过 5MB' })
      const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[req.file.mimetype]
      if (!extension) return res.status(400).json({ error: '收款码仅支持 PNG、JPG 或 WebP' })
      const newPath = `wechat-qr-${Date.now()}.${extension}`
      const { error: uploadError } = await supabaseAdmin().storage.from('payment-assets').upload(newPath, req.file.buffer, { contentType: req.file.mimetype, upsert: false })
      if (uploadError) throw uploadError
      const { data: publicData } = supabaseAdmin().storage.from('payment-assets').getPublicUrl(newPath)
      qrUrl = publicData.publicUrl
      const oldPath = qrPath
      qrPath = newPath
      if (oldPath) await supabaseAdmin().storage.from('payment-assets').remove([oldPath]).catch(() => {})
    }
    const { data, error } = await supabaseAdmin().from('payment_settings').update({
      qr_url: qrUrl, qr_path: qrPath, instructions: instructions || current.instructions,
      updated_by: req.user.id, updated_at: new Date().toISOString()
    }).eq('id', 'default').select('qr_url,instructions,updated_at').single()
    if (error) throw error
    res.json({ settings: data })
  } catch (error) { next(error) }
})

app.post('/api/admin/recharge-orders/:id/review', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const approve = req.body.approve === true
    const { data, error } = await supabaseAdmin().rpc('admin_review_recharge', { p_admin_id: req.user.id, p_order_id: req.params.id, p_approve: approve })
    if (error) throw error
    res.json({ credits: data, status: approve ? 'paid' : 'rejected' })
  } catch (error) { next(error) }
})

app.get('/api/billing/config', async (_req, res, next) => {
  try {
    const packages = await loadCreditPackages(true)
    let setting = null
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await supabaseAdmin().from('payment_settings').select('qr_url,instructions,updated_at').eq('id', 'default').maybeSingle()
      if (error && error.code !== '42P01') throw error
      setting = data
    }
    res.json({
      packages: packages.map(publicPackage), prices: CREDIT_PRICES, paymentMode: 'manual',
      paymentQrUrl: setting?.qr_url || process.env.PAYMENT_QR_URL || '',
      instructions: setting?.instructions || process.env.MANUAL_PAYMENT_INSTRUCTIONS || '提交订单后，请联系管理员完成付款审核。'
    })
  } catch (error) { next(error) }
})

app.get('/api/billing/orders', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('recharge_orders')
      .select('id,order_no,package_id,amount_fen,credits,payment_provider,payment_reference,status,created_at,paid_at')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)
    if (error) throw error
    res.json({ orders: data })
  } catch (error) { next(error) }
})

app.post('/api/billing/orders', requireUser, async (req, res, next) => {
  try {
    const packages = await loadCreditPackages(true)
    const selected = packages.find(item => item.id === req.body.packageId)
    if (!selected) return res.status(400).json({ error: '充值套餐不存在' })
    const firstPurchaseOnly = selected.first_purchase_only ?? selected.firstPurchaseOnly
    const priceFen = selected.price_fen ?? selected.priceFen
    if (firstPurchaseOnly) {
      const { count, error: countError } = await supabaseAdmin().from('recharge_orders').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('status', 'paid')
      if (countError) throw countError
      if (count > 0) return res.status(409).json({ error: '首充体验套餐每位用户仅限一次' })
    }
    const orderNo = `LJ${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const reference = String(req.body.paymentReference || '').trim().slice(0, 200)
    const { data, error } = await supabaseAdmin().from('recharge_orders').insert({
      order_no: orderNo, user_id: req.user.id, package_id: selected.id, amount_fen: priceFen,
      credits: selected.credits, payment_provider: 'manual', payment_reference: reference || null
    }).select('id,order_no,package_id,amount_fen,credits,status,created_at').single()
    if (error) throw error
    res.status(201).json({ order: data })
  } catch (error) { next(error) }
})

app.post('/api/copy/generate', requireUser, async (req, res, next) => {
  let usageId
  try {
    const product = String(req.body.product || '').trim()
    const features = String(req.body.features || '').trim()
    const platform = String(req.body.platform || '淘宝 / 天猫').trim()
    const style = String(req.body.style || '突出卖点').trim()
    if (!product) return res.status(400).json({ error: '请填写商品名称' })
    if (!features) return res.status(400).json({ error: '请填写商品核心卖点' })
    const prompt = `商品：${product}\n核心卖点：${features}\n投放平台：${platform}\n文案风格：${style}`
    usageId = await reserveGeneration(req.user.id, { prompt, count: 1, action: 'copy_generation' }, CREDIT_PRICES.copy, 1)
    const stream = await textClient().responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4',
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
      stream: true,
      instructions: '你是一名资深中国电商文案策划。根据商品资料和平台特点，输出：1. 三个商品标题；2. 五条核心卖点；3. 一段可直接发布的营销正文；4. 三条短促销口号。语言自然、有转化力，不夸大功效，不虚构未提供的参数，不使用Markdown代码块。',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      ]
    })
    let copy = ''
    let completedResponse
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') copy += event.delta
      if (event.type === 'response.completed') completedResponse = event.response
      if (event.type === 'error') throw new Error(event.message || event.error?.message || 'GPT-5.4 流式响应失败')
    }
    copy = copy.trim() || responseText(completedResponse)
    if (!copy) {
      console.error('[copy-response]', JSON.stringify({ id: completedResponse?.id, status: completedResponse?.status, error: completedResponse?.error, output: completedResponse?.output }))
      throw new Error(completedResponse?.error?.message || `GPT-5.4 未返回文案内容（状态：${completedResponse?.status || 'unknown'}）`)
    }
    const { error: saveCopyError } = await supabaseAdmin().from('usage_records').update({ output_text: copy }).eq('id', usageId)
    if (saveCopyError) console.error('[archive-copy]', usageId, saveCopyError.message)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ copy, model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4', credits: profile.credits })
  } catch (error) {
    if (usageId) await finishGeneration(usageId, false).catch(refundError => console.error('[refund]', refundError.message))
    next(error)
  }
})

app.post('/api/images/generate', requireUser, async (req, res, next) => {
  let usageId
  try {
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    const count = Math.min(4, Math.max(1, Number(req.body.count) || 1))
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: 'image_generation' }, CREDIT_PRICES.image * count, count)
    const generated = mockEnabled
      ? await new Promise(resolve => setTimeout(() => resolve(mockImages(req.body)), 900))
      : images(await client().images.generate(options(req.body)))
    const storedImages = await archiveOrOriginal(req.user.id, usageId, generated)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ images: storedImages, mock: mockEnabled, credits: profile.credits })
  } catch (error) {
    if (usageId) await finishGeneration(usageId, false).catch(refundError => console.error('[refund]', refundError.message))
    next(error)
  }
})

app.post('/api/images/edit', requireUser, upload.array('images', 4), async (req, res, next) => {
  let usageId
  try {
    if (!req.files?.length) return res.status(400).json({ error: '请上传至少一张参考图片' })
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    const count = Math.min(4, Math.max(1, Number(req.body.count) || 1))
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: 'image_edit' }, CREDIT_PRICES.imageEdit * count, count)
    let generated
    if (mockEnabled) generated = await new Promise(resolve => setTimeout(() => resolve(mockImages(req.body)), 900))
    else {
      const image = await Promise.all(req.files.map(file => toFile(file.buffer, file.originalname, { type: file.mimetype })))
      generated = images(await client().images.edit({ ...options(req.body), image }))
    }
    const storedImages = await archiveOrOriginal(req.user.id, usageId, generated)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ images: storedImages, mock: mockEnabled, credits: profile.credits })
  } catch (error) {
    if (usageId) await finishGeneration(usageId, false).catch(refundError => console.error('[refund]', refundError.message))
    next(error)
  }
})

app.post('/api/videos/generate', requireUser, upload.single('image'), async (req, res, next) => {
  let usageId
  try {
    const mode = req.body.mode === 'text' ? 'text' : 'image'
    if (mode === 'image' && !req.file) return res.status(400).json({ error: '请上传一张静态图片' })
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面运动描述' })
    const credits = mode === 'image' ? CREDIT_PRICES.gif : CREDIT_PRICES.video
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: mode === 'image' ? 'gif_generation' : 'video_generation' }, credits, 1)
    const videoUrl = await generateVideo({ file: req.file, mode, prompt: req.body.prompt, ratio: req.body.ratio })
    const generatedOutputs = mode === 'image' ? [await videoToGif(videoUrl)] : [videoUrl]
    const storedOutputs = await archiveOrOriginal(req.user.id, usageId, generatedOutputs)
    const payload = mode === 'image' ? { gifs: storedOutputs } : { videos: storedOutputs }
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ ...payload, credits: profile.credits })
  } catch (error) {
    if (usageId) await finishGeneration(usageId, false).catch(refundError => console.error('[refund]', refundError.message))
    next(error)
  }
})

app.use(express.static(path.join(rootDir, 'dist')))
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'admin.html')))
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
