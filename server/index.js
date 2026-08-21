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
import { randomUUID } from 'node:crypto'

const app = express()
app.disable('x-powered-by')
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3001)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))
})

app.use(cors({ origin: ['http://localhost:5174', 'http://127.0.0.1:5174'] }))
app.use((req, res, next) => {
  req.requestId = String(req.headers['x-request-id'] || randomUUID()).slice(0, 100)
  res.setHeader('X-Request-Id', req.requestId)
  next()
})
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(express.json({ limit: '1mb' }))

const CREDIT_PRICES = Object.freeze({ copy: 1, enhance: 1, image: 2, imageEdit: 3, gif: 6, video: 25 })
const LEGAL_VERSION = '2026-08-17'
const AI_LABEL = 'AI生成内容'
const AI_LABEL_VERSION = '2026-08-17'
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
const promptEnhanceAttempts = new Map()
const productEventAttempts = new Map()
const VIDEO_JOB_CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.VIDEO_JOB_CONCURRENCY || 2)))
const GIF_CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.GIF_CONCURRENCY || 1)))
const VIDEO_JOB_STALE_MS = Math.max(10, Math.min(30, Number(process.env.VIDEO_JOB_STALE_MINUTES || 12))) * 60000
let activeVideoJobs = 0
let activeGifConversions = 0
let videoPumpRunning = false
const gifWaiters = []

function allowPromptEnhance(userId) {
  const now = Date.now()
  const recent = (promptEnhanceAttempts.get(userId) || []).filter(time => now - time < 60_000)
  if (recent.length >= 10) return false
  recent.push(now)
  promptEnhanceAttempts.set(userId, recent)
  return true
}

const SAFETY_RULES = [
  { category: '未成年人色情', rule: 'minor_sexual', pattern: /(未成年|儿童|幼女|幼童|小学生|初中生).{0,20}(色情|裸体|裸照|性行为|成人视频)/i },
  { category: '伪造凭证', rule: 'forged_documents', pattern: /(伪造|仿造|制作假).{0,20}(身份证|护照|公章|发票|银行流水|付款凭证|合同|学历证书)/i },
  { category: '诈骗与盗取', rule: 'fraud_theft', pattern: /(诈骗话术|钓鱼网站|盗取账号|盗刷信用卡|骗取验证码|洗钱教程|信用卡套现教程)/i },
  { category: '露骨色情', rule: 'explicit_sexual', pattern: /(露骨色情|成人视频|性交画面|强奸|乱伦|兽交)/i },
  { category: '极端暴力', rule: 'extreme_violence', pattern: /(肢解|斩首|虐杀|血腥尸体).{0,20}(教程|画面|视频|图片|细节)/i },
  { category: '危险违法活动', rule: 'dangerous_illegal', pattern: /(制造炸弹|自制枪支|制毒教程|贩卖毒品|黑客入侵教程|勒索软件教程)/i }
]

async function enforceContentSafety(req, content, source) {
  const text = String(content || '').trim()
  if (!text) return
  const { data: settings, error: settingsError } = await supabaseAdmin().from('content_safety_settings').select('active,custom_blocked_terms').eq('id', true).single()
  if (settingsError) throw settingsError
  if (!settings.active) return
  let match = SAFETY_RULES.find(item => item.pattern.test(text))
  if (!match) { const term = (settings.custom_blocked_terms || []).find(item => item && text.toLowerCase().includes(String(item).toLowerCase())); if (term) match = { category: '自定义禁用词', rule: `custom:${String(term).slice(0, 80)}` } }
  if (!match) return
  const { error } = await supabaseAdmin().from('moderation_events').insert({ user_id: req.user?.id || null, source, category: match.category, matched_rule: match.rule, content_excerpt: text.slice(0, 500), action: 'blocked', ip_address: req.ip || req.socket.remoteAddress || null })
  if (error) console.error('[moderation-log]', error.message)
  const blocked = new Error(`内容包含平台禁止的“${match.category}”信息，请修改后再试`); blocked.status = 422; throw blocked
}

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
  const action = String(body.action || 'image_generation').slice(0, 50)
  const { data, error } = await supabaseAdmin().rpc('reserve_generation_budgeted', {
    p_user_id: userId, p_credits: credits, p_count: outputCount ?? credits, p_prompt: body.prompt, p_action: action
  })
  if (error) {
    if (error.message?.includes('INSUFFICIENT_CREDITS')) { error.status = 402; error.message = '算力不足' }
    else if (error.message?.includes('DAILY_BUDGET_REACHED')) { error.status = 503; error.message = '今日生成额度已用完，请明天再试' }
    else if (error.message?.includes('MONTHLY_BUDGET_REACHED')) { error.status = 503; error.message = '本月生成额度已用完，请联系管理员' }
    else if (error.message?.includes('GENERATION_PAUSED')) { error.status = 503; error.message = '生成服务正在维护，请稍后再试' }
    else if (error.message?.includes('ACTION_DISABLED')) { error.status = 503; error.message = '该生成功能暂时关闭，请稍后再试' }
    else if (error.message?.includes('USER_GENERATION_BLOCKED')) { error.status = 403; error.message = '该账号的生成功能已被临时限制，请联系人工客服' }
    else if (error.message?.includes('USER_DAILY_LIMIT_REACHED')) { error.status = 429; error.message = '今日生成次数已达上限，请明天再试' }
    else if (error.message?.includes('USER_DAILY_COST_REACHED')) { error.status = 429; error.message = '今日个人生成额度已用完，请明天再试' }
    else if (error.message?.includes('TOO_MANY_PENDING')) { error.status = 429; error.message = '已有任务正在生成，请完成后再提交' }
    else if (error.message?.includes('TOO_FREQUENT')) { error.status = 429; error.message = '操作过于频繁，请稍候再试' }
    else if (error.message?.includes('TOO_MANY_FAILURES')) { error.status = 429; error.message = '近期失败请求过多，已临时停止提交，请稍后再试' }
    throw error
  }
  if (body.action && data) {
    const { error: actionError } = await supabaseAdmin().from('usage_records').update({
      action, ai_generated: true,
      ai_label: AI_LABEL, ai_label_version: AI_LABEL_VERSION
    }).eq('id', data)
    if (actionError) throw actionError
  }
  if (credits > 0 && data) {
    const profile = await profileFor(userId)
    const { error: ledgerError } = await supabaseAdmin().from('credit_transactions').insert({ user_id: userId, type: 'consume', amount: -credits, balance_after: profile.credits, reference_type: 'usage_record', reference_id: data, description: 'AI 生成消耗' })
    if (ledgerError && ledgerError.code !== '42P01') console.error('[credit-ledger]', ledgerError.message)
  }
  return data
}

async function auditAdmin(req, action, targetType, targetId, details = {}) {
  const { error } = await supabaseAdmin().from('admin_audit_logs').insert({ admin_id: req.user.id, action, target_type: targetType, target_id: targetId ? String(targetId) : null, details, ip_address: req.ip || null })
  if (error) console.error('[admin-audit]', action, error.message)
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

function openAITextClient() {
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

function qwenTextClient() {
  if (!process.env.DASHSCOPE_API_KEY) {
    const error = new Error('服务端尚未配置 DASHSCOPE_API_KEY')
    error.status = 503
    throw error
  }
  const baseURL = (process.env.DASHSCOPE_COMPATIBLE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').trim()
  return new OpenAI({ apiKey: process.env.DASHSCOPE_API_KEY, baseURL: baseURL.replace(/\/$/, '') })
}

function retryableProviderError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0)
  const code = String(error?.code || '').toLowerCase()
  if ([408, 409, 429].includes(status) || status >= 500) return true
  if (['etimedout', 'econnreset', 'econnrefused', 'enotfound'].includes(code)) return true
  return /timeout|timed out|network|socket|temporar|rate.?limit|服务繁忙|系统错误/i.test(String(error?.message || ''))
}

async function generateText(candidate, { instructions, input, maxOutputTokens }) {
  if (candidate.provider === 'aliyun') {
    const response = await qwenTextClient().chat.completions.create({
      model: candidate.id,
      messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }],
      max_tokens: maxOutputTokens,
      temperature: 0.7
    })
    return responseText(response)
  }
  const response = await openAITextClient().responses.create({
    model: candidate.id,
    reasoning: { effort: 'low' },
    max_output_tokens: maxOutputTokens,
    instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }]
  })
  return responseText(response)
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

function parseJsonResponse(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(cleaned) }
  catch (_error) {
    const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('AI返回的短剧分镜格式不正确，请重新生成')
  }
}

function publicDramaProject(row) {
  const shots = (row.short_drama_shots || row.shots || []).slice().sort((a, b) => a.shot_number - b.shot_number)
  const { short_drama_shots: _nested, ...project } = row
  return { ...project, shots }
}

function videoProvider() {
  return (process.env.VIDEO_PROVIDER || 'fal').trim().toLowerCase()
}

function parseModelList(envName, fallback) {
  try { const parsed = JSON.parse(process.env[envName] || ''); if (Array.isArray(parsed) && parsed.length) return parsed } catch (_error) {}
  return fallback
}

const runtimeModelFailures = new Map()
const modelFailureKey = (type, item) => `${type}:${item.provider || 'default'}:${item.id}`
const modelIsCoolingDown = (type, item) => (runtimeModelFailures.get(modelFailureKey(type, item)) || 0) > Date.now()
const markModelFailure = (type, item) => runtimeModelFailures.set(modelFailureKey(type, item), Date.now() + 5 * 60 * 1000)
const clearModelFailure = (type, item) => runtimeModelFailures.delete(modelFailureKey(type, item))
let databaseModels = []
let databaseModelsLoadedAt = 0

async function refreshModelConfigs(force = false) {
  if (!force && databaseModelsLoadedAt > Date.now() - 30000) return
  try {
    const { data, error } = await supabaseAdmin().from('model_configs').select('*').order('sort_order').order('created_at')
    if (error) throw error
    databaseModels = (data || []).map(item => ({ id: item.model_id, databaseId: item.id, type: item.type, provider: item.provider, name: item.name, description: item.description, textModel: item.text_model_id, enabled: item.enabled, sortOrder: item.sort_order, creditCost: Math.max(0, Number(item.credit_cost ?? 1)), textCreditCost: Math.max(0, Number(item.text_credit_cost ?? item.credit_cost ?? 1)), supportsGenerate: item.supports_generate !== false, supportsEdit: item.supports_edit === true }))
    databaseModelsLoadedAt = Date.now()
  } catch (error) {
    if (error.code !== '42P01') console.error('[model-configs]', error.message)
  }
}

function validateModelConfig(body) {
  const type = String(body.type || '').trim().toLowerCase()
  const provider = String(body.provider || '').trim().toLowerCase()
  const modelId = String(body.model_id || body.id || '').trim()
  const name = String(body.name || '').trim()
  if (!['image', 'text', 'video'].includes(type)) { const error = new Error('请选择正确的功能类型'); error.status = 400; throw error }
  if (!['openai', 'aliyun', 'fal', 'tencent'].includes(provider)) { const error = new Error('请选择已支持的供应商'); error.status = 400; throw error }
  if (!modelId || !name) { const error = new Error('模型名称和模型 ID 不能为空'); error.status = 400; throw error }
  if (type === 'image' && !['openai', 'aliyun', 'tencent'].includes(provider)) { const error = new Error('图片模型供应商配置不正确'); error.status = 400; throw error }
  if (type === 'text' && !['openai', 'aliyun'].includes(provider)) { const error = new Error('文案模型仅支持 OpenAI 兼容接口或阿里云百炼'); error.status = 400; throw error }
  return { type, provider, model_id: modelId.slice(0, 200), name: name.slice(0, 80), description: String(body.description || '').trim().slice(0, 300), text_model_id: String(body.text_model_id || body.textModel || '').trim().slice(0, 200), enabled: body.enabled !== false, sort_order: Math.max(0, Math.min(10000, Number(body.sort_order ?? body.sortOrder) || 100)), credit_cost: Math.max(0, Math.min(10000, Math.round(Number(body.credit_cost ?? body.creditCost ?? 1) || 0))), text_credit_cost: Math.max(0, Math.min(10000, Math.round(Number(body.text_credit_cost ?? body.textCreditCost ?? body.credit_cost ?? body.creditCost ?? 1) || 0))), supports_generate: body.supports_generate ?? body.supportsGenerate ?? true, supports_edit: body.supports_edit ?? body.supportsEdit ?? false }
}

