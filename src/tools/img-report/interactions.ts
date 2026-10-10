// Gemini Interactions（gemini-nano-banana-2.1）的响应解析与「是否与官方一致」判定。
// 纯函数，不依赖 React / DOM，单测见 interactions.test.ts。

import type { ImgCarrier, ImgCheck, ImgInteractionMeta } from './types'

/** 官方按档位折算的图片输出 token：1K=1120、2K=1680、4K=3780（ai.google.dev 定价页） */
export const IMG_NANO_TIER_TOKENS: Record<string, number> = { '1K': 1120, '2K': 1680, '4K': 3780 }

/**
 * 上一代 Gemini 3.1 Flash Image（Nano Banana 2）的 4K 图片输出 token（ai.google.dev 定价页）。
 * 与 2.1 的 1K / 2K 计费相同（1120 / 1680），只有 4K 不同（2.1=3780）。0.5K 不能拿来区分：
 * 指南写 2.1 不支持 512，但直连官方实测 2xx 出图，2.1 的 512 计费又没公布，可能同样是 747。
 */
export const IMG_FLASH31_4K_TOKENS = 2520

export function imgNanoTierTokens(label: string | null | undefined): number | null {
  return IMG_NANO_TIER_TOKENS[String(label || '').trim().toUpperCase()] ?? null
}

/** 请求没写 image_size 时，按实际出图的等效边长取最近的档位（对数距离） */
export function imgNanoTierFromSize(w: number, h: number): { label: string; tokens: number } | null {
  if (!(w > 0 && h > 0)) return null
  const eq = Math.sqrt(w * h)
  const bases: [string, number][] = [['1K', 1024], ['2K', 2048], ['4K', 4096]]
  let best = bases[0]
  for (const b of bases) if (Math.abs(Math.log(eq / b[1])) < Math.abs(Math.log(eq / best[1]))) best = b
  return { label: best[0], tokens: IMG_NANO_TIER_TOKENS[best[0]] }
}

export interface ImgInteractionImage {
  url: string | null
  dataUri: string | null
  mimeType: string | null
  carrier: ImgCarrier
}

