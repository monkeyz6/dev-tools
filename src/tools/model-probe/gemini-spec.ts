import type { ProbeCheck } from './oracles.ts'
import { oracleCodeword, oracleDominantRed, oracleSchemaOk, oracleSystemOk, oracleToolNamed, oracleUnsupportedVision, probeOutputLimitReached } from './oracles.ts'
import { scoreExpectedReject } from './negative.ts'
import {
  GEMINI_CAP,
  PROBE_IMAGE_PROMPT,
  PROBE_RED_PNG_B64,
  PROBE_SCHEMA_PROMPT,
  PROBE_SYSTEM_INSTRUCTION,
  PROBE_SYSTEM_USER,
  PROBE_TOOL_FORCE_PROMPT,
  PROBE_TRUNCATION_CAP,
  PROBE_TRUNCATION_PROMPT,
  PROBE_WEATHER_PARAMS,
  PROBE_WEATHER_TOOL,
  PROBE_MULTITURN_TURN1,
  PROBE_MULTITURN_TURN2,
  type ProbeSseEvent,
  type ProbeUsage,
  geminiFinishReason,
  geminiFunctionCalls,
  geminiGenerateContentUrl,
  geminiGrounded,
  geminiModelContent,
  geminiModelVersion,
  geminiReadUsage,
  geminiSseHasBothUsage,
  geminiStreamUrl,
  geminiThoughtsTokenCount,
  geminiVisibleText,
  probeEmptyUsage,
} from './protocol.ts'

export const GEMINI_BASIC_ID = 'gemini-basic'
export const GEMINI_ERROR_MODEL = 'probe-no-such-model'
export const GEMINI_CACHE_CHARS = 4096 * 4
export const GEMINI_SEARCH_PROMPT = 'Search the web first, then reply with one recent news item and its source URL.'
export const GEMINI_PURE_PROMPT = '讲个笑话'
export const GEMINI_STOP_DETAIL = '测试被用户中止'
export const GEMINI_MIXED_MESSAGE = 'Gemini 与 Chat / Responses / Anthropic 不能同时开启。重新勾选 Gemini 会清掉其它协议；也可以先取消 Gemini。'

const LISTED_IDS = ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'] as const
const LISTED = new Set<string>(LISTED_IDS)

export type GeminiListedId = typeof LISTED_IDS[number]
export type GeminiMinimalPolicy = 'accept' | 'reject' | 'plain'

export interface GeminiProbeCase {
  id: string
  group: string
  name: string
  desc: string
  explain: string
  defaultOn: boolean
}

