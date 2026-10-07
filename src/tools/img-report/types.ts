// 图片接口测试的记录模型。
// 单独成文件是为了让 summary.ts / ImgReportView.tsx 复用这些类型而不反向 import
// ImgApiTestTool.tsx（工具文件要 import 这两个模块的值，反向引用会成环）。

export type ImgApiType = 'openai' | 'grok' | 'gemini' | 'seedream' | 'volcanoArk'

export const IMG_API_LABEL: Record<ImgApiType, string> = {
  openai: 'OpenAI', grok: 'Grok', gemini: 'Gemini', seedream: 'Seedream', volcanoArk: 'ZeroFA /ark',
}

/** 成图落在哪个字段。历史会丢掉 dataUri，所以解析时就把这一档记在图片上。 */
export type ImgCarrier =
  | 'b64_json'
  | 'b64_prefixed'
  | 'inline'
  | 'inline_prefixed'
  | 'http-url'
  | 'data-url'
  | 'other-url'

export interface ImgRecImage {
  dataUri: string | null
  thumb: string | null
  url: string | null
  w: number
  h: number
  format: string
  carrier?: ImgCarrier
}

export interface ImgCheck { name: string; target: string | number; actual: string | number; pass: boolean; info?: boolean }

export interface ImgRecord {
  id: string
  /**
   * 批次标识：一次「全部运行 / 运行选中」是一批，之后的单条补跑归入当前批。
   * 旧记录没有这个字段，历史页按时间 + 渠道 + 模型兜底归组（见 batches.ts）。
   */
  runId?: string
  time: number
  caseName: string
  caseDesc: string
  channelName: string
  apiType: ImgApiType
  model: string
  prompt: string
  targets: Record<string, any>
  useRef: boolean
  refThumbs: (string | null)[]
  price: { usd: number; cny: number; tier: string; note: string; count: number } | null
  status: number
  respHeaders: Record<string, string>
  reqId: string
  sentPreview: string
  ok: boolean
  error: string | null
  rawSnippet: string
  responseBodyComplete?: boolean
  images: ImgRecImage[]
  returnedN: number
  durationMs: number
  checks: ImgCheck[]
  validationVersion?: number
}

export function imgFmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
