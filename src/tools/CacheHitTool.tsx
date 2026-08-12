import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { kvGet, kvSet, kvRemove } from '../shared/app-kv'
import { Btn, Label, Card, CustomInput, CustomSelect, SegmentedControl, SectionTitle } from '../shared/ui'
import { highlightJson } from '../shared/json'
import { decryptLlmApiKey, encryptLlmApiKey } from '../shared/api-key-crypto'
import { historyDbGetAll, historyDbPutOne, historyDbDeleteOne, historyDbDeleteMany, historyDbClear } from '../shared/history-db'
import { useDebouncedPersist } from '../shared/use-debounced-persist'

// ─── Tool: LLM 缓存命中率测试 ──────────────────────────────────────────────────
// 定位：对三种协议（OpenAI Chat / OpenAI Responses / Anthropic Messages）执行
// 「预热写缓存 → 顺序 N 轮重复长前缀 + 变化后缀」的命中率闭环测试，输出请求级
// 命中率、Token 级覆盖率、节省 Token 与延迟对比，报告可导出 PNG / PDF / HTML。
//
// 方法依据（无行业统一 benchmark，以各家官方缓存语义为准）：
// - OpenAI：自动前缀缓存，>1024 token、128 增量、精确前缀匹配；命中时
//   prompt_tokens_details.cached_tokens（Chat）/ input_tokens_details.cached_tokens
//   （Responses）> 0；请求带 prompt_cache_key 保证路由一致。cached_tokens 是
//   prompt_tokens 的子集。
// - Anthropic：显式 cache_control: {type:"ephemeral"} 断点；命中时
//   cache_read_input_tokens > 0，写入时 cache_creation_input_tokens > 0；注意
//   input_tokens 不含缓存部分（与 OpenAI 相反），指标归一化时补齐。

type CacheFormat = 'chat' | 'responses' | 'anthropic'

export interface CacheUsage {
  /** 协议原始输入 token（OpenAI 含缓存部分；Anthropic 不含） */
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
  /** 归一化总输入：OpenAI = prompt_tokens；Anthropic = input + cacheRead + cacheWrite */
  totalPrompt: number | null
}

export interface CacheRound {
  round: number          // 0 = 预热
  warmup: boolean
  status: 'ok' | 'error'
  httpStatus: number | null
  durationMs: number | null
  usage: CacheUsage
  hit: boolean
  error?: string
}

interface CacheMetrics {
  measured: number             // 完成且成功的测量轮数（不含预热）
  failedRounds: number         // 失败的测量轮数
  hitCount: number
  hitRate: number | null       // hitCount / measured
  coverage: number | null      // Σ cacheRead / Σ totalPrompt（成功测量轮）
  savedTokens: number          // Σ cacheRead
  cacheWriteTokens: number     // Σ cacheWrite（含预热轮）
  fieldMissing: number         // 成功测量轮中未返回缓存字段的轮数
  warmupMs: number | null
  hitAvgMs: number | null
  missAvgMs: number | null
}

export interface CacheProtocolResult extends CacheMetrics {
  format: CacheFormat
  status: 'ok' | 'error' | 'stopped'
  error?: string
  rounds: CacheRound[]
  promptCacheKeyDropped?: boolean  // 渠道拒绝 prompt_cache_key 参数，已降级去掉重试
}

interface CacheReport {
  id: string
  name: string
  startedAt: string
  completedAt: string
  durationMs: number
  target: { baseUrl: string; model: string; channelName?: string; keyMask?: string }
  params: { prefixTokens: number; rounds: number; nonce: string }
  results: CacheProtocolResult[]
}

interface CacheLog {
  id: string
  format: CacheFormat
  label: string
  url: string
  status: number | null
  statusText: string
  duration: number
  time: string
  requestHeaders: Record<string, string>
  requestBody: any
  responseBody: any
  usage: CacheUsage
}

interface CacheCfg {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  urlOf: Record<CacheFormat, string>
}

// ── 渠道：与模型探测同一范式（baseUrl + 三协议 URL 覆写 + 加密 apiKey）──
interface CacheChannel {
  id: string
  name: string
  baseUrl: string
  timeoutSec: string
  chatUrl: string
  responsesUrl: string
  anthropicUrl: string
  apiKeyEnc: string
  keyMask: string
}

const CACHE_CFG_KEY = 'cachehit-config'
const CACHE_CHANNELS_KEY = 'cachehit-channels'
const CACHE_ACTIVE_CH_KEY = 'cachehit-active-channel'
const CACHE_HISTORY_MAX = 20

const CACHE_MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace'
const CACHE_FORMATS: CacheFormat[] = ['chat', 'responses', 'anthropic']
const CACHE_FORMAT_LABELS: Record<CacheFormat, string> = {
  chat: 'OpenAI Chat Completions', responses: 'OpenAI Responses', anthropic: 'Anthropic Messages',
}
const CACHE_ENDPOINTS: Record<CacheFormat, string> = {
  chat: '/v1/chat/completions', responses: '/v1/responses', anthropic: '/v1/messages',
}
const CACHE_FIELD_HINTS: Record<CacheFormat, string> = {
  chat: 'usage.prompt_tokens_details.cached_tokens',
  responses: 'usage.input_tokens_details.cached_tokens',
  anthropic: 'usage.cache_read_input_tokens / cache_creation_input_tokens',
}

// ── 纯函数工具 ──
const cacheJoinUrl = (base: string, path: string): string => {
  const clean = base.trim().replace(/\/+$/, '')
  return /\/v1$/i.test(clean) && path.startsWith('/v1/') ? clean + path.slice(3) : clean + path
}
const cacheNum = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
const cacheEmptyUsage = (): CacheUsage => ({ input: null, output: null, cacheRead: null, cacheWrite: null, totalPrompt: null })

function cacheUsageOf(format: CacheFormat, data: any): CacheUsage {
  const u = cacheEmptyUsage()
  if (!data || typeof data !== 'object') return u
  if (format === 'anthropic') {
    u.input = cacheNum(data?.usage?.input_tokens)
    u.output = cacheNum(data?.usage?.output_tokens)
    u.cacheRead = cacheNum(data?.usage?.cache_read_input_tokens)
    u.cacheWrite = cacheNum(data?.usage?.cache_creation_input_tokens)
    // Anthropic 的 input_tokens 不含缓存读/写部分，归一化补齐
    u.totalPrompt = u.input != null ? u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0) : null
    return u
  }
  const usage = data?.usage || {}
  u.input = cacheNum(usage.prompt_tokens ?? usage.input_tokens)
  u.output = cacheNum(usage.completion_tokens ?? usage.output_tokens)
  u.cacheRead = cacheNum(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens)
  u.totalPrompt = u.input   // OpenAI 的 cached_tokens 是 prompt_tokens 的子集
  return u
}

const cacheExtractError = (data: any): string => {
  if (typeof data === 'string') return data.slice(0, 400)
  try { return JSON.stringify(data?.error?.message ?? data?.error ?? data).slice(0, 400) } catch { return String(data) }
}
const cacheMakeNonce = (): string => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
const cacheNowName = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const cacheSafeName = (v: string): string => v.replace(/[\\/:*?"<>|\s]+/g, '_')
const cacheJsonPretty = (v: any): string => {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
const cachePct = (v: number | null): string => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const cacheMaskValue = (v: string): string => (v.length > 10 ? v.slice(0, 7) + '***' + v.slice(-4) : '***')
const cacheMaskHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(headers)) {
    const v = headers[k]
    if (/authorization|api-key/i.test(k)) out[k] = /^Bearer\s+/i.test(v) ? 'Bearer ' + cacheMaskValue(v.slice(7)) : cacheMaskValue(v)
    else out[k] = v
  }
  return out
}
// 日志里的长前缀截断（前缀确定性重复，完整保留只会撑爆日志/历史/导出）
function cacheTruncateDeep(v: any): any {
  if (typeof v === 'string') return v.length > 400 ? v.slice(0, 200) + ` …（已截断，共 ${v.length} 字符）` : v
  if (Array.isArray(v)) return v.map(cacheTruncateDeep)
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(v)) out[k] = cacheTruncateDeep(v[k])
    return out
  }
  return v
}

// ── 长前缀与请求体构造 ──
// 前缀 = 运行 nonce（保证测的是本次写入的缓存，不吃上一轮运行的残留）+ 确定性语料
// 重复到目标 token 数（按 ~4 字符/token 估算）。后缀每轮变化，模拟「同上下文、不同问题」。
function cacheBuildPrefix(nonce: string, targetTokens: number): string {
  const sentence = 'This deterministic filler sentence is repeated to build a long stable prefix for prompt cache hit-rate measurement across providers. '
  const targetChars = Math.max(1, targetTokens) * 4
  let s = `[cache-hit-test ${nonce}] You are a helpful assistant. Context document follows. `
  while (s.length < targetChars) s += sentence
  return s
}
const cacheSuffixOf = (round: number): string =>
  `Question ${round}: reply with the single word OK and nothing else.`

