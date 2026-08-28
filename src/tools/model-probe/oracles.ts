import type { ProbeStop, ProbeToolCall } from './protocol'
import { PROBE_JSON_SCHEMA, PROBE_MULTITURN_CODE, PROBE_SYSTEM_TOKEN } from './protocol'

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
