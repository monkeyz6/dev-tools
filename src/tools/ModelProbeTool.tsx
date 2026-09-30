import { kvGet, kvSet, kvRemove } from '../shared/app-kv'
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { highlightJson } from '../shared/json'
import { decryptLlmApiKey, encryptLlmApiKey } from '../shared/api-key-crypto'
import { historyDbGetAll, historyDbPutOne, historyDbPutMany, historyDbDeleteOne, historyDbDeleteMany, historyDbClear, historyDbMigrateFromLocalStorage } from '../shared/history-db'
import { useDebouncedPersist } from '../shared/use-debounced-persist'
import { uniqueCopyName } from '../shared/channel-copy'
import { downloadProbeMatrixHtml, downloadProbeReportHtml, probeMatrixCellScored, probeMatrixColumnLabels, probeMatrixColumnText, probeMatrixHasProblems } from './ModelProbeExport'
import { matrixFormatSubtitle, matrixTokenValues, presentMatrixNote, stripSplitRetestNote } from './model-probe/matrix-present'
import { probeHistoryNewestFirst, probeHistoryOverflow, probeLogsSince, probeNameForModel, probeSplitModels, probeUnionBuiltinCases, probeViewAfterDelete } from './model-probe/batch'
import {
  type ProbeFormat, type ProbeSseEvent, type ProbeUsage,
  probeEmptyUsage, probeUsageOf, probeUsageFromSse, probeParseSseBlock,
  probeProtocolOf, probeParamComboBody, probeSoleParamMatch,
  probeChatMaxTokenBlame, probeChatMaxAcceptLabel, probeToolChoiceForcedBlocked, probeResponsesResourceId, setProbeAnthropicCapField, CHAT_MAX_TOKEN_KEYS,
  PROBE_ENDPOINTS, PROBE_RED_PNG_B64, PROBE_TRUNCATION_PROMPT, PROBE_TRUNCATION_CAP, PROBE_DEFAULT_CAP,
  PROBE_SCHEMA_PROMPT, PROBE_SCHEMA_CAP, PROBE_TOOL_FORCE_PROMPT, PROBE_WEATHER_TOOL,
  PROBE_SYSTEM_INSTRUCTION, PROBE_SYSTEM_USER, PROBE_MULTITURN_TURN1, PROBE_MULTITURN_TURN2,
  PROBE_IMAGE_PROMPT,
} from './model-probe/protocol'
import {
  type ProbeCheck,
  oracleTruncation, oracleToolNamed, oracleSchemaOk, oracleSystemOk, oracleCodeword,
  oracleDominantRed, oracleUnsupportedVision, probeCheck,
  PROBE_OUTPUT_LIMIT_DETAIL, probeOutputLimitReached, probeRescoreOutputLimitResults,
} from './model-probe/oracles'
import {
  type BuiltinProbeCase,
  ALL_BUILTIN_PROBE_CASES, applyBuiltinTool, builtinCaseById, matchBuiltinToolCases,
  oracleNativeToolEvidence, oracleUnsupportedNativeTool,
} from './model-probe/builtin-tools'
import {
  type ProbeProfileId,
  aggregateProbeStatus, anthropicBaseBlocked, anthropicCapAction, anthropicMaxTokensConclusion,
  basicProtocolGate, decideFamily, nameSuggestsGpt, profileFromName, reclassifyExpected, scoreProtocolGate,
} from './model-probe/profiles'
import { decideOrigin, probeRefreshedOrigin, probeShownSource, signalsFromProbeLogs } from './model-probe/origin'
import { probeRequestIdFromHeaders, probeRequestIdFromRecord, probeRequestIdHeaders, probeShownRequestId } from './model-probe/request-id'
import { probeKeptResponseBody, probeTopPRangeBody, scoreTopPRange } from './model-probe/negative'
import { probeMatchRetryChannel, probeReplaceCellLogs } from './model-probe/cell'

// ─── Tool: 模型探测 ─────────────────────────────────────────────────────────────
// 定位：API 渠道兼容性实验台 —— 三种协议格式 × 参数/流式/缓存/Token 计数稳定性，
// 智能降级定位不支持的参数；HTTP 2xx 必须带回 input+output Token（否则失败）；
// 参数 combo 只验接受；上限/工具/结构化输出在接受后再发语义请求；
// System / 多轮核验指令；图片输入默认不勾选。
// 厂商内置工具（kind=native）按模型名命中后追加，默认不勾，单独发请求。
// 「预期拒绝」（kind=score）默认不勾，不发请求，只决定要不要把本该拒绝的结果改判。
// 「top_p 越界」在基础请求上带 top_p=2，只按状态码判定。报告里每一格可以单独重试，并覆盖这一格的结论。

type ProbeStatus = 'passed' | 'failed' | 'abnormal' | 'unsupported' | 'skipped' | 'expected' | 'untested'

interface ProbeTestDef {
  id: string
  group: string
  name: string
  desc: string
  explain: string
  kind: 'basic' | 'parameter' | 'stream' | 'token' | 'cache' | 'extra' | 'native' | 'score'
  format?: ProbeFormat
  subtype?: string
  defaultSelected?: boolean
}

interface ProbeLog {
  id: string
  resultKey: string
  label: string
  format: ProbeFormat
  url: string
  method: string
  status: number | null
  statusText: string
  duration: number
  time: string
  requestHeaders: Record<string, string>
  requestBody: any
  responseHeaders: Record<string, string>
  responseBody: any
  sse: ProbeSseEvent[]
  chunks: string[]
  usage: ProbeUsage
  requestId: string | null
}

interface ProbeResult {
  status: ProbeStatus
  detail: string
  duration: number | null
  format?: ProbeFormat
  usage?: ProbeUsage
  cache?: { hits: number; total: number; reads: number[] }
  tokenValues?: number[]
  checks?: ProbeCheck[]
  repro: {
    url: string
    headers: Record<string, string>
    body: any
    status: number | null
    requestId: string | null
    responseHeaders?: Record<string, string>
    responseBody?: unknown
  } | null
}

interface ProbeVerdictLayer { label: string; reasons: string[] }
interface ProbeVerdict { family: ProbeVerdictLayer; access: ProbeVerdictLayer; upstream: ProbeVerdictLayer }

interface ProbeReport {
  id: string
  name: string
  startedAt: string
  completedAt: string
  durationMs: number
  target: { baseUrl: string; model: string; channelName?: string; overrides: Record<ProbeFormat, string | null> }
  results: Record<string, ProbeResult>
  summary: Record<ProbeStatus, number>
  logs: ProbeLog[]
  verdict?: ProbeVerdict | null
}

interface ProbeCfg {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  urlOf: Record<ProbeFormat, string>
}

// ── 渠道（探测目标）：baseUrl + apiKey + 超时 + 三种协议 URL 覆写，可保存多个、选一个当前使用；
// 模型名称保持全局，不属于渠道 ──
interface ProbeChannel {
  id: string
  name: string
  baseUrl: string
  timeoutSec: string
  chatUrl: string        // 可选覆写，空串表示回退到 baseUrl
  responsesUrl: string
  anthropicUrl: string
  apiKeyEnc: string
  keyMask: string
}

const PROBE_STORAGE_KEY = 'modelprobe-config'
const PROBE_KEY_STORAGE_KEY = 'modelprobe-key'     // 旧字段：单一配置的加密 apiKey，已迁移到渠道，仅保留供一次性迁移读取
const PROBE_HISTORY_KEY = 'modelprobe-history'
const PROBE_HISTORY_MAX = 20
const PROBE_CHANNELS_KEY = 'modelprobe-channels'
const PROBE_ACTIVE_CH_KEY = 'modelprobe-active-channel'

const PROBE_MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace'
const PROBE_FORMAT_LABELS: Record<ProbeFormat, string> = {
  chat: 'Chat Completions', responses: 'Responses', anthropic: 'Anthropic Messages',
}
const PROBE_FORMAT_SHORT: Record<ProbeFormat, string> = { chat: 'chat', responses: 'responses', anthropic: 'anthropic' }
const PROBE_STATUS_LABELS: Record<ProbeStatus, string> = {
  passed: '通过', failed: '失败', abnormal: '异常', unsupported: '不支持', skipped: '已跳过', expected: '符合预期', untested: '未测',
}
const PROBE_STATUS_ORDER: ProbeStatus[] = ['passed', 'failed', 'abnormal', 'unsupported', 'expected', 'untested', 'skipped']
const probeEmptySummary = (): Record<ProbeStatus, number> => ({
  passed: 0, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0,
})
const probeStatusColor = (status: string): string => (
  status === 'failed' ? 'var(--err)'
    : status === 'abnormal' ? 'color-mix(in srgb, var(--err) 55%, var(--warn))'
    : status === 'passed' ? 'var(--ok)'
      : status === 'unsupported' ? 'var(--warn)'
        : status === 'expected' ? 'var(--accent)'
          : status === 'running' ? 'var(--accent)'
            : 'var(--t3)'
)
const probeSummaryLine = (summary: Record<ProbeStatus, number>): string => {
  const abnormal = summary.abnormal || 0
  const abnormalPart = abnormal > 0 ? ` · 异常 ${abnormal}` : ''
  return `通过 ${summary.passed || 0} · 失败 ${summary.failed || 0}${abnormalPart} · 不支持 ${summary.unsupported || 0} · 符合预期 ${summary.expected || 0} · 未测 ${summary.untested || 0}`
}
const probeFormatMark = (status: string): string => (
  status === 'passed' ? '✓'
    : status === 'failed' ? '✗'
      : status === 'abnormal' ? '!'
      : status === 'unsupported' ? '△'
        : status === 'expected' ? '○'
          : status === 'untested' ? '·'
            : status === 'skipped' ? '−'
              : '…'
)
const PROBE_ROW_STATUS_LABELS: Record<string, string> = { ...PROBE_STATUS_LABELS, pending: '待执行', running: '执行中' }

const PROBE_TESTS: ProbeTestDef[] = [
  { id: 'chat-basic', group: '协议基础', name: 'OpenAI Chat Completions', desc: '验证 /v1/chat/completions 基础非流式请求', explain: 'OpenAI 系兼容网关最通用的协议格式，也是中转渠道的第一道验证关卡。', kind: 'basic', format: 'chat' },
  { id: 'responses-basic', group: '协议基础', name: 'OpenAI Responses', desc: '验证 /v1/responses 基础非流式请求', explain: 'Responses API 是 OpenAI 新一代接口，请求/响应结构与 Chat Completions 不同。', kind: 'basic', format: 'responses' },
  { id: 'anthropic-basic', group: '协议基础', name: 'Anthropic Messages', desc: '验证 /v1/messages 基础非流式请求', explain: 'Anthropic Messages 使用 x-api-key 鉴权与不同的消息结构，常被中转站映射为 OpenAI 格式。', kind: 'basic', format: 'anthropic' },
  { id: 'expect-reject', group: '参数与特性', name: '预期拒绝', desc: '按模型档位核对本来就该拒绝的请求。默认不勾选', explain: '勾选后才改判。GPT 推理档拒绝 temperature、top_p，或 Chat 上工具与 reasoning_effort 不能同用，记为符合预期；这些请求却返回成功则记异常。Codex 产品线的 Chat Completions、Claude 官方的 Chat / Responses、Claude 的 reasoning_effort 同样处理。gpt-4o、gpt-4.1 和未识别的模型名仍按普通能力判定。不勾选时，拒绝记为不支持或失败，成功记为通过。Anthropic 被要求改用 max_completion_tokens 时，无论是否勾选都会改字段再测。', kind: 'score', defaultSelected: false },
  { id: 'temperature', group: '参数与特性', name: 'temperature', desc: '采样温度参数支持情况', explain: 'temperature 控制采样随机性。拒绝记为不支持，接受记为通过。勾选「预期拒绝」后，GPT 推理模型拒绝非默认值或不接受该参数时记为符合预期，请求成功则记异常。gpt-4o / gpt-4.1 不套这套规则。', kind: 'parameter' },
  { id: 'top_p', group: '参数与特性', name: 'top_p', desc: '核采样参数支持情况', explain: 'top_p 与 temperature 同为采样参数。默认按是否接受来判。勾选「预期拒绝」后，GPT 推理模型不接受 top_p 记为符合预期，请求成功记异常。', kind: 'parameter' },
  { id: 'top_p_range', group: '参数与特性', name: 'top_p 越界', desc: '发送 top_p=2，只看状态码是否拒绝', explain: '三种协议都在基础请求上带 top_p=2。Anthropic 固定 max_tokens=120，不跟随本轮改成 max_completion_tokens。其它 4xx 记通过，2xx 记失败；401、403、408、429、5xx、超时和网络错误记异常。不看错误正文是否提到 top_p，也不走「预期拒绝」。', kind: 'extra', subtype: 'top-p-range' },
  { id: 'reasoning_effort', group: '参数与特性', name: 'reasoning_effort', desc: '推理强度参数支持情况', explain: 'reasoning_effort（low/medium/high）仅推理模型支持，普通模型通常会报参数错误。勾选「预期拒绝」后，Claude 拒绝该参数记为符合预期，接受则记异常。', kind: 'parameter' },
  { id: 'max_tokens', group: '参数与特性', name: 'Token 上限参数', desc: 'Chat 同时试 max_tokens 与 max_completion_tokens，并核验截断原因', explain: 'Chat Completions 在同一发里带 max_tokens 与 max_completion_tokens；其中一个被拒就丢掉该字段再试，互斥则拆开各测一次。Responses 用 max_output_tokens，Anthropic 默认用 max_tokens。推理模型若被要求改用 max_completion_tokens，会改字段再测；勾选「预期拒绝」时这一次拒绝记为符合预期。接受后再发长输出 + 很小 cap 核验截断原因。finish_reason=length 记通过；请求若返回 400，且正文是 Could not finish the message because max_tokens or model output limit was reached，也记通过，组合里的上限字段算接受。每次语义重试都单独看这句，命中就停止。其它状态码仍记失败。', kind: 'parameter' },
  { id: 'structured_output', group: '参数与特性', name: '结构化输出', desc: '接受 Schema 约束并校验返回 JSON', explain: 'combo 先验证 json_schema / text.format / output_config 是否被接受。接受后再发充足 cap 的 Schema 请求，解析 JSON 并校验 ok 为布尔值。Anthropic 走 output_config.format。', kind: 'parameter' },
  { id: 'tool_calling', group: '参数与特性', name: '工具调用', desc: '接受 tools，并强制调用 get_weather', explain: 'combo 用双工具 + tool_choice=auto 验证请求被接受。接受后再发强制指定 get_weather，核验响应里真有该调用。thinking 模式拒绝 required/object 的 tool_choice 时降级为 auto 再核验。无调用但 HTTP 成功记失败。', kind: 'parameter' },
  { id: 'stream-false', group: '传输与稳定性', name: '非流式响应', desc: '验证 stream=false 的完整 JSON 响应与 usage', explain: '非流式是计费与解析最简单的路径。HTTP 成功时必须带回 input 与 output Token，否则视为计费无法落地。', kind: 'stream' },
  { id: 'stream-true', group: '传输与稳定性', name: 'SSE 流式响应', desc: '验证 stream=true、SSE 格式与带 Token 上限时的 usage', explain: '流式响应按 SSE 分块返回。Chat 带 max_completion_tokens、Responses 带 max_output_tokens、Anthropic 带 max_tokens。通过条件：SSE 可解析且能读到 input + output Token。结束标记（[DONE] / response.completed / message_stop）写入说明，不作为通过条件。', kind: 'stream' },
  { id: 'stream-pure', group: '传输与稳定性', name: '纯流式（无 Token 上限）', desc: 'Chat 最小体：model + messages + stream，提示「讲个笑话」', explain: '不带 max_tokens / max_completion_tokens。用于检出「加上限才回 usage、不加就不回」的渠道。只跑 Chat Completions；Anthropic 强制要 max_tokens，无法做此对照。通过条件：SSE 可解析且能读到 input + output Token。', kind: 'stream', format: 'chat' },
  { id: 'token-stability', group: '传输与稳定性', name: 'Token 计算稳定性', desc: '对固定短输入重复计数并比较波动', explain: '同一输入多次请求的输入 Token 应恒定；混入固定随机串可暴露计数不一致（如后端换编码）。HTTP 成功时必须同时带回 input 与 output Token。', kind: 'token' },
  { id: 'cache-chat', group: '缓存能力', name: 'Chat 自动前缀缓存', desc: '重复长前缀并读取 cached_tokens', explain: 'OpenAI 系自动前缀缓存无需显式声明。cached_tokens > 0 为通过；只看到 cache_write_tokens 记为符合预期；读写字段都没有才是不支持。GPT 请求带稳定的 prompt_cache_key。最多 3 次。', kind: 'cache', format: 'chat' },
  { id: 'cache-responses', group: '缓存能力', name: 'Responses 自动前缀缓存', desc: '重复长前缀并读取 cached_tokens', explain: 'Responses 命中时 input_tokens_details.cached_tokens > 0。只写入、三次未读到命中记为符合预期。GPT 请求带稳定的 prompt_cache_key。最多 3 次。', kind: 'cache', format: 'responses' },
  { id: 'cache-anthropic', group: '缓存能力', name: 'Anthropic 显式缓存', desc: '使用 cache_control 并读取 cache_read_input_tokens', explain: 'Anthropic 需在 content block 显式声明 cache_control，命中时 cache_read_input_tokens > 0。最多 3 次，首次命中即停。此处仅快速判定是否支持，详细命中率、覆盖率与节省测算请用「缓存命中率」工具。', kind: 'cache', format: 'anthropic' },
  { id: 'system-prompt', group: '补充场景', name: 'System 提示词', desc: '检查系统指令是否被正确遵循', explain: '发出 Always reply exactly SYSTEM_OK。通过条件：HTTP 成功、有 usage，且回复文本含 SYSTEM_OK。', kind: 'extra', subtype: 'system' },
  { id: 'multi-turn', group: '补充场景', name: '多轮对话', desc: '两跳口令：先记住再回传真实回复', explain: '第一跳让模型记住口令 ORBIT 并短确认；第二跳只回传角色和文本，去掉服务端 item id。通过条件：第二跳回复含 ORBIT。Responses 若带回 resp_ id，会另发一发 previous_response_id，只用来判断上游是否跨资源，不改变这条用例的结论。', kind: 'extra', subtype: 'multiturn' },
  { id: 'image-input', group: '补充场景', name: '图片输入', desc: '内嵌纯红 PNG，识别主色', explain: '三种协议各自原生图片字段（Chat image_url / Responses input_image 字符串 data URL / Anthropic base64 image block）。问主色，期望 red。4xx 且错误像不支持视觉则记不支持。默认不勾选。', kind: 'extra', subtype: 'image', defaultSelected: false },
  { id: 'error-shape', group: '补充场景', name: '错误码规范性', desc: '使用无效模型检查 HTTP 状态与错误结构', explain: '无效模型应返回 4xx 与结构化错误对象，验证错误形态是否规范。', kind: 'extra', subtype: 'error' },
  { id: 'concurrency', group: '补充场景', name: '并发请求稳定性', desc: '并行发起 3 个低消耗请求', explain: '并发请求检验渠道的连接池与限流策略。', kind: 'extra', subtype: 'concurrency' },
]

