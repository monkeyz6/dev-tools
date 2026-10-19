import {
  type ProbeFormat, type ProbeUsage,
  PROBE_ORDER_TOOL, PROBE_WEATHER_TOOL,
  probeErrorMessage, probeNestReasoningEffort, probeProtocolOf,
} from './protocol'
import { PROBE_OUTPUT_LIMIT_DETAIL, probeCheck, probeOutputLimitReached, type ProbeCheck } from './oracles'
import { isMuseWonderModel, PROBE_CLAUDE5_CAP } from './profiles'
import { MUSE_BLUE_MP4_B64, MUSE_TOKEN_FINGERPRINT_TEXT, museBeepWavBase64, musePdfBase64 } from './muse-media'
import { MUSE_FINGERPRINTS } from './fingerprints'

export { MUSE_FINGERPRINTS }

// Meta muse-wonder-1.0 规格用例。只留通用探测覆盖不到的部分，身份指纹原样保留。
// - 官方写明支持的（accept）非 2xx 或核对不过记失败；
// - 官方写明 400 的（reject）收到 4xx 通过；2xx 再看参数生没生效：被丢弃记失败，真的生效记异常，看不出来记依据不足；
// - 两页说法真正相反的（conflict）记依据不足；
// - 官方没给写法、只能按惯例推断的（inferred）成功记通过，其余记依据不足；
// - 身份指纹只认命中：命中通过，其余依据不足，从不判假。
// 401/403/408/429、5xx、超时和网络错误一律记异常。模型名命中 isMuseWonderModel（含 meta/muse-wonder）才出现，默认不勾。

export const MUSE_SPEC_GROUPS = {
  reasoning: 'Muse Wonder · 推理',
  tools: 'Muse Wonder · 工具',
  multimodal: 'Muse Wonder · 多模态',
  identity: 'Muse Wonder · 身份证据',
} as const

export type MuseSpecTopic = keyof typeof MUSE_SPEC_GROUPS
export type MuseSpecExpect = 'accept' | 'reject' | 'conflict' | 'inferred'
export type MuseSpecStatus = 'passed' | 'failed' | 'abnormal' | 'inconclusive' | 'skipped'

export const MUSE_STOP_DETAIL = '测试被用户中止'

export interface MuseSpecContext {
  /** PDF 口令，本次请求随机生成 */
  code: string
  /** wav 里的哔声数，2–5 */
  beeps: number
}

export interface MuseSpecRequest {
  format: ProbeFormat
  /** 日志标签后缀，例如「对照」「取回」 */
  label?: string
  method?: 'POST' | 'GET' | 'DELETE'
  /** 拼在该协议地址后面，例如 /input_tokens、/resp_x、/resp_x/cancel */
  path?: string
  body?: Record<string, any> | null
}

export interface MuseSpecReply {
  transport: 'http' | 'timeout' | 'network' | 'stopped'
  status: number | null
  ok: boolean
  data: unknown
  /** 2xx 时的可见文本 */
  text: string
  /** 非 2xx 时的错误正文 */
  errorText?: string
  usage: ProbeUsage
}

export interface MuseSpecOutcome {
  status: MuseSpecStatus
  detail: string
  checks?: ProbeCheck[]
  /** 决定性那一发在本格请求序列里的下标；缺省取最后一发 */
  decisive?: number
  /** 决定性请求不产生 Token（取回 / 删除 / 取消 / 计数 / 错误格式），用量闸门不适用 */
  usageExempt?: boolean
  /** 结果展示的用量下标；缺省取决定性那一发 */
  usageFrom?: number
}

export interface MuseSpecDeps {
  model: string
  ctx: MuseSpecContext
  send(req: MuseSpecRequest): Promise<MuseSpecReply>
  stopped(): boolean
  sleep(ms: number): Promise<void>
}

export interface MuseEffect {
  /** true：参数真的生效；false：被丢弃；null：看不出来 */
  tookEffect: boolean | null
  detail: string
}

export interface MuseSpecCase {
  id: string
  topic: MuseSpecTopic
  group: string
  format: ProbeFormat
  name: string
  desc: string
  explain: string
  expect: MuseSpecExpect
  /** reject 的说明里点名的参数 */
  what?: string
  /** conflict / inferred 的说明 */
  note?: string
  /** 单发用例的请求体 */
  build?(model: string, ctx: MuseSpecContext): Record<string, any>
  /** accept / conflict / inferred 在 2xx 后的核对 */
  oracles?(reply: MuseSpecReply, ctx: MuseSpecContext): ProbeCheck[]
  /** reject 在 2xx 后判断参数是否生效 */
  effect?(reply: MuseSpecReply, ctx: MuseSpecContext): MuseEffect
  /** 先发一次对照（不带被测参数），对照不是 2xx 就记依据不足 */
  control?(model: string, ctx: MuseSpecContext): Record<string, any>
  /** 多步用例 */
  run?(deps: MuseSpecDeps): Promise<MuseSpecOutcome>
}

const DOC = 'https://dev.meta.ai/docs'
const OK_PROMPT = 'Reply with exactly: OK'
const CODEWORD = 'ORBIT'
const TURN1 = `Remember the codeword ${CODEWORD}. Reply with a short ack, do not mention the codeword.`
const TURN2 = 'Reply with only the codeword.'
const PARALLEL_PROMPT = 'Do both lookups now: check the weather in Shanghai for tomorrow, and track order SN20260705888. Call both tools in this turn before answering.'
/** 媒体类用例统一给 4096：官方视频理解页提示低于 4000 可能回空、finish_reason=length。 */
const MEDIA_CAP = 4096
const NONE_HINT = 'If no attachment was received, reply NONE.'

export const MUSE_PDF_PROMPT = `Read the attached PDF. What is the code written in it? Reply with the code only. ${NONE_HINT}`
export const MUSE_AUDIO_PROMPT = `Listen to the attached audio. How many beeps does it contain? Reply with a single digit only. ${NONE_HINT}`
export const MUSE_VIDEO_PROMPT = `Watch the attached video. What single color fills every frame? Reply with one English word. ${NONE_HINT}`