function cacheBodyOf(format: CacheFormat, model: string, prefix: string, suffix: string, promptCacheKey: string, includeCacheKey: boolean): Record<string, any> {
  if (format === 'chat') {
    const b: Record<string, any> = { model, messages: [{ role: 'system', content: prefix }, { role: 'user', content: suffix }] }
    if (includeCacheKey) b.prompt_cache_key = promptCacheKey
    return b
  }
  if (format === 'responses') {
    const b: Record<string, any> = { model, instructions: prefix, input: suffix }
    if (includeCacheKey) b.prompt_cache_key = promptCacheKey
    return b
  }
  return {
    model,
    max_tokens: 16,
    system: [{ type: 'text', text: prefix, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: suffix }],
  }
}

// ── 指标计算与结论判定 ──
function cacheComputeMetrics(rounds: CacheRound[]): CacheMetrics {
  const okMeasured = rounds.filter(r => !r.warmup && r.status === 'ok')
  const failedRounds = rounds.filter(r => !r.warmup && r.status === 'error').length
  const hits = okMeasured.filter(r => r.hit)
  const misses = okMeasured.filter(r => !r.hit)
  const savedTokens = okMeasured.reduce((a, r) => a + (r.usage.cacheRead ?? 0), 0)
  const totalPromptSum = okMeasured.reduce((a, r) => a + (r.usage.totalPrompt ?? 0), 0)
  const cacheWriteTokens = rounds.filter(r => r.status === 'ok').reduce((a, r) => a + (r.usage.cacheWrite ?? 0), 0)
  const warmup = rounds.find(r => r.warmup && r.status === 'ok')
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  return {
    measured: okMeasured.length,
    failedRounds,
    hitCount: hits.length,
    hitRate: okMeasured.length ? hits.length / okMeasured.length : null,
    coverage: okMeasured.length && totalPromptSum > 0 ? savedTokens / totalPromptSum : null,
    savedTokens,
    cacheWriteTokens,
    fieldMissing: okMeasured.filter(r => r.usage.cacheRead == null).length,
    warmupMs: warmup?.durationMs ?? null,
    hitAvgMs: avg(hits.map(r => r.durationMs ?? 0).filter(v => v > 0)),
    missAvgMs: avg(misses.map(r => r.durationMs ?? 0).filter(v => v > 0)),
  }
}

function cacheVerdictOf(r: CacheProtocolResult): { tone: 'ok' | 'warn' | 'err'; text: string } {
  if (r.status === 'error') return { tone: 'err', text: `测试未完成：${r.error || '预热请求失败'}` }
  if (r.status === 'stopped') return { tone: 'warn', text: '测试已停止，以下为已完成轮次。' }
  if (!r.measured) return { tone: 'err', text: '没有成功的测量轮次，无法计算命中率。' }
  if (r.fieldMissing === r.measured) {
    return { tone: 'warn', text: `渠道未返回缓存字段（${CACHE_FIELD_HINTS[r.format]}），无法判定命中。` }
  }
  const rate = r.hitRate ?? 0
  if (rate >= 1) {
    if ((r.coverage ?? 0) >= 0.8) return { tone: 'ok', text: `全部命中 · 覆盖率 ${cachePct(r.coverage)}` }
    return { tone: 'warn', text: `全部命中，但 Token 覆盖率仅 ${cachePct(r.coverage)}` }
  }
  if (rate > 0) return { tone: 'warn', text: `部分命中（${r.hitCount}/${r.measured} 轮）` }
  return { tone: 'err', text: '全部未命中' }
}

