// gpt-image 家族的 quality 档位与响应回显 / usage / 透明背景校验。纯函数，不依赖 React。
// gpt-image-2 只支持 low / medium / high / auto；gpt-image-2.5-flare / sunburst 多了 xhigh / max。
// snapshot 按前缀归入家族（别名后面接日期，如 gpt-image-2.5-flare-2026-09-30）。

import type { ImgCheck, ImgOpenAiEcho } from './types'
import { imgIsGptImageModel, imgModelLeaf } from './carrier'

export type ImgGptImageFamily = 'v2' | 'v2.5'

export function imgGptImageFamily(model: string): ImgGptImageFamily | null {
  const leaf = imgModelLeaf(model)
  if (/^gpt-image-2\.5-(?:flare|sunburst)(?:-\d[\d-]*)?$/i.test(leaf)) return 'v2.5'
  if (/^gpt-image-2(?:-\d[\d-]*)?$/i.test(leaf)) return 'v2'
  return null
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
    usage: u && typeof u === 'object' ? { input_tokens: num(u.input_tokens), output_tokens: num(u.output_tokens) } : null,
  }
}

/** 透明像素占比的下限：贴纸类构图四周是空的，远高于这个值 */
export const IMG_ALPHA_MIN_RATIO = 0.01

export function imgGptImageChecks(input: {
  targets: Record<string, any>
  echo: ImgOpenAiEcho | null | undefined
  model: string
  images: { alphaRatio?: number }[]
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
  if (t.bgReq === 'transparent') {
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