function modelCatalog() {
  const openAIImageReady = Boolean(process.env.OPENAI_API_KEY) || mockEnabled
  const aliyunImageReady = Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL)
  const tencentImageReady = Boolean(process.env.TENCENT_API_KEY)
  const openAITextReady = Boolean(process.env.OPENAI_TEXT_API_KEY)
  const qwenTextReady = Boolean(process.env.DASHSCOPE_API_KEY)
  const aliyunReady = Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL)
  const falReady = Boolean(process.env.FAL_KEY && process.env.FAL_ENABLED === 'true')
  const source = type => databaseModels.filter(item => item.type === type)
  const images = (source('image').length ? source('image') : parseModelList('IMAGE_MODELS_JSON', [
    { id: 'qwen-image-2.0', name: '千问图像 2.0', provider: 'aliyun', description: '国内默认 · 高性价比文生图与编辑', creditCost: 2, supportsGenerate: true, supportsEdit: true, enabled: true },
    { id: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', name: 'GPT Image 2', provider: 'openai', description: '海外高质量备用图片模型', creditCost: 5, supportsGenerate: true, supportsEdit: true, enabled: true }
  ])).map(item => ({ ...item, type: 'image', available: item.enabled !== false && (item.provider === 'aliyun' ? aliyunImageReady : item.provider === 'openai' ? openAIImageReady : item.provider === 'tencent' ? tencentImageReady : false) && !modelIsCoolingDown('image', item) }))
  const texts = (source('text').length ? source('text') : parseModelList('TEXT_MODELS_JSON', [
    { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '默认：高性价比电商文案与提示词润色', creditCost: 1, enabled: true },
    { id: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', description: '备用：百炼服务故障时自动兜底', creditCost: 2, enabled: true }
  ])).map(item => ({ ...item, type: 'text', available: item.enabled !== false && (item.provider === 'aliyun' ? qwenTextReady : openAITextReady) && !modelIsCoolingDown('text', item) }))
  const videos = (source('video').length ? source('video') : parseModelList('VIDEO_MODELS_JSON', [{ id: process.env.VIDEO_MODEL || (videoProvider() === 'aliyun' ? 'wan2.6-i2v-flash' : 'fal-ai/ltx-video/image-to-video'), textModel: process.env.VIDEO_TEXT_MODEL || '', name: videoProvider() === 'aliyun' ? '通义万相' : 'LTX Video', provider: videoProvider(), description: '图生动态与视频生成', creditCost: 6, supportsGenerate: true, supportsEdit: true, enabled: true }])).map(item => ({ ...item, type: 'video', available: item.enabled !== false && !modelIsCoolingDown('video', item) && (item.provider === 'aliyun' ? aliyunReady : item.provider === 'fal' ? falReady : item.provider === 'tencent' ? tencentImageReady : false) }))
  return { image: images, text: texts, video: videos }
}

function selectedModel(type, requestedId) {
  const models = modelCatalog()[type] || []; const requested = models.find(item => item.id === requestedId)
  if (requested && requested.available) return requested
  const fallback = models.find(item => item.available)
  if (!fallback) { const error = new Error(`当前没有可用的${type === 'image' ? '图片' : type === 'text' ? '文案' : '视频'}模型`); error.status = 503; throw error }
  return fallback
}

function modelCandidates(type, requestedId) {
  const available = (modelCatalog()[type] || []).filter(item => item.available)
  if (!available.length) return [selectedModel(type, requestedId)]
  return [
    ...available.filter(item => item.id === requestedId),
    ...available.filter(item => item.id !== requestedId)
  ]
}

async function withModelFallback(type, requestedId, runner, shouldFallback = () => true) {
  const candidates = modelCandidates(type, requestedId)
  let lastError
  for (const model of candidates) {
    try {
      const result = await runner(model); clearModelFailure(type, model); return { result, model }
    } catch (error) {
      lastError = error
      if (!shouldFallback(error, model)) throw error
      markModelFailure(type, model)
      console.error('[model-fallback]', type, model.provider, model.id, error.message)
    }
  }
  throw lastError || new Error(`No available ${type} model`)
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

const qwenImageSizes = { '1:1': '2048*2048', '4:3': '2368*1728', '16:9': '2688*1536', '3:4': '1728*2368', '9:16': '1536*2688' }
const qwenEditSizes = { '1:1': '1024*1024', '4:3': '1344*1008', '16:9': '1536*864', '3:4': '1008*1344', '9:16': '864*1536' }

function extractDashScopeImages(payload) {
  const content = payload.output?.choices?.flatMap(choice => choice.message?.content || []) || []
  const urls = content.map(item => item.image || item.image_url || item.url).filter(Boolean)
  if (!urls.length) throw new Error('百炼图片模型未返回图片文件')
  return urls
}

async function generateAliyunImage({ model, prompt, ratio, count, files = [] }) {
  const content = files.map(file => ({ image: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` }))
  content.push({ text: prompt.trim() })
  const payload = await dashScopeRequest(`${dashScopeBaseUrl()}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      input: { messages: [{ role: 'user', content }] },
      parameters: {
        n: Math.min(4, Math.max(1, Number(count) || 1)),
        size: (model.id.includes('image-edit') ? qwenEditSizes : qwenImageSizes)[ratio] || qwenEditSizes['1:1'],
        prompt_extend: true,
        watermark: false
      }
    })
  })
  return extractDashScopeImages(payload)
}

const tencentImageSizes = { '1:1': '1024x1024', '4:3': '1152x864', '16:9': '1344x768', '3:4': '864x1152', '9:16': '768x1344' }

function tencentTokenHubBaseUrl() {
  return (process.env.TENCENT_TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com').trim().replace(/\/$/, '')
}

async function generateTencentImage({ model, prompt, ratio, count, files = [] }) {
  if (!process.env.TENCENT_API_KEY) {
    const error = new Error('服务端尚未配置 TENCENT_API_KEY')
    error.status = 503
    throw error
  }
  if (files.length > 3) {
    const error = new Error('腾讯混元最多支持 3 张参考图片，请减少一张后重试')
    error.status = 400
    throw error
  }
  if (files.some(file => !['image/png', 'image/jpeg'].includes(file.mimetype))) {
    const error = new Error('腾讯混元参考图仅支持 PNG 或 JPG 格式')
    error.status = 400
    throw error
  }
  const referenceImages = files.slice(0, 3).map(file => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`)
  const modelId = ['hunyuan-image', 'hunyuan-image-edit', 'hy-image-v3.0'].includes(model.id) ? 'hy-image-v3' : model.id
  const generateOne = async () => {
    const response = await fetch(`${tencentTokenHubBaseUrl()}/v1/wand/hunyuan-image/v3-generation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TENCENT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        prompt: prompt.trim(),
        size: tencentImageSizes[ratio] || tencentImageSizes['1:1'],
        revise: true,
        ...(referenceImages.length ? { images: referenceImages } : {})
      }),
      signal: AbortSignal.timeout(180000)
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error?.message || payload.message || payload.code || `腾讯混元接口请求失败（${response.status}）`)
      error.status = response.status
      throw error
    }
    const url = payload.data?.[0]?.url || payload.output?.images?.[0]?.url || payload.output?.[0]?.url
    if (!url) throw new Error('腾讯混元未返回图片文件')
    return url
  }
  return Promise.all(Array.from({ length: Math.min(4, Math.max(1, Number(count) || 1)) }, generateOne))
}

async function withImageFallback(requestedId, capability, runner) {
  const supports = item => capability === 'edit' ? item.supportsEdit : item.supportsGenerate !== false
  const available = (modelCatalog().image || []).filter(item => item.available && supports(item))
  const candidates = [...available.filter(item => item.id === requestedId), ...available.filter(item => item.id !== requestedId)]
  if (!candidates.length) {
    const error = new Error(`当前没有可用的${capability === 'edit' ? '图片编辑' : '图片生成'}模型`)
    error.status = 503
    throw error
  }
  let lastError
  for (const model of candidates) {
    try {
      const result = await runner(model)
      clearModelFailure('image', model)
      return { result, model }
    } catch (error) {
      lastError = error
      if (!retryableProviderError(error) && Number(error?.status || error?.statusCode || 0) !== 403) throw error
      markModelFailure('image', model)
      console.error('[image-model-fallback]', capability, model.provider, model.id, error.message)
    }
  }
  throw lastError
}

async function generateAliyunVideo({ file, mode, prompt, ratio, selected }) {
  const baseUrl = dashScopeBaseUrl()
  const imageModel = selected?.id || process.env.VIDEO_MODEL || 'wan2.6-i2v-flash'
  // 文生视频允许由 Render 环境变量统一指定默认模型；图片动起来仍使用所选图生视频模型。
  const textModel = process.env.VIDEO_TEXT_MODEL || selected?.textModel || 'wan2.6-t2v'
  const model = mode === 'image'
    ? (imageModel.startsWith('fal-ai/') ? 'wan2.6-i2v-flash' : imageModel)
    : (textModel.startsWith('fal-ai/') ? 'wan2.6-t2v' : textModel)
  const input = { prompt: prompt.trim() }
  if (mode === 'image') input.img_url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  const videoSizes = { '16:9': '1280*720', '9:16': '720*1280', '1:1': '960*960', '4:3': '1088*832', '3:4': '832*1088' }
  const parameters = mode === 'text'
    ? { size: videoSizes[ratio] || '1280*720', duration: 5, prompt_extend: false, watermark: false }
    : { resolution: '720P', duration: 5, prompt_extend: true, watermark: false, audio: false, shot_type: 'single' }
  const submitted = await dashScopeRequest(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({
      model,
      input,
      parameters
    })
  })
  const taskId = submitted.output?.task_id
  if (!taskId) throw new Error('百炼未返回视频任务 ID')
  console.log('[aliyun-video-submitted]', { taskId, model, mode, size: parameters.size || parameters.resolution })
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
      const code = task.output?.code || task.code || ''
      const message = task.output?.message || task.message || `百炼视频生成失败（${status}）`
      throw new Error(`${message}${code ? `（${code}）` : ''}；任务ID：${taskId}`)
    }
  }
  const error = new Error(`百炼视频生成超过10分钟仍未完成；任务ID：${taskId}`)
  error.status = 504
  throw error
}

async function generateFalVideo({ file, mode, prompt, ratio, selected }) {
  configureFal()
  const imageModel = selected?.id || process.env.VIDEO_MODEL || 'fal-ai/ltx-video/image-to-video'
  const model = mode === 'image' ? imageModel : (selected?.textModel || falTextModel(imageModel))
  const input = { prompt: prompt.trim() }
  if (mode === 'image') input.image_url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  if (mode === 'text') input.aspect_ratio = ['16:9', '9:16', '1:1'].includes(ratio) ? ratio : '16:9'
  const result = await fal.subscribe(model, { input, logs: true })
  const videoUrl = result.data?.video?.url
  if (!videoUrl) throw new Error('fal.ai 未返回视频文件')
  return videoUrl
}

async function tokenHubRequest(pathname, options = {}) {
  if (!process.env.TENCENT_API_KEY) {
    const error = new Error('服务端尚未配置 TENCENT_API_KEY')
    error.status = 503
    throw error
  }
  const response = await fetch(`${tencentTokenHubBaseUrl()}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.TENCENT_API_KEY}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(180000)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.ErrMsg || payload.message || `腾讯 TokenHub 请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  return payload
}

async function generateTencentPixVerseVideo({ file, mode, prompt, ratio, selected }) {
  const model = selected?.id || 'pixverse-video-c1'
  const path = mode === 'image' ? '/v1/wand/pixverse/image-to-video' : '/v1/wand/pixverse/text-to-video'
  const body = {
    model,
    prompt: prompt.trim(),
    duration: 5,
    quality: mode === 'image' ? '540p' : '720p',
    ...(mode === 'image' ? { img_id: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` } : { aspect_ratio: ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(ratio) ? ratio : '16:9' })
  }
  const submitted = await tokenHubRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (Number(submitted.ErrCode || 0) !== 0) throw new Error(submitted.ErrMsg || 'PixVerse 视频任务提交失败')
  const taskId = submitted.Resp?.video_id || submitted.Resp?.id
  if (!taskId) throw new Error('PixVerse 未返回视频任务 ID')
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await wait(5000)
    const task = await tokenHubRequest(`/v1/wand/pixverse/tasks/${encodeURIComponent(taskId)}`)
    if (Number(task.ErrCode || 0) !== 0) throw new Error(task.ErrMsg || 'PixVerse 视频任务查询失败')
    const status = Number(task.Resp?.status)
    if (status === 1) {
      if (!task.Resp?.url) throw new Error('PixVerse 任务成功但未返回视频文件')
      return task.Resp.url
    }
    if ([6, 7, 8].includes(status)) throw new Error(task.ErrMsg || `PixVerse 视频生成失败（状态 ${status}）`)
  }
  const error = new Error('PixVerse 视频生成超时，请稍后重试')
  error.status = 504
  throw error
}

async function generateTencentKlingVideo({ file, mode, prompt, ratio, selected }) {
  const model = selected?.id || 'kling-video-v3'
  const path = mode === 'image' ? '/v1/wand/kling/image-to-video' : '/v1/wand/kling/text-to-video'
  const settings = { resolution: '720p', duration: 5, audio: 'off', multi_shot: mode === 'text' }
  if (mode === 'text') settings.aspect_ratio = ['16:9', '9:16', '1:1'].includes(ratio) ? ratio : '16:9'
  const body = mode === 'image'
    ? { model, contents: [{ type: 'prompt', text: prompt.trim() }, { type: 'first_frame', url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` }], settings }
    : { model, prompt: prompt.trim(), settings }
  const submitted = await tokenHubRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (Number(submitted.code || 0) !== 0) throw new Error(submitted.message || 'Kling V3 视频任务提交失败')
  const taskId = submitted.data?.id
  if (!taskId) throw new Error('Kling V3 未返回视频任务 ID')
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await wait(5000)
    const task = await tokenHubRequest(`/v1/wand/kling/tasks/${encodeURIComponent(taskId)}`)
    if (Number(task.code || 0) !== 0) throw new Error(task.message || 'Kling V3 视频任务查询失败')
    const status = task.data?.status
    if (status === 'succeeded') {
      const videoUrl = task.data?.task_result?.videos?.[0]?.url
      if (!videoUrl) throw new Error('Kling V3 任务成功但未返回视频文件')
      return videoUrl
    }
    if (status === 'failed') throw new Error(task.message || 'Kling V3 视频生成失败')
  }
  const error = new Error('Kling V3 视频生成超时，请稍后重试')
  error.status = 504
  throw error
}

async function generateTencentVideo(options) {
  return options.selected?.id?.startsWith('kling-') ? generateTencentKlingVideo(options) : generateTencentPixVerseVideo(options)
}