function urlCarrier(url: string): ImgCarrier {
  if (/^https?:\/\//i.test(url)) return 'http-url'
  if (/^data:/i.test(url)) return 'data-url'
  return 'other-url'
}

/**
 * 解析 Interactions 响应。成图在 steps[].model_output.content[]（旧版是 outputs[]）：
 * user_input 是参考图回显、thought 是思考中间图，都不算成图。
 * 没有 steps / outputs 数组，或没找到图而响应带 candidates 时返回 null，交给 generateContent 解析。
 */
export function imgParseInteraction(json: any): { images: ImgInteractionImage[]; meta: ImgInteractionMeta } | null {
  if (!json || (!Array.isArray(json.steps) && !Array.isArray(json.outputs))) return null
  const images: ImgInteractionImage[] = []
  let thoughtSteps = 0
  let searchSteps = 0
  const pushBlock = (block: any) => {
    if (!block || block.type !== 'image') return
    if (block.thought === true) { thoughtSteps++; return }
    const mime = typeof block.mime_type === 'string' && block.mime_type ? block.mime_type : 'image/png'
    const data = typeof block.data === 'string' ? block.data : ''
    const uri = typeof block.uri === 'string' ? block.uri : ''
    if (data) {
      images.push({ url: null, dataUri: data.startsWith('data:') ? data : `data:${mime};base64,${data}`, mimeType: mime, carrier: 'inline' })
    } else if (uri) {
      // 只给 uri 的成图照样收进来，让「返回载体」校验去判（官方返回 inline data）
      images.push({ url: uri, dataUri: null, mimeType: mime, carrier: urlCarrier(uri) })
    }
  }
  if (Array.isArray(json.steps)) {
    for (const step of json.steps) {
      if (step?.type === 'thought') thoughtSteps++
      else if (step?.type === 'google_search_call') searchSteps++
      else if (step?.type === 'model_output') {
        const content = step.content
        if (Array.isArray(content)) content.forEach(pushBlock)
        else pushBlock(content)
      }
    }
  }
  if (!images.length && Array.isArray(json.outputs)) json.outputs.forEach(pushBlock)
  if (!images.length && Array.isArray(json.candidates)) return null

  let imageTokens: number | null = null
  const byModality = json.usage?.output_tokens_by_modality
  if (Array.isArray(byModality)) {
    const hit = byModality.find((x: any) => String(x?.modality || '').toLowerCase() === 'image')
    if (hit && typeof hit.tokens === 'number') imageTokens = hit.tokens
  }
  return {
    images,
    meta: {
      id: typeof json.id === 'string' && json.id ? json.id : null,
      status: typeof json.status === 'string' ? json.status : null,
      model: typeof json.model === 'string' ? json.model : null,
      imageTokens,
      thoughtSteps,
      searchSteps,
    },
  }
}

/** 模型名比较：去掉 google/、models/ 这类前缀并转小写 */
export function imgNormalizeModelId(id: string | null | undefined): string {
  return String(id || '').trim().toLowerCase().replace(/^.*\//, '')
}

/**
 * 图片输出 token 对账。期望 = 档位 token × 成图张数。
 * 响应里没有 thought 时必须严格相等；有 thought（官方每次最多 2 张思考中间图，可能计入）时放宽到 [期望, 期望 + 2×档位]。
 */
export function imgInteractionTokenCheck(
  tokensPer: number | null,
  imageCount: number,
  actual: number | null,
  thoughtSteps: number,
): { pass: boolean; info?: boolean; target: string; actual: string } {
  if (tokensPer == null) return { pass: true, info: true, target: '—', actual: actual == null ? '无 usage' : String(actual) }
  const expected = tokensPer * imageCount
  if (actual == null) return { pass: false, target: String(expected), actual: 'usage 缺失或没有 image 模态' }
  if (thoughtSteps > 0) {
    const max = expected + 2 * tokensPer
    return { pass: actual >= expected && actual <= max, target: `${expected}～${max}（含思考图）`, actual: String(actual) }
  }
  return { pass: actual === expected, target: String(expected), actual: String(actual) }
}

/** 请求档位是否为 4K：优先 targets 里记下的 image_size，没写时按实际出图尺寸推 */
function imgNanoIs4K(t: Record<string, any>, firstSize?: { w: number; h: number } | null): boolean {
  if (t.resolutionTierBaseReq) return t.resolutionTierBaseReq === 4096
  return !!firstSize && imgNanoTierFromSize(firstSize.w, firstSize.h)?.label === '4K'
}

/**
 * 模型指纹：用 4K 的图片输出 token 区分 2.1（3780）与上一代 3.1 Flash Image（2520），其余档位两代分不出，返回 null 不出这一项。
 * 带思考图时也不判：放宽区间会盖住别的组合，比如「2K 成图 + 1K 思考图」2800 落在 3.1 区间低端 [2520, 3780)，
 * 渠道忽略档位时会被误判成 3.1。只认没有思考图、且与其中恰好一代严格相等。
 * 这是行为证据，不是证明：渠道可以改写 usage。
 */
export function imgNanoFingerprint(input: ImgInteractionCheckInput): ImgCheck | null {
  const { targets: t, meta, imageCount, firstSize } = input
  if (!meta || meta.imageTokens == null || imageCount < 1 || meta.thoughtSteps > 0) return null
  if (!imgNanoIs4K(t, firstSize)) return null
  const per21 = IMG_NANO_TIER_TOKENS['4K']
  const actual = meta.imageTokens
  const target = `2.1：4K 每张 ${per21} token`
  if (actual === per21 * imageCount) return { name: '模型指纹', target, actual: `${actual} token，符合 2.1`, pass: true }
  if (actual === IMG_FLASH31_4K_TOKENS * imageCount) {
    return { name: '模型指纹', target, actual: `${actual} token，符合 3.1 Flash Image 的 4K 计费（每张 ${IMG_FLASH31_4K_TOKENS}）`, pass: false }
  }
  return null
}

export interface ImgInteractionCheckInput {
  targets: Record<string, any>
  meta: ImgInteractionMeta | null | undefined
  imageCount: number
  firstSize?: { w: number; h: number } | null
}

/** Interactions 专属判定：响应结构、模型回显、图片输出 token，以及按请求触发的联网搜索 / 多轮编辑 */
export function imgInteractionChecks(input: ImgInteractionCheckInput): ImgCheck[] {
  const { targets: t, meta, imageCount, firstSize } = input
  const c: ImgCheck[] = []
  if (!meta) {
    c.push({ name: '响应结构', target: 'Interactions 响应', actual: '响应不是 Interactions 结构', pass: false })
    return c
  }
  c.push({
    name: '响应结构',
    target: 'id 非空 · status=completed',
    actual: `id ${meta.id ? '有' : '无'} · status=${meta.status ?? '缺失'}`,
    pass: !!meta.id && meta.status === 'completed',
  })
  if (t.modelReq) {
    c.push({
      name: '模型回显',
      target: String(t.modelReq),
      actual: meta.model ?? '响应没有 model',
      pass: !!meta.model && imgNormalizeModelId(meta.model) === imgNormalizeModelId(t.modelReq),
    })
  }
  // 请求写了档位就只认该档的官方 token；没有官方数字（如 512）记 info，不拿出图尺寸去套别的档位
  const tokensPer: number | null = t.resolutionTierBaseReq
    ? t.imageTokensPer ?? null
    : t.imageTokensPer ?? (firstSize ? imgNanoTierFromSize(firstSize.w, firstSize.h)?.tokens ?? null : null)
  const tok = imgInteractionTokenCheck(tokensPer, imageCount, meta.imageTokens, meta.thoughtSteps)
  c.push({ name: '图片输出 token', target: tok.target, actual: tok.actual, pass: tok.pass, ...(tok.info ? { info: true } : {}) })
  const fp = imgNanoFingerprint(input)
  if (fp) c.push(fp)
  if (t.searchReq) {
    c.push({ name: '联网搜索', target: '至少 1 个 google_search_call 步骤', actual: `${meta.searchSteps} 个`, pass: meta.searchSteps > 0 })
  }
  if (t.multiTurn) {
    c.push({
      name: '多轮编辑',
      target: '第一轮返回 id，第二轮出图',
      actual: `第一轮 id ${meta.prevId ? '有' : '无'} · 第二轮出图 ${imageCount} 张`,
      pass: !!meta.prevId && imageCount > 0,
    })
  }
  return c
}