export const GEMINI_PROBE_CASES: GeminiProbeCase[] = [
  {
    id: GEMINI_BASIC_ID, group: '协议基础', name: 'Gemini generateContent',
    desc: '验证 :generateContent 基础请求与用量',
    explain: '与 Chat / Responses / Anthropic 互斥。勾选后只跑这一套 generateContent。请求头是 x-goog-api-key，模型名在路径里。2xx 必须带回 promptTokenCount 与 candidatesTokenCount（0 合法）。modelVersion 只展示在说明里，不参与通过与否。gemini-3.7-flash 自 2026-10-08 起由官方改路由到 gemini-3.8-flash，这里只看请求被接受。',
    defaultOn: true,
  },
  {
    id: 'gemini-temperature', group: '参数与特性', name: 'temperature',
    desc: 'generationConfig.temperature=0.2',
    explain: '接受类带 maxOutputTokens=2048。2xx 且输入与输出 Token 都是数字才通过。4xx 且错误点名 temperature 记不支持，其它 4xx 记失败。不走「预期拒绝」。',
    defaultOn: true,
  },
  {
    id: 'gemini-top-p', group: '参数与特性', name: 'topP',
    desc: 'generationConfig.topP=0.9',
    explain: '接受类带 maxOutputTokens=2048。2xx 且输入与输出 Token 都是数字才通过。4xx 且错误点名 topP 或 top_p 记不支持，其它 4xx 记失败。',
    defaultOn: true,
  },
  {
    id: 'gemini-top-p-range', group: '参数与特性', name: 'topP 越界',
    desc: '发送 topP=2，只看状态码',
    explain: 'generationConfig.topP=2，maxOutputTokens=2048。其它 4xx 记通过，2xx 记失败。401、403、408、429、5xx、超时和网络错误记异常。不看错误正文，也不走「预期拒绝」。',
    defaultOn: true,
  },
  {
    id: 'gemini-max-output', group: '参数与特性', name: 'maxOutputTokens',
    desc: '先接受 2048，再核验 finishReason=MAX_TOKENS',
    explain: '第一发短回复 + maxOutputTokens=2048。点名该字段的 4xx 整格记不支持，不再发第二发。接受后再发「从 1 数到 200」且 maxOutputTokens=16。结束原因不是 MAX_TOKENS 先报结束原因；是 MAX_TOKENS 且用量齐全才通过。也认蛇形 finish_reason。第二发若是 OpenAI 那句输出额度用尽的 400，记失败，不记通过。不发送 65536，也不探测 100 万上限。文档里 3.7 / 3.8 的输出上限是 65536，argon 的输入与输出共享 100 万。',
    defaultOn: true,
  },
  {
    id: 'gemini-structured', group: '参数与特性', name: '结构化输出',
    desc: 'responseSchema 要求 ok 为布尔值',
    explain: 'responseMimeType=application/json，responseSchema 用 OBJECT / BOOLEAN，不带 additionalProperties。2xx、用量齐全且 JSON 的 ok 是布尔值才通过。点名该字段的 4xx 记不支持。',
    defaultOn: true,
  },
  {
    id: 'gemini-tool', group: '参数与特性', name: '函数调用',
    desc: '强制调用 get_weather',
    explain: 'tools[0].functionDeclarations 声明 get_weather，toolConfig.functionCallingConfig.mode=ANY。2xx、用量齐全且某个 part 的 functionCall.name 是 get_weather 才通过。不要求 function response，也不看 thoughtSignature。点名 tools 或 function 的 4xx 记不支持。',
    defaultOn: true,
  },
  {
    id: 'gemini-thinking-low', group: '参数与特性', name: 'thinking low',
    desc: 'thinkingLevel=low',
    explain: '四个点名模型都应 2xx 并带回用量。不读 thoughtsTokenCount，不设 includeThoughts，也不要求思考正文。未点名的模型：2xx 且用量齐全才通过，4xx 点名 thinking 记不支持。',
    defaultOn: true,
  },
  {
    id: 'gemini-thinking-medium', group: '参数与特性', name: 'thinking medium',
    desc: 'thinkingLevel=medium',
    explain: 'medium 是这四个模型的文档默认档。判定与 low 相同：点名模型必须接受，未点名的按普通参数。不比较思考 token。',
    defaultOn: true,
  },
  {
    id: 'gemini-thinking-minimal', group: '参数与特性', name: 'thinking minimal',
    desc: 'thinkingLevel=minimal',
    explain: '只有 gemini-3.6-flash 应接受。gemini-4-argon、gemini-3.8-flash、gemini-3.7-flash 必须被拒绝：其它 4xx 通过，2xx 失败。HTTP 404 记失败，不算参数被拒绝。400 若是输出额度用尽那句，说明参数已被接受，记失败。路径里的模型名保持原样，不剥 vendor/ 前缀。未点名的模型按普通参数。带日期的快照不套这四条规则。',
    defaultOn: true,
  },
  {
    id: 'gemini-thinking-high', group: '参数与特性', name: 'thinking high',
    desc: 'thinkingLevel=high',
    explain: '判定与 low 相同。high 更慢，默认不勾。',
    defaultOn: false,
  },
  {
    id: 'gemini-stream', group: '传输与稳定性', name: 'SSE 流式',
    desc: 'streamGenerateContent?alt=sse，带 2048 上限',
    explain: '通过条件：SSE 能解析，且同一个事件里同时有 promptTokenCount 与 candidatesTokenCount。不要求 [DONE]。用量拆在两个事件里不算通过。',
    defaultOn: true,
  },
  {
    id: 'gemini-stream-pure', group: '传输与稳定性', name: '纯流式',
    desc: '同一流式地址，不带 generationConfig',
    explain: '提示词是「讲个笑话」，不写 maxOutputTokens。用来看渠道是不是只有带上限才回用量。通过条件与 SSE 流式相同。',
    defaultOn: true,
  },
  {
    id: 'gemini-token', group: '传输与稳定性', name: 'Token 计算稳定性',
    desc: '同一短句重复计数',
    explain: '提示词固定为 Reply with exactly: OK，次数跟左侧「重复请求次数」（2 到 10，默认 3）。只比较 promptTokenCount。输出和思考 token 不比较。401、403、408、429、5xx、超时和网络错误记异常，并停止后面的次数。其它非 2xx（含 400、404、422）记「失败：HTTP n」并停止，即使正文里有 promptTokenCount 也不拿来比较。只有 2xx 缺少数字型 promptTokenCount 才记「没有数字型 promptTokenCount」。',
    defaultOn: true,
  },
  {
    id: 'gemini-cache', group: '缓存能力', name: '隐式缓存',
    desc: '同一长前缀发两次，读缓存字段',
    explain: '前缀按约 4 字符 / token 生成到至少 4096 token（16384 字符），开头另加本次 nonce。只发两次，不调用 cachedContents 创建接口。第二次 cachedContentTokenCount 或 totalCachedTokens 大于 0 记通过；字段在且为 0 记符合预期（官方不保证命中）；字段缺失记不支持。第一次失败则不再发第二次。',
    defaultOn: true,
  },
  {
    id: 'gemini-system', group: '补充场景', name: 'System 提示词',
    desc: 'systemInstruction 要求回复 SYSTEM_OK',
    explain: 'systemInstruction 为 Always reply exactly SYSTEM_OK，用户消息是 Respond now，maxOutputTokens=2048。正文不含 SYSTEM_OK 记失败。正文符合后再看用量，缺了记缺少输入/输出 Token。',
    defaultOn: true,
  },
  {
    id: 'gemini-multi-turn', group: '补充场景', name: '多轮对话',
    desc: '原样回传第一跳 content，再问口令',
    explain: '第一跳记住 ORBIT。第二跳把 candidates[0].content 原样放回 contents（含 thought 与签名，不补 role），再要口令。第二跳正文含 ORBIT 且用量齐全才通过。第一跳没有 model content 则失败，不发第二跳。',
    defaultOn: true,
  },
  {
    id: 'gemini-error', group: '补充场景', name: '错误码规范性',
    desc: '路径里的模型名换成不存在的 id',
    explain: '请求发到 /v1beta/models/probe-no-such-model:generateContent。4xx 与 5xx 都要正文是带 error.message、error.status 或 error.code 的对象才通过。中转常用 503 加这个对象表示模型不存在。没有这个对象的 4xx 记失败，没有这个对象的 5xx 记异常。2xx 记失败。401、403、408、429、超时和网络错误记异常。',
    defaultOn: true,
  },
  {
    id: 'gemini-concurrency', group: '补充场景', name: '并发请求稳定性',
    desc: '并行 3 个基础请求',
    explain: '三发并行，提示 Reply only N，遇 429 不重试。三发都 2xx 且用量齐全才通过。三发都成功但缺用量记失败。少了任何一发也记失败，不记异常。',
    defaultOn: true,
  },
  {
    id: 'gemini-image', group: '补充场景', name: '图片输入',
    desc: '内嵌 32×32 纯红 PNG',
    explain: 'inline_data 的 data 是不带 data: 前缀的原始 base64，另加一句问主色。正文含 red 且用量齐全才通过。4xx 且错误像 vision / image 记不支持，其它 4xx 记失败。默认不勾。不测视频、音频、PDF，也不测出图。',
    defaultOn: false,
  },
  {
    id: 'gemini-search', group: '补充场景', name: 'Google 搜索',
    desc: 'tools 只带 google_search',
    explain: '只发 tools:[{google_search:{}}]，不带 url_context，也不带 tool_choice。2xx、用量齐全且 groundingMetadata 里 webSearchQueries、groundingChunks、groundingSupports、searchEntryPoint 至少一项非空才通过。2xx 但没有证据记异常。其它明确 4xx 记不支持。搜索可能单独计费。默认不勾。',
    defaultOn: false,
  },
]