const toNativeProbeTest = (c: BuiltinProbeCase): ProbeTestDef => ({
  id: c.id, group: c.group, name: c.name, desc: c.desc, explain: c.explain,
  kind: 'native', format: c.format, defaultSelected: false,
})
const PROBE_BUILTIN_TESTS: ProbeTestDef[] = ALL_BUILTIN_PROBE_CASES.map(toNativeProbeTest)
const probeCatalog = (): ProbeTestDef[] => [...PROBE_TESTS, ...PROBE_BUILTIN_TESTS]
const probeTestById = (id: string): ProbeTestDef | undefined => probeCatalog().find(t => t.id === id)
const probeKey = (id: string, format?: ProbeFormat): string => format ? `${id}@${format}` : id
const probeFormatOfKey = (key: string): ProbeFormat | null => {
  const at = key.indexOf('@')
  return at > 0 ? (key.slice(at + 1) as ProbeFormat) : null
}
const probeMakeRandom = (): string => Math.random().toString(36).slice(2, 10).toUpperCase() + '-FIXED-' + Math.random().toString(36).slice(2, 8)
const probeNowName = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const probeSafeName = (v: string): string => v.replace(/[\\/:*?"<>|\s]+/g, '_')
const probeEscapeHtml = (v: string): string => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] as string))
const probeJoinUrl = (base: string, path: string): string => {
  const clean = base.trim().replace(/\/+$/, '')
  return /\/v1$/i.test(clean) && path.startsWith('/v1/') ? clean + path.slice(3) : clean + path
}
const probeJsonPretty = (v: any): string => {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
const probeMaskValue = (v: string): string => (v.length > 10 ? v.slice(0, 7) + '***' + v.slice(-4) : '***')
const probeMaskHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(headers)) {
    const v = headers[k]
    if (/authorization|api-key/i.test(k)) out[k] = /^Bearer\s+/i.test(v) ? 'Bearer ' + probeMaskValue(v.slice(7)) : probeMaskValue(v)
    else out[k] = v
  }
  return out
}
const probeHeadersObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => { out[k] = v })
  return out
}
const probeExtractRequestId = (headers: Headers): string | null => probeRequestIdFromHeaders(headers)
const probeUsageComplete = (u?: ProbeUsage | null): boolean =>
  !!u && typeof u.input === 'number' && typeof u.output === 'number'
const probeIoText = (u?: ProbeUsage | null): string =>
  `↑${u?.input == null ? '—' : u.input} ↓${u?.output == null ? '—' : u.output}`
const probeUsageFailDetail = (u?: ProbeUsage | null): string =>
  `响应成功但缺少输入/输出 Token，计费无法落地（${probeIoText(u)}）`
const probeApplyUsageGate = (result: ProbeResult): ProbeResult => {
  if (result.status !== 'passed' && result.status !== 'unsupported') return result
  const http = result.repro?.status
  if (http == null || http < 200 || http >= 300) return result
  if (probeUsageComplete(result.usage)) return result
  const extra = probeUsageFailDetail(result.usage)
  return { ...result, status: 'failed', detail: result.detail ? `${result.detail}；${extra}` : extra }
}
const probeExtractError = (data: any): string => {
  if (typeof data === 'string') return data
  return probeJsonPretty(data?.error || data)
}
const probeBaseBody = (cfg: ProbeCfg, format: ProbeFormat, prompt = 'Reply with exactly: OK') =>
  probeProtocolOf(format).baseBody(cfg.model, prompt)
const probeComboBody = (cfg: ProbeCfg, format: ProbeFormat, pending: Iterable<string>, chatMaxKeys?: string[]) =>
  probeParamComboBody(cfg.model, format, pending, chatMaxKeys)
const probeParamLabel = (id: string): string => probeTestById(id)?.name || id
const PROBE_SEMANTIC_IDS = new Set(['max_tokens', 'tool_calling', 'structured_output'])
const probeResult = (status: ProbeStatus, detail: string, extra: Partial<ProbeResult> = {}): ProbeResult => ({ status, detail, duration: null, repro: null, ...extra })
const probeOriginInput = (rows: ProbeLog[]) => rows.map(log => ({
  url: log.url,
  status: log.status,
  resultKey: log.resultKey,
  format: log.format,
  requestBody: log.requestBody,
  responseHeaders: log.responseHeaders,
  responseBody: log.responseBody,
  usage: log.usage,
}))
const probeReproOf = (log: ProbeLog): ProbeResult['repro'] => {
  const responseHeaders = probeRequestIdHeaders(log.responseHeaders)
  const repro: NonNullable<ProbeResult['repro']> = {
    url: log.url, headers: log.requestHeaders, body: log.requestBody, status: log.status,
    requestId: probeRequestIdFromRecord(responseHeaders) ?? log.requestId,
    ...(Object.keys(responseHeaders).length ? { responseHeaders } : {}),
  }
  const responseBody = probeKeptResponseBody(log.status, log.responseBody)
  if (responseBody !== undefined) repro.responseBody = responseBody
  return repro
}
const probeMultiFormatKinds: ProbeTestDef['kind'][] = ['parameter', 'token', 'stream', 'extra', 'native']
const PROBE_STREAM_MAX_TOKENS = PROBE_DEFAULT_CAP
const PROBE_PURE_STREAM_PROMPT = '讲个笑话'
const PROBE_429_RETRY_MAX = 2
const PROBE_429_RETRY_WAIT_MS = 6000
const PROBE_STOP_DETAIL = '测试被用户中止'

const probeResetLogResponse = (log: ProbeLog) => {
  log.status = null
  log.statusText = ''
  log.duration = 0
  log.responseHeaders = {}
  log.responseBody = null
  log.sse = []
  log.chunks = []
  log.usage = probeEmptyUsage()
  log.requestId = null
}
const probeAppliesToFormat = (_id: string, _format: ProbeFormat): boolean => true
const probeLegacyHidden = (key: string, result?: { detail?: string } | null): boolean =>
  key === 'structured_output@anthropic' && !!result?.detail?.includes('无原生 response_format')
const probeResultVisible = (key: string, result?: { detail?: string } | null): boolean =>
  !probeLegacyHidden(key, result)
const probeBoundFormats = (t: ProbeTestDef, activeFormats: ProbeFormat[]): ProbeFormat[] => {
  if (!probeMultiFormatKinds.includes(t.kind)) return []
  const formats = t.format
    ? (activeFormats.includes(t.format) ? [t.format] : [])
    : activeFormats
  return formats.filter(f => probeAppliesToFormat(t.id, f))
}
const probeSkipKeysOf = (t: ProbeTestDef, activeFormats: ProbeFormat[]): string[] => {
  if (t.kind === 'score') return []
  if (!probeMultiFormatKinds.includes(t.kind)) return [t.id]
  return probeBoundFormats(t, activeFormats).map(f => probeKey(t.id, f))
}
// 已勾选的绑定协议项（如纯流式@chat）即使对应基础格式未启用，也要占住结果键，
// 否则中止时回填不到「已跳过」，「另有 N 项未执行」会少算。未勾选路径仍走 boundFormats。
const probeExpectedKeysOf = (t: ProbeTestDef, activeFormats: ProbeFormat[]): string[] => {
  if (t.kind === 'score') return []
  if (!probeMultiFormatKinds.includes(t.kind)) return [t.id]
  if (t.format) return [probeKey(t.id, t.format)]
  return probeBoundFormats(t, activeFormats).map(f => probeKey(t.id, f))
}
const probeSelectedCountOf = (t: ProbeTestDef, activeFormats: ProbeFormat[]): number => {
  if (t.kind === 'score') return 0
  if (!probeMultiFormatKinds.includes(t.kind)) return 1
  if (t.format) return 1
  return probeBoundFormats(t, activeFormats).length
}
const probeResultKeysOf = (t: ProbeTestDef, results: Record<string, ProbeResult>): string[] => {
  if (probeMultiFormatKinds.includes(t.kind)) {
    const prefix = t.id + '@'
    return Object.keys(results).filter(k => k.startsWith(prefix) && probeResultVisible(k, results[k])).sort((a, b) => a.localeCompare(b))
  }
  return results[t.id] ? [t.id] : []
}
const probeSanitizeReport = (rep: ProbeReport): ProbeReport => {
  const results: Record<string, ProbeResult> = {}
  for (const [k, v] of Object.entries(rep.results || {})) {
    if (probeResultVisible(k, v)) results[k] = v
  }
  const summary = probeEmptySummary()
  for (const r of Object.values(results)) {
    if (summary[r.status] != null) summary[r.status]++
  }
  return { ...rep, results, summary }
}
const probeAggregateStatus = (items: { status: ProbeStatus }[]): ProbeStatus =>
  aggregateProbeStatus(items.map(item => item.status))

function loadProbeCfg(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(kvGet(PROBE_STORAGE_KEY) || '{}') } catch { return {} }
}
function saveProbeCfg(cfg: Record<string, any>) {
  try { kvSet(PROBE_STORAGE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

// ── 持久化：渠道（探测目标）列表 + 当前激活渠道 ──
function loadProbeChannelsRaw(): ProbeChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = kvGet(PROBE_CHANNELS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((c): c is ProbeChannel =>
      c && typeof c === 'object' && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.baseUrl === 'string')
  } catch { return [] }
}
function saveProbeChannels(list: ProbeChannel[]) {
  if (typeof window === 'undefined') return
  try { kvSet(PROBE_CHANNELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
function loadProbeActiveChId(): string | null {
  if (typeof window === 'undefined') return null
  try { return kvGet(PROBE_ACTIVE_CH_KEY) } catch { return null }
}
// 首次加载时的迁移/兜底：老版本的单一配置（modelprobe-config.baseUrl/chatUrl/responsesUrl/anthropicUrl/timeout
// + modelprobe-key 加密密文）迁移成一条「默认渠道」；密文直接搬运，无需解密重加密（同一套 AES-GCM passphrase）。
// 必须是同步函数（用作 useState 懒初始化器）。
function loadOrMigrateProbeChannels(): { channels: ProbeChannel[]; activeId: string | null } {
  const existing = loadProbeChannelsRaw()
  if (existing.length > 0) return { channels: existing, activeId: loadProbeActiveChId() }
  const legacy = loadProbeCfg()
  if (!legacy.baseUrl || !String(legacy.baseUrl).trim()) return { channels: [], activeId: null }
  const legacyKeyEnc = (typeof window !== 'undefined' && kvGet(PROBE_KEY_STORAGE_KEY)) || ''
  const ch: ProbeChannel = {
    id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: '默认渠道',
    baseUrl: String(legacy.baseUrl).trim(),
    timeoutSec: legacy.timeout ?? '60',
    chatUrl: legacy.chatUrl ?? '',
    responsesUrl: legacy.responsesUrl ?? '',
    anthropicUrl: legacy.anthropicUrl ?? '',
    apiKeyEnc: legacyKeyEnc,
    keyMask: legacyKeyEnc ? '（已加密，未展示）' : '',
  }
  saveProbeChannels([ch])
  try { kvSet(PROBE_ACTIVE_CH_KEY, ch.id) } catch { /* ignore */ }
  return { channels: [ch], activeId: ch.id }
}

// 把一个渠道（+ 全局的 model）组装成执行器实际使用的 ProbeCfg：解密 apiKey、按渠道各自的三种协议 URL
// 覆写（留空回退到 baseUrl）拼出完整请求地址。testConnection/runProbe 共用，避免重复现场拼装。
async function probeBuildCfgFromChannel(ch: ProbeChannel, model: string, timeoutCapMs?: number): Promise<ProbeCfg> {
  const apiKey = await decryptLlmApiKey(ch.apiKeyEnc)
  const rawMs = (Number(ch.timeoutSec) || 60) * 1000
  return {
    baseUrl: ch.baseUrl, apiKey, model,
    timeoutMs: timeoutCapMs != null ? Math.min(rawMs, timeoutCapMs) : rawMs,
    urlOf: {
      chat: probeJoinUrl(ch.chatUrl.trim() || ch.baseUrl, PROBE_ENDPOINTS.chat),
      responses: probeJoinUrl(ch.responsesUrl.trim() || ch.baseUrl, PROBE_ENDPOINTS.responses),
      anthropic: probeJoinUrl(ch.anthropicUrl.trim() || ch.baseUrl, PROBE_ENDPOINTS.anthropic),
    },
  }
}

// 历史记录存于共享 IndexedDB（dev-toolkit-history / modelprobe store），不再整份塞进
// localStorage：老版本会在配额超限时静默从最旧记录开始裁剪，极端情况下只剩最新 1 条。
async function probeHistMigrateOnce(): Promise<void> {
  await historyDbMigrateFromLocalStorage<ProbeReport>('modelprobe', PROBE_HISTORY_KEY)
}
async function loadProbeHistory(): Promise<ProbeReport[]> {
  const list = await historyDbGetAll<ProbeReport>('modelprobe')
  return probeHistoryNewestFirst(list)
}
async function saveProbeHistory(rep: ProbeReport): Promise<ProbeReport[]> {
  await historyDbPutOne('modelprobe', rep)
  return loadProbeHistory()
}
// 一批多模型会连续写入。写一条就裁会把本批更早的模型删掉，所以裁剪留到整批结束。
async function trimProbeHistory(): Promise<ProbeReport[]> {
  const list = await loadProbeHistory()
  const overflow = probeHistoryOverflow(list, PROBE_HISTORY_MAX)
  if (!overflow.length) return list
  await historyDbDeleteMany('modelprobe', overflow.map(item => item.id))
  return loadProbeHistory()
}
async function deleteProbeHistory(id: string): Promise<ProbeReport[]> {
  await historyDbDeleteOne('modelprobe', id)
  return loadProbeHistory()
}
async function clearProbeHistory(): Promise<void> {
  await historyDbClear('modelprobe')
}
function probeDownload(content: string, type: string, name: string) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const PROBE_COPY_SVG = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
)
const PROBE_CHECK_SVG = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5l3.2 3.2L13 4.8" />
  </svg>
)
const PROBE_CLOSE_SVG = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

function ProbeCopyIconBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? '已复制' : '复制'}
      title="复制"
      className={`probe-copy-btn${copied ? ' is-ok' : ''}`}
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      }}
    >
      {copied ? PROBE_CHECK_SVG : PROBE_COPY_SVG}
    </button>
  )
}

function ProbeCodeBlock({ title, children, maxH = 320 }: { title: string; children: string; maxH?: number }) {
  const text = children ?? ''
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-bold" style={{ color: 'var(--t3)' }}>{title}</div>
      <div className="relative min-w-0">
        <ProbeCopyIconBtn text={text} />
        <pre className="overflow-auto rounded-xl p-3 pr-10 font-mono text-[11px] leading-5" style={{ background: 'var(--code)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: maxH, fontFamily: PROBE_MONO }}>
          <code dangerouslySetInnerHTML={{ __html: highlightJson(text) || ' ' }} />
        </pre>
      </div>
    </div>
  )
}

function ProbeCopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      }}
      className="border-0 outline-none cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[10px] flex-shrink-0 active:scale-95"
      title="复制 Request ID"
      style={{ background: copied ? 'var(--okBg)' : 'var(--s2)', color: copied ? 'var(--ok)' : 'var(--t2)', fontFamily: PROBE_MONO }}
    >
      {copied ? '✓ 已复制' : (value.length > 14 ? value.slice(0, 13) + '…' : value)}
    </button>
  )
}

function ProbeUsageChip({ usage }: { usage: ProbeUsage }) {
  const chip = (v: number | null) => (v == null ? '—' : String(v))
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--s2)', color: 'var(--t2)', fontFamily: PROBE_MONO }}>
      ↑{chip(usage.input)} ↓{chip(usage.output)} 缓存读{chip(usage.cacheRead)} 写{chip(usage.cacheWrite)}
    </span>
  )
}

function ProbeIoChip({ usage }: { usage?: ProbeUsage | null }) {
  const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap tabular-nums" style={{ background: 'var(--s2)', fontFamily: PROBE_MONO }}>
      <span style={{ color: usage?.input == null ? 'var(--t3)' : 'var(--text)' }}>↑{n(usage?.input)}</span>
      {' '}
      <span style={{ color: usage?.output == null ? 'var(--t3)' : 'var(--text)' }}>↓{n(usage?.output)}</span>
    </span>
  )
}