// ── 小工具 ──────────────────────────────────────────────────────────────

const asObj = (v: unknown): Record<string, any> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null

const asArr = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const clip = (text: string, n = 60): string => {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (!t) return '空回复'
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const brief = (r: MuseSpecReply): string => clip(probeErrorMessage(r.errorText ?? ''), 160)

/** 推理关不掉，统一给足额度；被拒类也用它，避免 2xx 后额度用尽回 400 被误当成拒绝。 */
const base = (model: string, format: ProbeFormat, prompt = OK_PROMPT, cap = PROBE_CLAUDE5_CAP): Record<string, any> => {
  const proto = probeProtocolOf(format)
  const body = proto.baseBody(model, prompt)
  proto.applyMaxTokens(body, cap)
  return body
}

const withTools = (model: string, format: ProbeFormat, prompt: string, choice: 'auto' | { name: string } = 'auto', tools = [PROBE_WEATHER_TOOL]): Record<string, any> => {
  const body = base(model, format, prompt)
  probeProtocolOf(format).applyTools(body, tools, choice)
  return body
}

const responsesInput = (content: any[]): any[] => [{ type: 'message', role: 'user', content }]

const pick = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((cur, k) => asObj(cur)?.[k], o)

/** Responses 官方 usage 在顶层；网关可能再包一层 response，两层都看。 */
const usagesOf = (format: ProbeFormat, data: unknown): Record<string, any>[] => {
  const o = asObj(data)
  if (!o) return []
  const out = [asObj(o.usage)]
  if (format === 'responses') out.push(asObj(asObj(o.response)?.usage))
  return out.filter((u): u is Record<string, any> => !!u)
}

const usageNumber = (format: ProbeFormat, data: unknown, path: string): number | null => {
  const v = usagesOf(format, data).map(u => pick(u, path)).find(x => typeof x === 'number' && Number.isFinite(x))
  return typeof v === 'number' ? v : null
}

/** 官方文档写进用量的字段，逐一要求是数字（0 合法）。 */
export const MUSE_USAGE_FIELDS: Record<ProbeFormat, string[]> = {
  chat: ['completion_tokens_details.reasoning_tokens', 'prompt_tokens_details.cached_tokens'],
  responses: ['output_tokens_details.reasoning_tokens', 'input_tokens_details.cached_tokens'],
  anthropic: ['output_tokens_details.thinking_tokens', 'cache_read_input_tokens'],
  gemini: [],
}

/** 推理 token 的字段：Chat / Responses 是 reasoning_tokens，Messages 是 thinking_tokens。 */
const REASONING_FIELD: Record<ProbeFormat, string> = {
  chat: 'completion_tokens_details.reasoning_tokens',
  responses: 'output_tokens_details.reasoning_tokens',
  anthropic: 'output_tokens_details.thinking_tokens',
  gemini: '',
}

export const museReasoningTokens = (format: ProbeFormat, data: unknown): number | null =>
  usageNumber(format, data, REASONING_FIELD[format])

/** 逐字段在各层 usage 里找，第一个是数字的算数。 */
export function oracleMuseUsageFields(format: ProbeFormat, data: unknown): ProbeCheck {
  const missing: string[] = []
  const seen: string[] = []
  for (const path of MUSE_USAGE_FIELDS[format]) {
    const v = usageNumber(format, data, path)
    if (typeof v === 'number') seen.push(`${path}=${v}`)
    else missing.push(path)
  }
  if (missing.length) return probeCheck('usage_fields', false, `用量缺少官方字段：usage.${missing.join('、usage.')}`)
  return probeCheck('usage_fields', true, `用量字段齐全：${seen.join('，')}`)
}

/** 推理关不掉：每一发都要带回大于 0 的推理 token。 */
export function oracleMuseReasoning(format: ProbeFormat, data: unknown): ProbeCheck {
  const n = museReasoningTokens(format, data)
  if (n == null) return probeCheck('reasoning_tokens', false, `用量没有 ${REASONING_FIELD[format]}`)
  if (n <= 0) return probeCheck('reasoning_tokens', false, `${REASONING_FIELD[format]}=0，推理没有发生`)
  return probeCheck('reasoning_tokens', true, `${REASONING_FIELD[format].split('.').pop()}=${n}`)
}

// ── 判定 ────────────────────────────────────────────────────────────────

/** 与 scoreExpectedReject 同一口径：这些情况不归给参数本身。 */
export function museAbnormalOf(r: MuseSpecReply): MuseSpecOutcome | null {
  if (r.transport === 'stopped') return { status: 'skipped', detail: MUSE_STOP_DETAIL }
  if (r.transport === 'timeout') return { status: 'abnormal', detail: '异常：请求超时' }
  if (r.transport === 'network') return { status: 'abnormal', detail: '异常：网络错误' }
  const s = r.status
  if (typeof s !== 'number' || !Number.isFinite(s)) return { status: 'abnormal', detail: '异常：没有 HTTP 状态码' }
  if (s === 401 || s === 403) return { status: 'abnormal', detail: `异常：鉴权失败（HTTP ${s}）` }
  if (s === 408 || s === 429 || s >= 500) return { status: 'abnormal', detail: `异常：HTTP ${s}${r.errorText ? `：${brief(r)}` : ''}` }
  return null
}

/** 单发应答的判定，按用例声明的方向分叉。 */
export function scoreMuseSpecReply(
  spec: Pick<MuseSpecCase, 'expect' | 'what' | 'name' | 'note' | 'oracles' | 'effect'>,
  reply: MuseSpecReply,
  ctx: MuseSpecContext,
): MuseSpecOutcome {
  const bad = museAbnormalOf(reply)
  if (bad) return bad
  const what = spec.what || spec.name
  const note = spec.note ? `。${spec.note}` : ''

  if (spec.expect === 'reject') {
    // 只认 HTTP 400：参数已被接受、只是输出额度不够，不算「已拒绝」
    if (reply.status === 400 && probeOutputLimitReached(reply.data ?? reply.errorText ?? '')) {
      return { status: 'failed', detail: `失败：${what} 已被接受，HTTP 400 是输出额度用尽（${PROBE_OUTPUT_LIMIT_DETAIL}）` }
    }
    if (!reply.ok) return { status: 'passed', detail: `通过：${what} 返回 HTTP ${reply.status}${reply.errorText ? `：${brief(reply)}` : ''}` }
    const eff = spec.effect?.(reply, ctx) ?? null
    if (eff?.tookEffect === true) {
      return { status: 'abnormal', detail: `异常：${what} 生效了（${eff.detail}）。官方会返回 400，与 Muse 规格矛盾，背后可能不是 muse-wonder-1.0` }
    }
    if (eff?.tookEffect === false) {
      return { status: 'failed', detail: `失败：${what} 被接受（HTTP ${reply.status}），参数被中间层静默丢弃（${eff.detail}）。官方会返回 400` }
    }
    return { status: 'inconclusive', detail: `依据不足：${what} 被接受（HTTP ${reply.status}），无法判断是否生效${eff?.detail ? `（${eff.detail}）` : ''}。官方会返回 400` }
  }

  const checks = reply.ok ? spec.oracles?.(reply, ctx) ?? [] : []
  const failedChecks = checks.filter(c => !c.passed)
  const checkText = checks.map(c => c.detail).join('；')

  if (spec.expect === 'conflict') {
    if (!reply.ok) return { status: 'inconclusive', detail: `依据不足：HTTP ${reply.status} 被拒（${brief(reply)}）${note}` }
    return { status: 'inconclusive', detail: `依据不足：HTTP ${reply.status} 已接受${checkText ? `；${checkText}` : ''}${note}`, checks }
  }

  if (spec.expect === 'inferred') {
    if (!reply.ok) return { status: 'inconclusive', detail: `依据不足：HTTP ${reply.status}（${brief(reply)}），写法是推断的，分不清是写法不对还是不支持${note}` }
    if (failedChecks.length) return { status: 'inconclusive', detail: `依据不足：${failedChecks.map(c => c.detail).join('；')}，写法是推断的${note}`, checks }
    return { status: 'passed', detail: checkText || `HTTP ${reply.status}，已接受`, checks }
  }

  if (!reply.ok) return { status: 'failed', detail: `官方支持，但请求被拒（HTTP ${reply.status}）：${brief(reply)}` }
  return { status: failedChecks.length ? 'failed' : 'passed', detail: checkText || `HTTP ${reply.status}，已接受`, checks }
}

/** 默认执行：可选对照 → 单发 → 判定。多步用例走自己的 run。 */
export async function runMuseSpecCase(spec: MuseSpecCase, deps: MuseSpecDeps): Promise<MuseSpecOutcome> {
  if (spec.run) return spec.run(deps)
  let index = 0
  if (spec.control) {
    const c = await deps.send({ format: spec.format, label: '对照', body: spec.control(deps.model, deps.ctx) })
    const bad = museAbnormalOf(c)
    if (bad) return { ...bad, decisive: 0 }
    if (!c.ok) {
      return {
        status: 'inconclusive',
        detail: `依据不足：对照请求（不带 ${spec.what || spec.name}）就返回 HTTP ${c.status}，后面的 400 不能归给这个参数（${brief(c)}）`,
        decisive: 0,
      }
    }
    if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL, decisive: 0 }
    index = 1
  }
  if (!spec.build) return { status: 'failed', detail: '用例没有请求体' }
  const r = await deps.send({ format: spec.format, body: spec.build(deps.model, deps.ctx) })
  return { ...scoreMuseSpecReply(spec, r, deps.ctx), decisive: index }
}