async function generateVideo(options) {
  if (options.selected?.provider === 'aliyun') return generateAliyunVideo(options)
  if (options.selected?.provider === 'tencent') return generateTencentVideo(options)
  return generateFalVideo(options)
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

async function withGifSlot(operation) {
  if (activeGifConversions >= GIF_CONCURRENCY) await new Promise(resolve => gifWaiters.push(resolve))
  activeGifConversions += 1
  try { return await operation() }
  finally {
    activeGifConversions -= 1
    gifWaiters.shift()?.()
  }
}

async function updateVideoJob(jobId, patch) {
  const { error } = await supabaseAdmin().from('video_generation_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId)
  if (error) throw error
}

async function syncDramaShotFromJob(job, status, outputUrl = null) {
  try {
    const patch = { status, updated_at: new Date().toISOString() }
    if (outputUrl) patch.output_url = outputUrl
    const { data: shot, error } = await supabaseAdmin().from('short_drama_shots').update(patch).eq('video_job_id', job.id).select('project_id').maybeSingle()
    if (error) throw error
    if (!shot?.project_id) return
    const { data: shots } = await supabaseAdmin().from('short_drama_shots').select('status').eq('project_id', shot.project_id)
    const projectStatus = shots?.length && shots.every(item => item.status === 'completed') ? 'completed' : 'generating'
    await supabaseAdmin().from('short_drama_projects').update({ status: projectStatus, updated_at: new Date().toISOString() }).eq('id', shot.project_id)
  } catch (error) {
    if (error.code !== '42P01') console.error('[drama-shot-sync]', job.id, error.message)
  }
}

async function expireStaleVideoJobs(userId = null) {
  const staleBefore = new Date(Date.now() - VIDEO_JOB_STALE_MS).toISOString()
  let query = supabaseAdmin().from('video_generation_jobs').select('*').in('status', ['processing', 'converting']).lt('updated_at', staleBefore).limit(20)
  if (userId) query = query.eq('user_id', userId)
  const { data: staleJobs, error } = await query
  if (error) {
    if (error.code !== '42P01') console.error('[video-job-expire]', error.message)
    return 0
  }
  let expired = 0
  for (const job of staleJobs || []) {
    const message = `视频任务超过 ${Math.round(VIDEO_JOB_STALE_MS / 60000)} 分钟未更新，已自动停止并退还算力`
    const { data: claimed, error: updateError } = await supabaseAdmin().from('video_generation_jobs')
      .update({ status: 'failed', progress: 100, error_message: message, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', job.id).in('status', ['processing', 'converting']).lt('updated_at', staleBefore).select('*').maybeSingle()
    if (updateError) { console.error('[video-job-expire-update]', job.id, updateError.message); continue }
    if (!claimed) continue
    const timeoutError = new Error(message)
    await rollbackGeneration(job.usage_id, timeoutError)
    await syncDramaShotFromJob(job, 'failed')
    expired += 1
  }
  return expired
}

async function loadVideoJobInput(job) {
  if (job.mode !== 'image') return undefined
  if (!job.input_path) throw new Error('视频任务缺少输入图片')
  const { data, error } = await supabaseAdmin().storage.from('generation-inputs').download(job.input_path)
  if (error) throw error
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    mimetype: job.input_mime || data.type || 'image/jpeg',
    originalname: path.basename(job.input_path)
  }
}

async function processVideoJob(job) {
  try {
    const file = await loadVideoJobInput(job)
    await refreshModelConfigs()
    await updateVideoJob(job.id, { progress: 15 })
    const generatedVideo = await withModelFallback('video', job.model_id, selected => generateVideo({ file, mode: job.mode, prompt: job.prompt, ratio: job.ratio, selected }))
    let outputs
    if (job.output_format === 'gif') {
      await updateVideoJob(job.id, { status: 'converting', progress: 80 })
      outputs = [await withGifSlot(() => videoToGif(generatedVideo.result))]
    } else {
      outputs = [generatedVideo.result]
    }
    const storedOutputs = await archiveOrOriginal(job.user_id, job.usage_id, outputs)
    const { data: currentJob } = await supabaseAdmin().from('video_generation_jobs').select('status').eq('id', job.id).single()
    if (currentJob?.status === 'failed') throw new Error('视频任务已超时终止，生成结果不再入账')
    await finishGeneration(job.usage_id, true)
    await updateVideoJob(job.id, { status: 'completed', progress: 100, output_urls: storedOutputs, finished_at: new Date().toISOString() })
    await syncDramaShotFromJob(job, 'completed', storedOutputs[0] || null)
  } catch (error) {
    console.error('[video-job]', job.id, error.message)
    await rollbackGeneration(job.usage_id, error)
    await updateVideoJob(job.id, { status: 'failed', progress: 100, error_message: String(error.message || '视频生成失败').slice(0, 1000), finished_at: new Date().toISOString() }).catch(updateError => console.error('[video-job-update]', job.id, updateError.message))
    await syncDramaShotFromJob(job, 'failed')
  } finally {
    if (job.input_path) await supabaseAdmin().storage.from('generation-inputs').remove([job.input_path]).catch(() => {})
  }
}

async function claimVideoJob() {
  const { data, error } = await supabaseAdmin().rpc('claim_video_generation_job')
  if (error) {
    if (error.code !== '42883' && error.code !== '42P01') console.error('[video-queue-claim]', error.message)
    return null
  }
  return data?.[0] || null
}

async function pumpVideoJobs() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  if (videoPumpRunning) return
  videoPumpRunning = true
  try {
    while (activeVideoJobs < VIDEO_JOB_CONCURRENCY) {
      const job = await claimVideoJob()
      if (!job) break
      activeVideoJobs += 1
      processVideoJob(job).finally(() => {
        activeVideoJobs -= 1
        setTimeout(pumpVideoJobs, 100)
      })
    }
  } finally { videoPumpRunning = false }
}

function publicVideoJob(job, queuePosition = 0) {
  return {
    id: job.id, usageId: job.usage_id, mode: job.mode, outputFormat: job.output_format,
    status: job.status, progress: job.progress, outputs: job.output_urls || [],
    error: job.error_message || '', queuePosition, createdAt: job.created_at, updatedAt: job.updated_at
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
    const { error } = await supabaseAdmin().storage.from('generated-assets').upload(objectPath, buffer, {
      contentType, upsert: true, cacheControl: '31536000',
      metadata: { ai_generated: 'true', ai_label: AI_LABEL, ai_label_version: AI_LABEL_VERSION }
    })
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
  const { data: usageBefore } = !success ? await supabaseAdmin().from('usage_records').select('user_id,credits,status').eq('id', usageId).single() : { data: null }
  const { error } = await supabaseAdmin().rpc('finish_generation', { p_usage_id: usageId, p_success: success })
  if (error) throw error
  if (!success && usageBefore?.status === 'pending' && usageBefore?.credits > 0) {
    const profile = await profileFor(usageBefore.user_id)
    const { error: ledgerError } = await supabaseAdmin().from('credit_transactions').insert({ user_id: usageBefore.user_id, type: 'refund', amount: usageBefore.credits, balance_after: profile.credits, reference_type: 'usage_record', reference_id: usageId, description: '生成失败自动返还' })
    if (ledgerError && ledgerError.code !== '42P01') console.error('[credit-ledger-refund]', ledgerError.message)
  }
}

async function rollbackGeneration(usageId, error) {
  if (!usageId) return
  try {
    await finishGeneration(usageId, false)
    error.creditsRefunded = true
  } catch (refundError) {
    error.refundPending = true
    console.error('[refund]', usageId, refundError.message)
  }
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
  model: body.selectedModel?.id || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
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
  tencentConfigured: Boolean(process.env.TENCENT_API_KEY),
  textConfigured: Boolean(process.env.DASHSCOPE_API_KEY || process.env.OPENAI_TEXT_API_KEY),
  videoConfigured: Boolean((process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL) || process.env.TENCENT_API_KEY || (process.env.FAL_KEY && process.env.FAL_ENABLED === 'true')),
  mock: mockEnabled,
  model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  videoModel: process.env.VIDEO_MODEL || (videoProvider() === 'aliyun' ? 'wan2.6-i2v-flash' : 'fal-ai/ltx-video/image-to-video'),
  videoProvider: videoProvider(),
  provider: process.env.OPENAI_BASE_URL ? 'openai-compatible' : 'openai'
}))

app.get('/api/models', async (_req, res) => { await refreshModelConfigs(); res.json({ models: modelCatalog(), updatedAt: new Date().toISOString() }) })

app.get('/api/admin/models', requireUser, requireAdmin, async (_req, res, next) => {
  try { await refreshModelConfigs(true); res.json({ models: databaseModels, catalog: modelCatalog() }) } catch (error) { next(error) }
})

app.post('/api/admin/models', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const values = validateModelConfig(req.body)
    const { data, error } = await supabaseAdmin().from('model_configs').insert(values).select('*').single(); if (error) throw error
    await refreshModelConfigs(true); await auditAdmin(req, 'create_model', 'model', data.id, values); res.status(201).json({ model: data })
  } catch (error) { next(error) }
})

app.patch('/api/admin/models/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const values = { ...validateModelConfig(req.body), updated_at: new Date().toISOString() }
    const { data, error } = await supabaseAdmin().from('model_configs').update(values).eq('id', req.params.id).select('*').single(); if (error) throw error
    await refreshModelConfigs(true); await auditAdmin(req, 'update_model', 'model', data.id, values); res.json({ model: data })
  } catch (error) { next(error) }
})

app.delete('/api/admin/models/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin().from('model_configs').delete().eq('id', req.params.id); if (error) throw error
    await refreshModelConfigs(true); await auditAdmin(req, 'delete_model', 'model', req.params.id, {}); res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/auth/register', async (req, res, next) => {
  try {
    if (!allowRegistration(req.ip)) return res.status(429).json({ error: '注册过于频繁，请稍后再试' })
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    const inviteCode = String(req.body.inviteCode || '').trim().toUpperCase()
    if (req.body.acceptedLegal !== true) return res.status(400).json({ error: '请先阅读并同意用户协议和隐私政策' })
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: '请输入有效邮箱' })
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' })
    const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return res.status(409).json({ error: '该邮箱已经注册，请直接登录' })
      throw error
    }
    const { error: ipError } = await supabaseAdmin().from('profiles').update({ registration_ip: req.ip }).eq('id', data.user.id)
    if (ipError && ipError.code !== '42703') console.error('[registration-ip]', ipError.message)
    if (inviteCode) {
      const { data: inviter } = await supabaseAdmin().from('profiles').select('id,referral_code').eq('referral_code', inviteCode).maybeSingle()
      if (inviter && inviter.id !== data.user.id) {
        const { error: referralError } = await supabaseAdmin().from('referrals').insert({ inviter_id: inviter.id, invitee_id: data.user.id, invite_code: inviteCode })
        if (referralError) console.error('[referral-register]', referralError.message)
      }
    }
    const consentRows = ['terms', 'privacy', 'ai_rules'].map(documentType => ({ user_id: data.user.id, document_type: documentType, document_version: LEGAL_VERSION, ip_address: req.ip, user_agent: String(req.headers['user-agent'] || '').slice(0, 500) }))
    const { error: consentError } = await supabaseAdmin().from('user_consents').insert(consentRows)
    if (consentError) console.error('[legal-consent]', consentError.message)
    res.status(201).json({ user: { id: data.user.id, email: data.user.email } })
  } catch (error) { next(error) }
})

app.get('/api/me', requireUser, async (req, res, next) => {
  try { res.json({ user: await profileFor(req.user.id) }) } catch (error) { next(error) }
})

app.get('/api/me/export', requireUser, async (req, res, next) => {
  try {
    const userId = req.user.id
    const queries = {
      profile: supabaseAdmin().from('profiles').select('id,email,credits,is_admin,created_at').eq('id', userId).single(),
      usageRecords: supabaseAdmin().from('usage_records').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      favorites: supabaseAdmin().from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      rechargeOrders: supabaseAdmin().from('recharge_orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      creditTransactions: supabaseAdmin().from('credit_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      refunds: supabaseAdmin().from('refund_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      consents: supabaseAdmin().from('user_consents').select('*').eq('user_id', userId).order('accepted_at', { ascending: false }),
      referrals: supabaseAdmin().from('referrals').select('*').or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`).order('created_at', { ascending: false }),
      supportConversations: supabaseAdmin().from('support_conversations').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    }
    const entries = await Promise.all(Object.entries(queries).map(async ([key, query]) => {
      const { data, error } = await query
      if (error && error.code !== '42P01') throw error
      return [key, data || (key === 'profile' ? null : [])]
    }))
    const exported = Object.fromEntries(entries)
    const conversationIds = (exported.supportConversations || []).map(item => item.id)
    exported.supportMessages = []
    if (conversationIds.length) {
      const { data, error } = await supabaseAdmin().from('support_messages').select('*').in('conversation_id', conversationIds).order('created_at')
      if (error && error.code !== '42P01') throw error
      exported.supportMessages = data || []
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="lingjing-account-${new Date().toISOString().slice(0, 10)}.json"`)
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), formatVersion: 1, account: exported }, null, 2))
  } catch (error) { next(error) }
})

