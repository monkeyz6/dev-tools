import { type ProbeFormat, PROBE_WEATHER_TOOL, probeNestReasoningEffort, probeProtocolOf } from './protocol'
import { PROBE_OUTPUT_LIMIT_DETAIL, probeCheck, probeOutputLimitReached, type ProbeCheck } from './oracles'
import { scoreExpectedReject, type ProbeTopPTransport } from './negative'
import { isMuseWonderModel, PROBE_CLAUDE5_CAP } from './profiles'
import { MUSE_BLUE_MP4_B64, museBeepWavBase64, musePdfBase64 } from './muse-media'

// Meta muse-wonder-1.0 官方规格用例。只按 dev.meta.ai 文档（2026-10-14 查阅）写，文档没给写法的不补：
// Messages 的 PDF / 音频 / 视频块、Chat 的视频都不测。模型名命中 isMuseWonderModel 才出现，默认不勾。

export const MUSE_SPEC_GROUPS = {
  reasoning: 'Muse Wonder · 推理档位',
  constraint: 'Muse Wonder · 官方约束',
  multimodal: 'Muse Wonder · 多模态',
} as const

export type MuseSpecTopic = keyof typeof MUSE_SPEC_GROUPS

export interface MuseSpecContext {
  /** PDF 口令，本次请求随机生成 */
  code: string
  /** wav 里的哔声数，2–5 */
  beeps: number
}

export interface MuseSpecReply {
  data: unknown
  text: string
}

export interface MuseSpecCase {
  id: string
  topic: MuseSpecTopic
  group: string
  format: ProbeFormat
  name: string
  desc: string
  explain: string
  /** accept：官方支持，非 2xx 记失败；reject：官方写明 400，只看状态码 */
  expect: 'accept' | 'reject'
  /** reject 的失败说明里点名的参数 */
  what?: string
  build(model: string, ctx: MuseSpecContext): Record<string, any>
  oracles?(reply: MuseSpecReply, ctx: MuseSpecContext): ProbeCheck[]
}

const DOC = 'https://dev.meta.ai/docs'
const MAX_CONFLICT = `文档冲突：${DOC}/reasoning 写明 muse-wonder-1.0 支持 max，三个协议页的枚举只写到 xhigh。按点名模型的那页判为应接受。`
const PROTOCOL_CONFLICT = `文档冲突：协议页写「服务 Muse Spark 文本模型」，${DOC}/models 写 Wonder 与 Spark 请求相同、端点相同。按 Models 页判为应支持。`
const REJECT_RULE = '其它 4xx 记通过，2xx 记失败；401、403、408、429、5xx、超时和网络错误记异常。400 正文若是输出额度用尽，说明参数已被接受，记失败。'
const OK_PROMPT = 'Reply with exactly: OK'

export const MUSE_PDF_PROMPT = 'Read the attached PDF. What is the code written in it? Reply with the code only.'
export const MUSE_AUDIO_PROMPT = 'Listen to the attached audio. How many beeps does it contain? Reply with a single digit only.'
export const MUSE_VIDEO_PROMPT = 'Watch the attached video. What single color fills every frame? Reply with one English word.'

/** 推理关不掉，统一给足额度，免得 OK 都写不出来；被拒类用例也用它，避免 2xx 后额度用尽回 400 被误当成拒绝。 */
const base = (model: string, format: ProbeFormat, prompt = OK_PROMPT): Record<string, any> => {
  const proto = probeProtocolOf(format)
  const body = proto.baseBody(model, prompt)
  proto.applyMaxTokens(body, PROBE_CLAUDE5_CAP)
  return body
}

const withWeather = (model: string, format: ProbeFormat): Record<string, any> => {
  const body = base(model, format, 'What is the weather in Shanghai tomorrow?')
  probeProtocolOf(format).applyTools(body, [PROBE_WEATHER_TOOL], 'auto')
  return body
}

const asObj = (v: unknown): Record<string, any> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null

/**
 * 候选 usage，按优先级排列。Responses 官方 usage 在顶层；网关可能再包一层 response，
 * 甚至两层都给（顶层只抄 input/output，明细在 response.usage），所以两层都要看。
 */