// ── 响应读取 ────────────────────────────────────────────────────────────

const chatMessage = (data: unknown): Record<string, any> | null => asObj(asArr(asObj(data)?.choices)[0])?.message ?? null

const responsesOutput = (data: unknown): Record<string, any>[] => {
  const o = asObj(data)
  const inner = asObj(o?.response)
  const out = Array.isArray(o?.output) ? o!.output : Array.isArray(inner?.output) ? inner!.output : []
  return out.map(asObj).filter((x: Record<string, any> | null): x is Record<string, any> => !!x)
}

const anthropicBlocks = (data: unknown): Record<string, any>[] =>
  asArr(asObj(data)?.content).map(asObj).filter((x): x is Record<string, any> => !!x)

const toolCallCount = (format: ProbeFormat, data: unknown): number => probeProtocolOf(format).toolCallsOf(data).length

/** 模型说没收到附件（回 NONE）：中间层多半把附件丢了。 */
export const museSaidNone = (text: string): boolean => /^\W*none\W*$/i.test(String(text || '').trim())

const noneCheck = (id: string, kind: string) => (text: string): ProbeCheck | null =>
  museSaidNone(text) ? probeCheck(id, false, `模型回复 NONE，表示没有收到${kind}，中间层可能丢弃了${kind}`) : null