const GEMINI_ID_LIST = GEMINI_PROBE_CASES.map(c => c.id)
const GEMINI_ID_SET = new Set(GEMINI_ID_LIST)

export const geminiCaseById = (id: string): GeminiProbeCase | undefined => GEMINI_PROBE_CASES.find(c => c.id === id)

export function geminiListedId(model: string): GeminiListedId | null {
  const raw = String(model || '').trim().toLowerCase()
  const slash = raw.lastIndexOf('/')
  const id = slash >= 0 ? raw.slice(slash + 1) : raw
  return LISTED.has(id) ? id as GeminiListedId : null
}

export function geminiMinimalPolicy(model: string): GeminiMinimalPolicy {
  const id = geminiListedId(model)
  if (id === 'gemini-3.6-flash') return 'accept'
  if (id === 'gemini-4-argon' || id === 'gemini-3.8-flash' || id === 'gemini-3.7-flash') return 'reject'
  return 'plain'
}

export function geminiBasicsMixed(selected: Record<string, boolean>): boolean {
  if (!selected[GEMINI_BASIC_ID]) return false
  return !!(selected['chat-basic'] || selected['responses-basic'] || selected['anthropic-basic'])
}

/** 四个协议基础勾选的互斥。关掉只翻自己；打开 Gemini 清掉其它协议并套上 Gemini 默认勾选。 */
export function toggleProbeBasic(prev: Record<string, boolean>, id: string, otherCaseIds: readonly string[]): Record<string, boolean> {
  const turningOn = !prev[id]
  if (!turningOn) return { ...prev, [id]: false }
  if (id === GEMINI_BASIC_ID) {
    const next: Record<string, boolean> = { ...prev }
    const clear = new Set<string>(otherCaseIds)
    for (const key of Object.keys(next)) {
      if (!GEMINI_ID_SET.has(key)) clear.add(key)
    }
    for (const key of clear) {
      if (key !== GEMINI_BASIC_ID) next[key] = false
    }
    for (const item of GEMINI_PROBE_CASES) next[item.id] = item.defaultOn
    next[GEMINI_BASIC_ID] = true
    return next
  }
  if (id === 'chat-basic' || id === 'responses-basic' || id === 'anthropic-basic') {
    const next: Record<string, boolean> = { ...prev, [id]: true }
    for (const gid of GEMINI_ID_LIST) next[gid] = false
    return next
  }
  return { ...prev, [id]: true }
}

/** 全选 / 全不选。Gemini 关闭时不勾上 gemini-basic，并清掉已存的 Gemini 项。 */
export function fillProbeSelection(prev: Record<string, boolean>, visibleIds: readonly string[], on: boolean, geminiMode: boolean): Record<string, boolean> {
  const next: Record<string, boolean> = { ...prev }
  if (!geminiMode) {
    for (const id of visibleIds) {
      if (GEMINI_ID_SET.has(id)) continue
      next[id] = on
    }
    for (const id of GEMINI_ID_LIST) next[id] = false
    return next
  }
  for (const id of visibleIds) next[id] = on
  return next
}

const user = (text: string) => ({ role: 'user', parts: [{ text }] })

export function geminiBasicBody(prompt = 'Reply with exactly: OK'): Record<string, unknown> {
  return { contents: [user(prompt)] }
}

function withCap(body: Record<string, unknown>, cap = GEMINI_CAP): Record<string, unknown> {
  const prev = body.generationConfig && typeof body.generationConfig === 'object' && !Array.isArray(body.generationConfig)
    ? body.generationConfig as Record<string, unknown>
    : {}
  return { ...body, generationConfig: { ...prev, maxOutputTokens: cap } }
}

export function geminiTemperatureBody(): Record<string, unknown> {
  return withCap({ ...geminiBasicBody(), generationConfig: { temperature: 0.2 } })
}

export function geminiTopPBody(value = 0.9): Record<string, unknown> {
  return withCap({ ...geminiBasicBody(), generationConfig: { topP: value } })
}

export function geminiMaxFirstBody(): Record<string, unknown> {
  return withCap(geminiBasicBody())
}

export function geminiMaxSecondBody(): Record<string, unknown> {
  return withCap(geminiBasicBody(PROBE_TRUNCATION_PROMPT), PROBE_TRUNCATION_CAP)
}

export function geminiStructuredBody(): Record<string, unknown> {
  return {
    contents: [user(PROBE_SCHEMA_PROMPT)],
    generationConfig: {
      maxOutputTokens: GEMINI_CAP,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { ok: { type: 'BOOLEAN' } },
        required: ['ok'],
      },
    },
  }
}

