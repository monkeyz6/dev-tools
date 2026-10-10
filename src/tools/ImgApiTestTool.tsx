import { kvGet, kvSet, kvRemove } from '../shared/app-kv'
import { useAmbientPause } from '../shared/use-ambient-pause'
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { historyDbGetAll, historyDbPutOne, historyDbDeleteOne, historyDbDeleteMany, historyDbClear, historyDbMigrateFromLocalStorage } from '../shared/history-db'
import { useDebouncedPersist } from '../shared/use-debounced-persist'
import { uniqueCopyName } from '../shared/channel-copy'
import { IMG_API_LABEL, imgFmtTime } from './img-report/types'
import type { ImgApiType, ImgC2paResult, ImgCarrier, ImgCheck, ImgInteractionMeta, ImgRecImage, ImgRecord } from './img-report/types'
import { imgC2paIncomplete, imgC2paPending, imgC2paUnreadable } from './img-report/c2pa'
import ImgC2paLine from './img-report/C2paLine'
import { imgClassify, imgExpectedRejected, imgVerdict } from './img-report/summary'
import { imgCarrierCheck, imgClassifyGeminiPart, imgClassifyOpenAiImage, sniffImageMime } from './img-report/carrier'
import { IMG_NANO_TIER_TOKENS, imgInteractionChecks, imgParseInteraction } from './img-report/interactions'
import { imgGroupBatches, imgTrimByBatch } from './img-report/batches'
import type { ImgBatch } from './img-report/batches'
import ImgReportView from './img-report/ImgReportView'

// ─── Tool: 图片接口测试 ─────────────────────────────────────────────────────────

const IMG_CH_KEY = 'imgtest-channels'
const IMG_ACTIVE_KEY = 'imgtest-active'
const IMG_PRICES_KEY = 'imgtest-prices'
const IMG_RATE_KEY = 'imgtest-rate'
const IMG_HIST_KEY = 'imgtest-history'
const IMG_UI_KEY = 'imgtest-ui'
const IMG_HIDEPRICES_KEY = 'imgtest-hideprices'
const IMG_C2PA_KEY = 'imgtest-c2pa'
const IMG_DEFAULT_RATE = 7
const IMG_VALIDATION_VERSION = 3
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
const IMG_INPUT_IMAGE_TIER = 'input_image'
// 官方模型 ID。图片输入走 Interactions API，不走 generateContent。
const IMG_NANO_BANANA_21 = 'gemini-nano-banana-2.1'
// 网关常带 google/ 前缀或改大小写，统一归一化后再比
function imgIsNanoBanana21(model: string): boolean {
  return model.trim().toLowerCase().replace(/^.*\//, '') === IMG_NANO_BANANA_21
}
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
  // Nano Banana 2.1（ai.google.dev/gemini-api/docs/pricing · Standard，2026-10-07）
  // 图片输出 $30/百万 token：1K=1120、2K=1680、4K=3780。输入不按分辨率分档。
  { model: IMG_NANO_BANANA_21, tier: '1K', usd: 0.0336, note: 'Google 官网 Standard · 图片输出 $30/百万 token · 1120 token' },
  { model: IMG_NANO_BANANA_21, tier: '2K', usd: 0.0504, note: 'Google 官网 Standard · 图片输出 $30/百万 token · 1680 token' },
  { model: IMG_NANO_BANANA_21, tier: '4K', usd: 0.113, note: 'Google 官网 Standard · 图片输出 $30/百万 token · 3780 token · 文本/思考输出 $7.50/百万' },
  // 输入图不按分辨率分档：每张 1120 token × $1.50/百万，估价时按参考图张数累加
  { model: IMG_NANO_BANANA_21, tier: IMG_INPUT_IMAGE_TIER, usd: 0.00168, note: 'Google 官网 Standard · 输入 $1.50/百万 · 每张输入图 1120 token' },
  // 字节 Seedream（火山方舟国内 ¥0.3/¥0.6，BytePlus 海外 $0.045/$0.09）
  { model: 'doubao-seedream-5-0-pro', tier: '1K', usd: 0.045, note: 'BytePlus 海外 · 国内方舟 ¥0.3/张' },
  { model: 'doubao-seedream-5-0-pro', tier: '2K', usd: 0.09, note: 'BytePlus 海外 · 国内方舟 ¥0.6/张' },
  { model: 'doubao-seedream-5-0-pro-260628', tier: '1K', usd: 0.045, note: 'BytePlus 海外 · 国内方舟 ¥0.3/张' },
  { model: 'doubao-seedream-5-0-pro-260628', tier: '2K', usd: 0.09, note: 'BytePlus 海外 · 国内方舟 ¥0.6/张' },
  { model: 'doubao-seedream-5-0-lite', tier: 'default', usd: 0.035, note: '火山引擎 · Lite 单价' },
  { model: 'seedream-5-0-pro', tier: '1K', usd: 0.045, note: '≤2.36MP' },
  { model: 'seedream-5-0-pro', tier: '2K', usd: 0.09, note: '>2.36MP' },
]
// 老的价格表存在 IndexedDB 里时不会自动带上新模型：每个种子只补一次（标识记在 IMG_PRICES_SEEDED_KEY），
// 补的时候按 model+tier 只加缺的行；补过之后用户删掉的行不再被补回来。
const IMG_PRICES_SEEDED_KEY = 'imgtest-prices-seeded'
const IMG_PRICE_SEED_NANO = 'nano-2.1-v1'
function imgWithNanoBananaPrices(prices: ImgPrice[]): ImgPrice[] {
  let seeded: string[] = []
  try { const v = JSON.parse(kvGet(IMG_PRICES_SEEDED_KEY) || '[]'); if (Array.isArray(v)) seeded = v } catch { /* ignore */ }
  if (seeded.includes(IMG_PRICE_SEED_NANO)) return prices
  const missing = IMG_DEFAULT_PRICES.filter(d => d.model === IMG_NANO_BANANA_21 && !prices.some(p => p.model === d.model && p.tier === d.tier))
  try { kvSet(IMG_PRICES_SEEDED_KEY, JSON.stringify([...seeded, IMG_PRICE_SEED_NANO])) } catch { /* ignore */ }
  return missing.length ? [...prices, ...missing.map(d => ({ ...d }))] : prices
}
function imgLoadPrices(): ImgPrice[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = kvGet(IMG_PRICES_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) return imgWithNanoBananaPrices(p)
    }
  } catch { /* ignore */ }
  // 全新安装：默认表已含种子，标记为已补，之后用户删行不会被补回
  try { kvSet(IMG_PRICES_SEEDED_KEY, JSON.stringify([IMG_PRICE_SEED_NANO])) } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(IMG_DEFAULT_PRICES))
}
function imgSavePrices(p: ImgPrice[]) { try { kvSet(IMG_PRICES_KEY, JSON.stringify(p)) } catch { /* ignore */ } }
function imgLoadRate(): string {
  if (typeof window !== 'undefined') {
    const v = parseFloat(kvGet(IMG_RATE_KEY) || '')
    if (!isNaN(v) && v > 0) return String(v)
  }
  return String(IMG_DEFAULT_RATE)
}
function imgSaveRate(r: string) { try { kvSet(IMG_RATE_KEY, r) } catch { /* ignore */ } }
function imgLoadHidePrices(): boolean {
  if (typeof window === 'undefined') return false
  try { return kvGet(IMG_HIDEPRICES_KEY) === '1' } catch { /* ignore */ }
  return false
}
function imgLoadC2pa(): boolean {
  if (typeof window === 'undefined') return false
  try { return kvGet(IMG_C2PA_KEY) === '1' } catch { /* ignore */ }
  return false
}

// 验真期间按记录持有一把 Web Lock。同源的其它标签页、或切走再切回来重新挂载的本工具，
// 加载历史时据此区分「仍在验」与「页面已关、验真没做完」。非安全上下文没有 navigator.locks。
const IMG_C2PA_LOCK_PREFIX = 'imgtest-c2pa:'

/** 拿到锁才返回；调用返回的函数释放。 */
async function imgHoldC2paLock(recordId: string): Promise<() => void> {
  let release!: () => void
  const done = new Promise<void>(ok => { release = ok })
  if (!navigator.locks) return release
  await new Promise<void>(ok => {
    navigator.locks.request(IMG_C2PA_LOCK_PREFIX + recordId, () => { ok(); return done }).catch(() => ok())
  })
  return release
}

/** 当前被持有的验真锁对应的记录 id；拿不到锁信息时返回 null。 */
async function imgHeldC2paIds(): Promise<Set<string> | null> {
  if (!navigator.locks) return null
  try {
    const { held = [] } = await navigator.locks.query()
    const ids = held.map(l => l.name || '').filter(n => n.startsWith(IMG_C2PA_LOCK_PREFIX)).map(n => n.slice(IMG_C2PA_LOCK_PREFIX.length))
    return new Set(ids)
  } catch {
    return null
  }
}

const IMG_PLACEHOLDER_MODEL: Record<ImgApiType, string> = {
  openai: 'gpt-image-2', grok: 'grok-imagine-image-quality', gemini: 'gemini-3-pro-image', seedream: 'doubao-seedream-5-0-pro', volcanoArk: 'doubao-seedream-5-0-pro',
}

const ZEROFA_ARK_BASE_URL = 'https://api.fornai.im/ark'