app.get('/api/usage', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('usage_records').select('id,action,image_count,credits,status,prompt,output_urls,output_text,ai_generated,ai_label,ai_label_version,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    res.json({ records: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/users', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim()
    let query = supabaseAdmin().from('profiles').select('id,email,credits,is_admin,generation_blocked_until,generation_block_reason,created_at').order('created_at', { ascending: false }).limit(200)
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

app.post('/api/usage/:id/feedback', requireUser, async (req, res, next) => {
  try {
    if (typeof req.body.helpful !== 'boolean') return res.status(400).json({ error: '请选择有帮助或不满意' })
    const { data: usage, error: usageError } = await supabaseAdmin().from('usage_records').select('id,user_id,status').eq('id', req.params.id).eq('user_id', req.user.id).single()
    if (usageError) throw usageError
    if (usage.status !== 'completed') return res.status(409).json({ error: '只有成功生成的内容可以评价' })
    const values = { usage_id: usage.id, user_id: req.user.id, helpful: req.body.helpful, reason: String(req.body.reason || '').trim().slice(0, 300) || null, updated_at: new Date().toISOString() }
    const { data, error } = await supabaseAdmin().from('generation_feedback').upsert(values, { onConflict: 'usage_id' }).select('id,usage_id,helpful,reason,updated_at').single()
    if (error) throw error
    res.json({ feedback: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/generation-feedback', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('generation_feedback').select('id,usage_id,user_id,helpful,reason,created_at,usage_records(action,prompt)').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    const userIds = [...new Set((data || []).map(item => item.user_id))]; const { data: users } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [] }; const emails = new Map((users || []).map(item => [item.id,item.email]))
    const total = data?.length || 0; const helpful = (data || []).filter(item => item.helpful).length
    res.json({ stats: { total, helpful, unhelpful: total-helpful, satisfactionRate: total ? Math.round(helpful / total * 1000) / 10 : 0 }, feedback: (data || []).map(item => ({ ...item, action: item.usage_records?.action || '', prompt: item.usage_records?.prompt || '', email: emails.get(item.user_id) || '' })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/audit-logs', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data: logs, error } = await supabaseAdmin().from('admin_audit_logs').select('id,admin_id,action,target_type,target_id,details,ip_address,created_at').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    const adminIds = [...new Set((logs || []).map(item => item.admin_id))]
    const { data: admins, error: adminError } = adminIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', adminIds) : { data: [], error: null }
    if (adminError) throw adminError
    const emails = new Map((admins || []).map(item => [item.id, item.email]))
    res.json({ logs: (logs || []).map(item => ({ ...item, admin_email: emails.get(item.admin_id) || item.admin_id })) })
  } catch (error) { next(error) }
})

app.post('/api/events', async (req, res, next) => {
  try {
    const allowed = ['page_view', 'onboarding_view', 'onboarding_start', 'template_select', 'login_prompt', 'generation_success', 'recharge_open', 'recharge_order']
    const eventType = String(req.body.eventType || '')
    const anonymousId = String(req.body.anonymousId || '').slice(0, 100)
    if (!allowed.includes(eventType) || !anonymousId) return res.status(400).json({ error: '无效事件' })
    const ip = req.ip || req.socket.remoteAddress || 'unknown'; const now = Date.now(); const recent = (productEventAttempts.get(ip) || []).filter(time => now - time < 3600000)
    if (recent.length >= 100) return res.status(429).json({ error: '事件上报过于频繁' }); recent.push(now); productEventAttempts.set(ip, recent)
    let userId = null; const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (token) { const { data } = await supabaseAdmin().auth.getUser(token); userId = data.user?.id || null }
    const metadata = req.body.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata) ? Object.fromEntries(Object.entries(req.body.metadata).slice(0, 20).map(([key, value]) => [String(key).slice(0, 60), String(value).slice(0, 300)])) : {}
    const { error } = await supabaseAdmin().from('product_events').insert({ anonymous_id: anonymousId, user_id: userId, event_type: eventType, metadata, ip_address: ip })
    if (error) throw error
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/admin/business-analytics', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
    const since = new Date(Date.now() - (days - 1) * 86400000); since.setUTCHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()
    const paidStatuses = ['paid', 'partially_refunded', 'refunded']
    const [{ data: profiles, error: profileError }, { data: orders, error: orderError }, { data: refunds, error: refundError }, { data: usage, error: usageError }] = await Promise.all([
      supabaseAdmin().from('profiles').select('id,created_at').limit(10000),
      supabaseAdmin().from('recharge_orders').select('id,user_id,amount_fen,status,created_at,paid_at').in('status', paidStatuses).limit(10000),
      supabaseAdmin().from('refund_requests').select('id,user_id,requested_amount_fen,status,reviewed_at,created_at').eq('status', 'approved').limit(10000),
      supabaseAdmin().from('usage_records').select('action,status,credits,estimated_cost_fen,created_at').gte('created_at', sinceIso).limit(10000)
    ])
    if (profileError) throw profileError; if (orderError) throw orderError; if (refundError) throw refundError; if (usageError) throw usageError
    const periodOrders = (orders || []).filter(item => item.paid_at && item.paid_at >= sinceIso)
    const periodRefunds = (refunds || []).filter(item => (item.reviewed_at || item.created_at) >= sinceIso)
    const periodProfiles = (profiles || []).filter(item => item.created_at >= sinceIso)
    const revenueFen = periodOrders.reduce((sum, item) => sum + Number(item.amount_fen || 0), 0)
    const refundFen = periodRefunds.reduce((sum, item) => sum + Number(item.requested_amount_fen || 0), 0)
    const netRevenueFen = Math.max(0, revenueFen - refundFen)
    const completedUsage = (usage || []).filter(item => item.status === 'completed')
    const estimatedCostFen = completedUsage.reduce((sum, item) => sum + Number(item.estimated_cost_fen || 0), 0)
    const payingUsers = new Set(periodOrders.map(item => item.user_id))
    const lifetimeOrderCounts = (orders || []).reduce((map, item) => map.set(item.user_id, (map.get(item.user_id) || 0) + 1), new Map())
    const repeatPayingUsers = [...payingUsers].filter(userId => (lifetimeOrderCounts.get(userId) || 0) >= 2).length
    const newUserIds = new Set(periodProfiles.map(item => item.id))
    const convertedNewUsers = new Set((orders || []).filter(item => newUserIds.has(item.user_id)).map(item => item.user_id)).size
    const failedCount = (usage || []).filter(item => item.status === 'failed').length
    const allFinished = completedUsage.length + failedCount
    const byActionMap = new Map()
    for (const item of usage || []) { const row = byActionMap.get(item.action) || { action: item.action, completed: 0, failed: 0, credits: 0, estimatedCostFen: 0 }; if (item.status === 'completed') { row.completed += 1; row.credits += Number(item.credits || 0); row.estimatedCostFen += Number(item.estimated_cost_fen || 0) } else if (item.status === 'failed') row.failed += 1; byActionMap.set(item.action, row) }
    const dateKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
    const trend = new Map()
    for (let offset = 0; offset < days; offset += 1) { const date = new Date(since.getTime() + offset * 86400000); trend.set(dateKey(date), { date: dateKey(date), revenueFen: 0, refundFen: 0, costFen: 0, generations: 0, registrations: 0 }) }
    periodOrders.forEach(item => { const row = trend.get(dateKey(item.paid_at)); if (row) row.revenueFen += Number(item.amount_fen || 0) })
    periodRefunds.forEach(item => { const row = trend.get(dateKey(item.reviewed_at || item.created_at)); if (row) row.refundFen += Number(item.requested_amount_fen || 0) })
    completedUsage.forEach(item => { const row = trend.get(dateKey(item.created_at)); if (row) { row.costFen += Number(item.estimated_cost_fen || 0); row.generations += 1 } })
    periodProfiles.forEach(item => { const row = trend.get(dateKey(item.created_at)); if (row) row.registrations += 1 })
    res.json({ days, freshness: new Date().toISOString(), metrics: { totalUsers: profiles?.length || 0, newUsers: periodProfiles.length, payingUsers: payingUsers.size, newUserConversionRate: periodProfiles.length ? convertedNewUsers / periodProfiles.length : 0, repeatPurchaseRate: payingUsers.size ? repeatPayingUsers / payingUsers.size : 0, paidOrders: periodOrders.length, revenueFen, refundFen, netRevenueFen, estimatedCostFen, estimatedGrossProfitFen: netRevenueFen - estimatedCostFen, successRate: allFinished ? completedUsage.length / allFinished : 0, completedGenerations: completedUsage.length }, byAction: [...byActionMap.values()].sort((a, b) => b.completed - a.completed), trend: [...trend.values()] })
  } catch (error) { next(error) }
})

app.get('/api/admin/content-safety', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const [{ data: settings, error: settingsError }, { data: events, error: eventsError }] = await Promise.all([
      supabaseAdmin().from('content_safety_settings').select('*').eq('id', true).single(),
      supabaseAdmin().from('moderation_events').select('id,user_id,source,category,matched_rule,content_excerpt,action,created_at').order('created_at', { ascending: false }).limit(100)
    ])
    if (settingsError) throw settingsError; if (eventsError) throw eventsError
    const userIds = [...new Set((events || []).map(item => item.user_id).filter(Boolean))]
    const { data: profiles, error: profileError } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [], error: null }
    if (profileError) throw profileError
    const emails = new Map((profiles || []).map(item => [item.id, item.email]))
    res.json({ settings, events: (events || []).map(item => ({ ...item, email: emails.get(item.user_id) || '匿名/已删除用户' })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/content-safety', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const terms = [...new Set((Array.isArray(req.body.custom_blocked_terms) ? req.body.custom_blocked_terms : []).map(item => String(item).trim().slice(0, 80)).filter(Boolean))].slice(0, 200)
    const { data, error } = await supabaseAdmin().from('content_safety_settings').update({ active: req.body.active === true, custom_blocked_terms: terms, updated_by: req.user.id, updated_at: new Date().toISOString() }).eq('id', true).select('*').single()
    if (error) throw error
    res.json({ settings: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/cost-control', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const now = new Date()
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter(item => item.type !== 'literal').map(item => [item.type, item.value]))
    const dayStart = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`).toISOString()
    const monthStart = new Date(`${parts.year}-${parts.month}-01T00:00:00+08:00`).toISOString()
    const [{ data: settings, error: settingsError }, { data: usage, error: usageError }] = await Promise.all([
      supabaseAdmin().from('cost_control_settings').select('*').eq('id', true).single(),
      supabaseAdmin().from('usage_records').select('action,estimated_cost_fen,status,created_at').in('status', ['pending', 'completed']).gte('created_at', monthStart)
    ])
    if (settingsError) throw settingsError
    if (usageError) throw usageError
    const monthUsedFen = (usage || []).reduce((sum, item) => sum + Number(item.estimated_cost_fen || 0), 0)
    const dayUsedFen = (usage || []).filter(item => item.created_at >= dayStart).reduce((sum, item) => sum + Number(item.estimated_cost_fen || 0), 0)
    const byAction = (usage || []).reduce((result, item) => { result[item.action] = (result[item.action] || 0) + Number(item.estimated_cost_fen || 0); return result }, {})
    res.json({ settings, stats: { dayUsedFen, monthUsedFen, byAction } })
  } catch (error) { next(error) }
})

app.get('/api/admin/system-health', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const now = Date.now()
    const hourAgo = new Date(now - 3600000).toISOString()
    const staleBefore = new Date(now - 20 * 60000).toISOString()
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(item => item.type !== 'literal').map(item => [item.type, item.value]))
    const dayStart = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`).toISOString()
    const monthStart = new Date(`${parts.year}-${parts.month}-01T00:00:00+08:00`).toISOString()
    const [{ data: settings, error: settingsError }, { data: recent, error: recentError }, { data: monthUsage, error: monthError }] = await Promise.all([
      supabaseAdmin().from('cost_control_settings').select('active,daily_limit_fen,monthly_limit_fen').eq('id', true).single(),
      supabaseAdmin().from('usage_records').select('id,user_id,action,status,created_at').gte('created_at', hourAgo).order('created_at', { ascending: false }).limit(500),
      supabaseAdmin().from('usage_records').select('estimated_cost_fen,status,created_at').in('status', ['pending', 'completed']).gte('created_at', monthStart)
    ])
    if (settingsError) throw settingsError
    if (recentError) throw recentError
    if (monthError) throw monthError
    const failedHour = (recent || []).filter(item => item.status === 'failed').length
    const pending = (recent || []).filter(item => item.status === 'pending')
    const stale = pending.filter(item => item.created_at < staleBefore)
    const monthUsedFen = (monthUsage || []).reduce((sum, item) => sum + Number(item.estimated_cost_fen || 0), 0)
    const dayUsedFen = (monthUsage || []).filter(item => item.created_at >= dayStart).reduce((sum, item) => sum + Number(item.estimated_cost_fen || 0), 0)
    const percent = (used, limit) => limit > 0 ? Math.round(used / limit * 100) : 0
    const dayPercent = percent(dayUsedFen, settings.daily_limit_fen)
    const monthPercent = percent(monthUsedFen, settings.monthly_limit_fen)
    const alerts = []
    if (!settings.active) alerts.push({ level: 'warning', code: 'generation_paused', message: '全站 AI 生成当前处于关闭状态' })
    if (dayPercent >= 80) alerts.push({ level: dayPercent >= 100 ? 'critical' : 'warning', code: 'daily_budget', message: `今日预算已使用 ${dayPercent}%` })
    if (monthPercent >= 80) alerts.push({ level: monthPercent >= 100 ? 'critical' : 'warning', code: 'monthly_budget', message: `本月预算已使用 ${monthPercent}%` })
    if (failedHour >= 3) alerts.push({ level: failedHour >= 8 ? 'critical' : 'warning', code: 'failures', message: `最近 1 小时有 ${failedHour} 个生成任务失败` })
    if (pending.length >= 5) alerts.push({ level: 'warning', code: 'pending', message: `当前检测到 ${pending.length} 个生成中任务` })
    if (stale.length) alerts.push({ level: 'critical', code: 'stale', message: `${stale.length} 个任务已超过 20 分钟，可能需要退款清理` })
    const configured = {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      image: Boolean(process.env.OPENAI_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.TENCENT_API_KEY), text: Boolean(process.env.DASHSCOPE_API_KEY || process.env.OPENAI_TEXT_API_KEY),
      video: Boolean((process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL) || process.env.TENCENT_API_KEY || (process.env.FAL_KEY && process.env.FAL_ENABLED === 'true'))
    }
    for (const [provider, ok] of Object.entries(configured)) if (!ok) alerts.push({ level: 'critical', code: `provider_${provider}`, message: `${provider} 服务尚未完整配置` })
    res.json({ status: alerts.some(item => item.level === 'critical') ? 'critical' : (alerts.length ? 'warning' : 'healthy'), checkedAt: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()), configured, metrics: { failedHour, pending: pending.length, stale: stale.length, dayUsedFen, monthUsedFen, dayPercent, monthPercent }, alerts })
  } catch (error) { next(error) }
})

app.post('/api/admin/system-health/cleanup-stale', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const staleBefore = new Date(Date.now() - 20 * 60000).toISOString()
    const { data, error } = await supabaseAdmin().from('usage_records').select('id').eq('status', 'pending').lt('created_at', staleBefore).limit(100)
    if (error) throw error
    let cleaned = 0
    for (const item of data || []) { await finishGeneration(item.id, false); cleaned += 1 }
    res.json({ cleaned })
  } catch (error) { next(error) }
})

app.get('/api/admin/data-lifecycle', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data: settings, error: settingsError } = await supabaseAdmin().from('data_lifecycle_settings').select('*').eq('id', true).single()
    if (settingsError) throw settingsError
    const assetBefore = new Date(Date.now() - settings.generated_asset_days * 86400000).toISOString()
    const supportBefore = new Date(Date.now() - settings.closed_support_days * 86400000).toISOString()
    const [{ data: assets, error: assetError }, { count: supportCount, error: supportError }] = await Promise.all([
      supabaseAdmin().from('usage_records').select('id,output_urls').lt('created_at', assetBefore).limit(1000),
      supabaseAdmin().from('support_conversations').select('id', { count: 'exact', head: true }).eq('status', 'closed').lt('updated_at', supportBefore)
    ])
    if (assetError) throw assetError
    if (supportError) throw supportError
    const assetRecords = (assets || []).filter(item => Array.isArray(item.output_urls) && item.output_urls.length)
    const assetCount = assetRecords.reduce((sum, item) => sum + item.output_urls.length, 0)
    res.json({ settings, preview: { assetRecords: assetRecords.length, assetFiles: assetCount, closedSupport: supportCount || 0 } })
  } catch (error) { next(error) }
})