function ProbeVerdictBlock({ verdict }: { verdict: ProbeVerdict }) {
  const layer = verdict.upstream
  if (!layer) return null
  return (
    <div className="mt-4 grid items-baseline gap-x-3" style={{ gridTemplateColumns: '4.5rem minmax(0,1fr)' }}>
      <div className="text-xs font-semibold leading-5" style={{ color: 'var(--t3)' }}>渠道判断</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-5" style={{ color: 'var(--text)' }}>{layer.label}</div>
        {layer.reasons.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {layer.reasons.map(reason => (
              <li key={reason} className="text-xs leading-5 break-words" style={{ color: 'var(--t2)' }}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ProbeStatusBadge({ status }: { status: ProbeStatus }) {
  const s = status === 'passed' ? { background: 'var(--okBg)', color: 'var(--ok)' }
    : status === 'failed' ? { background: 'var(--errBg)', color: 'var(--err)' }
    : status === 'abnormal' ? { background: 'color-mix(in srgb, var(--err) 14%, transparent)', color: 'color-mix(in srgb, var(--err) 55%, var(--warn))' }
    : status === 'unsupported' ? { background: 'var(--warnBg)', color: 'var(--warn)' }
    : status === 'expected' ? { background: 'var(--accentSub)', color: 'var(--accent)' }
    : { background: 'var(--s2)', color: 'var(--t3)' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={s}>
      {PROBE_STATUS_LABELS[status]}
    </span>
  )
}

function ProbeResultDialog({ detail, onClose, onRetry, retrying, retryDisabled }: {
  detail: { test: ProbeTestDef; key: string; result: ProbeResult }
  onClose: () => void
  onRetry?: (key: string) => void
  retrying?: boolean
  retryDisabled?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  const requestId = probeShownRequestId(detail.result.repro)
  return probePortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 ia-lightbox-enter"
      style={{ background: 'color-mix(in srgb, var(--bg) 78%, transparent)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="floating-material probe-sheet-enter rounded-2xl p-6 w-full max-w-3xl max-h-[86vh] overflow-y-auto"
        style={{ background: 'var(--surfaceStrong)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ProbeStatusBadge status={detail.result.status} />
              {probeFormatOfKey(detail.key) && (
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'var(--s2)', color: 'var(--t2)' }}>
                  {PROBE_FORMAT_LABELS[probeFormatOfKey(detail.key)!]}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--text)', letterSpacing: '-0.014em' }}>{detail.test.name}</h2>
            <p className="text-xs mt-1 leading-5 break-words" style={{ color: 'var(--t3)' }}>{detail.test.explain}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onRetry && (
              <button
                type="button"
                className="probe-retry"
                aria-label={`重试 ${detail.test.name}${probeFormatOfKey(detail.key) ? ` ${PROBE_FORMAT_LABELS[probeFormatOfKey(detail.key)!]}` : ''}`}
                disabled={retryDisabled || retrying}
                onClick={() => onRetry(detail.key)}
              >{retrying ? '重试中' : '重试'}</button>
            )}
            <Btn small variant="ghost" className="shrink-0" onClick={onClose}>关闭</Btn>
          </div>
        </div>
        <p className="text-sm mt-3 leading-6 break-words" style={{ color: 'var(--text)' }}>{detail.result.detail}</p>
        {detail.result.checks && detail.result.checks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.result.checks.map(c => (
              <span key={c.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{
                background: c.passed ? 'var(--okBg)' : 'var(--errBg)',
                color: c.passed ? 'var(--ok)' : 'var(--err)',
              }}>{c.passed ? '✓' : '✗'} {c.detail}</span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {detail.result.duration != null && (
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--s2)', color: 'var(--t2)', fontFamily: PROBE_MONO }}>{detail.result.duration} ms</span>
          )}
          <ProbeUsageChip usage={detail.result.usage ?? probeEmptyUsage()} />
        </div>
        {detail.result.cache && (
          <div className="text-xs mt-2" style={{ color: 'var(--t2)' }}>缓存：{detail.result.cache.hits}/{detail.result.cache.total} 次命中 · 读取值 {detail.result.cache.reads.join(', ')}</div>
        )}
        {detail.result.tokenValues && detail.result.tokenValues.length > 0 && (
          <div className="text-xs mt-2" style={{ color: 'var(--t2)' }}>每次输入 Token：{detail.result.tokenValues.join(', ')}</div>
        )}
        {detail.result.repro ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--s2)', color: 'var(--text)', fontFamily: PROBE_MONO }}>POST {detail.result.repro.url}</span>
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--s2)', color: 'var(--text)', fontFamily: PROBE_MONO }}>HTTP {detail.result.repro.status ?? '—'}</span>
              {requestId && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>Request ID</span>
                  <ProbeCopyId value={requestId} />
                </span>
              )}
            </div>
            <ProbeCodeBlock title="请求头（密钥已脱敏）" children={probeJsonPretty(detail.result.repro.headers)} />
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <ProbeCodeBlock title="请求体" children={probeJsonPretty(detail.result.repro.body)} />
              {detail.result.repro.responseBody !== undefined && (
                <ProbeCodeBlock title="响应体" children={typeof detail.result.repro.responseBody === 'string' ? detail.result.repro.responseBody : probeJsonPretty(detail.result.repro.responseBody)} />
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs mt-4" style={{ color: 'var(--t3)' }}>本轮无实际请求。</p>
        )}
      </div>
    </div>,
  )
}

function ProbeReportTiles({ report, onRetry, retryingKey, retryDisabled }: {
  report: ProbeReport
  onRetry?: (key: string) => void
  retryingKey: string | null
  retryDisabled: boolean
}) {
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const groups: { title: string; items: { test: ProbeTestDef; key: string; result: ProbeResult }[] }[] = []
  let skipped = 0
  for (const t of probeCatalog()) {
    const keys = probeResultKeysOf(t, report.results)
    const items = keys.map(key => ({ test: t, key, result: report.results[key] })).filter(x => x.result)
    skipped += items.filter(x => x.result.status === 'skipped').length
    const executed = items.filter(x => x.result.status !== 'skipped')
    if (!executed.length) continue
    let g = groups.find(x => x.title === t.group)
    if (!g) {
      g = { title: t.group, items: [] }
      groups.push(g)
    }
    g.items.push(...executed)
  }
  const detailItem = detailKey
    ? groups.flatMap(group => group.items).find(item => item.key === detailKey) ?? null
    : null

  let tileIndex = 0
  return (
    <>
      {groups.map(g => (
        <section key={g.title} className="mt-5">
          <div className="text-[11px] font-bold uppercase mb-2.5" style={{ color: 'var(--t3)', letterSpacing: '0.08em' }}>{g.title}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {g.items.map(item => {
              const fmt = probeFormatOfKey(item.key)
              const st = item.result.status
              const i = Math.min(tileIndex++, 12)
              const retrying = retryingKey === item.key
              const formatLabel = fmt ? PROBE_FORMAT_LABELS[fmt] : ''
              return (
                <div key={item.key} className="relative">
                  <button
                    type="button"
                    data-probe-tile=""
                    data-probe-key={item.key}
                    className="probe-tile w-full text-left rounded-2xl px-4 py-3.5"
                    style={{ '--i': i } as React.CSSProperties}
                    onClick={() => setDetailKey(item.key)}
                  >
                    <div className="flex items-center justify-between gap-2 pr-14">
                      <span className={`probe-status-text is-${st}`}>{PROBE_STATUS_LABELS[st]}</span>
                      <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>
                        {item.result.duration != null ? `${item.result.duration} ms` : ''}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.011em' }}>{item.test.name}</div>
                    {fmt && (
                      <div className="mt-1.5">
                        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'var(--s2)', color: 'var(--t2)' }}>{formatLabel}</span>
                      </div>
                    )}
                    <div className="mt-2 text-xs line-clamp-2 leading-5" style={{ color: 'var(--t2)' }}>{item.result.detail}</div>
                    {item.result.checks && item.result.checks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.result.checks.map(c => (
                          <span key={c.id} className="rounded-full px-1.5 py-0.5 text-[10px]" style={{
                            background: c.passed ? 'var(--okBg)' : 'var(--errBg)',
                            color: c.passed ? 'var(--ok)' : 'var(--err)',
                          }}>{c.passed ? '✓' : '✗'} {c.id}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2">
                      <ProbeIoChip usage={item.result.usage} />
                    </div>
                  </button>
                  {onRetry && (
                    <button
                      type="button"
                      data-probe-retry=""
                      className="probe-retry absolute top-3.5 right-4"
                      aria-label={`重试 ${item.test.name}${formatLabel ? ` ${formatLabel}` : ''}`}
                      disabled={retryDisabled || retrying}
                      onClick={e => { e.stopPropagation(); onRetry(item.key) }}
                    >{retrying ? '重试中' : '重试'}</button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
      {skipped > 0 && (
        <p className="mt-5 text-xs" style={{ color: 'var(--t3)' }}>另有 {skipped} 项未执行。</p>
      )}
      {detailItem && (
        <ProbeResultDialog
          detail={detailItem}
          onClose={() => setDetailKey(null)}
          onRetry={onRetry}
          retrying={retryingKey === detailItem.key}
          retryDisabled={retryDisabled}
        />
      )}
    </>
  )
}

function ProbeMatrixCopy({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`probe-matrix-icon is-inline${copied ? ' is-ok' : ''}`}
      aria-label={copied ? '已复制' : label}
      title={copied ? '已复制' : label}
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      }}
    >
      {copied ? PROBE_CHECK_SVG : PROBE_COPY_SVG}
    </button>
  )
}

function ProbeMatrixCode({ title, text, copyLabel }: { title: string; text: string; copyLabel?: string }) {
  return (
    <div className="mt-5 min-w-0">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-xs" style={{ color: 'var(--t3)' }}>{title}</div>
        <ProbeMatrixCopy text={text} label={copyLabel} />
      </div>
      <pre className="overflow-auto rounded-[10px] p-3 font-mono text-[12px] leading-6" style={{ background: 'var(--code)', color: 'var(--text)', maxHeight: 320, fontFamily: PROBE_MONO }}>
        <code dangerouslySetInnerHTML={{ __html: highlightJson(text) || ' ' }} />
      </pre>
    </div>
  )
}

function matrixUsageLine(usage?: ProbeUsage | null): string | null {
  if (!usage) return null
  const n = (v: number | null) => (v == null ? '—' : String(v))
  const parts = [`↑${n(usage.input)}`, `↓${n(usage.output)}`]
  if (usage.cacheRead != null) parts.push(`缓存读 ${usage.cacheRead}`)
  if (usage.cacheWrite != null) parts.push(`写 ${usage.cacheWrite}`)
  return parts.join(' ')
}

function matrixRawFormat(key: string, reports: ProbeReport[]): string {
  for (const report of reports) {
    const result = report.results[key]
    const fmt = result?.format || probeFormatOfKey(key)
    if (fmt) return PROBE_FORMAT_LABELS[fmt] || fmt
  }
  const fmt = probeFormatOfKey(key)
  return fmt ? (PROBE_FORMAT_LABELS[fmt] || '') : ''
}

function ProbeMatrixDialog({ detail, onClose }: {
  detail: { test: ProbeTestDef; key: string; result: ProbeResult }
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  const fmt = probeFormatOfKey(detail.key) || detail.result.format || null
  const subtitle = matrixFormatSubtitle(detail.test.name, fmt ? (PROBE_FORMAT_LABELS[fmt] || '') : '')
  const note = presentMatrixNote(detail.result.detail || '')
  const tokens = matrixTokenValues(detail.result.tokenValues)
  const usageLine = matrixUsageLine(detail.result.usage)
  const repro = detail.result.repro
  const requestId = probeShownRequestId(repro)
  return probePortal(
    <div
      className="probe-matrix-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="probe-matrix-sheet-title"
        className="probe-matrix-sheet w-full max-w-3xl max-h-[86vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <ProbeStatusBadge status={detail.result.status} />
            <h2 id="probe-matrix-sheet-title" className="text-lg font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>{detail.test.name}</h2>
            {subtitle && <span className="text-xs" style={{ color: 'var(--t3)' }}>{subtitle}</span>}
          </div>
          <button type="button" className="probe-matrix-icon" aria-label="关闭" title="关闭" onClick={onClose}>{PROBE_CLOSE_SVG}</button>
        </div>
        {note.detail && <p className="mt-3.5 text-sm leading-6 break-words" style={{ color: 'var(--text)' }}>{note.detail}</p>}
        {note.errBody && <pre className="probe-matrix-err font-mono" style={{ fontFamily: PROBE_MONO }}>{note.errBody}</pre>}
        {detail.result.checks && detail.result.checks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.result.checks.map(c => (
              <span key={c.id} className="rounded-md px-2 py-0.5 text-[11px]" style={{
                background: c.passed ? 'var(--okBg)' : 'var(--errBg)',
                color: c.passed ? 'var(--ok)' : 'var(--err)',
              }}>{c.passed ? '✓' : '✗'} {c.detail}</span>
            ))}
          </div>
        )}
        {(detail.result.duration != null || usageLine || detail.result.cache || tokens) && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]" style={{ color: 'var(--text)' }}>
            {detail.result.duration != null && <span><span style={{ color: 'var(--t3)' }}>耗时 </span>{detail.result.duration} ms</span>}
            {usageLine && <span><span style={{ color: 'var(--t3)' }}>用量 </span><span className="font-mono" style={{ fontFamily: PROBE_MONO }}>{usageLine}</span></span>}
            {detail.result.cache && <span><span style={{ color: 'var(--t3)' }}>缓存 </span>{detail.result.cache.hits}/{detail.result.cache.total} 次命中</span>}
            {tokens && <span><span style={{ color: 'var(--t3)' }}>输入 Token </span>{tokens.join(', ')}</span>}
          </div>
        )}
        {repro ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md px-2 py-0.5 font-mono text-[11.5px]" style={{ background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--t2)', fontFamily: PROBE_MONO }}>POST {repro.url}</span>
              <span className="rounded-md px-2 py-0.5 font-mono text-[11.5px]" style={{ background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--t2)', fontFamily: PROBE_MONO }}>HTTP {repro.status ?? '—'}</span>
              {requestId && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>Request ID</span>
                  <ProbeCopyId value={requestId} />
                </span>
              )}
            </div>
            <ProbeMatrixCode title="请求头（密钥已脱敏）" text={probeJsonPretty(repro.headers)} />
            <div className="grid gap-3 xl:grid-cols-2">
              <ProbeMatrixCode title="请求体" text={probeJsonPretty(repro.body)} />
              {repro.responseBody !== undefined && (
                <ProbeMatrixCode title="响应体" text={typeof repro.responseBody === 'string' ? repro.responseBody : probeJsonPretty(repro.responseBody)} copyLabel="复制响应体" />
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs" style={{ color: 'var(--t3)' }}>本轮无实际请求。</p>
        )}
      </div>
    </div>,
  )
}

function ProbeOriginDialog({ origin, onClose }: { origin: { column: string; label: string; reasons: string[] }; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return probePortal(
    <div className="probe-matrix-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="probe-origin-title" className="probe-matrix-sheet w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="probe-origin-title" className="text-lg font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>来源判断</h2>
            <p className="mt-1 text-xs break-words" style={{ color: 'var(--t3)' }}>{origin.column}</p>
          </div>
          <button type="button" className="probe-matrix-icon" aria-label="关闭" title="关闭" onClick={onClose}>{PROBE_CLOSE_SVG}</button>
        </div>
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{origin.label}</p>
        {origin.reasons.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {origin.reasons.map(reason => <li key={reason} className="text-sm leading-6" style={{ color: 'var(--t2)' }}>{reason}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm" style={{ color: 'var(--t3)' }}>没有更多依据。</p>
        )}
      </div>
    </div>,
  )
}

function ProbeMatrixView({ reports }: { reports: ProbeReport[] }) {
  const [detail, setDetail] = useState<{ test: ProbeTestDef; key: string; result: ProbeResult } | null>(null)
  const [origin, setOrigin] = useState<{ column: string; label: string; reasons: string[] } | null>(null)
  const labels = probeMatrixColumnLabels(reports)
  const hasProblems = probeMatrixHasProblems(reports)
  const groups: { title: string; rows: { test: ProbeTestDef; key: string; subtitle: string }[] }[] = []
  for (const test of probeCatalog()) {
    const keySet = new Set<string>()
    for (const report of reports) {
      for (const key of probeResultKeysOf(test, report.results)) keySet.add(key)
    }
    const keys = [...keySet].sort((a, b) => a.localeCompare(b)).filter(key => reports.some(report => probeMatrixCellScored(report.results[key]?.status)))
    if (!keys.length) continue
    let group = groups.find(item => item.title === test.group)
    if (!group) {
      group = { title: test.group, rows: [] }
      groups.push(group)
    }
    for (const key of keys) group.rows.push({ test, key, subtitle: matrixFormatSubtitle(test.name, matrixRawFormat(key, reports)) })
  }
  const colspan = reports.length + 1
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="probe-matrix-view">
      <div className="flex shrink-0 items-center justify-between gap-3 overflow-x-auto px-4 py-3 sm:px-6" style={{ borderBottom: '1px solid color-mix(in srgb, var(--text) 8%, transparent)' }}>
        <h3 className="shrink-0 whitespace-nowrap text-sm font-semibold" style={{ color: 'var(--text)' }}>模型探测</h3>
        <div className="flex shrink-0 gap-2">
          <Btn small variant="soft" className="whitespace-nowrap" onClick={() => downloadProbeMatrixHtml(reports, probeCatalog(), PROBE_FORMAT_LABELS)}>导出 HTML</Btn>
          <Btn
            small
            variant="soft"
            className="whitespace-nowrap"
            disabled={!hasProblems}
            title={hasProblems ? '只导出失败、异常和不支持，可看请求，不带来源判断' : '这次没有失败、异常或不支持'}
            onClick={() => downloadProbeMatrixHtml(reports, probeCatalog(), PROBE_FORMAT_LABELS, 'problems')}
          >异常导出</Btn>
        </div>
      </div>
      <div className="probe-matrix-scroll min-h-0 flex-1 overflow-auto">
        <table className="probe-matrix">
          <thead>
            <tr>
              <th className="probe-matrix-rowh" scope="col">测试项</th>
              {reports.map((report, index) => {
                const column = labels[index]
                const text = probeMatrixColumnText(column)
                const source = probeShownSource(report.verdict)
                const lines = (
                  <>
                    <span className="probe-matrix-model">{column.model}</span>
                    {column.source ? <span className="probe-matrix-source">{column.source}</span> : null}
                    {source ? <span className="probe-matrix-source">{source.label}</span> : null}
                  </>
                )
                return (
                  <th key={report.id} scope="col">
                    {source ? (
                      <button
                        type="button"
                        className="probe-matrix-col"
                        aria-label={`来源判断 ${text}`}
                        onClick={() => setOrigin({ column: text, label: source.label, reasons: source.reasons })}
                      >
                        {lines}
                      </button>
                    ) : lines}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.title}>
                <tr className="probe-matrix-group">
                  <td colSpan={colspan}><span>{group.title}</span></td>
                </tr>
                {group.rows.map(row => (
                  <tr key={row.key}>
                    <th className="probe-matrix-rowh" scope="row">
                      <div>{row.test.name}</div>
                      {row.subtitle && <span className="probe-matrix-sub">{row.subtitle}</span>}
                    </th>
                    {reports.map(report => {
                      const result = report.results[row.key]
                      if (!result || !probeMatrixCellScored(result.status)) return <td key={report.id} className="probe-matrix-gap">—</td>
                      const statusLabel = PROBE_STATUS_LABELS[result.status]
                      const aria = [row.test.name, row.subtitle, statusLabel].filter(Boolean).join(' ')
                      return (
                        <td key={report.id}>
                          <button
                            type="button"
                            className="probe-matrix-cell"
                            aria-label={aria}
                            onClick={() => setDetail({ test: row.test, key: row.key, result })}
                          >
                            <span className={`probe-matrix-status is-${result.status}`}>{statusLabel}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {detail && <ProbeMatrixDialog detail={detail} onClose={() => setDetail(null)} />}
      {origin && <ProbeOriginDialog origin={origin} onClose={() => setOrigin(null)} />}
    </div>
  )
}

function ProbeFormatCard({ t, checked, disabled, status, onChange }: {
  t: ProbeTestDef
  checked: boolean
  disabled: boolean
  status: { status: ProbeStatus | 'pending' | 'running'; detail: string }
  onChange: () => void
}) {
  const fmt = t.format!
  const statusColor = probeStatusColor(status.status)
  return (
    <label
      className={`probe-format-card${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ background: checked ? undefined : 'var(--s1)', opacity: disabled ? 0.55 : 1 }}
      title={`${PROBE_FORMAT_LABELS[fmt]} · ${t.desc}`}
    >
      <input
        type="checkbox"
        data-id={t.id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={`选择 ${t.name}`}
        className="probe-format-input"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="probe-format-chip" style={{ fontFamily: PROBE_MONO }}>{PROBE_FORMAT_SHORT[fmt]}</span>
        <span className={`probe-format-check${checked ? ' is-on' : ''}`} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 5.2 4 7.7 8.5 2.5" />
          </svg>
        </span>
      </div>
      <div className="mt-2.5 text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{t.name}</div>
      <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--t3)' }}>{t.desc}</div>
      <div className="mt-2 text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: statusColor }}>
        {PROBE_ROW_STATUS_LABELS[status.status] ?? status.status}
      </div>
    </label>
  )
}

// ─── Panes：按区域拆分的 memo 子组件 ─────────────────────────────────────────
// 探测运行期间 setStatuses/setProgress/setLogs 高频触发，左侧配置栏与渠道管理
// 面板的 props 在运行中保持不变，memo 后整体跳过重渲染。

type ProbeChFormState = { name: string; baseUrl: string; timeoutSec: string; chatUrl: string; responsesUrl: string; anthropicUrl: string; apiKey: string }
type ProbeConnResult = { ok: boolean; status: number | null; ms: number; err: string } | null

function probePortal(node: React.ReactNode) {
  if (typeof document === 'undefined') return null
  return createPortal(node, document.querySelector('.app-shell') || document.body)
}

function ProbeHelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const maxW = 240
    const left = Math.min(r.right + 8, window.innerWidth - maxW - 8)
    setPos({ top: Math.max(8, r.top), left: Math.max(8, left) })
    setOpen(true)
  }
  return (
    <>
      <span
        ref={ref}
        className="probe-help-tip"
        tabIndex={0}
        aria-label={text}
        role="note"
        onPointerEnter={show}
        onPointerLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >?</span>
      {open && createPortal(
        <span className="probe-help-bubble" role="tooltip" style={{ top: pos.top, left: pos.left }}>{text}</span>,
        document.querySelector('.app-shell') || document.body,
      )}
    </>
  )
}

const ProbeConfigPane = React.memo(function ProbeConfigPane({
  channels, activeChId, onActiveChId, model, onModel,
  randomString, onRandomString, onRegenRandom, tokenRuns, onTokenRuns,
  includeStreamUsage, onIncludeStreamUsage,
  running, connRunning, connResults, startErr, onTestConnection,
}: {
  channels: ProbeChannel[]; activeChId: string | null; onActiveChId: (v: string) => void
  model: string; onModel: (v: string) => void
  randomString: string; onRandomString: (v: string) => void; onRegenRandom: () => void
  tokenRuns: string; onTokenRuns: (v: string) => void
  includeStreamUsage: boolean; onIncludeStreamUsage: (v: boolean) => void
  running: boolean; connRunning: boolean; connResults: Record<ProbeFormat, ProbeConnResult>
  startErr: string; onTestConnection: () => void
}) {
  const hasActiveChannel = channels.some(c => c.id === activeChId)
  return (
    <div className="w-full max-h-[46%] flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto border-b lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border)', background: 'var(--s1)' }}>
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Label className="block mb-0">使用渠道</Label>
          <ProbeHelpTip text="密钥仅以加密形式保存于本浏览器。请确认目标 API 允许浏览器跨域访问。" />
        </div>
        <CustomSelect value={activeChId ?? ''} onChange={onActiveChId}
          options={channels.map(c => ({ value: c.id, label: c.name }))} />
        {channels.length === 0 && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请先到「渠道管理」添加渠道。</p>}
      </div>
      <div>
        <Label className="block mb-1.5">模型名称</Label>
        <CustomTextarea value={model} onChange={onModel} rows={3} placeholder={'gpt-4o-mini\ndeepseek-chat'} />
        <p className="text-xs mt-1.5 leading-5" style={{ color: 'var(--t3)' }}>多个模型用逗号或回车分隔，按顺序逐个探测。</p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div className="flex items-center justify-between mb-2">
          <Label className="block">连接测试</Label>
          <Btn small variant="soft" onClick={onTestConnection} disabled={running || connRunning || !hasActiveChannel || probeSplitModels(model).length === 0}>
            {connRunning ? '测试中…' : '测试连接'}
          </Btn>
        </div>
        <div className="space-y-1.5">
          {(['chat', 'responses', 'anthropic'] as ProbeFormat[]).map(f => {
            const r = connResults[f]
            if (!r) return null
            const color = r.ok ? 'var(--ok)' : 'var(--err)'
            const bg = r.ok ? 'var(--okBg)' : 'var(--errBg)'
            return (
              <div key={f} data-conn={f} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                style={{ background: bg, color: 'var(--text)' }}>
                <span className="font-semibold flex-shrink-0" style={{ color }}>{PROBE_FORMAT_LABELS[f]}</span>
                <span className="ml-auto font-mono text-[11px] truncate" style={{ color, fontFamily: PROBE_MONO }}>
                  {r.ok ? `✓ ${r.ms} ms` : r.status != null
                    ? `✗ ${r.status}${r.err ? ` · ${r.err.length > 18 ? r.err.slice(0, 18) + '…' : r.err}` : ''}`
                    : `✗ ${r.err || '失败'}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <Label className="block mb-1.5">Token 稳定性配置</Label>
        <div className="flex gap-2">
          <CustomInput value={randomString} onChange={onRandomString} mono placeholder="FIXED-XXXX" />
          <Btn small variant="soft" onClick={onRegenRandom} title="重新生成随机字符串">↻</Btn>
        </div>
        <div className="mt-2.5">
          <Label className="block mb-1.5">重复请求次数</Label>
          <CustomInput value={tokenRuns} onChange={onTokenRuns} type="number" placeholder="3" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Label className="block mb-0">流式 usage</Label>
          <ProbeHelpTip text="默认关闭。打开后所有 Chat 流式（含「纯流式」和「SSE 流式」）带上 stream_options.include_usage=true。渠道拒绝该参数则该请求失败。Responses / Anthropic 不需要此参数。" />
        </div>
        <Toggle value={includeStreamUsage} onChange={onIncludeStreamUsage} label="Chat 流式注入 include_usage" />
      </div>

      {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
    </div>
  )
})

const ProbeChannelsPane = React.memo(function ProbeChannelsPane({
  chNotice, channels, activeChId, chForm, editingChId,
  onSetActive, onEdit, onCopy, onDelete, onSave, onChFormChange, onClearForm,
}: {
  chNotice: string; channels: ProbeChannel[]; activeChId: string | null
  chForm: ProbeChFormState; editingChId: string | null
  onSetActive: (id: string) => void; onEdit: (c: ProbeChannel) => void; onCopy: (c: ProbeChannel) => void; onDelete: (id: string) => void
  onSave: () => void; onChFormChange: React.Dispatch<React.SetStateAction<ProbeChFormState>>; onClearForm: () => void
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
            <CustomInput value={chForm.chatUrl} onChange={v => onChFormChange(f => ({ ...f, chatUrl: v }))} placeholder={`${PROBE_FORMAT_LABELS.chat} Base URL`} mono />
            <CustomInput value={chForm.responsesUrl} onChange={v => onChFormChange(f => ({ ...f, responsesUrl: v }))} placeholder={`${PROBE_FORMAT_LABELS.responses} Base URL`} mono />
            <CustomInput value={chForm.anthropicUrl} onChange={v => onChFormChange(f => ({ ...f, anthropicUrl: v }))} placeholder={`${PROBE_FORMAT_LABELS.anthropic} Base URL`} mono />
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

function ModelProbeTool() {
  const cfg0 = loadProbeCfg()
  const [model, setModel] = useState(cfg0.model ?? '')
  const [randomString, setRandomString] = useState(cfg0.randomString ?? probeMakeRandom())
  const [tokenRuns, setTokenRuns] = useState(cfg0.tokenRuns ?? '3')
  const [includeStreamUsage, setIncludeStreamUsage] = useState(!!cfg0.includeStreamUsage)
  const includeStreamUsageRef = useRef(includeStreamUsage)
  useEffect(() => { includeStreamUsageRef.current = includeStreamUsage }, [includeStreamUsage])

  // 渠道（探测目标）：baseUrl/apiKey/超时/三种协议 URL 覆写都收在渠道对象里，可保存多个、选一个当前使用
  const [channels, setChannels] = useState<ProbeChannel[]>(() => loadOrMigrateProbeChannels().channels)
  const [activeChId, setActiveChId] = useState<string | null>(() => loadOrMigrateProbeChannels().activeId)
  const [chForm, setChForm] = useState({ name: '', baseUrl: '', timeoutSec: '60', chatUrl: '', responsesUrl: '', anthropicUrl: '', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [chNotice, setChNotice] = useState('')
  const activeChannel = channels.find(c => c.id === activeChId) ?? null

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {}
    PROBE_TESTS.forEach(t => { all[t.id] = cfg0.selected?.[t.id] ?? (t.defaultSelected !== false) })
    for (const t of PROBE_BUILTIN_TESTS) {
      if (cfg0.selected?.[t.id] !== undefined) all[t.id] = !!cfg0.selected[t.id]
    }
    return all
  })
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])
  const parsedModels = useMemo(() => probeSplitModels(model), [model])
  const nativeTests = useMemo(() => probeUnionBuiltinCases(parsedModels).map(toNativeProbeTest), [parsedModels])
  const visibleTests = useMemo(() => [...PROBE_TESTS, ...nativeTests], [nativeTests])
  useEffect(() => {
    const visibleIds = new Set(nativeTests.map(t => t.id))
    setSelected(prev => {
      let changed = false
      const next = { ...prev }
      for (const t of PROBE_BUILTIN_TESTS) {
        if (!visibleIds.has(t.id)) continue
        if (next[t.id] === undefined) {
          next[t.id] = false
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [nativeTests])

  useDebouncedPersist(() => {
    saveProbeCfg({ model, randomString, tokenRuns, includeStreamUsage, selected })
  }, [model, randomString, tokenRuns, includeStreamUsage, selected])

  useEffect(() => { saveProbeChannels(channels) }, [channels])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (activeChId) kvSet(PROBE_ACTIVE_CH_KEY, activeChId)
      else kvRemove(PROBE_ACTIVE_CH_KEY)
    } catch { /* ignore */ }
  }, [activeChId])

  const chNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chNoticeFor = (m: string, ms: number) => {
    setChNotice(m)
    if (chNoticeTimer.current) clearTimeout(chNoticeTimer.current)
    chNoticeTimer.current = setTimeout(() => { chNoticeTimer.current = null; setChNotice('') }, ms)
  }
  useEffect(() => () => { if (chNoticeTimer.current) clearTimeout(chNoticeTimer.current) }, [])
  const chToast = (m: string) => chNoticeFor(m, 2200)

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
      const nc: ProbeChannel = { ...target, name, baseUrl: base, timeoutSec: timeoutSecVal, chatUrl: chForm.chatUrl.trim(), responsesUrl: chForm.responsesUrl.trim(), anthropicUrl: chForm.anthropicUrl.trim() }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(c => c.id === editingChId ? nc : c))
    } else {
      if (!apiKeyEnc) { chToast('请填写 apiKey'); return }
      const nc: ProbeChannel = {
        id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, baseUrl: base, timeoutSec: timeoutSecVal,
        chatUrl: chForm.chatUrl.trim(), responsesUrl: chForm.responsesUrl.trim(), anthropicUrl: chForm.anthropicUrl.trim(), apiKeyEnc, keyMask,
      }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm({ name: '', baseUrl: '', timeoutSec: '60', chatUrl: '', responsesUrl: '', anthropicUrl: '', apiKey: '' })
    setEditingChId(null)
    chToast('已保存')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chForm, editingChId, channels, activeChId])

  const editChannel = useCallback((c: ProbeChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, timeoutSec: c.timeoutSec, chatUrl: c.chatUrl, responsesUrl: c.responsesUrl, anthropicUrl: c.anthropicUrl, apiKey: '' })
    setEditingChId(c.id)
  }, [])

  const copyChannel = useCallback((c: ProbeChannel) => {
    const name = uniqueCopyName(c.name, channels.map(x => x.name))
    const nc: ProbeChannel = { ...c, id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name }
    setChannels([...channels, nc])
    chToast(`已复制为 ${name}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  const delChannel = useCallback((id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(prev => prev.filter(c => c.id !== id))
    setActiveChId(prev => (prev === id ? null : prev))
  }, [])

  const clearChForm = useCallback(() => {
    setChForm({ name: '', baseUrl: '', timeoutSec: '60', chatUrl: '', responsesUrl: '', anthropicUrl: '', apiKey: '' })
    setEditingChId(null)
  }, [])

  const [pane, setPane] = useState<'live' | 'logs' | 'report' | 'history' | 'channels'>('live')
  const [running, setRunning] = useState(false)
  const [retryingKey, setRetryingKey] = useState<string | null>(null)
  const retryingKeyRef = useRef<string | null>(null)
  const [retryNotice, setRetryNotice] = useState('')
  const [nameModal, setNameModal] = useState(false)
  const [testName, setTestName] = useState('')
  const [report, setReport] = useState<ProbeReport | null>(null)
  const [matrixReports, setMatrixReports] = useState<ProbeReport[] | null>(null)
  const [history, setHistory] = useState<ProbeReport[]>([])
  const [historyNote, setHistoryNote] = useState('')
  const reportRef = useRef<ProbeReport | null>(null)
  const matrixRef = useRef<ProbeReport[] | null>(null)
  reportRef.current = report
  matrixRef.current = matrixReports
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<ProbeLog[]>([])
  const [logFilter, setLogFilter] = useState('all')
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, { status: ProbeStatus | 'pending' | 'running'; detail: string }>>({})
  const [progress, setProgress] = useState<{ done: number; total: number; label: string }>({ done: 0, total: 0, label: '' })
  const [startErr, setStartErr] = useState('')
  const [connRunning, setConnRunning] = useState(false)
  const [connResults, setConnResults] = useState<Record<ProbeFormat, { ok: boolean; status: number | null; ms: number; err: string } | null>>({ chat: null, responses: null, anthropic: null })

  const logsRef = useRef<ProbeLog[]>([])
  const logsEpochRef = useRef(0)
  const stopRef = useRef(false)
  const formatBlockerRef = useRef<Partial<Record<ProbeFormat, string>>>({})
  const profileRef = useRef<ProbeProfileId>('unknown')
  const officialAnthropicRef = useRef(false)
  const anthropicMaxTokensRowRef = useRef<ProbeResult | null>(null)
  const activeAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await probeHistMigrateOnce()
      const list = await trimProbeHistory()
      if (!cancelled) setHistory(list)
    })()
    return () => { cancelled = true }
  }, [])

  const pushLog = (log: ProbeLog) => {
    logsRef.current.push(log)
    setLogs([...logsRef.current])
  }
  const setTestStatus = (key: string, status: ProbeStatus | 'pending' | 'running', detail = '') => {
    setStatuses(prev => ({ ...prev, [key]: { status, detail } }))
  }

  const probeLogPrefixRef = useRef('')
  const probeProgressTagRef = useRef('')
  const probeNewLog = (resultKey: string, label: string, format: ProbeFormat, url?: string): ProbeLog => ({
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    resultKey, label: probeLogPrefixRef.current ? `${probeLogPrefixRef.current} · ${label}` : label, format,
    url: url ?? (cfgRef.current?.urlOf[format] ?? ''),
    method: 'POST', status: null, statusText: '', duration: 0, time: new Date().toISOString(),
    requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: null,
    sse: [], chunks: [], usage: probeEmptyUsage(), requestId: null,
  })
  const cfgRef = useRef<ProbeCfg | null>(null)

  const probeDelay = async (ms: number): Promise<void> => {
    if (stopRef.current) throw new DOMException(PROBE_STOP_DETAIL, 'AbortError')
    const controller = new AbortController()
    activeAbortRef.current = controller
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), ms)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException(PROBE_STOP_DETAIL, 'AbortError'))
        }
        if (controller.signal.aborted) { onAbort(); return }
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
    } finally {
      if (activeAbortRef.current === controller) activeAbortRef.current = null
    }
  }

  const probeCatchResult = (e: any, format: ProbeFormat | undefined, log: ProbeLog, failDetail?: string): ProbeResult => {
    if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: probeReproOf(log) })
    return probeResult('failed', failDetail ?? (e?.message || String(e)), { format, repro: probeReproOf(log) })
  }

  const probeRequest = async (log: ProbeLog, format: ProbeFormat, body: any, opts: { stream?: boolean; retryOn429?: boolean } = {}): Promise<{ ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }> => {
    const cfg = cfgRef.current
    if (!cfg) throw new Error('测试配置缺失')
    const headers = probeProtocolOf(format).headers(cfg.apiKey)
    headers.Accept = 'application/json, text/event-stream'
    let payload = body
    if (opts.stream && format === 'chat' && includeStreamUsageRef.current) {
      const prev = (body && typeof body === 'object' && body.stream_options && typeof body.stream_options === 'object')
        ? body.stream_options as Record<string, unknown>
        : {}
      payload = { ...body, stream_options: { ...prev, include_usage: true } }
    }
    const retryOn429 = opts.retryOn429 !== false
    const maxAttempts = retryOn429 ? 1 + PROBE_429_RETRY_MAX : 1

    const runOnce = async (): Promise<{ ok: boolean; status: number; data: any; raw: string | null }> => {
      const controller = new AbortController()
      activeAbortRef.current = controller
      const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), cfg.timeoutMs)
      const started = performance.now()
      log.requestHeaders = probeMaskHeaders(headers)
      log.requestBody = payload
      try {
        if (stopRef.current) throw new DOMException(PROBE_STOP_DETAIL, 'AbortError')
        const res = await fetch(log.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal })
        log.status = res.status
        log.statusText = res.statusText
        log.responseHeaders = probeHeadersObject(res.headers)
        log.requestId = probeRequestIdFromRecord(log.responseHeaders) || probeExtractRequestId(res.headers)
        const rawBody = opts.stream && res.body ? await probeReadStream(res, log) : await res.text()
        let data: any
        try { data = rawBody ? JSON.parse(rawBody) : null } catch { data = rawBody }
        log.responseBody = data
        log.duration = Math.round(performance.now() - started)
        log.usage = opts.stream ? probeUsageFromSse(format, log.sse) : probeUsageOf(format, data)
        return { ok: res.ok, status: res.status, data, raw: rawBody }
      } catch (err: any) {
        if (!log.status) {
          log.status = 0
          log.statusText = 'Network Error'
        }
        log.duration = Math.round(performance.now() - started)
        log.responseBody = {
          error: stopRef.current ? PROBE_STOP_DETAIL
            : (err?.name === 'TimeoutError' || err?.name === 'AbortError' ? '请求超时或已中止' : String(err?.message || err)),
        }
        throw err
      } finally {
        clearTimeout(timer)
        if (activeAbortRef.current === controller) activeAbortRef.current = null
      }
    }

    try {
      let last: { ok: boolean; status: number; data: any; raw: string | null } | null = null
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) probeResetLogResponse(log)
        last = await runOnce()
        if (last.status === 429 && attempt < maxAttempts && !stopRef.current) {
          setProgress(prev => ({ ...prev, label: `${probeProgressTagRef.current}${probeProgressTagRef.current ? ' · ' : ''}HTTP 429，6s 后重试（第 ${attempt}/${PROBE_429_RETRY_MAX} 次）` }))
          await probeDelay(PROBE_429_RETRY_WAIT_MS)
          continue
        }
        pushLog(log)
        return { ...last, log }
      }
      pushLog(log)
      return { ...last!, log }
    } catch (err) {
      pushLog(log)
      throw err
    }
  }

  const probeReadStream = async (res: Response, log: ProbeLog): Promise<string> => {
    if (!res.body) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let raw = '', buffer = '', index = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      log.chunks.push(chunk)
      raw += chunk
      buffer += chunk
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        if (block.trim()) log.sse.push(probeParseSseBlock(block, ++index))
      }
    }
    if (buffer.trim()) log.sse.push(probeParseSseBlock(buffer, ++index))
    return raw
  }

  const runProbeBasic = async (t: ProbeTestDef): Promise<ProbeResult> => {
    const format = t.format!
    const log = probeNewLog(t.id, t.name, format)
    const scoreExpected = !!selectedRef.current['expect-reject']
    const gateOf = (ok: boolean, status: number | null, message: string) =>
      scoreProtocolGate(
        basicProtocolGate(profileRef.current, format, ok, status, message, officialAnthropicRef.current),
        scoreExpected,
      )
    try {
      const r = await probeRequest(log, format, probeBaseBody(cfgRef.current!, format))
      if (r.ok) {
        if (gateOf(true, r.status, '') === 'abnormal') {
          const missing = probeUsageComplete(r.log.usage) ? '' : probeUsageFailDetail(r.log.usage)
          return probeResult('abnormal', `异常：Codex 产品线官方不提供 Chat Completions，但渠道返回了成功。${missing}`, {
            format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
          })
        }
        return probeResult('passed', '基础请求返回成功', { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      const err = probeExtractError(r.data)
      if (format === 'anthropic' && anthropicBaseBlocked(err)) {
        if (anthropicCapAction(profileRef.current, err) === 'retry') {
          setProbeAnthropicCapField('max_completion_tokens')
          const retryLog = probeNewLog(t.id, `${t.name}（max_completion_tokens）`, format)
          try {
            const retry = await probeRequest(retryLog, format, probeBaseBody(cfgRef.current!, format))
            if (retry.ok) {
              const row = anthropicMaxTokensConclusion(profileRef.current, err, scoreExpected)
              if (row) {
                anthropicMaxTokensRowRef.current = probeResult(row.status, row.detail, {
                  format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
                })
              }
              const note = row?.status === 'expected'
                ? '基础请求返回成功。max_tokens 被拒符合预期，已改用 max_completion_tokens。'
                : '基础请求返回成功。上游拒绝 max_tokens，已改用 max_completion_tokens。'
              return probeResult('passed', note, { format, duration: retry.log.duration, usage: retry.log.usage, repro: probeReproOf(retry.log) })
            }
            setProbeAnthropicCapField('max_tokens')
            const retryErr = probeExtractError(retry.data)
            formatBlockerRef.current.anthropic = retryErr
            return probeResult('failed', `Anthropic 未转译：${retryErr}`, {
              format, duration: retry.log.duration, usage: retry.log.usage, repro: probeReproOf(retry.log),
            })
          } catch (e: any) {
            setProbeAnthropicCapField('max_tokens')
            formatBlockerRef.current.anthropic = err
            return probeCatchResult(e, format, retryLog)
          }
        }
        formatBlockerRef.current.anthropic = err
        return probeResult('failed', `Anthropic 未转译：${err}`, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      const blocked = gateOf(false, r.status, err)
      if (blocked === 'expected' || blocked === 'unsupported') {
        formatBlockerRef.current[format] = err
        if (blocked === 'unsupported') {
          return probeResult('unsupported', err, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        }
        const protocol = format === 'chat' ? 'Chat Completions' : 'Responses'
        const why = profileRef.current === 'codex'
          ? '符合预期：Codex 产品线不提供 Chat Completions。'
          : `符合预期：Claude 官方不提供 ${protocol}。`
        return probeResult('expected', `${why}${err}`, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      return probeResult('failed', err, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
    } catch (e: any) {
      return probeCatchResult(e, format, log)
    }
  }

  const mergeAcceptedSemantic = (
    accepted: ProbeResult,
    acceptedLabel: string,
    semantic: ProbeResult,
    check: ProbeCheck,
  ): ProbeResult => {
    const checks: ProbeCheck[] = [
      probeCheck('accepted', true, acceptedLabel),
      check,
    ]
    if (semantic.status === 'skipped') return { ...semantic, checks }
    if (semantic.status === 'unsupported') {
      return { ...semantic, detail: `${acceptedLabel}；语义请求不支持：${semantic.detail}`, checks: [...checks, ...(semantic.checks || [])] }
    }
    if (semantic.status === 'failed' || !check.passed) {
      return {
        ...semantic,
        status: 'failed',
        detail: `${acceptedLabel}，但${semantic.detail}`,
        checks,
      }
    }
    return {
      ...semantic,
      status: 'passed',
      detail: `${acceptedLabel}；${check.detail}`,
      checks,
    }
  }

  const runProbeSemantic = async (
    id: string,
    format: ProbeFormat,
    accepted: ProbeResult,
    acceptedLabel: string,
    extra?: { chatMaxKeys?: string[] },
  ): Promise<ProbeResult> => {
    if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: accepted.repro })
    const cfg = cfgRef.current!
    const proto = probeProtocolOf(format)
    const log = probeNewLog(probeKey(id, format), `${probeParamLabel(id)} 语义（${PROBE_FORMAT_LABELS[format]}）`, format)
    setProgress(prev => ({ ...prev, label: `${probeParamLabel(id)} 语义（${PROBE_FORMAT_LABELS[format]}）` }))
    const chatKeys = format === 'chat' && extra?.chatMaxKeys?.length ? extra.chatMaxKeys : undefined
    const body: Record<string, any> = proto.baseBody(cfg.model, id === 'max_tokens' ? PROBE_TRUNCATION_PROMPT : id === 'tool_calling' ? PROBE_TOOL_FORCE_PROMPT : PROBE_SCHEMA_PROMPT)
    if (id === 'max_tokens') proto.applyMaxTokens(body, PROBE_TRUNCATION_CAP, chatKeys)
    else if (id === 'tool_calling') proto.applyTools(body, [PROBE_WEATHER_TOOL], { name: 'get_weather' })
    else {
      proto.applyStructuredOutput(body)
      proto.applyMaxTokens(body, PROBE_SCHEMA_CAP, chatKeys)
    }
    const failSemantic = (r: { data: any; log: ProbeLog }, err: string) => {
      const brief = err.replace(/\s+/g, ' ').slice(0, 80)
      const check = probeCheck(id === 'max_tokens' ? 'truncation' : id === 'tool_calling' ? 'tool_call' : 'schema', false, brief)
      return mergeAcceptedSemantic(accepted, acceptedLabel, probeResult('failed', err, {
        format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
      }), check)
    }
    // 只有 HTTP 400 的这句是额度耗尽。每次语义尝试都先认它，避免被当成字段冲突再重试；其它状态仍是失败。
    const passOutputLimit = (row: { ok: boolean; status: number; data: any; log: ProbeLog }) => {
      if (id !== 'max_tokens' || row.ok || row.status !== 400 || !probeOutputLimitReached(probeExtractError(row.data))) return null
      const check = probeCheck('truncation', true, PROBE_OUTPUT_LIMIT_DETAIL)
      return mergeAcceptedSemantic(accepted, acceptedLabel, probeResult('passed', check.detail, {
        format, duration: row.log.duration, usage: row.log.usage, repro: probeReproOf(row.log),
      }), check)
    }
    const failOutputLimitStatus = (row: { ok: boolean; status: number; data: any; log: ProbeLog }) => {
      if (id !== 'max_tokens' || row.ok || row.status === 400 || !probeOutputLimitReached(probeExtractError(row.data))) return null
      return failSemantic(row, probeExtractError(row.data))
    }
    try {
      let r = await probeRequest(log, format, body)
      const limited = passOutputLimit(r) || failOutputLimitStatus(r)
      if (limited) return limited
      if (!r.ok && id === 'max_tokens' && format === 'chat' && (chatKeys?.length || 0) > 1) {
        const blame = probeChatMaxTokenBlame(probeExtractError(r.data))
        const retryKeys = blame === 'conflict'
          ? chatKeys!
          : blame && chatKeys!.includes(blame) ? chatKeys!.filter(k => k !== blame) : []
        for (const key of (blame === 'conflict' ? chatKeys! : retryKeys)) {
          if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: accepted.repro })
          const retryBody = proto.baseBody(cfg.model, PROBE_TRUNCATION_PROMPT)
          proto.applyMaxTokens(retryBody, PROBE_TRUNCATION_CAP, [key])
          const retryLog = probeNewLog(probeKey(id, format), `${probeParamLabel(id)} 语义（${PROBE_FORMAT_LABELS[format]}）`, format)
          r = await probeRequest(retryLog, format, retryBody)
          const retried = passOutputLimit(r) || failOutputLimitStatus(r)
          if (retried) return retried
          if (r.ok) break
        }
      }
      let toolChoiceFallback = false
      if (!r.ok && id === 'tool_calling' && probeToolChoiceForcedBlocked(probeExtractError(r.data))) {
        if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: accepted.repro })
        const retryBody = proto.baseBody(cfg.model, PROBE_TOOL_FORCE_PROMPT)
        proto.applyTools(retryBody, [PROBE_WEATHER_TOOL], 'auto')
        const retryLog = probeNewLog(probeKey(id, format), `${probeParamLabel(id)} 语义 auto 降级（${PROBE_FORMAT_LABELS[format]}）`, format)
        r = await probeRequest(retryLog, format, retryBody)
        toolChoiceFallback = true
      }
      const limitedAfterRetry = passOutputLimit(r) || failOutputLimitStatus(r)
      if (limitedAfterRetry) return limitedAfterRetry
      if (!r.ok) return failSemantic(r, probeExtractError(r.data))
      const check = id === 'max_tokens' ? oracleTruncation(proto.stopOf(r.data))
        : id === 'tool_calling' ? oracleToolNamed(proto.toolCallsOf(r.data), 'get_weather')
        : oracleSchemaOk(proto.textOf(r.data))
      const noted = toolChoiceFallback
        ? { ...check, detail: `thinking 模式不支持强制 tool_choice，已用 auto 核验；${check.detail}` }
        : check
      return mergeAcceptedSemantic(accepted, acceptedLabel, probeResult(noted.passed ? 'passed' : 'failed', noted.detail, {
        format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
      }), noted)
    } catch (e: any) {
      return probeCatchResult(e, format, log)
    }
  }

  const untestedBecauseBlocked = (format: ProbeFormat): ProbeResult | null => {
    const message = formatBlockerRef.current[format]
    if (!message) return null
    return probeResult('untested', `未测：同一协议被基础错误挡住。${message}`, { format })
  }

  const runProbeParamSuite = async (format: ProbeFormat, paramIds: string[]): Promise<Record<string, ProbeResult>> => {
    const outcomes: Record<string, ProbeResult> = {}
    const blockedMessage = formatBlockerRef.current[format]
    if (blockedMessage) {
      for (const id of paramIds.filter(id => probeAppliesToFormat(id, format))) {
        outcomes[probeKey(id, format)] = probeResult('untested', `未测：同一协议被基础错误挡住。${blockedMessage}`, { format })
      }
      return outcomes
    }
    const pending = new Set(paramIds.filter(id => probeAppliesToFormat(id, format)))
    if (format === 'anthropic' && anthropicMaxTokensRowRef.current && pending.has('max_tokens')) {
      outcomes[probeKey('max_tokens', format)] = anthropicMaxTokensRowRef.current
      pending.delete('max_tokens')
    }
    const chatMaxKeys = new Set<string>(format === 'chat' && pending.has('max_tokens') ? CHAT_MAX_TOKEN_KEYS : [])
    const rejectedMax: string[] = []
    let soloAlias: string | null = null
    const outputLimitSentence = (data: any) => probeOutputLimitReached(probeExtractError(data))
    const outputLimitAccepted = (row: { ok: boolean; status: number; data: any }) =>
      !row.ok && row.status === 400 && outputLimitSentence(row.data)
    const finishPassed = async (ids: string[], accepted: ProbeResult, label: string) => {
      const chatKeys = [...chatMaxKeys]
      for (const id of ids) {
        if (PROBE_SEMANTIC_IDS.has(id)) {
          outcomes[probeKey(id, format)] = await runProbeSemantic(id, format, accepted, label, { chatMaxKeys: chatKeys })
        } else {
          outcomes[probeKey(id, format)] = { ...accepted, checks: [probeCheck('accepted', true, label)] }
        }
      }
    }
    const markMaxUnsupported = (log: ProbeLog, err: string) => {
      outcomes[probeKey('max_tokens', format)] = probeResult('unsupported', err, {
        format, duration: log.duration, usage: log.usage, repro: probeReproOf(log),
        checks: [probeCheck('accepted', false, probeChatMaxAcceptLabel(chatMaxKeys, rejectedMax))],
      })
      pending.delete('max_tokens')
      chatMaxKeys.clear()
    }
    while (pending.size) {
      const body = probeComboBody(
        cfgRef.current!, format, pending,
        format === 'chat' && pending.has('max_tokens') && chatMaxKeys.size ? [...chatMaxKeys] : undefined,
      )
      const combinedKey = [...pending].join('+') + '@' + format
      const log = probeNewLog(combinedKey, `${[...pending].map(probeParamLabel).join(' + ')}（${PROBE_FORMAT_LABELS[format]}）`, format)
      let r: { ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }
      try {
        r = await probeRequest(log, format, body)
      } catch (e: any) {
        for (const id of pending) outcomes[probeKey(id, format)] = probeCatchResult(e, format, log)
        break
      }
      if (r.ok || outputLimitAccepted(r)) {
        if (soloAlias && format === 'chat' && pending.has('max_tokens')) {
          const proto = probeProtocolOf(format)
          const soloBody = proto.baseBody(cfgRef.current!.model, 'Reply with exactly: OK')
          proto.applyMaxTokens(soloBody, PROBE_DEFAULT_CAP, [soloAlias])
          const soloLog = probeNewLog(probeKey('max_tokens', format), `Token 上限 ${soloAlias}（${PROBE_FORMAT_LABELS[format]}）`, format)
          try {
            const solo = await probeRequest(soloLog, format, soloBody)
            if (solo.ok || outputLimitAccepted(solo)) chatMaxKeys.add(soloAlias)
            else if (!outputLimitSentence(solo.data)) rejectedMax.push(soloAlias)
          } catch {
            rejectedMax.push(soloAlias)
          }
          soloAlias = null
        }
        const maxNote = format === 'chat' && pending.has('max_tokens') ? probeChatMaxAcceptLabel(chatMaxKeys, rejectedMax) : ''
        const label = maxNote ? `组合请求通过；${maxNote}` : '组合请求通过'
        const accepted = probeResult('passed', label, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        await finishPassed([...pending], accepted, label)
        break
      }
      const errText = probeExtractError(r.data).toLowerCase()
      const limitSentence = outputLimitSentence(r.data)
      if (!limitSentence && format === 'chat' && pending.has('max_tokens') && chatMaxKeys.size) {
        const blame = probeChatMaxTokenBlame(errText)
        if (blame === 'conflict' && chatMaxKeys.size > 1) {
          chatMaxKeys.delete('max_tokens')
          soloAlias = 'max_tokens'
          continue
        }
        if ((blame === 'max_tokens' || blame === 'max_completion_tokens') && chatMaxKeys.has(blame)) {
          chatMaxKeys.delete(blame)
          rejectedMax.push(blame)
          if (chatMaxKeys.size) continue
          markMaxUnsupported(r.log, probeExtractError(r.data))
          continue
        }
      }
      const sole = limitSentence ? null : probeSoleParamMatch(pending, errText, format)
      if (sole) {
        outcomes[probeKey(sole, format)] = probeResult('unsupported', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        pending.delete(sole)
        continue
      }
      const named = [...pending].filter(id => errText.includes(id) || (id === 'tool_calling' && /tool|function/.test(errText)))
      const effortSplit = errText.includes('reasoning_effort') && /tool|function/.test(errText)
      const reasoningLike = profileRef.current === 'reasoning' || profileRef.current === 'codex'
      const scoreExpected = !!selectedRef.current['expect-reject']
      const splitNote = named.length > 1
        ? (effortSplit
          ? (scoreExpected && reasoningLike ? '组合互斥符合预期，已拆开重测。' : '组合里工具与 reasoning_effort 互相点名，已拆开重测。')
          : '一条错误同时点名多个参数，已拆开重测。')
        : ''
      for (const id of [...pending]) {
        const singleLog = probeNewLog(probeKey(id, format), `${probeParamLabel(id)}（${PROBE_FORMAT_LABELS[format]}）`, format)
        const singleBody = probeComboBody(cfgRef.current!, format, [id], id === 'max_tokens' && format === 'chat' ? [...chatMaxKeys] : undefined)
        try {
          const one = await probeRequest(singleLog, format, singleBody)
          if (one.ok || (id === 'max_tokens' && outputLimitAccepted(one))) {
            const maxNote = format === 'chat' && id === 'max_tokens' ? probeChatMaxAcceptLabel(chatMaxKeys, rejectedMax) : ''
            const label = [maxNote ? `独立降级请求通过；${maxNote}` : '独立降级请求通过', splitNote].filter(Boolean).join(' ')
            const accepted = probeResult('passed', label, { format, duration: one.log.duration, usage: one.log.usage, repro: probeReproOf(one.log) })
            await finishPassed([id], accepted, label)
          } else if (id === 'max_tokens' && outputLimitSentence(one.data)) {
            outcomes[probeKey(id, format)] = probeResult('failed', probeExtractError(one.data), { format, duration: one.log.duration, usage: one.log.usage, repro: probeReproOf(one.log) })
          } else if (format === 'chat' && id === 'max_tokens' && chatMaxKeys.size > 1) {
            const proto = probeProtocolOf(format)
            let okAlias: string | null = null
            let stoppedOnLimit = false
            const limitKeys: string[] = []
            let limitRow: { log: ProbeLog } | null = null
            let last = one
            for (const key of [...chatMaxKeys]) {
              const aliasBody = proto.baseBody(cfgRef.current!.model, 'Reply with exactly: OK')
              proto.applyMaxTokens(aliasBody, PROBE_DEFAULT_CAP, [key])
              const aliasLog = probeNewLog(probeKey('max_tokens', format), `Token 上限 ${key}（${PROBE_FORMAT_LABELS[format]}）`, format)
              last = await probeRequest(aliasLog, format, aliasBody)
              if (outputLimitAccepted(last)) {
                limitKeys.push(key)
                limitRow = last
                continue
              }
              if (last.ok) {
                okAlias = key
                for (const other of [...chatMaxKeys]) {
                  if (other !== key && !limitKeys.includes(other)) rejectedMax.push(other)
                }
                chatMaxKeys.clear()
                chatMaxKeys.add(key)
                for (const kept of limitKeys) chatMaxKeys.add(kept)
                break
              }
              if (outputLimitSentence(last.data)) {
                outcomes[probeKey(id, format)] = probeResult('failed', probeExtractError(last.data), { format, duration: last.log.duration, usage: last.log.usage, repro: probeReproOf(last.log) })
                stoppedOnLimit = true
                break
              }
              rejectedMax.push(key)
            }
            if (!stoppedOnLimit) {
              const source = okAlias ? last : limitRow
              if (source) {
                if (!okAlias) {
                  chatMaxKeys.clear()
                  for (const key of limitKeys) chatMaxKeys.add(key)
                }
                const label = `独立降级请求通过；${probeChatMaxAcceptLabel(chatMaxKeys, rejectedMax)}`
                const accepted = probeResult('passed', label, { format, duration: source.log.duration, usage: source.log.usage, repro: probeReproOf(source.log) })
                await finishPassed([id], accepted, label)
              } else {
                markMaxUnsupported(last.log, probeExtractError(last.data))
              }
            }
          } else {
            const raw = probeExtractError(one.data)
            const s: ProbeStatus = /unsupported|unknown|invalid|not supported|not implemented/i.test(raw) ? 'unsupported' : 'failed'
            outcomes[probeKey(id, format)] = probeResult(s, splitNote ? `${raw} ${splitNote}` : raw, { format, duration: one.log.duration, usage: one.log.usage, repro: probeReproOf(one.log) })
          }
        } catch (e: any) {
          outcomes[probeKey(id, format)] = probeCatchResult(e, format, singleLog)
        }
        pending.delete(id)
      }
    }
    return outcomes
  }

  const runProbeStream = async (t: ProbeTestDef, format: ProbeFormat): Promise<ProbeResult> => {
    const blocked = untestedBecauseBlocked(format)
    if (blocked) return blocked
    const cfg = cfgRef.current!
    const stream = t.id !== 'stream-false'
    let body: Record<string, any>
    if (t.id === 'stream-pure') {
      body = { model: cfg.model, messages: [{ role: 'user', content: PROBE_PURE_STREAM_PROMPT }], stream: true }
    } else {
      const proto = probeProtocolOf(format)
      body = { ...probeBaseBody(cfg, format), stream }
      if (stream) proto.applyMaxTokens(body, PROBE_STREAM_MAX_TOKENS)
    }
    const log = probeNewLog(t.id, t.name, format)
    try {
      const r = await probeRequest(log, format, body, { stream })
      if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      if (stream) {
        const valid = r.log.sse.length > 0 && r.log.sse.some(e => e.data)
        const complete = probeProtocolOf(format).streamFinished(r.raw || '', r.log.sse)
        return probeResult(valid ? 'passed' : 'failed', valid ? `收到 ${r.log.sse.length} 个 SSE 事件${complete ? '，包含结束标记' : '，未识别结束标记'}` : '未解析到有效 SSE data 字段', { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      return probeResult('passed', '完整 JSON 响应正常', { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
    } catch (e: any) {
      return probeCatchResult(e, format, log)
    }
  }

  const runProbeToken = async (format: ProbeFormat, count: number, fixed: string): Promise<ProbeResult> => {
    const blocked = untestedBecauseBlocked(format)
    if (blocked) return blocked
    const key = probeKey('token-stability', format)
    const values: number[] = []
    const durations: number[] = []
    let lastLog: ProbeLog | null = null
    for (let i = 0; i < count; i++) {
      const log = probeNewLog(key, `Token 计算稳定性（${PROBE_FORMAT_LABELS[format]}）`, format)
      lastLog = log
      try {
        const r = await probeRequest(log, format, probeBaseBody(cfgRef.current!, format, `Token stability probe. Fixed string: ${fixed}`))
        if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, tokenValues: values, repro: probeReproOf(r.log) })
        if (!probeUsageComplete(r.log.usage)) {
          return probeResult('failed', probeUsageFailDetail(r.log.usage), { format, duration: r.log.duration, usage: r.log.usage, tokenValues: values, repro: probeReproOf(r.log) })
        }
        values.push(r.log.usage.input as number)
        durations.push(r.log.duration)
      } catch (e: any) {
        if (stopRef.current) return probeCatchResult(e, format, log)
        return probeResult('failed', e?.message || String(e), { format, tokenValues: values, repro: probeReproOf(log) })
      }
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    return probeResult(min === max ? 'passed' : 'failed',
      min === max ? `${count} 次输入 Token 均为 ${min}` : `Token 计数波动 ${min} - ${max}`,
      { format, duration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null, usage: lastLog?.usage, tokenValues: values, repro: lastLog ? probeReproOf(lastLog) : null })
  }

  const runProbeCache = async (format: ProbeFormat): Promise<ProbeResult> => {
    const blocked = untestedBecauseBlocked(format)
    if (blocked) return blocked
    const t = probeTestById('cache-' + format)!
    const prefix = ('ModelProbe fixed cache prefix. The following context is intentionally repeated for cache verification. ').repeat(180)
    const body: Record<string, any> = probeBaseBody(cfgRef.current!, format, prefix + '\nReply OK.')
    if (format === 'anthropic') {
      body.messages = [{ role: 'user', content: [{ type: 'text', text: prefix, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Reply OK.' }] }]
    } else if (nameSuggestsGpt(cfgRef.current!.model)) {
      body.prompt_cache_key = 'modelprobe-cache'
    }
    const reads: number[] = []
    const durations: number[] = []
    let lastLog: ProbeLog | null = null
    let maxWrite = 0
    for (let i = 0; i < 3; i++) {
      const log = probeNewLog(t.id, t.name, format)
      lastLog = log
      let r: { ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }
      try {
        r = await probeRequest(log, format, body)
      } catch (e: any) {
        return probeCatchResult(e, format, log, `第 ${i + 1} 次请求失败：${e?.message || String(e)}`)
      }
      if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      const read = r.log.usage.cacheRead || 0
      const write = r.log.usage.cacheWrite || 0
      if (write > maxWrite) maxWrite = write
      reads.push(read)
      durations.push(r.log.duration)
      if (read > 0) {
        return probeResult('passed', `第 ${i + 1} 次请求命中缓存，读取 Token: ${read}`, { format, duration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length), usage: r.log.usage, cache: { hits: 1, total: i + 1, reads }, repro: probeReproOf(r.log) })
      }
    }
    const cacheSummary = { format, duration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null, usage: lastLog?.usage, cache: { hits: 0, total: 3, reads }, repro: lastLog ? probeReproOf(lastLog) : null }
    if (maxWrite > 0) {
      return probeResult('expected', `符合预期：已报告缓存写入 ${maxWrite} Token，3 次内未读到命中`, cacheSummary)
    }
    return probeResult('unsupported', '连续 3 次请求均未报告缓存命中，已停止重试', cacheSummary)
  }

  const runProbeExtra = async (subtype: string, format: ProbeFormat): Promise<ProbeResult> => {
    if (subtype !== 'error') {
      const blocked = untestedBecauseBlocked(format)
      if (blocked) return blocked
    }
    if (subtype === 'top-p-range') {
      const body = probeTopPRangeBody(format, cfgRef.current!.model)
      const log = probeNewLog('top_p_range', 'top_p 越界', format)
      try {
        const r = await probeRequest(log, format, body)
        const scored = scoreTopPRange(r.status, 'http')
        return probeResult(scored.status, scored.detail, {
          format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
        })
      } catch (e: any) {
        if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: probeReproOf(log) })
        const timedOut = e?.name === 'TimeoutError'
        const scored = scoreTopPRange(log.status, timedOut ? 'timeout' : 'network')
        return probeResult(scored.status, scored.detail, { format, duration: log.duration, repro: probeReproOf(log) })
      }
    }
    if (subtype === 'error') {
      const log = probeNewLog('error-shape', '错误码规范性', format)
      const body = { ...probeBaseBody(cfgRef.current!, format), model: 'modelprobe-intentionally-invalid-model' }
      try {
        const r = await probeRequest(log, format, body)
        if (r.status === 429) {
          return probeResult('failed', '全程限流（HTTP 429），未测到无效模型的错误形态', {
            format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log),
          })
        }
        const structured = typeof r.data === 'object' && r.data !== null && (r.data.error || r.data.message)
        return probeResult(!r.ok && r.status >= 400 && structured ? 'passed' : 'failed',
          !r.ok ? `返回 HTTP ${r.status}${structured ? ' 且包含结构化错误' : '，但错误结构不明确'}` : '无效模型意外返回成功',
          { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      } catch (e: any) {
        return probeCatchResult(e, format, log)
      }
    }
    if (subtype === 'concurrency') {
      const logs: ProbeLog[] = []
      const rs = await Promise.allSettled([1, 2, 3].map(async i => {
        const log = probeNewLog('concurrency', '并发请求稳定性', format)
        logs.push(log)
        return probeRequest(log, format, probeBaseBody(cfgRef.current!, format, `Reply only ${i}`), { retryOn429: false })
      }))
      const fulfilled = rs.filter(x => x.status === 'fulfilled').map(x => (x as PromiseFulfilledResult<{ ok: boolean; log: ProbeLog }>).value)
      const ok = fulfilled.filter(v => v.ok)
      const ds = fulfilled.map(v => v.log.duration)
      const usageParts = ok.map(v => probeIoText(v.log.usage))
      const missing = ok.find(v => !probeUsageComplete(v.log.usage))
      const detail = `${ok.length}/3 个并发请求成功${usageParts.length ? ` · ${usageParts.join(' / ')}` : ''}`
      if (ok.length === 3 && missing) {
        return probeResult('failed', `${detail}；${probeUsageFailDetail(missing.log.usage)}`, {
          format, duration: ds.length ? Math.max(...ds) : null, usage: missing.log.usage, repro: logs.length ? probeReproOf(logs[0]) : null,
        })
      }
      return probeResult(ok.length === 3 ? 'passed' : 'failed', detail, {
        format, duration: ds.length ? Math.max(...ds) : null, usage: ok[0]?.log.usage, repro: logs.length ? probeReproOf(logs[0]) : null,
      })
    }
    if (subtype === 'image') {
      const proto = probeProtocolOf(format)
      const body = proto.baseBody(cfgRef.current!.model, PROBE_IMAGE_PROMPT)
      proto.applyImage(body, PROBE_RED_PNG_B64, PROBE_IMAGE_PROMPT)
      const log = probeNewLog('image-input', '图片输入', format)
      try {
        const r = await probeRequest(log, format, body)
        if (!r.ok) {
          const err = probeExtractError(r.data)
          const s: ProbeStatus = oracleUnsupportedVision(err) ? 'unsupported' : 'failed'
          return probeResult(s, err, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        }
        const check = oracleDominantRed(proto.textOf(r.data))
        return probeResult(check.passed ? 'passed' : 'failed', check.detail, {
          format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log), checks: [check],
        })
      } catch (e: any) {
        return probeCatchResult(e, format, log)
      }
    }
    if (subtype === 'system') {
      const proto = probeProtocolOf(format)
      const body = proto.baseBody(cfgRef.current!.model, PROBE_SYSTEM_USER)
      proto.applySystem(body, PROBE_SYSTEM_INSTRUCTION, PROBE_SYSTEM_USER)
      const log = probeNewLog('system-prompt', 'System 提示词', format)
      try {
        const r = await probeRequest(log, format, body)
        if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        const check = oracleSystemOk(proto.textOf(r.data))
        return probeResult(check.passed ? 'passed' : 'failed', check.detail, {
          format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log), checks: [check],
        })
      } catch (e: any) {
        return probeCatchResult(e, format, log)
      }
    }
    const proto = probeProtocolOf(format)
    const turn1 = proto.baseBody(cfgRef.current!.model, PROBE_MULTITURN_TURN1)
    const log1 = probeNewLog('multi-turn', '多轮对话', format)
    let lastLog = log1
    try {
      const r1 = await probeRequest(log1, format, turn1)
      if (!r1.ok) return probeResult('failed', probeExtractError(r1.data), { format, duration: r1.log.duration, usage: r1.log.usage, repro: probeReproOf(r1.log) })
      if (format === 'responses' && !stopRef.current) {
        const resourceId = probeResponsesResourceId(r1.data)
        if (resourceId) {
          const stickyBody = probeProtocolOf('responses').baseBody(cfgRef.current!.model, 'Reply with exactly: OK')
          stickyBody.previous_response_id = resourceId
          const stickyLog = probeNewLog('origin-sticky@responses', 'Responses 上游粘性', 'responses')
          try {
            await probeRequest(stickyLog, 'responses', stickyBody)
          } catch { /* 只收集上游是否跨资源，不改变多轮结论 */ }
        }
      }
      if (!probeUsageComplete(r1.log.usage)) {
        return probeResult('failed', probeUsageFailDetail(r1.log.usage), {
          format, duration: r1.log.duration, usage: r1.log.usage, repro: probeReproOf(r1.log),
        })
      }
      const turn2 = JSON.parse(JSON.stringify(turn1))
      if (!proto.appendAssistantFromResponse(turn2, r1.data)) {
        return probeResult('failed', '第一跳未返回可回传的 assistant 消息', {
          format, duration: r1.log.duration, usage: r1.log.usage, repro: probeReproOf(r1.log),
          checks: [probeCheck('instruction', false, '第一跳未返回 assistant 消息')],
        })
      }
      proto.appendUser(turn2, PROBE_MULTITURN_TURN2)
      if (stopRef.current) return probeResult('skipped', PROBE_STOP_DETAIL, { format, repro: probeReproOf(r1.log) })
      const log2 = probeNewLog('multi-turn', '多轮对话', format)
      lastLog = log2
      const r2 = await probeRequest(log2, format, turn2)
      if (!r2.ok) return probeResult('failed', probeExtractError(r2.data), { format, duration: r2.log.duration, usage: r2.log.usage, repro: probeReproOf(r2.log) })
      const check = oracleCodeword(proto.textOf(r2.data))
      return probeResult(check.passed ? 'passed' : 'failed', check.detail, {
        format, duration: r2.log.duration, usage: r2.log.usage, repro: probeReproOf(r2.log), checks: [check],
      })
    } catch (e: any) {
      return probeCatchResult(e, format, lastLog)
    }
  }

  const runProbeNative = async (t: ProbeTestDef): Promise<ProbeResult> => {
    const spec = builtinCaseById(t.id)
    const format = t.format
    if (!spec || !format) return probeResult('failed', '未找到内置工具用例定义')
    const blocked = untestedBecauseBlocked(format)
    if (blocked) return blocked
    const proto = probeProtocolOf(format)
    const body = proto.baseBody(cfgRef.current!.model, spec.prompt)
    applyBuiltinTool(body, spec)
    const log = probeNewLog(probeKey(t.id, format), `${t.name}（${PROBE_FORMAT_LABELS[format]}）`, format)
    try {
      const r = await probeRequest(log, format, body)
      if (!r.ok) {
        const err = probeExtractError(r.data)
        const s: ProbeStatus = oracleUnsupportedNativeTool(err) ? 'unsupported' : 'failed'
        return probeResult(s, err, { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      const check = oracleNativeToolEvidence(r.data, spec)
      if (!check.passed) {
        if (!probeUsageComplete(r.log.usage)) {
          return probeResult('failed', `${check.detail}；${probeUsageFailDetail(r.log.usage)}`, {
            format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log), checks: [check],
          })
        }
        return probeResult('abnormal', `异常：渠道没有执行 ${spec.tool}，但请求成功了。${check.detail}`, {
          format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log), checks: [check],
        })
      }
      return probeResult('passed', check.detail, {
        format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log), checks: [check],
      })
    } catch (e: any) {
      return probeCatchResult(e, format, log)
    }
  }

  // memo 子组件需要稳定的回调引用：latest-ref 包装，避免给复杂闭包逐一维护依赖数组
  const testConnectionRef = useRef<() => void>(() => {})
  const onTestConnection = useCallback(() => testConnectionRef.current(), [])
  const regenRandom = useCallback(() => setRandomString(probeMakeRandom()), [])

  const testConnection = async () => {
    const ch = activeChannel
    const firstModel = probeSplitModels(model)[0]
    if (!ch || !firstModel) {
      setStartErr('测试连接需要先在「渠道管理」选择一个渠道，并填写模型名称。')
      return
    }
    const cfg = await probeBuildCfgFromChannel(ch, firstModel, 15000)
    if (!cfg.apiKey.trim()) {
      setStartErr('渠道 API Key 解密失败，请重新编辑渠道并保存。')
      return
    }
    const formats = (['chat', 'responses', 'anthropic'] as ProbeFormat[]).filter(f => selectedRef.current[`${f}-basic`])
    if (formats.length === 0) {
      setStartErr('测试连接需要先勾选至少一个协议基础测试（Chat Completions / Responses / Anthropic Messages）。')
      return
    }
    setStartErr('')
    setConnRunning(true)
    setConnResults({ chat: null, responses: null, anthropic: null })
    await Promise.all(formats.map(async f => {
      const started = performance.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), cfg.timeoutMs)
      const headers = probeProtocolOf(f).headers(cfg.apiKey)
      headers.Accept = 'application/json'
      let res: { ok: boolean; status: number | null; ms: number; err: string }
      try {
        const r = await fetch(cfg.urlOf[f], {
          method: 'POST', headers, body: JSON.stringify(probeBaseBody(cfg, f, 'Reply OK.')), signal: controller.signal,
        })
        const ms = Math.round(performance.now() - started)
        let err = ''
        if (!r.ok) {
          try {
            const j = await r.json()
            err = j?.error?.message ?? j?.message ?? ''
          } catch { /* ignore */ }
        }
        res = { ok: r.ok, status: r.status, ms, err }
      } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        res = {
          ok: false, status: null, ms: Math.round(performance.now() - started),
          err: timedOut ? '请求超时' : (e instanceof TypeError ? '网络或 CORS 被拦截' : String(e?.message || e)),
        }
      } finally {
        clearTimeout(timer)
      }
      setConnResults(prev => ({ ...prev, [f]: res }))
    }))
    setConnRunning(false)
  }
  testConnectionRef.current = testConnection

  const runProbe = async (name: string) => {
    if (retryingKeyRef.current) return
    const ch = activeChannel
    const models = probeSplitModels(model)
    const errs: string[] = []
    if (!ch) errs.push('请先在「渠道管理」添加并选择一个渠道。')
    if (!models.length) errs.push('模型名称不能为空。')
    else {
      const selectedAcross = new Map<string, ProbeTestDef>()
      for (const modelName of models) {
        for (const t of [...PROBE_TESTS, ...matchBuiltinToolCases(modelName).map(toNativeProbeTest)]) {
          if (selectedRef.current[t.id] && t.kind !== 'score') selectedAcross.set(t.id, t)
        }
      }
      if (!selectedAcross.size) errs.push('请至少勾选一个测试项。')
      const needFormats = [...selectedAcross.values()].some(t => probeMultiFormatKinds.includes(t.kind))
      const activeFormats = (['chat', 'responses', 'anthropic'] as ProbeFormat[]).filter(f => selectedRef.current[`${f}-basic`])
      if (needFormats && activeFormats.length === 0) errs.push('参数 / 流式 / Token 稳定性 / 补充场景 / 原生工具测试需要至少勾选一个基础格式测试（Chat / Responses / Anthropic）。')
    }
    const activeFormats = (['chat', 'responses', 'anthropic'] as ProbeFormat[]).filter(f => selectedRef.current[`${f}-basic`])
    const keyProbe = ch && models.length ? await probeBuildCfgFromChannel(ch, models[0]) : null
    if (ch && models.length && !keyProbe?.apiKey.trim()) errs.push('渠道 API Key 解密失败，请重新编辑渠道并保存。')
    if (errs.length) { setStartErr(errs.join('\n')); return }
    if (!ch) return
    setStartErr('')
    setRetryNotice('')

    stopRef.current = false
    probeLogPrefixRef.current = ''
    probeProgressTagRef.current = ''
    logsEpochRef.current += 1
    logsRef.current = []
    setLogs([])
    setOpenLogs({})
    setReport(null)
    setHistoryNote('')
    setRunning(true)
    setPane('live')
    const newIds: string[] = []
    try {
      for (let index = 0; index < models.length; index++) {
        if (stopRef.current) break
        const modelName = models[index]
        const cfg = await probeBuildCfgFromChannel(ch, modelName)
        probeLogPrefixRef.current = models.length > 1 ? modelName : ''
        probeProgressTagRef.current = `第 ${index + 1}/${models.length} 个 · ${modelName}`
        newIds.push(await runOneModel(cfg, probeNameForModel(name, modelName, models.length)))
      }
    } finally {
      probeLogPrefixRef.current = ''
      probeProgressTagRef.current = ''
      setProbeAnthropicCapField('max_tokens')
      setRunning(false)
      const list = await trimProbeHistory()
      setHistory(list)
      const alive = new Set(list.map(item => item.id))
      const dropped = newIds.filter(id => !alive.has(id))
      setPicked(new Set(newIds.filter(id => alive.has(id))))
      setHistoryNote(dropped.length
        ? `本批 ${newIds.length} 个模型里，较早的 ${dropped.length} 份超出历史上限 ${PROBE_HISTORY_MAX} 条，已不保留。`
        : '')
      if (newIds.length) setPane('history')
      setProgress(prev => ({ ...prev, label: stopRef.current ? '已停止' : '测试完成' }))
    }

    async function runOneModel(cfg: ProbeCfg, reportName: string): Promise<string> {
    cfgRef.current = cfg
    formatBlockerRef.current = {}
    profileRef.current = profileFromName(cfg.model)
    officialAnthropicRef.current = (() => {
      try { return new URL(cfg.baseUrl).hostname.toLowerCase() === 'api.anthropic.com' } catch { return false }
    })()
    anthropicMaxTokensRowRef.current = null
    setProbeAnthropicCapField('max_tokens')
    setStatuses({})

    const catalog = [...PROBE_TESTS, ...matchBuiltinToolCases(cfg.model).map(toNativeProbeTest)]
    const selectedTests = catalog.filter(t => selectedRef.current[t.id] && t.kind !== 'score')
    const paramIds = selectedTests.filter(t => t.kind === 'parameter').map(t => t.id)
    const resultsObj: Record<string, ProbeResult> = {}
    const commit = (key: string, out: ProbeResult) => {
      const gated = probeApplyUsageGate(out)
      resultsObj[key] = gated
      setTestStatus(key, gated.status, gated.detail)
    }
    catalog.forEach(t => {
      if (!selectedRef.current[t.id]) {
        probeSkipKeysOf(t, activeFormats).forEach(k => {
          resultsObj[k] = probeResult('skipped', '用户未勾选', { format: probeFormatOfKey(k) ?? undefined })
          setTestStatus(k, 'skipped', '用户未勾选')
        })
      }
    })
    const total = selectedTests.reduce((acc, t) => acc + probeSelectedCountOf(t, activeFormats), 0)
    let completed = 0
    let curLabel = '准备测试'
    const updateProgress = (label?: string) => {
      if (label) curLabel = label
      const tag = probeProgressTagRef.current
      setProgress({ done: completed, total, label: tag ? `${tag} · ${curLabel}` : curLabel })
    }

    const startedAt = new Date().toISOString()
    const startMs = Date.now()
    const logFrom = logsRef.current.length
    const logEpoch = logsEpochRef.current
    let parametersDone = false
    try {
      for (const t of catalog) {
        if (stopRef.current) break
        if (!selectedRef.current[t.id]) continue
        if (t.kind === 'score') continue
        if (t.kind === 'parameter') {
          if (parametersDone) continue
          parametersDone = true
          for (const f of activeFormats) {
            if (stopRef.current) break
            const ids = paramIds.filter(id => probeAppliesToFormat(id, f))
            if (!ids.length) continue
            const keys = ids.map(id => probeKey(id, f))
            keys.forEach(k => setTestStatus(k, 'running'))
            updateProgress(`参数组合与智能降级（${PROBE_FORMAT_LABELS[f]}）`)
            const outcomes = await runProbeParamSuite(f, ids)
            for (const k of Object.keys(outcomes)) {
              commit(k, outcomes[k])
              completed++
            }
            updateProgress()
          }
          continue
        }
        if (t.kind === 'token') {
          for (const f of activeFormats) {
            if (stopRef.current) break
            const key = probeKey(t.id, f)
            setTestStatus(key, 'running')
            updateProgress(`Token 计算稳定性（${PROBE_FORMAT_LABELS[f]}）`)
            const count = Math.max(2, Math.min(10, Number(tokenRuns) || 3))
            const out = await runProbeToken(f, count, randomString.trim())
            commit(key, out)
            completed++
            updateProgress()
          }
          continue
        }
        if (t.kind === 'stream' || t.kind === 'extra' || t.kind === 'native') {
          if (t.format && !activeFormats.includes(t.format)) {
            const key = probeKey(t.id, t.format)
            const out = probeResult('skipped', `对应协议格式未启用（未勾选 ${PROBE_FORMAT_LABELS[t.format]} 基础测试）`, { format: t.format })
            resultsObj[key] = out
            setTestStatus(key, out.status, out.detail)
            completed++
            updateProgress()
            continue
          }
          for (const f of probeBoundFormats(t, activeFormats)) {
            if (stopRef.current) break
            const key = probeKey(t.id, f)
            setTestStatus(key, 'running')
            updateProgress(`${t.name}（${PROBE_FORMAT_LABELS[f]}）`)
            const out = t.kind === 'stream' ? await runProbeStream(t, f)
              : t.kind === 'native' ? await runProbeNative(t)
              : await runProbeExtra(t.subtype!, f)
            commit(key, out)
            completed++
            updateProgress()
          }
          continue
        }
        const key = t.id
        if (t.kind === 'cache' && !activeFormats.includes(t.format!)) {
          const out = probeResult('skipped', `对应协议格式未启用（未勾选 ${PROBE_FORMAT_LABELS[t.format!]} 基础测试）`, { format: t.format })
          resultsObj[key] = out
          setTestStatus(key, out.status, out.detail)
          completed++
          updateProgress(`${t.name}：${PROBE_STATUS_LABELS[out.status]}`)
          continue
        }
        setTestStatus(key, 'running')
        updateProgress(`正在执行：${t.name}`)
        let out: ProbeResult
        if (t.kind === 'basic') out = await runProbeBasic(t)
        else out = await runProbeCache(t.format!)
        commit(key, out)
        completed++
        updateProgress(`${t.name}：${PROBE_STATUS_LABELS[out.status]}`)
      }
      catalog.forEach(t => {
        if (!selectedRef.current[t.id]) return
        probeExpectedKeysOf(t, activeFormats).forEach(k => {
          if (!resultsObj[k]) {
            resultsObj[k] = probeResult('skipped', PROBE_STOP_DETAIL, { format: probeFormatOfKey(k) ?? undefined })
            setTestStatus(k, 'skipped', PROBE_STOP_DETAIL)
          }
        })
      })
    } finally {
      setProbeAnthropicCapField('max_tokens')
      const modelLogs = probeLogsSince(logsRef.current, logFrom, logsEpochRef.current, logEpoch)
      const signals = signalsFromProbeLogs({
        requestModel: cfg.model,
        baseUrl: cfg.baseUrl,
        logs: probeOriginInput(modelLogs),
      })
      const family = decideFamily(signals)
      const origin = decideOrigin(signals)
      if (selectedRef.current['expect-reject']) {
        for (const [key, result] of Object.entries(resultsObj)) {
          const next = reclassifyExpected(key, result, family, origin)
          if (!next) continue
          resultsObj[key] = { ...result, status: next.status, detail: next.detail }
          setTestStatus(key, next.status, next.detail)
        }
      }
      const verdict: ProbeVerdict = {
        family: { label: family.label, reasons: family.reasons },
        access: { label: origin.access.label, reasons: origin.access.reasons },
        upstream: { label: origin.upstream.label, reasons: origin.upstream.reasons },
      }
      const rep: ProbeReport = probeSanitizeReport({
        id: 'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: reportName, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
        target: {
          baseUrl: cfg.baseUrl, model: cfg.model, channelName: ch?.name,
          overrides: { chat: ch?.chatUrl.trim() || null, responses: ch?.responsesUrl.trim() || null, anthropic: ch?.anthropicUrl.trim() || null },
        },
        results: resultsObj, summary: probeEmptySummary(), logs: modelLogs, verdict,
      })
      setMatrixReports(null)
      setReport(rep)
      setHistory(await saveProbeHistory({ ...rep, logs: [] }))
      setProgress({ done: total, total, label: `${probeProgressTagRef.current} · ${stopRef.current ? '已停止' : '完成'}` })
      return rep.id
    }
    }
  }

  const retryProbeCell = async (key: string) => {
    if (running || retryingKeyRef.current) return
    const source = reportRef.current
    if (!source?.results[key]) {
      setRetryNotice('这份报告里没有这一格，不能重试。')
      return
    }
    const matched = probeMatchRetryChannel(source.target, channels, activeChId)
    if ('error' in matched) {
      setRetryNotice(matched.error)
      setStartErr(matched.error)
      return
    }
    const at = key.lastIndexOf('@')
    const testId = at > 0 ? key.slice(0, at) : key
    const keyFormat = at > 0 ? key.slice(at + 1) : ''
    const test = probeTestById(testId)
    const needsFormat = !!test && probeMultiFormatKinds.includes(test.kind)
    const cellFormat = (needsFormat ? keyFormat : (test?.format || keyFormat)) as ProbeFormat
    if (!test || test.kind === 'score' || (needsFormat && !(cellFormat in PROBE_FORMAT_LABELS))) {
      setRetryNotice('这一格没有对应的用例，不能重试。')
      return
    }
    retryingKeyRef.current = key
    setRetryingKey(key)
    setRetryNotice('')
    setStartErr('')
    try {
      const apiKey = await decryptLlmApiKey(matched.channel.apiKeyEnc)
      if (!apiKey.trim()) {
        const message = `渠道「${matched.channel.name}」的 API Key 解密失败，请重新编辑并保存。`
        setRetryNotice(message)
        setStartErr(message)
        return
      }
      stopRef.current = false
      probeLogPrefixRef.current = ''
      formatBlockerRef.current = {}
      anthropicMaxTokensRowRef.current = null
      setProbeAnthropicCapField('max_tokens')
      profileRef.current = profileFromName(source.target.model)
      officialAnthropicRef.current = (() => {
        try { return new URL(source.target.baseUrl).hostname.toLowerCase() === 'api.anthropic.com' } catch { return false }
      })()
      const timeoutMs = (Number(matched.channel.timeoutSec) || 60) * 1000
      const base = source.target.baseUrl
      const overrides = source.target.overrides || { chat: null, responses: null, anthropic: null }
      cfgRef.current = {
        baseUrl: base,
        apiKey,
        model: source.target.model,
        timeoutMs,
        urlOf: {
          chat: probeJoinUrl((overrides.chat || '').trim() || base, PROBE_ENDPOINTS.chat),
          responses: probeJoinUrl((overrides.responses || '').trim() || base, PROBE_ENDPOINTS.responses),
          anthropic: probeJoinUrl((overrides.anthropic || '').trim() || base, PROBE_ENDPOINTS.anthropic),
        },
      }
      const beforeIds = new Set(logsRef.current.map(item => item.id))
      const started = Date.now()
      let out: ProbeResult | null = null
      if (test.kind === 'basic') out = await runProbeBasic(test)
      else if (test.kind === 'parameter') out = (await runProbeParamSuite(cellFormat, [test.id]))[key] ?? null
      else if (test.kind === 'token') {
        const count = Math.max(2, Math.min(10, Number(tokenRuns) || 3))
        out = await runProbeToken(cellFormat, count, randomString.trim())
      } else if (test.kind === 'stream') out = await runProbeStream(test, cellFormat)
      else if (test.kind === 'extra') out = await runProbeExtra(test.subtype || '', cellFormat)
      else if (test.kind === 'native') out = await runProbeNative(test)
      else if (test.kind === 'cache' && test.format) out = await runProbeCache(test.format)
      if (!out || out.status === 'skipped') return
      let gated = probeApplyUsageGate(out)
      const hadLogs = (source.logs || []).length > 0
      const fresh = logsRef.current.filter(item => !beforeIds.has(item.id))
      const replaced = probeReplaceCellLogs(logsRef.current, source.logs || [], key, fresh)
      logsRef.current = replaced.session
      setLogs([...logsRef.current])
      const signals = signalsFromProbeLogs({
        requestModel: source.target.model,
        baseUrl: source.target.baseUrl,
        logs: hadLogs ? probeOriginInput(replaced.reportLogs) : [],
      })
      const family = decideFamily(signals)
      if (selectedRef.current['expect-reject']) {
        const origin = hadLogs
          ? decideOrigin(signals)
          : { access: { id: 'uncertain', label: '不确定', reasons: [] } }
        const rewritten = reclassifyExpected(key, gated, family, origin)
        if (rewritten) gated = { ...gated, status: rewritten.status, detail: rewritten.detail }
      }
      const verdict = hadLogs
        ? (() => {
            const origin = decideOrigin(signals)
            return {
              family: { label: family.label, reasons: family.reasons },
              access: { label: origin.access.label, reasons: origin.access.reasons },
              upstream: { label: origin.upstream.label, reasons: origin.upstream.reasons },
            }
          })()
        : source.verdict
      const next = probeSanitizeReport({
        ...source,
        completedAt: new Date().toISOString(),
        durationMs: source.durationMs + (Date.now() - started),
        results: { ...source.results, [key]: gated },
        logs: replaced.reportLogs,
        verdict,
      })
      if (reportRef.current?.id === source.id) setReport(next)
      setHistory(await saveProbeHistory({ ...next, logs: [] }))
    } catch (err: any) {
      const message = err?.message || '重试没有完成。'
      setRetryNotice(message)
      setStartErr(message)
    } finally {
      setProbeAnthropicCapField('max_tokens')
      retryingKeyRef.current = null
      setRetryingKey(null)
      stopRef.current = false
    }
  }

  const persistRefreshedOrigins = async (reports: ProbeReport[]): Promise<ProbeReport[]> => {
    const changed: ProbeReport[] = []
    const next = reports.map(report => {
      const rescored = probeRescoreOutputLimitResults(report.results)
      const results = rescored ?? report.results
      const fresh = probeRefreshedOrigin({
        requestModel: report.target.model,
        baseUrl: report.target.baseUrl,
        results,
        verdict: report.verdict,
      })
      if (!fresh && !rescored) return report
      const summary = rescored ? probeEmptySummary() : report.summary
      if (rescored) {
        for (const [key, result] of Object.entries(rescored)) {
          if (!probeResultVisible(key, result)) continue
          if (summary[result.status] != null) summary[result.status]++
        }
      }
      const updated: ProbeReport = {
        ...report,
        ...(rescored ? { results: rescored, summary } : {}),
        ...(fresh ? {
          verdict: {
            family: report.verdict?.family ?? { label: '不确定', reasons: [] },
            access: fresh.access,
            upstream: fresh.upstream,
          },
        } : {}),
      }
      changed.push(updated)
      return updated
    })
    if (changed.length) {
      try {
        await historyDbPutMany('modelprobe', changed)
        setHistory(await loadProbeHistory())
      } catch {
        // 落盘失败仍把改判后的报告交给页面，避免「查看」打不开。
      }
    }
    return next
  }
  const viewHistoryReport = async (rep: ProbeReport) => {
    const [stored] = await persistRefreshedOrigins([rep])
    setMatrixReports(null)
    setReport(probeSanitizeReport(stored))
    setPane('report')
  }
  const viewPicked = async () => {
    const rows = history.filter(item => picked.has(item.id))
    if (rows.length === 1) await viewHistoryReport(rows[0])
    else if (rows.length > 1) {
      const next = await persistRefreshedOrigins(rows)
      setReport(null)
      setMatrixReports(next.map(probeSanitizeReport))
      setPane('report')
    }
  }
  // baseUrl/超时/协议 URL 覆写已归入渠道，不再是可直接写回的扁平字段：优先匹配一个 baseUrl 相同的
  // 已存渠道并切过去；匹配不到就把历史配置带入「渠道管理」的新增表单，跳转过去待用户补充 apiKey 后保存。
  const reuseHistoryConfig = (rep: ProbeReport) => {
    setModel(rep.target.model)
    const matched = channels.find(c => c.baseUrl === rep.target.baseUrl)
    if (matched) {
      setActiveChId(matched.id)
      setPane('live')
      chNoticeFor(`已回填模型「${rep.target.model}」，并切换到渠道「${matched.name}」。`, 4000)
    } else {
      setChForm({
        name: '', baseUrl: rep.target.baseUrl, timeoutSec: '60',
        chatUrl: rep.target.overrides.chat ?? '', responsesUrl: rep.target.overrides.responses ?? '', anthropicUrl: rep.target.overrides.anthropic ?? '',
        apiKey: '',
      })
      setEditingChId(null)
      setPane('channels')
      chNoticeFor('已从历史报告带入 Base URL 到「渠道管理」新增表单，请补充 API Key 后保存。', 4000)
    }
  }

  useEffect(() => {
    if (!nameModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNameModal(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nameModal])

  const exportJson = () => {
    if (!report) return
    const r = probeSanitizeReport(report)
    probeDownload(JSON.stringify(r, null, 2), 'application/json', `${probeSafeName(r.name)}.json`)
  }
  const exportHtml = () => {
    if (!report) return
    downloadProbeReportHtml(probeSanitizeReport(report), probeCatalog(), PROBE_FORMAT_LABELS)
  }
  const syncOpenReports = (removed: ReadonlySet<string>) => {
    const next = probeViewAfterDelete(reportRef.current, matrixRef.current, removed)
    setReport(next.report ? probeSanitizeReport(next.report) : null)
    setMatrixReports(next.matrix && next.matrix.length > 0 ? next.matrix : null)
  }
  const deletePicked = () => {
    const ids = history.filter(item => picked.has(item.id)).map(item => item.id)
    if (!ids.length) return
    const removed = new Set(ids)
    historyDbDeleteMany('modelprobe', ids).then(() => loadProbeHistory()).then(list => {
      setHistory(list)
      setPicked(new Set())
      syncOpenReports(removed)
    }).catch(() => {})
  }
  const togglePicked = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const exportMd = () => {
    if (!report) return
    const r = probeSanitizeReport(report)
    let md = `# ${r.name}\n\n`
    md += `- 开始时间: ${r.startedAt}\n- 完成时间: ${r.completedAt}\n- 总耗时: ${(r.durationMs / 1000).toFixed(1)} s\n- Base URL: ${r.target.baseUrl}\n`
    if (r.target.overrides.chat) md += `- Chat Base URL: ${r.target.overrides.chat}\n`
    if (r.target.overrides.responses) md += `- Responses Base URL: ${r.target.overrides.responses}\n`
    if (r.target.overrides.anthropic) md += `- Anthropic Base URL: ${r.target.overrides.anthropic}\n`
    md += `- 模型: ${r.target.model}\n`
    md += `- 通过: ${r.summary.passed} · 失败: ${r.summary.failed} · 异常: ${r.summary.abnormal || 0} · 不支持: ${r.summary.unsupported} · 符合预期: ${r.summary.expected} · 未测: ${r.summary.untested} · 跳过: ${r.summary.skipped}\n`
    if (r.verdict?.upstream) {
      const layer = r.verdict.upstream
      md += `- 渠道判断: ${layer.label}${layer.reasons.length ? `（${layer.reasons.join('；')}）` : ''}\n`
    }
    md += '\n'
    for (const t of probeCatalog()) {
      const keys = probeResultKeysOf(t, r.results)
      if (!keys.length) continue
      md += `## ${t.name}\n\n`
      md += `> ${t.explain}\n\n`
      for (const key of keys) {
        const x = r.results[key]
        const fmtLabel = probeFormatOfKey(key) ? `（${PROBE_FORMAT_LABELS[probeFormatOfKey(key)!]}）` : ''
        md += `### ${t.name}${fmtLabel} — ${PROBE_STATUS_LABELS[x.status]}\n\n`
        md += `- 结论: ${stripSplitRetestNote(x.detail).split('\n').join(' ')}\n`
        if (x.checks?.length) md += `- 检查: ${x.checks.map(c => `${c.passed ? '✓' : '✗'} ${c.detail}`).join('；')}\n`
        if (x.duration != null) md += `- 耗时: ${x.duration} ms\n`
        md += `- 用量: 输入 ${x.usage?.input ?? '—'} · 输出 ${x.usage?.output ?? '—'} · 缓存读 ${x.usage?.cacheRead ?? '—'} · 缓存写 ${x.usage?.cacheWrite ?? '—'}\n`
        if (x.cache) md += `- 缓存: 命中 ${x.cache.hits}/${x.cache.total} 次 · 读取值 ${x.cache.reads.join(', ')}\n`
        if (x.tokenValues) md += `- 每次输入 Token: ${x.tokenValues.join(', ')}\n`
        if (x.repro) {
          md += `\n复现步骤：\n\n\`\`\`\nPOST ${x.repro.url}\n`
          const requestId = probeShownRequestId(x.repro)
          if (requestId) md += `Request ID: ${requestId}\n`
          md += `HTTP: ${x.repro.status ?? '—'}\n`
          md += `\`\`\`\n\n请求头（密钥已脱敏）：\n\n\`\`\`json\n${probeJsonPretty(x.repro.headers)}\n\`\`\`\n\n请求体：\n\n\`\`\`json\n${probeJsonPretty(x.repro.body)}\n\`\`\`\n\n`
          if (x.repro.responseBody !== undefined) {
            md += `响应体：\n\n\`\`\`json\n${typeof x.repro.responseBody === 'string' ? x.repro.responseBody : probeJsonPretty(x.repro.responseBody)}\n\`\`\`\n\n`
          }
        }
      }
    }
    probeDownload(md, 'text/markdown', `${probeSafeName(r.name)}.md`)
  }

  const statusOf = (t: ProbeTestDef): { status: ProbeStatus | 'pending' | 'running'; detail: string } => {
    if (probeMultiFormatKinds.includes(t.kind)) {
      const keys = Object.keys(statuses).filter(k => k.startsWith(t.id + '@') && probeResultVisible(k)).sort()
      if (!keys.length) return { status: 'pending', detail: '' }
      const sts = keys.map(k => statuses[k])
      const fmtText = keys.map(k => {
        const f = k.split('@')[1]
        const s = statuses[k].status
        const mark = probeFormatMark(s)
        return `${f}${mark}`
      }).join('  ')
      const agg: ProbeStatus = probeAggregateStatus(sts.filter(x => x.status !== 'running' && x.status !== 'pending').map(x => ({ status: x.status as ProbeStatus })))
      if (sts.some(x => x.status === 'running')) return { status: 'running', detail: fmtText }
      if (sts.some(x => x.status === 'pending')) return { status: 'pending', detail: fmtText }
      return { status: agg, detail: fmtText }
    }
    return statuses[t.id] ?? { status: 'pending', detail: '' }
  }

  const renderLogRow = (log: ProbeLog) => {
    const open = !!openLogs[log.id]
    const ok = log.status != null && log.status >= 200 && log.status < 300
    const fmt = (v: number | null) => (v == null ? '—' : String(v))
    return (
      <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setOpenLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
          onPointerEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--s1)' }}
          onPointerLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{log.label}</span>
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px] flex-shrink-0" style={{ background: ok ? 'var(--okBg)' : 'var(--errBg)', color: ok ? 'var(--ok)' : 'var(--err)', fontFamily: PROBE_MONO }}>{log.status ?? 'ERR'}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>{log.method} {log.url}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ProbeUsageChip usage={log.usage} />
            {log.requestId && <ProbeCopyId value={log.requestId} />}
            <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--t2)', fontFamily: PROBE_MONO }}>{log.duration} ms</span>
            <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{new Date(log.time).toLocaleTimeString()}</span>
          </div>
        </div>
        {open && (
          <div className="px-4 pb-5 lg:px-8" style={{ background: 'var(--s1)' }}>
            <div className="grid gap-4 pt-4 xl:grid-cols-2">
              <ProbeCodeBlock title="请求头（密钥已脱敏）" children={probeJsonPretty(log.requestHeaders)} />
              <ProbeCodeBlock title="请求体" children={probeJsonPretty(log.requestBody)} />
              <ProbeCodeBlock title="响应头" children={probeJsonPretty(log.responseHeaders)} />
              <ProbeCodeBlock title="响应体" children={typeof log.responseBody === 'string' ? log.responseBody : probeJsonPretty(log.responseBody)} />
            </div>
            {log.sse.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                  SSE 事件 <span className="font-normal" style={{ color: 'var(--t3)' }}>{log.sse.length} 条事件 · {log.chunks.length} 个网络数据块</span>
                </div>
                <div className="space-y-1.5">
                  {log.sse.map(ev => (
                    <details key={ev.index} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <summary className="cursor-pointer px-3 py-2 font-mono text-xs list-none" style={{ color: 'var(--text)', fontFamily: PROBE_MONO }}>
                        <span style={{ color: 'var(--t3)' }}>#{ev.index}</span> {ev.event}
                      </summary>
                      <pre className="overflow-auto max-h-48 p-3 font-mono text-[11px] leading-5" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)', fontFamily: PROBE_MONO }}>
                        {ev.json ? <code dangerouslySetInnerHTML={{ __html: highlightJson(probeJsonPretty(ev.json)) }} /> : ev.data}
                      </pre>
                    </details>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold" style={{ color: 'var(--accent)' }}>查看拼接后的原始流</summary>
                  <pre className="mt-2 overflow-auto max-h-80 rounded-xl p-3 font-mono text-[11px] leading-5" style={{ background: 'var(--code)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: PROBE_MONO }}>{probeEscapeHtml(log.chunks.join(''))}</pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.resultKey === logFilter || l.resultKey.startsWith(logFilter + '@'))
  const busy = running || retryingKey !== null
  const matrixOpen = pane === 'report' && !!matrixReports && matrixReports.length > 1

  const groups = [...new Set(visibleTests.map(t => t.group))]
  const uiActiveFormats = useMemo(() => (['chat', 'responses', 'anthropic'] as ProbeFormat[]).filter(f => selected[`${f}-basic`]), [selected])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>模型探测</SectionTitle>
        <div className="ml-auto flex gap-2">
          {busy ? (
            <Btn variant="danger" onClick={() => { stopRef.current = true; activeAbortRef.current?.abort() }}>⏹ 停止</Btn>
          ) : (
            <Btn variant="primary" onClick={() => { setTestName(probeNowName()); setNameModal(true) }} disabled={!activeChannel || probeSplitModels(model).length === 0}>▶ 开始测试</Btn>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 flex-col overflow-hidden lg:flex-row">
        {/* 左侧配置栏 */}
        <ProbeConfigPane
          channels={channels} activeChId={activeChId} onActiveChId={setActiveChId}
          model={model} onModel={setModel}
          randomString={randomString} onRandomString={setRandomString} onRegenRandom={regenRandom}
          tokenRuns={tokenRuns} onTokenRuns={setTokenRuns}
          includeStreamUsage={includeStreamUsage} onIncludeStreamUsage={setIncludeStreamUsage}
          running={busy} connRunning={connRunning} connResults={connResults}
          startErr={startErr} onTestConnection={onTestConnection}
        />

        {/* 右侧结果区 */}
        <div className="flex-1 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="probe-tabs glass flex items-center px-4 py-3 flex-shrink-0 min-w-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane} onChange={v => setPane(v as 'live' | 'logs' | 'report' | 'history' | 'channels')} options={[
              { value: 'live', label: '实时进度' },
              { value: 'logs', label: `请求日志 (${logs.length})` },
              { value: 'report', label: '测试报告' },
              { value: 'history', label: `历史 (${history.length})` },
              { value: 'channels', label: `渠道管理 (${channels.length})` },
            ]} />
          </div>

          <div className={matrixOpen ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1 overflow-y-auto'}>
            {pane === 'live' && (
              <div className="flex flex-col">
                <div className="flex flex-col gap-2 px-6 pt-4 pb-3 flex-shrink-0 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 lg:flex lg:items-start lg:gap-3">
                    <h3 className="text-sm font-bold shrink-0" style={{ color: 'var(--text)' }}>测试用例</h3>
                    <p className="text-xs mt-1 leading-5 lg:mt-0.5" style={{ color: 'var(--t3)' }}>参数、流式、缓存与补充场景只对已勾选的基础格式执行；「纯流式」仅 Chat；「预期拒绝」「图片输入」与「原生工具调用」默认不勾选。原生工具可能单独计费，没执行却返回成功时记为异常</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    <button onClick={() => { setSelected(prev => ({ ...prev, ...Object.fromEntries(visibleTests.map(t => [t.id, true])) })) }} disabled={busy} className="cursor-pointer border-0 outline-none font-semibold" style={{ background: 'transparent', color: 'var(--accent)', fontFamily: 'inherit' }}>全选</button>
                    <span style={{ color: 'var(--borderHard)' }}>|</span>
                    <button onClick={() => { setSelected(prev => ({ ...prev, ...Object.fromEntries(visibleTests.map(t => [t.id, false])) })) }} disabled={busy} className="cursor-pointer border-0 outline-none font-semibold" style={{ background: 'transparent', color: 'var(--t2)', fontFamily: 'inherit' }}>全不选</button>
                  </div>
                </div>

                {progress.total > 0 && (
                  <div className="px-6 pb-4 flex-shrink-0">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>{progress.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: 'var(--t2)' }}>{progress.done} / {progress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: progress.total ? (progress.done / progress.total * 100) + '%' : 0 }} />
                    </div>
                  </div>
                )}

                {groups.map(group => (
                  <div key={group}>
                    <div className="px-6 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--s1)', color: 'var(--t3)', letterSpacing: '0.08em' }}>{group}</div>
                    {group === '协议基础' ? (
                      <div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-3">
                          {visibleTests.filter(t => t.group === group).map(t => (
                            <ProbeFormatCard
                              key={t.id}
                              t={t}
                              checked={!!selected[t.id]}
                              disabled={busy}
                              status={statusOf(t)}
                              onChange={() => setSelected(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                            />
                          ))}
                        </div>
                        {!busy && uiActiveFormats.length === 0 && (
                          <p className="px-6 pb-3 text-xs" style={{ color: 'var(--warn)' }}>至少勾选一个协议基础测试，才能运行测试或测试连接。</p>
                        )}
                      </div>
                    ) : (
                      visibleTests.filter(t => t.group === group).map(t => {
                      const st = statusOf(t)
                      const color = probeStatusColor(st.status)
                      const formatDisabled = !!t.format && t.kind !== 'basic' && !uiActiveFormats.includes(t.format)
                      const desc = formatDisabled ? `已随「${PROBE_FORMAT_LABELS[t.format!]}」基础测试禁用` : (st.detail || t.desc)
                      return (
                        <div key={t.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--border)', opacity: formatDisabled ? 0.5 : 1 }}>
                          <input type="checkbox" data-id={t.id} checked={!!selected[t.id]} disabled={busy || formatDisabled} onChange={() => setSelected(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                            className="h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--accent)]" aria-label={`选择 ${t.name}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.name}</div>
                            <div className="text-xs truncate mt-0.5" style={{ color: 'var(--t3)' }}>{desc}</div>
                          </div>
                          <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color }}>{PROBE_ROW_STATUS_LABELS[st.status] ?? st.status}</span>
                        </div>
                      )
                      })
                    )}
                  </div>
                ))}
              </div>
            )}

            {pane === 'logs' && (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <select value={logFilter} onChange={e => setLogFilter(e.target.value)} className="rounded-lg px-3 py-2 text-sm border-0 outline-none cursor-pointer"
                    style={{ background: 'var(--inputBg)', border: '1px solid var(--inputBorder)', color: 'var(--text)', fontFamily: 'inherit' }}>
                    <option value="all">全部测试项</option>
                    {visibleTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <Btn small variant="soft" disabled={busy} title={busy ? '测试进行中，日志还要用来判定本轮' : undefined} onClick={() => {
                    if (busy) return
                    logsEpochRef.current += 1
                    logsRef.current = []
                    setLogs([])
                    setOpenLogs({})
                  }}>清空日志</Btn>
                </div>
                {filteredLogs.length === 0 ? (
                  <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>没有匹配的请求记录</div>
                ) : (
                  [...filteredLogs].reverse().map(renderLogRow)
                )}
              </div>
            )}

            {pane === 'report' && (
              matrixReports && matrixReports.length > 1 ? (
                <ProbeMatrixView reports={matrixReports} />
              ) : !report ? (
                <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>完成一轮测试后，报告将显示在这里</div>
              ) : (
                <div className="p-6">
                  <div className="surface-card rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-[min(100%,18rem)] flex-1">
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>测试报告</div>
                        <h3 className="text-xl font-bold mt-1 break-words" style={{ color: 'var(--text)' }}>{report.name}</h3>
                        <p className="text-sm mt-1 break-words" style={{ color: 'var(--t2)' }}>{report.target.baseUrl} · {report.target.model}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--text)', fontFamily: PROBE_MONO }}>{(report.durationMs / 1000).toFixed(1)}s</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>总耗时 · {new Date(report.completedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    {report.verdict && <ProbeVerdictBlock verdict={report.verdict} />}
                    <div className="mt-5 grid grid-cols-3 min-[1180px]:grid-cols-7 gap-x-3 gap-y-3">
                      {PROBE_STATUS_ORDER.map(s => (
                        <div key={s} className="min-w-0">
                          <div className="text-xs leading-4 whitespace-nowrap" style={{ color: 'var(--t3)' }}>{PROBE_STATUS_LABELS[s]} </div>
                          <div className="font-mono text-lg font-bold tabular-nums leading-7" style={{ color: (report.summary[s] || 0) > 0 ? probeStatusColor(s) : 'var(--t3)', fontFamily: PROBE_MONO }}>{report.summary[s] || 0}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Btn small variant="soft" onClick={exportJson}>导出 JSON</Btn>
                      <Btn small variant="soft" onClick={exportMd}>导出 Markdown</Btn>
                      <Btn small variant="soft" onClick={exportHtml}>导出 HTML</Btn>
                    </div>
                    {retryNotice && (
                      <p className="mt-3 text-sm leading-6" data-testid="probe-retry-notice" style={{ color: 'var(--err)' }}>{retryNotice}</p>
                    )}
                  </div>
                  <ProbeReportTiles report={report} onRetry={retryProbeCell} retryingKey={retryingKey} retryDisabled={busy} />
                </div>
              )
            )}

            {pane === 'history' && (
              <div className="p-6">
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--t2)' }}>已存 {history.length} / {PROBE_HISTORY_MAX} 条历史报告</p>
                    {historyNote && <p className="text-sm mt-1" style={{ color: 'var(--warn)' }} data-testid="probe-history-note">{historyNote}</p>}
                  </div>
                  {history.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allOn = history.every(item => picked.has(item.id))
                          setPicked(allOn ? new Set() : new Set(history.map(item => item.id)))
                        }}
                        className="cursor-pointer border-0 outline-none text-xs font-semibold"
                        style={{ background: 'transparent', color: 'var(--accent)', fontFamily: 'inherit' }}
                      >{history.every(item => picked.has(item.id)) ? '取消全选' : '全选'}</button>
                      <Btn small variant="soft" disabled={picked.size === 0} onClick={viewPicked}>查看所选</Btn>
                      <Btn small variant="danger" disabled={picked.size === 0} onClick={deletePicked}>删除所选 ({picked.size})</Btn>
                      <Btn small variant="danger" onClick={() => { setHistory([]); setPicked(new Set()); setMatrixReports(null); setReport(null); setHistoryNote(''); clearProbeHistory().catch(() => {}) }}>清空历史</Btn>
                    </div>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="py-16 text-center text-sm" style={{ color: 'var(--t3)' }}>暂无历史报告，完成一轮测试后自动入库</div>
                ) : (
                  <div className="space-y-3">
                    {history.map(h => {
                      const histSummary = probeSanitizeReport(h).summary
                      return (
                        <div key={h.id} data-testid="probe-history-row" className="surface-card rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                          <input
                            type="checkbox"
                            checked={picked.has(h.id)}
                            onChange={() => togglePicked(h.id)}
                            aria-label={`选择 ${h.name}`}
                            className="h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--accent)]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{h.name}</div>
                            <div className="text-xs mt-1 flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: 'var(--t3)' }}>
                              <span>{new Date(h.completedAt).toLocaleString()}</span>
                              <span className="font-mono min-w-0 max-w-full truncate">{h.target.baseUrl} · {h.target.model}</span>
                              <span>{probeSummaryLine(histSummary)}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 flex-shrink-0">
                            <Btn small variant="soft" onClick={() => viewHistoryReport(h)}>查看</Btn>
                            <Btn small variant="soft" onClick={() => reuseHistoryConfig(h)}>回填配置</Btn>
                            <Btn small variant="ghost" onClick={() => {
                              const removed = new Set([h.id])
                              deleteProbeHistory(h.id).then(list => {
                                setHistory(list)
                                setPicked(prev => {
                                  const next = new Set(prev)
                                  next.delete(h.id)
                                  return next
                                })
                                syncOpenReports(removed)
                              })
                            }}>删除</Btn>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {pane === 'channels' && (
              <ProbeChannelsPane
                chNotice={chNotice} channels={channels} activeChId={activeChId}
                chForm={chForm} editingChId={editingChId}
                onSetActive={setActiveChId} onEdit={editChannel} onCopy={copyChannel} onDelete={delChannel}
                onSave={saveChannel} onChFormChange={setChForm} onClearForm={clearChForm}
              />
            )}
          </div>
        </div>
      </div>

      {nameModal && probePortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setNameModal(false) }}>
          <div role="dialog" aria-modal="true" className="floating-material rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>命名本次测试</h2>
            <p className="text-sm mt-1 leading-6" style={{ color: 'var(--t2)' }}>名称会写入报告与导出文件。写入 {'{model}'} 会换成这一份的模型名。多个模型且名称里没有这个占位符时，会自动补成「名称 · 模型名」。</p>
            <CustomInput value={testName} onChange={setTestName} className="mt-4" placeholder="例如：2026-08-08 15:30:00" />
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setNameModal(false)}>取消</Btn>
              <Btn variant="primary" onClick={() => { const name = testName.trim() || probeNowName(); setNameModal(false); runProbe(name) }}>确认并开始</Btn>
            </div>
          </div>
        </div>,
      )}
    </div>
  )
}

export default ModelProbeTool