export function oracleMuseCode(text: string, code: string): ProbeCheck {
  const none = noneCheck('pdf_code', 'PDF')(text)
  if (none) return none
  const hit = String(text || '').toUpperCase().includes(code.toUpperCase())
  return probeCheck('pdf_code', hit, hit ? `复述出 PDF 口令 ${code}` : `回复里没有 PDF 口令 ${code}（回复：${clip(text)}）`)
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const COUNT_TOKEN_RE = /\d+(?:\.\d+)?|\b(?:one|two|three|four|five|six|seven|eight|nine)\b/g
/** 紧跟单位的数字是素材参数（16kHz、440 Hz、200ms、16-bit），不是计数。 */
const UNIT_AFTER_RE = /^\s*-?\s*(?:k?hz\b|khz|k\b|ms\b|s\b|sec|second|minute|bit|%)/

/**
 * 从回复里取哔声数。只认孤立的 1–9（阿拉伯数字或 one–nine），跳过多位数、小数和带单位的数。
 * 点名哔声的写法优先：「N beeps」「beeps: N」「beep count = N」「number of beeps is N」。
 * 都没有时，候选数字必须全部相同才采用；「2 then 4」这类说法不止一个数，判不出是哪个，返回 null 记未通过。
 */
export function museBeepCount(text: string): number | null {
  const s = String(text || '').toLowerCase()
  const candidates: number[] = []
  for (const m of s.matchAll(COUNT_TOKEN_RE)) {
    const token = m[0]
    const value = /^\d/.test(token) ? (/^[1-9]$/.test(token) ? Number(token) : null) : NUMBER_WORDS[token]
    if (value == null) continue
    const after = s.slice((m.index ?? 0) + token.length)
    if (UNIT_AFTER_RE.test(after)) continue
    if (/^\s*(?:distinct\s+|separate\s+|short\s+)?beeps?\b/.test(after)) return value
    const before = s.slice(0, m.index ?? 0)
    if (/\bbeeps?(?:\s+count)?\s*[:=]\s*$/.test(before)) return value
    if (/\b(?:number|count)\s+of\s+beeps\s*(?:is|was|:|=)?\s*$/.test(before)) return value
    candidates.push(value)
  }
  if (!candidates.length) return null
  return candidates.every(v => v === candidates[0]) ? candidates[0] : null
}

export function oracleMuseBeeps(text: string, beeps: number): ProbeCheck {
  const none = noneCheck('audio_beeps', '音频')(text)
  if (none) return none
  const got = museBeepCount(text)
  if (got === beeps) return probeCheck('audio_beeps', true, `数出 ${beeps} 声哔声`)
  return probeCheck('audio_beeps', false, `音频里有 ${beeps} 声哔声，回复是 ${got ?? '无法确定的数字'}（${clip(text)}）`)
}

// cannot 是一个词，\bnot\b 和 n't 都对不上，单列；unable 同理
const NEGATION_RE = /\b(?:not|no|cannot|unable|isn'?t|aren'?t|wasn'?t|never|without|missing|absent|neither|nor|none)\b|n't\b/i
const OTHER_COLOR_RE = /\b(?:red|green|yellow|orange|purple|violet|pink|black|white|gr[ae]y|brown|cyan|magenta)\b/i

/** 画面纯蓝：回复要说 blue，且不能带否定词，也不能同时报别的颜色（「not blue」「blue is missing」「red and blue」都不算）。 */
export function oracleMuseBlue(text: string): ProbeCheck {
  const none = noneCheck('video_color', '视频')(text)
  if (none) return none
  const t = String(text || '')
  if (!/\bblue\b/i.test(t)) return probeCheck('video_color', false, `画面是纯蓝，回复没有 blue（${clip(text)}）`)
  if (NEGATION_RE.test(t)) return probeCheck('video_color', false, `回复提到 blue 但带否定（${clip(text)}）`)
  if (OTHER_COLOR_RE.test(t)) return probeCheck('video_color', false, `画面是纯蓝，回复还报了别的颜色（${clip(text)}）`)
  return probeCheck('video_color', true, '识别出画面为蓝色')
}

const codewordCheck = (text: string): ProbeCheck => {
  const hit = String(text || '').toUpperCase().includes(CODEWORD)
  return probeCheck('codeword', hit, hit ? `第二跳答出口令 ${CODEWORD}` : `第二跳没有答出口令 ${CODEWORD}（回复：${clip(text)}）`)
}

/** 联网证据。Messages 的 server_tool_use 名字带 xxx: 前缀（如 openrouter:web_search）说明是中间层插件代搜。 */
export function museSearchEvidence(format: ProbeFormat, data: unknown): { found: boolean; proxy: string | null; results: number } {
  if (format === 'responses') {
    const calls = responsesOutput(data).filter(it => it.type === 'web_search_call')
    const results = calls.reduce((n, c) => n + asArr(c.results).length + asArr(asObj(c.action)?.sources).length, 0)
    return { found: calls.length > 0, proxy: null, results }
  }
  if (format === 'anthropic') {
    const blocks = anthropicBlocks(data)
    const uses = blocks.filter(b => b.type === 'server_tool_use')
    const names = uses.map(b => String(b.name || ''))
    const native = names.some(n => n === 'web_search')
    const proxy = names.find(n => /^[^:]+:/.test(n)) ?? null
    const results = blocks.filter(b => b.type === 'web_search_tool_result').length
    return { found: native || results > 0, proxy: native ? null : proxy, results }
  }
  return { found: false, proxy: null, results: 0 }
}

// ── 用例构造 ────────────────────────────────────────────────────────────

type CaseInput = Omit<MuseSpecCase, 'group'>
const spec = (c: CaseInput): MuseSpecCase => ({ ...c, group: MUSE_SPEC_GROUPS[c.topic] })

/** reject 用例：官方写明 400 的参数。 */
const reject = (c: Omit<CaseInput, 'expect' | 'topic' | 'desc'> & { topic?: MuseSpecTopic; desc?: string }): MuseSpecCase => spec({
  topic: 'reasoning',
  desc: `官方写明 ${c.what} 返回 400`,
  ...c,
  expect: 'reject',
  explain: `${c.explain}。收到 4xx 记通过；2xx 时参数真的生效记异常，被丢弃记失败，看不出来记依据不足。400 正文若是输出额度用尽，说明参数已被接受，记失败。`,
})

// ── 推理 ────────────────────────────────────────────────────────────────

const LEVELS_OPENAI = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const LEVELS_MESSAGES = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** 先发一次不带推理参数的，再依次发各档。每一发都要 2xx 且推理 token > 0。官方用量字段缺失记依据不足并停止。 */
const effortLevels = (format: 'chat' | 'responses' | 'anthropic') => async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const levels: readonly string[] = format === 'anthropic' ? LEVELS_MESSAGES : LEVELS_OPENAI
  const seen: string[] = []
  const steps = [null, ...levels] as (string | null)[]
  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
    const level = steps[i]
    const body = base(deps.model, format)
    if (level) {
      if (format === 'chat') body.reasoning_effort = level
      else if (format === 'responses') body.reasoning = { effort: level }
      else body.output_config = { effort: level }
    }
    const label = level ?? '默认'
    const r = await deps.send({ format, label, body })
    const bad = museAbnormalOf(r)
    if (bad) return { ...bad, detail: `${label}：${bad.detail}`, decisive: i }
    if (!r.ok) return { status: 'failed', detail: `官方支持的 ${label} 被拒（HTTP ${r.status}）：${brief(r)}`, decisive: i }
    const checks = [oracleMuseReasoning(format, r.data), oracleMuseUsageFields(format, r.data)]
    const failed = checks.filter(c => !c.passed)
    if (failed.length) {
      const stopped = !checks[0].passed && checks[0].detail.includes('推理没有发生')
      const detail = `${label}：${failed.map(c => c.detail).join('；')}`
      return { status: stopped ? 'failed' : 'inconclusive', detail: stopped ? detail : `依据不足：${detail}`, checks, decisive: i }
    }
    seen.push(`${label} ${museReasoningTokens(format, r.data)}`)
  }
  return { status: 'passed', detail: `默认与 ${levels.join(' / ')} 都被接受，推理 token 依次为 ${seen.join('、')}；官方用量字段齐全` }
}

