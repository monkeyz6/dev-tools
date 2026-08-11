import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { historyDbGetAll, historyDbPutOne, historyDbDeleteOne, historyDbDeleteMany, historyDbClear, historyDbMigrateFromLocalStorage } from '../shared/history-db'

// ─── Tool: 图片接口测试 ─────────────────────────────────────────────────────────

const IMG_CH_KEY = 'imgtest-channels'
const IMG_ACTIVE_KEY = 'imgtest-active'
const IMG_PRICES_KEY = 'imgtest-prices'
const IMG_RATE_KEY = 'imgtest-rate'
const IMG_HIST_KEY = 'imgtest-history'
const IMG_UI_KEY = 'imgtest-ui'
const IMG_HIST_MAX = 30
const IMG_DEFAULT_RATE = 7
const IMG_VALIDATION_VERSION = 2
const IMG_RESOLUTION_TIER_MIN_SCALE = 0.88

const IMG_KEY_PASSPHRASE = 'dev-toolkit-imgtest-v1'
let imgCryptoKeyPromise: Promise<CryptoKey> | null = null
function imgDeriveCryptoKey(): Promise<CryptoKey> {
  if (!imgCryptoKeyPromise) {
    imgCryptoKeyPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(IMG_KEY_PASSPHRASE))
      .then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']))
  }
  return imgCryptoKeyPromise
}
function imgBufToBase64(buf: ArrayBuffer): string {
  let bin = ''
  new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
function imgBase64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}
async function imgEncryptApiKey(plain: string): Promise<string> {
  if (!plain || typeof crypto === 'undefined' || !crypto.subtle) return ''
  const key = await imgDeriveCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return imgBufToBase64(iv.buffer) + '.' + imgBufToBase64(cipherBuf)
}
async function imgDecryptApiKey(stored: string): Promise<string> {
  if (!stored || typeof crypto === 'undefined' || !crypto.subtle) return ''
  try {
    const [ivB64, cipherB64] = stored.split('.')
    if (!ivB64 || !cipherB64) return ''
    const key = await imgDeriveCryptoKey()
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(imgBase64ToBuf(ivB64)) }, key, imgBase64ToBuf(cipherB64))
    return new TextDecoder().decode(plainBuf)
  } catch { return '' }
}

interface ImgPrice { model: string; tier: string; usd: number; note?: string }
const IMG_DEFAULT_PRICES: ImgPrice[] = [
  // OpenAI GPT Image 系列（1024×1024 基准，按 quality 档；官网已核实）
  { model: 'gpt-image-2', tier: 'low', usd: 0.006, note: 'OpenAI 官网 · 1024方形 low' },
  { model: 'gpt-image-2', tier: 'medium', usd: 0.053, note: 'OpenAI 官网 · 1024方形 medium' },
  { model: 'gpt-image-2', tier: 'high', usd: 0.211, note: 'OpenAI 官网 · 1024方形 high' },
  { model: 'gpt-image-1.5', tier: 'low', usd: 0.009, note: 'OpenAI 官网' },
  { model: 'gpt-image-1.5', tier: 'medium', usd: 0.034, note: 'OpenAI 官网' },
  { model: 'gpt-image-1.5', tier: 'high', usd: 0.133, note: 'OpenAI 官网' },
  { model: 'gpt-image-1', tier: 'low', usd: 0.011, note: 'OpenAI 官网（2026-10-23 起弃用）' },
  { model: 'gpt-image-1', tier: 'medium', usd: 0.042, note: 'OpenAI 官网' },
  { model: 'gpt-image-1', tier: 'high', usd: 0.167, note: 'OpenAI 官网' },
  { model: 'gpt-image-1-mini', tier: 'low', usd: 0.005, note: 'OpenAI 官网' },
  { model: 'gpt-image-1-mini', tier: 'medium', usd: 0.013, note: 'OpenAI 官网' },
  { model: 'gpt-image-1-mini', tier: 'high', usd: 0.036, note: 'OpenAI 官网' },
  // xAI Grok Imagine（docs.x.ai/models 已核实，1K/2K 档）
  { model: 'grok-imagine-image', tier: '1k', usd: 0.02, note: 'xAI 官网 · 1K 与 2K 同价' },
  { model: 'grok-imagine-image', tier: '2k', usd: 0.02, note: 'xAI 官网' },
  { model: 'grok-imagine-image-quality', tier: '1k', usd: 0.05, note: 'xAI 官网 · 参考图输入 +$0.01/张' },
  { model: 'grok-imagine-image-quality', tier: '2k', usd: 0.07, note: 'xAI 官网 · 参考图输入 +$0.01/张' },
  { model: 'grok-imagine-image-pro', tier: '1k', usd: 0.05, note: 'xAI 官网 · 已并入 quality 别名' },
  { model: 'grok-imagine-image-pro', tier: '2k', usd: 0.07, note: 'xAI 官网' },
  // Google Gemini 图像（ai.google.dev 已核实）
  { model: 'gemini-3-pro-image', tier: '1K', usd: 0.134, note: 'Google 官网 · 1K/2K 同价' },
  { model: 'gemini-3-pro-image', tier: '2K', usd: 0.134, note: 'Google 官网' },
  { model: 'gemini-3-pro-image', tier: '4K', usd: 0.24, note: 'Google 官网' },
  { model: 'gemini-3-pro-image-preview', tier: '1K', usd: 0.134, note: 'Google 官网' },
  { model: 'gemini-3-pro-image-preview', tier: '2K', usd: 0.134, note: 'Google 官网' },
  { model: 'gemini-3-pro-image-preview', tier: '4K', usd: 0.24, note: 'Google 官网' },
  { model: 'gemini-3.1-flash-image', tier: '0.5K', usd: 0.045, note: 'Google 官网 · Flash' },
  { model: 'gemini-3.1-flash-image', tier: '1K', usd: 0.067, note: 'Google 官网 · Flash' },
  { model: 'gemini-3.1-flash-image', tier: '2K', usd: 0.101, note: 'Google 官网 · Flash' },
  { model: 'gemini-3.1-flash-image', tier: '4K', usd: 0.151, note: 'Google 官网 · Flash' },
  // 字节 Seedream（火山方舟国内 ¥0.3/¥0.6，BytePlus 海外 $0.045/$0.09）
  { model: 'doubao-seedream-5-0-pro', tier: '1K', usd: 0.045, note: 'BytePlus 海外 · 国内方舟 ¥0.3/张' },
  { model: 'doubao-seedream-5-0-pro', tier: '2K', usd: 0.09, note: 'BytePlus 海外 · 国内方舟 ¥0.6/张' },
  { model: 'doubao-seedream-5-0-pro-260628', tier: '1K', usd: 0.045, note: 'BytePlus 海外 · 国内方舟 ¥0.3/张' },
  { model: 'doubao-seedream-5-0-pro-260628', tier: '2K', usd: 0.09, note: 'BytePlus 海外 · 国内方舟 ¥0.6/张' },
  { model: 'doubao-seedream-5-0-lite', tier: 'default', usd: 0.035, note: '火山引擎 · Lite 单价' },
  { model: 'seedream-5-0-pro', tier: '1K', usd: 0.045, note: '≤2.36MP' },
  { model: 'seedream-5-0-pro', tier: '2K', usd: 0.09, note: '>2.36MP' },
]
function imgLoadPrices(): ImgPrice[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(IMG_PRICES_KEY)
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p }
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(IMG_DEFAULT_PRICES))
}
function imgSavePrices(p: ImgPrice[]) { try { localStorage.setItem(IMG_PRICES_KEY, JSON.stringify(p)) } catch { /* ignore */ } }
function imgLoadRate(): string {
  if (typeof window !== 'undefined') {
    const v = parseFloat(localStorage.getItem(IMG_RATE_KEY) || '')
    if (!isNaN(v) && v > 0) return String(v)
  }
  return String(IMG_DEFAULT_RATE)
}
function imgSaveRate(r: string) { try { localStorage.setItem(IMG_RATE_KEY, r) } catch { /* ignore */ } }

type ImgApiType = 'openai' | 'grok' | 'gemini' | 'seedream'
const IMG_API_LABEL: Record<ImgApiType, string> = { openai: 'OpenAI', grok: 'Grok', gemini: 'Gemini', seedream: 'Seedream' }
const IMG_PLACEHOLDER_MODEL: Record<ImgApiType, string> = {
  openai: 'gpt-image-2', grok: 'grok-imagine-image-quality', gemini: 'gemini-3-pro-image', seedream: 'doubao-seedream-5-0-pro',
}

interface ImgChannel { id: string; name: string; baseUrl: string; apiKeyEnc: string; keyMask: string }
interface ImgRef { dataUri?: string | null; url?: string; name?: string }
interface ImgCaseParams { [k: string]: any }
interface ImgCaseDef { name: string; desc: string; params: ImgCaseParams; needRef?: boolean; prompt?: string }