export function geminiToolBody(): Record<string, unknown> {
  return withCap({
    contents: [user(PROBE_TOOL_FORCE_PROMPT)],
    tools: [{
      functionDeclarations: [{
        name: PROBE_WEATHER_TOOL.name,
        description: PROBE_WEATHER_TOOL.description,
        parameters: PROBE_WEATHER_PARAMS,
      }],
    }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_weather'] } },
  })
}

export function geminiThinkingBody(level: string): Record<string, unknown> {
  return {
    contents: [user('Reply with exactly: OK')],
    generationConfig: { maxOutputTokens: GEMINI_CAP, thinkingConfig: { thinkingLevel: level } },
  }
}

export function geminiSystemBody(): Record<string, unknown> {
  return withCap({
    systemInstruction: { parts: [{ text: PROBE_SYSTEM_INSTRUCTION }] },
    contents: [user(PROBE_SYSTEM_USER)],
  })
}

export function geminiTurn1Body(): Record<string, unknown> {
  return withCap(geminiBasicBody(PROBE_MULTITURN_TURN1))
}

export function geminiTurn2Body(turn1: Record<string, unknown>, modelContent: Record<string, unknown>): Record<string, unknown> {
  const prev = Array.isArray(turn1.contents) ? turn1.contents : []
  return { ...turn1, contents: [...prev, modelContent, user(PROBE_MULTITURN_TURN2)] }
}

export function geminiImageBody(): Record<string, unknown> {
  return withCap({
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'image/png', data: PROBE_RED_PNG_B64 } },
        { text: PROBE_IMAGE_PROMPT },
      ],
    }],
  })
}

export function geminiSearchBody(): Record<string, unknown> {
  return withCap({
    contents: [user(GEMINI_SEARCH_PROMPT)],
    tools: [{ google_search: {} }],
  })
}

export function geminiCachePrompt(nonce: string): string {
  const head = `nonce:${nonce}\n`
  const unit = 'The quick brown fox jumps over the lazy dog. '
  let filler = ''
  while (filler.length < GEMINI_CACHE_CHARS) filler += unit
  return head + filler.slice(0, GEMINI_CACHE_CHARS)
}

export type GeminiTransport = 'http' | 'timeout' | 'network' | 'stopped'

export interface GeminiRound {
  transport: GeminiTransport
  status: number | null
  data: unknown
  text: string
  usage: ProbeUsage
  events: ProbeSseEvent[]
  duration: number
  errorText: string
}

export interface GeminiSendInput {
  label: string
  url: string
  body: Record<string, unknown>
  stream?: boolean
  retryOn429?: boolean
}

export interface GeminiProbeDeps {
  model: string
  root: string
  rounds: number
  nonce: string
  stopped: () => boolean
  send: (req: GeminiSendInput) => Promise<GeminiRound>
}

export interface GeminiScore {
  status: 'passed' | 'failed' | 'abnormal' | 'unsupported' | 'expected' | 'skipped'
  detail: string
  checks?: ProbeCheck[]
}

export interface GeminiOutcome extends GeminiScore {
  usage?: ProbeUsage
  cache?: { hits: number; total: number; reads: number[] }
  tokenValues?: number[]
  duration: number | null
  data: unknown
  httpStatus: number | null
}

const is2xx = (status: number | null): boolean => typeof status === 'number' && status >= 200 && status < 300
const is4xx = (status: number | null): boolean => typeof status === 'number' && status >= 400 && status < 500
const usageReady = (u?: ProbeUsage | null): boolean => !!u && typeof u.input === 'number' && typeof u.output === 'number'
const missingUsage = (label: string): GeminiScore => ({ status: 'failed', detail: `失败：${label} 缺少输入/输出 Token` })

export function geminiErrorText(data: unknown, fallback = ''): string {
  const parts: string[] = []
  if (typeof data === 'string') parts.push(data)
  else if (data && typeof data === 'object') {
    const err = (data as { error?: unknown }).error
    if (err && typeof err === 'object') {
      const rec = err as Record<string, unknown>
      if (typeof rec.message === 'string') parts.push(rec.message)
      if (typeof rec.status === 'string') parts.push(rec.status)
      try { parts.push(JSON.stringify(err)) } catch { /* ignore */ }
    }
    try { parts.push(JSON.stringify(data)) } catch { /* ignore */ }
  }
  if (fallback) parts.push(fallback)
  return parts.filter(Boolean).join('\n')
}

export function geminiErrorNames(text: string, names: string[]): boolean {
  const norm = text.toLowerCase().replace(/[_-]/g, '')
  return names.some(name => norm.includes(name.toLowerCase().replace(/[_-]/g, '')))
}

export function geminiHasErrorObject(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const err = (data as { error?: unknown }).error
  if (!err || typeof err !== 'object' || Array.isArray(err)) return false
  const rec = err as Record<string, unknown>
  return typeof rec.message === 'string' || typeof rec.status === 'string' || typeof rec.code === 'number' || typeof rec.code === 'string'
}

function transportScore(round: GeminiRound): GeminiScore | null {
  if (round.transport === 'stopped') return { status: 'skipped', detail: GEMINI_STOP_DETAIL }
  if (round.transport === 'timeout') return { status: 'abnormal', detail: '异常：请求超时' }
  if (round.transport === 'network') return { status: 'abnormal', detail: '异常：网络错误' }
  if (typeof round.status !== 'number' || !Number.isFinite(round.status) || round.status <= 0) {
    return { status: 'abnormal', detail: '异常：没有 HTTP 状态码' }
  }
  if (round.status === 401 || round.status === 403) return { status: 'abnormal', detail: `异常：鉴权失败（HTTP ${round.status}）` }
  if (round.status === 408 || round.status === 429) return { status: 'abnormal', detail: `异常：HTTP ${round.status}` }
  if (round.status >= 500) return { status: 'abnormal', detail: `异常：HTTP ${round.status}` }
  return null
}

export function scoreGeminiMustAccept(round: GeminiRound, what: string): GeminiScore {
  const bad = transportScore(round)
  if (bad) return bad
  if (!is2xx(round.status)) return { status: 'failed', detail: `失败：${what}（HTTP ${round.status}）` }
  if (!usageReady(round.usage)) return missingUsage(what)
  return { status: 'passed', detail: `通过：${what}` }
}

