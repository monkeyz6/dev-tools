// 返回载体：按各家官方契约判断成图落在哪个字段。
// http(s) 优先于同一条里的 b64_json：要 URL 时旁边再带 base64 仍算地址；要 base64 时出现地址算失败。
// 旧历史没有 carrier 的记录不进这套判定（由 ImgApiTestTool 的 imgBuildChecks 沿用 response_format 旧校验）。

import type { ImgApiType, ImgCarrier, ImgCheck } from './types'

export type ImgExpectedCarrier = 'b64_json' | 'inline' | 'http-url'

export interface ImgOpenAiCarrierHit {
  carrier: ImgCarrier
  url: string | null
  b64: string | null
}

export interface ImgGeminiCarrierHit {
  carrier: ImgCarrier
  url: string | null
  inline: string | null
  mime: string | null
}

export interface ImgCarrierSample {
  carrier?: ImgCarrier | null
  url?: string | null
}

const CARRIERS = new Set<ImgCarrier>([
  'b64_json', 'b64_prefixed', 'inline', 'inline_prefixed', 'http-url', 'data-url', 'other-url',
])

export function imgIsGptImageModel(model: string): boolean {
  const leaf = String(model ?? '').trim().split('/').map(part => part.trim()).filter(Boolean).pop() || ''
  return /^(?:gpt-image|chatgpt-image)(?:$|[-.])/i.test(leaf)
}

