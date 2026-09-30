import type { ProbeStop, ProbeToolCall } from './protocol'
import { probeErrorMessage, PROBE_JSON_SCHEMA, PROBE_MULTITURN_CODE, PROBE_SYSTEM_TOKEN } from './protocol'

export interface ProbeCheck {
  id: string
  passed: boolean
  detail: string
}

export const probeCheck = (id: string, passed: boolean, detail: string): ProbeCheck => ({ id, passed, detail })

export function parseJsonFromText(text: string): unknown | undefined {
  const trimmed = String(text || '').trim()
  if (!trimmed) return undefined
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(unfenced) } catch { /* fall through */ }
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(unfenced.slice(start, end + 1)) } catch { /* ignore */ }
  }
  return undefined
}

export function oracleTruncation(stop: ProbeStop): ProbeCheck {
  if (stop.kind === 'length') {
    return probeCheck('truncation', true, `截断原因 ${stop.raw || 'length'}`)
  }
  return probeCheck('truncation', false, `终止原因不是截断（${stop.raw ?? '缺失'}）`)
}

/** 推理模型把输出额度耗尽报成这句 400，而不是 finish_reason=length。其它 max_tokens 错误不认。 */
const OUTPUT_LIMIT_RE = /could not finish the message because max_tokens or model output limit was reached/i
export const PROBE_OUTPUT_LIMIT_DETAIL = '输出额度用尽（max_tokens or model output limit was reached）'

export function probeOutputLimitReached(value: unknown): boolean {
  if (typeof value === 'string') {
    if (OUTPUT_LIMIT_RE.test(probeErrorMessage(value))) return true
    return OUTPUT_LIMIT_RE.test(value)
  }
  if (value && typeof value === 'object') {
    try { return probeOutputLimitReached(JSON.stringify(value)) } catch { return false }
  }
  return false
}

export interface ProbeOutputLimitCell {
  status: string
  detail: string
  checks?: ProbeCheck[]
  repro?: { responseBody?: unknown; status?: number | null } | null
}

/** 只改失败的 Token 上限格。有数字状态时必须是 400。参数不支持、5xx 和其它用例不动。 */
export function probeRescoreOutputLimitResults<T extends ProbeOutputLimitCell>(
  results: Record<string, T> | null | undefined,
): Record<string, T> | null {
  if (!results) return null
  let changed = false
  const next: Record<string, T> = { ...results }
  for (const [key, result] of Object.entries(results)) {
    if (!result || result.status !== 'failed') continue
    if (key !== 'max_tokens' && !key.startsWith('max_tokens@')) continue
    const status = result.repro?.status
    if (typeof status === 'number' && status !== 400) continue
    const checksIn = result.checks ?? []
    if (checksIn.some(check => check.id !== 'truncation' && !check.passed)) continue
    const hit = probeOutputLimitReached(result.repro?.responseBody)
      || probeOutputLimitReached(result.detail)
      || checksIn.some(check => probeOutputLimitReached(check.detail))
    if (!hit) continue
    const checks = checksIn.map(check => (
      check.id === 'truncation' ? { ...check, passed: true, detail: PROBE_OUTPUT_LIMIT_DETAIL } : check
    ))
    if (!checks.some(check => check.id === 'truncation')) {
      checks.push(probeCheck('truncation', true, PROBE_OUTPUT_LIMIT_DETAIL))
    }
    const accepted = checks.find(check => check.id === 'accepted' && check.passed)
    next[key] = {
      ...result,
      status: 'passed',
      detail: accepted ? `${accepted.detail}；${PROBE_OUTPUT_LIMIT_DETAIL}` : PROBE_OUTPUT_LIMIT_DETAIL,
      checks,
    }
    changed = true
  }
  return changed ? next : null
}

export function oracleToolNamed(calls: ProbeToolCall[], name: string): ProbeCheck {
  if (calls.some(c => c.name === name)) {
    return probeCheck('tool_call', true, `已调用 ${name}`)
  }
  const got = calls.map(c => c.name).filter(Boolean)
  return probeCheck('tool_call', false, got.length ? `未调用 ${name}（实际：${got.join(', ')}）` : `响应中没有工具调用`)
}

export function oracleSchemaOk(text: string, schema: { required?: readonly string[] } = PROBE_JSON_SCHEMA): ProbeCheck {
  const parsed = parseJsonFromText(text)
  if (parsed === undefined || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return probeCheck('schema', false, '响应不是可解析的 JSON 对象')
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj.ok !== 'boolean') {
    return probeCheck('schema', false, 'JSON 缺少布尔字段 ok')
  }
  for (const key of schema.required || ['ok']) {
    if (!(key in obj)) return probeCheck('schema', false, `JSON 缺少字段 ${key}`)
  }
  return probeCheck('schema', true, 'JSON 符合 Schema')
}

export function oracleSystemOk(text: string): ProbeCheck {
  const t = String(text || '').trim()
  if (t === PROBE_SYSTEM_TOKEN || t === `${PROBE_SYSTEM_TOKEN}.` || t === `${PROBE_SYSTEM_TOKEN}!`) {
    return probeCheck('instruction', true, `回复含 ${PROBE_SYSTEM_TOKEN}`)
  }
  if (t.includes(PROBE_SYSTEM_TOKEN)) {
    return probeCheck('instruction', true, `回复含 ${PROBE_SYSTEM_TOKEN}`)
  }
  return probeCheck('instruction', false, `回复未遵循系统指令（未出现 ${PROBE_SYSTEM_TOKEN}）`)
}

export function oracleCodeword(text: string, code = PROBE_MULTITURN_CODE): ProbeCheck {
  const re = new RegExp(`\\b${code}\\b`)
  if (re.test(String(text || ''))) {
    return probeCheck('instruction', true, `第二跳回出口令 ${code}`)
  }
  return probeCheck('instruction', false, `第二跳未回出口令 ${code}`)
}

export function oracleDominantRed(text: string): ProbeCheck {
  if (/\bred(?:dish)?\b|scarlet|crimson|maroon|朱红|鲜红|红色/i.test(String(text || ''))) {
    return probeCheck('vision', true, '识别为主色红')
  }
  return probeCheck('vision', false, '回复未识别出红色')
}

export function oracleUnsupportedVision(err: string): boolean {
  return /image|vision|multimodal|modalit/i.test(err)
}