const usagesOf = (format: ProbeFormat, data: unknown): Record<string, any>[] => {
  const o = asObj(data)
  if (!o) return []
  const out = [asObj(o.usage)]
  if (format === 'responses') out.push(asObj(asObj(o.response)?.usage))
  return out.filter((u): u is Record<string, any> => !!u)
}

/** 官方文档写进用量的字段，逐一要求是数字（0 合法）。 */
export const MUSE_USAGE_FIELDS: Record<ProbeFormat, string[]> = {
  chat: ['completion_tokens_details.reasoning_tokens', 'prompt_tokens_details.cached_tokens'],
  responses: ['output_tokens_details.reasoning_tokens', 'input_tokens_details.cached_tokens'],
  anthropic: ['output_tokens_details.thinking_tokens', 'cache_read_input_tokens'],
  gemini: [],
}

const pick = (o: Record<string, any> | null, path: string): unknown =>
  path.split('.').reduce<unknown>((cur, k) => asObj(cur)?.[k], o)

/** 逐字段在各层 usage 里找，第一个是数字的算数。 */
export function oracleMuseUsageFields(format: ProbeFormat, data: unknown): ProbeCheck {
  const usages = usagesOf(format, data)
  const missing: string[] = []
  const seen: string[] = []
  for (const path of MUSE_USAGE_FIELDS[format]) {
    const v = usages.map(u => pick(u, path)).find(x => typeof x === 'number' && Number.isFinite(x))
    if (typeof v === 'number') seen.push(`${path}=${v}`)
    else missing.push(path)
  }
  if (missing.length) return probeCheck('usage_fields', false, `用量缺少官方字段：usage.${missing.join('、usage.')}`)
  return probeCheck('usage_fields', true, `用量字段齐全：${seen.join('，')}`)
}

/**
 * 被拒类的判定。状态码规则同 scoreExpectedReject；另外 400 正文若是额度用尽那句，
 * 说明参数已被接受、只是输出额度不够，记失败而不是「已拒绝」（只认 400）。errorText 是展示用的错误正文。
 */
export function scoreMuseSpecReject(
  reply: { status: number | null; transport: ProbeTopPTransport; data?: unknown; errorText?: string },
  what: string,
): { status: 'passed' | 'failed' | 'abnormal'; detail: string } {
  const http = reply.transport === 'http' && typeof reply.status === 'number' && reply.status >= 400
  // 与 probeRescoreOutputLimitResults 同一口径：只认 HTTP 400；5xx 带这句仍按通用规则记异常
  if (reply.transport === 'http' && reply.status === 400 && probeOutputLimitReached(reply.data ?? reply.errorText ?? '')) {
    return { status: 'failed', detail: `失败：${what} 已被接受，HTTP ${reply.status} 是输出额度用尽（${PROBE_OUTPUT_LIMIT_DETAIL}）` }
  }
  const scored = scoreExpectedReject(reply.status, reply.transport, what)
  if (http && scored.status === 'passed' && reply.errorText) return { ...scored, detail: `${scored.detail}：${reply.errorText}` }
  return scored
}

/**
 * 一次 HTTP 应答的判定，按用例声明的方向分叉：被拒类走 scoreMuseSpecReject；
 * 接受类非 2xx 一律失败（官方支持的档位被拒不能算通过），2xx 再跑 oracle。
 */
export function scoreMuseSpecReply(
  spec: Pick<MuseSpecCase, 'expect' | 'what' | 'name' | 'oracles'>,
  reply: { status: number; ok: boolean; data: unknown; text: string; errorText?: string },
  ctx: MuseSpecContext,
): { status: 'passed' | 'failed' | 'abnormal'; detail: string; checks?: ProbeCheck[] } {
  if (spec.expect === 'reject') {
    return scoreMuseSpecReject({
      status: reply.status, transport: 'http', data: reply.data, errorText: reply.ok ? undefined : reply.errorText,
    }, spec.what || spec.name)
  }
  if (!reply.ok) return { status: 'failed', detail: `官方支持，但请求被拒（HTTP ${reply.status}）：${reply.errorText ?? ''}` }
  const checks = spec.oracles?.({ data: reply.data, text: reply.text }, ctx) ?? []
  const bad = checks.filter(c => !c.passed)
  const detail = checks.length ? checks.map(c => c.detail).join('；') : `HTTP ${reply.status}，已接受`
  return { status: bad.length ? 'failed' : 'passed', detail, checks }
}