export function scoreGeminiParam(round: GeminiRound, names: string[], label: string): GeminiScore {
  const bad = transportScore(round)
  if (bad) return bad
  if (is2xx(round.status)) {
    if (!usageReady(round.usage)) return missingUsage(label)
    return { status: 'passed', detail: `通过：接受 ${label}` }
  }
  if (is4xx(round.status) && geminiErrorNames(round.errorText, names)) {
    return { status: 'unsupported', detail: `不支持：${label}（HTTP ${round.status}）` }
  }
  if (is4xx(round.status)) return { status: 'failed', detail: `失败：${label} HTTP ${round.status}` }
  return { status: 'failed', detail: `失败：${label} HTTP ${round.status}` }
}

export function scoreGeminiTopPRange(round: GeminiRound): GeminiScore {
  if (round.transport === 'stopped') return { status: 'skipped', detail: GEMINI_STOP_DETAIL }
  const transport = round.transport === 'http' ? 'http' : round.transport
  const scored = scoreExpectedReject(round.status, transport, 'topP=2')
  return scored.status === 'passed' ? { ...scored, detail: `通过：非法 topP 返回 HTTP ${round.status}` } : scored
}

export function scoreGeminiMaxFirst(round: GeminiRound): { score: GeminiScore | null; sendSecond: boolean } {
  const bad = transportScore(round)
  if (bad) return { score: bad, sendSecond: false }
  if (is2xx(round.status)) return { score: null, sendSecond: true }
  if (is4xx(round.status) && geminiErrorNames(round.errorText, ['maxOutputTokens', 'max_output_tokens'])) {
    return { score: { status: 'unsupported', detail: `不支持：maxOutputTokens（HTTP ${round.status}）` }, sendSecond: false }
  }
  return { score: { status: 'failed', detail: `失败：maxOutputTokens 第一发 HTTP ${round.status}` }, sendSecond: false }
}

export function scoreGeminiMaxSecond(round: GeminiRound): GeminiScore {
  const bad = transportScore(round)
  if (bad) return bad
  if (is2xx(round.status)) {
    const reason = geminiFinishReason(round.data)
    if (reason !== 'MAX_TOKENS') return { status: 'failed', detail: `失败：第二次 finishReason=${reason ?? '缺失'}` }
    if (!usageReady(round.usage)) return missingUsage('maxOutputTokens')
    return { status: 'passed', detail: '通过：finishReason=MAX_TOKENS' }
  }
  if (round.status === 400 && (probeOutputLimitReached(round.data) || probeOutputLimitReached(round.errorText))) {
    return { status: 'failed', detail: '失败：输出额度用尽被报成 400，不记通过' }
  }
  return { status: 'failed', detail: `失败：第二次请求 HTTP ${round.status}` }
}

export function scoreGeminiStream(round: GeminiRound): GeminiScore {
  const bad = transportScore(round)
  if (bad) return bad
  if (!is2xx(round.status)) return { status: 'failed', detail: `失败：流式 HTTP ${round.status}` }
  if (!round.events.length) return { status: 'failed', detail: '失败：没有解析到 SSE 事件' }
  if (!geminiSseHasBothUsage(round.events)) return { status: 'failed', detail: '失败：没有单个 SSE 事件同时带回输入与输出 Token' }
  return { status: 'passed', detail: '通过：SSE 可解析，且有事件同时带回输入与输出 Token' }
}

export function scoreGeminiTokenValues(values: Array<number | null>): GeminiScore {
  if (!values.length || values.some(v => typeof v !== 'number')) {
    return { status: 'failed', detail: '失败：有一轮没有数字型 promptTokenCount' }
  }
  const first = values[0] as number
  if (values.every(v => v === first)) return { status: 'passed', detail: `通过：输入 Token 稳定为 ${first}` }
  return { status: 'failed', detail: `失败：输入 Token 不一致（${values.join('、')}）` }
}

export function scoreGeminiCacheHit(round: GeminiRound): GeminiScore {
  const bad = transportScore(round)
  if (bad) return bad
  if (!is2xx(round.status)) return { status: 'failed', detail: `失败：第二次请求 HTTP ${round.status}` }
  if (!usageReady(round.usage)) return { status: 'failed', detail: '失败：第二次响应缺少输入/输出 Token' }
  if (round.usage.cacheRead == null) return { status: 'unsupported', detail: '不支持：响应没有 cachedContentTokenCount / totalCachedTokens' }
  if (round.usage.cacheRead > 0) return { status: 'passed', detail: `通过：第二次读取缓存 ${round.usage.cacheRead} Token` }
  return { status: 'expected', detail: '符合预期：缓存字段为 0。官方不保证隐式缓存一定命中。' }
}

export function scoreGeminiMustReject(round: GeminiRound, what: string): GeminiScore {
  if (round.transport === 'stopped') return { status: 'skipped', detail: GEMINI_STOP_DETAIL }
  if (round.transport !== 'http') return scoreExpectedReject(round.status, round.transport, what)
  if (round.status === 400 && (probeOutputLimitReached(round.data) || probeOutputLimitReached(round.errorText))) {
    return { status: 'failed', detail: `失败：${what} 被接受（输出额度用尽被报成 400）` }
  }
  if (round.status === 404) return { status: 'failed', detail: `失败：HTTP 404，找不到模型，不算 ${what} 被拒绝` }
  return scoreExpectedReject(round.status, 'http', what)
}

export function scoreGeminiConcurrency(rounds: GeminiRound[]): GeminiScore {
  if (rounds.some(r => r.transport === 'stopped')) return { status: 'skipped', detail: GEMINI_STOP_DETAIL }
  const ok = rounds.filter(r => r.transport === 'http' && is2xx(r.status))
  if (ok.length === 3) {
    const missing = ok.find(r => !usageReady(r.usage))
    if (missing) return { status: 'failed', detail: '失败：3/3 个并发请求成功，但缺少输入/输出 Token' }
    return { status: 'passed', detail: '通过：3/3 个并发请求成功' }
  }
  return { status: 'failed', detail: `失败：${ok.length}/3 个并发请求成功` }
}

