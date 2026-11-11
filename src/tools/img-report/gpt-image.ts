// gpt-image 家族的 quality 档位与响应回显 / usage / 透明背景 / complexity 校验。纯函数，不依赖 React。
// gpt-image-2 只支持 low / medium / high / auto。
// gpt-image-2.5 与 2.6 的 flare / sunburst 都有 xhigh / max。2.6 另有 complexity，以及 gif / svg 输出。
// snapshot 按前缀归入家族（别名后面接日期，如 gpt-image-2.6-flare-2026-11-04）。

import type { ImgCheck, ImgOpenAiEcho } from './types'
import { imgIsGptImageModel, imgModelLeaf } from './carrier'

export type ImgGptImageFamily = 'v2' | 'v2.5' | 'v2.6'

export function imgGptImageFamily(model: string): ImgGptImageFamily | null {
  const leaf = imgModelLeaf(model)
  if (/^gpt-image-2\.6-(?:flare|sunburst)(?:-\d[\d-]*)?$/i.test(leaf)) return 'v2.6'
  if (/^gpt-image-2\.5-(?:flare|sunburst)(?:-\d[\d-]*)?$/i.test(leaf)) return 'v2.5'
  if (/^gpt-image-2(?:-\d[\d-]*)?$/i.test(leaf)) return 'v2'
  return null
}

/** 价格表按官方 id 查。去掉 vendor/ 前缀和日期 snapshot，flare / sunburst 仍分开。 */
export function imgGptPriceModel(model: string): string | null {
  const m = /^(gpt-image-2\.6-(?:flare|sunburst)|gpt-image-2\.5-(?:flare|sunburst)|gpt-image-2)(?:-\d[\d-]*)?$/i.exec(imgModelLeaf(model))
  return m ? m[1].toLowerCase() : null
}

/** 价格行先认模型框原文。没有这条时，再按去掉前缀和日期后的官方 id。 */
export function imgPickPriceModel(model: string, priceModels: readonly string[]): string {
  if (priceModels.includes(model)) return model
  return imgGptPriceModel(model) || model
}

/**
 * 数 GIF 里的图像描述块（0x2C）。浏览器画布只露出第一帧，帧数只能从字节里数。
 * 不是 GIF、或块被截断，返回 null。Netscape 循环扩展不算一帧。
 */
export function imgCountGifFrames(bytes: Uint8Array): number | null {
  if (bytes.length < 13) return null
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5])
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null
  let offset = 13
  if (bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 7) + 1))
  let frames = 0
  while (offset < bytes.length) {
    const marker = bytes[offset]
    if (marker === 0x3b) return frames
    if (marker === 0x2c) {
      if (offset + 10 > bytes.length) return null
      frames += 1
      const packed = bytes[offset + 9]
      offset += 10
      if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1))
      if (offset >= bytes.length) return null
      offset += 1
      offset = skipGifSubBlocks(bytes, offset)
      if (offset < 0) return null
      continue
    }
    if (marker === 0x21) {
      if (offset + 2 > bytes.length) return null
      offset += 2
      offset = skipGifSubBlocks(bytes, offset)
      if (offset < 0) return null
      continue
    }
    return null
  }
  return null
}

function skipGifSubBlocks(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length) {
    const size = bytes[offset]
    offset += 1
    if (size === 0) return offset
    offset += size
    if (offset > bytes.length) return -1
  }
  return -1
}

/** OpenAI images 的 quality 全部取值。不在里面的（如 ultra）对任何型号都是非法值。 */
export const IMG_GPT_QUALITY_ENUM = ['low', 'medium', 'high', 'auto', 'xhigh', 'max']
const IMG_GPT_V25_ONLY_QUALITY = ['xhigh', 'max']

/** 官方会拒绝的 quality：枚举外的值，或 gpt-image-2 带 xhigh / max */
export function imgGptQualityRejected(model: string, quality: unknown): boolean {
  const q = String(quality ?? '').trim().toLowerCase()
  if (!q) return false
  if (!IMG_GPT_QUALITY_ENUM.includes(q)) return true
  return imgGptImageFamily(model) === 'v2' && IMG_GPT_V25_ONLY_QUALITY.includes(q)
}