export function oracleMuseCode(text: string, code: string): ProbeCheck {
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
  const got = museBeepCount(text)
  if (got === beeps) return probeCheck('audio_beeps', true, `数出 ${beeps} 声哔声`)
  return probeCheck('audio_beeps', false, `音频里有 ${beeps} 声哔声，回复是 ${got ?? '无法确定的数字'}（${clip(text)}）`)
}

// cannot 是一个词，\bnot\b 和 n't 都对不上，单列；unable 同理
const NEGATION_RE = /\b(?:not|no|cannot|unable|isn'?t|aren'?t|wasn'?t|never|without|missing|absent|neither|nor|none)\b|n't\b/i
const OTHER_COLOR_RE = /\b(?:red|green|yellow|orange|purple|violet|pink|black|white|gr[ae]y|brown|cyan|magenta)\b/i

/** 画面纯蓝：回复要说 blue，且不能带否定词，也不能同时报别的颜色（「not blue」「blue is missing」「red and blue」都不算）。 */
export function oracleMuseBlue(text: string): ProbeCheck {
  const t = String(text || '')
  if (!/\bblue\b/i.test(t)) return probeCheck('video_color', false, `画面是纯蓝，回复没有 blue（${clip(text)}）`)
  if (NEGATION_RE.test(t)) return probeCheck('video_color', false, `回复提到 blue 但带否定（${clip(text)}）`)
  if (OTHER_COLOR_RE.test(t)) return probeCheck('video_color', false, `画面是纯蓝，回复还报了别的颜色（${clip(text)}）`)
  return probeCheck('video_color', true, '识别出画面为蓝色')
}

const clip = (text: string): string => {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (!t) return '空回复'
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

type CaseInput = Omit<MuseSpecCase, 'group'>
const spec = (c: CaseInput): MuseSpecCase => ({ ...c, group: MUSE_SPEC_GROUPS[c.topic] })

const usageOracle = (format: ProbeFormat) => (reply: MuseSpecReply): ProbeCheck[] => [oracleMuseUsageFields(format, reply.data)]

const reasoningCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-effort-minimal', topic: 'reasoning', format: 'chat', expect: 'accept',
    name: 'Chat · reasoning_effort=minimal',
    desc: '最低合法档应被接受，并带回官方用量字段',
    explain: `依据 ${DOC}/reasoning：Chat 用顶层 reasoning_effort。2xx 后核对 usage.completion_tokens_details.reasoning_tokens 与 usage.prompt_tokens_details.cached_tokens 都是数字。${PROTOCOL_CONFLICT}`,
    build: model => ({ ...base(model, 'chat'), reasoning_effort: 'minimal' }),
    oracles: usageOracle('chat'),
  }),
  spec({
    id: 'spec-muse-chat-effort-max', topic: 'reasoning', format: 'chat', expect: 'accept',
    name: 'Chat · reasoning_effort=max',
    desc: 'Wonder 专属最高档应被接受',
    explain: `依据 ${DOC}/reasoning：max 由 muse-wonder-1.0 支持（不会切到 Wonder Full）。${MAX_CONFLICT}`,
    build: model => ({ ...base(model, 'chat'), reasoning_effort: 'max' }),
    oracles: usageOracle('chat'),
  }),
  spec({
    id: 'spec-muse-chat-effort-none', topic: 'reasoning', format: 'chat', expect: 'reject', what: 'reasoning_effort=none',
    name: 'Chat · reasoning_effort=none',
    desc: '推理关不掉，官方返回 400',
    explain: `依据 ${DOC}/reasoning：none 不被 Muse Wonder 支持，返回 HTTP 400。${REJECT_RULE}`,
    build: model => ({ ...base(model, 'chat'), reasoning_effort: 'none' }),
  }),
  spec({
    id: 'spec-muse-responses-effort-minimal', topic: 'reasoning', format: 'responses', expect: 'accept',
    name: 'Responses · reasoning.effort=minimal',
    desc: '最低合法档应被接受，并带回官方用量字段',
    explain: `依据 ${DOC}/reasoning：Responses 嵌套写 reasoning.effort。2xx 后核对 usage.output_tokens_details.reasoning_tokens 与 usage.input_tokens_details.cached_tokens 都是数字。`,
    build: model => ({ ...base(model, 'responses'), reasoning: { effort: 'minimal' } }),
    oracles: usageOracle('responses'),
  }),
  spec({
    id: 'spec-muse-responses-effort-max', topic: 'reasoning', format: 'responses', expect: 'accept',
    name: 'Responses · reasoning.effort=max',
    desc: 'Wonder 专属最高档应被接受',
    explain: `依据 ${DOC}/reasoning。${MAX_CONFLICT}`,
    build: model => ({ ...base(model, 'responses'), reasoning: { effort: 'max' } }),
    oracles: usageOracle('responses'),
  }),
  spec({
    id: 'spec-muse-responses-effort-none', topic: 'reasoning', format: 'responses', expect: 'reject', what: 'reasoning.effort=none',
    name: 'Responses · reasoning.effort=none',
    desc: '推理关不掉，官方返回 400',
    explain: `依据 ${DOC}/protocols/responses：reasoning.effort 设为 none 返回 HTTP 400。${REJECT_RULE}`,
    build: model => ({ ...base(model, 'responses'), reasoning: { effort: 'none' } }),
  }),
  spec({
    id: 'spec-muse-anthropic-effort-low', topic: 'reasoning', format: 'anthropic', expect: 'accept',
    name: 'Messages · output_config.effort=low',
    desc: 'Messages 枚举里的最低档应被接受，并带回官方用量字段',
    explain: `依据 ${DOC}/protocols/messages：output_config.effort 取 low / medium / high / xhigh（没有 minimal）。2xx 后核对 usage.output_tokens_details.thinking_tokens 与 usage.cache_read_input_tokens 都是数字。${PROTOCOL_CONFLICT}`,
    build: model => ({ ...base(model, 'anthropic'), output_config: { effort: 'low' } }),
    oracles: usageOracle('anthropic'),
  }),
  spec({
    id: 'spec-muse-anthropic-effort-max', topic: 'reasoning', format: 'anthropic', expect: 'accept',
    name: 'Messages · output_config.effort=max',
    desc: 'Wonder 专属最高档应被接受',
    explain: `依据 ${DOC}/reasoning。${MAX_CONFLICT}`,
    build: model => ({ ...base(model, 'anthropic'), output_config: { effort: 'max' } }),
    oracles: usageOracle('anthropic'),
  }),
  spec({
    id: 'spec-muse-anthropic-thinking-disabled', topic: 'reasoning', format: 'anthropic', expect: 'reject', what: 'thinking.type=disabled',
    name: 'Messages · thinking=disabled',
    desc: '推理关不掉，官方返回 400',
    explain: `依据 ${DOC}/protocols/messages：thinking: {type:"disabled"} 返回 HTTP 400。${REJECT_RULE}`,
    build: model => ({ ...base(model, 'anthropic'), thinking: { type: 'disabled' } }),
  }),
]

