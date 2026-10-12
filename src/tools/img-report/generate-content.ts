// Gemini generateContent（Interactions 模型切到该端点时）的响应读数。
// 纯函数，不依赖 React / DOM。通过条件不在这里：图片 token 只说明，搜索证据交给调用方。

import type { ImgCheck } from './types'

/** 思考中间图。不算成图，否则「返回张数」会把正常的思考响应判失败。 */
export function imgIsThoughtPart(part: { thought?: unknown } | null | undefined): boolean {
  return !!part && part.thought === true
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function nonEmpty(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function groundingMetas(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json)
  if (!root) return []
  const found: Record<string, unknown>[] = []
  const push = (value: unknown) => {
    const rec = asRecord(value)
    if (rec) found.push(rec)
  }
  push(root.groundingMetadata ?? root.grounding_metadata)
  if (Array.isArray(root.candidates)) {
    for (const candidate of root.candidates) {
      const rec = asRecord(candidate)
      if (rec) push(rec.groundingMetadata ?? rec.grounding_metadata)
    }
  }
  return found
}

const GROUNDING_KEYS = [
  'webSearchQueries', 'web_search_queries',
  'groundingChunks', 'grounding_chunks',
  'searchEntryPoint', 'search_entry_point',
  'groundingSupports', 'grounding_supports',
]

/** candidates[].groundingMetadata 或顶层同名字段里，任一搜索证据非空。camelCase / snake_case 都认。 */
export function imgGenerateContentGrounded(json: unknown): boolean {
  for (const meta of groundingMetas(json)) {
    if (GROUNDING_KEYS.some(key => nonEmpty(meta[key]))) return true
  }
  return false
}

function imageTokenCount(detail: unknown): number | null {
  const rec = asRecord(detail)
  if (!rec) return null
  if (String(rec.modality ?? '').toLowerCase() !== 'image') return null
  const count = rec.tokenCount ?? rec.token_count
  return typeof count === 'number' && Number.isFinite(count) ? count : null
}

/**
 * usageMetadata.candidatesTokensDetails 里 IMAGE 的 tokenCount。
 * 不回落到 candidatesTokenCount：那个数含文本。没有 IMAGE 明细则为 null。
 */
export function imgGenerateContentImageTokens(json: unknown): number | null {
  const usage = asRecord(asRecord(json)?.usageMetadata ?? asRecord(json)?.usage_metadata)
  if (!usage) return null
  const details = usage.candidatesTokensDetails ?? usage.candidates_tokens_details
  if (!Array.isArray(details)) return null
  for (const detail of details) {
    const count = imageTokenCount(detail)
    if (count != null) return count
  }
  return null
}

/** generateContent 追加的校验。token 永远是 info；搜索只在请求带了工具时出现。 */
export function imgGenerateContentExtraChecks(input: {
  generateContent: boolean
  searchReq: boolean
  imageTokens: number | null | undefined
  grounded: boolean | undefined
}): ImgCheck[] {
  const checks: ImgCheck[] = []
  if (input.generateContent) {
    const tokens = input.imageTokens
    checks.push({
      name: '图片输出 token',
      target: '—',
      actual: tokens == null ? '无 usage' : `${tokens} token`,
      pass: true,
      info: true,
    })
  }
  if (input.searchReq) {
    const grounded = !!input.grounded
    checks.push({
      name: '联网搜索',
      target: 'groundingMetadata 有搜索证据',
      actual: grounded ? '有' : '无',
      pass: grounded,
    })
  }
  return checks
}