interface ImgChannel { id: string; name: string; baseUrl: string; apiKeyEnc: string; keyMask: string }
interface ImgRef { dataUri?: string | null; url?: string; name?: string }
interface ImgCaseParams { [k: string]: any }
interface ImgSynthRefs { count: number; mime: 'image/png' | 'image/jpeg' | 'image/webp' }
interface ImgCaseDef { name: string; desc: string; params: ImgCaseParams; needRef?: boolean; prompt?: string; synthRefs?: ImgSynthRefs; expect?: 'unsupported' }

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
  // ZeroFA 的 /ark 是火山方舟原生透传：Base URL 需填到 /ark，路径保持火山的 /v3/images/generations。
  // 字段与 Seedream 原生图片 API 相同，但不能走 OpenAI 兼容的 /v1/images/generations。
  volcanoArk: [
    { name: '原生 1K 文生图', desc: 'POST /v3/images/generations · size=1K', params: { size: '1K', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '原生 2K 文生图', desc: 'POST /v3/images/generations · size=2K', params: { size: '2K', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '原生精确 2048×2048', desc: '火山原生精确像素', params: { size: '2048x2048', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '原生 2K 横版 2816×1584', desc: '火山原生精确 16:9', params: { size: '2816x1584', response_format: 'url', output_format: 'png', watermark: false, seed: -1 } },
    { name: '原生 JPEG 输出', desc: 'output_format=jpeg', params: { size: '1K', response_format: 'url', output_format: 'jpeg', watermark: false, seed: -1 } },
    { name: '原生固定 Seed', desc: 'seed=42 原样透传', params: { size: '1K', response_format: 'url', output_format: 'png', watermark: false, seed: 42 } },
    { name: '原生参考图', desc: 'image 参数原样透传', params: { size: '2048x2048', response_format: 'url', output_format: 'png', watermark: false, seed: -1 }, needRef: true, prompt: '基于输入图生成写实风格头像' },
  ],
}

// gemini-nano-banana-2.1 专属：走官方 Interactions，目标是核对「渠道是否与官方一致」，不追求全覆盖。
// 判定靠三层证据：参数透传（档位 / 比例 / 文件头字节格式）、响应结构与模型回显、usage 里的图片输出 token（防偷换成更便宜的模型）。
// 参考图只有 2 条（画布合成，不依赖左侧上传），其余全是文生图。
// 512px 官方明确不支持 2.1、webp 官方只写了 png / jpeg：这两条标「预期不支持」，被 4xx 拒绝才算通过。
const IMG_NANO_BANANA_CASES: ImgCaseDef[] = [
  { name: '默认参数 · 纯文本', desc: 'input 为纯字符串、不带 response_format：只判响应结构、模型回显与用量，尺寸 / 比例 / 格式只记 info', params: { inputString: true } },
  { name: '1K · 1:1 · PNG', desc: 'response_format: image_size=1K · aspect_ratio=1:1 · mime_type=image/png', params: { imageSize: '1K', aspectRatio: '1:1', outputMime: 'image/png' } },
  { name: '2K · 16:9 · JPEG', desc: 'response_format: image_size=2K · aspect_ratio=16:9 · mime_type=image/jpeg', params: { imageSize: '2K', aspectRatio: '16:9', outputMime: 'image/jpeg' } },
  { name: '2K · 9:16 · PNG', desc: 'response_format: image_size=2K · aspect_ratio=9:16（竖屏比例）', params: { imageSize: '2K', aspectRatio: '9:16', outputMime: 'image/png' } },
  { name: '4K · 21:9 · PNG', desc: 'response_format: image_size=4K · aspect_ratio=21:9（最高档 + 超宽，单张约 $0.113）', params: { imageSize: '4K', aspectRatio: '21:9', outputMime: 'image/png' } },
  { name: '输出 WebP（预期不支持）', desc: 'mime_type=image/webp · 官方只写了 png / jpeg：被 4xx 拒绝或真出 webp 才算通过，静默回成别的格式算未通过', params: { imageSize: '1K', aspectRatio: '1:1', outputMime: 'image/webp' }, expect: 'unsupported' },
  { name: '512px（预期不支持）', desc: 'image_size=512px · 官方说明 512px 仅 Gemini 3.1 Flash Image 支持、2.1 不支持：只认 4xx 拒绝，出了图就是渠道接受了官方不支持的参数', params: { imageSize: '512px', aspectRatio: '1:1' }, expect: 'unsupported' },
  { name: '参考图 · 单图 JPEG · 1K 1:1', desc: 'input[] 里 1 张 image/jpeg（画布合成）· 1K · 1:1', params: { imageSize: '1K', aspectRatio: '1:1' }, needRef: true, synthRefs: { count: 1, mime: 'image/jpeg' }, prompt: '基于这张参考图，保持构图，改成水彩插画风格' },
  { name: '参考图 · 三图 PNG · 2K 5:4', desc: 'input[] 里 3 张 image/png（画布合成）· 2K · 5:4', params: { imageSize: '2K', aspectRatio: '5:4' }, needRef: true, synthRefs: { count: 3, mime: 'image/png' }, prompt: '把这三张参考图里的色块与形状融合成一张构图' },
  { name: '多轮编辑 · 1K 1:1', desc: '用例内发两次：第一轮文生图 store=true；第二轮只发编辑指令并带 previous_interaction_id（需渠道支持有状态的 Interactions，会出 2 张图）', params: { imageSize: '1K', aspectRatio: '1:1', outputMime: 'image/png', multiTurnEdit: '把这只猫改成黑白配色，其余元素保持不变' }, prompt: '画一只橙色的猫坐在窗台上' },
  { name: 'thinking_level=minimal · 1K 1:1', desc: 'generation_config.thinking_level=minimal：只判参数被接受并出图', params: { imageSize: '1K', aspectRatio: '1:1', outputMime: 'image/png', thinkingLevel: 'minimal' } },
  { name: 'google_search · 1K 16:9 · JPEG', desc: 'tools: [{type:google_search}]：响应里要有 google_search_call 步骤（搜索可能单独计费）', params: { imageSize: '1K', aspectRatio: '16:9', outputMime: 'image/jpeg', googleSearch: true }, prompt: '用 Google 搜索查今天旧金山的天气，并把结果画成一张简洁的天气信息图' },
]

interface ImgPlan {
  kind: 'json' | 'multipart'
  endpoint: string
  method: string
  headers: Record<string, string>
  body?: any
  multipart?: { fields: Record<string, string>; imagesField: string; images: string[] }
  /** 多轮用例的第一轮请求：先发它，拿到 interaction id 再发 body（见 runCase） */
  pre?: { body: any }
}

function imgUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function imgEsc(s: any) { return String(s ?? '') }
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
// 响应体里的图片 base64 只留首尾一段：工作台与历史共用。原文动辄几 MB～几十 MB，
// 整段留在 state 里每次渲染都要 parse/stringify 一遍；图片本身另存在 images[].dataUri，预览与下载不受影响。
const IMG_B64_KEEP = 64
function imgResponseForDisplay(body: string): { body: string; complete: boolean } {
  if (!body) return { body: '', complete: true }
  try {
    let complete = true
    const scrub = (value: unknown, key = '', inlineImageData = false): unknown => {
      if (typeof value === 'string' && value.length > 1000 && (key === 'b64_json' || (key === 'data' && inlineImageData))) {
        complete = false
        return `${value.slice(0, IMG_B64_KEEP)}…[base64 已省略 · ${value.length} chars]…${value.slice(-IMG_B64_KEEP)}`
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
    return { body: `${body.slice(0, 2000)}\n…[超大非 JSON 响应已截断 · ${body.length} chars]`, complete: false }
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
  return ({ '512': 512, '512PX': 512, '0.5K': 512, '1K': 1024, '2K': 2048, '4K': 4096 } as Record<string, number>)[normalized] || null
}
function imgResolutionTierLabel(value: string | null | undefined, base: number) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === '512' || normalized === '512PX') return normalized === '512' ? '512' : '512px'
  if (normalized === '0.5K' || normalized === '1K' || normalized === '2K' || normalized === '4K') return normalized
  return base === 512 ? '0.5K' : `${base / 1024}K`
}
function imgCheckResolutionTier(base: number, w: number, h: number) {
  const equivalent = w > 0 && h > 0 ? Math.sqrt(w * h) : 0
  const min = base * IMG_RESOLUTION_TIER_MIN_SCALE
  const devPct = base ? +(((equivalent - base) / base) * 100).toFixed(1) : 0
  return { equivalent: +equivalent.toFixed(1), min: +min.toFixed(1), devPct, pass: equivalent >= min }
}
// 一次解码同时拿尺寸与缩略图：生成图动辄 2K/4K，原先先量尺寸再压缩缩略图要整图解码两遍
function imgDecodeWithThumb(dataUri: string | null, maxSide = 160): Promise<{ w: number; h: number; thumb: string | null }> {
  if (!dataUri) return Promise.resolve({ w: 0, h: 0, thumb: null })
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height
      img.onload = null
      img.onerror = null
      try {
        const scale = Math.min(1, maxSide / Math.max(w0, h0))
        const w = Math.max(1, Math.round(w0 * scale))
        const h = Math.max(1, Math.round(h0 * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) { res({ w: w0, h: h0, thumb: null }); return }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        res({ w: w0, h: h0, thumb: c.toDataURL('image/jpeg', 0.72) })
      } catch { res({ w: w0, h: h0, thumb: null }) }
    }
    img.onerror = () => res({ w: 0, h: 0, thumb: null })
    img.src = dataUri
  })
}
async function imgMakeThumb(dataUri: string | null, maxSide = 160): Promise<string | null> {
  return (await imgDecodeWithThumb(dataUri, maxSide)).thumb
}

function imgLoadChannels(): ImgChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = kvGet(IMG_CH_KEY)
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
// 按批裁剪而不是按条：整批剔掉，不会出现历史里躺着半批记录
async function imgHistTrim(): Promise<void> {
  const list = await imgLoadHistory()
  const keep = new Set(imgTrimByBatch(list).map(r => r.id))
  const overflow = list.filter(r => !keep.has(r.id))
  if (overflow.length) await historyDbDeleteMany('imgtest', overflow.map(r => r.id))
}
function imgLoadUi(): { apiType?: ImgApiType; model?: string; prompt?: string } {
  if (typeof window === 'undefined') return {}
  try {
    const raw = kvGet(IMG_UI_KEY)
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
    const s = String(body?.response_format?.image_size || body?.generationConfig?.imageConfig?.imageSize || body.imageSize || '1K')
    return s === '512' || s.toLowerCase() === '512px' ? '0.5K' : s
  }
  if (type === 'seedream' || type === 'volcanoArk') {
    const s = String(body.size || '')
    if (/^\d+x\d+$/i.test(s)) {
      const [w, h] = s.toLowerCase().split('x').map(Number)
      return (w * h) <= 2.36e6 ? '1K' : '2K'
    }
    return s || '1K'
  }
  return 'default'
}
function imgLookupPrice(model: string, type: ImgApiType, body: any, prices: ImgPrice[]): { usd: number; tier: string; note: string; inputUsd: number } | null {
  if (!model || !prices.length) return null
  // nano 2.1 的模型名带前缀 / 改大小写时，价格行仍按官方 id 匹配
  const key = imgIsNanoBanana21(model) ? IMG_NANO_BANANA_21 : model
  const rows = prices.filter(p => p.model === key)
  if (!rows.length) return null
  const tierKey = imgResolveTierKey(type, body)
  const outRows = rows.filter(p => p.tier !== IMG_INPUT_IMAGE_TIER)
  let hit = outRows.find(p => p.tier.toLowerCase() === String(tierKey).toLowerCase())
  if (!hit) hit = outRows.find(p => p.tier.toLowerCase() === 'default')
  if (!hit) return null
  const inputUsd = +(rows.find(p => p.tier === IMG_INPUT_IMAGE_TIER)?.usd || 0)
  return { usd: +hit.usd, tier: hit.tier, note: hit.note || '', inputUsd }
}
// 单个用例的估价 = 输出图单价 × 张数 + 输入图单价 × 参考图张数
function imgPriceTotals(p: { usd: number; cny: number; count: number; inputUsd?: number; inputCny?: number; inputCount?: number }) {
  const n = p.count || 1
  return { usd: p.usd * n + (p.inputUsd || 0) * (p.inputCount || 0), cny: p.cny * n + (p.inputCny || 0) * (p.inputCount || 0) }
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
    // Nano Banana 2.1 走官方 Interactions：input 可以是纯字符串，也可以是 [{type:text|image}]；尺寸 / 比例 / 格式在 response_format。
    if (imgIsNanoBanana21(model)) {
      const responseFormat = (): any => {
        if (!(params.imageSize || params.aspectRatio || params.outputMime)) return undefined
        const rf: any = { type: 'image' }
        if (params.outputMime) rf.mime_type = params.outputMime
        if (params.aspectRatio) rf.aspect_ratio = params.aspectRatio
        if (params.imageSize) rf.image_size = params.imageSize
        return rf
      }
      const headers = { 'x-goog-api-key': '{{APIKEY}}', 'Content-Type': 'application/json' }
      const body: any = { model }
      let pre: ImgPlan['pre']
      if (params.multiTurnEdit) {
        // 多轮：主 body 是第二轮（只发编辑指令 + 上一轮 id），第一轮文生图放进 pre，运行时先发
        const first: any = { model, input: prompt, store: true }
        if (responseFormat()) first.response_format = responseFormat()
        pre = { body: first }
        body.input = String(params.multiTurnEdit)
        body.previous_interaction_id = '__PREV_INTERACTION_ID__'
      } else if (params.inputString && refCount === 0) {
        body.input = prompt
      } else {
        const input: any[] = [{ type: 'text', text: prompt }]
        for (let i = 1; i <= refCount; i++) {
          input.push({ type: 'image', mime_type: `__REF_${i}_MIME__`, data: `__REF_${i}_BASE64__` })
        }
        body.input = input
      }
      if (params.thinkingLevel) body.generation_config = { thinking_level: params.thinkingLevel }
      if (params.googleSearch) body.tools = [{ type: 'google_search' }]
      if (responseFormat()) body.response_format = responseFormat()
      return { kind: 'json', endpoint: '/v1beta/interactions', method: 'POST', headers, body, ...(pre ? { pre } : {}) }
    }
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
  return {
    kind: 'json',
    endpoint: type === 'volcanoArk' ? '/v3/images/generations' : '/v1/images/generations',
    method: 'POST',
    headers: { Authorization: '{{APIKEY}}', 'Content-Type': 'application/json' },
    body,
  }
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
  if (type === 'openai' || type === 'seedream' || type === 'volcanoArk') {
    const s = body.size
    if (typeof s === 'string' && /^\d+x\d+$/i.test(s)) { const [w, h] = s.toLowerCase().split('x').map(Number); t.wReq = w; t.hReq = h; t.sizeReq = s }
    else if (s) { t.sizeReq = s; imgSetResolutionTierTarget(t, s) }
  }
  if (type === 'grok') { imgSetResolutionTierTarget(t, body.resolution); t.ratioReq = (body.aspect_ratio && body.aspect_ratio !== 'auto') ? body.aspect_ratio : null }
  if (type === 'gemini') {
    const rf = body?.response_format
    if (typeof body?.model === 'string' && imgIsNanoBanana21(body.model) && plan.endpoint.includes('/interactions')) {
      // Interactions：除参数透传外，还要核对响应结构、模型回显、usage 里的图片输出 token
      t.interactions = true
      t.modelReq = body.model
      const rfo = rf && typeof rf === 'object' ? rf : {}
      imgSetResolutionTierTarget(t, rfo.image_size)
      t.ratioReq = rfo.aspect_ratio
      if (typeof rfo.mime_type === 'string') t._of = rfo.mime_type.split('/')[1]
      t.imageTokensPer = IMG_NANO_TIER_TOKENS[String(rfo.image_size || '').toUpperCase()] ?? null
      if (!rfo.image_size && !rfo.aspect_ratio && !rfo.mime_type) t.defaultParams = true
      // 官方明确不支持 512px：只认 4xx 拒绝，2xx 出图算渠道接受了不支持的参数
      if (t.resolutionTierBaseReq === 512) { t.strictReject = true; t.rejectCheck = '分辨率档位' }
      if (Array.isArray(body.tools) && body.tools.some((x: any) => x?.type === 'google_search')) t.searchReq = true
      if (body.previous_interaction_id) t.multiTurn = true
    } else if (rf && typeof rf === 'object' && (rf.image_size || rf.aspect_ratio || rf.mime_type)) {
      imgSetResolutionTierTarget(t, rf.image_size)
      t.ratioReq = rf.aspect_ratio
      if (typeof rf.mime_type === 'string') t._of = rf.mime_type.split('/')[1]
    } else {
      const ic = body?.generationConfig?.imageConfig || {}
      imgSetResolutionTierTarget(t, ic.imageSize)
      t.ratioReq = ic.aspectRatio
    }
  }
  t.nReq = parseInt(body.n) || 1
  if (body.output_format) t._of = body.output_format
  t._rf = typeof body.response_format === 'string' ? body.response_format : undefined
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

interface ImgParsedImage {
  url: string | null
  dataUri: string | null
  mimeType: string | null
  carrier?: ImgCarrier
}
interface ImgParsedResponse {
  ok: boolean
  httpStatus: number
  headers: Record<string, string>
  images: ImgParsedImage[]
  rawSnippet: string
  error: string | null
  /** Interactions 响应的结构 / usage 信息；其它协议没有 */
  interaction?: ImgInteractionMeta
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
    const interaction = imgParseInteraction(json)
    if (interaction) {
      out.images = interaction.images.map(im => ({
        url: im.url,
        dataUri: im.dataUri,
        mimeType: im.mimeType,
        carrier: im.carrier,
      }))
      out.interaction = interaction.meta
    } else {
      for (const candidate of json.candidates || []) {
        for (const part of candidate?.content?.parts || []) {
          const hit = imgClassifyGeminiPart(part)
          if (!hit) continue
          const mime = hit.mime || 'image/png'
          out.images.push({
            url: hit.url,
            dataUri: hit.inline ? imgB64ToDataURI(hit.inline, mime.split('/')[1] || 'png') : null,
            mimeType: mime,
            carrier: hit.carrier,
          })
        }
      }
    }
  } else {
    const arr = json.data || []
    // data[] 里没有 url / b64_json 的项（如只有 revised_prompt）不算图
    out.images = []
    for (const d of arr) {
      const hit = imgClassifyOpenAiImage(d)
      if (!hit) continue
      out.images.push({
        url: hit.url,
        dataUri: hit.b64 ? imgB64ToDataURI(hit.b64, fmtHint || 'png') : null,
        mimeType: d.mime_type || d.mimeType || null,
        carrier: hit.carrier,
      })
    }
  }
  out.ok = out.images.length > 0
  if (!out.ok) out.error = '响应中未找到图片数据'
  return out
}

interface ImgCase {
  id: string
  name: string
  desc: string
  params: ImgCaseParams
  needRef: boolean
  synthRefs: ImgSynthRefs | null
  expect?: 'unsupported'
  prompt: string | null
  selected: boolean
  expanded: boolean
  status: 'idle' | 'running' | 'pass' | 'fail' | 'error'
  editedPreview: string | null
  plan: ImgPlan | null
  result: ImgRecord | null
}

// 一个用例会产出几张输出图（估价用）：n × 多轮用例的轮数
function imgPlanOutputs(plan: ImgPlan): number {
  const body = plan.kind === 'json' ? plan.body : plan.multipart?.fields
  return (parseInt(body?.n) || 1) * (plan.pre ? 2 : 1)
}

function imgRefCountFor(c: Pick<ImgCase, 'needRef' | 'synthRefs'>, uploaded: number): number {
  if (c.synthRefs) return c.synthRefs.count
  return c.needRef ? uploaded : 0
}

class ImgSynthUnsupportedError extends Error {
  constructor(mime: string) { super(`浏览器不支持编码 ${mime}，已跳过`); this.name = 'ImgSynthUnsupportedError' }
}
const IMG_SYNTH_COLORS = ['#e23b3b', '#2f6fed', '#1f9d55', '#f0b429', '#7c3aed']
const IMG_SYNTH_SIZE = 256
// 底色 + 白圆 + 序号：比纯色块多一点内容，模型有东西可看，也方便肉眼分辨是第几张
function imgDrawSynth(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, index: number) {
  const n = IMG_SYNTH_SIZE
  ctx.fillStyle = IMG_SYNTH_COLORS[index % IMG_SYNTH_COLORS.length]
  ctx.fillRect(0, 0, n, n)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(n / 2, n / 2, n * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = IMG_SYNTH_COLORS[index % IMG_SYNTH_COLORS.length]
  ctx.font = `bold ${Math.round(n * 0.3)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(index + 1), n / 2, n / 2 + 4)
}
async function imgSynthRef(mime: ImgSynthRefs['mime'], index: number): Promise<ImgRef> {
  const canvas = document.createElement('canvas')
  canvas.width = IMG_SYNTH_SIZE
  canvas.height = IMG_SYNTH_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  imgDrawSynth(ctx, index)
  let dataUri = canvas.toDataURL(mime)
  if (/^data:([^;,]+)/.exec(dataUri)?.[1] !== mime) {
    // Safari 的 toDataURL 不认 webp，会静默回退成 png；convertToBlob 同样可能回退，所以按 blob 类型再核一次
    try {
      const oc = new OffscreenCanvas(IMG_SYNTH_SIZE, IMG_SYNTH_SIZE)
      const octx = oc.getContext('2d')
      if (octx) imgDrawSynth(octx, index)
      const blob = await oc.convertToBlob({ type: mime })
      if (blob.type === mime) dataUri = (await imgBlobToDataURI(blob)) ?? dataUri
    } catch { /* 走下面的抛错 */ }
  }
  if (/^data:([^;,]+)/.exec(dataUri)?.[1] !== mime) throw new ImgSynthUnsupportedError(mime)
  return { dataUri, name: `synth-${index + 1}.${mime.split('/')[1]}` }
}

function imgBuildCases(t: ImgApiType, model = ''): ImgCase[] {
  const id = model.trim()
  // nano 2.1 走 Interactions，只用专属用例，不再拼通用 gemini 用例
  const defs = t === 'gemini' && imgIsNanoBanana21(id) ? IMG_NANO_BANANA_CASES : (IMG_TEST_SETS[t] || [])
  return defs.map((c, i) => ({
    id: 'c' + i, name: c.name, desc: c.desc, params: JSON.parse(JSON.stringify(c.params)),
    needRef: !!c.needRef, synthRefs: c.synthRefs ? { ...c.synthRefs } : null, expect: c.expect, prompt: c.prompt || null,
    selected: true, expanded: false, status: 'idle' as const,
    editedPreview: null, plan: null, result: null,
  }))
}

function imgBuildChecks(rec: ImgRecord): ImgCheck[] {
  const c: ImgCheck[] = []
  const t = rec.targets || {}
  if (imgExpectedRejected(rec)) {
    // 官方没承诺的参数被上游 4xx 明确拒绝：算预期结果
    return [{ name: t.rejectCheck || '输出格式', target: t.strictReject ? 'HTTP 4xx 拒绝' : '拒绝或按请求出图', actual: `HTTP ${rec.status} 已拒绝`, pass: true }]
  }
  if (t.strictReject && rec.ok) {
    // 官方声明不支持的参数，渠道却接受并出了图
    return [{ name: t.rejectCheck || '输出格式', target: 'HTTP 4xx 拒绝', actual: `HTTP ${rec.status} 已出图（渠道接受了官方不支持的参数）`, pass: false }]
  }
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
      // 格式以文件头字节为准；响应标签与字节不一致时一并写出
      const shown = im.formatLabel && norm(im.formatLabel) !== norm(im.format) ? `${im.format}（标签 ${im.formatLabel}）` : im.format
      c.push({ name: tag + '输出格式', target: t._of, actual: shown, pass: norm(im.format) === norm(t._of) })
    } else if (t.defaultParams) {
      c.push({ name: tag + '输出格式', target: '—', actual: im.format, pass: true, info: true })
    }
  })
  if (!rec.images.some(im => im.carrier)) {
    // 旧记录没存 carrier：沿用当时的 response_format 校验，结论不随新规则翻转
    if (t._rf) {
      const hasUrl = rec.images.some(im => im.url)
      const got = hasUrl ? 'url' : 'b64_json'
      c.push({ name: 'response_format', target: t._rf, actual: got, pass: got === t._rf })
    }
  } else {
    const carrier = imgCarrierCheck({
      apiType: rec.apiType,
      model: rec.model,
      responseFormat: t._rf,
      images: rec.images,
    })
    if (carrier) c.push(carrier)
  }
  if (t.interactions) {
    const first = rec.images[0]
    c.push(...imgInteractionChecks({
      targets: t,
      meta: rec.interaction,
      imageCount: rec.images.length,
      firstSize: first && first.w > 0 && first.h > 0 ? { w: first.w, h: first.h } : null,
    }))
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
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('toBlob 返回空')
    imgDownloadBlob(filename, blob)
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
      // 覆盖样式必须排在 appCss 之后：应用样式里的 body{overflow:hidden;height:100%}
      // 会让离线报告整页无法滚动
      const overrideCss = `
html,body{height:auto!important;min-height:0!important;overflow:auto!important;margin:0!important}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-size-adjust:100%}
body{
  padding:clamp(28px,6vw,72px) clamp(20px,5vw,56px) clamp(48px,8vw,96px);
  background:var(--bg);
  color:var(--text);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;
}
[data-img-export-root]{width:100%!important;max-width:1120px;margin:0 auto;padding:0!important;border-radius:0!important}
[data-img-export-root] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;animation:none!important;transition:none!important}
[data-img-export-root] img{max-width:100%;height:auto}
.overflow-hidden{overflow:visible!important}
[data-export-scroll]{max-height:none!important;overflow:visible!important}
@media print{
  body{padding:0;background:#fff}
  [data-img-export-root]{max-width:none}
  [data-img-export-root]>*{break-inside:avoid}
}
`
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图片接口测试报告</title><style>${varsCss}\n${appCss}\n${overrideCss}</style></head><body>${clone.outerHTML}</body></html>`
      imgDownloadText(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch (e) {
    console.error('[imgExportAsHtml]', e)
    window.alert('导出 HTML 失败，请稍后重试。')
  }
}
function imgExportFilename(apiType: ImgApiType, ext: 'png' | 'html'): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`
  return `imgtest-report-${apiType}-${stamp}.${ext}`
}

// ─── Panes：按区域拆分的 memo 子组件 ─────────────────────────────────────────
// 批量运行期间 setCases 高频触发，拆分 + 按需渲染让未激活面板（渠道/价格/历史）
// 既不参与 JSX 求值也不重渲染，历史表格的过滤/映射只在自身 props 变化时执行。

type ImgChFormState = { name: string; baseUrl: string; apiKey: string }
type ImgPriceFormState = { model: string; tier: string; usd: string; note: string }

const ImgChannelsPane = React.memo(function ImgChannelsPane({
  channels, activeChId, chForm, editingChId,
  onSetActive, onEdit, onCopy, onDelete, onSave, onChFormChange, onClearForm,
}: {
  channels: ImgChannel[]; activeChId: string | null; chForm: ImgChFormState; editingChId: string | null
  onSetActive: (id: string) => void; onEdit: (c: ImgChannel) => void; onCopy: (c: ImgChannel) => void; onDelete: (id: string) => void
  onSave: () => void; onChFormChange: React.Dispatch<React.SetStateAction<ImgChFormState>>; onClearForm: () => void
}) {
  return (
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
              <div className="flex gap-2 mt-3 flex-wrap">
                <Btn small variant="soft" onClick={() => onSetActive(c.id)}>设为当前</Btn>
                <Btn small variant="soft" onClick={() => onEdit(c)}>编辑</Btn>
                <Btn small variant="soft" onClick={() => onCopy(c)}>复制</Btn>
                <Btn small variant="danger" onClick={() => onDelete(c.id)}>删除</Btn>
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
            <CustomInput value={chForm.name} onChange={v => onChFormChange(f => ({ ...f, name: v }))} placeholder="例如：主线-oinone" />
          </div>
          <div>
            <Label className="block mb-1.5">baseUrl</Label>
            <CustomInput value={chForm.baseUrl} onChange={v => onChFormChange(f => ({ ...f, baseUrl: v }))} placeholder="https://api.oinone.top" />
          </div>
        </div>
        <div className="mt-3">
          <Label className="block mb-1.5">apiKey {editingChId ? '（留空表示保持不变，本地加密存储）' : ''}</Label>
          <CustomInput value={chForm.apiKey} onChange={v => onChFormChange(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Btn variant="primary" small={false} onClick={onSave}>保存渠道</Btn>
          <Btn variant="soft" onClick={onClearForm}>清空表单</Btn>
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>渠道信息保存在本浏览器 IndexedDB 中（apiKey 经 AES-GCM 加密）。</span>
        </div>
      </Card>
    </div>
  )
})

const ImgPricesPane = React.memo(function ImgPricesPane({
  prices, rateStr, rate, priceForm,
  onRateChange, onResetPrices, onUpdatePrice, onDelPrice, onPriceFormChange, onAddPrice,
}: {
  prices: ImgPrice[]; rateStr: string; rate: number; priceForm: ImgPriceFormState
  onRateChange: (v: string) => void; onResetPrices: () => void
  onUpdatePrice: (idx: number, v: number) => void; onDelPrice: (idx: number) => void
  onPriceFormChange: React.Dispatch<React.SetStateAction<ImgPriceFormState>>; onAddPrice: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>模型价格配置 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>按模型编码精确匹配 · 档位自动选择</span></p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--t2)' }}>汇率 1 USD =</span>
            <div className="w-24"><CustomInput value={rateStr} onChange={onRateChange} type="text" mono /></div>
            <span className="text-xs" style={{ color: 'var(--t2)' }}>CNY</span>
            <Btn small variant="soft" onClick={onResetPrices}>↺ 恢复内置默认价格</Btn>
          </div>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--t3)' }}>
          档位（tier）根据请求参数自动选择：OpenAI 按 quality，Grok 按 resolution，Gemini 按 imageSize 或 response_format.image_size（512→0.5K），Seedream 按 size 像素量（≤2.36MP 为 1K 档）。找不到对应档位时使用 default 档。
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
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) onUpdatePrice(idx, v) }} />
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--warn)' }}>¥{(p.usd * rate).toFixed(3)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t3)' }}>{p.note || ''}</td>
                  <td className="px-3 py-2"><Btn small variant="danger" onClick={() => onDelPrice(idx)}>删</Btn></td>
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
            <CustomInput value={priceForm.model} onChange={v => onPriceFormChange(f => ({ ...f, model: v }))} placeholder="gpt-image-2" />
          </div>
          <div>
            <Label className="block mb-1.5">档位</Label>
            <CustomInput value={priceForm.tier} onChange={v => onPriceFormChange(f => ({ ...f, tier: v }))} placeholder="default" />
          </div>
          <div>
            <Label className="block mb-1.5">美元价格 / 张</Label>
            <CustomInput value={priceForm.usd} onChange={v => onPriceFormChange(f => ({ ...f, usd: v }))} type="number" placeholder="0.05" />
          </div>
          <div>
            <Label className="block mb-1.5">备注（可选）</Label>
            <CustomInput value={priceForm.note} onChange={v => onPriceFormChange(f => ({ ...f, note: v }))} placeholder="官网价" />
          </div>
        </div>
        <div className="mt-4"><Btn small={false} variant="primary" onClick={onAddPrice}>＋ 添加</Btn></div>
      </Card>
    </div>
  )
})

function ImgBatchRecordTable({ records, hidePrices, onDetail, onDeleteOne }: {
  records: ImgRecord[]; hidePrices: boolean
  onDetail: (r: ImgRecord) => void; onDeleteOne: (id: string) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left" style={{ color: 'var(--t3)' }}>
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
        {records.map(r => {
          const cls = imgClassify(r)
          const badge = cls === 'pass' ? <Badge color="ok">✓ {imgVerdict(r.checks || []).text}</Badge> : cls === 'fail' ? <Badge color="err">✕ {imgVerdict(r.checks || []).text}</Badge> : <Badge color="warn">! 失败</Badge>
          const t = r.targets || {}
          const tierLabel = t.resolutionTierBaseReq ? `${t.resolutionTierLabelReq || imgResolutionTierLabel(null, t.resolutionTierBaseReq)} 档` : ''
          const tgt = (t.wReq ? `${t.wReq}×${t.hReq}` : (tierLabel || t.sizeReq || '—')) + (t.ratioReq ? ' ' + t.ratioReq : '') + (t.nReq > 1 ? ' ×' + t.nReq : '')
          const act = r.ok && r.images && r.images[0] ? `${r.images[0].w}×${r.images[0].h}${r.returnedN > 1 ? ' ×' + r.returnedN : ''}` : '—'
          const thumb = r.images?.[0]?.thumb || r.images?.[0]?.url || ''
          return (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }} className="transition-colors duration-100 row-hover">
              <td className="px-3 py-2">
                {thumb ? <img src={thumb} className="w-10 h-10 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} /> : <span style={{ color: 'var(--t3)' }}>—</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{imgFmtTime(r.time)}</td>
              <td className="px-3 py-2 max-w-[160px] truncate" title={r.channelName}>{r.channelName}</td>
              <td className="px-3 py-2">{IMG_API_LABEL[r.apiType] || r.apiType}{r.useRef ? ' 🖼️' : ''}</td>
              <td className="px-3 py-2 font-mono max-w-[180px] truncate" title={r.model}>{r.model}</td>
              <td className="px-3 py-2 max-w-[160px] truncate" title={r.caseName}>{r.caseName}</td>
              <td className="px-3 py-2 font-mono">{imgEsc(tgt)}</td>
              <td className="px-3 py-2 font-mono">{imgEsc(act)}</td>
              <td className="px-3 py-2">{badge}</td>
              <td className="px-3 py-2">{r.durationMs}ms</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--warn)' }}>
                {hidePrices || !r.price ? '—' : `$${imgPriceTotals(r.price).usd.toFixed(3)}\n¥${imgPriceTotals(r.price).cny.toFixed(3)}`}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <Btn small variant="soft" onClick={() => onDetail(r)}>详情</Btn>
                <span className="inline-block w-1" />
                <Btn small variant="danger" onClick={() => onDeleteOne(r.id)}>删</Btn>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const ImgHistoryPane = React.memo(function ImgHistoryPane({
  history, channels, hidePrices, exportBusy,
  fChannel, fApiType, fModel, fResult, onFChannel, onFApiType, onFModel, onFResult,
  onStartExport, onClearAll, onDetail, onDeleteOne, onRestore, onDeleteBatch,
}: {
  history: ImgRecord[]; channels: ImgChannel[]; hidePrices: boolean; exportBusy: boolean
  fChannel: string; fApiType: string; fModel: string; fResult: string
  onFChannel: (v: string) => void; onFApiType: (v: string) => void; onFModel: (v: string) => void; onFResult: (v: string) => void
  onStartExport: (records: ImgRecord[], format: 'png' | 'html') => void
  onClearAll: () => void; onDetail: (r: ImgRecord) => void; onDeleteOne: (id: string) => void
  onRestore: (batch: ImgBatch) => void; onDeleteBatch: (batch: ImgBatch) => void
}) {
  const histModels = useMemo(() => [...new Set(history.map(r => r.model))], [history])
  const filteredHistory = useMemo(() => history.filter(r =>
    (!fChannel || r.channelName === fChannel) &&
    (!fApiType || r.apiType === fApiType) &&
    (!fModel || r.model === fModel) &&
    (!fResult || imgClassify(r) === fResult)), [history, fChannel, fApiType, fModel, fResult])
  // 筛选器先过滤记录，再对过滤结果重新分组，这样筛完看到的批次统计与列表一致
  const batches = useMemo(() => imgGroupBatches(filteredHistory), [filteredHistory])

  // 默认展开最新一批；这个 Set 存的是「与默认相反」的批次，新跑出来的批次仍会自动展开
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const newestId = batches[0]?.id ?? ''
  const isOpen = (id: string) => (id === newestId) !== flipped.has(id)
  const toggleBatch = (id: string) => setFlipped(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>历史测试记录 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{history.length}</span></p>
        <div className="flex items-center gap-2">
          <Btn small variant="danger" onClick={onClearAll}>清空全部</Btn>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="w-44"><CustomSelect value={fChannel} onChange={onFChannel} options={[{ value: '', label: '全部渠道' }, ...channels.map(c => ({ value: c.name, label: c.name }))]} /></div>
        <div className="w-36"><CustomSelect value={fApiType} onChange={onFApiType} options={[{ value: '', label: '全部接口' }, { value: 'openai', label: 'OpenAI' }, { value: 'grok', label: 'Grok' }, { value: 'gemini', label: 'Gemini' }, { value: 'seedream', label: 'Seedream' }]} /></div>
        <div className="w-48"><CustomSelect value={fModel} onChange={onFModel} options={[{ value: '', label: '全部模型' }, ...histModels.map(m => ({ value: m, label: m }))]} /></div>
        <div className="w-36"><CustomSelect value={fResult} onChange={onFResult} options={[{ value: '', label: '全部结果' }, { value: 'pass', label: '✓ 通过' }, { value: 'fail', label: '✕ 未通过' }, { value: 'error', label: '! 请求失败' }]} /></div>
      </div>
      {/* 不设内层滚动：由外层工作区统一滚动，避免两层滚动条 */}
      <div className="flex flex-col gap-2">
        {batches.length === 0 && (
          <p className="px-3 py-8 text-center text-xs" style={{ color: 'var(--t3)' }}>暂无记录</p>
        )}
        {batches.map(b => {
          const open = isOpen(b.id)
          return (
            // shrink-0：overflow-hidden 会让 flex 子项最小高度变成 0，容器一旦限高就会被压扁
            <div key={b.id} data-testid="imgtest-batch" className="shrink-0 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 flex-wrap px-3 py-2.5 cursor-pointer transition-colors duration-100 row-hover"
                style={{ background: 'var(--s1)' }} onClick={() => toggleBatch(b.id)}>
                <span className="text-xs w-3 inline-block" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{imgFmtTime(b.startAt)}</span>
                <span className="text-xs max-w-[160px] truncate" style={{ color: 'var(--t2)' }} title={b.channelName}>{b.channelName || '—'}</span>
                <span className="text-xs" style={{ color: 'var(--t2)' }}>{IMG_API_LABEL[b.apiType] || b.apiType}</span>
                <span className="text-xs font-mono max-w-[220px] truncate" style={{ color: 'var(--t2)' }} title={b.models.join(' / ')}>{b.models.join(' / ') || '—'}</span>
                <span className="text-xs" style={{ color: 'var(--t3)' }}>{b.records.length} 个用例</span>
                <Badge color={b.passed === b.records.length ? 'ok' : b.passed === 0 ? 'err' : 'warn'}>通过 {b.passed}/{b.records.length}</Badge>
                {b.legacy && <Badge>旧记录</Badge>}
                <div className="ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <Btn small variant="primary" onClick={() => onRestore(b)}>↺ 还原到工作台</Btn>
                  <Btn small variant="soft" disabled={exportBusy} onClick={() => onStartExport(b.records, 'png')}>导出 PNG</Btn>
                  <Btn small variant="soft" disabled={exportBusy} onClick={() => onStartExport(b.records, 'html')}>导出 HTML</Btn>
                  <Btn small variant="danger" onClick={() => onDeleteBatch(b)}>删除本批</Btn>
                </div>
              </div>
              {open && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <ImgBatchRecordTable records={b.records} hidePrices={hidePrices} onDetail={onDetail} onDeleteOne={onDeleteOne} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
})

function ImgApiTestTool() {
  const ui0 = imgLoadUi()
  const [pane, setPane] = useState<'test' | 'channels' | 'prices' | 'history'>('test')
  const [channels, setChannels] = useState<ImgChannel[]>(() => imgLoadChannels())
  const [activeChId, setActiveChId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return kvGet(IMG_ACTIVE_KEY)
  })
  const [apiType, setApiType] = useState<ImgApiType>(ui0.apiType ?? 'openai')
  const [model, setModel] = useState(ui0.model ?? '')
  const modelRef = useRef(ui0.model ?? '')
  const [prompt, setPrompt] = useState(ui0.prompt ?? '一只在月球上喝咖啡的猫，电影质感')
  const [refImages, setRefImages] = useState<ImgRef[]>([])
  const [prices, setPrices] = useState<ImgPrice[]>(() => imgLoadPrices())
  const [rateStr, setRateStr] = useState(() => imgLoadRate())
  const [hidePrices, setHidePrices] = useState(() => imgLoadHidePrices())
  const [c2paOn, setC2paOn] = useState(() => imgLoadC2pa())
  const [history, setHistory] = useState<ImgRecord[]>([])

  const [chForm, setChForm] = useState({ name: '', baseUrl: '', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [priceForm, setPriceForm] = useState({ model: '', tier: '', usd: '', note: '' })

  const [cases, setCases] = useState<ImgCase[]>(() => imgBuildCases(ui0.apiType ?? 'openai', ui0.model ?? ''))
  const [selAll, setSelAll] = useState(true)
  const [running, setRunning] = useState(false)
  // 单条「运行此用例 / 逐个」不经 runList、不设 running，用例自身的 running 状态也算
  useAmbientPause(running || cases.some(c => c.status === 'running'))
  const [toast, setToast] = useState('')
  const [detailRec, setDetailRec] = useState<ImgRecord | null>(null)
  const [fChannel, setFChannel] = useState('')
  const [fApiType, setFApiType] = useState('')
  const [fModel, setFModel] = useState('')
  const [fResult, setFResult] = useState('')
  const [restoredFrom, setRestoredFrom] = useState<{ time: number; count: number } | null>(null)
  const [exportJob, setExportJob] = useState<{ records: ImgRecord[]; format: 'png' | 'html' } | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const reportRootRef = useRef<HTMLDivElement>(null)

  const toastRef = useRef<number | null>(null)
  const stopRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const refImagesRef = useRef(refImages)
  const refThumbCacheRef = useRef(new WeakMap<object, string | null>())
  const pendingHistWritesRef = useRef<Promise<unknown>[]>([])
  const channelsRef = useRef(channels)
  const casesRef = useRef(cases)
  const historyRef = useRef(history)
  const rateRef = useRef(parseFloat(rateStr) || IMG_DEFAULT_RATE)
  // 当前批次：一次「全部运行 / 运行选中」开一批，之后单条补跑沿用它
  const currentRunIdRef = useRef<string | null>(null)
  const setCurrentRunId = (v: string | null) => { currentRunIdRef.current = v }
  const c2paOnRef = useRef(c2paOn)
  const c2paWriteRef = useRef(new Map<string, Promise<unknown>>())

  useEffect(() => { refImagesRef.current = refImages }, [refImages])
  useEffect(() => { channelsRef.current = channels }, [channels])
  useEffect(() => { casesRef.current = cases }, [cases])
  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => { rateRef.current = parseFloat(rateStr) || IMG_DEFAULT_RATE }, [rateStr])
  useEffect(() => { c2paOnRef.current = c2paOn }, [c2paOn])

  useEffect(() => { try { kvSet(IMG_CH_KEY, JSON.stringify(channels)) } catch { /* ignore */ } }, [channels])
  useEffect(() => {
    try {
      if (activeChId) kvSet(IMG_ACTIVE_KEY, activeChId)
      else kvRemove(IMG_ACTIVE_KEY)
    } catch { /* ignore */ }
  }, [activeChId])
  useEffect(() => { imgSavePrices(prices) }, [prices])
  useEffect(() => { imgSaveRate(rateStr) }, [rateStr])
  useEffect(() => { try { kvSet(IMG_HIDEPRICES_KEY, hidePrices ? '1' : '0') } catch { /* ignore */ } }, [hidePrices])
  useEffect(() => { try { kvSet(IMG_C2PA_KEY, c2paOn ? '1' : '0') } catch { /* ignore */ } }, [c2paOn])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await imgHistMigrateOnce()
      // 读库前后各查一次锁：读库与查锁之间别的标签页可能刚开始或刚结束验真，两次取并集才不会误标。
      const heldBefore = await imgHeldC2paIds()
      const loaded = await imgLoadHistory()
      const heldAfter = await imgHeldC2paIds()
      const verifying = (id: string) => heldBefore && heldAfter
        ? heldBefore.has(id) || heldAfter.has(id)
        : c2paWriteRef.current.has(id)
      // 上次页面在验真出结论前被关掉，库里会残留「验真中」。原图已经不在，只能标成未完成。
      // 仍有标签页持有该记录验真锁的不动。
      const stale: ImgRecord[] = []
      const list = loaded.map(r => {
        if (verifying(r.id) || !r.images.some(im => im.c2pa?.status === 'pending')) return r
        const fixed = { ...r, images: r.images.map(im => im.c2pa?.status === 'pending' ? { ...im, c2pa: imgC2paIncomplete() } : im) }
        stale.push(fixed)
        return fixed
      })
      for (const r of stale) historyDbPutOne('imgtest', r).catch(() => {})
      if (!cancelled) setHistory(list)
    })()
    return () => { cancelled = true }
  }, [])
  useDebouncedPersist(() => { try { kvSet(IMG_UI_KEY, JSON.stringify({ apiType, model, prompt })) } catch { /* ignore */ } }, [apiType, model, prompt])
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

  // modelRef = 当前用例列表对应的模型。输入过程只改文字（setModel），失焦才判断是否跨过 nano 边界并重建用例，
  // 避免每敲一个字符就弹 confirm 拦住输入。
  const commitModel = (next: string) => {
    const prev = modelRef.current
    const crossing = apiType === 'gemini' && imgIsNanoBanana21(prev) !== imgIsNanoBanana21(next)
    if (crossing) {
      // 有结果、取消过勾选、改过请求预览，重建都会丢掉
      const dirty = casesRef.current.some(c => c.result || !c.selected || c.editedPreview != null)
      if (dirty && !window.confirm('切换到这个模型会更换用例列表，当前结果、勾选和编辑过的请求会被重置，确定吗？')) {
        setModel(prev)
        return
      }
      setCases(imgBuildCases('gemini', next))
      setSelAll(true)
      setCurrentRunId(null)
      setRestoredFrom(null)
    }
    modelRef.current = next
    setModel(next)
  }

  const switchApiType = (t: ImgApiType) => {
    setApiType(t)
    modelRef.current = model
    setCases(imgBuildCases(t, model))
    setSelAll(true)
    // 用例集整套换掉，之前那一批到此为止，下次运行开新批
    setCurrentRunId(null)
    setRestoredFrom(null)
  }

  const planOf = (c: ImgCase): ImgPlan => c.plan ?? imgBuildPlan(apiType, model.trim() || IMG_PLACEHOLDER_MODEL[apiType], c.prompt ?? prompt, c.params, imgRefCountFor(c, refImages.length))
  const bodyOf = (plan: ImgPlan) => plan.kind === 'json' ? plan.body : (plan.multipart?.fields) || {}

  const saveChannel = useCallback(async () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chForm, editingChId, channels, activeChId])
  const editChannel = useCallback((c: ImgChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, apiKey: '' })
    setEditingChId(c.id)
    setPane('channels')
  }, [])
  const copyChannel = useCallback((c: ImgChannel) => {
    const name = uniqueCopyName(c.name, channels.map(x => x.name))
    const nc: ImgChannel = { ...c, id: imgUid(), name }
    setChannels([...channels, nc])
    toastShow(`已复制为 ${name}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  const delChannel = useCallback((id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(prev => prev.filter(x => x.id !== id))
    setActiveChId(prev => (prev === id ? null : prev))
  }, [])
  const clearChForm = useCallback(() => {
    setChForm({ name: '', baseUrl: '', apiKey: '' })
    setEditingChId(null)
  }, [])

  const updatePrice = useCallback((idx: number, v: number) => {
    setPrices(prev => prev.map((x, i) => i === idx ? { ...x, usd: v } : x))
  }, [])
  const delPrice = useCallback((idx: number) => {
    if (!window.confirm(`删除 ${prices[idx].model} (${prices[idx].tier}) 的价格条目？`)) return
    setPrices(prev => prev.filter((_, i) => i !== idx))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices])
  const addPrice = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceForm])
  const resetPrices = useCallback(() => {
    if (!window.confirm('恢复为内置默认价格？将覆盖你的自定义修改。')) return
    setPrices(JSON.parse(JSON.stringify(IMG_DEFAULT_PRICES)))
    toastShow('已恢复默认价格')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rateChange = useCallback((v: string) => setRateStr(v.replace(/[^\d.]/g, '')), [])

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
    id: imgUid(), runId: currentRunIdRef.current ?? undefined, time: Date.now(), caseName: c.name, caseDesc: c.desc,
    channelName: chName, apiType, model: m, prompt: c.prompt ?? prompt,
    targets: {}, useRef: c.needRef, refThumbs: [], price: null,
    status: 0, respHeaders: {}, reqId: '', sentPreview: '',
    ok: false, error: err, rawSnippet: '', images: [], returnedN: 0, durationMs: 0, checks: [], validationVersion: IMG_VALIDATION_VERSION,
  })

  // deferTrim：批量运行里每条只写入，整批结束后统一裁剪一次（裁剪要整库读出再分组）
  const runCase = async (c: ImgCase, opts: { deferTrim?: boolean } = {}) => {
    if (running && c.status !== 'running') { toastShow('正在批量运行中'); return }
    const ch = channelsRef.current.find(x => x.id === activeChId)
    if (!ch) { toastShow('请先在「渠道管理」添加并选择渠道'); return }
    const m = model.trim() || IMG_PLACEHOLDER_MODEL[apiType]
    if (!m.trim()) { toastShow('请填写模型编码'); return }
    let refs = refImagesRef.current
    if (c.synthRefs) {
      try {
        const made: ImgRef[] = []
        for (let i = 0; i < c.synthRefs.count; i++) made.push(await imgSynthRef(c.synthRefs.mime, i))
        refs = made
      } catch (e: any) {
        if (e instanceof ImgSynthUnsupportedError) {
          // 测试端的限制，不是渠道的问题：不记失败、不入历史
          c.status = 'idle'
          c.result = null
          setCases([...casesRef.current])
          toastShow(`「${c.name}」${e.message}`)
          return
        }
        c.status = 'error'
        c.result = emptyRecord(c, ch.name, m, e?.message || String(e))
        setCases([...casesRef.current])
        return
      }
    } else if (c.needRef && refs.length === 0) { toastShow('该用例需要参考图'); return }
    const apiKey = await imgDecryptApiKey(ch.apiKeyEnc)
    if (!apiKey) { toastShow('渠道 API Key 无效，请重新编辑保存'); return }

    if (!currentRunIdRef.current) currentRunIdRef.current = imgUid()
    const runId = currentRunIdRef.current

    c.status = 'running'
    c.expanded = true
    c.result = null
    setCases([...casesRef.current])

    const usePrompt = c.prompt || prompt
    let plan = imgBuildPlan(apiType, m, usePrompt, c.params, imgRefCountFor(c, refs.length))
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
    const priceCount = imgPlanOutputs(plan)
    const inputRefCount = imgRefCountFor(c, refs.length)

    const t0 = performance.now()
    const rec: ImgRecord = {
      id: imgUid(), runId, time: Date.now(), caseName: c.name, caseDesc: c.desc,
      channelName: ch.name, apiType, model: m, prompt: usePrompt,
      targets, useRef: c.needRef,
      price: priceHit ? {
        usd: priceHit.usd, tier: priceHit.tier, note: priceHit.note, count: priceCount,
        cny: +(priceHit.usd * rateRef.current).toFixed(4),
        ...(priceHit.inputUsd && inputRefCount ? { inputUsd: priceHit.inputUsd, inputCny: +(priceHit.inputUsd * rateRef.current).toFixed(5), inputCount: inputRefCount } : {}),
      } : null,
      ...(c.expect ? { expect: c.expect } : {}),
      refThumbs: [],
      status: 0, respHeaders: {}, reqId: '', sentPreview: '',
      ok: false, error: null, rawSnippet: '', responseBodyComplete: true, images: [], returnedN: 0, durationMs: 0, checks: [],
      validationVersion: IMG_VALIDATION_VERSION,
    }
    try {
      const resolved = await imgResolvePlan(plan, refs)
      rec.sentPreview = imgMakeSentPreview(resolved)
      // 多轮用例：先发第一轮拿 interaction id，再把它填进第二轮的 previous_interaction_id
      let prevId: string | null = null
      let firstFail: string | null = null
      if (resolved.pre) {
        const preExec = await imgExecutePlan({ ...resolved, body: resolved.pre.body, pre: undefined }, { baseUrl: ch.baseUrl, apiKey }, refs)
        const preParsed = imgParseResponse(apiType, preExec.text, preExec.headers, preExec.httpStatus, preExec.resp.ok, undefined)
        prevId = preParsed.interaction?.id ?? null
        if (!preParsed.ok) firstFail = `第一轮失败（HTTP ${preExec.httpStatus}）：${preParsed.error || '未知错误'}`
        else if (!prevId) firstFail = '第一轮未返回 interaction id，无法发起第二轮'
        else resolved.body = JSON.parse(JSON.stringify(resolved.body).replace('__PREV_INTERACTION_ID__', prevId))
        rec.sentPreview = JSON.stringify({ 第一轮: JSON.parse(imgMakeSentPreview({ ...resolved, body: resolved.pre.body, pre: undefined })), 第二轮: JSON.parse(imgMakeSentPreview({ ...resolved, pre: undefined })) }, null, 2)
        if (firstFail) {
          rec.status = preExec.httpStatus
          rec.respHeaders = preExec.headers
          rec.reqId = preExec.headers['x-oneapi-request-id'] || ''
        }
      }
      // 第一轮没成功：沿用下面的 catch 收尾（记失败、清空图片、重算校验）
      if (firstFail) throw new Error(firstFail)
      const exec = await imgExecutePlan({ ...resolved, pre: undefined }, { baseUrl: ch.baseUrl, apiKey }, refs)
      rec.status = exec.httpStatus
      rec.respHeaders = exec.headers
      rec.reqId = exec.headers['x-oneapi-request-id'] || ''
      const fmtHint = plan.kind === 'json' ? plan.body?.output_format : plan.multipart?.fields?.output_format
      const parsed = imgParseResponse(apiType, exec.text, exec.headers, exec.httpStatus, exec.resp.ok, fmtHint)
      if (parsed.interaction && prevId) parsed.interaction.prevId = prevId
      if (parsed.interaction) rec.interaction = parsed.interaction
      rec.ok = parsed.ok
      rec.error = parsed.error
      const shownResponse = imgResponseForDisplay(parsed.rawSnippet)
      rec.rawSnippet = shownResponse.body
      rec.responseBodyComplete = shownResponse.complete
      if (parsed.ok) {
        const imgs: ImgRecImage[] = []
        for (const im of parsed.images) {
          let dataUri = im.dataUri
          let dim = !dataUri && im.url ? await imgProbeImage(im.url) : { w: 0, h: 0 }
          if ((!dim.w || !dim.h) && !dataUri && im.url) dataUri = await imgUrlToDataURI(im.url)
          let thumb: string | null = null
          if (dataUri) {
            const decoded = await imgDecodeWithThumb(dataUri)
            thumb = decoded.thumb
            if (!dim.w || !dim.h) dim = { w: decoded.w, h: decoded.h }
          }
          const uriFormat = imgDetectUriFormat(dataUri)
          const labelFmt = (uriFormat !== 'unknown' ? uriFormat : imgDetectResponseFormat(im.mimeType, im.url)).replace('jpg', 'jpeg')
          const sniffed = dataUri ? sniffImageMime(dataUri)?.slice(6) : undefined
          const format = sniffed || (uriFormat === 'unknown' ? labelFmt : uriFormat)
          imgs.push({
            dataUri, thumb, url: im.url || null, w: dim.w, h: dim.h,
            format,
            ...(sniffed && labelFmt !== 'unknown' && labelFmt !== format ? { formatLabel: labelFmt } : {}),
            carrier: im.carrier,
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
      c.status = imgExpectedRejected(rec) ? 'pass' : rec.ok ? (v.level === 'ok' ? 'pass' : 'fail') : 'error'
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
    let releaseC2pa: (() => void) | null = null
    try {
      if (c.needRef) {
        for (const r of refs) {
          if (!r.dataUri) { rec.refThumbs.push(r.url || null); continue }
          // 一批里每条参考图用例都用同一组参考图，缩略图只压一次
          if (!refThumbCacheRef.current.has(r)) refThumbCacheRef.current.set(r, await imgMakeThumb(r.dataUri))
          rec.refThumbs.push(refThumbCacheRef.current.get(r) ?? null)
        }
      }
      if (c2paOnRef.current) {
        rec.images = rec.images.map(im => (im.dataUri || (im.url && /^https?:/i.test(im.url))) ? { ...im, c2pa: imgC2paPending() } : im)
      }
      // 「验真中」落库之前先拿锁，别的标签页此刻加载历史也不会把它标成未完成
      if (rec.images.some(im => im.c2pa?.status === 'pending')) releaseC2pa = await imgHoldC2paLock(rec.id)
      const histRec: ImgRecord = {
        ...rec,
        images: rec.images.map(im => ({ ...im, dataUri: null })),
      }
      // 同批同用例重复运行只留最新：内存与 IndexedDB 里的旧记录一起剔掉
      const stale = historyRef.current.filter(r => r.runId === histRec.runId && r.caseName === histRec.caseName)
      const staleIds = new Set(stale.map(r => r.id))
      const next = imgTrimByBatch([histRec, ...historyRef.current.filter(r => !staleIds.has(r.id))])
      historyRef.current = next
      setHistory(next)
      const write = historyDbPutOne('imgtest', histRec)
        .then(() => staleIds.size ? historyDbDeleteMany('imgtest', [...staleIds]) : undefined)
      if (opts.deferTrim) pendingHistWritesRef.current.push(write)
      write.then(() => opts.deferTrim ? undefined : imgHistTrim())
        .catch(() => toastShow('历史记录写入失败'))
      const release = releaseC2pa
      if (release) {
        c2paWriteRef.current.set(rec.id, write)
        releaseC2pa = null
        void write.catch(() => {}).then(() => verifyRecordC2pa(rec, release))
      }
    } catch {
      // 收尾失败不阻塞状态更新；验真没能启动就把锁放掉
      releaseC2pa?.()
    }
    setCases([...casesRef.current])
  }

  const patchImageC2pa = (recordId: string, index: number, result: ImgC2paResult) => {
    let liveChanged = false
    for (const item of casesRef.current) {
      if (item.result?.id !== recordId) continue
      item.result = {
        ...item.result,
        images: item.result.images.map((im, i) => i === index ? { ...im, c2pa: result } : im),
      }
      liveChanged = true
    }
    if (liveChanged) setCases(casesRef.current.slice())

    const hist = historyRef.current.find(r => r.id === recordId)
    if (hist) {
      const nextRec: ImgRecord = {
        ...hist,
        images: hist.images.map((im, i) => i === index ? { ...im, c2pa: result } : im),
      }
      const next = historyRef.current.map(r => r.id === recordId ? nextRec : r)
      historyRef.current = next
      setHistory(next)
      const prev = c2paWriteRef.current.get(recordId) ?? Promise.resolve()
      const put = () => historyDbPutOne('imgtest', nextRec)
      const job = prev.then(put, put).catch(() => {})
      c2paWriteRef.current.set(recordId, job)
    }
    setDetailRec(current => {
      if (!current || current.id !== recordId) return current
      return { ...current, images: current.images.map((im, i) => i === index ? { ...im, c2pa: result } : im) }
    })
  }

  const verifyRecordC2pa = async (rec: ImgRecord, release: () => void) => {
    const jobs = rec.images.map((im, index) => ({
      index,
      dataUri: im.dataUri,
      url: im.url,
      pending: im.c2pa?.status === 'pending',
    }))
    try {
      let readSource: typeof import('./img-report/c2pa-read').imgReadC2paSource
      try {
        readSource = (await import('./img-report/c2pa-read')).imgReadC2paSource
      } catch (e) {
        for (const job of jobs) {
          if (job.pending) patchImageC2pa(rec.id, job.index, imgC2paUnreadable(e instanceof Error ? e.message : '验真模块加载失败'))
        }
        return
      }
      for (const job of jobs) {
        if (!job.pending) continue
        const result = await readSource({ dataUri: job.dataUri, url: job.url })
        patchImageC2pa(rec.id, job.index, result)
      }
    } finally {
      // 结论全部落库后再放锁，否则别的标签页可能在锁已释放、库里仍是「验真中」时把它标成未完成
      await c2paWriteRef.current.get(rec.id)?.catch(() => {})
      c2paWriteRef.current.delete(rec.id)
      release()
    }
  }

  const resetRun = () => {
    setCases(cs => cs.map(c => ({ ...c, status: 'idle' as const, result: null })))
    setCurrentRunId(null)
    setRestoredFrom(null)
  }

  const runList = async (list: ImgCase[]) => {
    if (running) { toastShow('已有运行中'); return }
    setRunning(true)
    setCurrentRunId(imgUid())
    setRestoredFrom(null)
    stopRef.current = false
    try {
      for (const c of list) {
        if (stopRef.current) break
        if (c.needRef && !c.synthRefs && refImagesRef.current.length === 0) {
          c.status = 'error'
          c.result = emptyRecord(c, activeChannel?.name || '', model.trim() || IMG_PLACEHOLDER_MODEL[apiType], '需要参考图但未提供')
          setCases([...casesRef.current])
          continue
        }
        try {
          await runCase(c, { deferTrim: true })
        } catch { /* 单个用例异常不中断批量 */ }
        await new Promise(r => setTimeout(r, 150))
      }
    } finally {
      setRunning(false)
      stopRef.current = false
      const writes = pendingHistWritesRef.current
      pendingHistWritesRef.current = []
      Promise.allSettled(writes).then(() => imgHistTrim()).catch(() => { /* 下次写入时再裁 */ })
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
    if (p) { const n = imgPlanOutputs(plan); costUsd += p.usd * n + p.inputUsd * imgRefCountFor(c, refImages.length); costN++ }
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

  const priceTag = (p: { usd: number; tier: string; note: string; inputUsd?: number }, mult: number, refCount = 0) => {
    const n = mult > 1 ? mult : 1
    const inUsd = (p.inputUsd || 0) * refCount
    const total = p.usd * n + inUsd
    return (
      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono whitespace-nowrap" title={`档位 ${p.tier}${p.note ? ' · ' + p.note : ''}${n > 1 ? ' · ×' + n + '张' : ''}${inUsd ? ' · 含 ' + refCount + ' 张输入图' : ''}`}
        style={{ background: 'var(--warnBg)', color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }}>
        ${total.toFixed(3)} / ¥{(total * rate).toFixed(3)}{n > 1 ? ` (${n}张)` : ''}
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
          {im.c2pa && <ImgC2paLine result={im.c2pa} />}
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
          <span>参考价格（档位 {r.price.tier} · 1美元={rate}元）：<b style={{ color: 'var(--warn)' }}>${imgPriceTotals(r.price).usd.toFixed(3)} / ¥{imgPriceTotals(r.price).cny.toFixed(3)}</b>
            {(r.price.count || 1) > 1 ? `（${r.price.count} 张 × $${r.price.usd.toFixed(3)}）` : ''}{r.price.inputCount ? `（含 ${r.price.inputCount} 张输入图）` : ''}{r.price.note ? ' · ' + r.price.note : ''}</span>
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
          [r.responseBodyComplete === false ? '响应体（图片 base64 已省略）' : '响应体', imgFormatResponseBody(r.rawSnippet || ''), false],
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
    const showRefWarn = c.needRef && !c.synthRefs && refImages.length === 0
    const paramSummary = Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(', ')
    const price = imgLookupPrice(model.trim() || IMG_PLACEHOLDER_MODEL[apiType], apiType, bodyOf(plan), prices)
    const nMult = imgPlanOutputs(plan)
    const statusColor = c.status === 'running' ? 'var(--accent)' : c.status === 'pass' ? 'var(--ok)' : c.status === 'fail' ? 'var(--err)' : c.status === 'error' ? 'var(--warn)' : 'transparent'
    return (
      <div key={c.id} data-case-name={c.name} className="rounded-2xl overflow-hidden transition-all duration-150"
        style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${statusColor}`, background: 'var(--bg)', marginBottom: 10, boxShadow: c.status === 'running' ? '0 0 0 3px var(--accentSub)' : 'none' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:opacity-90" onClick={() => toggleExpand(c)}>
          <input type="checkbox" className="w-4 h-4 cursor-pointer flex-shrink-0" style={{ accentColor: 'var(--accent)' }} checked={c.selected}
            onChange={e => toggleSel(c, e.target.checked)} onClick={e => e.stopPropagation()} />
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold flex-wrap" style={{ color: 'var(--text)' }}>
              <span>{c.name}</span>
              {c.needRef && <Badge>参考图</Badge>}
              {c.expect === 'unsupported' && <Badge color="warn">预期不支持</Badge>}
              {!hidePrices && price && priceTag(price, nMult, imgRefCountFor(c, refImages.length))}
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
            {c.result && renderResultBody(c.result, { hidePrice: hidePrices })}
          </div>
        )}
      </div>
    )
  }

  const startExport = useCallback((records: ImgRecord[], format: 'png' | 'html') => {
    if (!records.length) { toastShow('没有可导出的记录'); return }
    if (exportBusy) { toastShow('正在导出中，请稍候'); return }
    setExportJob({ records, format })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportBusy])
  const clearAllHistory = useCallback(() => {
    if (window.confirm('清空所有历史记录？')) {
      setHistory([]); historyDbClear('imgtest').catch(() => {}); toastShow('已清空')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const deleteHistOne = useCallback((id: string) => {
    if (window.confirm('删除该记录？')) {
      setHistory(h => h.filter(x => x.id !== id))
      historyDbDeleteOne('imgtest', id).catch(() => {})
    }
  }, [])
  const deleteHistBatch = useCallback((batch: ImgBatch) => {
    if (!window.confirm(`删除这一批 ${batch.records.length} 条记录？`)) return
    const ids = new Set(batch.records.map(r => r.id))
    setHistory(h => h.filter(x => !ids.has(x.id)))
    historyDbDeleteMany('imgtest', [...ids]).catch(() => {})
  }, [])

  // 把某一批历史搬回「批量测试」页：连同接口类型 / 模型 / 提示词 / 渠道一起切过去，
  // 之后就能照常用页面上的导出按钮出整批报告，或者补跑其中几条（会归入同一批）
  const restoreBatch = useCallback((batch: ImgBatch) => {
    if (casesRef.current.some(c => c.result) && !window.confirm('当前批量测试页已有结果，还原会覆盖，确定吗？')) return

    // 没记模型名就沿用输入框里的，保证用例集与模型框一致
    const nextModel = batch.models[0] || modelRef.current
    const nextCases = imgBuildCases(batch.apiType, nextModel)
    const byName = new Map<string, ImgRecord>()
    // 同名用例取这批里最新的那条
    for (const r of [...batch.records].sort((a, b) => a.time - b.time)) byName.set(r.caseName, r)
    let restored = 0
    for (const c of nextCases) {
      const r = byName.get(c.name)
      if (!r) continue
      c.result = r
      c.status = imgClassify(r)
      byName.delete(c.name)
      restored++
    }

    setApiType(batch.apiType)
    setCases(nextCases)
    casesRef.current = nextCases
    setSelAll(true)
    modelRef.current = nextModel
    setModel(nextModel)
    // 参考图类用例自带 prompt，拿它当全局提示词会串味，只从「没带自己 prompt」的记录里取
    const generic = batch.records.find(r => !nextCases.some(c => c.name === r.caseName && c.prompt))
    if (generic?.prompt) setPrompt(generic.prompt)

    const ch = channelsRef.current.find(x => x.name === batch.channelName)
    if (ch) setActiveChId(ch.id)

    setCurrentRunId(batch.id.startsWith('legacy:') ? null : batch.id)
    setRestoredFrom({ time: batch.endAt, count: restored })
    setPane('test')
    const skipped = byName.size
    toastShow(`已还原 ${imgFmtTime(batch.endAt).slice(11, 16)} 那一轮（${restored} 条）` +
      (skipped ? ` · ${skipped} 条对不上当前用例集，已跳过` : '') +
      (ch ? '' : ' · 未找到同名渠道，请手动选择'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <CustomInput value={model} onChange={setModel} onBlur={() => commitModel(model)} placeholder={IMG_PLACEHOLDER_MODEL[apiType]} />
            {apiType === 'gemini' && imgIsNanoBanana21(model) && (
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--t3)' }}>此模型按官方 Interactions 发送：POST /v1beta/interactions</p>
            )}
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

  // 函数形式：只有激活的 pane 才会被求值（JSX 变量会在每次渲染时无条件构建整棵子树）
  const renderTestPane = () => (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>测试用例</p>
          <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{cases.length}</span>
          <span className="text-xs" style={{ color: 'var(--t3)' }}>· {IMG_API_LABEL[apiType]} 相关用例</span>
        </div>
        {restoredFrom && (
          <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2.5 mb-3 text-xs" data-testid="imgtest-restored-note"
            style={{ background: 'var(--accentSub)', border: '1px solid var(--border)', color: 'var(--t2)' }}>
            <span>当前是 <b style={{ color: 'var(--text)' }}>{imgFmtTime(restoredFrom.time)}</b> 那一轮的历史结果（{restoredFrom.count} 条）· 生成图为缩略图，参考图未保存</span>
            <div className="ml-auto"><Btn small variant="ghost" onClick={resetRun}>清除</Btn></div>
          </div>
        )}
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
          <Btn small variant="ghost" disabled={running} onClick={resetRun}>↺ 重置状态</Btn>
          <Btn small variant="danger" disabled={!running} onClick={() => { stopRef.current = true; toastShow('将在当前用例结束后停止') }}>■ 停止</Btn>
          <Btn small variant="soft" disabled={exportBusy || !cases.some(c => c.result)} onClick={() => startExport(cases.filter(c => c.result).map(c => c.result!), 'png')}>导出 PNG</Btn>
          <Btn small variant="soft" disabled={exportBusy || !cases.some(c => c.result)} onClick={() => startExport(cases.filter(c => c.result).map(c => c.result!), 'html')}>导出 HTML</Btn>
          <div className="flex-1 min-w-40 h-2 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: (cases.length ? (doneCount / cases.length * 100) : 0) + '%' }} />
          </div>
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--t2)' }}>
            已选 <b style={{ color: 'var(--text)' }}>{selCases.length}</b> / 已完成 <b style={{ color: 'var(--text)' }}>{doneCount}</b> · 通过 <b style={{ color: 'var(--ok)' }}>{passCount}</b> · 未通过 <b style={{ color: failCount ? 'var(--err)' : 'var(--t2)' }}>{failCount}</b>
            {!hidePrices && costN > 0 && <span> · 预估 <b style={{ color: 'var(--warn)' }}>${costUsd.toFixed(3)} / ¥{(costUsd * rate).toFixed(2)}</b>{costN < selCases.length ? `（${costN}/${selCases.length} 项有价格）` : ''}</span>}
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
          <div className="ml-auto flex items-center gap-4">
            <span title="生成完成后读取原图里的 C2PA 内容凭证，并写进这条记录。不改变用例通过结果。">
              <Toggle value={c2paOn} onChange={setC2paOn} label="生成后验真" />
            </span>
            <Toggle value={hidePrices} onChange={setHidePrices} label="隐藏价格" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {pane === 'test' && renderTestPane()}
          {pane === 'channels' && (
            <ImgChannelsPane
              channels={channels} activeChId={activeChId} chForm={chForm} editingChId={editingChId}
              onSetActive={setActiveChId} onEdit={editChannel} onCopy={copyChannel} onDelete={delChannel}
              onSave={saveChannel} onChFormChange={setChForm} onClearForm={clearChForm}
            />
          )}
          {pane === 'prices' && (
            <ImgPricesPane
              prices={prices} rateStr={rateStr} rate={rate} priceForm={priceForm}
              onRateChange={rateChange} onResetPrices={resetPrices}
              onUpdatePrice={updatePrice} onDelPrice={delPrice}
              onPriceFormChange={setPriceForm} onAddPrice={addPrice}
            />
          )}
          {pane === 'history' && (
            <ImgHistoryPane
              history={history} channels={channels} hidePrices={hidePrices} exportBusy={exportBusy}
              fChannel={fChannel} fApiType={fApiType} fModel={fModel} fResult={fResult}
              onFChannel={setFChannel} onFApiType={setFApiType} onFModel={setFModel} onFResult={setFResult}
              onStartExport={startExport}
              onClearAll={clearAllHistory} onDetail={setDetailRec} onDeleteOne={deleteHistOne}
              onRestore={restoreBatch} onDeleteBatch={deleteHistBatch}
            />
          )}
        </div>
      </div>

      {detailRec && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-8" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDetailRec(null)}>
          <div className="floating-material w-full max-w-3xl rounded-2xl ia-card-enter" style={{ background: 'var(--bg)', boxShadow: 'var(--shadowMd)', border: '1px solid var(--border)', maxHeight: '82vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>测试记录详情</p>
              <div className="flex items-center gap-2">
                <Btn small variant="soft" disabled={exportBusy} onClick={() => startExport([detailRec], 'png')}>导出 PNG</Btn>
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
              {renderResultBody(detailRec, { hidePrice: hidePrices, defaultOpenReq: true })}
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
          {/* 报告文档自己就是截图根节点：宽度 100% + 栏宽上限 1120px 居中，
              明细一律折叠（defaultOpenReq 不传），先给结论再给细节 */}
          <div className="w-full flex justify-center" style={{ minWidth: 960 }}>
            <ImgReportView rootRef={reportRootRef} records={exportJob.records}
              renderDetail={r => renderResultBody(r, { hidePrice: true })} />
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