app.patch('/api/admin/data-lifecycle', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const generatedAssetDays = Number(req.body.generated_asset_days)
    const closedSupportDays = Number(req.body.closed_support_days)
    if (!Number.isInteger(generatedAssetDays) || generatedAssetDays < 7 || generatedAssetDays > 3650 || !Number.isInteger(closedSupportDays) || closedSupportDays < 30 || closedSupportDays > 3650) return res.status(400).json({ error: '作品保留天数需为 7–3650 天，客服记录需为 30–3650 天' })
    const { data, error } = await supabaseAdmin().from('data_lifecycle_settings').update({ generated_asset_days: generatedAssetDays, closed_support_days: closedSupportDays, updated_by: req.user.id, updated_at: new Date().toISOString() }).eq('id', true).select('*').single()
    if (error) throw error
    res.json({ settings: data })
  } catch (error) { next(error) }
})

app.post('/api/admin/data-lifecycle/cleanup', requireUser, requireAdmin, async (req, res, next) => {
  try {
    if (req.body.confirm !== 'CLEANUP_EXPIRED_DATA') return res.status(400).json({ error: '需要明确确认清理操作' })
    const { data: settings, error: settingsError } = await supabaseAdmin().from('data_lifecycle_settings').select('*').eq('id', true).single()
    if (settingsError) throw settingsError
    const assetBefore = new Date(Date.now() - settings.generated_asset_days * 86400000).toISOString()
    const supportBefore = new Date(Date.now() - settings.closed_support_days * 86400000).toISOString()
    const { data: oldRecords, error: recordsError } = await supabaseAdmin().from('usage_records').select('id,output_urls').lt('created_at', assetBefore).limit(1000)
    if (recordsError) throw recordsError
    const records = (oldRecords || []).filter(item => Array.isArray(item.output_urls) && item.output_urls.length)
    const marker = '/storage/v1/object/public/generated-assets/'
    const paths = records.flatMap(item => item.output_urls).map(url => { const index = String(url).indexOf(marker); return index >= 0 ? decodeURIComponent(String(url).slice(index + marker.length)) : '' }).filter(Boolean)
    for (let index = 0; index < paths.length; index += 100) { const { error } = await supabaseAdmin().storage.from('generated-assets').remove(paths.slice(index, index + 100)); if (error) throw error }
    const ids = records.map(item => item.id)
    if (ids.length) { const { error } = await supabaseAdmin().from('usage_records').update({ output_urls: [] }).in('id', ids); if (error) throw error }
    const { data: oldConversations, error: supportReadError } = await supabaseAdmin().from('support_conversations').select('id').eq('status', 'closed').lt('updated_at', supportBefore).limit(1000)
    if (supportReadError) throw supportReadError
    const conversationIds = (oldConversations || []).map(item => item.id)
    if (conversationIds.length) { const { error } = await supabaseAdmin().from('support_conversations').delete().in('id', conversationIds); if (error) throw error }
    await supabaseAdmin().from('data_lifecycle_settings').update({ last_cleanup_at: new Date().toISOString(), updated_by: req.user.id, updated_at: new Date().toISOString() }).eq('id', true)
    res.json({ cleaned: { assetRecords: ids.length, assetFiles: paths.length, closedSupport: conversationIds.length } })
  } catch (error) { next(error) }
})