export function scoreGeminiErrorShape(round: GeminiRound): GeminiScore {
  if (round.transport === 'stopped') return { status: 'skipped', detail: GEMINI_STOP_DETAIL }
  if (round.transport === 'timeout') return { status: 'abnormal', detail: '异常：请求超时' }
  if (round.transport === 'network') return { status: 'abnormal', detail: '异常：网络错误' }
  if (typeof round.status !== 'number' || !Number.isFinite(round.status) || round.status <= 0) {
    return { status: 'abnormal', detail: '异常：没有 HTTP 状态码' }
  }
  if (round.status === 401 || round.status === 403) return { status: 'abnormal', detail: `异常：鉴权失败（HTTP ${round.status}）` }
  if (round.status === 408 || round.status === 429) return { status: 'abnormal', detail: `异常：HTTP ${round.status}` }
  if (is2xx(round.status)) return { status: 'failed', detail: '失败：无效模型返回了 HTTP 2xx' }
  if ((is4xx(round.status) || round.status >= 500) && geminiHasErrorObject(round.data)) {
    return { status: 'passed', detail: `通过：HTTP ${round.status}，错误体含 error.message / error.status / error.code` }
  }
  if (round.status >= 500) return { status: 'abnormal', detail: `异常：HTTP ${round.status}` }
  return { status: 'failed', detail: `失败：HTTP ${round.status}，错误体不是 { error: { message|status|code } }` }
}

export function scoreGeminiThinking(round: GeminiRound, model: string, level: string): GeminiScore {
  if (level === 'minimal' && geminiMinimalPolicy(model) === 'reject') {
    return scoreGeminiMustReject(round, 'thinkingLevel=minimal')
  }
  if (geminiListedId(model)) return scoreGeminiMustAccept(round, `thinkingLevel=${level}`)
  return scoreGeminiParam(round, ['thinkingLevel', 'thinking_level', 'thinkingConfig', 'thinking_config', 'thinking'], `thinkingLevel=${level}`)
}

export function geminiAppendVersion(detail: string, data: unknown, httpStatus: number | null): string {
  if (typeof httpStatus !== 'number' || httpStatus < 200 || httpStatus >= 300) return detail
  const version = geminiModelVersion(data)
  const thoughts = geminiThoughtsTokenCount(data)
  let next = `${detail}；${version ? `modelVersion ${version}` : '响应没有 modelVersion'}`
  if (thoughts != null) next += `；thoughtsTokenCount ${thoughts}`
  return next
}

export function geminiWithVersionNote<T extends { status: string; detail: string }>(cell: T, data: unknown, httpStatus: number | null): T {
  return { ...cell, detail: geminiAppendVersion(cell.detail, data, httpStatus) }
}

function usageFromEvents(events: ProbeSseEvent[]): ProbeUsage {
  const u = probeEmptyUsage()
  for (const ev of events) {
    const one = geminiReadUsage(ev.json)
    if (one.input != null) u.input = one.input
    if (one.output != null) u.output = one.output
    if (one.cacheRead != null) u.cacheRead = one.cacheRead
  }
  return u
}

/** 流式正文是 SSE 原文。说明要的 modelVersion / thoughtsTokenCount 在事件 JSON 里，后出现的覆盖先前的。 */
function streamNoteData(round: GeminiRound): unknown {
  if (round.data && typeof round.data === 'object' && !Array.isArray(round.data)) return round.data
  let version: string | null = null
  let thoughts: number | null = null
  let last: Record<string, unknown> | null = null
  for (const ev of round.events) {
    const json = ev.json
    if (!json || typeof json !== 'object' || Array.isArray(json)) continue
    last = json as Record<string, unknown>
    const v = geminiModelVersion(json)
    if (v) version = v
    const t = geminiThoughtsTokenCount(json)
    if (t != null) thoughts = t
  }
  if (!last) return round.data
  const o: Record<string, unknown> = { ...last }
  if (version) o.modelVersion = version
  if (thoughts != null && geminiThoughtsTokenCount(o) == null) {
    const prev = o.usageMetadata
    const usage = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {}
    usage.thoughtsTokenCount = thoughts
    o.usageMetadata = usage
  }
  return o
}

function normalize(round: GeminiRound, stream = false): GeminiRound {
  if (round.transport !== 'http') return round
  if (stream) {
    return {
      ...round,
      data: streamNoteData(round),
      usage: usageFromEvents(round.events),
      errorText: round.errorText || geminiErrorText(round.data),
    }
  }
  return {
    ...round,
    usage: geminiReadUsage(round.data),
    text: geminiVisibleText(round.data) || round.text,
    errorText: round.errorText || geminiErrorText(round.data),
  }
}

function pack(score: GeminiScore, round: GeminiRound | null, extra: Partial<GeminiOutcome> = {}): GeminiOutcome {
  return {
    status: score.status,
    detail: score.detail,
    checks: score.checks,
    usage: round?.usage,
    duration: round?.duration ?? null,
    data: round?.data ?? null,
    httpStatus: round?.status ?? null,
    ...extra,
  }
}

function stoppedOutcome(round?: GeminiRound | null): GeminiOutcome {
  return pack({ status: 'skipped', detail: GEMINI_STOP_DETAIL }, round ?? null)
}