const IMG_TEST_SETS: Record<ImgApiType, ImgCaseDef[]> = {
  openai: [
    { name: '方形 1024×1024', desc: 'size=1024x1024', params: { size: '1024x1024', n: 1 } },
    { name: '2K 方形 2048×2048', desc: 'size=2048x2048', params: { size: '2048x2048', n: 1 } },
    { name: '2K 横版 2048×1152 + n=2', desc: '16:9 多张 (n=2)', params: { size: '2048x1152', n: 2 } },
    { name: '4K 横版 3840×2160', desc: 'size=3840x2160', params: { size: '3840x2160', n: 1 } },
    { name: '竖版 1024×1536', desc: 'size=1024x1536', params: { size: '1024x1536', n: 1 } },
    { name: 'output_format=jpeg', desc: 'jpeg 输出格式校验', params: { size: '1024x1024', n: 1, output_format: 'jpeg' } },
    { name: 'output_format=webp', desc: 'webp 输出格式校验', params: { size: '1024x1024', n: 1, output_format: 'webp' } },
    { name: 'quality=low', desc: 'quality 参数是否透传（速度更快）', params: { size: '1024x1024', n: 1, quality: 'low' } },
    { name: '参考图编辑 1024×1024', desc: 'edits + 尺寸校验', params: { size: '1024x1024', n: 1 }, needRef: true, prompt: '把这张图改成水彩画风格' },
  ],
  grok: [
    { name: '1k + 1:1', desc: 'resolution=1k, aspect_ratio=1:1', params: { resolution: '1k', aspect_ratio: '1:1', n: 1, response_format: 'url' } },
    { name: '1k + 16:9', desc: '1K 分辨率档位 + 16:9', params: { resolution: '1k', aspect_ratio: '16:9', n: 1, response_format: 'url' } },
    { name: '2k + 16:9 + n=2', desc: '2K 分辨率档位 + 16:9 + 张数三重校验', params: { resolution: '2k', aspect_ratio: '16:9', n: 2, response_format: 'url' } },
    { name: '2k + 9:16 竖版', desc: '2k 竖版 9:16', params: { resolution: '2k', aspect_ratio: '9:16', n: 1, response_format: 'url' } },
    { name: '2k + 21:9 超宽', desc: '2k 电影级 21:9', params: { resolution: '2k', aspect_ratio: '21:9', n: 1, response_format: 'url' } },
    { name: 'response_format=b64_json', desc: '返回格式校验', params: { resolution: '1k', aspect_ratio: '1:1', n: 1, response_format: 'b64_json' } },
    { name: '参考图编辑 2k + 16:9', desc: 'edits + 2k + 16:9', params: { resolution: '2k', aspect_ratio: '16:9', n: 1, response_format: 'url' }, needRef: true, prompt: '把背景改成海边日落，保留主体' },
  ],
  gemini: [
    { name: '1K + 1:1', desc: 'imageSize=1K, aspectRatio=1:1', params: { imageSize: '1K', aspectRatio: '1:1' } },
    { name: '2K + 16:9', desc: 'imageSize=2K, aspectRatio=16:9', params: { imageSize: '2K', aspectRatio: '16:9' } },
    { name: '2K + 9:16 竖屏', desc: 'imageSize=2K, aspectRatio=9:16', params: { imageSize: '2K', aspectRatio: '9:16' } },
    { name: '4K + 21:9 超宽', desc: 'imageSize=4K, aspectRatio=21:9', params: { imageSize: '4K', aspectRatio: '21:9' } },
    { name: '4K + 1:1', desc: 'imageSize=4K, aspectRatio=1:1', params: { imageSize: '4K', aspectRatio: '1:1' } },
    { name: '2K + 3:4 竖版', desc: 'imageSize=2K, aspectRatio=3:4', params: { imageSize: '2K', aspectRatio: '3:4' } },
    { name: '512 + 1:1（仅 flash）', desc: 'imageSize=512, aspectRatio=1:1', params: { imageSize: '512', aspectRatio: '1:1' } },
    { name: '参考图 + 2K + 16:9', desc: 'inline_data + 2K + 16:9', params: { imageSize: '2K', aspectRatio: '16:9' }, needRef: true, prompt: '基于参考图，改为电影感海边日落' },
  ],
  seedream: [
    { name: '预设 1K', desc: 'size=1K (按 prompt 自动选比例)', params: { size: '1K', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '预设 2K', desc: 'size=2K (按 prompt 自动选比例)', params: { size: '2K', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '精确 1024×1024', desc: '精确像素', params: { size: '1024x1024', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '精确 1424×800 (1K 16:9)', desc: '精确像素', params: { size: '1424x800', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '精确 2048×2048', desc: '精确像素 2K 方形', params: { size: '2048x2048', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '精确 2816×1584 (2K 16:9)', desc: '精确像素 2K 横版', params: { size: '2816x1584', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '精确 3136×1344 (2K 21:9)', desc: '精确像素 2K 超宽', params: { size: '3136x1344', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: 'output_format=jpeg', desc: '输出格式校验', params: { size: '1K', response_format: 'url', output_format: 'jpeg', watermark: false, seed: -1 } },
    { name: 'response_format=b64_json', desc: '返回格式校验', params: { size: '1K', response_format: 'b64_json', output_format: 'png', watermark: false, seed: -1 } },
    { name: 'watermark=true', desc: '水印参数是否生效', params: { size: '1K', response_format: 'url', output_format: 'png', watermark: true, seed: -1 } },
    { name: 'seed=42 固定种子', desc: 'seed 参数透传', params: { size: '1K', response_format: 'url', output_format: 'png', watermark: false, seed: 42 } },
    { name: '参考图 + 2048×2048', desc: 'image 参数 + 精确尺寸', params: { size: '2048x2048', response_format: 'url', output_format: 'png', watermark: false, seed: -1 }, needRef: true, prompt: '基于输入图生成写实风格头像' },
  ],
}

interface ImgPlan {
  kind: 'json' | 'multipart'
  endpoint: string
  method: string
  headers: Record<string, string>
  body?: any
  multipart?: { fields: Record<string, string>; imagesField: string; images: string[] }
}

function imgUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function imgEsc(s: any) { return String(s ?? '') }
function imgFmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function imgProbeImage(src: string): Promise<{ w: number; h: number }> {
  if (!src) return Promise.resolve({ w: 0, h: 0 })
  return new Promise(resolve => {
    const image = new Image()
    let settled = false
    const finish = (size: { w: number; h: number }) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(size)
    }
    const timer = window.setTimeout(() => finish({ w: 0, h: 0 }), 15_000)
    image.onload = () => finish({ w: image.naturalWidth || image.width, h: image.naturalHeight || image.height })
    image.onerror = () => finish({ w: 0, h: 0 })
    image.src = src
  })
}
function imgBlobToDataURI(b: Blob): Promise<string | null> {
  return new Promise(r => {
    const f = new FileReader()
    f.onload = () => r(f.result as string)
    f.onerror = () => r(null)
    f.readAsDataURL(b)
  })
}
async function imgFetchWithTimeout(u: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(u, { ...init, signal: ctrl.signal })
  } finally {
    window.clearTimeout(timer)
  }
}
async function imgUrlToDataURI(u: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const r = await imgFetchWithTimeout(u, timeoutMs)
    const b = await r.blob()
    return await imgBlobToDataURI(b)
  } catch { return null }
}
function imgDetectUriFormat(d: string | null) {
  const m = /^data:image\/(\w+)/.exec(d || '')
  return m ? m[1].toLowerCase() : 'unknown'
}
function imgDetectResponseFormat(mimeType: string | null, url: string | null): string {
  const mime = /^image\/([a-z0-9.+-]+)/i.exec(mimeType || '')?.[1]
  if (mime) return mime.toLowerCase().replace('jpg', 'jpeg')
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url || '')?.[1]
  return ext ? ext.toLowerCase().replace('jpg', 'jpeg') : 'unknown'
}
function imgFormatResponseBody(body: string): string {
  if (!body) return ''
  try { return JSON.stringify(JSON.parse(body), null, 2) }
  catch { return body }
}
function imgResponseForHistory(body: string): { body: string; complete: boolean } {
  if (!body) return { body: '', complete: true }
  try {
    let complete = true
    const scrub = (value: unknown, key = '', inlineImageData = false): unknown => {
      if (typeof value === 'string' && value.length > 1000 && (key === 'b64_json' || (key === 'data' && inlineImageData))) {
        complete = false
        return `[base64 已从本地历史记录省略 · ${value.length} chars]`
      }
      if (Array.isArray(value)) return value.map(item => scrub(item))
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        const mimeType = record.mimeType || record.mime_type
        const containsInlineImage = typeof mimeType === 'string' && mimeType.startsWith('image/')
        return Object.fromEntries(Object.entries(record).map(([childKey, child]) => [childKey, scrub(child, childKey, containsInlineImage)]))
      }
      return value
    }
    return { body: JSON.stringify(scrub(JSON.parse(body)), null, 2), complete }
  } catch {
    if (body.length <= 500_000) return { body, complete: true }
    return { body: `[超大非 JSON 响应未写入本地历史记录 · ${body.length} chars]`, complete: false }
  }
}
function imgB64ToDataURI(b: string, fmt: string) {
  if (!b) return null
  if (b.startsWith('data:')) return b
  return `data:image/${fmt || 'png'};base64,${b}`
}
function imgParseRatio(s: string | null): number | null {
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(s.trim())
  if (!m) return null
  return parseFloat(m[1]) / parseFloat(m[2])
}
function imgCheckRatio(str: string | null, w: number, h: number) {
  const t = imgParseRatio(str)
  if (!t || !w || !h) return null
  const a = w / h
  const dev = Math.abs(a - t) / t
  return { target: t, actual: +a.toFixed(3), devPct: +(dev * 100).toFixed(1), pass: dev <= 0.05 }
}
function imgResolutionTierBase(value: string | null | undefined) {
  const normalized = String(value || '').trim().toUpperCase()
  return ({ '512': 512, '0.5K': 512, '1K': 1024, '2K': 2048, '4K': 4096 } as Record<string, number>)[normalized] || null
}
function imgResolutionTierLabel(value: string | null | undefined, base: number) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === '512') return '512'
  if (normalized === '0.5K' || normalized === '1K' || normalized === '2K' || normalized === '4K') return normalized
  return base === 512 ? '0.5K' : `${base / 1024}K`
}
function imgCheckResolutionTier(base: number, w: number, h: number) {
  const equivalent = w > 0 && h > 0 ? Math.sqrt(w * h) : 0
  const min = base * IMG_RESOLUTION_TIER_MIN_SCALE
  const devPct = base ? +(((equivalent - base) / base) * 100).toFixed(1) : 0
  return { equivalent: +equivalent.toFixed(1), min: +min.toFixed(1), devPct, pass: equivalent >= min }
}
function imgMakeThumb(dataUri: string | null, maxSide = 160): Promise<string | null> {
  if (!dataUri) return Promise.resolve(null)
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) { res(null); return }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        res(c.toDataURL('image/jpeg', 0.72))
      } catch { res(null) }
    }
    img.onerror = () => res(null)
    img.src = dataUri
  })
}

function imgLoadChannels(): ImgChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(IMG_CH_KEY)
    if (raw) { const l = JSON.parse(raw); if (Array.isArray(l)) return l }
  } catch { /* ignore */ }
  return []
}
// 历史记录存于共享 IndexedDB（dev-toolkit-history / imgtest store），不再整份塞进
// localStorage：老版本会在配额超限时静默从最旧记录开始裁剪，极端情况下只剩最新 1 条。
async function imgHistMigrateOnce(): Promise<void> {
  await historyDbMigrateFromLocalStorage<ImgRecord>('imgtest', IMG_HIST_KEY, imgMigrateHistoryRecord)
}
async function imgLoadHistory(): Promise<ImgRecord[]> {
  const list = await historyDbGetAll<ImgRecord>('imgtest')
  return list.map(imgMigrateHistoryRecord).sort((a, b) => b.time - a.time)
}
async function imgHistTrim(maxCount: number): Promise<void> {
  const list = await imgLoadHistory()
  const overflow = list.slice(maxCount)
  if (overflow.length) await historyDbDeleteMany('imgtest', overflow.map(r => r.id))
}
function imgLoadUi(): { apiType?: ImgApiType; model?: string; prompt?: string } {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(IMG_UI_KEY)
    if (raw) { const c = JSON.parse(raw); return c && typeof c === 'object' ? c : {} }
  } catch { /* ignore */ }
  return {}
}

function imgResolveTierKey(type: ImgApiType, body: any): string {
  body = body || {}
  if (type === 'openai') {
    const q = String(body.quality || '').toLowerCase()
    return (q === 'low' || q === 'high') ? q : 'medium'
  }
  if (type === 'grok') return String(body.resolution || '1k').toLowerCase()
  if (type === 'gemini') {
    const s = String(body?.generationConfig?.imageConfig?.imageSize || body.imageSize || '1K')
    return s === '512' ? '0.5K' : s
  }
  if (type === 'seedream') {
    const s = String(body.size || '')
    if (/^\d+x\d+$/i.test(s)) {
      const [w, h] = s.toLowerCase().split('x').map(Number)
      return (w * h) <= 2.36e6 ? '1K' : '2K'
    }
    return s || '1K'
  }
  return 'default'
}
function imgLookupPrice(model: string, type: ImgApiType, body: any, prices: ImgPrice[]): { usd: number; tier: string; note: string } | null {
  if (!model || !prices.length) return null
  const rows = prices.filter(p => p.model === model)
  if (!rows.length) return null
  const tierKey = imgResolveTierKey(type, body)
  let hit = rows.find(p => p.tier.toLowerCase() === String(tierKey).toLowerCase())
  if (!hit) hit = rows.find(p => p.tier.toLowerCase() === 'default')
  if (!hit) return null
  return { usd: +hit.usd, tier: hit.tier, note: hit.note || '' }
}

