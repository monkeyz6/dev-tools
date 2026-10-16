import {
  type ProbeFormat, type ProbeUsage,
  PROBE_JSON_SCHEMA, PROBE_ORDER_TOOL, PROBE_RED_PNG_B64, PROBE_TRUNCATION_PROMPT, PROBE_WEATHER_TOOL,
  probeErrorMessage, probeNestReasoningEffort, probeProtocolOf,
} from './protocol'
import { PROBE_OUTPUT_LIMIT_DETAIL, oracleSchemaOk, probeCheck, probeOutputLimitReached, type ProbeCheck } from './oracles'
import { isMuseWonderModel, PROBE_CLAUDE5_CAP } from './profiles'
import { MUSE_BLUE_MP4_B64, MUSE_CONTINUE_PNG_B64, MUSE_TOKEN_FINGERPRINT_TEXT, museBeepWavBase64, musePdfBase64 } from './muse-media'
import { MUSE_FINGERPRINTS } from './fingerprints'

export { MUSE_FINGERPRINTS }

// Meta muse-wonder-1.0 官方规格用例。口径是「渠道能否当官方直连用」：
// - 官方写明支持的（accept）严格判，非 2xx 或核对不过记失败；
// - 官方写明 400 的（reject）收到 4xx 通过；2xx 再看参数生没生效：被丢弃记失败，真的生效记异常（与 Muse 规格矛盾）；
// - 两页说法真正相反的（conflict）记依据不足；
// - 官方没给写法、只能按惯例推断的（inferred）成功记通过，其余记依据不足；
// - 身份指纹只认命中：命中通过，其余依据不足，从不判假。
// 401/403/408/429、5xx、超时和网络错误一律记异常。模型名命中 isMuseWonderModel（含 meta/muse-wonder）才出现，默认不勾。

export const MUSE_SPEC_GROUPS = {
  reasoning: 'Muse Wonder · 推理',
  tools: 'Muse Wonder · 工具',
  search: 'Muse Wonder · 搜索',
  multimodal: 'Muse Wonder · 多模态',
  state: 'Muse Wonder · 缓存与状态',
  api: 'Muse Wonder · 官方接口',
  constraint: 'Muse Wonder · 官方约束',
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
const FORCE_PROMPT = 'What is the weather in Shanghai tomorrow? You must call the get_weather tool.'
const PARALLEL_PROMPT = 'Do both lookups now: check the weather in Shanghai for tomorrow, and track order SN20260705888. Call both tools in this turn before answering.'
const COUNT_PROMPT = 'Write the integers from 1 to 9 in ascending order, separated by single spaces. Output nothing else.'
const SEARCH_PROMPT = 'What is a major news headline from today? You must search the live web before answering and cite your source.'
/** 媒体类用例统一给 4096：官方视频理解页提示低于 4000 可能回空、finish_reason=length。 */
const MEDIA_CAP = 4096
const NONE_HINT = 'If no attachment was received, reply NONE.'

export const MUSE_PDF_PROMPT = `Read the attached PDF. What is the code written in it? Reply with the code only. ${NONE_HINT}`
export const MUSE_AUDIO_PROMPT = `Listen to the attached audio. How many beeps does it contain? Reply with a single digit only. ${NONE_HINT}`
export const MUSE_VIDEO_PROMPT = `Watch the attached video. What single color fills every frame? Reply with one English word. ${NONE_HINT}`
export const MUSE_COMPUTER_PROMPT = 'This is a screenshot of the current screen. Click the Continue button.'

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
    return { status: 'failed', detail: `失败：${what} 被接受（HTTP ${reply.status}），无法判断是否生效${eff?.detail ? `（${eff.detail}）` : ''}。官方会返回 400` }
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
  topic: 'constraint',
  desc: `官方写明 ${c.what} 返回 400`,
  ...c,
  expect: 'reject',
  explain: `${c.explain}。收到 4xx 记通过；2xx 时参数真的生效记异常，被丢弃或看不出来记失败。400 正文若是输出额度用尽，说明参数已被接受，记失败。`,
})

// ── 推理 ────────────────────────────────────────────────────────────────

const LEVELS_OPENAI = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const LEVELS_MESSAGES = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** 先发一次不带推理参数的，再依次发各档。每一发都要 2xx、推理 token > 0、官方用量字段齐全。 */
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
    if (failed.length) return { status: 'failed', detail: `${label}：${failed.map(c => c.detail).join('；')}`, checks, decisive: i }
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

const thinkingVariants = async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const variants: { label: string; thinking: Record<string, any> }[] = [
    { label: 'adaptive + display=omitted', thinking: { type: 'adaptive', display: 'omitted' } },
    { label: 'enabled + budget_tokens=1024', thinking: { type: 'enabled', budget_tokens: 1024 } },
  ]
  const done: string[] = []
  for (let i = 0; i < variants.length; i++) {
    if (i > 0 && deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
    const v = variants[i]
    const r = await deps.send({ format: 'anthropic', label: v.label, body: { ...base(deps.model, 'anthropic'), thinking: v.thinking } })
    const bad = museAbnormalOf(r)
    if (bad) return { ...bad, detail: `${v.label}：${bad.detail}`, decisive: i }
    if (!r.ok) return { status: 'failed', detail: `官方支持的 thinking ${v.label} 被拒（HTTP ${r.status}）：${brief(r)}`, decisive: i }
    done.push(v.label)
  }
  return { status: 'passed', detail: `thinking ${done.join('、')} 都被接受` }
}

const reasoningCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-effort-levels', topic: 'reasoning', format: 'chat', expect: 'accept',
    name: 'Chat · reasoning_effort 全档位',
    desc: '默认 + minimal…max 共 7 发，都应被接受且在推理',
    explain: `依据 ${DOC}/reasoning 与 ${DOC}/models：Wonder 支持 minimal 到 max，省略参数时仍按模型自定档位推理。先发一次不带参数的，再依次发 minimal、low、medium、high、xhigh、max。每一发都要 2xx、usage.completion_tokens_details.reasoning_tokens > 0，且 prompt_tokens_details.cached_tokens 是数字。协议页的取值只列到 xhigh，Reasoning 页点名 Wonder 支持 max，按官方支持判。`,
    run: effortLevels('chat'),
  }),
  spec({
    id: 'spec-muse-responses-effort-levels', topic: 'reasoning', format: 'responses', expect: 'accept',
    name: 'Responses · reasoning.effort 全档位',
    desc: '默认 + minimal…max 共 7 发，都应被接受且在推理',
    explain: `依据 ${DOC}/reasoning：Responses 嵌套写 reasoning.effort。每一发都要 2xx、output_tokens_details.reasoning_tokens > 0，且 input_tokens_details.cached_tokens 是数字。max 同上按 Reasoning 页判为支持。`,
    run: effortLevels('responses'),
  }),
  spec({
    id: 'spec-muse-anthropic-effort-levels', topic: 'reasoning', format: 'anthropic', expect: 'accept',
    name: 'Messages · output_config.effort 全档位',
    desc: '默认 + low…max 共 6 发，都应被接受且在推理',
    explain: `依据 ${DOC}/protocols/messages：output_config.effort 取 low / medium / high / xhigh（没有 minimal），Reasoning 页点名 Wonder 支持 max。每一发都要 2xx、usage.output_tokens_details.thinking_tokens > 0，且 cache_read_input_tokens 是数字。`,
    run: effortLevels('anthropic'),
  }),
  spec({
    id: 'spec-muse-anthropic-thinking-variants', topic: 'reasoning', format: 'anthropic', expect: 'accept',
    name: 'Messages · thinking 变体',
    desc: 'adaptive + display=omitted、enabled + budget_tokens=1024 都应被接受',
    explain: `依据 ${DOC}/protocols/messages：thinking adaptive 支持，display 取 summarized / omitted；enabled 接受但不翻译成档位，要求 budget_tokens ≥ 1024 且小于 max_tokens。两发都要 2xx。`,
    run: thinkingVariants,
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

const DEFERRED_ORDERS = {
  name: 'list_open_orders',
  description: 'List open orders for a customer ID.',
  schema: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'], additionalProperties: false },
}

const toolSearchCheck = (format: ProbeFormat) => (r: MuseSpecReply): ProbeCheck[] => {
  if (format === 'responses') {
    const items = responsesOutput(r.data)
    const search = items.some(it => it.type === 'tool_search_call' || it.type === 'tool_search_output')
    const called = items.some(it => it.type === 'function_call' && it.name === DEFERRED_ORDERS.name)
    return [probeCheck('tool_search', search || called, search ? '响应含 tool_search_call / tool_search_output' : called ? `调用了延迟加载的 ${DEFERRED_ORDERS.name}` : '没有 tool_search 的调用证据，也没有调用延迟加载的函数')]
  }
  const blocks = anthropicBlocks(r.data)
  const search = blocks.some(b => (b.type === 'server_tool_use' && /tool_search/.test(String(b.name || ''))) || /tool_search/.test(String(b.type || '')))
  const called = blocks.some(b => b.type === 'tool_use' && b.name === DEFERRED_ORDERS.name)
  return [probeCheck('tool_search', search || called, search ? '响应含 tool_search 的 server_tool_use' : called ? `调用了延迟加载的 ${DEFERRED_ORDERS.name}` : '没有 tool_search 的调用证据，也没有调用延迟加载的函数')]
}

const toolsCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-parallel-tools', topic: 'tools', format: 'chat', expect: 'accept',
    name: 'Chat · 并行工具调用', desc: '同一轮调用天气与订单两个工具',
    explain: `依据 ${DOC}/models 与 ${DOC}/tool-calling：Wonder 并行调用工具，parallel_tool_calls 默认 true。带 get_weather 与 query_order，提示要求两个都查，要求同一轮出现这两个调用。`,
    build: model => parallelBody(model, 'chat'),
    oracles: parallelCheck('chat'),
  }),
  spec({
    id: 'spec-muse-responses-parallel-tools', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · 并行工具调用', desc: '同一轮调用天气与订单两个工具',
    explain: `依据 ${DOC}/tool-calling：parallel_tool_calls 默认 true，Responses 同样适用。要求同一轮出现 get_weather 与 query_order 两个 function_call。`,
    build: model => parallelBody(model, 'responses'),
    oracles: parallelCheck('responses'),
  }),
  spec({
    id: 'spec-muse-chat-parallel-off', topic: 'tools', format: 'chat', expect: 'accept',
    name: 'Chat · parallel_tool_calls=false', desc: '关闭并行后一轮只调用一个工具',
    explain: `依据 ${DOC}/tool-calling：parallel_tool_calls:false 时每轮最多一个调用。提示与并行用例相同，要求恰好 1 个调用。`,
    build: model => ({ ...parallelBody(model, 'chat'), parallel_tool_calls: false }),
    oracles: singleCallCheck('chat'),
  }),
  spec({
    id: 'spec-muse-responses-parallel-off', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · parallel_tool_calls=false', desc: '关闭并行后一轮只调用一个工具',
    explain: `依据 ${DOC}/tool-calling：parallel_tool_calls:false 对 Responses 同样生效。要求恰好 1 个 function_call。`,
    build: model => ({ ...parallelBody(model, 'responses'), parallel_tool_calls: false }),
    oracles: singleCallCheck('responses'),
  }),
  spec({
    id: 'spec-muse-chat-strict-tool', topic: 'tools', format: 'chat', expect: 'accept',
    name: 'Chat · strict 函数', desc: 'strict:true、schema 合规，调用参数应符合 schema',
    explain: `依据 ${DOC}/tool-calling 与 ${DOC}/structured-output：strict:true 时服务端按严格子集校验 schema（additionalProperties:false、required 列全）。要求调用 get_weather，且 city、date 都是字符串。`,
    build: model => strictToolBody(model, 'chat', STRICT_WEATHER),
    oracles: strictToolCheck('chat'),
  }),
  spec({
    id: 'spec-muse-responses-strict-tool', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · strict 函数', desc: 'strict:true、schema 合规，调用参数应符合 schema',
    explain: `依据 ${DOC}/tool-calling：Responses 的函数工具同样支持 strict。要求调用 get_weather，参数符合 schema。`,
    build: model => strictToolBody(model, 'responses', STRICT_WEATHER),
    oracles: strictToolCheck('responses'),
  }),
  spec({
    id: 'spec-muse-responses-custom-tool', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · custom 工具', desc: '{type:"custom"} 自由文本工具应被调用',
    explain: `依据 ${DOC}/tool-calling：custom 工具只在 Responses 上可用。声明 echo_text，提示要求调用，要求返回 custom_tool_call。`,
    build: model => ({
      ...base(model, 'responses', 'Call the echo_text tool with the input: hello muse'),
      tools: [{ type: 'custom', name: 'echo_text', description: 'Echo the given text back verbatim. Input is free-form text.' }],
      tool_choice: 'auto',
    }),
    oracles: r => {
      const hit = responsesOutput(r.data).some(it => it.type === 'custom_tool_call' && it.name === 'echo_text')
      return [probeCheck('custom_tool', hit, hit ? '返回 custom_tool_call（echo_text）' : '没有返回 echo_text 的 custom_tool_call')]
    },
  }),
  spec({
    id: 'spec-muse-responses-tool-search', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · tool_search 托管', desc: 'defer_loading 函数 + {type:"tool_search"}',
    explain: `依据 ${DOC}/tool-search：托管模式下函数带 defer_loading:true，另加 {type:"tool_search"}。要求出现 tool_search_call / tool_search_output，或调用了延迟加载的 list_open_orders。`,
    build: model => ({
      ...base(model, 'responses', 'List open orders for customer CUST-12345.'),
      tools: [
        { type: 'function', name: DEFERRED_ORDERS.name, description: DEFERRED_ORDERS.description, defer_loading: true, parameters: DEFERRED_ORDERS.schema },
        { type: 'tool_search' },
      ],
    }),
    oracles: toolSearchCheck('responses'),
  }),
  spec({
    id: 'spec-muse-anthropic-tool-search', topic: 'tools', format: 'anthropic', expect: 'inferred',
    name: 'Messages · tool_search 托管', desc: 'defer_loading 工具 + {type:"tool_search"}（写法推断）',
    note: 'Messages 页只写支持 tool_search，没给 Messages 的写法；这里按 Anthropic 惯例在自定义工具上加 defer_loading',
    explain: `依据 ${DOC}/tool-search 与 ${DOC}/protocols/messages：tool_search 在 Responses 与 Messages 上可用。要求出现 tool_search 的 server_tool_use，或调用了延迟加载的 list_open_orders。写法是推断的：成功记通过，其余记依据不足。`,
    build: model => ({
      ...base(model, 'anthropic', 'List open orders for customer CUST-12345.'),
      tools: [
        { name: DEFERRED_ORDERS.name, description: DEFERRED_ORDERS.description, input_schema: DEFERRED_ORDERS.schema, defer_loading: true },
        { type: 'tool_search' },
      ],
    }),
    oracles: toolSearchCheck('anthropic'),
  }),
  spec({
    id: 'spec-muse-anthropic-tool-choice-any', topic: 'tools', format: 'anthropic', expect: 'accept',
    name: 'Messages · tool_choice=any', desc: '无关提示下也必须调用工具',
    explain: `依据 ${DOC}/protocols/messages：tool_choice 支持 auto / any / none。发 {type:"any"} 与一个和工具无关的提示，要求仍产生 tool_use。`,
    build: model => ({ ...withTools(model, 'anthropic', OK_PROMPT), tool_choice: { type: 'any' } }),
    oracles: r => {
      const n = toolCallCount('anthropic', r.data)
      return [probeCheck('forced', n > 0, n > 0 ? `产生了 ${n} 个 tool_use` : 'tool_choice=any 却没有产生 tool_use')]
    },
  }),
  spec({
    id: 'spec-muse-anthropic-tool-choice-none', topic: 'tools', format: 'anthropic', expect: 'accept',
    name: 'Messages · tool_choice=none', desc: '「必须调用」的提示下也不调用工具',
    explain: `依据 ${DOC}/protocols/messages：tool_choice 支持 none。发 {type:"none"} 与「必须调用 get_weather」的提示，要求不产生 tool_use。`,
    build: model => ({ ...withTools(model, 'anthropic', FORCE_PROMPT), tool_choice: { type: 'none' } }),
    oracles: r => {
      const n = toolCallCount('anthropic', r.data)
      return [probeCheck('no_tool', n === 0, n === 0 ? '没有产生 tool_use' : `tool_choice=none 却产生了 ${n} 个 tool_use`)]
    },
  }),
  spec({
    id: 'spec-muse-anthropic-disable-parallel', topic: 'tools', format: 'anthropic', expect: 'accept',
    name: 'Messages · disable_parallel_tool_use', desc: 'auto + disable_parallel_tool_use 只调用一个工具',
    explain: `依据 ${DOC}/protocols/messages：tool_choice 的 disable_parallel_tool_use 为 true 时生效。带两个工具与「两个都查」的提示，要求恰好 1 个 tool_use。`,
    build: model => ({ ...parallelBody(model, 'anthropic'), tool_choice: { type: 'auto', disable_parallel_tool_use: true } }),
    oracles: singleCallCheck('anthropic'),
  }),
  spec({
    id: 'spec-muse-responses-computer-use', topic: 'tools', format: 'responses', expect: 'accept',
    name: 'Responses · computer use', desc: '{type:"computer"} + 截图，应返回 computer_call',
    explain: `依据 ${DOC}/computer-use 与 ${DOC}/models：computer 工具只在 Responses 上可用，定义里只有 type。附一张 320×200 截图（Continue 按钮），要求返回 computer_call 且带非空 actions。`,
    build: model => ({
      ...base(model, 'responses', MUSE_COMPUTER_PROMPT),
      tools: [{ type: 'computer' }],
      input: responsesInput([
        { type: 'input_text', text: MUSE_COMPUTER_PROMPT },
        { type: 'input_image', image_url: `data:image/png;base64,${MUSE_CONTINUE_PNG_B64}` },
      ]),
    }),
    oracles: r => {
      const call = responsesOutput(r.data).find(it => it.type === 'computer_call')
      const actions = call ? (Array.isArray(call.actions) ? call.actions : asObj(call.action) ? [call.action] : []) : []
      if (!call) return [probeCheck('computer_call', false, '没有返回 computer_call')]
      const kinds = actions.map(a => String(asObj(a)?.type || '?'))
      return [probeCheck('computer_call', actions.length > 0, actions.length ? `返回 computer_call，动作 ${kinds.join('、')}` : 'computer_call 没有 actions')]
    },
  }),
]