const replayReasoning = async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const include = ['reasoning.encrypted_content']
  const first = { model: deps.model, input: responsesInput([{ type: 'input_text', text: TURN1 }]), store: false, include, max_output_tokens: PROBE_CLAUDE5_CAP }
  const r1 = await deps.send({ format: 'responses', label: '第一跳', body: first })
  const bad1 = museAbnormalOf(r1)
  if (bad1) return { ...bad1, decisive: 0 }
  if (!r1.ok) return { status: 'failed', detail: `第一跳被拒（HTTP ${r1.status}）：${brief(r1)}`, decisive: 0 }
  const items = responsesOutput(r1.data)
  const reasoning = items.filter(it => it.type === 'reasoning')
  const enc = reasoning.filter(it => typeof it.encrypted_content === 'string' && it.encrypted_content)
  if (!enc.length) {
    return { status: 'failed', detail: reasoning.length ? '带了 include reasoning.encrypted_content，但 reasoning 条目没有 encrypted_content' : '响应没有 reasoning 条目，无法回放', decisive: 0 }
  }
  const text = probeProtocolOf('responses').textOf(r1.data)
  const replay = [
    ...first.input,
    ...enc.map(it => ({ type: 'reasoning', ...(typeof it.id === 'string' ? { id: it.id } : {}), summary: Array.isArray(it.summary) ? it.summary : [], encrypted_content: it.encrypted_content })),
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: text || 'OK' }] },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: TURN2 }] },
  ]
  if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL, decisive: 0 }
  const r2 = await deps.send({ format: 'responses', label: '回放', body: { model: deps.model, input: replay, store: false, include, max_output_tokens: PROBE_CLAUDE5_CAP } })
  const bad2 = museAbnormalOf(r2)
  if (bad2) return { ...bad2, decisive: 1 }
  if (!r2.ok) return { status: 'failed', detail: `回放加密推理被拒（HTTP ${r2.status}）：${brief(r2)}`, decisive: 1 }
  const check = codewordCheck(r2.text)
  return { status: check.passed ? 'passed' : 'failed', detail: `第一跳返回 ${enc.length} 个 encrypted_content，回放后 HTTP ${r2.status}；${check.detail}`, checks: [check], decisive: 1 }
}

const reasoningCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-effort-levels', topic: 'reasoning', format: 'chat', expect: 'accept',
    name: 'Chat · reasoning_effort 全档位',
    desc: '默认 + minimal…max 共 7 发，都应被接受且在推理',
    explain: `依据 ${DOC}/reasoning 与 ${DOC}/models：Wonder 支持 minimal 到 max，省略参数时仍按模型自定档位推理。先发一次不带参数的，再依次发 minimal、low、medium、high、xhigh、max。每一发都要 2xx，且 usage.completion_tokens_details.reasoning_tokens > 0、prompt_tokens_details.cached_tokens 是数字。字段缺失记依据不足并停止；推理 token 为 0 或档位被拒绝记失败。协议页的取值只列到 xhigh，Reasoning 页点名 Wonder 支持 max，按官方支持判。`,
    run: effortLevels('chat'),
  }),
  spec({
    id: 'spec-muse-responses-effort-levels', topic: 'reasoning', format: 'responses', expect: 'accept',
    name: 'Responses · reasoning.effort 全档位',
    desc: '默认 + minimal…max 共 7 发，都应被接受且在推理',
    explain: `依据 ${DOC}/reasoning：Responses 嵌套写 reasoning.effort。每一发都要 2xx，且 output_tokens_details.reasoning_tokens > 0、input_tokens_details.cached_tokens 是数字。字段缺失记依据不足并停止；推理 token 为 0 或档位被拒绝记失败。max 同上按 Reasoning 页判为支持。`,
    run: effortLevels('responses'),
  }),
  spec({
    id: 'spec-muse-anthropic-effort-levels', topic: 'reasoning', format: 'anthropic', expect: 'accept',
    name: 'Messages · output_config.effort 全档位',
    desc: '默认 + low…max 共 6 发，都应被接受且在推理',
    explain: `依据 ${DOC}/protocols/messages：output_config.effort 取 low / medium / high / xhigh（没有 minimal），Reasoning 页点名 Wonder 支持 max。每一发都要 2xx，且 usage.output_tokens_details.thinking_tokens > 0、cache_read_input_tokens 是数字。字段缺失记依据不足并停止；推理 token 为 0 或档位被拒绝记失败。`,
    run: effortLevels('anthropic'),
  }),
  spec({
    id: 'spec-muse-responses-encrypted-replay', topic: 'reasoning', format: 'responses', expect: 'accept',
    name: 'Responses · 加密推理回放',
    desc: 'store=false 取回 encrypted_content，回放后续聊',
    explain: `依据 ${DOC}/reasoning 与 ${DOC}/protocols/responses：无状态续聊要带 include:["reasoning.encrypted_content"]，再把 reasoning 条目（带 summary，可为 []）原样回传。第一跳要返回 encrypted_content；第二跳回放 reasoning 与 assistant 消息后追问口令，要 2xx 并答出 ${CODEWORD}。`,
    run: replayReasoning,
  }),
  reject({
    id: 'spec-muse-chat-effort-none', topic: 'reasoning', format: 'chat', what: 'reasoning_effort=none',
    name: 'Chat · reasoning_effort=none',
    explain: `依据 ${DOC}/reasoning：none 不被 Muse Wonder 支持，返回 HTTP 400。2xx 时看 reasoning_tokens：为 0 说明推理真被关掉，参数生效`,
    build: model => ({ ...base(model, 'chat'), reasoning_effort: 'none' }),
    effect: r => reasoningEffect('chat', r.data),
  }),
  reject({
    id: 'spec-muse-responses-effort-none', topic: 'reasoning', format: 'responses', what: 'reasoning.effort=none',
    name: 'Responses · reasoning.effort=none',
    explain: `依据 ${DOC}/protocols/responses：reasoning.effort 设为 none 返回 HTTP 400。2xx 时看 reasoning_tokens 是否为 0`,
    build: model => ({ ...base(model, 'responses'), reasoning: { effort: 'none' } }),
    effect: r => reasoningEffect('responses', r.data),
  }),
  reject({
    id: 'spec-muse-anthropic-thinking-disabled', topic: 'reasoning', format: 'anthropic', what: 'thinking.type=disabled',
    name: 'Messages · thinking=disabled',
    explain: `依据 ${DOC}/protocols/messages：thinking: {type:"disabled"} 返回 HTTP 400，推理关不掉。2xx 时看 thinking_tokens 是否为 0；字段缺失记「无法判断」`,
    build: model => ({ ...base(model, 'anthropic'), thinking: { type: 'disabled' } }),
    effect: r => reasoningEffect('anthropic', r.data),
  }),
]