export async function runGeminiProbe(id: string, deps: GeminiProbeDeps): Promise<GeminiOutcome> {
  const genUrl = geminiGenerateContentUrl(deps.root, deps.model)
  const streamUrl = geminiStreamUrl(deps.root, deps.model)
  const send = async (req: GeminiSendInput, stream = false): Promise<GeminiRound> => {
    if (deps.stopped()) {
      return { transport: 'stopped', status: null, data: null, text: '', usage: probeEmptyUsage(), events: [], duration: 0, errorText: '' }
    }
    return normalize(await deps.send(req), stream)
  }

  if (id === GEMINI_BASIC_ID) {
    const round = await send({ label: 'Gemini generateContent', url: genUrl, body: geminiBasicBody() })
    return pack(scoreGeminiMustAccept(round, '基础请求'), round)
  }
  if (id === 'gemini-temperature') {
    const round = await send({ label: 'temperature', url: genUrl, body: geminiTemperatureBody() })
    return pack(scoreGeminiParam(round, ['temperature'], 'temperature'), round)
  }
  if (id === 'gemini-top-p') {
    const round = await send({ label: 'topP', url: genUrl, body: geminiTopPBody(0.9) })
    return pack(scoreGeminiParam(round, ['topP', 'top_p'], 'topP'), round)
  }
  if (id === 'gemini-top-p-range') {
    const round = await send({ label: 'topP 越界', url: genUrl, body: geminiTopPBody(2) })
    return pack(scoreGeminiTopPRange(round), round)
  }
  if (id === 'gemini-max-output') {
    const first = await send({ label: 'maxOutputTokens', url: genUrl, body: geminiMaxFirstBody() })
    if (first.transport === 'stopped') return stoppedOutcome(first)
    const gate = scoreGeminiMaxFirst(first)
    if (!gate.sendSecond) return pack(gate.score!, first)
    if (deps.stopped()) return stoppedOutcome(first)
    const second = await send({ label: 'maxOutputTokens 截断', url: genUrl, body: geminiMaxSecondBody() })
    return pack(scoreGeminiMaxSecond(second), second)
  }
  if (id === 'gemini-structured') {
    const round = await send({ label: '结构化输出', url: genUrl, body: geminiStructuredBody() })
    const bad = transportScore(round)
    if (bad) return pack(bad, round)
    if (is2xx(round.status)) {
      const check = oracleSchemaOk(round.text)
      if (!check.passed) return pack({ status: 'failed', detail: check.detail, checks: [check] }, round)
      if (!usageReady(round.usage)) return pack(missingUsage('结构化输出'), round)
      return pack({ status: 'passed', detail: check.detail, checks: [check] }, round)
    }
    return pack(scoreGeminiParam(round, ['responseMimeType', 'responseSchema', 'response_mime_type', 'response_schema'], '结构化输出'), round)
  }
  if (id === 'gemini-tool') {
    const round = await send({ label: '函数调用', url: genUrl, body: geminiToolBody() })
    const bad = transportScore(round)
    if (bad) return pack(bad, round)
    if (is2xx(round.status)) {
      const check = oracleToolNamed(geminiFunctionCalls(round.data), 'get_weather')
      if (!check.passed) return pack({ status: 'failed', detail: check.detail, checks: [check] }, round)
      if (!usageReady(round.usage)) return pack(missingUsage('函数调用'), round)
      return pack({ status: 'passed', detail: check.detail, checks: [check] }, round)
    }
    return pack(scoreGeminiParam(round, ['tools', 'functionDeclarations', 'functionCallingConfig', 'function'], '函数调用'), round)
  }
  if (id === 'gemini-thinking-low' || id === 'gemini-thinking-medium' || id === 'gemini-thinking-minimal' || id === 'gemini-thinking-high') {
    const level = id.slice('gemini-thinking-'.length)
    const round = await send({ label: `thinking ${level}`, url: genUrl, body: geminiThinkingBody(level) })
    return pack(scoreGeminiThinking(round, deps.model, level), round)
  }
  if (id === 'gemini-stream' || id === 'gemini-stream-pure') {
    const pure = id === 'gemini-stream-pure'
    const round = await send({
      label: pure ? '纯流式' : 'SSE 流式',
      url: streamUrl,
      body: pure ? geminiBasicBody(GEMINI_PURE_PROMPT) : geminiMaxFirstBody(),
      stream: true,
    }, true)
    return pack(scoreGeminiStream(round), round)
  }
  if (id === 'gemini-token') {
    const count = Math.max(2, Math.min(10, Number(deps.rounds) || 3))
    const values: number[] = []
    const durations: number[] = []
    const avg = () => (durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null)
    let last: GeminiRound | null = null
    for (let i = 0; i < count; i++) {
      if (deps.stopped()) return stoppedOutcome(last)
      const round = await send({ label: 'Token 计算稳定性', url: genUrl, body: geminiBasicBody() })
      last = round
      if (round.transport === 'stopped') return stoppedOutcome(round)
      durations.push(round.duration)
      const bad = transportScore(round)
      if (bad) return pack(bad, round, { duration: avg(), tokenValues: values })
      if (!is2xx(round.status)) {
        return pack({ status: 'failed', detail: `失败：HTTP ${round.status}` }, round, { duration: avg(), tokenValues: values })
      }
      if (typeof round.usage.input !== 'number') {
        return pack(scoreGeminiTokenValues([...values, null]), round, { duration: avg(), tokenValues: values })
      }
      values.push(round.usage.input)
    }
    return pack(scoreGeminiTokenValues(values), last, { duration: avg(), tokenValues: values })
  }
  if (id === 'gemini-cache') {
    const body = geminiBasicBody(geminiCachePrompt(deps.nonce))
    const first = await send({ label: '隐式缓存', url: genUrl, body })
    if (first.transport === 'stopped') return stoppedOutcome(first)
    const firstBad = transportScore(first)
    if (firstBad || !is2xx(first.status) || !usageReady(first.usage)) {
      const score = firstBad ?? (
        !is2xx(first.status)
          ? { status: 'failed' as const, detail: `失败：第一次请求 HTTP ${first.status}` }
          : { status: 'failed' as const, detail: '失败：第一次响应缺少输入/输出 Token' }
      )
      return pack(score, first, { cache: { hits: 0, total: 1, reads: [first.usage.cacheRead ?? 0] } })
    }
    if (deps.stopped()) return stoppedOutcome(first)
    const second = await send({ label: '隐式缓存', url: genUrl, body })
    if (second.transport === 'stopped') return stoppedOutcome(second)
    const score = scoreGeminiCacheHit(second)
    const hit = typeof second.usage.cacheRead === 'number' && second.usage.cacheRead > 0
    return pack(score, second, {
      duration: Math.round((first.duration + second.duration) / 2),
      cache: { hits: hit ? 1 : 0, total: 2, reads: [first.usage.cacheRead ?? 0, second.usage.cacheRead ?? 0] },
    })
  }
  if (id === 'gemini-system') {
    const round = await send({ label: 'System 提示词', url: genUrl, body: geminiSystemBody() })
    const bad = transportScore(round)
    if (bad) return pack(bad, round)
    if (!is2xx(round.status)) return pack({ status: 'failed', detail: `失败：System HTTP ${round.status}` }, round)
    const check = oracleSystemOk(round.text)
    if (!check.passed) return pack({ status: 'failed', detail: check.detail, checks: [check] }, round)
    if (!usageReady(round.usage)) return pack(missingUsage('System'), round)
    return pack({ status: 'passed', detail: check.detail, checks: [check] }, round)
  }
  if (id === 'gemini-multi-turn') {
    const turn1 = geminiTurn1Body()
    const first = await send({ label: '多轮对话', url: genUrl, body: turn1 })
    if (first.transport === 'stopped') return stoppedOutcome(first)
    const bad = transportScore(first)
    if (bad) return pack(bad, first)
    if (!is2xx(first.status)) return pack({ status: 'failed', detail: `失败：第一跳 HTTP ${first.status}` }, first)
    const content = geminiModelContent(first.data)
    if (!content) return pack({ status: 'failed', detail: '失败：第一跳没有可回传的 content' }, first)
    if (deps.stopped()) return stoppedOutcome(first)
    const second = await send({ label: '多轮对话', url: genUrl, body: geminiTurn2Body(turn1, content) })
    if (second.transport === 'stopped') return stoppedOutcome(second)
    const bad2 = transportScore(second)
    if (bad2) return pack(bad2, second)
    if (!is2xx(second.status)) return pack({ status: 'failed', detail: `失败：第二跳 HTTP ${second.status}` }, second)
    const check = oracleCodeword(second.text)
    if (!check.passed) return pack({ status: 'failed', detail: check.detail, checks: [check] }, second)
    if (!usageReady(second.usage)) return pack(missingUsage('多轮对话'), second)
    return pack({ status: 'passed', detail: check.detail, checks: [check] }, second)
  }
  if (id === 'gemini-error') {
    const round = await send({
      label: '错误码规范性',
      url: geminiGenerateContentUrl(deps.root, GEMINI_ERROR_MODEL),
      body: geminiBasicBody(),
    })
    return pack(scoreGeminiErrorShape(round), round)
  }
  if (id === 'gemini-concurrency') {
    const rounds = await Promise.all([1, 2, 3].map(i => send({
      label: '并发请求稳定性',
      url: genUrl,
      body: geminiBasicBody(`Reply only ${i}`),
      retryOn429: false,
    })))
    if (rounds.some(r => r.transport === 'stopped')) return stoppedOutcome(rounds.find(r => r.transport === 'stopped') ?? null)
    const score = scoreGeminiConcurrency(rounds)
    const failed = rounds.find(r => !(r.transport === 'http' && is2xx(r.status)))
    const missing = rounds.find(r => !usageReady(r.usage))
    const decisive = (score.status === 'passed' ? rounds[0] : failed ?? missing ?? rounds[0]) ?? null
    const duration = rounds.length ? Math.max(...rounds.map(r => r.duration)) : null
    return pack(score, decisive, { duration })
  }
  if (id === 'gemini-image') {
    const round = await send({ label: '图片输入', url: genUrl, body: geminiImageBody() })
    const bad = transportScore(round)
    if (bad) return pack(bad, round)
    if (is2xx(round.status)) {
      const check = oracleDominantRed(round.text)
      if (!check.passed) return pack({ status: 'failed', detail: check.detail, checks: [check] }, round)
      if (!usageReady(round.usage)) return pack(missingUsage('图片输入'), round)
      return pack({ status: 'passed', detail: check.detail, checks: [check] }, round)
    }
    if (is4xx(round.status) && oracleUnsupportedVision(round.errorText)) {
      return pack({ status: 'unsupported', detail: `不支持：图片输入（HTTP ${round.status}）` }, round)
    }
    return pack({ status: 'failed', detail: `失败：图片输入 HTTP ${round.status}` }, round)
  }
  if (id === 'gemini-search') {
    const round = await send({ label: 'Google 搜索', url: genUrl, body: geminiSearchBody() })
    const bad = transportScore(round)
    if (bad) return pack(bad, round)
    if (is2xx(round.status)) {
      if (!geminiGrounded(round.data)) return pack({ status: 'abnormal', detail: '异常：请求成功但没有 grounding 证据' }, round)
      if (!usageReady(round.usage)) return pack(missingUsage('Google 搜索'), round)
      return pack({ status: 'passed', detail: '通过：groundingMetadata 有搜索证据' }, round)
    }
    if (is4xx(round.status)) return pack({ status: 'unsupported', detail: `不支持：Google 搜索（HTTP ${round.status}）` }, round)
    return pack({ status: 'failed', detail: `失败：Google 搜索 HTTP ${round.status}` }, round)
  }
  return pack({ status: 'failed', detail: `未找到 Gemini 用例 ${id}` }, null)
}