// ── 持久化：配置 / 渠道 / 历史 ──
interface CacheCfgStored {
  model?: string
  formats?: Partial<Record<CacheFormat, boolean>>
  prefixTokens?: string
  rounds?: string
}
function loadCacheCfg(): CacheCfgStored {
  if (typeof window === 'undefined') return {}
  try {
    const c = JSON.parse(kvGet(CACHE_CFG_KEY) || '{}')
    return c && typeof c === 'object' ? c : {}
  } catch { return {} }
}
function saveCacheCfg(cfg: CacheCfgStored) {
  try { kvSet(CACHE_CFG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}
function loadCacheChannels(): CacheChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = kvGet(CACHE_CHANNELS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((c): c is CacheChannel =>
      c && typeof c === 'object' && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.baseUrl === 'string')
  } catch { return [] }
}
function saveCacheChannels(list: CacheChannel[]) {
  if (typeof window === 'undefined') return
  try { kvSet(CACHE_CHANNELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
function loadCacheActiveChId(): string | null {
  if (typeof window === 'undefined') return null
  try { return kvGet(CACHE_ACTIVE_CH_KEY) } catch { return null }
}

async function cacheBuildCfgFromChannel(ch: CacheChannel, model: string): Promise<CacheCfg> {
  const apiKey = await decryptLlmApiKey(ch.apiKeyEnc)
  return {
    baseUrl: ch.baseUrl, apiKey, model,
    timeoutMs: (Number(ch.timeoutSec) || 60) * 1000,
    urlOf: {
      chat: cacheJoinUrl(ch.chatUrl.trim() || ch.baseUrl, CACHE_ENDPOINTS.chat),
      responses: cacheJoinUrl(ch.responsesUrl.trim() || ch.baseUrl, CACHE_ENDPOINTS.responses),
      anthropic: cacheJoinUrl(ch.anthropicUrl.trim() || ch.baseUrl, CACHE_ENDPOINTS.anthropic),
    },
  }
}

async function loadCacheHistory(): Promise<CacheReport[]> {
  const list = await historyDbGetAll<CacheReport>('cachehit')
  return list.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}
async function saveCacheHistory(rep: CacheReport): Promise<CacheReport[]> {
  await historyDbPutOne('cachehit', rep)
  let list = await loadCacheHistory()
  if (list.length > CACHE_HISTORY_MAX) {
    const overflow = list.slice(CACHE_HISTORY_MAX)
    await historyDbDeleteMany('cachehit', overflow.map(r => r.id))
    list = list.slice(0, CACHE_HISTORY_MAX)
  }
  return list
}
async function deleteCacheHistory(id: string): Promise<CacheReport[]> {
  await historyDbDeleteOne('cachehit', id)
  return loadCacheHistory()
}

// ── 报告导出：PNG / PDF / HTML（复用 LlmBatchTool 已验证的管线）──

function cacheDownload(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
function cacheDownloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

function cacheSvgToPngDataUrl(liveSvg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = liveSvg.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height))
    const liveNodes = [liveSvg, ...Array.from(liveSvg.querySelectorAll<SVGElement>('*'))]
    const clone = liveSvg.cloneNode(true) as SVGSVGElement
    const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))]
    liveNodes.forEach((el, i) => {
      const cs = getComputedStyle(el)
      if (cs.fill && cs.fill !== 'none') cloneNodes[i].setAttribute('fill', cs.fill)
      if (cs.stroke && cs.stroke !== 'none') cloneNodes[i].setAttribute('stroke', cs.stroke)
    })
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(2, window.devicePixelRatio || 1)
      const canvas = document.createElement('canvas')
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

let cacheColorProbeCanvas: HTMLCanvasElement | null = null
/**
 * 任意 CSS 颜色 → [r,g,b,a]，借 canvas 归一化 hex / rgb() / color-mix() 等写法。
 * 解析不了就返回 null——务必不能兜底成黑色：`borderColor` 这类简写在四边不同时会返回
 * 多值字符串（"rgba(…) rgba(…) …"），一旦当成黑色，导出的表格会多出黑线。
 */
function cacheColorToRgba(color: string): [number, number, number, number] | null {
  const value = color?.trim()
  if (!value || value === 'none') return null
  if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', value)) return null
  const canvas = cacheColorProbeCanvas ??= document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

/** 把半透明色按底色压平成不透明色；全透明或无法解析时返回空串表示「不要设这个属性」 */
function cacheFlattenColor(color: string, base: [number, number, number]): string {
  const rgba = cacheColorToRgba(color)
  if (!rgba) return ''
  const [r, g, b, a] = rgba
  if (a <= 0.004) return ''
  if (a >= 0.996) return `rgb(${r}, ${g}, ${b})`
  const mix = (c: number, i: number) => Math.round(c * a + base[i] * (1 - a))
  return `rgb(${mix(r, 0)}, ${mix(g, 1)}, ${mix(b, 2)})`
}

const CACHE_BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const

/**
 * 导出统一走「克隆到 body 顶层 + 内联计算色」：
 * - html2canvas 无法正确处理位于滚动容器内的节点，直接截活节点只会得到一张纯背景空白图
 * - 内联计算色顺带压平毛玻璃半透明与 color-mix，并补上主题变量（变量挂在 .app-shell 上，
 *   克隆脱离该子树后不会继承）
 * PNG / PDF / HTML 三种导出共用这份克隆，保证内容与版式一致。
 */
async function cacheWithExportClone<T>(
  rootEl: HTMLElement,
  fn: (clone: HTMLElement, ctx: { bg: string; width: number }) => Promise<T>,
): Promise<T> {
  const rootCs = getComputedStyle(rootEl)
  const bg = cacheFlattenColor(rootCs.getPropertyValue('--bg').trim() || '#ffffff', [255, 255, 255]) || 'rgb(255, 255, 255)'
  const bgRgba = cacheColorToRgba(bg)
  const baseRgb: [number, number, number] = bgRgba ? [bgRgba[0], bgRgba[1], bgRgba[2]] : [255, 255, 255]
  // 栏宽上限保证长行可读；PNG/PDF 四周留白避免内容贴边
  const width = Math.min(1120, Math.max(900, Math.round(rootEl.getBoundingClientRect().width)))
  const pad = 40

  const host = document.createElement('div')
  host.setAttribute('data-cache-export-host', '')
  // 必须留在正常文档流坐标内（html2canvas 依赖真实几何，挪到屏幕外会截出空白图），
  // 用负 z-index 藏到不透明的 app shell 背后，导出过程中不会闪现盖住界面
  host.style.cssText = `position:absolute;left:0;top:0;width:${width + pad * 2}px;padding:${pad}px;z-index:-1;background:${bg}`
  const shell = rootEl.closest('.app-shell')
  if (shell instanceof HTMLElement) {
    for (const name of Array.from(shell.style)) {
      if (name.startsWith('--')) host.style.setProperty(name, shell.style.getPropertyValue(name))
    }
  }

  const clone = rootEl.cloneNode(true) as HTMLElement
  clone.classList.add('cache-export-solid')
  clone.setAttribute('data-cache-export-root', '')
  clone.style.width = '100%'
  clone.style.background = bg

  // 同构树内联计算色（必须先做，删节点 / 换图表都会让两棵树的索引错位）
  const liveEls = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))]
  const cloneEls = [clone, ...Array.from(clone.querySelectorAll('*'))]
  for (let i = 0; i < liveEls.length && i < cloneEls.length; i++) {
    const live = liveEls[i]
    const dest = cloneEls[i]
    if (!(live instanceof HTMLElement) || !(dest instanceof HTMLElement)) continue
    const cs = getComputedStyle(live)
    const fg = cacheFlattenColor(cs.color, baseRgb)
    if (fg) dest.style.color = fg
    const fill = cacheFlattenColor(cs.backgroundColor, baseRgb)
    if (fill) dest.style.backgroundColor = fill
    // 逐边处理边框：零宽边显式 none，否则 html2canvas 会照着 border-style/color 画出幽灵线
    for (const side of CACHE_BORDER_SIDES) {
      if (!parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`))) {
        dest.style.setProperty(`border-${side.toLowerCase()}-style`, 'none')
        continue
      }
      const sideColor = cacheFlattenColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`), baseRgb)
      if (sideColor) dest.style.setProperty(`border-${side.toLowerCase()}-color`, sideColor)
    }
    dest.style.backgroundImage = 'none'
    dest.style.boxShadow = 'none'
    dest.style.backdropFilter = 'none'
    dest.style.setProperty('-webkit-backdrop-filter', 'none')
    // sticky 在脱离原滚动容器后会错位，导出一律按静态流排版
    if (cs.position === 'sticky') dest.style.position = 'static'
    dest.style.fontFamily = cs.fontFamily
    dest.style.fontWeight = cs.fontWeight
    dest.style.fontSize = cs.fontSize
  }

  // .surface-card 的 background 带 !important，会盖掉上面内联的压平色；导出不需要毛玻璃，
  // 直接摘掉这个类让内联实色生效（卡片边框由各自的内联 border 提供，不依赖这个类）
  clone.querySelectorAll('.surface-card').forEach(el => el.classList.remove('surface-card'))

  // 表头底色原本挂在每个 th 上（sticky 需要），导出时提到 tr：相邻单元格各自铺色时
  // html2canvas 会在分数像素边界留下 1px 缝隙，看着像多了一列竖线
  clone.querySelectorAll('thead tr').forEach(tr => {
    const firstCell = tr.querySelector('th')
    if (!(tr instanceof HTMLElement) || !(firstCell instanceof HTMLElement)) return
    const cellBg = firstCell.style.backgroundColor
    if (!cellBg) return
    tr.style.backgroundColor = cellBg
    tr.querySelectorAll('th').forEach(th => { if (th instanceof HTMLElement) th.style.backgroundColor = 'transparent' })
  })

  clone.querySelectorAll('[data-html2canvas-ignore]').forEach(el => el.remove())
  clone.querySelectorAll<HTMLElement>('[data-export-scroll]').forEach(el => {
    el.style.maxHeight = 'none'
    el.style.overflow = 'visible'
  })

  // 图表：从活节点转 PNG 再塞进克隆（html2canvas 对内联 SVG 支持不佳）
  const liveSvgs = Array.from(rootEl.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
  const cloneSvgs = Array.from(clone.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
  for (let i = 0; i < liveSvgs.length; i++) {
    const target = cloneSvgs[i]
    if (!target) continue
    try {
      const rect = liveSvgs[i].getBoundingClientRect()
      const dataUrl = await cacheSvgToPngDataUrl(liveSvgs[i])
      const img = document.createElement('img')
      img.src = dataUrl
      img.style.display = 'block'
      img.style.width = '100%'
      img.style.maxWidth = Math.max(1, Math.round(rect.width)) + 'px'
      img.style.height = 'auto'
      target.replaceWith(img)
    } catch { /* 转换失败则保留原 SVG */ }
  }

  host.appendChild(clone)
  document.body.appendChild(host)
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return await fn(clone, { bg, width })
  } finally {
    host.remove()
  }
}

function cacheBuildExportVarsCss(rootEl: HTMLElement): string {
  const cs = getComputedStyle(rootEl)
  const get = (n: string) => cs.getPropertyValue('--' + n).trim()
  const names = [
    'bg', 's1', 's2', 'border', 'borderHard', 'text', 't2', 't3',
    'accent', 'accentFg', 'accentSub', 'accentSubHard', 'primary', 'primaryFg',
    'sidebar', 'code', 'shadow', 'shadowMd', 'ok', 'okBg', 'err', 'errBg', 'warn', 'warnBg',
    'jKey', 'jStr', 'jNum', 'jBool', 'jNull', 'inputBg', 'inputBorder',
    'surface', 'surfaceStrong', 'surfaceMuted', 'surfaceEdge', 'surfaceGlow',
  ]
  return ':root{' + names.map(n => {
    const v = get(n)
    return v ? `--${n}:${v}` : ''
  }).filter(Boolean).join(';') + '}'
}

async function cacheCaptureCanvas(rootEl: HTMLElement): Promise<HTMLCanvasElement> {
  // html2canvas 1.x 无法解析 color-mix()/color() 等现代 CSS 颜色函数，用兼容 fork html2canvas-pro
  const { default: html2canvas } = await import('html2canvas-pro')
  return cacheWithExportClone(rootEl, (clone, { bg }) => html2canvas(clone, {
    backgroundColor: bg,
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
  }))
}

async function cacheExportAsImage(rootEl: HTMLElement, filename: string) {
  try {
    const canvas = await cacheCaptureCanvas(rootEl)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('toBlob 返回空')
    cacheDownloadBlob(filename, blob)
  } catch {
    window.alert('导出图片失败，请改用 JSON 导出获取完整数据。')
  }
}

async function cacheExportAsPdf(rootEl: HTMLElement, filename: string) {
  try {
    const { jsPDF } = await import('jspdf')
    const canvas = await cacheCaptureCanvas(rootEl)
    const pxToMm = (px: number) => px * 0.264583
    const w = pxToMm(canvas.width), h = pxToMm(canvas.height)
    const doc = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'mm', format: [w, h] })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    doc.save(filename)
  } catch {
    window.alert('导出 PDF 失败，请改用 JSON 导出获取完整数据。')
  }
}