export function imgParseOpenAiEcho(json: any): ImgOpenAiEcho {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const u = json?.usage
  return {
    quality: str(json?.quality),
    size: str(json?.size),
    output_format: str(json?.output_format),
    background: str(json?.background),
    complexity: str(json?.complexity),
    usage: u && typeof u === 'object' ? { input_tokens: num(u.input_tokens), output_tokens: num(u.output_tokens) } : null,
  }
}

/** 透明像素占比的下限：贴纸类构图四周是空的，远高于这个值 */
export const IMG_ALPHA_MIN_RATIO = 0.01

export function imgGptImageChecks(input: {
  targets: Record<string, any>
  echo: ImgOpenAiEcho | null | undefined
  model: string
  images: { alphaRatio?: number; gifFrames?: number | null }[]
}): ImgCheck[] {
  const { targets: t, echo, model, images } = input
  const out: ImgCheck[] = []
  if (echo) {
    const norm = (v: string) => v.trim().toLowerCase().replace(/^jpg$/, 'jpeg')
    const compare = (name: string, req: unknown, got: string | null) => {
      if (typeof req !== 'string' || !req || req === 'auto') return
      out.push(got == null
        ? { name, target: req, actual: '响应未回显', pass: true, info: true }
        : { name, target: req, actual: got, pass: norm(got) === norm(req) })
    }
    // 只有 quality 档位从像素上看不出来，回显是唯一证据：被悄悄降档就靠这一条拦住
    compare('quality 回显', t.qualityReq, echo.quality)
    compare('参数回显 · size', t.sizeReq, echo.size)
    compare('参数回显 · output_format', t._of, echo.output_format)
    compare('参数回显 · background', t.bgReq, echo.background)
    // 像素看不出规划档。写了就对回显；没写的用例用官方默认 high。没回显只记 info。
    const complexityTarget = typeof t.complexityReq === 'string' && t.complexityReq
      ? t.complexityReq
      : (t.complexityDefault ? 'high' : '')
    compare('complexity 回显', complexityTarget, echo.complexity ?? null)
    if (imgIsGptImageModel(model)) {
      // 官方 gpt-image 响应都带 usage；缺了说明网关改写过响应，用量无从对账
      const u = echo.usage
      const ok = !!u && u.input_tokens != null && u.output_tokens != null
      out.push({
        name: '用量字段',
        target: 'usage.input_tokens / output_tokens',
        actual: u ? `in ${u.input_tokens ?? '缺失'} / out ${u.output_tokens ?? '缺失'}` : '无 usage',
        pass: ok,
      })
    }
  }
  if (typeof t.frameCountReq === 'number') {
    const list = images.length ? images : [{ gifFrames: null }]
    list.forEach((im, i) => {
      const tag = images.length > 1 ? `图${i + 1} ` : ''
      const got = im.gifFrames
      out.push(typeof got === 'number'
        ? { name: tag + 'GIF 帧数', target: t.frameCountReq, actual: got, pass: got === t.frameCountReq }
        : { name: tag + 'GIF 帧数', target: t.frameCountReq, actual: '无法读取帧数', pass: false })
    })
  }
  // SVG 没有可采样的栅格。background 仍随请求发出，回显比对在上面。
  if (t.bgReq === 'transparent' && !t.svg) {
    images.forEach((im, i) => {
      const tag = images.length > 1 ? `图${i + 1} ` : ''
      const r = im.alphaRatio
      out.push({
        name: tag + '透明背景',
        target: `透明像素 ≥ ${IMG_ALPHA_MIN_RATIO * 100}%`,
        actual: typeof r === 'number' ? `${+(r * 100).toFixed(1)}%` : '未能读取像素',
        pass: typeof r === 'number' && r >= IMG_ALPHA_MIN_RATIO,
      })
    })
  }
  return out
}
