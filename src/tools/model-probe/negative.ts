import { type ProbeFormat, PROBE_DEFAULT_CAP, probeProtocolOf } from './protocol.ts'

export type ProbeTopPTransport = 'http' | 'timeout' | 'network'

export function scoreTopPRange(
  status: number | null,
  transport: ProbeTopPTransport,
): { status: 'passed' | 'failed' | 'abnormal'; detail: string } {
  if (transport === 'timeout') return { status: 'abnormal', detail: '异常：请求超时' }
  if (transport === 'network') return { status: 'abnormal', detail: '异常：网络错误' }
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    return { status: 'abnormal', detail: '异常：没有 HTTP 状态码' }
  }
  if (status >= 200 && status < 300) {
    return { status: 'failed', detail: `失败：top_p=2 被接受（HTTP ${status}）` }
  }
  if (status === 401 || status === 403) {
    return { status: 'abnormal', detail: `异常：鉴权失败（HTTP ${status}）` }
  }
  if (status === 408 || status === 429) {
    return { status: 'abnormal', detail: `异常：HTTP ${status}` }
  }
  if (status >= 400 && status < 500) {
    return { status: 'passed', detail: `通过：非法 top_p 返回 HTTP ${status}` }
  }
  return { status: 'abnormal', detail: `异常：HTTP ${status}` }
}

/** 基础体加 top_p=2。Anthropic 固定 max_tokens，不跟随本轮改成 max_completion_tokens。 */
export function probeTopPRangeBody(format: ProbeFormat, model: string): Record<string, any> {
  const body = probeProtocolOf(format).baseBody(model, 'Reply with exactly: OK')
  body.top_p = 2
  if (format === 'anthropic') {
    delete body.max_completion_tokens
    body.max_tokens = PROBE_DEFAULT_CAP
  }
  return body
}

type SettledProbeResult = {
  format?: string
  detail?: string
  repro?: { body?: unknown } | null
}

const anthropicCell = (key: string, result: SettledProbeResult): boolean =>
  result.format === 'anthropic' || key.endsWith('@anthropic')

const bodyUsesMaxCompletion = (body: unknown): boolean =>
  !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.prototype.hasOwnProperty.call(body, 'max_completion_tokens')

/**
 * 整轮跑完后 Anthropic 实际用的上限字段。
 * 基础请求被要求改用 max_completion_tokens 时，成功体会带上这个字段，结论里也会写「已改用」。
 * Chat 体可以同时带两个字段，不拿来判断。
 */
export function probeSettledAnthropicCap(
  results: Record<string, SettledProbeResult | null | undefined> | null | undefined,
): 'max_tokens' | 'max_completion_tokens' {
  if (!results) return 'max_tokens'
  let mentioned = false
  for (const [key, result] of Object.entries(results)) {
    if (!result) continue
    if (anthropicCell(key, result) && bodyUsesMaxCompletion(result.repro?.body)) return 'max_completion_tokens'
    if (typeof result.detail === 'string' && result.detail.includes('已改用 max_completion_tokens')) mentioned = true
  }
  return mentioned ? 'max_completion_tokens' : 'max_tokens'
}

/** 决定性响应不是 HTTP 2xx 时，正文原样留下。状态 0 是网络占位，不当成响应。 */
export function probeNon2xxResponseBody(status: number | null, body: unknown): unknown | undefined {
  if (typeof status !== 'number' || !Number.isFinite(status) || status <= 0) return undefined
  if (status >= 200 && status < 300) return undefined
  return body
}

/** 弹层要看正文：有内容就留下（含 2xx）；非 2xx 的空正文仍留下；未发出的 null 不写。 */
export function probeKeptResponseBody(status: number | null, body: unknown): unknown | undefined {
  if (body !== undefined && body !== null) return body
  return probeNon2xxResponseBody(status, body)
}