async function cacheExportAsHtml(rootEl: HTMLElement, filename: string) {
  try {
    await cacheWithExportClone(rootEl, async (clone, { bg, width }) => {
      let appCss = ''
      for (const sheet of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sheet.cssRules)) appCss += rule.cssText + '\n' } catch { /* 跨域表跳过 */ }
      }
      // 覆盖样式必须排在 appCss 之后：应用样式里的 body{overflow:hidden;height:100%} 会让离线报告无法滚动
      const overrideCss = `
html,body{height:auto!important;min-height:0!important;overflow:visible!important;margin:0!important}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-size-adjust:100%}
body{
  padding:clamp(28px,6vw,72px) clamp(20px,5vw,56px) clamp(48px,8vw,96px);
  background:${bg};
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;
}
[data-cache-export-root]{width:100%!important;max-width:${width}px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
[data-cache-export-root]>*{margin-top:0!important}
[data-cache-export-root] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;animation:none!important;transition:none!important}
[data-cache-export-root] .surface-card::before,[data-cache-export-root] .surface-card::after{display:none!important}
[data-cache-export-root] img{max-width:100%;height:auto}
[data-cache-export-root] [data-export-scroll]{max-height:none!important;overflow:visible!important}
@media print{
  body{padding:0;background:#fff}
  [data-cache-export-root]{max-width:none;gap:16px}
  [data-cache-export-root]>*{break-inside:avoid}
}
`
      const varsCss = cacheBuildExportVarsCss(rootEl)
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LLM 缓存命中率测试报告</title><style>${appCss}\n${varsCss}\n${overrideCss}</style></head><body>${clone.outerHTML}</body></html>`
      cacheDownload(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch {
    window.alert('导出 HTML 失败，请改用 JSON 导出获取完整数据。')
  }
}

// ── 展示用小组件 ──

function CacheCodeBlock({ title, children, maxH = 320 }: { title: string; children: string; maxH?: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-bold" style={{ color: 'var(--t3)' }}>{title}</div>
      <pre data-export-scroll className="overflow-auto rounded-xl p-3 font-mono text-[11px] leading-5" style={{ background: 'var(--code)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: maxH, fontFamily: CACHE_MONO }}>
        <code dangerouslySetInnerHTML={{ __html: highlightJson(children ?? '') || ' ' }} />
      </pre>
    </div>
  )
}

/** 每轮明细表列定义：数值列右对齐，便于纵向扫读 */
const CACHE_ROUND_COLUMNS: { key: string; numeric?: boolean }[] = [
  { key: '轮次' }, { key: '判定' }, { key: 'HTTP', numeric: true },
  { key: '总输入', numeric: true }, { key: '缓存读', numeric: true }, { key: '缓存写', numeric: true },
  { key: '未缓存', numeric: true }, { key: '输出', numeric: true }, { key: '耗时', numeric: true },
]

function CacheHitBadge({ round }: { round: CacheRound }) {
  if (round.status === 'error') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--errBg)', color: 'var(--err)' }}>失败</span>
  if (round.warmup) {
    return round.hit
      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--okBg)', color: 'var(--ok)' }}>预热已命中</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--s2)', color: 'var(--t2)' }}>预热</span>
  }
  return round.hit
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--okBg)', color: 'var(--ok)' }}>命中</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>未命中</span>
}

function CacheStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
      {/* 小字加正向 tracking、大字收紧 tracking：字号相关的字距处理 */}
      <div className="text-[11px] font-medium" style={{ color: 'var(--t3)', letterSpacing: '0.03em' }}>{label}</div>
      <div className="font-mono text-[22px] font-bold tabular-nums mt-1.5" style={{ color: color ?? 'var(--text)', fontFamily: CACHE_MONO, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {sub && <div className="text-[11px] mt-1.5 leading-[1.45]" style={{ color: 'var(--t3)' }}>{sub}</div>}
    </div>
  )
}

const LazyCacheRoundsChart = React.lazy(() => import('./CacheHitCharts').then(m => ({ default: m.CacheRoundsChart })))
function CacheChartSkeleton() {
  return (
    <div role="status" aria-label="正在载入图表" aria-busy="true" style={{ height: 268 }}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>每轮输入 Token 构成</div>
      <div className="text-xs mt-2" style={{ color: 'var(--t3)' }}>图表载入中…</div>
    </div>
  )
}
function CacheRoundsChartLazy(props: { result: CacheProtocolResult }) {
  return <Suspense fallback={<CacheChartSkeleton />}><LazyCacheRoundsChart {...props} /></Suspense>
}

// ─── Panes ────────────────────────────────────────────────────────────────────

type CacheChFormState = { name: string; baseUrl: string; timeoutSec: string; chatUrl: string; responsesUrl: string; anthropicUrl: string; apiKey: string }
const CACHE_EMPTY_CH_FORM: CacheChFormState = { name: '', baseUrl: '', timeoutSec: '60', chatUrl: '', responsesUrl: '', anthropicUrl: '', apiKey: '' }

const CacheConfigPane = React.memo(function CacheConfigPane({
  channels, activeChId, onActiveChId, model, onModel,
  formats, onToggleFormat, prefixTokens, onPrefixTokens, rounds, onRounds,
  running, startErr,
}: {
  channels: CacheChannel[]; activeChId: string | null; onActiveChId: (v: string) => void
  model: string; onModel: (v: string) => void
  formats: Record<CacheFormat, boolean>; onToggleFormat: (f: CacheFormat) => void
  prefixTokens: string; onPrefixTokens: (v: string) => void
  rounds: string; onRounds: (v: string) => void
  running: boolean; startErr: string
}) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
      <div>
        <Label className="block mb-1.5">使用渠道</Label>
        <CustomSelect value={activeChId ?? ''} onChange={onActiveChId}
          options={channels.map(c => ({ value: c.id, label: c.name }))} />
        {channels.length === 0 && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请先到「渠道管理」添加渠道。</p>}
      </div>
      <div>
        <Label className="block mb-1.5">模型名称</Label>
        <CustomInput value={model} onChange={onModel} placeholder="gpt-4o-mini / claude-sonnet-4-5" />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <Label className="block mb-2">测试协议</Label>
        <div className="space-y-2">
          {CACHE_FORMATS.map(f => {
            const checked = formats[f]
            return (
              <label key={f}
                className={`probe-format-card${checked ? ' is-checked' : ''}${running ? ' is-disabled' : ''}`}
                style={{ background: checked ? undefined : 'var(--bg)', opacity: running ? 0.55 : 1 }}
                title={`${CACHE_FORMAT_LABELS[f]} · ${CACHE_ENDPOINTS[f]}`}>
                <input type="checkbox" data-format={f} checked={checked} disabled={running} onChange={() => onToggleFormat(f)}
                  aria-label={`选择 ${CACHE_FORMAT_LABELS[f]}`} className="probe-format-input" />
                <div className="flex items-center justify-between gap-2">
                  <span className="probe-format-chip" style={{ fontFamily: CACHE_MONO }}>{f}</span>
                  <span className={`probe-format-check${checked ? ' is-on' : ''}`} aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1.5 5.2 4 7.7 8.5 2.5" />
                    </svg>
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{CACHE_FORMAT_LABELS[f]}</div>
                <div className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: CACHE_MONO }}>{CACHE_ENDPOINTS[f]}</div>
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <Label className="block mb-1.5">前缀目标 Token 数</Label>
        <CustomInput value={prefixTokens} onChange={onPrefixTokens} type="number" placeholder="2048" />
        <p className="text-[11px] mt-1 leading-4" style={{ color: 'var(--t3)' }}>OpenAI 自动缓存要求前缀 &gt; 1024 token，建议 ≥ 2048（按 ~4 字符/token 估算生成）。</p>
        <div className="mt-2.5">
          <Label className="block mb-1.5">测量轮数（不含预热）</Label>
          <CustomInput value={rounds} onChange={onRounds} type="number" placeholder="5" />
        </div>
      </div>

      {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
    </div>
  )
})

const CacheChannelsPane = React.memo(function CacheChannelsPane({
  chNotice, channels, activeChId, chForm, editingChId,
  onSetActive, onEdit, onDelete, onSave, onChFormChange, onClearForm,
}: {
  chNotice: string; channels: CacheChannel[]; activeChId: string | null
  chForm: CacheChFormState; editingChId: string | null
  onSetActive: (id: string) => void; onEdit: (c: CacheChannel) => void; onDelete: (id: string) => void
  onSave: () => void; onChFormChange: React.Dispatch<React.SetStateAction<CacheChFormState>>; onClearForm: () => void
}) {
  return (
    <div className="p-5 flex flex-col gap-4">
      {chNotice && <p className="text-xs" style={{ color: 'var(--accent)' }}>{chNotice}</p>}
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
          已保存的渠道 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{channels.length}</span>
        </p>
        {channels.length === 0 && <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>还没有渠道，请在下方添加。</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {channels.map(c => (
            <div key={c.id} className="rounded-2xl p-4 relative" style={{ border: `1px solid ${c.id === activeChId ? 'var(--accent)' : 'var(--border)'}`, background: c.id === activeChId ? 'var(--accentSub)' : 'var(--s1)' }}>
              {c.id === activeChId && <span className="absolute top-3 right-4 text-[11px] font-bold" style={{ color: 'var(--accent)' }}>✓ 当前使用</span>}
              <div className="text-sm font-bold pr-16 truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
              <div className="text-xs break-all mt-1" style={{ color: 'var(--t3)' }}>{c.baseUrl}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>超时 {c.timeoutSec}s</div>
              {(c.chatUrl || c.responsesUrl || c.anthropicUrl) && (
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                  已独立配置：{[c.chatUrl && 'Chat', c.responsesUrl && 'Responses', c.anthropicUrl && 'Anthropic'].filter(Boolean).join(' / ')}
                </div>
              )}
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--t3)' }}>{c.keyMask || '（未设置）'}</div>
              <div className="flex gap-2 mt-3">
                <Btn small variant="soft" onClick={() => onSetActive(c.id)}>设为当前</Btn>
                <Btn small variant="soft" onClick={() => onEdit(c)}>编辑</Btn>
                <Btn small variant="danger" onClick={() => onDelete(c.id)}>删除</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{editingChId ? '编辑渠道' : '添加新渠道'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="block mb-1.5">渠道名称</Label>
            <CustomInput value={chForm.name} onChange={v => onChFormChange(f => ({ ...f, name: v }))} placeholder="例如：主线-OpenAI 兼容网关" />
          </div>
          <div>
            <Label className="block mb-1.5">Base URL</Label>
            <CustomInput value={chForm.baseUrl} onChange={v => onChFormChange(f => ({ ...f, baseUrl: v }))} placeholder="https://api.openai.com" mono />
          </div>
          <div>
            <Label className="block mb-1.5">请求超时（秒）</Label>
            <CustomInput value={chForm.timeoutSec} onChange={v => onChFormChange(f => ({ ...f, timeoutSec: v }))} type="number" placeholder="60" />
          </div>
          <div>
            <Label className="block mb-1.5">apiKey {editingChId ? '（留空保持不变，本地加密存储）' : ''}</Label>
            <CustomInput value={chForm.apiKey} onChange={v => onChFormChange(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" mono />
          </div>
        </div>
        <div className="mt-3">
          <Label className="block mb-1.5">三种协议独立接入地址（可选，留空则回退默认）</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CustomInput value={chForm.chatUrl} onChange={v => onChFormChange(f => ({ ...f, chatUrl: v }))} placeholder="Chat Completions Base URL" mono />
            <CustomInput value={chForm.responsesUrl} onChange={v => onChFormChange(f => ({ ...f, responsesUrl: v }))} placeholder="Responses Base URL" mono />
            <CustomInput value={chForm.anthropicUrl} onChange={v => onChFormChange(f => ({ ...f, anthropicUrl: v }))} placeholder="Anthropic Base URL" mono />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Btn variant="primary" onClick={onSave}>保存渠道</Btn>
          <Btn variant="soft" onClick={onClearForm}>清空表单</Btn>
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>渠道信息保存在本浏览器 IndexedDB 中（apiKey 经 AES-GCM 加密）。</span>
        </div>
      </Card>
    </div>
  )
})

// ── 报告视图（导出捕获的根节点）──
function CacheReportView({ report, reportRef }: { report: CacheReport; reportRef: React.RefObject<HTMLDivElement | null> }) {
  const exporting = useRef(false)
  const [exportKind, setExportKind] = useState<'png' | 'pdf' | 'html' | 'json' | null>(null)
  const runExport = async (kind: 'png' | 'pdf' | 'html' | 'json') => {
    const root = reportRef.current
    if (!root || exporting.current) return
    exporting.current = true
    setExportKind(kind)
    try {
      const base = cacheSafeName(report.name) || 'cache-hit-report'
      if (kind === 'json') cacheDownload(`${base}.json`, JSON.stringify(report, null, 2), 'application/json')
      else if (kind === 'png') await cacheExportAsImage(root, `${base}.png`)
      else if (kind === 'pdf') await cacheExportAsPdf(root, `${base}.pdf`)
      else await cacheExportAsHtml(root, `${base}.html`)
    } finally {
      exporting.current = false
      setExportKind(null)
    }
  }
  const busy = exportKind != null
  return (
    <div className="flex flex-col">
      {/* 导出动作留在报告文档之外：报告本身保持「一张干净的文档」 */}
      <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <Btn small variant="soft" disabled={busy} onClick={() => runExport('png')}>导出 PNG</Btn>
        <Btn small variant="soft" disabled={busy} onClick={() => runExport('pdf')}>导出 PDF</Btn>
        <Btn small variant="soft" disabled={busy} onClick={() => runExport('html')}>导出 HTML</Btn>
        <Btn small variant="ghost" disabled={busy} onClick={() => runExport('json')}>导出 JSON</Btn>
        <span className="text-[11px] ml-1 truncate" style={{ color: busy ? 'var(--accent)' : 'var(--t3)' }}>
          {busy ? '正在生成，请稍候…' : '导出不含明文密钥'}
        </span>
      </div>

      <div className="px-6 pt-6 pb-10 flex justify-center">
        {/* 不铺实色底：铺了会把应用的渐变底纹压成一块死板灰底，卡片也就失去悬浮感。
            导出不受影响——克隆容器自己按 `--bg` 铺底（`cacheWithExportClone`） */}
        <div ref={reportRef} className="w-full max-w-[1120px]" style={{ color: 'var(--text)' }}>
        {/* 报告头 */}
        <div className="surface-card rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}>缓存命中率测试报告</div>
              {/* 大字收紧字距、压紧行距；正文字距留 0 */}
              <h3 className="text-[26px] font-bold mt-2.5" style={{ color: 'var(--text)', letterSpacing: '-0.021em', lineHeight: 1.15 }}>{report.name}</h3>
              <p className="text-sm mt-3 leading-[1.55]" style={{ color: 'var(--t2)' }}>
                {report.target.channelName ? `${report.target.channelName} · ` : ''}{report.target.baseUrl} · {report.target.model}
                {report.target.keyMask ? ` · ${report.target.keyMask}` : ''}
              </p>
              <p className="text-[11px] mt-2 font-mono" style={{ color: 'var(--t3)', fontFamily: CACHE_MONO, letterSpacing: '0.01em' }}>
                前缀 ≈{report.params.prefixTokens} token · 预热 1 + 测量 {report.params.rounds}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[30px] font-bold tabular-nums" style={{ color: 'var(--text)', fontFamily: CACHE_MONO, letterSpacing: '-0.025em', lineHeight: 1.1 }}>{(report.durationMs / 1000).toFixed(1)}s</div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>{new Date(report.completedAt).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* 每协议结果 */}
        {report.results.map(r => {
          const verdict = cacheVerdictOf(r)
          const toneStyle = verdict.tone === 'ok' ? { background: 'var(--okBg)', color: 'var(--ok)' }
            : verdict.tone === 'warn' ? { background: 'var(--warnBg)', color: 'var(--warn)' }
            : { background: 'var(--errBg)', color: 'var(--err)' }
          const latencySub = r.warmupMs != null && r.hitAvgMs != null
            ? `预热 ${r.warmupMs} → 命中 ${r.hitAvgMs} ms`
            : undefined
          return (
            <div key={r.format} data-format-report={r.format} className="surface-card rounded-2xl px-7 py-6 mt-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              {/* 结论跟标题同排：省掉一条大面积色块，结论仍在第一眼位置 */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <h4 className="text-[17px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.012em' }}>{CACHE_FORMAT_LABELS[r.format]}</h4>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold" style={toneStyle}>{verdict.text}</span>
                {r.promptCacheKeyDropped && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>已去掉 prompt_cache_key</span>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
                <CacheStat label="请求级命中率" value={cachePct(r.hitRate)} sub={`${r.hitCount}/${r.measured} 轮${r.failedRounds ? ` · 失败 ${r.failedRounds}` : ''}`}
                  color={r.hitRate == null ? undefined : r.hitRate >= 1 ? 'var(--ok)' : r.hitRate > 0 ? 'var(--warn)' : 'var(--err)'} />
                <CacheStat label="Token 覆盖率" value={cachePct(r.coverage)} />
                <CacheStat label="节省 Token" value={String(r.savedTokens)} />
                <CacheStat label="缓存写入" value={r.cacheWriteTokens > 0 ? String(r.cacheWriteTokens) : '—'} />
                <CacheStat label="命中均延迟" value={r.hitAvgMs != null ? `${r.hitAvgMs} ms` : '—'} sub={latencySub} />
              </div>

              {/* 每轮明细表：表头 sticky 吸在报告滚动容器顶部——所以这里不能包滚动容器（overflow 非
                  visible 会让 sticky 只相对该容器生效，等于失效）；border-separate 才能让 sticky 稳定生效 */}
              <div className="mt-6">
                <table className="w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {CACHE_ROUND_COLUMNS.map(col => (
                        <th key={col.key} className="px-4 py-2.5 font-semibold whitespace-nowrap"
                          style={{ color: 'var(--t2)', textAlign: col.numeric ? 'right' : 'left', fontSize: 11, letterSpacing: '0.05em', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1, background: 'var(--inputBg)' }}>{col.key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rounds.map((rd, idx) => {
                      const uncached = rd.usage.totalPrompt != null ? Math.max(0, rd.usage.totalPrompt - (rd.usage.cacheRead ?? 0) - (rd.usage.cacheWrite ?? 0)) : null
                      const cell = (v: number | null) => (v == null ? '—' : String(v))
                      // 末行不画分隔线，避免与容器圆角边框叠成双线
                      const line = idx === r.rounds.length - 1 ? 'none' : '1px solid var(--border)'
                      const num = { fontFamily: CACHE_MONO, borderBottom: line }
                      // 语义色只留给真正有量的数字，0 与「—」保持中性，避免读成告警
                      const tone = (v: number | null, on: string) => (v ? on : 'var(--t3)')
                      return (
                        <tr key={rd.round}>
                          <td className="px-4 py-3 font-mono" style={{ color: 'var(--text)', ...num }}>{rd.warmup ? '预热' : `#${rd.round}`}</td>
                          <td className="px-4 py-3" style={{ borderBottom: line }}><CacheHitBadge round={rd} /></td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: rd.status === 'ok' ? 'var(--t2)' : 'var(--err)', ...num }}>{rd.httpStatus ?? 'ERR'}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--text)', ...num }}>{cell(rd.usage.totalPrompt)}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: tone(rd.usage.cacheRead, 'var(--ok)'), ...num }}>{cell(rd.usage.cacheRead)}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: tone(rd.usage.cacheWrite, 'var(--warn)'), ...num }}>{cell(rd.usage.cacheWrite)}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--t2)', ...num }}>{cell(uncached)}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--t2)', ...num }}>{cell(rd.usage.output)}</td>
                          <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--t2)', ...num }}>{rd.durationMs != null ? `${rd.durationMs} ms` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {r.rounds.some(rd => rd.status === 'error') && (
                <div className="mt-3 space-y-1.5">
                  {r.rounds.filter(rd => rd.status === 'error').map(rd => (
                    <p key={rd.round} className="text-xs leading-[1.5]" style={{ color: 'var(--err)' }}>{rd.warmup ? '预热' : `#${rd.round}`} 失败：{rd.error}</p>
                  ))}
                </div>
              )}

              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                <CacheRoundsChartLazy result={r} />
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