function reasoningEffect(format: ProbeFormat, data: unknown): MuseEffect {
  const n = museReasoningTokens(format, data)
  if (n == null) return { tookEffect: null, detail: `用量没有 ${REASONING_FIELD[format]}` }
  if (n === 0) return { tookEffect: true, detail: `${REASONING_FIELD[format]}=0，推理被关掉了` }
  return { tookEffect: false, detail: `仍在推理，${REASONING_FIELD[format].split('.').pop()}=${n}` }
}

// ── 工具 ────────────────────────────────────────────────────────────────

const STRICT_WEATHER = {
  type: 'object',
  properties: { city: { type: 'string' }, date: { type: 'string' } },
  required: ['city', 'date'],
  additionalProperties: false,
}

const strictToolCheck = (format: ProbeFormat) => (r: MuseSpecReply): ProbeCheck[] => {
  const call = probeProtocolOf(format).toolCallsOf(r.data).find(c => c.name === PROBE_WEATHER_TOOL.name)
  if (!call) return [probeCheck('tool_call', false, '没有调用 get_weather')]
  const args = asObj(call.args)
  const ok = !!args && typeof args.city === 'string' && typeof args.date === 'string'
  return [probeCheck('tool_call', ok, ok ? `调用 get_weather，参数符合 strict schema（city=${args!.city}，date=${args!.date}）` : `调用了 get_weather，但参数不符合 strict schema（${clip(JSON.stringify(call.args ?? null))}）`)]
}

const parallelCheck = (format: ProbeFormat) => (r: MuseSpecReply): ProbeCheck[] => {
  const names = probeProtocolOf(format).toolCallsOf(r.data).map(c => c.name)
  const both = names.includes(PROBE_WEATHER_TOOL.name) && names.includes(PROBE_ORDER_TOOL.name)
  return [probeCheck('parallel', names.length >= 2 && both, names.length >= 2 && both
    ? `同一轮调用了 ${names.length} 个工具（${names.join('、')}）`
    : `同一轮只调用了 ${names.length} 个工具${names.length ? `（${names.join('、')}）` : ''}，没有并行调用 get_weather 与 query_order`)]
}

const singleCallCheck = (format: ProbeFormat) => (r: MuseSpecReply): ProbeCheck[] => {
  const n = toolCallCount(format, r.data)
  return [probeCheck('single_call', n === 1, n === 1 ? '只调用了 1 个工具' : n === 0 ? '没有调用工具' : `关闭并行后仍一次调用了 ${n} 个工具`)]
}

const parallelBody = (model: string, format: ProbeFormat): Record<string, any> =>
  withTools(model, format, PARALLEL_PROMPT, 'auto', [PROBE_WEATHER_TOOL, PROBE_ORDER_TOOL])

const strictToolBody = (model: string, format: 'chat' | 'responses', schema: Record<string, unknown>): Record<string, any> => {
  const body = base(model, format, 'What is the weather in Shanghai on 2026-10-20? You must call the get_weather tool.')
  if (format === 'responses') {
    body.input = responsesInput([{ type: 'input_text', text: body.input }])
    body.tools = [{ type: 'function', name: 'get_weather', description: PROBE_WEATHER_TOOL.description, strict: true, parameters: schema }]
  } else {
    body.tools = [{ type: 'function', function: { name: 'get_weather', description: PROBE_WEATHER_TOOL.description, strict: true, parameters: schema } }]
  }
  body.tool_choice = 'auto'
  return body
}

const toolsCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-responses-parallel-tools', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · 并行工具调用',
    desc: '同一轮调用天气与订单两个工具',
    explain: `依据 ${DOC}/tool-calling：parallel_tool_calls 默认 true，Responses 同样适用。要求同一轮出现 get_weather 与 query_order 两个 function_call。`,
    build: model => parallelBody(model, 'responses'),
    oracles: parallelCheck('responses'),
  }),
  spec({
    id: 'spec-muse-responses-parallel-off', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · parallel_tool_calls=false',
    desc: '关闭并行后一轮只调用一个工具',
    explain: `依据 ${DOC}/tool-calling：parallel_tool_calls:false 对 Responses 同样生效。要求恰好 1 个 function_call。`,
    build: model => ({ ...parallelBody(model, 'responses'), parallel_tool_calls: false }),
    oracles: singleCallCheck('responses'),
  }),
  spec({
    id: 'spec-muse-responses-strict-tool', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · strict 函数',
    desc: 'strict:true、schema 合规，调用参数应符合 schema',
    explain: `依据 ${DOC}/tool-calling：Responses 的函数工具同样支持 strict。要求调用 get_weather，参数符合 schema。`,
    build: model => strictToolBody(model, 'responses', STRICT_WEATHER),
    oracles: strictToolCheck('responses'),
  }),
]

// ── 多模态 ──────────────────────────────────────────────────────────────

const pdfData = (code: string) => `data:application/pdf;base64,${musePdfBase64(code)}`
const mp4Data = `data:video/mp4;base64,${MUSE_BLUE_MP4_B64}`

const multimodalCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-pdf', topic: 'multimodal', format: 'chat', expect: 'accept',
    name: 'Chat · PDF 输入', desc: '内嵌一页 PDF，复述随机口令',
    explain: `依据 ${DOC}/file-handling：Chat 用 {type:"file", file:{filename, file_data}}，file_data 是 base64 data URL。PDF 由前端生成，正文是本次随机口令，复述出口令才算通过；回 NONE 说明附件没送到。`,
    build: (model, ctx) => ({
      ...base(model, 'chat'),
      messages: [{ role: 'user', content: [
        { type: 'text', text: MUSE_PDF_PROMPT },
        { type: 'file', file: { filename: 'probe.pdf', file_data: pdfData(ctx.code) } },
      ] }],
    }),
    oracles: (reply, ctx) => [oracleMuseCode(reply.text, ctx.code)],
  }),
  spec({
    id: 'spec-muse-responses-pdf', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · PDF 输入', desc: '内嵌一页 PDF，复述随机口令',
    explain: `依据 ${DOC}/file-handling：Responses 用 {type:"input_file", filename, file_data}。复述出口令才算通过。`,
    build: (model, ctx) => ({
      ...base(model, 'responses'),
      input: responsesInput([
        { type: 'input_text', text: MUSE_PDF_PROMPT },
        { type: 'input_file', filename: 'probe.pdf', file_data: pdfData(ctx.code) },
      ]),
    }),
    oracles: (reply, ctx) => [oracleMuseCode(reply.text, ctx.code)],
  }),
  spec({
    id: 'spec-muse-chat-audio', topic: 'multimodal', format: 'chat', expect: 'accept',
    name: 'Chat · 音频输入', desc: '内嵌 wav，数哔声',
    explain: `依据 ${DOC}/video-understanding 与 ${DOC}/models（Wonder 接受音频输入）：Chat 用 {type:"input_audio", input_audio:{data, format:"wav"}}。wav 由前端合成（16kHz 单声道，2–5 声 440Hz 哔声，随机），数对才算通过；提示允许没收到时回 NONE，免得模型瞎猜。额度 4096。`,
    build: (model, ctx) => ({
      ...base(model, 'chat', OK_PROMPT, MEDIA_CAP),
      messages: [{ role: 'user', content: [
        { type: 'text', text: MUSE_AUDIO_PROMPT },
        { type: 'input_audio', input_audio: { data: museBeepWavBase64(ctx.beeps), format: 'wav' } },
      ] }],
    }),
    oracles: (reply, ctx) => [oracleMuseBeeps(reply.text, ctx.beeps)],
  }),
  spec({
    id: 'spec-muse-responses-audio', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · 音频输入', desc: '内嵌 wav，数哔声',
    explain: `依据 ${DOC}/video-understanding：Responses 接受同样的 input_audio part（内联 {data, format}）。协议页的输入类型没列 input_audio，但视频理解页明确写了支持，按官方支持判。数对哔声才算通过；回 NONE 说明音频没送到。`,
    build: (model, ctx) => ({
      ...base(model, 'responses', OK_PROMPT, MEDIA_CAP),
      input: responsesInput([
        { type: 'input_text', text: MUSE_AUDIO_PROMPT },
        { type: 'input_audio', input_audio: { data: museBeepWavBase64(ctx.beeps), format: 'wav' } },
      ]),
    }),
    oracles: (reply, ctx) => [oracleMuseBeeps(reply.text, ctx.beeps)],
  }),
  spec({
    id: 'spec-muse-responses-video', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · 视频输入', desc: '内嵌纯蓝 mp4，识别颜色',
    explain: `依据 ${DOC}/video-understanding：Responses 用 {type:"input_video", video_url}，可为 base64 data URL；无音轨的视频合法。素材是 2 秒 128×128 纯蓝 mp4，回答 blue 才算通过。额度 4096。`,
    build: model => ({
      ...base(model, 'responses', OK_PROMPT, MEDIA_CAP),
      input: responsesInput([
        { type: 'input_text', text: MUSE_VIDEO_PROMPT },
        { type: 'input_video', video_url: mp4Data },
      ]),
    }),
    oracles: reply => [oracleMuseBlue(reply.text)],
  }),
]

// ── 身份证据 ────────────────────────────────────────────────────────────

/** 收集加密推理块：Responses 的 encrypted_content，以及 Chat 适配层 reasoning_details[].data（type 为 reasoning.encrypted）。 */
export function museEncryptedBlobs(data: unknown): string[] {
  const out: string[] = []
  for (const it of responsesOutput(data)) {
    if (it.type === 'reasoning' && typeof it.encrypted_content === 'string' && it.encrypted_content) out.push(it.encrypted_content)
  }
  const details = asArr(chatMessage(data)?.reasoning_details)
  for (const d of details) {
    const o = asObj(d)
    if (o?.type === 'reasoning.encrypted' && typeof o.data === 'string' && o.data) out.push(o.data)
  }
  return out
}