app.get('/api/admin/data-export', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const tables = ['profiles', 'usage_records', 'recharge_orders', 'credit_transactions', 'credit_packages', 'refund_requests', 'referrals', 'referral_settings', 'favorites', 'support_conversations', 'support_messages', 'user_consents', 'payment_settings', 'cost_control_settings', 'data_lifecycle_settings']
    const entries = await Promise.all(tables.map(async table => { const { data, error } = await supabaseAdmin().from(table).select('*').limit(10000); if (error) throw new Error(`${table}: ${error.message}`); return [table, data || []] }))
    res.setHeader('Content-Disposition', `attachment; filename="lingjing-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({ format: 'lingjing-business-backup-v1', exportedAt: new Date().toISOString(), note: 'Contains business records and generated asset URLs; media file bytes are not embedded.', data: Object.fromEntries(entries) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/cost-control', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const allowedActions = ['copy_generation', 'prompt_enhance', 'image_generation', 'image_edit', 'gif_generation', 'video_generation']
    const dailyLimitFen = Number(req.body.daily_limit_fen)
    const monthlyLimitFen = Number(req.body.monthly_limit_fen)
    const perUserDailyRequestLimit = Number(req.body.per_user_daily_request_limit)
    const perUserDailyCostLimitFen = Number(req.body.per_user_daily_cost_limit_fen)
    const maxPendingPerUser = Number(req.body.max_pending_per_user)
    const minIntervalSeconds = Number(req.body.min_interval_seconds)
    const failureHourLimit = Number(req.body.failure_hour_limit)
    const actionCosts = Object.fromEntries(allowedActions.map(action => [action, Number(req.body.action_costs?.[action])]))
    const disabledActions = [...new Set(Array.isArray(req.body.disabled_actions) ? req.body.disabled_actions.filter(action => allowedActions.includes(action)) : [])]
    if (![dailyLimitFen, monthlyLimitFen, perUserDailyRequestLimit, perUserDailyCostLimitFen, minIntervalSeconds, failureHourLimit, ...Object.values(actionCosts)].every(value => Number.isInteger(value) && value >= 0 && value <= 100000000) || !Number.isInteger(maxPendingPerUser) || maxPendingPerUser < 1 || maxPendingPerUser > 100) return res.status(400).json({ error: '预算、成本和风控限制必须是有效的非负整数' })
    const { data, error } = await supabaseAdmin().from('cost_control_settings').update({
      active: req.body.active === true, daily_limit_fen: dailyLimitFen, monthly_limit_fen: monthlyLimitFen,
      action_costs: actionCosts, disabled_actions: disabledActions, per_user_daily_request_limit: perUserDailyRequestLimit,
      per_user_daily_cost_limit_fen: perUserDailyCostLimitFen, max_pending_per_user: maxPendingPerUser,
      min_interval_seconds: minIntervalSeconds, failure_hour_limit: failureHourLimit,
      updated_by: req.user.id, updated_at: new Date().toISOString()
    }).eq('id', true).select('*').single()
    if (error) throw error
    res.json({ settings: data })
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
    await auditAdmin(req, 'adjust_credits', 'user', req.params.id, { amount, balanceAfter: data, reason: String(req.body.reason || '') })
    res.json({ credits: data })
  } catch (error) { next(error) }
})

app.post('/api/admin/users/:id/generation-block', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const block = req.body.block === true
    const hours = Math.min(24 * 365, Math.max(1, Number(req.body.hours) || 24))
    const reason = String(req.body.reason || '管理员风控限制').trim().slice(0, 300)
    if (req.params.id === req.user.id && block) return res.status(400).json({ error: '不能封禁当前管理员账号' })
    const values = block ? { generation_blocked_until: new Date(Date.now() + hours * 3600000).toISOString(), generation_block_reason: reason } : { generation_blocked_until: null, generation_block_reason: null }
    const { data, error } = await supabaseAdmin().from('profiles').update(values).eq('id', req.params.id).select('generation_blocked_until,generation_block_reason').single()
    if (error) throw error
    res.json({ block: data })
  } catch (error) { next(error) }
})

app.get('/api/referrals/me', requireUser, async (req, res, next) => {
  try {
    const [{ data: profile, error: profileError }, { data: settings, error: settingsError }, { data: referrals, error: referralsError }] = await Promise.all([
      supabaseAdmin().from('profiles').select('referral_code').eq('id', req.user.id).single(),
      supabaseAdmin().from('referral_settings').select('active,inviter_reward,invitee_reward,per_inviter_daily_limit,per_inviter_monthly_limit').eq('id', true).single(),
      supabaseAdmin().from('referrals').select('id,status,inviter_reward,invitee_reward,rewarded_at,created_at').eq('inviter_id', req.user.id).order('created_at', { ascending: false }).limit(100)
    ])
    if (profileError) throw profileError; if (settingsError) throw settingsError; if (referralsError) throw referralsError
    res.json({ code: profile.referral_code, settings, referrals: referrals || [] })
  } catch (error) { next(error) }
})

app.get('/api/admin/referrals', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
    const [{ data: settings, error: settingsError }, { data: referrals, error: referralsError }] = await Promise.all([
      supabaseAdmin().from('referral_settings').select('*').eq('id', true).single(),
      supabaseAdmin().from('referrals').select('id,inviter_id,invitee_id,invite_code,status,inviter_reward,invitee_reward,rewarded_at,created_at,qualification_order_id,review_reason').order('created_at', { ascending: false }).limit(200)
    ])
    if (settingsError) throw settingsError; if (referralsError) throw referralsError
    const ids = [...new Set((referrals || []).flatMap(item => [item.inviter_id, item.invitee_id]))]
    const { data: profiles, error: profilesError } = ids.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', ids) : { data: [], error: null }
    if (profilesError) throw profilesError
    const emails = new Map((profiles || []).map(item => [item.id, item.email]))
    const monthRewarded = (referrals || []).filter(item => item.status === 'rewarded' && new Date(item.rewarded_at) >= monthStart)
    res.json({ settings, stats: { total: referrals?.length || 0, rewarded: referrals?.filter(item => item.status === 'rewarded').length || 0, monthSpent: monthRewarded.reduce((sum, item) => sum + item.inviter_reward + item.invitee_reward, 0) }, referrals: (referrals || []).map(item => ({ ...item, inviter_email: emails.get(item.inviter_id), invitee_email: emails.get(item.invitee_id) })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/referral-settings', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const values = { active: req.body.active === true, inviter_reward: Number(req.body.inviter_reward), invitee_reward: Number(req.body.invitee_reward), monthly_budget: Number(req.body.monthly_budget), per_inviter_daily_limit: Number(req.body.per_inviter_daily_limit), per_inviter_monthly_limit: Number(req.body.per_inviter_monthly_limit), updated_at: new Date().toISOString() }
    if (![values.inviter_reward, values.invitee_reward, values.monthly_budget, values.per_inviter_daily_limit, values.per_inviter_monthly_limit].every(value => Number.isInteger(value) && value >= 0 && value <= 1000000)) return res.status(400).json({ error: '邀请奖励和预算必须是非负整数' })
    const { data, error } = await supabaseAdmin().from('referral_settings').update(values).eq('id', true).select('*').single()
    if (error) throw error
    res.json({ settings: data })
  } catch (error) { next(error) }
})

app.get('/api/community/posts', async (req, res, next) => {
  try {
    const category = String(req.query.category || '').trim(); const sort = req.query.sort === 'popular' ? 'popular' : 'latest'
    let query = supabaseAdmin().from('community_posts').select('id,user_id,asset_url,media_type,title,category,prompt_visibility,prompt,view_count,favorite_count,remix_count,created_at').eq('status', 'approved').limit(60)
    if (category && category !== '全部') query = query.eq('category', category)
    query = sort === 'popular' ? query.order('favorite_count', { ascending: false }).order('created_at', { ascending: false }) : query.order('created_at', { ascending: false })
    const { data, error } = await query; if (error) throw error
    const userIds = [...new Set((data || []).map(item => item.user_id))]; const { data: users } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [] }; const emails = new Map((users || []).map(item => [item.id,item.email]))
    let viewerId = ''; const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (token) { const auth = await supabaseAdmin().auth.getUser(token); viewerId = auth.data.user?.id || '' }
    const postIds = (data || []).map(item => item.id); const { data: favorites } = viewerId && postIds.length ? await supabaseAdmin().from('community_favorites').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : { data: [] }; const favoriteIds = new Set((favorites || []).map(item => item.post_id))
    res.json({ posts: (data || []).map(item => ({ ...item, prompt: item.prompt_visibility === 'full' ? item.prompt : '', author: (emails.get(item.user_id) || '用户').split('@')[0], favorited: favoriteIds.has(item.id) })) })
  } catch (error) { next(error) }
})

app.post('/api/community/posts', requireUser, async (req, res, next) => {
  try {
    const usageId = String(req.body.usageId || ''); const assetUrl = String(req.body.assetUrl || '').trim(); const title = String(req.body.title || '').trim().slice(0,80); const mediaType = String(req.body.mediaType || 'image'); const category = String(req.body.category || '其他').trim().slice(0,30); const promptVisibility = ['full','remix_only','hidden'].includes(req.body.promptVisibility) ? req.body.promptVisibility : 'full'
    if (!usageId || !assetUrl || !title || !['image','gif','video'].includes(mediaType)) return res.status(400).json({ error: '请完整填写发布信息' })
    const { data: usage, error: usageError } = await supabaseAdmin().from('usage_records').select('id,user_id,status,prompt,output_urls').eq('id', usageId).eq('user_id', req.user.id).single(); if (usageError) throw usageError
    if (usage.status !== 'completed' || !(usage.output_urls || []).includes(assetUrl)) return res.status(403).json({ error: '只能发布你在本站成功生成的作品' })
    const { data, error } = await supabaseAdmin().from('community_posts').insert({ user_id: req.user.id, usage_id: usage.id, asset_url: assetUrl, media_type: mediaType, title, category, prompt_visibility: promptVisibility, prompt: usage.prompt, status: 'pending' }).select('*').single(); if (error) throw error
    res.json({ post: data, message: '作品已提交，审核通过后将在灵感广场展示' })
  } catch (error) { next(error) }
})

app.post('/api/community/posts/:id/favorite', requireUser, async (req, res, next) => {
  try {
    const existing = await supabaseAdmin().from('community_favorites').select('post_id').eq('post_id', req.params.id).eq('user_id', req.user.id).maybeSingle(); let favorited
    if (existing.data) { const { error } = await supabaseAdmin().from('community_favorites').delete().eq('post_id', req.params.id).eq('user_id', req.user.id); if (error) throw error; favorited = false } else { const { error } = await supabaseAdmin().from('community_favorites').insert({ post_id: req.params.id, user_id: req.user.id }); if (error) throw error; favorited = true }
    const { count, error: countError } = await supabaseAdmin().from('community_favorites').select('post_id', { count: 'exact', head: true }).eq('post_id', req.params.id); if (countError) throw countError
    await supabaseAdmin().from('community_posts').update({ favorite_count: count || 0, updated_at: new Date().toISOString() }).eq('id', req.params.id)
    res.json({ favorited, favoriteCount: count || 0 })
  } catch (error) { next(error) }
})

app.post('/api/community/posts/:id/remix', requireUser, async (req, res, next) => {
  try {
    const { data: post, error } = await supabaseAdmin().from('community_posts').select('id,prompt,prompt_visibility,media_type').eq('id', req.params.id).eq('status','approved').single(); if (error) throw error
    await supabaseAdmin().from('community_remixes').upsert({ post_id: post.id, user_id: req.user.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
    const { count } = await supabaseAdmin().from('community_remixes').select('post_id', { count: 'exact', head: true }).eq('post_id', post.id); await supabaseAdmin().from('community_posts').update({ remix_count: count || 0 }).eq('id', post.id)
    res.json({ prompt: post.prompt_visibility === 'hidden' ? '' : post.prompt, mediaType: post.media_type })
  } catch (error) { next(error) }
})

app.post('/api/community/posts/:id/report', requireUser, async (req, res, next) => {
  try { const reason = String(req.body.reason || '').trim().slice(0,500); if (!reason) return res.status(400).json({ error: '请填写举报原因' }); const { error } = await supabaseAdmin().from('community_reports').upsert({ post_id: req.params.id, user_id: req.user.id, reason, status: 'pending' }, { onConflict: 'post_id,user_id' }); if (error) throw error; res.json({ message: '举报已提交，管理员会尽快处理' }) } catch (error) { next(error) }
})

app.get('/api/admin/community', requireUser, requireAdmin, async (_req, res, next) => {
  try { const { data: posts, error } = await supabaseAdmin().from('community_posts').select('*').order('created_at', { ascending: false }).limit(200); if (error) throw error; const ids = [...new Set((posts || []).map(item => item.user_id))]; const { data: users } = ids.length ? await supabaseAdmin().from('profiles').select('id,email').in('id',ids) : { data: [] }; const emails = new Map((users || []).map(item => [item.id,item.email])); const { data: reports } = await supabaseAdmin().from('community_reports').select('id,post_id,reason,status,created_at').eq('status','pending').order('created_at',{ascending:false}); res.json({ posts: (posts || []).map(item => ({...item,email:emails.get(item.user_id)||''})), reports: reports || [] }) } catch (error) { next(error) }
})

app.patch('/api/admin/community/:id', requireUser, requireAdmin, async (req, res, next) => {
  try { const status = ['approved','rejected','removed'].includes(req.body.status) ? req.body.status : ''; if (!status) return res.status(400).json({ error:'无效审核状态' }); const values = { status, review_reason: String(req.body.reason || '').slice(0,500) || null, reviewed_by:req.user.id, reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() }; const { data,error } = await supabaseAdmin().from('community_posts').update(values).eq('id',req.params.id).select('*').single(); if(error) throw error; await supabaseAdmin().from('community_reports').update({status:'resolved'}).eq('post_id',req.params.id).eq('status','pending'); await auditAdmin(req,'review_community_post','community_post',req.params.id,{status,reason:values.review_reason}); res.json({post:data}) } catch(error){next(error)}
})

app.get('/api/favorites', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('favorites').select('id,asset_url,media_type,prompt,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    res.json({ favorites: data || [] })
  } catch (error) { next(error) }
})

app.post('/api/favorites/toggle', requireUser, async (req, res, next) => {
  try {
    const assetUrl = String(req.body.assetUrl || '').trim()
    const mediaType = ['image', 'gif', 'video'].includes(req.body.mediaType) ? req.body.mediaType : 'image'
    const prompt = String(req.body.prompt || '').trim().slice(0, 1000) || null
    if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) return res.status(400).json({ error: '收藏作品地址无效' })
    const existing = await supabaseAdmin().from('favorites').select('id').eq('user_id', req.user.id).eq('asset_url', assetUrl).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) {
      const { error } = await supabaseAdmin().from('favorites').delete().eq('id', existing.data.id).eq('user_id', req.user.id)
      if (error) throw error
      return res.json({ favorited: false, id: existing.data.id })
    }
    const { data, error } = await supabaseAdmin().from('favorites').insert({ user_id: req.user.id, asset_url: assetUrl, media_type: mediaType, prompt }).select('id,asset_url,media_type,prompt,created_at').single()
    if (error) throw error
    res.status(201).json({ favorited: true, favorite: data })
  } catch (error) { next(error) }
})

app.get('/api/admin/support/conversations', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data: conversations, error } = await supabaseAdmin().from('support_conversations').select('*').order('last_message_at', { ascending: false }).limit(200)
    if (error) throw error
    const userIds = conversations.map(item => item.user_id)
    const { data: profiles, error: profileError } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [], error: null }
    if (profileError) throw profileError
    const emails = new Map(profiles.map(item => [item.id, item.email]))
    res.json({ conversations: conversations.map(item => ({ ...item, email: emails.get(item.user_id) || '未知用户' })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/support/conversations/:id/messages', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { data: messages, error } = await supabaseAdmin().from('support_messages').select('id,sender_role,content,created_at').eq('conversation_id', req.params.id).order('created_at').limit(500)
    if (error) throw error
    await supabaseAdmin().from('support_conversations').update({ unread_admin: 0, updated_at: new Date().toISOString() }).eq('id', req.params.id)
    res.json({ messages })
  } catch (error) { next(error) }
})

app.post('/api/admin/support/conversations/:id/messages', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim()
    if (!content || content.length > 2000) return res.status(400).json({ error: '回复内容应为1至2000个字符' })
    const { data: conversation, error } = await supabaseAdmin().from('support_conversations').select('*').eq('id', req.params.id).single()
    if (error) throw error
    const { data: message, error: messageError } = await supabaseAdmin().from('support_messages').insert({ conversation_id: conversation.id, sender_id: req.user.id, sender_role: 'admin', content }).select('id,sender_role,content,created_at').single()
    if (messageError) throw messageError
    await supabaseAdmin().from('support_conversations').update({ status: 'open', unread_user: conversation.unread_user + 1, unread_admin: 0, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversation.id)
    res.status(201).json({ message })
  } catch (error) { next(error) }
})

app.patch('/api/admin/support/conversations/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status === 'closed' ? 'closed' : 'open'
    const { data, error } = await supabaseAdmin().from('support_conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single()
    if (error) throw error
    res.json({ conversation: data })
  } catch (error) { next(error) }
})

app.get('/api/support/conversation', requireUser, async (req, res, next) => {
  try {
    const { data: conversation, error } = await supabaseAdmin().from('support_conversations').select('*').eq('user_id', req.user.id).maybeSingle()
    if (error) throw error
    if (!conversation) return res.json({ conversation: null, messages: [] })
    const { data: messages, error: messageError } = await supabaseAdmin().from('support_messages').select('id,sender_role,content,created_at').eq('conversation_id', conversation.id).order('created_at').limit(200)
    if (messageError) throw messageError
    if (conversation.unread_user) await supabaseAdmin().from('support_conversations').update({ unread_user: 0, updated_at: new Date().toISOString() }).eq('id', conversation.id)
    res.json({ conversation: { ...conversation, unread_user: 0 }, messages })
  } catch (error) { next(error) }
})

app.post('/api/support/messages', requireUser, async (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim()
    if (!content || content.length > 2000) return res.status(400).json({ error: '消息内容应为1至2000个字符' })
    let { data: conversation, error } = await supabaseAdmin().from('support_conversations').select('*').eq('user_id', req.user.id).maybeSingle()
    if (error) throw error
    if (!conversation) {
      const created = await supabaseAdmin().from('support_conversations').insert({ user_id: req.user.id, unread_admin: 1 }).select('*').single()
      if (created.error) throw created.error
      conversation = created.data
    } else {
      const updated = await supabaseAdmin().from('support_conversations').update({ status: 'open', unread_admin: conversation.unread_admin + 1, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversation.id).select('*').single()
      if (updated.error) throw updated.error
      conversation = updated.data
    }
    const { data: message, error: messageError } = await supabaseAdmin().from('support_messages').insert({ conversation_id: conversation.id, sender_id: req.user.id, sender_role: 'user', content }).select('id,sender_role,content,created_at').single()
    if (messageError) throw messageError
    res.status(201).json({ conversation, message })
  } catch (error) { next(error) }
})

app.get('/api/admin/recharge-orders', requireUser, requireAdmin, async (req, res, next) => {
  try {
    await supabaseAdmin().from('recharge_orders').update({ status: 'cancelled' }).eq('status', 'pending').lt('expires_at', new Date().toISOString())
    let query = supabaseAdmin().from('recharge_orders').select('id,order_no,user_id,package_id,amount_fen,credits,payment_reference,payment_proof_path,status,created_at,paid_at,expires_at,refunded_credits').order('created_at', { ascending: false }).limit(200)
    if (req.query.status) query = query.eq('status', req.query.status)
    const { data: orders, error } = await query
    if (error) throw error
    const userIds = [...new Set(orders.map(item => item.user_id))]
    const { data: profiles, error: profileError } = userIds.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', userIds) : { data: [], error: null }
    if (profileError) throw profileError
    const emails = new Map(profiles.map(item => [item.id, item.email]))
    const mapped = await Promise.all(orders.map(async item => { const proof = item.payment_proof_path ? await supabaseAdmin().storage.from('payment-proofs').createSignedUrl(item.payment_proof_path, 3600) : null; return { ...item, payment_proof_url: proof?.data?.signedUrl || '', email: emails.get(item.user_id) || '' } }))
    res.json({ orders: mapped })
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
    if (approve) {
      const { error: referralError } = await supabaseAdmin().rpc('complete_referral_payment', { p_order_id: req.params.id })
      if (referralError) console.error('[referral-payment]', req.params.id, referralError.message)
    }
    await auditAdmin(req, approve ? 'approve_recharge' : 'reject_recharge', 'recharge_order', req.params.id, { balanceAfter: data })
    res.json({ credits: data, status: approve ? 'paid' : 'rejected' })
  } catch (error) { next(error) }
})

app.get('/api/admin/refunds', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('refund_requests').select('id,order_id,user_id,requested_credits,requested_amount_fen,reason,status,admin_note,created_at,reviewed_at').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    const ids = [...new Set((data || []).map(item => item.user_id))]; const { data: profiles } = ids.length ? await supabaseAdmin().from('profiles').select('id,email').in('id', ids) : { data: [] }; const emails = new Map((profiles || []).map(item => [item.id, item.email]))
    res.json({ refunds: (data || []).map(item => ({ ...item, email: emails.get(item.user_id) || '' })) })
  } catch (error) { next(error) }
})

app.post('/api/admin/refunds/:id/review', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const approve = req.body.approve === true; const adminNote = String(req.body.adminNote || '').trim().slice(0, 500)
    const { data, error } = await supabaseAdmin().rpc('admin_review_refund', { p_admin_id: req.user.id, p_refund_id: req.params.id, p_approve: approve, p_admin_note: adminNote || null })
    if (error) { if (error.message?.includes('INSUFFICIENT_REFUNDABLE_CREDITS')) { error.status = 409; error.message = '用户当前剩余算力不足，暂不能执行退款扣回' } throw error }
    await auditAdmin(req, approve ? 'approve_refund' : 'reject_refund', 'refund_request', req.params.id, { balanceAfter: data, adminNote })
    res.json({ credits: data, status: approve ? 'approved' : 'rejected' })
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

app.get('/api/site-announcement', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('site_announcements').select('active,level,title,content,starts_at,ends_at,updated_at').eq('id', true).maybeSingle()
    if (error) throw error
    const now = Date.now(); const visible = Boolean(data?.active && data.title && (!data.starts_at || new Date(data.starts_at).getTime() <= now) && (!data.ends_at || new Date(data.ends_at).getTime() > now))
    res.json({ announcement: visible ? data : null })
  } catch (error) { next(error) }
})

app.get('/api/admin/site-announcement', requireUser, requireAdmin, async (_req, res, next) => {
  try { const { data, error } = await supabaseAdmin().from('site_announcements').select('*').eq('id', true).single(); if (error) throw error; res.json({ announcement: data }) }
  catch (error) { next(error) }
})

app.patch('/api/admin/site-announcement', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const level = ['info','warning','critical','success'].includes(req.body.level) ? req.body.level : 'info'
    const title = String(req.body.title || '').trim().slice(0, 80); const content = String(req.body.content || '').trim().slice(0, 500)
    if (req.body.active === true && (!title || !content)) return res.status(400).json({ error: '启用公告前请填写标题和内容' })
    const values = { active: req.body.active === true, level, title, content, starts_at: req.body.starts_at || null, ends_at: req.body.ends_at || null, updated_by: req.user.id, updated_at: new Date().toISOString() }
    if (values.starts_at && values.ends_at && new Date(values.ends_at) <= new Date(values.starts_at)) return res.status(400).json({ error: '公告结束时间必须晚于开始时间' })
    const { data, error } = await supabaseAdmin().from('site_announcements').update(values).eq('id', true).select('*').single(); if (error) throw error
    await auditAdmin(req, 'update_announcement', 'site_announcement', 'global', { active: values.active, level, title })
    res.json({ announcement: data })
  } catch (error) { next(error) }
})

app.get('/api/billing/orders', requireUser, async (req, res, next) => {
  try {
    await supabaseAdmin().from('recharge_orders').update({ status: 'cancelled' }).eq('user_id', req.user.id).eq('status', 'pending').lt('expires_at', new Date().toISOString())
    const { data, error } = await supabaseAdmin().from('recharge_orders')
      .select('id,order_no,package_id,amount_fen,credits,payment_provider,payment_reference,status,created_at,paid_at,expires_at,refunded_credits,refund_requests(id,status,requested_credits,requested_amount_fen,reason,created_at)')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)
    if (error) throw error
    res.json({ orders: data })
  } catch (error) { next(error) }
})

app.post('/api/billing/orders', requireUser, upload.single('proof'), async (req, res, next) => {
  try {
    if (req.body.acceptedTerms !== 'true') return res.status(400).json({ error: '请先阅读并确认充值与退款规则' })
    const packages = await loadCreditPackages(true)
    const selected = packages.find(item => item.id === req.body.packageId)
    await supabaseAdmin().from('recharge_orders').update({ status: 'cancelled' }).eq('user_id', req.user.id).eq('status', 'pending').lt('expires_at', new Date().toISOString())
    const { data: pendingOrder, error: pendingError } = await supabaseAdmin().from('recharge_orders').select('id,order_no,expires_at').eq('user_id', req.user.id).eq('status', 'pending').maybeSingle()
    if (pendingError) throw pendingError
    if (pendingOrder) return res.status(409).json({ error: `你已有一笔待审核订单 ${pendingOrder.order_no}，请等待管理员审核，不要重复付款或提交` })
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
    if (!reference) return res.status(400).json({ error: '请填写付款单号或付款备注' })
    if (!req.file) return res.status(400).json({ error: '请上传付款截图' })
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ error: '付款截图不能超过 5MB' })
    const proofPath = `${req.user.id}/${orderNo}.${req.file.mimetype.split('/')[1] || 'jpg'}`
    const { error: proofError } = await supabaseAdmin().storage.from('payment-proofs').upload(proofPath, req.file.buffer, { contentType: req.file.mimetype, upsert: false })
    if (proofError) throw proofError
    const { data, error } = await supabaseAdmin().from('recharge_orders').insert({
      order_no: orderNo, user_id: req.user.id, package_id: selected.id, amount_fen: priceFen,
      credits: selected.credits, payment_provider: 'manual', payment_reference: reference, payment_proof_path: proofPath, terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString()
    }).select('id,order_no,package_id,amount_fen,credits,status,created_at,expires_at').single()
    if (error) {
      await supabaseAdmin().storage.from('payment-proofs').remove([proofPath]).catch(() => {})
      if (error.code === '23505') return res.status(409).json({ error: '你已有一笔待审核充值订单，请等待管理员审核' })
      throw error
    }
    res.status(201).json({ order: data })
  } catch (error) { next(error) }
})

app.post('/api/billing/orders/:id/refund', requireUser, async (req, res, next) => {
  try {
    const reason = String(req.body.reason || '').trim().slice(0, 500); if (reason.length < 5) return res.status(400).json({ error: '请填写至少 5 个字的退款原因' })
    const { data: order, error: orderError } = await supabaseAdmin().from('recharge_orders').select('id,user_id,amount_fen,credits,refunded_credits,status').eq('id', req.params.id).eq('user_id', req.user.id).single()
    if (orderError) throw orderError; if (!['paid','partially_refunded'].includes(order.status)) return res.status(409).json({ error: '该订单当前不能申请退款' })
    const profile = await profileFor(req.user.id); const refundableCredits = Math.min(profile.credits, order.credits - order.refunded_credits)
    if (refundableCredits < 1) return res.status(409).json({ error: '该订单已没有可退回的未使用算力' })
    const amountFen = Math.floor(order.amount_fen * refundableCredits / order.credits)
    const { data, error } = await supabaseAdmin().from('refund_requests').insert({ order_id: order.id, user_id: req.user.id, requested_credits: refundableCredits, requested_amount_fen: amountFen, reason }).select('*').single()
    if (error) throw error
    res.status(201).json({ refund: data })
  } catch (error) { next(error) }
})

app.get('/api/billing/transactions', requireUser, async (req, res, next) => {
  try { const { data, error } = await supabaseAdmin().from('credit_transactions').select('id,type,amount,balance_after,description,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(100); if (error) throw error; res.json({ transactions: data || [] }) }
  catch (error) { next(error) }
})

app.get('/api/dramas', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin().from('short_drama_projects').select('*,short_drama_shots(*)').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)
    if (error) throw error
    res.json({ projects: (data || []).map(publicDramaProject) })
  } catch (error) { next(error) }
})

app.post('/api/dramas/plan', requireUser, async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    const premise = String(req.body.premise || '').trim().slice(0, 500)
    const genre = String(req.body.genre || '电商剧情').trim().slice(0, 50)
    const charactersInput = String(req.body.characters || '').trim().slice(0, 600)
    const targetDuration = [30, 45, 60].includes(Number(req.body.duration)) ? Number(req.body.duration) : 30
    const shotCount = Math.max(6, Math.min(12, Math.round(targetDuration / 5)))
    if (premise.length < 8) return res.status(400).json({ error: '请至少用8个字描述短剧主题' })
    await enforceContentSafety(req, `${premise}\n${charactersInput}`, 'copy_generation')
    usageId = await reserveGeneration(req.user.id, { prompt: `AI短剧策划：${premise}`, count: 1, action: 'copy_generation' }, 2, 1)
    const generated = await withModelFallback('text', req.body.modelId, candidate => generateText(candidate, {
      instructions: `你是中文竖屏AI短剧导演。把用户主题设计成约${targetDuration}秒、共${shotCount}个镜头的完整短剧。要求开头3秒有钩子，中段有冲突，结尾有反转或行动引导；角色外貌、年龄、发型和服装在全部镜头中保持一致；每镜约5秒；视频提示词必须包含人物外貌服装、场景、动作、镜头运动、光线和竖屏构图；不要生成违规、欺诈、侵权或夸大功效内容。只返回严格JSON，不要Markdown。JSON结构：{"title":"标题","characters":[{"name":"角色名","description":"固定外貌服装"}],"shots":[{"shot_number":1,"duration":5,"scene":"场景","shot_type":"景别","visual_prompt":"详细视频提示词","speaker":"角色名或旁白","dialogue":"台词或旁白"}]}`,
      input: `类型：${genre}\n主题：${premise}\n用户提供的角色设定：${charactersInput || '请根据剧情设计1至2名角色'}\n镜头数必须为${shotCount}个。`,
      maxOutputTokens: 5000
    }), retryableProviderError)
    const plan = parseJsonResponse(generated.result)
    const characters = Array.isArray(plan.characters) ? plan.characters.slice(0, 4).map((item, index) => typeof item === 'string' ? { name: `角色${index + 1}`, description: item.slice(0, 500) } : { name: String(item.name || `角色${index + 1}`).slice(0, 50), description: String(item.description || '').slice(0, 500) }) : []
    const rawShots = Array.isArray(plan.shots) ? plan.shots.slice(0, shotCount) : []
    if (rawShots.length < Math.min(4, shotCount)) throw new Error('AI返回的分镜数量不足，请重新生成')
    const { data: project, error: projectError } = await supabaseAdmin().from('short_drama_projects').insert({ user_id: req.user.id, title: String(plan.title || premise).slice(0, 100), premise, genre, target_duration: targetDuration, characters }).select('*').single()
    if (projectError) throw projectError
    const characterNames = new Set(characters.map(item => item.name))
    const shotRows = rawShots.map((shot, index) => ({ project_id: project.id, shot_number: index + 1, duration: Math.max(3, Math.min(15, Number(shot.duration) || 5)), scene: String(shot.scene || `镜头${index + 1}`).slice(0, 300), shot_type: String(shot.shot_type || '中景').slice(0, 30), visual_prompt: String(shot.visual_prompt || '').slice(0, 1500), speaker: characterNames.has(String(shot.speaker || '')) ? String(shot.speaker) : '旁白', dialogue: String(shot.dialogue || '').slice(0, 500) }))
    const { data: shots, error: shotsError } = await supabaseAdmin().from('short_drama_shots').insert(shotRows).select('*')
    if (shotsError) { await supabaseAdmin().from('short_drama_projects').delete().eq('id', project.id); throw shotsError }
    await supabaseAdmin().from('usage_records').update({ output_text: JSON.stringify({ title: project.title, characters, shots: shotRows }) }).eq('id', usageId)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.status(201).json({ project: publicDramaProject({ ...project, shots }), usageId, model: generated.model.id, credits: profile.credits })
  } catch (error) { await rollbackGeneration(usageId, error); next(error) }
})

app.patch('/api/dramas/:projectId/shots/:shotId', requireUser, async (req, res, next) => {
  try {
    const { data: project, error: projectError } = await supabaseAdmin().from('short_drama_projects').select('id').eq('id', req.params.projectId).eq('user_id', req.user.id).single()
    if (projectError || !project) { const error = new Error('短剧项目不存在'); error.status = 404; throw error }
    const patch = {}
    if (req.body.scene !== undefined) patch.scene = String(req.body.scene).trim().slice(0, 300)
    if (req.body.shotType !== undefined) patch.shot_type = String(req.body.shotType).trim().slice(0, 30)
    if (req.body.visualPrompt !== undefined) patch.visual_prompt = String(req.body.visualPrompt).trim().slice(0, 1500)
    if (req.body.dialogue !== undefined) patch.dialogue = String(req.body.dialogue).trim().slice(0, 500)
    if (req.body.speaker !== undefined) patch.speaker = String(req.body.speaker || '旁白').trim().slice(0, 50)
    if (req.body.voiceId !== undefined) patch.voice_id = String(req.body.voiceId || 'system-default').trim().slice(0, 300)
    if (['natural','happy','sad','tense','excited'].includes(req.body.voiceEmotion)) patch.voice_emotion = req.body.voiceEmotion
    if (req.body.voiceSpeed !== undefined) patch.voice_speed = Math.max(0.8, Math.min(1.3, Number(req.body.voiceSpeed) || 1))
    if (req.body.voiceVolume !== undefined) patch.voice_volume = Math.max(0.5, Math.min(1.5, Number(req.body.voiceVolume) || 1))
    if (['draft','queued','generating','completed','failed'].includes(req.body.status)) patch.status = req.body.status
    if (req.body.videoJobId) patch.video_job_id = String(req.body.videoJobId)
    if (req.body.outputUrl !== undefined) {
      const outputUrl = String(req.body.outputUrl || '').trim().slice(0, 2000)
      if (outputUrl && !/^https:\/\//i.test(outputUrl)) return res.status(400).json({ error: '视频地址格式不正确' })
      patch.output_url = outputUrl || null
    }
    patch.updated_at = new Date().toISOString()
    const { data: shot, error } = await supabaseAdmin().from('short_drama_shots').update(patch).eq('id', req.params.shotId).eq('project_id', project.id).select('*').single()
    if (error) throw error
    await supabaseAdmin().from('short_drama_projects').update({ status: shot.status === 'completed' ? 'generating' : 'storyboard', updated_at: new Date().toISOString() }).eq('id', project.id)
    res.json({ shot })
  } catch (error) { next(error) }
})

app.patch('/api/dramas/:projectId/voice', requireUser, async (req, res, next) => {
  try {
    const { data: project } = await supabaseAdmin().from('short_drama_projects').select('id').eq('id', req.params.projectId).eq('user_id', req.user.id).maybeSingle()
    if (!project) return res.status(404).json({ error: '短剧项目不存在' })
    const speaker = String(req.body.speaker || '').trim().slice(0, 50)
    if (!speaker) return res.status(400).json({ error: '请选择需要应用音色的角色' })
    const patch = {
      voice_id: String(req.body.voiceId || 'system-default').trim().slice(0, 300),
      voice_emotion: ['natural','happy','sad','tense','excited'].includes(req.body.voiceEmotion) ? req.body.voiceEmotion : 'natural',
      voice_speed: Math.max(0.8, Math.min(1.3, Number(req.body.voiceSpeed) || 1)),
      voice_volume: Math.max(0.5, Math.min(1.5, Number(req.body.voiceVolume) || 1)),
      updated_at: new Date().toISOString()
    }
    const { data: shots, error } = await supabaseAdmin().from('short_drama_shots').update(patch).eq('project_id', project.id).eq('speaker', speaker).select('*')
    if (error) throw error
    res.json({ shots: shots || [] })
  } catch (error) { next(error) }
})

app.get('/api/chat/sessions', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    const { data, error } = await supabaseAdmin().from('ai_chat_sessions').select('id,title,created_at,updated_at').eq('user_id', req.user.id).order('updated_at', { ascending: false }).limit(50)
    if (error) throw error
    res.json({ sessions: data || [] })
  } catch (error) { next(error) }
})

app.get('/api/chat/sessions/:id/messages', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    const { data: chat, error: chatError } = await supabaseAdmin().from('ai_chat_sessions').select('id,title').eq('id', req.params.id).eq('user_id', req.user.id).single()
    if (chatError) { chatError.status = chatError.code === 'PGRST116' ? 404 : undefined; throw chatError }
    const { data, error } = await supabaseAdmin().from('ai_chat_messages').select('id,role,content,model_id,provider,usage_id,created_at').eq('session_id', chat.id).eq('user_id', req.user.id).order('created_at').limit(200)
    if (error) throw error
    res.json({ session: chat, messages: data || [] })
  } catch (error) { next(error) }
})

app.delete('/api/chat/sessions/:id', requireUser, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin().from('ai_chat_sessions').delete().eq('id', req.params.id).eq('user_id', req.user.id)
    if (error) throw error
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/chat/messages', requireUser, async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    const content = String(req.body.content || '').trim().slice(0, 3000)
    if (content.length < 2) return res.status(400).json({ error: '请描述你想讨论的电商问题' })
    await enforceContentSafety(req, content, 'ai_chat')
    let chat
    if (req.body.sessionId) {
      const { data, error } = await supabaseAdmin().from('ai_chat_sessions').select('*').eq('id', req.body.sessionId).eq('user_id', req.user.id).single()
      if (error) { error.status = error.code === 'PGRST116' ? 404 : undefined; throw error }
      chat = data
    } else {
      const title = content.replace(/\s+/g, ' ').slice(0, 30) || '新对话'
      const { data, error } = await supabaseAdmin().from('ai_chat_sessions').insert({ user_id: req.user.id, title }).select('*').single()
      if (error) throw error
      chat = data
    }
    const { data: history, error: historyError } = await supabaseAdmin().from('ai_chat_messages').select('role,content').eq('session_id', chat.id).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20)
    if (historyError) throw historyError
    const selected = selectedModel('text', req.body.modelId)
    const creditCost = Math.max(0, Number(selected.creditCost ?? CREDIT_PRICES.copy))
    usageId = await reserveGeneration(req.user.id, { prompt: content, count: 1, action: 'ai_chat' }, creditCost, 1)
    const { data: userMessage, error: userError } = await supabaseAdmin().from('ai_chat_messages').insert({ session_id: chat.id, user_id: req.user.id, role: 'user', content }).select('*').single()
    if (userError) throw userError
    const transcript = [...(history || []).reverse(), { role: 'user', content }].map(item => `${item.role === 'assistant' ? '顾问' : '用户'}：${item.content}`).join('\n\n')
    const generated = await withModelFallback('text', req.body.modelId, candidate => generateText(candidate, {
      instructions: '你是中国电商从业者的资深经营顾问。围绕选品、商品定位、用户画像、内容营销、平台运营、投放、活动策划、转化优化和复盘提供具体可执行的建议。先理解用户现状；信息不足时提出1至3个关键问题；给方案时写清目标、步骤、优先级、预算假设、观察指标和风险。不得虚构平台规则、效果数据或商品参数，不承诺收益，不协助刷单、欺诈、侵权、虚假宣传或规避平台监管。使用自然中文交流，不要每次都输出冗长模板。',
      input: transcript,
      maxOutputTokens: 2200
    }), retryableProviderError)
    const reply = generated.result.trim()
    if (!reply) throw new Error(`${generated.model.name || generated.model.id} 未返回顾问回复`)
    const { data: assistantMessage, error: assistantError } = await supabaseAdmin().from('ai_chat_messages').insert({ session_id: chat.id, user_id: req.user.id, role: 'assistant', content: reply, model_id: generated.model.id, provider: generated.model.provider, usage_id: usageId }).select('*').single()
    if (assistantError) throw assistantError
    await supabaseAdmin().from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', chat.id).eq('user_id', req.user.id)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ session: { id: chat.id, title: chat.title }, userMessage, assistantMessage, chargedCredits: creditCost, credits: profile.credits })
  } catch (error) {
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.post('/api/copy/generate', requireUser, async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    let textModel = selectedModel('text', req.body.modelId)
    const product = String(req.body.product || '').trim()
    const features = String(req.body.features || '').trim()
    const platform = String(req.body.platform || '淘宝 / 天猫').trim()
    const style = String(req.body.style || '突出卖点').trim()
    if (!product) return res.status(400).json({ error: '请填写商品名称' })
    if (!features) return res.status(400).json({ error: '请填写商品核心卖点' })
    const prompt = `商品：${product}\n核心卖点：${features}\n投放平台：${platform}\n文案风格：${style}`
    await enforceContentSafety(req, prompt, 'copy_generation')
    const selectedCreditCost = Math.max(0, Number(textModel.creditCost ?? CREDIT_PRICES.copy))
    usageId = await reserveGeneration(req.user.id, { prompt, count: 1, action: 'copy_generation' }, selectedCreditCost, 1)
    const textResponse = await withModelFallback('text', req.body.modelId, candidate => generateText(candidate, {
      instructions: '你是一名资深中国电商文案策划。根据商品资料和平台特点，输出：1. 三个商品标题；2. 五条核心卖点；3. 一段可直接发布的营销正文；4. 三条短促销口号。语言自然、有转化力，不夸大功效，不虚构未提供的参数，不使用Markdown代码块。',
      input: prompt,
      maxOutputTokens: 2000
    }), retryableProviderError)
    let copy = textResponse.result.trim(); textModel = textResponse.model
    if (!copy) {
      throw new Error(`${textModel.name || textModel.id} 未返回文案内容`)
    }
    const { error: saveCopyError } = await supabaseAdmin().from('usage_records').update({ output_text: copy }).eq('id', usageId)
    if (saveCopyError) console.error('[archive-copy]', usageId, saveCopyError.message)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ copy, usageId, model: textModel.id, modelName: textModel.name || textModel.id, provider: textModel.provider, chargedCredits: selectedCreditCost, credits: profile.credits, aiGenerated: true, aiLabel: AI_LABEL })
  } catch (error) {
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.post('/api/prompt/enhance', requireUser, async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    const textModel = (modelCatalog().text || []).find(item => item.id === 'qwen-plus' && item.provider === 'aliyun' && item.available)
    if (!textModel) {
      const error = new Error('AI 润色所需的通义千问 Plus 当前不可用，请稍后再试')
      error.status = 503
      throw error
    }
    if (!allowPromptEnhance(req.user.id)) return res.status(429).json({ error: 'AI 润色操作过于频繁，请一分钟后再试' })
    const prompt = String(req.body.prompt || '').trim()
    if (!prompt) return res.status(400).json({ error: '请先输入需要润色的画面描述' })
    if (prompt.length > 1000) return res.status(400).json({ error: '画面描述不能超过 1000 字' })
    await enforceContentSafety(req, prompt, 'prompt_enhance')

    const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
    const dayStart = new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T00:00:00+08:00`).toISOString()
    const { count: usedToday, error: countError } = await supabaseAdmin().from('usage_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('action', 'prompt_enhance')
      .gte('created_at', dayStart)
      .in('status', ['pending', 'completed'])
    if (countError) throw countError
    const chargedCredits = (usedToday || 0) < 3 ? 0 : Math.max(0, Number(textModel.creditCost ?? CREDIT_PRICES.enhance))
    usageId = await reserveGeneration(req.user.id, { prompt, count: 1, action: 'prompt_enhance' }, chargedCredits, 1)

    const enhancedPrompt = (await generateText(textModel, {
      instructions: '你是一名专业的 AI 视觉提示词编辑。请将用户输入改写成一段更清晰、具体、可直接用于图片或视频生成的中文提示词。保留原始主体、商品信息和用户意图，补充合理的构图、环境、光线、镜头、材质、动作与画面风格；不得虚构具体品牌参数，不要解释，不要列点，不要使用 Markdown，只输出改写后的完整提示词。',
      input: prompt,
      maxOutputTokens: 1000
    })).trim()
    if (!enhancedPrompt) throw new Error(`${textModel.name || textModel.id} 未返回润色内容`)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({
      prompt: enhancedPrompt,
      model: textModel.id,
      credits: profile.credits,
      chargedCredits,
      freeRemaining: Math.max(0, 2 - (usedToday || 0))
    })
  } catch (error) {
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.post('/api/images/generate', requireUser, async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    await enforceContentSafety(req, req.body.prompt, 'image_generation')
    const count = Math.min(4, Math.max(1, Number(req.body.count) || 1))
    const generationModels = (modelCatalog().image || []).filter(item => item.available && item.supportsGenerate !== false)
    let usedModel = generationModels.find(item => item.id === req.body.modelId) || generationModels[0]
    if (!usedModel) { const error = new Error('当前没有可用的图片生成模型'); error.status = 503; throw error }
    const chargedCredits = Math.max(0, Number(usedModel.creditCost ?? CREDIT_PRICES.image)) * count
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: 'image_generation' }, chargedCredits, count)
    let generated
    if (mockEnabled) generated = await new Promise(resolve => setTimeout(() => resolve(mockImages(req.body)), 900))
    else {
      const generatedImage = await withImageFallback(req.body.modelId, 'generate', async model => {
        if (model.provider === 'aliyun') return generateAliyunImage({ model, prompt: req.body.prompt, ratio: req.body.ratio, count })
        if (model.provider === 'tencent') return generateTencentImage({ model, prompt: req.body.prompt, ratio: req.body.ratio, count })
        return images(await client().images.generate(options({ ...req.body, selectedModel: model })))
      })
      generated = generatedImage.result; usedModel = generatedImage.model
    }
    const storedImages = await archiveOrOriginal(req.user.id, usageId, generated)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ images: storedImages, usageId, model: usedModel.id, modelName: usedModel.name || usedModel.id, chargedCredits, mock: mockEnabled, credits: profile.credits, aiGenerated: true, aiLabel: AI_LABEL })
  } catch (error) {
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.post('/api/images/edit', requireUser, upload.array('images', 4), async (req, res, next) => {
  let usageId
  try {
    await refreshModelConfigs()
    if (!req.files?.length) return res.status(400).json({ error: '请上传至少一张参考图片' })
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面描述' })
    await enforceContentSafety(req, req.body.prompt, 'image_edit')
    const count = Math.min(4, Math.max(1, Number(req.body.count) || 1))
    const editModels = (modelCatalog().image || []).filter(item => item.available && item.supportsEdit)
    let usedModel = editModels.find(item => item.id === req.body.modelId) || editModels[0]
    if (!usedModel) { const error = new Error('当前没有可用的图片编辑模型'); error.status = 503; throw error }
    const chargedCredits = Math.max(0, Number(usedModel.creditCost ?? CREDIT_PRICES.imageEdit)) * count
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: 'image_edit' }, chargedCredits, count)
    let generated
    if (mockEnabled) generated = await new Promise(resolve => setTimeout(() => resolve(mockImages(req.body)), 900))
    else {
      const editedImage = await withImageFallback(req.body.modelId, 'edit', async model => {
        if (model.provider === 'aliyun') return generateAliyunImage({ model, prompt: req.body.prompt, ratio: req.body.ratio, count, files: req.files })
        if (model.provider === 'tencent') return generateTencentImage({ model, prompt: req.body.prompt, ratio: req.body.ratio, count, files: req.files })
        const image = await Promise.all(req.files.map(file => toFile(file.buffer, file.originalname, { type: file.mimetype })))
        return images(await client().images.edit({ ...options({ ...req.body, selectedModel: model }), image }))
      })
      generated = editedImage.result; usedModel = editedImage.model
    }
    const storedImages = await archiveOrOriginal(req.user.id, usageId, generated)
    await finishGeneration(usageId, true)
    const profile = await profileFor(req.user.id)
    res.json({ images: storedImages, usageId, model: usedModel.id, modelName: usedModel.name || usedModel.id, chargedCredits, mock: mockEnabled, credits: profile.credits, aiGenerated: true, aiLabel: AI_LABEL })
  } catch (error) {
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.post('/api/videos/generate', requireUser, upload.single('image'), async (req, res, next) => {
  let usageId
  let inputPath
  let jobId
  try {
    await refreshModelConfigs()
    const mode = req.body.mode === 'text' ? 'text' : 'image'
    if (mode === 'image' && !req.file) return res.status(400).json({ error: '请上传一张静态图片' })
    if (!req.body.prompt?.trim()) return res.status(400).json({ error: '请输入画面运动描述' })
    await enforceContentSafety(req, req.body.prompt, mode === 'image' ? 'gif_generation' : 'video_generation')
    const selectedVideoModel = selectedModel('video', req.body.modelId)
    const credits = Math.max(0, Number(mode === 'image' ? (selectedVideoModel.creditCost ?? CREDIT_PRICES.gif) : (selectedVideoModel.textCreditCost ?? CREDIT_PRICES.video)))
    usageId = await reserveGeneration(req.user.id, { ...req.body, action: mode === 'image' ? 'gif_generation' : 'video_generation' }, credits, 1)
    if (req.file) {
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[req.file.mimetype] || 'jpg'
      inputPath = `${req.user.id}/${usageId}.${extension}`
      const { error: uploadError } = await supabaseAdmin().storage.from('generation-inputs').upload(inputPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true })
      if (uploadError) throw uploadError
    }
    const { data: job, error: jobError } = await supabaseAdmin().from('video_generation_jobs').insert({
      user_id: req.user.id, usage_id: usageId, mode, output_format: mode === 'image' ? 'gif' : 'mp4',
      prompt: req.body.prompt.trim(), ratio: req.body.ratio || '16:9', model_id: selectedVideoModel.id,
      input_path: inputPath || null, input_mime: req.file?.mimetype || null
    }).select('*').single()
    if (jobError) throw jobError
    jobId = job.id
    if (req.body.dramaProjectId && req.body.dramaShotId) {
      const { data: project } = await supabaseAdmin().from('short_drama_projects').select('id').eq('id', req.body.dramaProjectId).eq('user_id', req.user.id).maybeSingle()
      if (!project) { const error = new Error('短剧项目不存在'); error.status = 404; throw error }
      const { data: linkedShot, error: shotError } = await supabaseAdmin().from('short_drama_shots').update({ video_job_id: job.id, status: 'queued', updated_at: new Date().toISOString() }).eq('id', req.body.dramaShotId).eq('project_id', project.id).select('id').maybeSingle()
      if (shotError) throw shotError
      if (!linkedShot) { const error = new Error('短剧镜头不存在'); error.status = 404; throw error }
      await supabaseAdmin().from('short_drama_projects').update({ status: 'generating', updated_at: new Date().toISOString() }).eq('id', project.id)
    }
    const profile = await profileFor(req.user.id)
    queueMicrotask(() => pumpVideoJobs())
    res.status(202).json({ job: publicVideoJob(job), usageId, model: selectedVideoModel.id, credits: profile.credits, aiGenerated: true, aiLabel: AI_LABEL })
  } catch (error) {
    if (jobId) { try { await supabaseAdmin().from('video_generation_jobs').delete().eq('id', jobId) } catch (_cleanupError) {} }
    if (inputPath) await supabaseAdmin().storage.from('generation-inputs').remove([inputPath]).catch(() => {})
    await rollbackGeneration(usageId, error)
    next(error)
  }
})

app.get('/api/video-jobs/active', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    await expireStaleVideoJobs(req.user.id)
    const { data, error } = await supabaseAdmin().from('video_generation_jobs').select('*').eq('user_id', req.user.id).in('status', ['queued','processing','converting']).order('created_at').limit(1)
    if (error) throw error
    res.json({ job: data?.[0] ? publicVideoJob(data[0]) : null })
  } catch (error) { next(error) }
})