export function imgExpectedCarrier(
  apiType: ImgApiType,
  model: string,
  responseFormat?: string | null,
): ImgExpectedCarrier | null {
  if (apiType === 'gemini') return 'inline'
  const rf = typeof responseFormat === 'string' ? responseFormat.trim().toLowerCase() : ''
  if (apiType === 'openai') {
    if (imgIsGptImageModel(model)) return 'b64_json'
    if (rf === 'b64_json') return 'b64_json'
    if (rf === 'url') return 'http-url'
    return null
  }
  if (apiType === 'grok' || apiType === 'seedream' || apiType === 'volcanoArk') {
    if (rf === 'b64_json') return 'b64_json'
    if (rf === 'url' || rf === '') return 'http-url'
    return null
  }
  return null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function urlKind(url: string): ImgCarrier {
  if (/^https?:\/\//i.test(url)) return 'http-url'
  if (/^data:/i.test(url)) return 'data-url'
  return 'other-url'
}

function imageMime(mime: string | null): boolean {
  return !!mime && /^image\//i.test(mime)
}

// mime 声明不可信时看 base64 文件头：PNG / JPEG / GIF / WebP。
function sniffImageMime(raw: string): string | null {
  const b64 = raw.replace(/^data:[^,]*,/i, '').slice(0, 24).replace(/[^A-Za-z0-9+/]/g, '')
  let head = ''
  try { head = atob(b64.slice(0, b64.length - (b64.length % 4))) } catch { return null }
  if (head.startsWith('\x89PNG')) return 'image/png'
  if (head.startsWith('\xFF\xD8\xFF')) return 'image/jpeg'
  if (head.startsWith('GIF8')) return 'image/gif'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function imgClassifyOpenAiImage(item: { url?: unknown; b64_json?: unknown } | null | undefined): ImgOpenAiCarrierHit | null {
  if (!item || typeof item !== 'object') return null
  const url = text(item.url)
  const b64 = text(item.b64_json)
  if (url) return { carrier: urlKind(url), url, b64 }
  if (!b64) return null
  return { carrier: /^data:/i.test(b64) ? 'b64_prefixed' : 'b64_json', url: null, b64 }
}

interface GeminiBlob { data?: unknown; fileUri?: unknown; file_uri?: unknown; mimeType?: unknown; mime_type?: unknown }

export function imgClassifyGeminiPart(part: {
  inlineData?: GeminiBlob
  inline_data?: GeminiBlob
  fileData?: GeminiBlob
  file_data?: GeminiBlob
} | null | undefined): ImgGeminiCarrierHit | null {
  if (!part || typeof part !== 'object') return null
  const inline = part.inlineData || part.inline_data
  const inlineRaw = text(inline?.data)
  const inlineMime = text(inline?.mimeType ?? inline?.mime_type)
  const sniffed = inlineRaw && inlineMime && !imageMime(inlineMime) ? sniffImageMime(inlineRaw) : null
  const inlineImage = !!inlineRaw && (!inlineMime || imageMime(inlineMime) || !!sniffed)
  const file = part.fileData || part.file_data
  const fileUri = text(file?.fileUri ?? file?.file_uri)
  const fileMime = text(file?.mimeType ?? file?.mime_type)
  const fileIsImage = !!fileUri && (
    imageMime(fileMime)
    || /^data:image\//i.test(fileUri)
    || (!fileMime && /^https?:\/\//i.test(fileUri))
  )

  // 有内联图就按 inline 判，同一个 part 里多带的 fileUri 只作附带信息。
  if (inlineRaw && inlineImage) {
    return {
      carrier: /^data:/i.test(inlineRaw) ? 'inline_prefixed' : 'inline',
      url: fileIsImage ? fileUri : null,
      inline: inlineRaw,
      mime: sniffed || inlineMime || fileMime || 'image/png',
    }
  }
  if (!fileUri || !fileIsImage) return null
  return { carrier: urlKind(fileUri), url: fileUri, inline: null, mime: fileMime || 'image/png' }
}

type EffectiveCarrier = ImgCarrier | 'unknown'

function effectiveCarrier(image: ImgCarrierSample): EffectiveCarrier {
  if (image.carrier && CARRIERS.has(image.carrier)) return image.carrier
  const url = text(image.url)
  if (!url) return 'unknown'
  return urlKind(url)
}

function carrierPasses(expected: ImgExpectedCarrier, carrier: EffectiveCarrier, apiType: ImgApiType): boolean {
  if (expected === 'http-url') return carrier === 'http-url'
  if (expected === 'inline') return carrier === 'inline' || carrier === 'inline_prefixed'
  if (carrier === 'b64_json') return true
  if (carrier === 'b64_prefixed') return apiType !== 'grok'
  return false
}

function targetLabel(expected: ImgExpectedCarrier): string {
  if (expected === 'inline') return 'inlineData'
  if (expected === 'http-url') return 'http(s) url'
  return 'b64_json'
}

function actualLabel(carrier: EffectiveCarrier, apiType: ImgApiType): string {
  switch (carrier) {
    case 'b64_json': return 'b64_json'
    case 'unknown': return '未识别'
    case 'b64_prefixed': return 'b64_json（带 data: 前缀）'
    case 'inline': return 'inlineData'
    case 'inline_prefixed': return 'inlineData（带 data: 前缀）'
    case 'http-url': return 'http(s) url'
    case 'data-url': return 'data:image（写在 url 字段）'
    case 'other-url': return '非官方地址'
  }
}

export function imgCarrierCheck(input: {
  apiType: ImgApiType
  model: string
  responseFormat?: string | null
  images: ImgCarrierSample[]
}): ImgCheck | null {
  const expected = imgExpectedCarrier(input.apiType, input.model, input.responseFormat)
  const images = input.images || []
  if (!expected || images.length === 0) return null
  const rows = images.map((image, index) => {
    const carrier = effectiveCarrier(image)
    return {
      index,
      pass: carrierPasses(expected, carrier, input.apiType),
      label: actualLabel(carrier, input.apiType),
    }
  })
  const failed = rows.filter(row => !row.pass)
  const actual = failed.length
    ? (images.length > 1 ? failed.map(row => `图${row.index + 1} ${row.label}`).join('；') : failed[0].label)
    : (rows.every(row => row.label === rows[0].label)
      ? rows[0].label
      : rows.map(row => `图${row.index + 1} ${row.label}`).join('；'))
  return { name: '返回载体', target: targetLabel(expected), actual, pass: failed.length === 0 }
}