export function scoreMuseEncryptedPrefix(blobs: string[]): MuseSpecOutcome {
  const fp = MUSE_FINGERPRINTS.encryptedPrefix
  if (!blobs.length) return { status: 'inconclusive', detail: '依据不足：响应没有加密推理块（encrypted_content）' }
  const bad = blobs.find(b => !b.startsWith(fp.value))
  if (!fp.confirmed) return { status: 'inconclusive', detail: `依据不足：前缀基线待交叉核对（本次前缀 ${blobs[0].slice(0, 8)}）` }
  if (bad) return { status: 'inconclusive', detail: `依据不足：加密推理块前缀是 ${bad.slice(0, 8)}，不是 ${fp.value}` }
  return { status: 'passed', detail: `${blobs.length} 个加密推理块都以 ${fp.value} 开头，与 Meta 的指纹一致` }
}

export function scoreMuseTokenDelta(format: 'chat' | 'responses' | 'anthropic', p0: number | null, p1: number | null): MuseSpecOutcome {
  if (typeof p0 !== 'number' || typeof p1 !== 'number') return { status: 'inconclusive', detail: `依据不足：用量缺少 input_tokens（P0=${p0 ?? '—'}，P1=${p1 ?? '—'}）` }
  const delta = p1 - p0
  const fp = MUSE_FINGERPRINTS.tokenDelta
  const want = fp.values[format]
  if (!fp.confirmed || want == null) return { status: 'inconclusive', detail: `依据不足：基线待交叉核对（本次 P0=${p0}，P1=${p1}，差值 ${delta}）` }
  if (delta !== want) return { status: 'inconclusive', detail: `依据不足：差值 ${delta}，基线是 ${want}（P0=${p0}，P1=${p1}）` }
  return { status: 'passed', detail: `差值 ${delta} 与基线一致（P0=${p0}，P1=${p1}）` }
}

/** 只认命中：非 2xx 一律依据不足（异常类仍记异常）。 */
const identityReply = (r: MuseSpecReply): MuseSpecOutcome | null => {
  const bad = museAbnormalOf(r)
  if (bad) return bad
  if (!r.ok) return { status: 'inconclusive', detail: `依据不足：HTTP ${r.status}（${brief(r)}）` }
  return null
}

const tokenDeltaRun = (format: 'chat' | 'responses' | 'anthropic') => async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const r0 = await deps.send({ format, label: 'P0', body: base(deps.model, format) })
  const bad0 = identityReply(r0)
  if (bad0) return { ...bad0, decisive: 0 }
  if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
  const r1 = await deps.send({ format, label: 'P1', body: base(deps.model, format, `${MUSE_TOKEN_FINGERPRINT_TEXT}\n\n${OK_PROMPT}`) })
  const bad1 = identityReply(r1)
  if (bad1) return { ...bad1, decisive: 1 }
  return { ...scoreMuseTokenDelta(format, r0.usage.input, r1.usage.input), decisive: 1 }
}

const identityCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-identity-encrypted', topic: 'identity', format: 'responses', expect: 'accept',
    name: '加密推理指纹', desc: 'encrypted_content 前缀与 Meta 一致（只认命中）',
    explain: `store:false + include:["reasoning.encrypted_content"] 取回加密推理块。两条独立链路（ainowork、OpenRouter）上 99/99 个块都以 ${MUSE_FINGERPRINTS.encryptedPrefix.value} 开头，OpenAI 的是 Fernet 格式的 gAAAAA。全部命中记通过；拿不到或前缀不同只记依据不足，不判假（网关可能删掉或改写这个字段）。`,
    run: async deps => {
      const r = await deps.send({ format: 'responses', body: { ...base(deps.model, 'responses'), store: false, include: ['reasoning.encrypted_content'] } })
      const bad = identityReply(r)
      if (bad) return { ...bad, decisive: 0 }
      return { ...scoreMuseEncryptedPrefix(museEncryptedBlobs(r.data)), decisive: 0 }
    },
  }),
  ...(['chat', 'responses', 'anthropic'] as const).map(format => spec({
    id: `spec-muse-${format}-identity-tokens`, topic: 'identity', format, expect: 'accept',
    name: `${format === 'chat' ? 'Chat' : format === 'responses' ? 'Responses' : 'Messages'} · Token 指纹`,
    desc: '长混排文本的 input_tokens 差值与基线一致（只认命中）',
    explain: '先发 Reply with exactly: OK（P0），再发约 500 字符的中英日韩混排、emoji、代码、长数字与罕见 Unicode 文本加同一句（P1），取两次 input_tokens 的差值。差值抵消了隐藏 system prompt 与网关注入的上下文，不同分词器差得很远。基线须两条链路实测一致才启用；未启用或对不上只记依据不足，不判假。',
    run: tokenDeltaRun(format),
  })),
]

// ── 汇总 ────────────────────────────────────────────────────────────────

export const MUSE_SPEC_CASES: MuseSpecCase[] = [
  ...reasoningCases, ...toolsCases, ...multimodalCases, ...identityCases,
]

export const museSpecCaseById = (id: string): MuseSpecCase | undefined => MUSE_SPEC_CASES.find(c => c.id === id)

/** 通用参数 combo 对 muse 的唯一改写：Responses 把 reasoning_effort 写成 reasoning.effort。Chat、Messages 与其它模型原样返回。 */
export const museAdaptComboBody = (model: string, format: ProbeFormat, body: Record<string, any>): Record<string, any> =>
  format === 'responses' && isMuseWonderModel(model) ? probeNestReasoningEffort(body) : body

export const matchMuseSpecCases = (model: string): MuseSpecCase[] => (isMuseWonderModel(model) ? MUSE_SPEC_CASES : [])

export const probeUnionMuseSpecCases = (models: string[]): MuseSpecCase[] =>
  models.some(isMuseWonderModel) ? MUSE_SPEC_CASES : []

export const museSpecContext = (rand: () => number = Math.random): MuseSpecContext => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(rand() * alphabet.length)]
  return { code: `MW-${code}`, beeps: 2 + Math.floor(rand() * 4) }
}