function CacheHitTool() {
  const cfg0 = loadCacheCfg()
  const [model, setModel] = useState(cfg0.model ?? '')
  const [formats, setFormats] = useState<Record<CacheFormat, boolean>>({
    chat: cfg0.formats?.chat !== false,
    responses: cfg0.formats?.responses !== false,
    anthropic: cfg0.formats?.anthropic !== false,
  })
  const [prefixTokens, setPrefixTokens] = useState(cfg0.prefixTokens ?? '2048')
  const [rounds, setRounds] = useState(cfg0.rounds ?? '5')

  const [channels, setChannels] = useState<CacheChannel[]>(() => loadCacheChannels())
  const [activeChId, setActiveChId] = useState<string | null>(() => loadCacheActiveChId())
  const [chForm, setChForm] = useState<CacheChFormState>(CACHE_EMPTY_CH_FORM)
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [chNotice, setChNotice] = useState('')
  const activeChannel = channels.find(c => c.id === activeChId) ?? null

  useDebouncedPersist(() => {
    saveCacheCfg({ model, formats, prefixTokens, rounds })
  }, [model, formats, prefixTokens, rounds])
  useEffect(() => { saveCacheChannels(channels) }, [channels])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (activeChId) kvSet(CACHE_ACTIVE_CH_KEY, activeChId)
      else kvRemove(CACHE_ACTIVE_CH_KEY)
    } catch { /* ignore */ }
  }, [activeChId])

  const chNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chToast = (m: string) => {
    setChNotice(m)
    if (chNoticeTimer.current) clearTimeout(chNoticeTimer.current)
    chNoticeTimer.current = setTimeout(() => { chNoticeTimer.current = null; setChNotice('') }, 2200)
  }
  useEffect(() => () => { if (chNoticeTimer.current) clearTimeout(chNoticeTimer.current) }, [])

  const saveChannel = useCallback(async () => {
    const name = chForm.name.trim()
    const base = chForm.baseUrl.trim().replace(/\/+$/, '')
    const timeoutSecVal = chForm.timeoutSec.trim() || '60'
    const key = chForm.apiKey.trim()
    if (!name || !base) { chToast('请填写渠道名称与 baseUrl'); return }
    let apiKeyEnc = ''
    let keyMask = ''
    if (key) {
      const enc = await encryptLlmApiKey(key)
      if (!enc) { chToast('加密失败，请重试'); return }
      apiKeyEnc = enc
      keyMask = key.slice(0, 8) + '••••' + key.slice(-4)
    }
    if (editingChId) {
      const target = channels.find(c => c.id === editingChId)
      if (!target) return
      const nc: CacheChannel = { ...target, name, baseUrl: base, timeoutSec: timeoutSecVal, chatUrl: chForm.chatUrl.trim(), responsesUrl: chForm.responsesUrl.trim(), anthropicUrl: chForm.anthropicUrl.trim() }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(c => c.id === editingChId ? nc : c))
    } else {
      if (!apiKeyEnc) { chToast('请填写 apiKey'); return }
      const nc: CacheChannel = {
        id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, baseUrl: base, timeoutSec: timeoutSecVal,
        chatUrl: chForm.chatUrl.trim(), responsesUrl: chForm.responsesUrl.trim(), anthropicUrl: chForm.anthropicUrl.trim(), apiKeyEnc, keyMask,
      }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm(CACHE_EMPTY_CH_FORM)
    setEditingChId(null)
    chToast('已保存')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chForm, editingChId, channels, activeChId])

  const editChannel = useCallback((c: CacheChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, timeoutSec: c.timeoutSec, chatUrl: c.chatUrl, responsesUrl: c.responsesUrl, anthropicUrl: c.anthropicUrl, apiKey: '' })
    setEditingChId(c.id)
  }, [])
  const delChannel = useCallback((id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(prev => prev.filter(c => c.id !== id))
    setActiveChId(prev => (prev === id ? null : prev))
  }, [])
  const clearChForm = useCallback(() => {
    setChForm(CACHE_EMPTY_CH_FORM)
    setEditingChId(null)
  }, [])
  const toggleFormat = useCallback((f: CacheFormat) => {
    setFormats(prev => ({ ...prev, [f]: !prev[f] }))
  }, [])

  // ── 运行状态 ──
  const [pane, setPane] = useState<'live' | 'logs' | 'report' | 'history' | 'channels'>('live')
  const [running, setRunning] = useState(false)
  const [nameModal, setNameModal] = useState(false)
  const [testName, setTestName] = useState('')
  const [report, setReport] = useState<CacheReport | null>(null)
  const [history, setHistory] = useState<CacheReport[]>([])
  const [logs, setLogs] = useState<CacheLog[]>([])
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const [liveResults, setLiveResults] = useState<Partial<Record<CacheFormat, CacheProtocolResult>>>({})
  const [progress, setProgress] = useState<{ done: number; total: number; label: string }>({ done: 0, total: 0, label: '' })
  const [startErr, setStartErr] = useState('')

  const logsRef = useRef<CacheLog[]>([])
  const stopRef = useRef(false)
  const activeAbortRef = useRef<AbortController | null>(null)
  const reportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCacheHistory().then(list => { if (!cancelled) setHistory(list) })
    return () => { cancelled = true }
  }, [])

  const pushLog = (log: CacheLog) => {
    logsRef.current.push(log)
    setLogs([...logsRef.current])
  }

  // 单次请求：非流式，超时用渠道配置的 AbortController
  const cacheRequest = async (cfg: CacheCfg, format: CacheFormat, label: string, body: Record<string, any>): Promise<{ ok: boolean; status: number; data: any; durationMs: number }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    if (format === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    } else {
      headers.Authorization = `Bearer ${cfg.apiKey}`
    }
    const log: CacheLog = {
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      format, label, url: cfg.urlOf[format],
      status: null, statusText: '', duration: 0, time: new Date().toISOString(),
      requestHeaders: cacheMaskHeaders(headers), requestBody: cacheTruncateDeep(body), responseBody: null,
      usage: cacheEmptyUsage(),
    }
    const controller = new AbortController()
    activeAbortRef.current = controller
    const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), cfg.timeoutMs)
    const started = performance.now()
    try {
      const res = await fetch(cfg.urlOf[format], { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      log.status = res.status
      log.statusText = res.statusText
      const raw = await res.text()
      let data: any
      try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
      log.responseBody = cacheTruncateDeep(data)
      log.duration = Math.round(performance.now() - started)
      log.usage = cacheUsageOf(format, data)
      pushLog(log)
      return { ok: res.ok, status: res.status, data, durationMs: log.duration }
    } catch (err: any) {
      log.status = log.status ?? 0
      log.statusText = log.statusText || 'Network Error'
      log.duration = Math.round(performance.now() - started)
      const msg = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? '请求超时或已中止'
        : err instanceof TypeError ? '网络错误或 CORS 被拦截' : String(err?.message || err)
      log.responseBody = { error: msg }
      pushLog(log)
      throw new Error(msg)
    } finally {
      clearTimeout(timer)
      if (activeAbortRef.current === controller) activeAbortRef.current = null
    }
  }

  // ── 单协议命中率闭环：预热 + 顺序 N 轮 ──
  const runFormatTest = async (
    cfg: CacheCfg, format: CacheFormat, prefix: string, nonce: string, measureRounds: number,
    onRound: (partial: CacheProtocolResult) => void,
  ): Promise<CacheProtocolResult> => {
    const roundsArr: CacheRound[] = []
    let useCacheKey = format !== 'anthropic'
    let cacheKeyDropped = false
    const promptCacheKey = `cache-hit-test-${nonce}`

    const snapshot = (status: CacheProtocolResult['status'], error?: string): CacheProtocolResult => ({
      format, status, error, rounds: [...roundsArr], promptCacheKeyDropped: cacheKeyDropped || undefined,
      ...cacheComputeMetrics(roundsArr),
    })

    const doRound = async (round: number): Promise<CacheRound> => {
      const warmup = round === 0
      const label = `${CACHE_FORMAT_LABELS[format]} · ${warmup ? '预热' : `第 ${round} 轮`}`
      const body = cacheBodyOf(format, cfg.model, prefix, cacheSuffixOf(round), promptCacheKey, useCacheKey)
      try {
        let r = await cacheRequest(cfg, format, label, body)
        // 部分网关会拒绝 prompt_cache_key 参数：去掉后重试一次，并在后续轮次保持去掉
        if (!r.ok && useCacheKey && /prompt_cache_key/i.test(cacheExtractError(r.data))) {
          useCacheKey = false
          cacheKeyDropped = true
          const retryBody = cacheBodyOf(format, cfg.model, prefix, cacheSuffixOf(round), promptCacheKey, false)
          r = await cacheRequest(cfg, format, label + '（去掉 prompt_cache_key 重试）', retryBody)
        }
        const usage = cacheUsageOf(format, r.data)
        if (!r.ok) {
          return { round, warmup, status: 'error', httpStatus: r.status, durationMs: r.durationMs, usage, hit: false, error: cacheExtractError(r.data) }
        }
        return { round, warmup, status: 'ok', httpStatus: r.status, durationMs: r.durationMs, usage, hit: (usage.cacheRead ?? 0) > 0 }
      } catch (e: any) {
        return { round, warmup, status: 'error', httpStatus: null, durationMs: null, usage: cacheEmptyUsage(), hit: false, error: e?.message || String(e) }
      }
    }

    // 第 0 轮：预热写缓存。失败则该协议终止（后续轮次没有测量意义）。
    setProgress(p => ({ ...p, label: `${CACHE_FORMAT_LABELS[format]}：预热写缓存` }))
    const warmupRound = await doRound(0)
    roundsArr.push(warmupRound)
    onRound(snapshot('ok'))
    if (warmupRound.status === 'error') return snapshot('error', warmupRound.error)

    // 顺序执行 N 轮测量（顺序而非并发：缓存写入需在首个响应后才可用，并发会全部 miss）
    for (let i = 1; i <= measureRounds; i++) {
      if (stopRef.current) return snapshot('stopped')
      setProgress(p => ({ ...p, label: `${CACHE_FORMAT_LABELS[format]}：测量第 ${i}/${measureRounds} 轮` }))
      const rd = await doRound(i)
      roundsArr.push(rd)
      onRound(snapshot('ok'))
    }
    return snapshot('ok')
  }

  const runTest = async (name: string) => {
    const ch = activeChannel
    const errs: string[] = []
    if (!ch) errs.push('请先在「渠道管理」添加并选择一个渠道。')
    if (!model.trim()) errs.push('模型名称不能为空。')
    const activeFormats = CACHE_FORMATS.filter(f => formats[f])
    if (!activeFormats.length) errs.push('请至少勾选一个测试协议。')
    const measureRounds = Math.max(1, Math.min(20, Math.round(Number(rounds)) || 5))
    const prefixTok = Math.max(256, Math.min(32000, Math.round(Number(prefixTokens)) || 2048))
    const cfg = ch ? await cacheBuildCfgFromChannel(ch, model.trim()) : null
    if (ch && cfg && !cfg.apiKey.trim()) errs.push('渠道 API Key 解密失败，请重新编辑渠道并保存。')
    if (errs.length) { setStartErr(errs.join('\n')); return }
    setStartErr('')

    stopRef.current = false
    logsRef.current = []
    setLogs([])
    setOpenLogs({})
    setReport(null)
    setLiveResults({})
    setRunning(true)
    setPane('live')

    const totalRounds = activeFormats.length * (measureRounds + 1)
    let done = 0
    setProgress({ done: 0, total: totalRounds, label: '准备测试' })

    const nonce = cacheMakeNonce()
    const startedAt = new Date().toISOString()
    const startMs = Date.now()
    const results: CacheProtocolResult[] = []
    try {
      for (const f of activeFormats) {
        if (stopRef.current) break
        // 每个协议用独立 nonce 后缀，避免协议之间的前缀在网关侧意外互相影响
        const prefix = cacheBuildPrefix(`${nonce}-${f}`, prefixTok)
        const out = await runFormatTest(cfg!, f, prefix, `${nonce}-${f}`, measureRounds, partial => {
          done++
          setProgress(p => ({ ...p, done: Math.min(done, totalRounds) }))
          setLiveResults(prev => ({ ...prev, [f]: partial }))
        })
        results.push(out)
        setLiveResults(prev => ({ ...prev, [f]: out }))
      }
      // 未执行到的协议（手动停止）标记为 stopped
      for (const f of activeFormats) {
        if (!results.some(r => r.format === f)) {
          results.push({ format: f, status: 'stopped', rounds: [], ...cacheComputeMetrics([]) })
        }
      }
    } finally {
      const rep: CacheReport = {
        id: 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
        target: { baseUrl: cfg!.baseUrl, model: cfg!.model, channelName: ch?.name, keyMask: ch?.keyMask },
        params: { prefixTokens: prefixTok, rounds: measureRounds, nonce },
        results,
      }
      setReport(rep)
      try { setHistory(await saveCacheHistory(rep)) } catch { /* IndexedDB 不可用时仅当前会话可见 */ }
      setRunning(false)
      setProgress(p => ({ ...p, done: p.total, label: '测试完成' }))
      setPane('report')
    }
  }

  useEffect(() => {
    if (!nameModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNameModal(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nameModal])

  const uiActiveFormats = CACHE_FORMATS.filter(f => formats[f])
  const canStart = !!activeChannel && !!model.trim() && uiActiveFormats.length > 0
  const liveIdle = !running && progress.total === 0

  const renderLogRow = (log: CacheLog) => {
    const open = !!openLogs[log.id]
    const ok = log.status != null && log.status >= 200 && log.status < 300
    const chip = (v: number | null) => (v == null ? '—' : String(v))
    return (
      <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setOpenLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
          onPointerEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--s1)' }}
          onPointerLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{log.label}</span>
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px] flex-shrink-0" style={{ background: ok ? 'var(--okBg)' : 'var(--errBg)', color: ok ? 'var(--ok)' : 'var(--err)', fontFamily: CACHE_MONO }}>{log.status ?? 'ERR'}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: CACHE_MONO }}>POST {log.url}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--s2)', color: 'var(--t2)', fontFamily: CACHE_MONO }}>
              ↑{chip(log.usage.totalPrompt)} ↓{chip(log.usage.output)} 缓存读{chip(log.usage.cacheRead)} 写{chip(log.usage.cacheWrite)}
            </span>
            <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--t2)', fontFamily: CACHE_MONO }}>{log.duration} ms</span>
            <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{new Date(log.time).toLocaleTimeString()}</span>
          </div>
        </div>
        {open && (
          <div className="px-4 pb-5 lg:px-8" style={{ background: 'var(--s1)' }}>
            <div className="grid gap-4 pt-4 xl:grid-cols-2">
              <CacheCodeBlock title="请求头（密钥已脱敏）" children={cacheJsonPretty(log.requestHeaders)} />
              <CacheCodeBlock title="请求体（长前缀已截断）" children={cacheJsonPretty(log.requestBody)} />
              <CacheCodeBlock title="响应体" children={typeof log.responseBody === 'string' ? log.responseBody : cacheJsonPretty(log.responseBody)} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>缓存命中率测试</SectionTitle>
        <div className="ml-auto flex gap-2">
          {running ? (
            <Btn variant="danger" onClick={() => { stopRef.current = true; activeAbortRef.current?.abort() }}>⏹ 停止</Btn>
          ) : (
            <Btn variant="primary" onClick={() => { setTestName(cacheNowName()); setNameModal(true) }} disabled={!canStart}>▶ 开始测试</Btn>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <CacheConfigPane
          channels={channels} activeChId={activeChId} onActiveChId={setActiveChId}
          model={model} onModel={setModel}
          formats={formats} onToggleFormat={toggleFormat}
          prefixTokens={prefixTokens} onPrefixTokens={setPrefixTokens}
          rounds={rounds} onRounds={setRounds}
          running={running} startErr={startErr}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane} onChange={v => setPane(v as typeof pane)} options={[
              { value: 'live', label: '实时进度' },
              { value: 'logs', label: `请求日志 (${logs.length})` },
              { value: 'report', label: '测试报告' },
              { value: 'history', label: `历史 (${history.length})` },
              { value: 'channels', label: `渠道管理 (${channels.length})` },
            ]} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {pane === 'live' && (
              <div className="p-6">
                {progress.total > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>{progress.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: 'var(--t2)' }}>{progress.done} / {progress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: progress.total ? (progress.done / progress.total * 100) + '%' : 0 }} />
                    </div>
                  </div>
                )}
                {uiActiveFormats.length === 0 && (
                  <p className="text-xs mb-4" style={{ color: 'var(--warn)' }}>至少勾选一个测试协议才能开始。</p>
                )}
                {/* 还没跑过时只留说明卡，不摆一排「待执行」空卡片（左侧已经列了勾选的协议） */}
                <div className={liveIdle ? 'hidden' : 'space-y-4'}>
                  {uiActiveFormats.map(f => {
                    const r = liveResults[f]
                    return (
                      <Card key={f}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{CACHE_FORMAT_LABELS[f]}</span>
                          {r ? (
                            <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--t2)', fontFamily: CACHE_MONO }}>
                              命中 {r.hitCount}/{r.measured}{r.failedRounds ? ` · 失败 ${r.failedRounds}` : ''} · 覆盖率 {cachePct(r.coverage)}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--t3)' }}>{running ? '排队中…' : '待执行'}</span>
                          )}
                        </div>
                        {r && r.rounds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {r.rounds.map(rd => (
                              <span key={rd.round} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[11px]" style={{
                                fontFamily: CACHE_MONO,
                                background: rd.status === 'error' ? 'var(--errBg)' : rd.warmup ? 'var(--s2)' : rd.hit ? 'var(--okBg)' : 'var(--warnBg)',
                                color: rd.status === 'error' ? 'var(--err)' : rd.warmup ? 'var(--t2)' : rd.hit ? 'var(--ok)' : 'var(--warn)',
                              }}>
                                {rd.warmup ? '预热' : `#${rd.round}`} {rd.status === 'error' ? '✗' : rd.hit ? `读${rd.usage.cacheRead}` : '未命中'}
                              </span>
                            ))}
                          </div>
                        )}
                        {r?.status === 'error' && <p className="text-xs mt-2" style={{ color: 'var(--err)' }}>{r.error}</p>}
                      </Card>
                    )
                  })}
                </div>
                {liveIdle && (
                  <div className="max-w-[760px] mx-auto">
                    <Card>
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>这个工具做什么？</p>
                      <div className="mt-3.5 space-y-3">
                        {[
                          { step: '1', title: '预热写缓存', desc: '先发 1 轮“预热”请求，把生成的长前缀写入服务端提示词缓存（不计入命中率）。' },
                          { step: '2', title: '顺序 N 轮测量', desc: '相同长前缀 + 每轮变化的短问题，模拟“同上下文、不同提问”的真实用法。' },
                          { step: '3', title: '统计缓存字段', desc: '读取各协议返回的 cached_tokens / cache_read_input_tokens 等字段，归一化口径差异后汇总。' },
                        ].map(s => (
                          <div key={s.step} className="flex items-start gap-3">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 mt-px"
                              style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{s.step}</span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{s.title}</div>
                              <div className="text-xs leading-5 mt-0.5" style={{ color: 'var(--t2)' }}>{s.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-3.5 flex flex-wrap items-center gap-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--t3)' }}>产出指标</span>
                        {['请求级命中率', 'Token 级覆盖率', '节省 Token', '缓存写入量', '延迟对比'].map(m => (
                          <span key={m} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
                            style={{ background: 'var(--s2)', color: 'var(--t2)' }}>{m}</span>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {pane === 'logs' && (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <Btn small variant="soft" onClick={() => { logsRef.current = []; setLogs([]); setOpenLogs({}) }}>清空日志</Btn>
                  <span className="text-[11px]" style={{ color: 'var(--t3)' }}>请求体中的长前缀已截断展示；日志不写入历史记录。</span>
                </div>
                {logs.length === 0 ? (
                  <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>没有请求记录</div>
                ) : (
                  [...logs].reverse().map(renderLogRow)
                )}
              </div>
            )}

            {pane === 'report' && (
              !report ? (
                <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>完成一轮测试后，报告将显示在这里</div>
              ) : (
                <CacheReportView report={report} reportRef={reportRef} />
              )
            )}

            {pane === 'history' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm" style={{ color: 'var(--t2)' }}>已存 {history.length} / {CACHE_HISTORY_MAX} 条历史报告</p>
                  {history.length > 0 && <Btn small variant="danger" onClick={() => { setHistory([]); historyDbClear('cachehit').catch(() => {}) }}>清空历史</Btn>}
                </div>
                {history.length === 0 ? (
                  <div className="py-16 text-center text-sm" style={{ color: 'var(--t3)' }}>暂无历史报告，完成一轮测试后自动入库</div>
                ) : (
                  <div className="space-y-3">
                    {history.map(h => (
                      <div key={h.id} className="surface-card rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{h.name}</div>
                          <div className="text-xs mt-1 flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: 'var(--t3)' }}>
                            <span>{new Date(h.completedAt).toLocaleString()}</span>
                            <span className="font-mono truncate">{h.target.baseUrl} · {h.target.model}</span>
                            <span>
                              {h.results.map(r => `${r.format} ${cachePct(r.hitRate)}`).join(' · ')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Btn small variant="soft" onClick={() => { setReport(h); setPane('report') }}>查看</Btn>
                          <Btn small variant="ghost" onClick={() => { deleteCacheHistory(h.id).then(setHistory) }}>删除</Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pane === 'channels' && (
              <CacheChannelsPane
                chNotice={chNotice} channels={channels} activeChId={activeChId}
                chForm={chForm} editingChId={editingChId}
                onSetActive={setActiveChId} onEdit={editChannel} onDelete={delChannel}
                onSave={saveChannel} onChFormChange={setChForm} onClearForm={clearChForm}
              />
            )}
          </div>
        </div>
      </div>

      {nameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setNameModal(false) }}>
          <div role="dialog" aria-modal="true" className="floating-material rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>命名本次测试</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>名称会写入报告与导出文件，便于后续定位。</p>
            <CustomInput value={testName} onChange={setTestName} className="mt-4" placeholder="例如：2026-08-12 13:30:00" />
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setNameModal(false)}>取消</Btn>
              <Btn variant="primary" onClick={() => { const name = testName.trim() || cacheNowName(); setNameModal(false); runTest(name) }}>确认并开始</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CacheHitTool