function imgBuildPlan(type: ImgApiType, model: string, prompt: string, params: ImgCaseParams, refCount: number): ImgPlan {
  if (type === 'openai') {
    if (refCount > 0) {
      const fields: Record<string, string> = { model, prompt }
      if (params.size && params.size !== 'auto') fields.size = params.size
      if (params.n) fields.n = String(params.n)
      if (params.quality && params.quality !== 'auto') fields.quality = params.quality
      if (params.output_format) fields.output_format = params.output_format
      const images: string[] = []
      for (let i = 1; i <= refCount; i++) images.push(`__REF_${i}_BLOB__`)
      return { kind: 'multipart', endpoint: '/v1/images/edits', method: 'POST', headers: { Authorization: '{{APIKEY}}' }, multipart: { fields, imagesField: 'image[]', images } }
    }
    const body: any = { model, prompt, n: parseInt(params.n) || 1 }
    if (params.size && params.size !== 'auto') body.size = params.size
    if (params.quality && params.quality !== 'auto') body.quality = params.quality
    if (params.output_format) body.output_format = params.output_format
    return { kind: 'json', endpoint: '/v1/images/generations', method: 'POST', headers: { Authorization: '{{APIKEY}}', 'Content-Type': 'application/json' }, body }
  }
  if (type === 'grok') {
    const body: any = { model, prompt }
    if (refCount > 0) {
      const imgs: any[] = []
      for (let i = 1; i <= refCount; i++) imgs.push({ type: 'image_url', url: `__REF_${i}_URL_OR_DATAURI__` })
      if (imgs.length === 1) body.image = imgs[0]
      else body.images = imgs
    } else {
      body.n = parseInt(params.n) || 1
    }
    body.response_format = params.response_format || 'url'
    body.resolution = params.resolution
    if (params.aspect_ratio && params.aspect_ratio !== 'auto') body.aspect_ratio = params.aspect_ratio
    return { kind: 'json', endpoint: refCount > 0 ? '/v1/images/edits' : '/v1/images/generations', method: 'POST', headers: { Authorization: '{{APIKEY}}', 'Content-Type': 'application/json' }, body }
  }
  if (type === 'gemini') {
    const parts: any[] = [{ text: prompt }]
    for (let i = 1; i <= refCount; i++) {
      parts.push({ inline_data: { mime_type: `__REF_${i}_MIME__`, data: `__REF_${i}_BASE64__` } })
    }
    const body = { contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: params.aspectRatio, imageSize: params.imageSize } } }
    return { kind: 'json', endpoint: `/v1/models/${encodeURIComponent(model)}:generateContent`, method: 'POST', headers: { 'x-goog-api-key': '{{APIKEY}}', 'Content-Type': 'application/json' }, body }
  }
  const body: any = {
    model, prompt, size: params.size, response_format: params.response_format || 'url',
    output_format: params.output_format || 'png', watermark: !!params.watermark,
  }
  const seed = parseInt(params.seed)
  if (!isNaN(seed) && seed !== -1) body.seed = seed
  if (refCount > 0) {
    const imgs: string[] = []
    for (let i = 1; i <= refCount; i++) imgs.push(`__REF_${i}_URL_OR_DATAURI__`)
    body.image = imgs.length === 1 ? imgs[0] : imgs
  }
  return { kind: 'json', endpoint: '/v1/images/generations', method: 'POST', headers: { Authorization: '{{APIKEY}}', 'Content-Type': 'application/json' }, body }
}

function imgPlanToPreview(plan: ImgPlan): string {
  if (plan.kind === 'json') return JSON.stringify(plan.body, null, 2)
  return JSON.stringify({
    _note: 'multipart/form-data — 除下方字段外，还会附加参考图到 image[] 字段',
    _fields: plan.multipart?.fields,
    _images: plan.multipart?.images,
  }, null, 2)
}

function imgParseEditedPreview(plan: ImgPlan, text: string): ImgPlan {
  const parsed = JSON.parse(text)
  const np: ImgPlan = { ...plan }
  if (plan.kind === 'json') { np.body = parsed }
  else {
    np.multipart = {
      fields: parsed._fields || {},
      imagesField: plan.multipart!.imagesField,
      images: parsed._images || plan.multipart!.images,
    }
  }
  return np
}

async function imgResolvePlan(plan: ImgPlan, refs: ImgRef[]): Promise<ImgPlan> {
  const clone: ImgPlan = JSON.parse(JSON.stringify(plan))
  const resolveStr = async (s: string): Promise<string> => {
    let m: RegExpExecArray | null
    if ((m = /^__REF_(\d+)_URL_OR_DATAURI__$/.exec(s))) {
      const r = refs[+m[1] - 1]
      if (!r) throw new Error('参考图不足: ' + s)
      return r.url || r.dataUri || ''
    }
    if ((m = /^__REF_(\d+)_DATAURI__$/.exec(s))) {
      const r = refs[+m[1] - 1]
      if (!r) throw new Error('参考图不足')
      return r.dataUri || (r.url ? (await imgUrlToDataURI(r.url)) || '' : '')
    }
    if ((m = /^__REF_(\d+)_BASE64__$/.exec(s))) {
      const r = refs[+m[1] - 1]
      if (!r) throw new Error('参考图不足')
      let d = r.dataUri || (r.url ? await imgUrlToDataURI(r.url) : null)
      const mm = /^data:[^;]+;base64,(.*)$/.exec(d || '')
      return mm ? mm[1] : ''
    }
    if ((m = /^__REF_(\d+)_MIME__$/.exec(s))) {
      const r = refs[+m[1] - 1]
      if (!r) throw new Error('参考图不足')
      const d = r.dataUri || ''
      const mm = /^data:([^;]+);base64,/.exec(d)
      return mm ? mm[1] : 'image/png'
    }
    return s
  }
  const walk = async (node: any): Promise<any> => {
    if (typeof node === 'string') return resolveStr(node)
    if (Array.isArray(node)) { const arr: any[] = []; for (const it of node) arr.push(await walk(it)); return arr }
    if (node && typeof node === 'object') { const o: any = {}; for (const k in node) o[k] = await walk(node[k]); return o }
    return node
  }
  if (clone.kind === 'json') clone.body = await walk(clone.body)
  else clone.multipart!.fields = await walk(clone.multipart!.fields)
  return clone
}

function imgSetResolutionTierTarget(targets: Record<string, any>, value: string | null | undefined) {
  const base = imgResolutionTierBase(value)
  if (!base) return
  targets.resolutionTierBaseReq = base
  targets.resolutionTierLabelReq = imgResolutionTierLabel(value, base)
}

function imgDeriveTargets(type: ImgApiType, plan: ImgPlan): Record<string, any> {
  const t: Record<string, any> = {}
  const body = plan.kind === 'json' ? plan.body : (plan.multipart?.fields) || {}
  if (type === 'openai' || type === 'seedream') {
    const s = body.size
    if (typeof s === 'string' && /^\d+x\d+$/i.test(s)) { const [w, h] = s.toLowerCase().split('x').map(Number); t.wReq = w; t.hReq = h; t.sizeReq = s }
    else if (s) { t.sizeReq = s; imgSetResolutionTierTarget(t, s) }
  }
  if (type === 'grok') { imgSetResolutionTierTarget(t, body.resolution); t.ratioReq = (body.aspect_ratio && body.aspect_ratio !== 'auto') ? body.aspect_ratio : null }
  if (type === 'gemini') {
    const ic = body?.generationConfig?.imageConfig || {}
    imgSetResolutionTierTarget(t, ic.imageSize)
    t.ratioReq = ic.aspectRatio
  }
  t.nReq = parseInt(body.n) || 1
  t._of = body.output_format
  t._rf = body.response_format
  t._wm = body.watermark
  return t
}

async function imgExecutePlan(plan: ImgPlan, channel: { baseUrl: string; apiKey: string }, refs: ImgRef[]) {
  const url = channel.baseUrl + plan.endpoint
  const headers: Record<string, string> = {}
  for (const k in plan.headers) {
    headers[k] = plan.headers[k].replace('{{APIKEY}}', k.toLowerCase() === 'x-goog-api-key' ? channel.apiKey : 'Bearer ' + channel.apiKey)
  }
  let opts: RequestInit
  if (plan.kind === 'json') {
    opts = { method: plan.method, headers, body: JSON.stringify(plan.body) }
  } else {
    const fd = new FormData()
    for (const k in plan.multipart!.fields) fd.append(k, plan.multipart!.fields[k])
    let idx = 0
    for (const imgRef of plan.multipart!.images) {
      let m: RegExpExecArray | null
      let dataUri: string | null = null
      if ((m = /^__REF_(\d+)_BLOB__$/.exec(imgRef))) {
        const r = refs[+m[1] - 1]
        dataUri = r?.dataUri || (r?.url ? await imgUrlToDataURI(r.url) : null)
      } else if (typeof imgRef === 'string' && imgRef.startsWith('data:')) { dataUri = imgRef }
      else continue
      if (!dataUri) continue
      const resp = await fetch(dataUri)
      const blob = await resp.blob()
      fd.append(plan.multipart!.imagesField, blob, 'ref' + (++idx) + '.png')
    }
    delete headers['Content-Type']
    delete headers['content-type']
    opts = { method: plan.method, headers, body: fd }
  }
  const resp = await imgFetchWithTimeout(url, 120_000, opts)
  const rh: Record<string, string> = {}
  resp.headers.forEach((v, k) => { rh[k.toLowerCase()] = v })
  const text = await resp.text()
  return { resp, headers: rh, httpStatus: resp.status, text }
}

interface ImgParsedResponse {
  ok: boolean
  httpStatus: number
  headers: Record<string, string>
  images: { url: string | null; dataUri: string | null; mimeType: string | null }[]
  rawSnippet: string
  error: string | null
}
function imgParseResponse(type: ImgApiType, text: string, headers: Record<string, string>, httpStatus: number, ok: boolean, fmtHint: string | undefined): ImgParsedResponse {
  const out: ImgParsedResponse = { ok, httpStatus, headers, images: [], rawSnippet: text, error: null }
  let json: any = null
  try { json = JSON.parse(text) } catch { /* ignore */ }
  if (!ok || !json) {
    out.ok = false
    out.error = (json && (json.error?.message || json.message || JSON.stringify(json.error || json).slice(0, 300))) || text.slice(0, 400) || ('HTTP ' + httpStatus)
    return out
  }
  if (type === 'gemini') {
    ;(json.candidates || []).forEach((c: any) => (c.content?.parts || []).forEach((p: any) => {
      const d = p.inlineData || p.inline_data
      if (d && d.data) {
        const mime = d.mimeType || d.mime_type || 'image/png'
        out.images.push({ dataUri: imgB64ToDataURI(d.data, mime.split('/')[1]), url: null, mimeType: mime })
      }
    }))
  } else {
    const arr = json.data || []
    out.images = arr.map((d: any) => ({
      url: d.url || null,
      dataUri: d.b64_json ? imgB64ToDataURI(d.b64_json, fmtHint || 'png') : null,
      mimeType: d.mime_type || d.mimeType || null,
    }))
  }
  out.ok = out.images.length > 0
  if (!out.ok) out.error = '响应中未找到图片数据'
  return out
}

interface ImgRecImage { dataUri: string | null; thumb: string | null; url: string | null; w: number; h: number; format: string }
interface ImgCheck { name: string; target: string | number; actual: string | number; pass: boolean; info?: boolean }
interface ImgRecord {
  id: string
  time: number
  caseName: string
  caseDesc: string
  channelName: string
  apiType: ImgApiType
  model: string
  prompt: string
  targets: Record<string, any>
  useRef: boolean
  refThumbs: (string | null)[]
  price: { usd: number; cny: number; tier: string; note: string; count: number } | null
  status: number
  respHeaders: Record<string, string>
  reqId: string
  sentPreview: string
  ok: boolean
  error: string | null
  rawSnippet: string
  responseBodyComplete?: boolean
  images: ImgRecImage[]
  returnedN: number
  durationMs: number
  checks: ImgCheck[]
  validationVersion?: number
}
interface ImgCase {
  id: string
  name: string
  desc: string
  params: ImgCaseParams
  needRef: boolean
  prompt: string | null
  selected: boolean
  expanded: boolean
  status: 'idle' | 'running' | 'pass' | 'fail' | 'error'
  editedPreview: string | null
  plan: ImgPlan | null
  result: ImgRecord | null
}

