import type { VideoCheck, VideoErrorDetail, VideoRecord } from './types.ts'

/** 火山方舟推理错误码（docs/82379/1299023）里与视频生成相关的族 */
export type VideoErrorFamily = 'sensitive' | 'parameter' | 'auth' | 'rateLimit' | 'internal'

export const VIDEO_ERROR_FAMILY_LABEL: Record<VideoErrorFamily, string> = {
  sensitive: '内容安全',
  parameter: '参数',
  auth: '鉴权',
  rateLimit: '限流',
  internal: '服务端',
}

export type VideoErrorShape = 'object' | 'string' | 'missing'

export interface VideoErrorParse {
  shape: VideoErrorShape
  detail: VideoErrorDetail | null
}

function videoNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s || undefined
}

function videoErrorNode(json: any): unknown {
  if (json == null || typeof json !== 'object') return undefined
  if (json.error != null) return json.error
  if (json.data?.error != null) return json.data.error
  return undefined
}

/** 读查询任务 / HTTP 错误体里的 `error` 或 `data.error` */
export function parseVideoTaskError(json: any): VideoErrorParse {
  const err = videoErrorNode(json)
  if (err == null) return { shape: 'missing', detail: null }
  if (typeof err === 'string') {
    const message = videoNonEmptyString(err)
    return { shape: 'string', detail: message ? { message } : null }
  }
  if (typeof err !== 'object') return { shape: 'missing', detail: null }
  const rawCode = (err as { code?: unknown }).code
  const code = videoNonEmptyString(typeof rawCode === 'number' ? String(rawCode) : rawCode)
  const message = videoNonEmptyString((err as { message?: unknown }).message)
  const type = videoNonEmptyString((err as { type?: unknown }).type)
    || videoNonEmptyString((err as { status?: unknown }).status)
  return { shape: 'object', detail: { code, message, type } }
}

export function formatVideoTaskError(detail: VideoErrorDetail | null | undefined): string | null {
  if (!detail) return null
  const text = `${detail.code || ''} ${detail.message || ''}`.trim()
  return text || null
}

export function videoErrorFamilyOf(code: string | undefined | null): VideoErrorFamily | null {
  if (!code) return null
  if (/SensitiveContentDetected/i.test(code)) return 'sensitive'
  if (/InvalidParameter|MissingParameter/i.test(code)) return 'parameter'
  if (/AuthenticationError/i.test(code)) return 'auth'
  if (/RateLimitExceeded|QuotaExceeded|ServerOverloaded|RequestBurstTooFast/i.test(code)) return 'rateLimit'
  if (/InternalServiceError/i.test(code)) return 'internal'
  return null
}

/** HTTP 状态能单独判定族时才要求 code 落在该族（401 / 429 / 5xx） */
export function videoExpectedErrorFamily(status: number): VideoErrorFamily | null {
  if (status === 401) return 'auth'
  if (status === 429) return 'rateLimit'
  if (status >= 500) return 'internal'
  return null
}

export function videoTaskFailedStatus(st: string | null | undefined): boolean {
  const s = (st || '').toLowerCase()
  return s === 'failed' || s === 'failure'
}

/** 生成任务 failed，或查询/提交 HTTP ≥400 时才做错误体校验；素材 OpenAPI 错误形态不同，不套用 */
export function videoShouldCheckErrorBody(rec: Pick<VideoRecord, 'status' | 'taskStatus'> & { kind?: VideoRecord['kind']; apiType?: VideoRecord['apiType'] }): boolean {
  if (rec.apiType === 'google-omni') return false
  if (rec.kind === 'material-group' || rec.kind === 'material-assets') return false
  return videoTaskFailedStatus(rec.taskStatus) || rec.status >= 400
}

function videoHeaderRequestId(rec: Pick<VideoRecord, 'reqId' | 'respHeaders'>): string {
  const headers = rec.respHeaders || {}
  return rec.reqId || headers['x-oneapi-request-id'] || headers['x-request-id'] || ''
}

function videoMessageRequestId(message: string | undefined): string {
  if (!message) return ''
  const m = /Request ID:\s*(\S+)/i.exec(message)
  return m?.[1]?.replace(/[.,;]+$/, '') || ''
}

function videoParseSnippet(raw: string | undefined): any {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function videoBuildErrorBodyChecks(rec: Pick<VideoRecord, 'errorDetail' | 'rawSnippet' | 'reqId' | 'respHeaders' | 'error' | 'status' | 'taskStatus'>): VideoCheck[] {
  const parsed = parseVideoTaskError(videoParseSnippet(rec.rawSnippet))
  const detail = rec.errorDetail ?? parsed.detail
  const shape = parsed.shape
  const expected = videoExpectedErrorFamily(rec.status)
  const family = videoErrorFamilyOf(detail?.code)
  const checks: VideoCheck[] = []

  checks.push({
    name: '错误结构',
    target: 'error 为对象',
    actual: shape === 'object' ? 'object' : shape === 'string' ? 'string' : '无 error 字段',
    pass: shape === 'object',
  })

  const code = detail?.code
  const codeOk = typeof code === 'string' && code.length > 0
  const familyOk = !expected || family === expected
  checks.push({
    name: '错误.code',
    target: expected ? `非空 string · 族 ${VIDEO_ERROR_FAMILY_LABEL[expected]}` : '非空 string',
    actual: code
      ? `${code}${family ? `（${VIDEO_ERROR_FAMILY_LABEL[family]}）` : ''}`
      : '无',
    pass: codeOk && familyOk,
  })

  const message = detail?.message
  checks.push({
    name: '错误.message',
    target: '非空 string（错误原因）',
    actual: message || '无',
    pass: typeof message === 'string' && message.length > 0,
  })

  if (detail?.type != null) {
    checks.push({
      name: '错误.type',
      target: '非空 string',
      actual: detail.type,
      pass: typeof detail.type === 'string' && detail.type.length > 0,
    })
  }

  const reqId = videoHeaderRequestId(rec) || videoMessageRequestId(message) || videoMessageRequestId(rec.error || undefined)
  checks.push({
    name: '请求ID',
    target: '响应头或 message 内 Request ID',
    actual: reqId || '未返回',
    pass: true,
    info: !reqId,
  })

  return checks
}