app.get('/api/video-jobs/:id', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    await expireStaleVideoJobs(req.user.id)
    const { data: job, error } = await supabaseAdmin().from('video_generation_jobs').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single()
    if (error) { error.status = error.code === 'PGRST116' ? 404 : undefined; throw error }
    let queuePosition = 0
    if (job.status === 'queued') {
      const { count } = await supabaseAdmin().from('video_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lt('created_at', job.created_at)
      queuePosition = Number(count || 0) + 1
    }
    res.json({ job: publicVideoJob(job, queuePosition) })
  } catch (error) { next(error) }
})

app.use(express.static(path.join(rootDir, 'dist')))
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'admin.html')))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(rootDir, 'dist', 'index.html'))
})

app.use((error, req, res, _next) => {
  const status = error.status || error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500)
  const message = error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 10MB' : (error.error?.message || error.message || '生成失败，请稍后重试')
  let clientMessage = message
  if (error.creditsRefunded) clientMessage += '；本次扣除的算力已自动退还，可以修改内容后重试'
  else if (error.refundPending) clientMessage += '；算力退款正在处理中，请稍后查看余额'
  if (status >= 500) clientMessage += `（问题编号：${req.requestId}）`
  console.error('[api]', req.requestId, status, message)
  res.status(status).json({
    error: clientMessage,
    requestId: req.requestId,
    retryable: status === 429 || status >= 500,
    creditsRefunded: Boolean(error.creditsRefunded),
    refundPending: Boolean(error.refundPending)
  })
})

app.listen(port, () => {
  console.log(`AI API server running at http://localhost:${port}`)
  setTimeout(pumpVideoJobs, 1000)
  setInterval(pumpVideoJobs, 5000).unref()
  setInterval(() => expireStaleVideoJobs().catch(error => console.error('[video-job-expire-timer]', error.message)), 60000).unref()
})