function imgBuildChecks(rec: ImgRecord): ImgCheck[] {
  const c: ImgCheck[] = []
  const t = rec.targets || {}
  c.push({ name: rec.useRef ? '请求成功（参考图透传）' : '请求成功', target: 'HTTP 2xx', actual: 'HTTP ' + (rec.status || 0), pass: !!rec.ok })
  if (!rec.ok) return c
  if (t.nReq) c.push({ name: '返回张数 (n)', target: t.nReq, actual: rec.returnedN, pass: rec.returnedN === t.nReq })
  rec.images.forEach((im, i) => {
    const tag = rec.images.length > 1 ? `图${i + 1} ` : ''
    if (t.wReq && t.hReq) {
      c.push({ name: tag + '精确尺寸', target: `${t.wReq}×${t.hReq}`, actual: `${im.w}×${im.h}`, pass: im.w === t.wReq && im.h === t.hReq })
    } else if (t.resolutionTierBaseReq) {
      const tier = imgCheckResolutionTier(t.resolutionTierBaseReq, im.w, im.h)
      const signedDev = `${tier.devPct > 0 ? '+' : ''}${tier.devPct}%`
      c.push({
        name: tag + '分辨率档位',
        target: `${t.resolutionTierLabelReq || imgResolutionTierLabel(null, t.resolutionTierBaseReq)} 档（下限等效 ${Math.round(tier.min)}px）`,
        actual: im.w > 0 && im.h > 0 ? `${im.w}×${im.h}（等效 ${Math.round(tier.equivalent)}px，偏差${signedDev}）` : '未能读取图片尺寸',
        pass: tier.pass,
      })
    } else {
      c.push({ name: tag + '尺寸', target: t.sizeReq || '—', actual: `${im.w}×${im.h}`, pass: true, info: true })
    }
    if (t.ratioReq) {
      const r = imgCheckRatio(t.ratioReq, im.w, im.h)
      c.push(r
        ? { name: tag + '宽高比', target: t.ratioReq, actual: `${r.actual} (偏差${r.devPct}%)`, pass: r.pass }
        : { name: tag + '宽高比', target: t.ratioReq, actual: '未能读取图片尺寸', pass: false })
    }
    if (t._of) {
      const norm = (f: string) => f === 'jpg' ? 'jpeg' : f
      c.push({ name: tag + '输出格式', target: t._of, actual: im.format, pass: norm(im.format) === norm(t._of) })
    }
  })
  if (t._rf) {
    const hasUrl = rec.images.some(im => im.url)
    const got = hasUrl ? 'url' : 'b64_json'
    c.push({ name: 'response_format', target: t._rf, actual: got, pass: got === t._rf })
  }
  return c
}
function imgMigrateHistoryRecord(record: ImgRecord): ImgRecord {
  if (!record || record.validationVersion === IMG_VALIDATION_VERSION) return record
  const targets = { ...(record.targets || {}) }
  if (!targets.resolutionTierBaseReq && targets.longEdgeReq) {
    targets.resolutionTierBaseReq = targets.longEdgeReq
    targets.resolutionTierLabelReq = imgResolutionTierLabel(null, targets.longEdgeReq)
    delete targets.longEdgeReq
  }
  const migrated: ImgRecord = { ...record, targets, validationVersion: IMG_VALIDATION_VERSION }
  return { ...migrated, checks: imgBuildChecks(migrated) }
}
function imgVerdict(checks: ImgCheck[]): { level: 'ok' | 'fail' | 'warn'; text: string } {
  const real = checks.filter(x => !x.info)
  const fail = real.filter(x => !x.pass).length
  if (!real.length) return { level: 'warn', text: '无校验项' }
  if (!fail) return { level: 'ok', text: `通过 ${real.length}/${real.length}` }
  return { level: 'fail', text: `${real.length - fail}/${real.length} 通过` }
}
function imgMakeSentPreview(plan: ImgPlan): string {
  const truncate = (o: any): any => {
    if (typeof o === 'string') {
      if (o.length > 400) return o.slice(0, 80) + `...<${o.length} chars>...`
      return o
    }
    if (Array.isArray(o)) return o.map(truncate)
    if (o && typeof o === 'object') { const n: any = {}; for (const k in o) n[k] = truncate(o[k]); return n }
    return o
  }
  if (plan.kind === 'json') return JSON.stringify(truncate(plan.body), null, 2)
  return JSON.stringify({ _multipart: true, fields: truncate(plan.multipart!.fields), images: `[${plan.multipart!.images.length} 张参考图 blob]` }, null, 2)
}

// ─── 导出：HTML 报告 / 图片（DOM 截图模式，参考 LlmBatchTool.tsx 的 html2canvas 套路）─
// 导出内容严禁包含明文 apiKey：渠道标识只用 ImgRecord.channelName（不含 baseUrl），
// 从不调用 imgDecryptApiKey；已发送请求体/响应头/响应体的展示逻辑（renderResultBody）
// 本来就只用占位符 {{APIKEY}}，不会回显真实 key。

function imgDownloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
function imgDownloadText(name: string, content: string, mime: string) {
  imgDownloadBlob(name, new Blob([content], { type: mime }))
}
function imgWithExpandedScrollAreas<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-export-scroll]'))
  const saved = els.map(el => ({ maxHeight: el.style.maxHeight, overflowY: el.style.overflowY, overflowX: el.style.overflowX }))
  els.forEach(el => { el.style.maxHeight = 'none'; el.style.overflowY = 'visible'; el.style.overflowX = 'visible' })
  return fn().finally(() => els.forEach((el, i) => { el.style.maxHeight = saved[i].maxHeight; el.style.overflowY = saved[i].overflowY; el.style.overflowX = saved[i].overflowX }))
}
async function imgCaptureReportCanvas(rootEl: HTMLElement): Promise<HTMLCanvasElement> {
  // html2canvas 1.x 无法解析 color-mix()/color() 等现代 CSS 颜色函数（Tailwind v4 主题大量
  // 使用，getComputedStyle 会把它们解析成 html2canvas 看不懂的 color(...) 语法直接抛异常），
  // 用兼容新 CSS 颜色函数的社区 fork html2canvas-pro 替代，API 完全兼容
  const { default: html2canvas } = await import('html2canvas-pro')
  return imgWithExpandedScrollAreas(rootEl, () => html2canvas(rootEl, {
    backgroundColor: getComputedStyle(rootEl).getPropertyValue('--bg').trim() || '#ffffff',
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
  }))
}
async function imgExportAsImage(rootEl: HTMLElement, filename: string) {
  try {
    const canvas = await imgCaptureReportCanvas(rootEl)
    canvas.toBlob(blob => { if (blob) imgDownloadBlob(filename, blob) }, 'image/png')
  } catch (e) {
    console.error('[imgExportAsImage]', e)
    window.alert('导出图片失败，请稍后重试。')
  }
}
async function imgExportAsHtml(rootEl: HTMLElement, filename: string) {
  try {
    await imgWithExpandedScrollAreas(rootEl, async () => {
      const clone = rootEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-html2canvas-ignore]').forEach(el => el.remove())
      const varNames = ['bg', 's1', 's2', 'border', 'borderHard', 'text', 't2', 't3', 'accent', 'accentFg', 'accentSub', 'accentSubHard', 'primary', 'primaryFg', 'sidebar', 'code', 'shadow', 'shadowMd', 'ok', 'okBg', 'err', 'errBg', 'warn', 'warnBg', 'inputBg', 'inputBorder']
      const cs = getComputedStyle(rootEl)
      const varsCss = ':root{' + varNames.map(n => `--${n}:${cs.getPropertyValue('--' + n).trim()}`).join(';') + '}'
      let appCss = ''
      for (const sheet of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sheet.cssRules)) appCss += rule.cssText + '\n' } catch { /* 跨域样式表跳过 */ }
      }
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><title>图片接口测试报告</title><style>${varsCss}\nbody{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}\n${appCss}</style></head><body>${clone.outerHTML}</body></html>`
      imgDownloadText(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch {
    window.alert('导出 HTML 失败，请稍后重试。')
  }
}
function imgExportFilename(apiType: ImgApiType, ext: 'png' | 'html'): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`
  return `imgtest-report-${apiType}-${stamp}.${ext}`
}

