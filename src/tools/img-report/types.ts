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

/** 生成当时读到的 C2PA 结论。历史不留原图，所以只存这份摘要，旧记录没有该字段。 */
export type ImgC2paStatus = 'pending' | 'incomplete' | 'none' | 'valid' | 'invalid' | 'unreadable' | 'unavailable'
export type ImgC2paTrust = 'trusted' | 'untrusted' | 'unchecked' | 'na'
export type ImgC2paSource = 'openai' | 'azure' | 'google' | 'other' | 'unknown'

export interface ImgC2paResult {
  status: ImgC2paStatus
  trust: ImgC2paTrust
  source: ImgC2paSource
  /** 证书主体对应的名称（OpenAI / Microsoft / Google / 组织名）。标题在渲染时由 source + trust 算出，不直接用它。 */
  sourceLabel: string
  /** 签名证书主体组织（O）。c2pa-rs 把它放在 signature_info.issuer，不是签发 CA。 */
  issuer: string | null
  /** 签名证书主体 CN */
  signerName?: string | null
  /** 签发 CA 的 CN */
  issuerCa?: string | null
  certValidTo?: string | null
  /** 时间戳证书 CN 与是否链到信任列表 */
  tsaName?: string | null
  tsaTrusted?: boolean | null
  /** 资产哈希与签名时是否一致 */
  integrity?: 'match' | 'mismatch' | null
  softwareAgent: string | null
  claimGenerator: string | null
  /** 从动作里的 digitalSourceType 归纳，例如「AI 生成」 */
  actionLabel: string | null
  generatedAt: string | null
  /** 失败或未入列表时的状态码，便于对照原因 */
  codes: string[]
  note: string | null
}

export interface ImgRecImage {
  dataUri: string | null
  thumb: string | null
  url: string | null
  w: number
  h: number
  format: string
  /** 响应里自带的格式标签（mime_type / URL 后缀），与文件头字节不一致时才记 */
  formatLabel?: string
  carrier?: ImgCarrier
  c2pa?: ImgC2paResult
}

/** Interactions 响应里与「是否与官方一致」有关的字段 */
export interface ImgInteractionMeta {
  id: string | null
  status: string | null
  model: string | null
  /** usage.output_tokens_by_modality 里 image 模态的 tokens；缺失为 null */
  imageTokens: number | null
  /** thought 步骤数 + 带 thought 标记的图片块数 */
  thoughtSteps: number
  searchSteps: number
  /** 多轮编辑：第一轮返回的 interaction id */
  prevId?: string | null
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
  price: { usd: number; cny: number; tier: string; note: string; count: number; inputUsd?: number; inputCny?: number; inputCount?: number } | null
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
  /** 用例预期：unsupported = 官方未承诺支持，被 4xx 拒绝也算通过 */
  expect?: 'unsupported'
  interaction?: ImgInteractionMeta
}

export function imgFmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
