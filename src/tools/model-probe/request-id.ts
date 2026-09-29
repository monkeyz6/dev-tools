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

export function probeRequestIdFromRecord(record: Record<string, string>): string | null {
  const lower = new Map<string, string>()
  for (const [key, value] of Object.entries(record)) lower.set(key.toLowerCase(), value)
  return probeRequestIdFromHeaders({
    get: name => {
      const value = lower.get(name.toLowerCase())
      return value == null ? null : value
    },
  })
}