function ImgApiTestTool() {
  const ui0 = imgLoadUi()
  const [pane, setPane] = useState<'test' | 'channels' | 'prices' | 'history'>('test')
  const [channels, setChannels] = useState<ImgChannel[]>(() => imgLoadChannels())
  const [activeChId, setActiveChId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(IMG_ACTIVE_KEY)
  })
  const [apiType, setApiType] = useState<ImgApiType>(ui0.apiType ?? 'openai')
  const [model, setModel] = useState(ui0.model ?? '')
  const [prompt, setPrompt] = useState(ui0.prompt ?? '一只在月球上喝咖啡的猫，电影质感')
  const [refImages, setRefImages] = useState<ImgRef[]>([])
  const [prices, setPrices] = useState<ImgPrice[]>(() => imgLoadPrices())
  const [rateStr, setRateStr] = useState(() => imgLoadRate())
  const [history, setHistory] = useState<ImgRecord[]>([])

  const [chForm, setChForm] = useState({ name: '', baseUrl: '', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [priceForm, setPriceForm] = useState({ model: '', tier: '', usd: '', note: '' })

  const [cases, setCases] = useState<ImgCase[]>(() =>
    (IMG_TEST_SETS[ui0.apiType ?? 'openai'] || []).map((c, i) => ({
      id: 'c' + i, name: c.name, desc: c.desc, params: JSON.parse(JSON.stringify(c.params)),
      needRef: !!c.needRef, prompt: c.prompt || null,
      selected: true, expanded: false, status: 'idle' as const,
      editedPreview: null, plan: null, result: null,
    })))
  const [selAll, setSelAll] = useState(true)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState('')
  const [detailRec, setDetailRec] = useState<ImgRecord | null>(null)
  const [fChannel, setFChannel] = useState('')
  const [fApiType, setFApiType] = useState('')
  const [fModel, setFModel] = useState('')
  const [fResult, setFResult] = useState('')
  const [selHistIds, setSelHistIds] = useState<Set<string>>(new Set())
  const [exportJob, setExportJob] = useState<{ records: ImgRecord[]; format: 'png' | 'html' } | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const reportRootRef = useRef<HTMLDivElement>(null)

  const toastRef = useRef<number | null>(null)
  const stopRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const refImagesRef = useRef(refImages)
  const channelsRef = useRef(channels)
  const casesRef = useRef(cases)
  const rateRef = useRef(parseFloat(rateStr) || IMG_DEFAULT_RATE)

  useEffect(() => { refImagesRef.current = refImages }, [refImages])
  useEffect(() => { channelsRef.current = channels }, [channels])
  useEffect(() => { casesRef.current = cases }, [cases])
  useEffect(() => { rateRef.current = parseFloat(rateStr) || IMG_DEFAULT_RATE }, [rateStr])

  useEffect(() => { try { localStorage.setItem(IMG_CH_KEY, JSON.stringify(channels)) } catch { /* ignore */ } }, [channels])
  useEffect(() => { if (activeChId) { try { localStorage.setItem(IMG_ACTIVE_KEY, activeChId) } catch { /* ignore */ } } }, [activeChId])
  useEffect(() => { imgSavePrices(prices) }, [prices])
  useEffect(() => { imgSaveRate(rateStr) }, [rateStr])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await imgHistMigrateOnce()
      const list = await imgLoadHistory()
      if (!cancelled) setHistory(list)
    })()
    return () => { cancelled = true }
  }, [])
  useEffect(() => { try { localStorage.setItem(IMG_UI_KEY, JSON.stringify({ apiType, model, prompt })) } catch { /* ignore */ } }, [apiType, model, prompt])
  useEffect(() => {
    setCases(cs => cs.map(c => c.editedPreview == null ? { ...c, plan: null } : c))
  }, [apiType, model, prompt])
  useEffect(() => {
    if (!exportJob) return
    const root = reportRootRef.current
    if (!root) { setExportJob(null); return }
    let cancelled = false
    ;(async () => {
      setExportBusy(true)
      try {
        const filename = imgExportFilename(apiType, exportJob.format === 'png' ? 'png' : 'html')
        if (exportJob.format === 'png') await imgExportAsImage(root, filename)
        else await imgExportAsHtml(root, filename)
      } finally {
        if (!cancelled) { setExportBusy(false); setExportJob(null) }
      }
    })()
    return () => { cancelled = true }
  }, [exportJob])

  const toastShow = (m: string) => {
    setToast(m)
    if (toastRef.current) window.clearTimeout(toastRef.current)
    toastRef.current = window.setTimeout(() => setToast(''), 2200)
  }

  const activeChannel = channels.find(c => c.id === activeChId) ?? null
  const rate = parseFloat(rateStr) || IMG_DEFAULT_RATE

  const switchApiType = (t: ImgApiType) => {
    setApiType(t)
    setCases((IMG_TEST_SETS[t] || []).map((c, i) => ({
      id: 'c' + i, name: c.name, desc: c.desc, params: JSON.parse(JSON.stringify(c.params)),
      needRef: !!c.needRef, prompt: c.prompt || null,
      selected: true, expanded: false, status: 'idle' as const,
      editedPreview: null, plan: null, result: null,
    })))
    setSelAll(true)
  }

  const planOf = (c: ImgCase): ImgPlan => c.plan ?? imgBuildPlan(apiType, model.trim() || IMG_PLACEHOLDER_MODEL[apiType], c.prompt ?? prompt, c.params, c.needRef ? refImages.length : 0)
  const bodyOf = (plan: ImgPlan) => plan.kind === 'json' ? plan.body : (plan.multipart?.fields) || {}

  const saveChannel = async () => {
    const name = chForm.name.trim()
    const base = chForm.baseUrl.trim().replace(/\/+$/, '')
    const key = chForm.apiKey.trim()
    if (!name || !base) { toastShow('请填写渠道名称与 baseUrl'); return }
    let apiKeyEnc = ''
    let keyMask = ''
    if (key) {
      const enc = await imgEncryptApiKey(key)
      if (!enc) { toastShow('加密失败，请重试'); return }
      apiKeyEnc = enc
      keyMask = key.slice(0, 8) + '••••' + key.slice(-4)
    }
    if (editingChId) {
      const target = channels.find(x => x.id === editingChId)
      if (!target) return
      const nc: ImgChannel = { ...target, name, baseUrl: base }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(x => x.id === editingChId ? nc : x))
    } else {
      if (!apiKeyEnc) { toastShow('请填写 apiKey'); return }
      const nc: ImgChannel = { id: imgUid(), name, baseUrl: base, apiKeyEnc, keyMask }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm({ name: '', baseUrl: '', apiKey: '' })
    setEditingChId(null)
    toastShow('已保存')
  }
  const editChannel = (c: ImgChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, apiKey: '' })
    setEditingChId(c.id)
    setPane('channels')
  }
  const delChannel = (id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(channels.filter(x => x.id !== id))
    if (activeChId === id) setActiveChId(null)
  }

  const updatePrice = (idx: number, v: number) => {
    setPrices(prev => prev.map((x, i) => i === idx ? { ...x, usd: v } : x))
  }
  const delPrice = (idx: number) => {
    if (!window.confirm(`删除 ${prices[idx].model} (${prices[idx].tier}) 的价格条目？`)) return
    setPrices(prev => prev.filter((_, i) => i !== idx))
  }
  const addPrice = () => {
    const m = priceForm.model.trim()
    const tier = priceForm.tier.trim() || 'default'
    const usd = parseFloat(priceForm.usd)
    if (!m) { toastShow('请填写模型编码'); return }
    if (isNaN(usd) || usd < 0) { toastShow('请填写有效的美元价格'); return }
    setPrices(prev => {
      const exist = prev.find(p => p.model === m && p.tier.toLowerCase() === tier.toLowerCase())
      if (exist) return prev.map(p => p === exist ? { ...p, usd, note: priceForm.note.trim() || p.note } : p)
      return [...prev, { model: m, tier, usd, note: priceForm.note.trim() || undefined }]
    })
    setPriceForm({ model: '', tier: '', usd: '', note: '' })
    toastShow('已添加')
  }
  const resetPrices = () => {
    if (!window.confirm('恢复为内置默认价格？将覆盖你的自定义修改。')) return
    setPrices(JSON.parse(JSON.stringify(IMG_DEFAULT_PRICES)))
    toastShow('已恢复默认价格')
  }

  const addRefFile = async (files: FileList | null) => {
    if (!files || !files.length) return
    const list: ImgRef[] = []
    for (const f of Array.from(files)) {
      const d = await imgBlobToDataURI(f)
      list.push({ dataUri: d, name: f.name })
    }
    setRefImages(prev => [...prev, ...list])
  }
  const [refUrlDraft, setRefUrlDraft] = useState('')
  const addRefUrl = async () => {
    const u = refUrlDraft.trim()
    if (!u) return
    const d = await imgUrlToDataURI(u)
    setRefImages(prev => [...prev, { url: u, dataUri: d }])
    setRefUrlDraft('')
  }

  const toggleExpand = (c: ImgCase) => {
    c.expanded = !c.expanded
    setCases([...cases])
  }
  const toggleSel = (c: ImgCase, v: boolean) => {
    c.selected = v
    const arr = [...cases]
    setCases(arr)
    setSelAll(arr.every(x => x.selected))
  }
  const toggleSelAll = (v: boolean) => {
    const arr = cases.map(c => ({ ...c, selected: v }))
    setCases(arr)
    setSelAll(v)
  }

  const emptyRecord = (c: ImgCase, chName: string, m: string, err: string): ImgRecord => ({
    id: imgUid(), time: Date.now(), caseName: c.name, caseDesc: c.desc,
    channelName: chName, apiType, model: m, prompt: c.prompt ?? prompt,
    targets: {}, useRef: c.needRef, refThumbs: [], price: null,
    status: 0, respHeaders: {}, reqId: '', sentPreview: '',
    ok: false, error: err, rawSnippet: '', images: [], returnedN: 0, durationMs: 0, checks: [], validationVersion: IMG_VALIDATION_VERSION,
  })

  const runCase = async (c: ImgCase) => {
    if (running && c.status !== 'running') { toastShow('正在批量运行中'); return }
    const ch = channelsRef.current.find(x => x.id === activeChId)
    if (!ch) { toastShow('请先在「渠道管理」添加并选择渠道'); return }
    const m = model.trim() || IMG_PLACEHOLDER_MODEL[apiType]
    if (!m.trim()) { toastShow('请填写模型编码'); return }
    if (c.needRef && refImagesRef.current.length === 0) { toastShow('该用例需要参考图'); return }
    const apiKey = await imgDecryptApiKey(ch.apiKeyEnc)
    if (!apiKey) { toastShow('渠道 API Key 无效，请重新编辑保存'); return }

    c.status = 'running'
    c.expanded = true
    c.result = null
    setCases([...casesRef.current])

    const usePrompt = c.prompt || prompt
    let plan = imgBuildPlan(apiType, m, usePrompt, c.params, c.needRef ? refImagesRef.current.length : 0)
    c.plan = plan
    if (c.editedPreview != null) {
      try { plan = imgParseEditedPreview(plan, c.editedPreview) }
      catch (e: any) {
        c.status = 'error'
        c.result = emptyRecord(c, ch.name, m, '请求体 JSON 无法解析：' + (e?.message || e))
        setCases([...casesRef.current])
        return
      }
    }
    const targets = imgDeriveTargets(apiType, plan)
    const planBody = bodyOf(plan)
    const priceHit = imgLookupPrice(m, apiType, planBody, prices)
    const priceCount = parseInt(planBody.n) || 1

    const t0 = performance.now()
    const rec: ImgRecord = {
      id: imgUid(), time: Date.now(), caseName: c.name, caseDesc: c.desc,
      channelName: ch.name, apiType, model: m, prompt: usePrompt,
      targets, useRef: c.needRef,
      price: priceHit ? { ...priceHit, cny: +(priceHit.usd * rateRef.current).toFixed(4), count: priceCount } : null,
      refThumbs: [],
      status: 0, respHeaders: {}, reqId: '', sentPreview: '',
      ok: false, error: null, rawSnippet: '', responseBodyComplete: true, images: [], returnedN: 0, durationMs: 0, checks: [],
      validationVersion: IMG_VALIDATION_VERSION,
    }
    try {
      const resolved = await imgResolvePlan(plan, refImagesRef.current)
      rec.sentPreview = imgMakeSentPreview(resolved)
      const exec = await imgExecutePlan(resolved, { baseUrl: ch.baseUrl, apiKey }, refImagesRef.current)
      rec.status = exec.httpStatus
      rec.respHeaders = exec.headers
      rec.reqId = exec.headers['x-oneapi-request-id'] || ''
      const fmtHint = plan.kind === 'json' ? plan.body?.output_format : plan.multipart?.fields?.output_format
      const parsed = imgParseResponse(apiType, exec.text, exec.headers, exec.httpStatus, exec.resp.ok, fmtHint)
      rec.ok = parsed.ok
      rec.error = parsed.error
      rec.rawSnippet = parsed.rawSnippet
      rec.responseBodyComplete = true
      if (parsed.ok) {
        const imgs: ImgRecImage[] = []
        for (const im of parsed.images) {
          let dataUri = im.dataUri
          let dim = !dataUri && im.url ? await imgProbeImage(im.url) : { w: 0, h: 0 }
          if ((!dim.w || !dim.h) && !dataUri && im.url) dataUri = await imgUrlToDataURI(im.url)
          if ((!dim.w || !dim.h) && dataUri) dim = await imgProbeImage(dataUri)
          const thumb = await imgMakeThumb(dataUri)
          const uriFormat = imgDetectUriFormat(dataUri)
          imgs.push({
            dataUri, thumb, url: im.url || null, w: dim.w, h: dim.h,
            format: uriFormat === 'unknown' ? imgDetectResponseFormat(im.mimeType, im.url) : uriFormat,
          })
        }
        rec.images = imgs
        rec.returnedN = imgs.length
      } else {
        rec.images = []
        rec.returnedN = 0
      }
      rec.durationMs = Math.round(performance.now() - t0)
      rec.checks = imgBuildChecks(rec)
      const v = imgVerdict(rec.checks)
      c.status = rec.ok ? (v.level === 'ok' ? 'pass' : 'fail') : 'error'
    } catch (e: any) {
      rec.ok = false
      rec.error = e?.message || String(e)
      rec.durationMs = Math.round(performance.now() - t0)
      rec.status = rec.status || 0
      rec.images = []
      rec.returnedN = 0
      rec.checks = imgBuildChecks(rec)
      c.status = 'error'
    }
    c.result = rec
    try {
      if (c.needRef) {
        for (const r of refImagesRef.current) {
          rec.refThumbs.push(r.dataUri ? await imgMakeThumb(r.dataUri) : (r.url || null))
        }
      }
      const storedResponse = imgResponseForHistory(rec.rawSnippet)
      const histRec: ImgRecord = {
        ...rec,
        rawSnippet: storedResponse.body,
        responseBodyComplete: storedResponse.complete,
        images: rec.images.map(im => ({ ...im, dataUri: null })),
      }
      setHistory(h => [histRec, ...h].slice(0, IMG_HIST_MAX))
      historyDbPutOne('imgtest', histRec)
        .then(() => imgHistTrim(IMG_HIST_MAX))
        .catch(() => toastShow('历史记录写入失败'))
    } catch { /* 收尾失败不阻塞状态更新 */ }
    setCases([...casesRef.current])
  }

  const runList = async (list: ImgCase[]) => {
    if (running) { toastShow('已有运行中'); return }
    setRunning(true)
    stopRef.current = false
    try {
      for (const c of list) {
        if (stopRef.current) break
        if (c.needRef && refImagesRef.current.length === 0) {
          c.status = 'error'
          c.result = emptyRecord(c, activeChannel?.name || '', model.trim() || IMG_PLACEHOLDER_MODEL[apiType], '需要参考图但未提供')
          setCases([...casesRef.current])
          continue
        }
        try {
          await runCase(c)
        } catch { /* 单个用例异常不中断批量 */ }
        await new Promise(r => setTimeout(r, 150))
      }
    } finally {
      setRunning(false)
      stopRef.current = false
    }
    toastShow('批量测试结束')
  }

  const selCases = cases.filter(c => c.selected)
  const doneCount = cases.filter(c => c.status === 'pass' || c.status === 'fail' || c.status === 'error').length
  const passCount = cases.filter(c => c.status === 'pass').length
  const failCount = cases.filter(c => c.status === 'fail' || c.status === 'error').length

  let costUsd = 0, costN = 0
  for (const c of selCases) {
    const plan = planOf(c)
    const p = imgLookupPrice(model.trim() || IMG_PLACEHOLDER_MODEL[apiType], apiType, bodyOf(plan), prices)
    if (p) { const n = parseInt(bodyOf(plan).n) || 1; costUsd += p.usd * n; costN++ }
  }

  const statusBadge = (c: ImgCase) => {
    if (c.status === 'running') {
      return <Badge><span className="inline-block w-3 h-3 rounded-full border-2 animate-spin align-middle" style={{ borderColor: 'var(--accentSub)', borderTopColor: 'var(--accent)' }} /> 运行中</Badge>
    }
    if (c.status === 'pass') { const v = c.result ? imgVerdict(c.result.checks) : null; return <Badge color="ok">✓ {v ? v.text : '通过'}</Badge> }
    if (c.status === 'fail') { const v = c.result ? imgVerdict(c.result.checks) : null; return <Badge color="err">✕ {v ? v.text : '未通过'}</Badge> }
    if (c.status === 'error') return <Badge color="warn">! 请求失败</Badge>
    return <Badge>待运行</Badge>
  }

  const priceTag = (p: { usd: number; tier: string; note: string }, mult: number) => {
    const n = mult > 1 ? mult : 1
    return (
      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono whitespace-nowrap" title={`档位 ${p.tier}${p.note ? ' · ' + p.note : ''}${n > 1 ? ' · ×' + n + '张' : ''}`}
        style={{ background: 'var(--warnBg)', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }}>
        ${(p.usd * n).toFixed(3)} / ¥{(p.usd * rate * n).toFixed(3)}{n > 1 ? ` (${n}张)` : ''}
      </span>
    )
  }

  const imgCell = (im: ImgRecImage, small?: boolean) => {
    const src = im.dataUri || im.thumb || im.url || ''
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
        {src ? (
          <img src={src} className={"w-full block cursor-zoom-in " + (small ? 'h-24 object-cover' : '')}
            style={{ background: 'var(--s2)' }} onClick={() => { if (im.url) window.open(im.url, '_blank') }} />
        ) : <div className="h-24 flex items-center justify-center text-xs" style={{ color: 'var(--t3)' }}>无预览</div>}
        <div className="px-2 py-1.5 text-[11px]">
          <div className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{im.w}×{im.h}</div>
          <div style={{ color: 'var(--t3)' }}>{imgEsc(im.format || '?')}{im.url ? ' · URL' : ''}</div>
        </div>
      </div>
    )
  }

  const renderChecks = (r: ImgRecord) => (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
            <th className="px-3 py-2 font-semibold">校验项</th>
            <th className="px-3 py-2 font-semibold">请求</th>
            <th className="px-3 py-2 font-semibold">实际</th>
            <th className="px-3 py-2 font-semibold">结果</th>
          </tr>
        </thead>
        <tbody>
          {r.checks.map((x, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="px-3 py-2">{x.name}</td>
              <td className="px-3 py-2 font-mono">{String(x.target)}</td>
              <td className="px-3 py-2 font-mono">{String(x.actual)}</td>
              <td className="px-3 py-2">{x.info ? <Badge>信息</Badge> : (x.pass ? <Badge color="ok">通过</Badge> : <Badge color="err">未通过</Badge>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderResultBody = (r: ImgRecord, opts: { hidePrice?: boolean; defaultOpenReq?: boolean } = {}) => (
    <div className="flex flex-col gap-4">
      {r.checks.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>校验结果</p>
          {renderChecks(r)}
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--t2)' }}>
        <span>HTTP <b style={{ color: 'var(--text)' }}>{r.status}</b></span>
        <span>耗时 <b style={{ color: 'var(--text)' }}>{r.durationMs}ms</b></span>
        <span>返回张数 <b style={{ color: 'var(--text)' }}>{r.returnedN || 0}</b></span>
        {r.price && !opts.hidePrice && (
          <span>参考价格（档位 {r.price.tier} · 1美元={rate}元）：<b style={{ color: 'var(--warn)' }}>${(r.price.usd * (r.price.count || 1)).toFixed(3)} / ¥{(r.price.cny * (r.price.count || 1)).toFixed(3)}</b>
            {(r.price.count || 1) > 1 ? `（${r.price.count} 张 × $${r.price.usd.toFixed(3)}）` : ''}{r.price.note ? ' · ' + r.price.note : ''}</span>
        )}
      </div>
      <div className="inline-flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 text-xs"
        style={{ background: 'var(--warnBg)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)', color: 'var(--warn)' }}>
        x-oneapi-request-id: <span className="font-mono font-bold">{r.reqId ? imgEsc(r.reqId) : '（未在响应头中读取到，可能是 CORS 未暴露该字段）'}</span>
        {r.respHeaders['x-upstream-request-id'] && <span className="font-mono" style={{ color: 'var(--t2)' }}>· upstream: {r.respHeaders['x-upstream-request-id']}</span>}
      </div>
      {r.error && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--errBg)', border: '1px solid color-mix(in srgb, var(--err) 35%, transparent)', color: 'var(--err)' }}>
          <b>错误：</b>{imgEsc(r.error)}
        </div>
      )}
      {r.images.length > 0 && (
        <div>
          {r.useRef && r.refThumbs.length > 0 ? (
            <>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>参考图 vs 生成图</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  {r.refThumbs.map((th, i) => th ? <img key={i} src={th} className="rounded-xl w-full object-contain" style={{ border: '1px solid var(--border)', background: 'var(--s1)', maxHeight: 200 }} /> : null)}
                </div>
                <div className="flex flex-col gap-2">{r.images.map((im, i) => <div key={i}>{imgCell(im, true)}</div>)}</div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>生成图（{r.images.length}）</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{r.images.map((im, i) => <div key={i}>{imgCell(im)}</div>)}</div>
            </>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {[
          ['响应头', JSON.stringify(r.respHeaders || {}, null, 2), false],
          [r.responseBodyComplete === false ? '响应体（历史记录已省略 base64）' : '响应体', imgFormatResponseBody(r.rawSnippet || ''), false],
          ['已发送的请求体（占位符已替换 · base64 已省略）', r.sentPreview || '', true],
        ].map(([label, body, isReq]) => (
          <details key={label as string} open={isReq ? opts.defaultOpenReq : undefined} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>{label as string}</summary>
            {/* data-export-scroll：默认展开的请求体在导出截图时，配合 imgWithExpandedScrollAreas
                临时去掉 max-height/overflow 限制，避免长 JSON 被裁掉只截到前 32rem */}
            <pre data-response-body={(label as string).startsWith('响应体') ? 'true' : undefined} data-export-scroll
              className="p-3 text-[11px] font-mono overflow-auto max-h-[32rem] whitespace-pre-wrap break-all leading-relaxed"
              style={{ color: 'var(--t2)' }}>{imgEsc(body as string)}</pre>
          </details>
        ))}
      </div>
    </div>
  )

  const renderCaseRow = (c: ImgCase, i: number) => {
    const plan = planOf(c)
    const preview = c.editedPreview != null ? c.editedPreview : imgPlanToPreview(plan)
    const showRefWarn = c.needRef && refImages.length === 0
    const paramSummary = Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(', ')
    const price = imgLookupPrice(model.trim() || IMG_PLACEHOLDER_MODEL[apiType], apiType, bodyOf(plan), prices)
    const nMult = parseInt(bodyOf(plan).n) || 1
    const statusColor = c.status === 'running' ? 'var(--accent)' : c.status === 'pass' ? 'var(--ok)' : c.status === 'fail' ? 'var(--err)' : c.status === 'error' ? 'var(--warn)' : 'transparent'
    return (
      <div key={c.id} className="rounded-2xl overflow-hidden transition-all duration-150"
        style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${statusColor}`, background: 'var(--bg)', marginBottom: 10, boxShadow: c.status === 'running' ? '0 0 0 3px var(--accentSub)' : 'none' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:opacity-90" onClick={() => toggleExpand(c)}>
          <input type="checkbox" className="w-4 h-4 cursor-pointer flex-shrink-0" style={{ accentColor: 'var(--accent)' }} checked={c.selected}
            onChange={e => toggleSel(c, e.target.checked)} onClick={e => e.stopPropagation()} />
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold flex-wrap" style={{ color: 'var(--text)' }}>
              <span>{c.name}</span>
              {c.needRef && <Badge>参考图</Badge>}
              {price && priceTag(price, nMult)}
            </div>
            <div className="text-[11px] font-mono truncate" style={{ color: 'var(--t3)' }}>{imgEsc(paramSummary)}</div>
          </div>
          <div className="flex-shrink-0">{statusBadge(c)}</div>
          <span className="text-[10px] transition-transform duration-200 flex-shrink-0" style={{ color: 'var(--t3)', transform: c.expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
        </div>
        {c.expanded && (
          <div className="px-4 pb-4 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--border)', background: 'var(--s1)' }}>
            <p className="text-xs" style={{ color: 'var(--t2)' }}>{c.desc}</p>
            {showRefWarn && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--warnBg)', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }}>
                ⚠ 此用例需要参考图，请先在左侧上传或粘贴参考图。
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>
                  请求预览（可编辑，编辑后将作为真实发送的请求体）
                </span>
                <div className="flex gap-2">
                  <Btn small variant="soft" onClick={() => { c.editedPreview = null; c.plan = null; setCases([...cases]) }}>重置为默认</Btn>
                  <Btn small variant="accent" disabled={c.status === 'running' || showRefWarn} onClick={() => { c.expanded = true; runCase(c) }}>▶ 运行此用例</Btn>
                </div>
              </div>
              <div className="text-[11px] font-mono mb-1.5" style={{ color: 'var(--t3)' }}>
                {plan.method} {plan.endpoint}{plan.kind === 'multipart' ? '  · multipart/form-data' : ''}
              </div>
              <CustomTextarea value={preview} mono rows={Math.min(16, preview.split('\n').length + 1)}
                onChange={v => { c.editedPreview = v; setCases([...cases]) }} />
            </div>
            {c.result && renderResultBody(c.result)}
          </div>
        )}
      </div>
    )
  }

  const classify = (r: ImgRecord): 'pass' | 'fail' | 'error' => !r.ok ? 'error' : (imgVerdict(r.checks || []).level === 'ok' ? 'pass' : 'fail')
  const histModels = [...new Set(history.map(r => r.model))]
  const filteredHistory = history.filter(r =>
    (!fChannel || r.channelName === fChannel) &&
    (!fApiType || r.apiType === fApiType) &&
    (!fModel || r.model === fModel) &&
    (!fResult || classify(r) === fResult))

  const startExport = (records: ImgRecord[], format: 'png' | 'html') => {
    if (!records.length) { toastShow('没有可导出的记录'); return }
    if (exportBusy) { toastShow('正在导出中，请稍候'); return }
    setExportJob({ records, format })
  }
  const toggleHistSel = (id: string, v: boolean) => {
    setSelHistIds(prev => { const next = new Set(prev); if (v) next.add(id); else next.delete(id); return next })
  }

  const renderExportRecHeader = (r: ImgRecord) => (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-3" style={{ color: 'var(--t2)' }}>
      <span>用例 <b style={{ color: 'var(--text)' }}>{imgEsc(r.caseName || '')}</b></span>
      <span>模型 <b style={{ color: 'var(--text)' }}>{imgEsc(r.model)}</b></span>
      {/* 只用渠道名标识来源，绝不展示 apiKey/baseUrl */}
      <span>渠道 <b style={{ color: 'var(--text)' }}>{imgEsc(r.channelName)}</b></span>
      <span>接口 <b style={{ color: 'var(--text)' }}>{IMG_API_LABEL[r.apiType] || r.apiType}</b></span>
      <span>时间 <b style={{ color: 'var(--text)' }}>{imgFmtTime(r.time)}</b></span>
    </div>
  )

  const leftPanel = (
    <div className="w-[340px] flex-shrink-0 overflow-y-auto p-5 flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>本次测试配置 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>一次只测一个模型</span></p>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="block mb-1.5">使用渠道</Label>
            <CustomSelect value={activeChId ?? ''} onChange={v => setActiveChId(v)} options={channels.map(c => ({ value: c.id, label: c.name }))} />
            {channels.length === 0 && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请先到「渠道管理」标签页添加渠道。</p>}
          </div>
          <div>
            <Label className="block mb-1.5">接口类型 / 协议</Label>
            <CustomSelect value={apiType} onChange={v => switchApiType(v as ImgApiType)} options={[
              { value: 'openai', label: 'OpenAI images（gpt-image 系列）' },
              { value: 'grok', label: 'xAI Grok Imagine' },
              { value: 'gemini', label: 'Gemini generateContent' },
              { value: 'seedream', label: '字节 Seedream' },
            ]} />
          </div>
          <div>
            <Label className="block mb-1.5">模型编码（自由输入）</Label>
            <CustomInput value={model} onChange={setModel} placeholder={IMG_PLACEHOLDER_MODEL[apiType]} />
          </div>
          <div>
            <Label className="block mb-1.5">提示词</Label>
            <CustomTextarea value={prompt} onChange={setPrompt} rows={3} placeholder="一只在月球上喝咖啡的猫，电影质感" />
          </div>
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>参考图 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>图生图用例使用，可选</span></p>
        <div className="rounded-xl px-4 py-4 text-center cursor-pointer text-xs transition-all duration-150" style={{ border: '2px dashed var(--inputBorder)', color: 'var(--t2)', background: 'var(--inputBg)' }}
          onClick={() => fileRef.current?.click()} onPointerEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
          onPointerLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--inputBorder)'; (e.currentTarget as HTMLElement).style.color = 'var(--t2)' }}>
          点击上传本地图片
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addRefFile(e.target.files); e.target.value = '' }} />
        <div className="flex gap-2 mt-2">
          <div className="flex-1 min-w-0">
            <CustomInput value={refUrlDraft} onChange={setRefUrlDraft} placeholder="或粘贴图片 URL" />
          </div>
          <Btn small variant="soft" onClick={addRefUrl}>添加</Btn>
        </div>
        {refImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {refImages.map((r, i) => (
              <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <img src={r.dataUri || r.url} className="w-full h-full object-cover" />
                <button onClick={() => setRefImages(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 w-4.5 h-4.5 min-w-0 rounded-full border-0 cursor-pointer flex items-center justify-center text-[10px] leading-none"
                  style={{ width: 18, height: 18, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>上传后：所有「参考图用例」会自动使用这些图片。</p>
      </Card>
    </div>
  )

  const testPane = (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>测试用例</p>
          <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{cases.length}</span>
          <span className="text-xs" style={{ color: 'var(--t3)' }}>· {IMG_API_LABEL[apiType]} 相关用例</span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap rounded-xl px-3 py-2.5 mb-3" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" className="w-4 h-4 cursor-pointer" style={{ accentColor: 'var(--accent)' }} checked={selAll} onChange={e => toggleSelAll(e.target.checked)} />
            全选
          </label>
          <Btn small variant="primary" disabled={running} onClick={() => runList(cases.slice())}>▶ 全部运行</Btn>
          <Btn small variant="soft" disabled={running} onClick={() => { if (!selCases.length) { toastShow('请先选择用例'); return } runList(selCases.slice()) }}>▶ 运行选中</Btn>
          <Btn small variant="soft" disabled={running} onClick={async () => {
            const next = cases.find(c => c.selected && c.status === 'idle')
            if (!next) { toastShow('没有更多待运行的选中用例'); return }
            await runCase(next)
          }}>→ 逐个：运行下一个</Btn>
          <Btn small variant="ghost" disabled={running} onClick={() => {
            const arr = cases.map(c => ({ ...c, status: 'idle' as const, result: null }))
            setCases(arr)
          }}>↺ 重置状态</Btn>
          <Btn small variant="danger" disabled={!running} onClick={() => { stopRef.current = true; toastShow('将在当前用例结束后停止') }}>■ 停止</Btn>
          <Btn small variant="soft" disabled={exportBusy || !cases.some(c => c.result)} onClick={() => startExport(cases.filter(c => c.result).map(c => c.result!), 'png')}>⬇ 导出图片</Btn>
          <Btn small variant="soft" disabled={exportBusy || !cases.some(c => c.result)} onClick={() => startExport(cases.filter(c => c.result).map(c => c.result!), 'html')}>⬇ 导出 HTML</Btn>
          <div className="flex-1 min-w-40 h-2 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: (cases.length ? (doneCount / cases.length * 100) : 0) + '%' }} />
          </div>
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--t2)' }}>
            已选 <b style={{ color: 'var(--text)' }}>{selCases.length}</b> / 已完成 <b style={{ color: 'var(--text)' }}>{doneCount}</b> · 通过 <b style={{ color: 'var(--ok)' }}>{passCount}</b> · 未通过 <b style={{ color: failCount ? 'var(--err)' : 'var(--t2)' }}>{failCount}</b>
            {costN > 0 && <span> · 预估 <b style={{ color: 'var(--warn)' }}>${costUsd.toFixed(3)} / ¥{(costUsd * rate).toFixed(2)}</b>{costN < selCases.length ? `（${costN}/${selCases.length} 项有价格）` : ''}</span>}
          </span>
        </div>
        <div className="flex flex-col">
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
              <div className="text-3xl mb-2 opacity-60">📭</div>
              <p className="text-sm">该接口类型暂无内置用例</p>
            </div>
          ) : cases.map((c, i) => renderCaseRow(c, i))}
        </div>
      </Card>
    </div>
  )

  const channelsPane = (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>已保存的渠道 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{channels.length}</span></p>
        {channels.length === 0 && <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>还没有渠道，请在下方添加。</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {channels.map(c => (
            <div key={c.id} className="rounded-2xl p-4 relative" style={{ border: `1px solid ${c.id === activeChId ? 'var(--accent)' : 'var(--border)'}`, background: c.id === activeChId ? 'var(--accentSub)' : 'var(--s1)' }}>
              {c.id === activeChId && <span className="absolute top-3 right-4 text-[11px] font-bold" style={{ color: 'var(--accent)' }}>✓ 当前使用</span>}
              <div className="text-sm font-bold pr-16 truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
              <div className="text-xs break-all mt-1" style={{ color: 'var(--t3)' }}>{c.baseUrl}</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--t3)' }}>{c.keyMask || '（未设置）'}</div>
              <div className="flex gap-2 mt-3">
                <Btn small variant="soft" onClick={() => setActiveChId(c.id)}>设为当前</Btn>
                <Btn small variant="soft" onClick={() => editChannel(c)}>编辑</Btn>
                <Btn small variant="danger" onClick={() => delChannel(c.id)}>删除</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{editingChId ? '编辑渠道' : '添加新渠道'}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block mb-1.5">渠道名称（自定义标识）</Label>
            <CustomInput value={chForm.name} onChange={v => setChForm(f => ({ ...f, name: v }))} placeholder="例如：主线-oinone" />
          </div>
          <div>
            <Label className="block mb-1.5">baseUrl</Label>
            <CustomInput value={chForm.baseUrl} onChange={v => setChForm(f => ({ ...f, baseUrl: v }))} placeholder="https://api.oinone.top" />
          </div>
        </div>
        <div className="mt-3">
          <Label className="block mb-1.5">apiKey {editingChId ? '（留空表示保持不变，本地加密存储）' : ''}</Label>
          <CustomInput value={chForm.apiKey} onChange={v => setChForm(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Btn variant="primary" small={false} onClick={saveChannel}>保存渠道</Btn>
          <Btn variant="soft" onClick={() => { setChForm({ name: '', baseUrl: '', apiKey: '' }); setEditingChId(null) }}>清空表单</Btn>
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>渠道信息保存在本浏览器 localStorage 中（apiKey 经 AES-GCM 加密）。</span>
        </div>
      </Card>
    </div>
  )

  const pricesPane = (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>模型价格配置 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>按模型编码精确匹配 · 档位自动选择</span></p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--t2)' }}>汇率 1 USD =</span>
            <div className="w-24"><CustomInput value={rateStr} onChange={v => setRateStr(v.replace(/[^\d.]/g, ''))} type="text" mono /></div>
            <span className="text-xs" style={{ color: 'var(--t2)' }}>CNY</span>
            <Btn small variant="soft" onClick={resetPrices}>↺ 恢复内置默认价格</Btn>
          </div>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--t3)' }}>
          档位（tier）根据请求参数自动选择：OpenAI 按 quality，Grok 按 resolution，Gemini 按 imageSize（512→0.5K），Seedream 按 size 像素量（≤2.36MP 为 1K 档）。找不到对应档位时使用 default 档。
        </p>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
                <th className="px-3 py-2 font-semibold">模型编码（精确匹配）</th>
                <th className="px-3 py-2 font-semibold">档位</th>
                <th className="px-3 py-2 font-semibold">美元 / 张</th>
                <th className="px-3 py-2 font-semibold">人民币 / 张</th>
                <th className="px-3 py-2 font-semibold">备注</th>
                <th className="px-3 py-2 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {prices.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: 'var(--t3)' }}>暂无价格条目</td></tr>
              )}
              {prices.map((p, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-mono font-semibold">{p.model}</td>
                  <td className="px-3 py-2"><Badge>{p.tier}</Badge></td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.001" value={p.usd} className="no-spinner w-24 rounded-lg px-2 py-1 text-xs font-mono outline-none"
                      style={{ background: 'var(--inputBg)', border: '1px solid var(--inputBorder)', color: 'var(--text)' }}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) updatePrice(idx, v) }} />
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--warn)' }}>¥{(p.usd * rate).toFixed(3)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t3)' }}>{p.note || ''}</td>
                  <td className="px-3 py-2"><Btn small variant="danger" onClick={() => delPrice(idx)}>删</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>添加价格条目</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <Label className="block mb-1.5">模型编码</Label>
            <CustomInput value={priceForm.model} onChange={v => setPriceForm(f => ({ ...f, model: v }))} placeholder="gpt-image-2" />
          </div>
          <div>
            <Label className="block mb-1.5">档位</Label>
            <CustomInput value={priceForm.tier} onChange={v => setPriceForm(f => ({ ...f, tier: v }))} placeholder="default" />
          </div>
          <div>
            <Label className="block mb-1.5">美元价格 / 张</Label>
            <CustomInput value={priceForm.usd} onChange={v => setPriceForm(f => ({ ...f, usd: v }))} type="number" placeholder="0.05" />
          </div>
          <div>
            <Label className="block mb-1.5">备注（可选）</Label>
            <CustomInput value={priceForm.note} onChange={v => setPriceForm(f => ({ ...f, note: v }))} placeholder="官网价" />
          </div>
        </div>
        <div className="mt-4"><Btn small={false} variant="primary" onClick={addPrice}>＋ 添加</Btn></div>
      </Card>
    </div>
  )

  const historyPane = (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>历史测试记录 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{history.length}</span></p>
        <div className="flex items-center gap-2">
          <Btn small variant="soft" disabled={exportBusy || selHistIds.size === 0}
            onClick={() => startExport(filteredHistory.filter(r => selHistIds.has(r.id)), 'png')}>⬇ 导出选中图片 ({selHistIds.size})</Btn>
          <Btn small variant="soft" disabled={exportBusy || selHistIds.size === 0}
            onClick={() => startExport(filteredHistory.filter(r => selHistIds.has(r.id)), 'html')}>⬇ 导出选中 HTML ({selHistIds.size})</Btn>
          <Btn small variant="danger" onClick={() => { if (window.confirm('清空所有历史记录？')) { setHistory([]); setSelHistIds(new Set()); historyDbClear('imgtest').catch(() => {}); toastShow('已清空') } }}>清空全部</Btn>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="w-44"><CustomSelect value={fChannel} onChange={setFChannel} options={[{ value: '', label: '全部渠道' }, ...channels.map(c => ({ value: c.name, label: c.name }))]} /></div>
        <div className="w-36"><CustomSelect value={fApiType} onChange={setFApiType} options={[{ value: '', label: '全部接口' }, { value: 'openai', label: 'OpenAI' }, { value: 'grok', label: 'Grok' }, { value: 'gemini', label: 'Gemini' }, { value: 'seedream', label: 'Seedream' }]} /></div>
        <div className="w-48"><CustomSelect value={fModel} onChange={setFModel} options={[{ value: '', label: '全部模型' }, ...histModels.map(m => ({ value: m, label: m }))]} /></div>
        <div className="w-36"><CustomSelect value={fResult} onChange={setFResult} options={[{ value: '', label: '全部结果' }, { value: 'pass', label: '✓ 通过' }, { value: 'fail', label: '✕ 未通过' }, { value: 'error', label: '! 请求失败' }]} /></div>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left sticky top-0" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
              <th className="px-3 py-2 font-semibold">
                <input type="checkbox" className="w-4 h-4 cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                  checked={filteredHistory.length > 0 && filteredHistory.every(r => selHistIds.has(r.id))}
                  onChange={e => setSelHistIds(e.target.checked ? new Set(filteredHistory.map(r => r.id)) : new Set())} />
              </th>
              <th className="px-3 py-2 font-semibold">图</th>
              <th className="px-3 py-2 font-semibold">时间</th>
              <th className="px-3 py-2 font-semibold">渠道</th>
              <th className="px-3 py-2 font-semibold">接口</th>
              <th className="px-3 py-2 font-semibold">模型</th>
              <th className="px-3 py-2 font-semibold">用例</th>
              <th className="px-3 py-2 font-semibold">目标</th>
              <th className="px-3 py-2 font-semibold">实际</th>
              <th className="px-3 py-2 font-semibold">结果</th>
              <th className="px-3 py-2 font-semibold">耗时</th>
              <th className="px-3 py-2 font-semibold">价格</th>
              <th className="px-3 py-2 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-8 text-center" style={{ color: 'var(--t3)' }}>暂无记录</td></tr>
            )}
            {filteredHistory.map(r => {
              const cls = classify(r)
              const badge = cls === 'pass' ? <Badge color="ok">✓ {imgVerdict(r.checks || []).text}</Badge> : cls === 'fail' ? <Badge color="err">✕ {imgVerdict(r.checks || []).text}</Badge> : <Badge color="warn">! 失败</Badge>
              const t = r.targets || {}
              const tierLabel = t.resolutionTierBaseReq ? `${t.resolutionTierLabelReq || imgResolutionTierLabel(null, t.resolutionTierBaseReq)} 档` : ''
              const tgt = (t.wReq ? `${t.wReq}×${t.hReq}` : (tierLabel || t.sizeReq || '—')) + (t.ratioReq ? ' ' + t.ratioReq : '') + (t.nReq > 1 ? ' ×' + t.nReq : '')
              const act = r.ok && r.images && r.images[0] ? `${r.images[0].w}×${r.images[0].h}${r.returnedN > 1 ? ' ×' + r.returnedN : ''}` : '—'
              const thumb = r.images?.[0]?.thumb || r.images?.[0]?.url || ''
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }} className="transition-colors duration-100"
                  onPointerEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--s1)' }}
                  onPointerLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="w-4 h-4 cursor-pointer" style={{ accentColor: 'var(--accent)' }}
                      checked={selHistIds.has(r.id)} onChange={e => toggleHistSel(r.id, e.target.checked)} />
                  </td>
                  <td className="px-3 py-2">
                    {thumb ? <img src={thumb} className="w-10 h-10 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} /> : <span style={{ color: 'var(--t3)' }}>—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{imgFmtTime(r.time)}</td>
                  <td className="px-3 py-2">{r.channelName}</td>
                  <td className="px-3 py-2">{IMG_API_LABEL[r.apiType] || r.apiType}{r.useRef ? ' 🖼️' : ''}</td>
                  <td className="px-3 py-2 font-mono">{r.model}</td>
                  <td className="px-3 py-2">{r.caseName}</td>
                  <td className="px-3 py-2 font-mono">{imgEsc(tgt)}</td>
                  <td className="px-3 py-2 font-mono">{imgEsc(act)}</td>
                  <td className="px-3 py-2">{badge}</td>
                  <td className="px-3 py-2">{r.durationMs}ms</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--warn)' }}>
                    {r.price ? `$${(r.price.usd * (r.price.count || 1)).toFixed(3)}\n¥${(r.price.cny * (r.price.count || 1)).toFixed(3)}` : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Btn small variant="soft" onClick={() => setDetailRec(r)}>详情</Btn>
                    <span className="inline-block w-1" />
                    <Btn small variant="danger" onClick={() => { if (window.confirm('删除该记录？')) { setHistory(h => h.filter(x => x.id !== r.id)); historyDbDeleteOne('imgtest', r.id).catch(() => {}) } }}>删</Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )

  return (
    <div className="h-full flex" style={{ background: 'transparent' }}>
      {leftPanel}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <SegmentedControl value={pane} onChange={v => setPane(v as 'test' | 'channels' | 'prices' | 'history')} options={[
            { value: 'test', label: '批量测试' },
            { value: 'channels', label: '渠道管理' },
            { value: 'prices', label: '价格配置' },
            { value: 'history', label: `历史记录 (${history.length})` },
          ]} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {pane === 'test' && testPane}
          {pane === 'channels' && channelsPane}
          {pane === 'prices' && pricesPane}
          {pane === 'history' && historyPane}
        </div>
      </div>

      {detailRec && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-8" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDetailRec(null)}>
          <div className="floating-material w-full max-w-3xl rounded-2xl ia-card-enter" style={{ background: 'var(--bg)', boxShadow: 'var(--shadowMd)', border: '1px solid var(--border)', maxHeight: '82vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>测试记录详情</p>
              <div className="flex items-center gap-2">
                <Btn small variant="soft" disabled={exportBusy} onClick={() => startExport([detailRec], 'png')}>导出图片</Btn>
                <Btn small variant="soft" disabled={exportBusy} onClick={() => startExport([detailRec], 'html')}>导出 HTML</Btn>
                <button onClick={() => setDetailRec(null)} className="w-8 h-8 rounded-lg border-0 cursor-pointer text-lg flex items-center justify-center transition-colors duration-150" style={{ color: 'var(--t3)', background: 'transparent' }}
                  onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }} onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>×</button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-4" style={{ color: 'var(--t2)' }}>
                <span>用例 <b style={{ color: 'var(--text)' }}>{imgEsc(detailRec.caseName || '')}</b></span>
                <span>模型 <b style={{ color: 'var(--text)' }}>{imgEsc(detailRec.model)}</b></span>
                <span>渠道 <b style={{ color: 'var(--text)' }}>{imgEsc(detailRec.channelName)}</b></span>
                <span>接口 <b style={{ color: 'var(--text)' }}>{IMG_API_LABEL[detailRec.apiType] || detailRec.apiType}</b></span>
                <span>时间 <b style={{ color: 'var(--text)' }}>{imgFmtTime(detailRec.time)}</b></span>
              </div>
              {renderResultBody(detailRec, { defaultOpenReq: true })}
            </div>
          </div>
        </div>
      )}

      {exportJob && (
        // html2canvas 只能正确截图「真实渲染在正常文档流里的可见内容」——之前用
        // position:fixed + 负坐标把这个容器藏到屏幕外，会导致 html2canvas 截图失败/
        // 空白，且导出 HTML 时 clone 出来的节点也带着同样的离屏定位，打开后自然一片空白。
        // 改成一个真实可见的全屏遮罩预览层，导出完成后自动关闭。
        <div className="fixed inset-0 z-[200] flex flex-col items-center overflow-auto p-8" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="sticky top-0 mb-3">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: 'var(--bg)', color: 'var(--text)', boxShadow: 'var(--shadowMd)' }}>
              {exportBusy ? '⏳ 正在生成导出文件…' : '导出预览'}
            </span>
          </div>
          <div ref={reportRootRef} style={{ width: 900, maxWidth: '100%', background: 'var(--bg)', color: 'var(--text)', padding: 24, borderRadius: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>图片接口测试报告</p>
              <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>生成时间 {imgFmtTime(Date.now())} · 共 {exportJob.records.length} 条记录</p>
            </div>
            <div className="flex flex-col gap-6">
              {exportJob.records.map(r => (
                <div key={r.id} className="rounded-2xl p-4" style={{ border: '1px solid var(--border)' }}>
                  {renderExportRecHeader(r)}
                  {renderResultBody(r, { hidePrice: true, defaultOpenReq: true })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-xl px-4 py-2 text-sm ia-toast-in"
          style={{ background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadowMd)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default ImgApiTestTool