const reject = (
  id: string,
  format: ProbeFormat,
  name: string,
  what: string,
  source: string,
  build: (model: string) => Record<string, any>,
): MuseSpecCase => spec({
  id, topic: 'constraint', format, expect: 'reject', what, name,
  desc: `官方写明 ${what} 返回 400`,
  explain: `依据 ${source}。${REJECT_RULE}`,
  build,
})

const constraintCases: MuseSpecCase[] = [
  reject('spec-muse-chat-tool-required', 'chat', 'Chat · tool_choice=required', 'tool_choice=required', `${DOC}/tool-calling（只支持 auto）`,
    model => ({ ...withWeather(model, 'chat'), tool_choice: 'required' })),
  reject('spec-muse-chat-stop', 'chat', 'Chat · stop', 'stop', `${DOC}/protocols/chat-completions`,
    model => ({ ...base(model, 'chat'), stop: ['\n'] })),
  reject('spec-muse-chat-n2', 'chat', 'Chat · n=2', 'n=2', `${DOC}/protocols/chat-completions（n 只能为 1）`,
    model => ({ ...base(model, 'chat'), n: 2 })),
  reject('spec-muse-chat-logprobs', 'chat', 'Chat · logprobs', 'logprobs=true', `${DOC}/protocols/chat-completions、${DOC}/reasoning`,
    model => ({ ...base(model, 'chat'), logprobs: true })),
  reject('spec-muse-chat-web-search-options', 'chat', 'Chat · web_search_options', 'web_search_options', `${DOC}/protocols/chat-completions（Chat 不提供搜索）`,
    model => ({ ...base(model, 'chat'), web_search_options: {} })),
  reject('spec-muse-chat-modalities', 'chat', 'Chat · modalities', 'modalities', `${DOC}/protocols/chat-completions（任意值都返回 400）`,
    model => ({ ...base(model, 'chat'), modalities: ['text'] })),
  reject('spec-muse-chat-max-output-tokens', 'chat', 'Chat · max_output_tokens', 'max_output_tokens', `${DOC}/protocols/chat-completions（这是 Responses 字段）`,
    model => {
      const body = base(model, 'chat')
      delete body.max_completion_tokens
      return { ...body, max_output_tokens: PROBE_CLAUDE5_CAP }
    }),
  reject('spec-muse-responses-tool-required', 'responses', 'Responses · tool_choice=required', 'tool_choice=required', `${DOC}/tool-calling（只支持 auto）`,
    model => ({ ...withWeather(model, 'responses'), tool_choice: 'required' })),
  reject('spec-muse-responses-truncation', 'responses', 'Responses · truncation=auto', 'truncation=auto', `${DOC}/protocols/responses`,
    model => ({ ...base(model, 'responses'), truncation: 'auto' })),
  reject('spec-muse-responses-background-stream', 'responses', 'Responses · background + stream', 'background 与 stream 同时为 true', `${DOC}/protocols/responses`,
    model => ({ ...base(model, 'responses'), background: true, stream: true })),
  reject('spec-muse-responses-logprobs', 'responses', 'Responses · include logprobs', 'include message.output_text.logprobs', `${DOC}/protocols/responses`,
    model => ({ ...base(model, 'responses'), include: ['message.output_text.logprobs'] })),
  reject('spec-muse-anthropic-stop-sequences', 'anthropic', 'Messages · stop_sequences', 'stop_sequences', `${DOC}/protocols/messages`,
    model => ({ ...base(model, 'anthropic'), stop_sequences: ['\n'] })),
  reject('spec-muse-anthropic-top-k', 'anthropic', 'Messages · top_k', 'top_k', `${DOC}/protocols/messages`,
    model => ({ ...base(model, 'anthropic'), top_k: 5 })),
  reject('spec-muse-anthropic-unknown-field', 'anthropic', 'Messages · 未知顶层字段', '未知顶层字段 probe_unknown_field', `${DOC}/protocols/messages（Unknown top-level fields are also rejected）`,
    model => ({ ...base(model, 'anthropic'), probe_unknown_field: true })),
  reject('spec-muse-anthropic-tool-named', 'anthropic', 'Messages · tool_choice={type:tool}', 'tool_choice={type:"tool"}', `${DOC}/protocols/messages（指定工具返回 400）`,
    model => {
      const body = base(model, 'anthropic', 'What is the weather in Shanghai tomorrow?')
      probeProtocolOf('anthropic').applyTools(body, [PROBE_WEATHER_TOOL], { name: PROBE_WEATHER_TOOL.name })
      return body
    }),
  reject('spec-muse-anthropic-web-search-max-uses', 'anthropic', 'Messages · web_search max_uses', 'web_search.max_uses', `${DOC}/protocols/messages（allowed_domains、blocked_domains、max_uses 返回 400；web_search 的 type 字符串文档没给，按 web_search 发）`,
    model => ({ ...base(model, 'anthropic', 'What is a major news headline from today?'), tools: [{ type: 'web_search', max_uses: 1 }] })),
]