// ── 搜索 ────────────────────────────────────────────────────────────────

const searchCheck = (format: ProbeFormat, needResults = false) => (r: MuseSpecReply): ProbeCheck[] => {
  const ev = museSearchEvidence(format, r.data)
  if (ev.proxy) return [probeCheck('web_search', false, `搜索由中间层插件 ${ev.proxy} 执行，不是 Meta 原生 web_search`)]
  if (!ev.found) return [probeCheck('web_search', false, '没有联网证据（web_search_call / server_tool_use）')]
  if (needResults && ev.results === 0) return [probeCheck('web_search', false, '有 web_search_call，但 include 了 web_search_call.results 却没有 results')]
  return [probeCheck('web_search', true, `有联网证据${ev.results ? `，结果 ${ev.results} 条` : ''}`)]
}

const searchCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-responses-web-search-options', topic: 'search', format: 'responses', expect: 'accept',
    name: 'Responses · web_search 选项', desc: 'search_context_size + user_location + include results',
    explain: `依据 ${DOC}/search-grounding：Responses 的 web_search 可带 search_context_size（low / medium / high）与 user_location（type 只能是 approximate）；include:["web_search_call.results"] 会给每个 web_search_call 加 results。要求有 web_search_call 且 results 非空。`,
    build: model => ({
      ...base(model, 'responses', SEARCH_PROMPT),
      tools: [{ type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate', country: 'US' } }],
      tool_choice: 'auto',
      include: ['web_search_call.results'],
    }),
    oracles: searchCheck('responses', true),
  }),
  spec({
    id: 'spec-muse-anthropic-web-search-location', topic: 'search', format: 'anthropic', expect: 'accept',
    name: 'Messages · web_search + user_location', desc: 'Messages 联网带 user_location',
    explain: `依据 ${DOC}/search-grounding：Messages 写 {type:"web_search"}，搜索以 server_tool_use 块返回，user_location 可用。要求有 name 为 web_search 的 server_tool_use；名字带 xxx: 前缀（如 openrouter:web_search）说明是中间层插件代搜，记失败。`,
    build: model => ({
      ...base(model, 'anthropic', SEARCH_PROMPT),
      tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'US' } }],
      tool_choice: { type: 'auto' },
    }),
    oracles: searchCheck('anthropic'),
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
    id: 'spec-muse-anthropic-pdf', topic: 'multimodal', format: 'anthropic', expect: 'inferred',
    name: 'Messages · PDF 输入', desc: 'document 块（写法推断）',
    note: 'Messages 页只列了 document 块类型，没给写法；这里按 Anthropic 惯例发 base64 source',
    explain: `依据 ${DOC}/protocols/messages：user 消息支持 document 块。写法推断为 {type:"document", source:{type:"base64", media_type:"application/pdf", data}}。复述出口令记通过，其余记依据不足。`,
    build: (model, ctx) => ({
      ...base(model, 'anthropic'),
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: musePdfBase64(ctx.code) } },
        { type: 'text', text: MUSE_PDF_PROMPT },
      ] }],
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
  spec({
    id: 'spec-muse-chat-video', topic: 'multimodal', format: 'chat', expect: 'inferred',
    name: 'Chat · 视频输入', desc: 'video_url part（写法推断）',
    note: '视频理解页只说 Chat 用 video_url part，没给结构；这里按 image_url 的形状写 {type:"video_url", video_url:{url}}',
    explain: `依据 ${DOC}/video-understanding：Chat 通过 video_url content part 传视频。结构是推断的。回答 blue 记通过，其余记依据不足。`,
    build: model => ({
      ...base(model, 'chat', OK_PROMPT, MEDIA_CAP),
      messages: [{ role: 'user', content: [
        { type: 'text', text: MUSE_VIDEO_PROMPT },
        { type: 'video_url', video_url: { url: mp4Data } },
      ] }],
    }),
    oracles: reply => [oracleMuseBlue(reply.text)],
  }),
  spec({
    id: 'spec-muse-anthropic-video', topic: 'multimodal', format: 'anthropic', expect: 'inferred',
    name: 'Messages · 视频输入', desc: 'video 块（写法推断）',
    note: 'Messages 页只列了 video 块类型，没给写法；这里按 image 块的形状写 base64 source',
    explain: `依据 ${DOC}/protocols/messages：user 消息支持 video 块。写法推断为 {type:"video", source:{type:"base64", media_type:"video/mp4", data}}。回答 blue 记通过，其余记依据不足。`,
    build: model => ({
      ...base(model, 'anthropic', OK_PROMPT, MEDIA_CAP),
      messages: [{ role: 'user', content: [
        { type: 'video', source: { type: 'base64', media_type: 'video/mp4', data: MUSE_BLUE_MP4_B64 } },
        { type: 'text', text: MUSE_VIDEO_PROMPT },
      ] }],
    }),
    oracles: reply => [oracleMuseBlue(reply.text)],
  }),
]

// ── 缓存与状态 ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000
const POLL_MAX = 30

/** Responses 的 id。网关可能改写成自己的格式，取到什么用什么。 */
const responseId = (data: unknown): string | null => {
  const o = asObj(data)
  const id = o?.id ?? asObj(o?.response)?.id
  return typeof id === 'string' && id ? id : null
}

const responseStatus = (data: unknown): string | null => {
  const o = asObj(data)
  const s = o?.status ?? asObj(o?.response)?.status
  return typeof s === 'string' ? s : null
}

