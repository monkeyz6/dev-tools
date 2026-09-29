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

/** 决定性响应不是 HTTP 2xx 时，正文原样留下。状态 0 是网络占位，不当成响应。 */
export function probeNon2xxResponseBody(status: number | null, body: unknown): unknown | undefined {
  if (typeof status !== 'number' || !Number.isFinite(status) || status <= 0) return undefined
  if (status >= 200 && status < 300) return undefined
  return body
}