const pdfData = (code: string) => `data:application/pdf;base64,${musePdfBase64(code)}`

const multimodalCases: MuseSpecCase[] = [
  spec({
    id: 'spec-muse-chat-pdf', topic: 'multimodal', format: 'chat', expect: 'accept',
    name: 'Chat · PDF 输入',
    desc: '内嵌一页 PDF，复述随机口令',
    explain: `依据 ${DOC}/file-handling：Chat 用 {type:"file", file:{filename, file_data}}，file_data 是 base64 data URL。PDF 由前端生成，正文是本次随机口令，复述出口令才算通过。${PROTOCOL_CONFLICT}`,
    build: (model, ctx) => ({
      ...base(model, 'chat'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: MUSE_PDF_PROMPT },
          { type: 'file', file: { filename: 'probe.pdf', file_data: pdfData(ctx.code) } },
        ],
      }],
    }),
    oracles: (reply, ctx) => [oracleMuseCode(reply.text, ctx.code)],
  }),
  spec({
    id: 'spec-muse-responses-pdf', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · PDF 输入',
    desc: '内嵌一页 PDF，复述随机口令',
    explain: `依据 ${DOC}/file-handling：Responses 用 {type:"input_file", filename, file_data}。复述出口令才算通过。`,
    build: (model, ctx) => ({
      ...base(model, 'responses'),
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: MUSE_PDF_PROMPT },
          { type: 'input_file', filename: 'probe.pdf', file_data: pdfData(ctx.code) },
        ],
      }],
    }),
    oracles: (reply, ctx) => [oracleMuseCode(reply.text, ctx.code)],
  }),
  spec({
    id: 'spec-muse-chat-audio', topic: 'multimodal', format: 'chat', expect: 'accept',
    name: 'Chat · 音频输入',
    desc: '内嵌 wav，数哔声',
    explain: `依据 ${DOC}/video-understanding：Chat 用 {type:"input_audio", input_audio:{data, format:"wav"}}。wav 由前端合成（16kHz 单声道，2–5 声 440Hz 哔声，随机），数对才算通过。${PROTOCOL_CONFLICT}`,
    build: (model, ctx) => ({
      ...base(model, 'chat'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: MUSE_AUDIO_PROMPT },
          { type: 'input_audio', input_audio: { data: museBeepWavBase64(ctx.beeps), format: 'wav' } },
        ],
      }],
    }),
    oracles: (reply, ctx) => [oracleMuseBeeps(reply.text, ctx.beeps)],
  }),
  spec({
    id: 'spec-muse-responses-audio', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · 音频输入',
    desc: '内嵌 wav，数哔声',
    explain: `依据 ${DOC}/video-understanding：Responses 接受同样的 input_audio part（{data, format}）。数对哔声才算通过。`,
    build: (model, ctx) => ({
      ...base(model, 'responses'),
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: MUSE_AUDIO_PROMPT },
          { type: 'input_audio', input_audio: { data: museBeepWavBase64(ctx.beeps), format: 'wav' } },
        ],
      }],
    }),
    oracles: (reply, ctx) => [oracleMuseBeeps(reply.text, ctx.beeps)],
  }),
  spec({
    id: 'spec-muse-responses-video', topic: 'multimodal', format: 'responses', expect: 'accept',
    name: 'Responses · 视频输入',
    desc: '内嵌纯蓝 mp4，识别颜色',
    explain: `依据 ${DOC}/video-understanding：Responses 用 {type:"input_video", video_url}，可为 base64 data URL；无音轨的视频合法。素材是 2 秒 128×128 纯蓝 mp4，回答 blue 才算通过。Chat 的 video_url part 文档没给示例，不测。`,
    build: model => ({
      ...base(model, 'responses'),
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: MUSE_VIDEO_PROMPT },
          { type: 'input_video', video_url: `data:video/mp4;base64,${MUSE_BLUE_MP4_B64}` },
        ],
      }],
    }),
    oracles: reply => [oracleMuseBlue(reply.text)],
  }),
]

export const MUSE_SPEC_CASES: MuseSpecCase[] = [...reasoningCases, ...constraintCases, ...multimodalCases]

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