const storeChain = async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const fail = (detail: string, decisive: number): MuseSpecOutcome => ({ status: 'failed', detail, decisive, usageExempt: true, usageFrom: 0 })
  const r1 = await deps.send({ format: 'responses', label: '第一跳 store', body: { ...base(deps.model, 'responses', TURN1), store: true } })
  const bad1 = museAbnormalOf(r1)
  if (bad1) return { ...bad1, decisive: 0 }
  if (!r1.ok) return fail(`第一跳被拒（HTTP ${r1.status}）：${brief(r1)}`, 0)
  const id = responseId(r1.data)
  if (!id) return fail('第一跳响应没有 id，无法续接', 0)

  const steps: { label: string; req: MuseSpecRequest; judge(r: MuseSpecReply): string | null }[] = [
    {
      label: 'previous_response_id 续接',
      req: { format: 'responses', label: '续接', body: { ...base(deps.model, 'responses', TURN2), previous_response_id: id } },
      judge: r => (!r.ok ? `previous_response_id 续接被拒（HTTP ${r.status}）：${brief(r)}` : codewordCheck(r.text).passed ? null : codewordCheck(r.text).detail),
    },
    {
      label: '取回',
      req: { format: 'responses', label: '取回', method: 'GET', path: `/${encodeURIComponent(id)}` },
      judge: r => (!r.ok ? `GET /v1/responses/{id} 失败（HTTP ${r.status}）：${brief(r)}` : responseId(r.data) === id ? null : `取回的 id 是 ${responseId(r.data) ?? '空'}，不是 ${id}`),
    },
    {
      label: '删除',
      req: { format: 'responses', label: '删除', method: 'DELETE', path: `/${encodeURIComponent(id)}` },
      judge: r => (r.ok ? null : `DELETE /v1/responses/{id} 失败（HTTP ${r.status}）：${brief(r)}`),
    },
    {
      label: '删除后取回',
      req: { format: 'responses', label: '删除后取回', method: 'GET', path: `/${encodeURIComponent(id)}` },
      judge: r => (r.status === 404 ? null : r.ok ? '删除后仍能取回（HTTP 2xx）' : `删除后取回应为 404，实际 HTTP ${r.status}`),
    },
  ]
  for (let i = 0; i < steps.length; i++) {
    if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
    const step = steps[i]
    const r = await deps.send(step.req)
    const bad = museAbnormalOf(r)
    if (bad) return { ...bad, detail: `${step.label}：${bad.detail}`, decisive: i + 1, usageExempt: true, usageFrom: 0 }
    const problem = step.judge(r)
    if (problem) return fail(problem, i + 1)
  }
  return { status: 'passed', detail: `store → previous_response_id 续接答出 ${CODEWORD} → 取回 id 一致 → 删除成功 → 再取回 404`, decisive: 4, usageExempt: true, usageFrom: 0 }
}

const backgroundRun = async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const r1 = await deps.send({ format: 'responses', label: 'background 创建', body: { ...base(deps.model, 'responses'), background: true, store: true } })
  const bad1 = museAbnormalOf(r1)
  if (bad1) return { ...bad1, decisive: 0 }
  if (!r1.ok) return { status: 'failed', detail: `background 创建被拒（HTTP ${r1.status}）：${brief(r1)}`, decisive: 0 }
  const id = responseId(r1.data)
  let status = responseStatus(r1.data)
  // 网关忽略 background 直接回 completed：这一发产生了 Token，照常过用量闸门
  if (status === 'completed') {
    const ok = /\bOK\b/i.test(r1.text)
    return { status: ok ? 'passed' : 'failed', detail: ok ? '创建时已完成（status=completed），文本为 OK' : `创建时已完成，但文本不是 OK（${clip(r1.text)}）`, decisive: 0 }
  }
  if (!id) return { status: 'failed', detail: 'background 响应没有 id，无法轮询', decisive: 0, usageExempt: true }
  if (status && status !== 'queued' && status !== 'in_progress') {
    return { status: 'failed', detail: `background 创建后的状态是 ${status}，不是 queued / in_progress`, decisive: 0, usageExempt: true }
  }
  for (let i = 1; i <= POLL_MAX; i++) {
    if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
    await deps.sleep(POLL_INTERVAL_MS)
    if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
    const r = await deps.send({ format: 'responses', label: `轮询 ${i}`, method: 'GET', path: `/${encodeURIComponent(id)}` })
    const bad = museAbnormalOf(r)
    if (bad) return { ...bad, detail: `轮询：${bad.detail}`, decisive: i, usageExempt: true }
    if (!r.ok) return { status: 'failed', detail: `轮询 GET /v1/responses/{id} 失败（HTTP ${r.status}）：${brief(r)}`, decisive: i, usageExempt: true }
    status = responseStatus(r.data)
    if (status === 'queued' || status === 'in_progress') continue
    if (status === 'completed') {
      const ok = /\bOK\b/i.test(r.text)
      return { status: ok ? 'passed' : 'failed', detail: ok ? `创建后状态 ${responseStatus(r1.data) ?? '未写'}，第 ${i} 次轮询完成，文本为 OK` : `轮询完成，但文本不是 OK（${clip(r.text)}）`, decisive: i, usageExempt: true }
    }
    return { status: 'failed', detail: `后台任务结束状态是 ${status ?? '未写'}，不是 completed`, decisive: i, usageExempt: true }
  }
  return { status: 'failed', detail: `轮询 ${(POLL_MAX * POLL_INTERVAL_MS) / 1000}s 仍未完成（最后状态 ${status ?? '未写'}）`, usageExempt: true }
}

const cancelRun = async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const body = { ...base(deps.model, 'responses', 'Write a 600-word essay about the history of the printing press.'), background: true, store: true }
  const r1 = await deps.send({ format: 'responses', label: 'background 创建', body })
  const bad1 = museAbnormalOf(r1)
  if (bad1) return { ...bad1, decisive: 0 }
  if (!r1.ok) return { status: 'failed', detail: `background 创建被拒（HTTP ${r1.status}）：${brief(r1)}`, decisive: 0 }
  const id = responseId(r1.data)
  if (!id) return { status: 'failed', detail: 'background 响应没有 id，无法取消', decisive: 0, usageExempt: true }
  if (responseStatus(r1.data) === 'completed') {
    return { status: 'inconclusive', detail: '依据不足：创建时任务已完成，没有可取消的进行中任务', decisive: 0, usageExempt: true }
  }
  if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
  const r2 = await deps.send({ format: 'responses', label: '取消', path: `/${encodeURIComponent(id)}/cancel`, body: {} })
  const bad2 = museAbnormalOf(r2)
  if (bad2) return { ...bad2, detail: `取消：${bad2.detail}`, decisive: 1, usageExempt: true }
  if (r2.ok) {
    const st = responseStatus(r2.data)
    return {
      status: 'passed',
      detail: st === 'cancelled' ? 'POST /v1/responses/{id}/cancel 成功，状态 cancelled' : `POST /v1/responses/{id}/cancel 返回 HTTP ${r2.status}，状态 ${st ?? '未写'}${st === 'completed' ? '（取消前任务已完成）' : ''}`,
      decisive: 1, usageExempt: true,
    }
  }
  // 4xx 可能是任务已经结束、无法取消；取回一次看状态
  if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
  const r3 = await deps.send({ format: 'responses', label: '取消后取回', method: 'GET', path: `/${encodeURIComponent(id)}` })
  if (r3.ok && responseStatus(r3.data) === 'completed') {
    return { status: 'inconclusive', detail: `依据不足：取消返回 HTTP ${r2.status}，取回时任务已完成，分不清是不支持取消还是来不及取消`, decisive: 1, usageExempt: true }
  }
  return { status: 'failed', detail: `官方支持的取消被拒（HTTP ${r2.status}）：${brief(r2)}`, decisive: 1, usageExempt: true }
}

const stateCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-cache-retention', topic: 'state', format: 'chat', expect: 'accept',
    name: 'Chat · prompt_cache_retention=24h', desc: '缓存保留时长提示应被接受',
    explain: `依据 ${DOC}/protocols/chat-completions：prompt_cache_retention 取 in_memory 或 24h，同时带 prompt_cache_key。要求 2xx。`,
    build: model => ({ ...base(model, 'chat'), prompt_cache_key: 'modelprobe-muse', prompt_cache_retention: '24h' }),
  }),
  spec({
    id: 'spec-muse-responses-cache-retention', topic: 'state', format: 'responses', expect: 'accept',
    name: 'Responses · prompt_cache_retention=24h', desc: '缓存保留时长提示应被接受',
    explain: `依据 ${DOC}/prompt-caching：prompt_cache_retention 只作用于 Responses，24h 是提示而非保证。要求 2xx。`,
    build: model => ({ ...base(model, 'responses'), prompt_cache_key: 'modelprobe-muse', prompt_cache_retention: '24h' }),
  }),
  spec({
    id: 'spec-muse-responses-store-chain', topic: 'state', format: 'responses', expect: 'accept',
    name: 'Responses · 存储、续接、取回、删除', desc: 'store → previous_response_id → GET → DELETE → GET 404',
    explain: `依据 ${DOC}/protocols/responses 与 API 参考：store 默认 true；previous_response_id 续接对话；GET /v1/responses/{id} 取回；DELETE /v1/responses/{id} 删除。五步依次要求：第一跳 2xx 且有 id；续接答出 ${CODEWORD}；取回 id 一致；删除 2xx；删除后再取回 404。`,
    run: storeChain,
  }),
  spec({
    id: 'spec-muse-responses-background', topic: 'state', format: 'responses', expect: 'accept',
    name: 'Responses · background 异步', desc: 'background:true 创建后轮询直到完成',
    explain: `依据 ${DOC}/protocols/responses：background:true 异步执行。创建后每 2 秒 GET /v1/responses/{id}，最多 60 秒，要求最终 completed 且文本为 OK。`,
    run: backgroundRun,
  }),
  spec({
    id: 'spec-muse-responses-cancel', topic: 'state', format: 'responses', expect: 'accept',
    name: 'Responses · 取消后台任务', desc: 'background 创建后立即 POST /cancel',
    explain: `依据 API 参考（Cancel a response）：POST /v1/responses/{id}/cancel，只能取消 background 且仍在进行中的任务。创建一个较长的后台任务后立即取消，要求 2xx；任务在取消前已完成也算通过，说明里写清。取消返回 4xx 且任务已完成，分不清原因，记依据不足。`,
    run: cancelRun,
  }),
]

// ── 官方接口 ────────────────────────────────────────────────────────────

const COUNT_TEXT = 'Count the tokens of this request. Reply with exactly: OK'

const countRun = (format: 'responses' | 'anthropic') => async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const path = format === 'responses' ? '/input_tokens' : '/count_tokens'
  const body = base(deps.model, format, COUNT_TEXT)
  const r1 = await deps.send({ format, label: '计数', path, body })
  const bad1 = museAbnormalOf(r1)
  if (bad1) return { ...bad1, decisive: 0, usageExempt: true }
  if (!r1.ok) return { status: 'failed', detail: `计数接口 POST ${path} 失败（HTTP ${r1.status}）：${brief(r1)}`, decisive: 0, usageExempt: true }
  const counted = asObj(r1.data)?.input_tokens
  if (typeof counted !== 'number' || !Number.isInteger(counted)) {
    return { status: 'failed', detail: `计数接口没有返回整数 input_tokens（${clip(JSON.stringify(r1.data ?? null), 120)}）`, decisive: 0, usageExempt: true }
  }
  if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
  const r2 = await deps.send({ format, label: '生成', body })
  const bad2 = museAbnormalOf(r2)
  if (bad2) return { ...bad2, decisive: 1 }
  if (!r2.ok) return { status: 'failed', detail: `同一请求体生成失败（HTTP ${r2.status}）：${brief(r2)}`, decisive: 1 }
  const actual = r2.usage.input
  if (actual !== counted) {
    return { status: 'failed', detail: `计数接口算出 ${counted}，实际生成 input_tokens 是 ${actual ?? '缺失'}，计费对不上`, decisive: 1 }
  }
  return { status: 'passed', detail: `计数接口算出 ${counted}，与实际生成的 input_tokens 一致`, decisive: 1 }
}

/** 官方错误格式：{error:{message,type,param,code}}。只把鉴权、限流、超时、网络算异常，5xx 也是格式偏差。 */
const errorShapeRun = (format: 'chat' | 'responses' | 'anthropic', kind: 'model' | 'param') => async (deps: MuseSpecDeps): Promise<MuseSpecOutcome> => {
  const body = kind === 'model'
    ? { ...base(deps.model, format), model: 'probe-no-such-model' }
    : { ...base(deps.model, format), top_p: 1.5 }
  const r = await deps.send({ format, body })
  if (r.transport !== 'http') return { ...(museAbnormalOf(r) ?? { status: 'abnormal', detail: '异常' }), usageExempt: true }
  if (r.status === 401 || r.status === 403 || r.status === 408 || r.status === 429) return { ...(museAbnormalOf(r) as MuseSpecOutcome), usageExempt: true }
  const want = kind === 'model' ? 404 : 400
  const err = asObj(asObj(r.data)?.error)
  const problems: string[] = []
  if (r.status !== want) problems.push(`HTTP ${r.status}，官方是 ${want}`)
  if (!err) problems.push('没有 error 对象')
  else {
    if (err.type !== 'invalid_request_error') problems.push(`error.type 是 ${JSON.stringify(err.type ?? null)}，官方是 invalid_request_error`)
    if (kind === 'model' && err.code !== 'model_not_found') problems.push(`error.code 是 ${JSON.stringify(err.code ?? null)}，官方是 model_not_found`)
    if (kind === 'param' && err.param !== 'top_p') problems.push(`error.param 是 ${JSON.stringify(err.param ?? null)}，官方是 top_p`)
    if (typeof err.message !== 'string' || !err.message) problems.push('error.message 为空')
  }
  if (problems.length) return { status: 'failed', detail: `错误格式与官方不一致：${problems.join('；')}`, usageExempt: true }
  return {
    status: 'passed',
    detail: kind === 'model' ? 'HTTP 404，error.type=invalid_request_error，error.code=model_not_found' : 'HTTP 400，error.type=invalid_request_error，error.param=top_p',
    usageExempt: true,
  }
}

const apiCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-responses-input-tokens', topic: 'api', format: 'responses', expect: 'accept',
    name: 'Responses · Token 计数接口', desc: 'POST /v1/responses/input_tokens 与实际用量一致',
    explain: `依据 ${DOC}/token-counting：POST /v1/responses/input_tokens 接受与 /v1/responses 相同的请求体，返回 {object:"response.input_tokens", input_tokens}，计数含 Meta 注入的隐藏上下文。再用同一请求体生成一次，两次 input_tokens 必须相等。接口 404 或不相等记失败。`,
    run: countRun('responses'),
  }),
  spec({
    id: 'spec-muse-anthropic-count-tokens', topic: 'api', format: 'anthropic', expect: 'accept',
    name: 'Messages · Token 计数接口', desc: 'POST /v1/messages/count_tokens 与实际用量一致',
    explain: `依据 ${DOC}/token-counting：POST /v1/messages/count_tokens 接受完整的 /v1/messages 请求体，返回 {input_tokens}。再用同一请求体生成一次，两次必须相等。`,
    run: countRun('anthropic'),
  }),
  ...(['chat', 'responses', 'anthropic'] as const).flatMap(format => {
    const label = format === 'chat' ? 'Chat' : format === 'responses' ? 'Responses' : 'Messages'
    return [
      spec({
        id: `spec-muse-${format}-error-model`, topic: 'api', format, expect: 'accept',
        name: `${label} · 错误格式：无效模型`, desc: '应返回 404 + model_not_found',
        explain: `依据 ${DOC}/error-handling：失败统一是 {error:{message,type,param,code}}；无效模型返回 HTTP 404，type=invalid_request_error，code=model_not_found。状态码或字段对不上记失败（网关用 503、400 表示模型不存在也算偏差）；401/403/408/429、超时与网络错误记异常。`,
        run: errorShapeRun(format, 'model'),
      }),
      spec({
        id: `spec-muse-${format}-error-param`, topic: 'api', format, expect: 'accept',
        name: `${label} · 错误格式：非法参数`, desc: 'top_p=1.5 应返回 400 + param=top_p',
        explain: `依据 ${DOC}/error-handling：参数非法返回 HTTP 400，type=invalid_request_error，param 指向出错字段（官方示例就是 top_p）。发 top_p=1.5，要求 400 且 error.param=top_p。`,
        run: errorShapeRun(format, 'param'),
      }),
    ]
  }),
]

