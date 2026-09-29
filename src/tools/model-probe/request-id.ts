/** 网关头优先，厂商头垫后。比较时忽略大小写，空串不算命中。 */
export const PROBE_REQUEST_ID_HEADERS = [
  'x-oneapi-request-id',
  'x-request-id',
  'x-log-id',
  'x-trace-id',
  'x-openai-request-id',
  'request-id',
  'x-goog-request-id',
] as const

export function probeRequestIdFromHeaders(headers: { get(name: string): string | null }): string | null {
  for (const name of PROBE_REQUEST_ID_HEADERS) {
    const value = headers.get(name)
    if (value && value.trim()) return value.trim()
  }
  return null
}

export function probeRequestIdFromRecord(record: Record<string, string> | null | undefined): string | null {
  const lower = new Map<string, string>()
  for (const [key, value] of Object.entries(record || {})) lower.set(key.toLowerCase(), value)
  return probeRequestIdFromHeaders({
    get: name => {
      const value = lower.get(name.toLowerCase())
      return value == null ? null : value
    },
  })
}

/** 只留下会参与 Request ID 取值的响应头，供结果在日志被丢掉后仍能按同一顺序重取。 */
export function probeRequestIdHeaders(record: Record<string, string> | null | undefined): Record<string, string> {
  const lower = new Map<string, string>()
  for (const [key, value] of Object.entries(record || {})) lower.set(key.toLowerCase(), value)
  const out: Record<string, string> = {}
  for (const name of PROBE_REQUEST_ID_HEADERS) {
    const value = lower.get(name)
    if (value && value.trim()) out[name] = value.trim()
  }
  return out
}

/** 弹层展示：响应头按既定顺序优先，没有这些头时用已经记下的 requestId。 */
export function probeShownRequestId(repro: {
  requestId?: string | null
  responseHeaders?: Record<string, string> | null
} | null | undefined): string | null {
  if (!repro) return null
  const fromHeaders = probeRequestIdFromRecord(repro.responseHeaders)
  if (fromHeaders) return fromHeaders
  const stored = typeof repro.requestId === 'string' ? repro.requestId.trim() : ''
  return stored || null
}