// ── 官方约束（400） ─────────────────────────────────────────────────────

const effectTool = (format: ProbeFormat, expectCall: boolean) => (r: MuseSpecReply): MuseEffect => {
  const n = toolCallCount(format, r.data)
  if (expectCall) return n > 0 ? { tookEffect: true, detail: `无关提示下仍调用了 ${n} 个工具` } : { tookEffect: false, detail: '没有调用工具' }
  return n === 0 ? { tookEffect: true, detail: '「必须调用」的提示下没有调用工具' } : { tookEffect: false, detail: `仍调用了 ${n} 个工具` }
}

/**
 * 计数提示配 stop ["5"]：依次数出 1 到 4、却没有 5–9，说明 stop 生效；出现 6–9 说明被丢弃。
 * 回复里看不到计数（比如只有 OK）就判不出。
 */
const effectStopAtFive = (text: string): MuseEffect => {
  const t = String(text || '')
  if (/[6-9]/.test(t)) return { tookEffect: false, detail: `回复数到了 5 之后（${clip(t, 40)}）` }
  if (/1\D+2\D+3\D+4/.test(t) && !/[5-9]/.test(t)) return { tookEffect: true, detail: `回复数到 4 就停了（${clip(t, 40)}）` }
  return { tookEffect: null, detail: `回复里看不出计数（${clip(t, 40)}）` }
}

const nonEmpty = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object'

const recursiveSchema = {
  type: 'object',
  properties: { node: { $ref: '#/$defs/node' } },
  $defs: { node: { type: 'object', properties: { child: { $ref: '#/$defs/node' } } } },
}

const imagesBody = (model: string, count: number): Record<string, any> => ({
  ...base(model, 'chat'),
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'How many images are attached? Reply with a number.' },
    ...Array.from({ length: count }, () => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${PROBE_RED_PNG_B64}` } })),
  ] }],
})

const webSearchControl = (model: string): Record<string, any> => ({
  ...base(model, 'anthropic', SEARCH_PROMPT),
  tools: [{ type: 'web_search' }],
})

const constraintCases: MuseSpecCase[] = [
  // Chat
  reject({
    id: 'spec-muse-chat-tool-required', format: 'chat', what: 'tool_choice=required', name: 'Chat · tool_choice=required',
    explain: `依据 ${DOC}/tool-calling：Chat 与 Responses 只接受 auto。提示与工具无关（Reply with exactly: OK），2xx 时出现工具调用说明 required 生效`,
    build: model => ({ ...withTools(model, 'chat', OK_PROMPT), tool_choice: 'required' }),
    effect: effectTool('chat', true),
  }),
  reject({
    id: 'spec-muse-chat-tool-none', format: 'chat', what: 'tool_choice=none', name: 'Chat · tool_choice=none',
    explain: `依据 ${DOC}/tool-calling：none 同样返回 400。提示要求必须调用，2xx 时没有调用说明 none 生效`,
    build: model => ({ ...withTools(model, 'chat', FORCE_PROMPT), tool_choice: 'none' }),
    effect: effectTool('chat', false),
  }),
  reject({
    id: 'spec-muse-chat-tool-named', format: 'chat', what: 'tool_choice 指定函数', name: 'Chat · tool_choice 指定函数',
    explain: `依据 ${DOC}/tool-calling：指定函数的 tool_choice 返回 400。提示与工具无关，2xx 时出现调用说明生效`,
    build: model => withTools(model, 'chat', OK_PROMPT, { name: PROBE_WEATHER_TOOL.name }),
    effect: effectTool('chat', true),
  }),
  reject({
    id: 'spec-muse-chat-stop', format: 'chat', what: 'stop', name: 'Chat · stop',
    explain: `依据 ${DOC}/protocols/chat-completions：stop 在推理模型上返回 400。提示让模型从 1 数到 9，stop:["5"]；2xx 时回复停在 5 之前说明生效`,
    build: model => ({ ...base(model, 'chat', COUNT_PROMPT), stop: ['5'] }),
    effect: r => effectStopAtFive(r.text),
  }),
  reject({
    id: 'spec-muse-chat-n2', format: 'chat', what: 'n=2', name: 'Chat · n=2',
    explain: `依据 ${DOC}/protocols/chat-completions：n 只能为 1。2xx 时返回 2 个以上 choices 说明生效`,
    build: model => ({ ...base(model, 'chat'), n: 2 }),
    effect: r => {
      const n = asArr(asObj(r.data)?.choices).length
      return n >= 2 ? { tookEffect: true, detail: `返回了 ${n} 个 choices` } : { tookEffect: false, detail: `只返回 ${n} 个 choice` }
    },
  }),
  reject({
    id: 'spec-muse-chat-logprobs', format: 'chat', what: 'logprobs=true', name: 'Chat · logprobs',
    explain: `依据 ${DOC}/protocols/chat-completions 与 ${DOC}/reasoning：推理模型不支持 logprobs。2xx 时 choices[0].logprobs.content 非空说明生效`,
    build: model => ({ ...base(model, 'chat'), logprobs: true }),
    effect: r => {
      const lp = asObj(asArr(asObj(r.data)?.choices)[0])?.logprobs
      return nonEmpty(asObj(lp)?.content) ? { tookEffect: true, detail: '返回了 logprobs.content' } : { tookEffect: false, detail: 'logprobs 为空' }
    },
  }),
  reject({
    id: 'spec-muse-chat-web-search-options', format: 'chat', what: 'web_search_options', name: 'Chat · web_search_options',
    explain: `依据 ${DOC}/protocols/chat-completions：Chat 不提供搜索，web_search_options 返回 400。提示问今日头条；2xx 时出现 url_citation 说明真的搜了`,
    build: model => ({ ...base(model, 'chat', SEARCH_PROMPT), web_search_options: {} }),
    effect: r => {
      const ann = asArr(chatMessage(r.data)?.annotations)
      return ann.some(a => asObj(a)?.type === 'url_citation') ? { tookEffect: true, detail: '回复带 url_citation' } : { tookEffect: false, detail: '没有 url_citation' }
    },
  }),
  reject({
    id: 'spec-muse-chat-modalities', format: 'chat', what: 'modalities', name: 'Chat · modalities',
    explain: `依据 ${DOC}/protocols/chat-completions：modalities 任意值都返回 400。没有可观测的效果，2xx 只能记「无法判断」`,
    build: model => ({ ...base(model, 'chat'), modalities: ['text'] }),
  }),
  reject({
    id: 'spec-muse-chat-max-output-tokens', format: 'chat', what: 'max_output_tokens', name: 'Chat · max_output_tokens',
    explain: `依据 ${DOC}/protocols/chat-completions：max_output_tokens 是 Responses 字段，Chat 上返回 400。只带 max_output_tokens=16 并要求长输出；2xx 时 finish_reason=length 说明生效`,
    build: model => {
      const body = base(model, 'chat', PROBE_TRUNCATION_PROMPT)
      delete body.max_completion_tokens
      return { ...body, max_output_tokens: 16 }
    },
    effect: r => {
      const reason = asObj(asArr(asObj(r.data)?.choices)[0])?.finish_reason
      return reason === 'length' ? { tookEffect: true, detail: 'finish_reason=length' } : { tookEffect: false, detail: `finish_reason=${reason ?? '缺失'}` }
    },
  }),
  reject({
    id: 'spec-muse-chat-audio-output', format: 'chat', what: 'audio 参数', name: 'Chat · audio 输出参数',
    explain: `依据 ${DOC}/protocols/chat-completions 兼容表：audio 返回 400（没有音频输出）。2xx 时 message.audio 存在说明生效`,
    build: model => ({ ...base(model, 'chat'), audio: { voice: 'alloy', format: 'wav' } }),
    effect: r => (chatMessage(r.data)?.audio ? { tookEffect: true, detail: '返回了 message.audio' } : { tookEffect: false, detail: '没有 message.audio' }),
  }),
  reject({
    id: 'spec-muse-chat-logit-bias', format: 'chat', what: 'logit_bias', name: 'Chat · logit_bias',
    explain: `依据 ${DOC}/protocols/chat-completions 兼容表：logit_bias 返回 400`,
    build: model => ({ ...base(model, 'chat'), logit_bias: { '1': -100 } }),
  }),
  reject({
    id: 'spec-muse-chat-prediction', format: 'chat', what: 'prediction', name: 'Chat · prediction',
    explain: `依据 ${DOC}/protocols/chat-completions 兼容表：prediction 返回 400`,
    build: model => ({ ...base(model, 'chat'), prediction: { type: 'content', content: 'OK' } }),
  }),
  reject({
    id: 'spec-muse-chat-verbosity', format: 'chat', what: 'verbosity', name: 'Chat · verbosity',
    explain: `依据 ${DOC}/protocols/chat-completions 兼容表：verbosity 返回 400`,
    build: model => ({ ...base(model, 'chat'), verbosity: 'low' }),
  }),
  reject({
    id: 'spec-muse-chat-text-format', format: 'chat', what: 'text.format', name: 'Chat · text.format',
    explain: `依据 ${DOC}/protocols/chat-completions：text.format 是 Responses 参数，Chat 上返回 400，应改用 response_format。提示只要回 OK；2xx 时输出变成 {ok:boolean} 的 JSON 说明生效`,
    build: model => ({ ...base(model, 'chat'), text: { format: { type: 'json_schema', name: 'probe', strict: true, schema: PROBE_JSON_SCHEMA } } }),
    effect: r => (oracleSchemaOk(r.text).passed ? { tookEffect: true, detail: '输出符合 JSON schema' } : { tookEffect: false, detail: `输出不是 schema JSON（${clip(r.text, 40)}）` }),
  }),
  reject({
    id: 'spec-muse-chat-top-p-zero', format: 'chat', what: 'top_p=0', name: 'Chat · top_p=0',
    explain: `依据 ${DOC}/protocols/chat-completions：top_p 须满足 0 < top_p ≤ 1，top_p: 0 返回 400`,
    build: model => ({ ...base(model, 'chat'), top_p: 0 }),
  }),
  reject({
    id: 'spec-muse-chat-custom-tool', format: 'chat', what: 'custom 工具', name: 'Chat · custom 工具',
    explain: `依据 ${DOC}/tool-calling：custom 工具只在 Responses 上可用，发到 Chat 返回 400`,
    build: model => ({ ...base(model, 'chat'), tools: [{ type: 'custom', name: 'echo_text', description: 'Echo the given text back verbatim.' }] }),
  }),
  reject({
    id: 'spec-muse-chat-strict-tool-violation', format: 'chat', what: 'strict 函数的不合规 schema', name: 'Chat · strict 函数 schema 不合规',
    explain: `依据 ${DOC}/tool-calling：strict:true 时 schema 违反严格子集（缺 additionalProperties:false）返回 400`,
    build: model => strictToolBody(model, 'chat', { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }),
  }),
  reject({
    id: 'spec-muse-chat-strict-schema-violation', format: 'chat', what: 'strict 结构化输出的不合规 schema', name: 'Chat · strict 结构化输出 schema 不合规',
    explain: `依据 ${DOC}/structured-output：strict:true 时每个对象都要 additionalProperties:false 且 required 列全，违反返回 400`,
    build: model => ({ ...base(model, 'chat', 'Return a JSON object with ok=true.'), response_format: { type: 'json_schema', json_schema: { name: 'probe', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } }),
  }),
  reject({
    id: 'spec-muse-chat-recursive-schema', format: 'chat', what: '递归 schema', name: 'Chat · 递归 schema',
    explain: `依据 ${DOC}/structured-output：递归（$ref 成环）的 schema 无论 strict 与否都返回 400`,
    build: model => ({ ...base(model, 'chat', 'Return a JSON object.'), response_format: { type: 'json_schema', json_schema: { name: 'probe', strict: false, schema: recursiveSchema } } }),
  }),
  reject({
    id: 'spec-muse-chat-too-many-images', format: 'chat', what: '51 张图片', name: 'Chat · 超过 50 张图片',
    explain: `依据 ${DOC}/image-understanding：每个请求最多 50 张图，超过返回 400。发 51 张 32×32 红图`,
    build: model => imagesBody(model, 51),
  }),
  // Responses
  reject({
    id: 'spec-muse-responses-tool-required', format: 'responses', what: 'tool_choice=required', name: 'Responses · tool_choice=required',
    explain: `依据 ${DOC}/tool-calling：只支持 auto。提示与工具无关，2xx 时出现 function_call 说明生效`,
    build: model => ({ ...withTools(model, 'responses', OK_PROMPT), tool_choice: 'required' }),
    effect: effectTool('responses', true),
  }),
  reject({
    id: 'spec-muse-responses-tool-none', format: 'responses', what: 'tool_choice=none', name: 'Responses · tool_choice=none',
    explain: `依据 ${DOC}/tool-calling：none 返回 400。提示要求必须调用，2xx 时没有调用说明生效`,
    build: model => ({ ...withTools(model, 'responses', FORCE_PROMPT), tool_choice: 'none' }),
    effect: effectTool('responses', false),
  }),
  reject({
    id: 'spec-muse-responses-tool-named', format: 'responses', what: 'tool_choice 指定函数', name: 'Responses · tool_choice 指定函数',
    explain: `依据 ${DOC}/tool-calling：指定函数返回 400。提示与工具无关，2xx 时出现调用说明生效`,
    build: model => withTools(model, 'responses', OK_PROMPT, { name: PROBE_WEATHER_TOOL.name }),
    effect: effectTool('responses', true),
  }),
  reject({
    id: 'spec-muse-responses-truncation', format: 'responses', what: 'truncation=auto', name: 'Responses · truncation=auto',
    explain: `依据 ${DOC}/protocols/responses：只接受默认的 disabled，truncation:"auto" 返回 400`,
    build: model => ({ ...base(model, 'responses'), truncation: 'auto' }),
  }),
  reject({
    id: 'spec-muse-responses-background-stream', format: 'responses', what: 'background 与 stream 同时为 true', name: 'Responses · background + stream',
    explain: `依据 ${DOC}/protocols/responses：创建时 background 不能与 stream:true 同用，返回 400`,
    build: model => ({ ...base(model, 'responses'), background: true, stream: true }),
  }),
  reject({
    id: 'spec-muse-responses-logprobs', format: 'responses', what: 'include message.output_text.logprobs', name: 'Responses · include logprobs',
    explain: `依据 ${DOC}/protocols/responses：include message.output_text.logprobs 返回 400。2xx 时 output_text.logprobs 非空说明生效`,
    build: model => ({ ...base(model, 'responses'), include: ['message.output_text.logprobs'] }),
    effect: r => {
      const parts = responsesOutput(r.data).flatMap(it => asArr(it.content)).map(asObj)
      return parts.some(p => p?.type === 'output_text' && nonEmpty(p.logprobs)) ? { tookEffect: true, detail: 'output_text 带了 logprobs' } : { tookEffect: false, detail: 'logprobs 为空' }
    },
  }),
  reject({
    id: 'spec-muse-responses-include-unknown', format: 'responses', what: 'include 未知值', name: 'Responses · include 未知值',
    explain: `依据 ${DOC}/protocols/responses：include 传未知值返回 400`,
    build: model => ({ ...base(model, 'responses'), include: ['probe.unknown_value'] }),
  }),
  reject({
    id: 'spec-muse-responses-max-output-min', format: 'responses', what: 'max_output_tokens=15', name: 'Responses · max_output_tokens 低于 16',
    explain: `依据 ${DOC}/protocols/responses：max_output_tokens 最小 16，传 15 应被拒`,
    build: model => ({ ...base(model, 'responses'), max_output_tokens: 15 }),
  }),
  spec({
    id: 'spec-muse-responses-prev-id-encrypted', topic: 'constraint', format: 'responses', expect: 'reject',
    what: 'previous_response_id 与 include reasoning.encrypted_content 同用',
    name: 'Responses · previous_response_id + 加密推理',
    desc: '两者不能同用，应返回 400',
    explain: `依据 ${DOC}/protocols/responses：previous_response_id 不能与 include:["reasoning.encrypted_content"] 同用。先 store 一发拿到 id（对照），再带 previous_response_id 与该 include 续接。对照不通记依据不足；4xx 记通过，2xx 记失败。`,
    run: async deps => {
      const r1 = await deps.send({ format: 'responses', label: '对照 store', body: { ...base(deps.model, 'responses'), store: true } })
      const bad1 = museAbnormalOf(r1)
      if (bad1) return { ...bad1, decisive: 0 }
      const id = r1.ok ? responseId(r1.data) : null
      if (!id) return { status: 'inconclusive', detail: `依据不足：对照请求没有拿到可续接的 id（HTTP ${r1.status}）`, decisive: 0 }
      if (deps.stopped()) return { status: 'skipped', detail: MUSE_STOP_DETAIL }
      const r2 = await deps.send({ format: 'responses', body: { ...base(deps.model, 'responses', TURN2), previous_response_id: id, include: ['reasoning.encrypted_content'] } })
      const scored = scoreMuseSpecReply({ expect: 'reject', what: 'previous_response_id 与 include reasoning.encrypted_content 同用', name: '' }, r2, deps.ctx)
      return { ...scored, decisive: 1 }
    },
  }),
  reject({
    id: 'spec-muse-responses-reserved-tool-name', format: 'responses', what: '函数名与内置工具重名', name: 'Responses · 函数名用 web_search',
    explain: `依据 ${DOC}/error-handling：函数名与保留的内置工具名冲突返回 400（param=tools）。声明一个叫 web_search 的函数`,
    build: model => ({ ...base(model, 'responses'), tools: [{ type: 'function', name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }] }),
  }),
  // Messages
  reject({
    id: 'spec-muse-anthropic-stop-sequences', format: 'anthropic', what: 'stop_sequences', name: 'Messages · stop_sequences',
    explain: `依据 ${DOC}/protocols/messages：stop_sequences 返回 400。提示让模型从 1 数到 9，stop_sequences:["5"]；2xx 时 stop_reason=stop_sequence 或回复停在 5 之前说明生效`,
    build: model => ({ ...base(model, 'anthropic', COUNT_PROMPT), stop_sequences: ['5'] }),
    effect: r => (asObj(r.data)?.stop_reason === 'stop_sequence' ? { tookEffect: true, detail: 'stop_reason=stop_sequence' } : effectStopAtFive(r.text)),
  }),
  reject({
    id: 'spec-muse-anthropic-top-k', format: 'anthropic', what: 'top_k', name: 'Messages · top_k',
    explain: `依据 ${DOC}/protocols/messages：top_k 返回 400`,
    build: model => ({ ...base(model, 'anthropic'), top_k: 5 }),
  }),
  reject({
    id: 'spec-muse-anthropic-unknown-field', format: 'anthropic', what: '未知顶层字段 probe_unknown_field', name: 'Messages · 未知顶层字段',
    explain: `依据 ${DOC}/protocols/messages：未知的顶层字段会被拒绝（页面没写状态码，任一 4xx 都算）`,
    build: model => ({ ...base(model, 'anthropic'), probe_unknown_field: true }),
  }),
  reject({
    id: 'spec-muse-anthropic-tool-named', format: 'anthropic', what: 'tool_choice={type:"tool"}', name: 'Messages · tool_choice 指定工具',
    explain: `依据 ${DOC}/protocols/messages：指定工具的 tool_choice 返回 400。提示与工具无关，2xx 时出现 tool_use 说明生效`,
    build: model => withTools(model, 'anthropic', OK_PROMPT, { name: PROBE_WEATHER_TOOL.name }),
    effect: effectTool('anthropic', true),
  }),
  reject({
    id: 'spec-muse-anthropic-web-search-max-uses', format: 'anthropic', what: 'web_search.max_uses', name: 'Messages · web_search max_uses',
    explain: `依据 ${DOC}/search-grounding：Messages 的 web_search 带 max_uses 返回 400。先发不带 max_uses 的对照，对照不通记依据不足`,
    control: webSearchControl,
    build: model => ({ ...webSearchControl(model), tools: [{ type: 'web_search', max_uses: 1 }] }),
  }),
  reject({
    id: 'spec-muse-anthropic-web-search-allowed-domains', format: 'anthropic', what: 'web_search.allowed_domains', name: 'Messages · web_search allowed_domains',
    explain: `依据 ${DOC}/search-grounding：allowed_domains 返回 400。先发对照，对照不通记依据不足`,
    control: webSearchControl,
    build: model => ({ ...webSearchControl(model), tools: [{ type: 'web_search', allowed_domains: ['reuters.com'] }] }),
  }),
  reject({
    id: 'spec-muse-anthropic-web-search-blocked-domains', format: 'anthropic', what: 'web_search.blocked_domains', name: 'Messages · web_search blocked_domains',
    explain: `依据 ${DOC}/search-grounding：blocked_domains 返回 400。先发对照，对照不通记依据不足`,
    control: webSearchControl,
    build: model => ({ ...webSearchControl(model), tools: [{ type: 'web_search', blocked_domains: ['example.com'] }] }),
  }),
  reject({
    id: 'spec-muse-anthropic-container', format: 'anthropic', what: 'container', name: 'Messages · container',
    explain: `依据 ${DOC}/protocols/messages：container 返回 400`,
    build: model => ({ ...base(model, 'anthropic'), container: 'probe-container' }),
  }),
  reject({
    id: 'spec-muse-anthropic-inference-geo', format: 'anthropic', what: 'inference_geo', name: 'Messages · inference_geo',
    explain: `依据 ${DOC}/protocols/messages：inference_geo 返回 400`,
    build: model => ({ ...base(model, 'anthropic'), inference_geo: 'us' }),
  }),
  reject({
    id: 'spec-muse-anthropic-service-tier', format: 'anthropic', what: 'service_tier=priority', name: 'Messages · service_tier 非法值',
    explain: `依据 ${DOC}/protocols/messages：service_tier 只接受 auto 与 standard_only，其它值返回 400`,
    build: model => ({ ...base(model, 'anthropic'), service_tier: 'priority' }),
  }),
  reject({
    id: 'spec-muse-anthropic-system-image', format: 'anthropic', what: 'system 里的图片块', name: 'Messages · system 放非文本块',
    explain: `依据 ${DOC}/protocols/messages：system 只接受 text 块，其它块类型返回 400`,
    build: model => ({ ...base(model, 'anthropic'), system: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PROBE_RED_PNG_B64 } }] }),
  }),
  reject({
    id: 'spec-muse-anthropic-thinking-budget-low', format: 'anthropic', what: 'thinking.budget_tokens=512', name: 'Messages · thinking budget 低于 1024',
    explain: `依据 ${DOC}/protocols/messages：thinking enabled 要求 budget_tokens ≥ 1024，传 512 应被拒`,
    build: model => ({ ...base(model, 'anthropic'), thinking: { type: 'enabled', budget_tokens: 512 } }),
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
  ...reasoningCases, ...toolsCases, ...searchCases, ...multimodalCases,
  ...stateCases, ...apiCases, ...constraintCases, ...identityCases,
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
