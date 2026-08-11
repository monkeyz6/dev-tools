/**
 * ============================================================================
 * MULTI-COST — 图片/视频模型计费（纯前端静态数据 + 计算 + JSON 识别）
 * ----------------------------------------------------------------------------
 * 定价数据在开发阶段对照各官方来源核实（来源 URL 见各产品注释）；部分档位
 * 官方未公开 => 占位数据，标注「需人工核实」。运行时纯本地计算，无网络请求。
 * 新增模型：在 PRODUCTS 里加一条 + 需要的话在 parsers 里加 JSON 适配器。
 * 计算与 UI 逻辑不硬编码任何价格。
 * ============================================================================
 */

/* ----------------------------- 类型定义 ----------------------------- */

export type Currency = "CNY" | "USD"
export type BillingMode = "token" | "per-image" | "per-second"

/** 单个价格档位（如分辨率档） */
export interface Tier {
  id: string
  label: string
  /** 「不含视频」/标准档单价 — 含义随模型而定 */
  priceNo: number | null
  /** 「含视频」/次级档单价 — 可选 */
  priceYes?: number | null
}

export interface ModelDef {
  id: string // 官方 API 模型代号（核实过）
  label: string
  desc?: string
  tiers: Tier[]
}

export interface RegionDef {
  id: string
  label: string
  currency: Currency
  models: ModelDef[]
}

export interface ProductDef {
  id: string
  label: string
  billing: BillingMode
  /** UI 展示的单位名词，如「百万 Token」「张」「秒」 */
  unitNoun: string
  regions: RegionDef[]
}

/* ==========================================================================
 * SEEDANCE（视频）— token 计费，国内 元/百万token & 海外 $/百万token
 * 数据与「Seedance 计费」工具（SeedanceTool.tsx）对齐（2026-07-31 起官方
 * 已公布 2.5 定价）：国内 2.0 / 2.0-fast / 2.0-mini / 2.5，
 * 海外 dreamina 2-0 / 2-0-fast / 2-0-mini / 2.5。
 * 来源：火山方舟 https://www.volcengine.com/docs/82379/1587798
 * ==========================================================================
 */
const SEEDANCE: ProductDef = {
  id: "seedance",
  label: "Seedance",
  billing: "token",
  unitNoun: "百万 Token",
  regions: [
    {
      id: "cn",
      label: "国内",
      currency: "CNY",
      models: [
        {
          id: "doubao-seedance-2-0",
          label: "doubao-seedance-2.0",
          desc: "价格根据输出分辨率及输入是否包含视频而定。",
          tiers: [
            { id: "hd", label: "HD · 480p/720p", priceNo: 46, priceYes: 28 },
            { id: "fhd", label: "FHD · 1080p", priceNo: 51, priceYes: 31 },
            { id: "uhd", label: "UHD · 4K", priceNo: 26, priceYes: 16 },
          ],
        },
        {
          id: "doubao-seedance-2-0-fast",
          label: "doubao-seedance-2.0-fast",
          desc: "价格根据输入是否包含视频而定，不支持 1080p 输出。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 37, priceYes: 22 }],
        },
        {
          id: "doubao-seedance-2-0-mini",
          label: "doubao-seedance-2.0-mini",
          desc: "价格根据输入是否包含视频而定，不支持 1080p 输出。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 23, priceYes: 14 }],
        },
        {
          id: "doubao-seedance-2-5",
          label: "doubao-seedance-2.5",
          desc: "2026-07-31 官方公布。当前最高支持 720p 输出。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 70, priceYes: 42 }],
        },
      ],
    },
    {
      id: "us",
      label: "海外",
      currency: "USD",
      models: [
        {
          id: "dreamina-seedance-2-0-260128",
          label: "dreamina-seedance-2-0-260128",
          desc: "价格根据输出分辨率及输入是否包含视频而定。",
          tiers: [
            { id: "hd", label: "HD · 480p/720p", priceNo: 7.0, priceYes: 4.3 },
            { id: "fhd", label: "FHD · 1080p", priceNo: 7.7, priceYes: 4.7 },
            { id: "uhd", label: "UHD · 4K", priceNo: 4.0, priceYes: 2.4 },
          ],
        },
        {
          id: "dreamina-seedance-2-0-fast-260128",
          label: "dreamina-seedance-2-0-fast-260128",
          desc: "价格根据输入是否包含视频而定，不支持 1080p 输出。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 5.6, priceYes: 3.3 }],
        },
        {
          id: "dreamina-seedance-2-0-mini-260615",
          label: "dreamina-seedance-2-0-mini-260615",
          desc: "价格根据输入是否包含视频而定，不支持 1080p 输出。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 3.5, priceYes: 2.1 }],
        },
        {
          id: "dreamina-seedance-2-5-260628",
          label: "dreamina-seedance-2-5-260628",
          desc: "2026-08 官方公布。当前最高支持 720p 输出，1080p/4K 暂未开放。",
          tiers: [{ id: "flat", label: "480p/720p", priceNo: 10.7, priceYes: 6.4 }],
        },
      ],
    },
  ],
}

/* ==========================================================================
 * GROK IMAGE — 按张计费（分辨率/质量档）
 * 从请求体即可确定（model + n + resolution）。
 * 来源：https://docs.x.ai/developers/models/grok-imagine-image
 *   grok-imagine-image: $0.02/张（1K 与 2K 同价）
 *   grok-imagine-image-quality: $0.05/张（1K）、$0.07/张（2K）
 * 输入图编辑附加费：+$0.002（标准）/ +$0.01（quality）每张输入图。
 * ==========================================================================
 */
const GROK_IMAGE: ProductDef = {
  id: "grok-image",
  label: "Grok Image",
  billing: "per-image",
  unitNoun: "张",
  regions: [
    {
      id: "us",
      label: "全球 (USD)",
      currency: "USD",
      models: [
        {
          id: "grok-imagine-image",
          label: "grok-imagine-image",
          desc: "标准 · $0.02/张 (1K 或 2K 同价) · 官网价",
          tiers: [
            { id: "1k", label: "1K (1024²)", priceNo: 0.02 },
            { id: "2k", label: "2K (2048²)", priceNo: 0.02 },
          ],
        },
        {
          id: "grok-imagine-image-quality",
          label: "grok-imagine-image-quality",
          desc: "高质量 · $0.05/张(1K) · $0.07/张(2K) · 官网价",
          tiers: [
            { id: "1k", label: "1K", priceNo: 0.05 },
            { id: "2k", label: "2K", priceNo: 0.07 },
          ],
        },
      ],
    },
  ],
}

/* ==========================================================================
 * GROK VIDEO — 按秒计费（分辨率档）
 * 从请求体即可确定（model + duration + metadata.resolution）。
 * 来源：https://docs.x.ai/developers/models/grok-imagine-video
 *   480p $0.05/s, 720p $0.07/s
 *   https://docs.x.ai/developers/models/grok-imagine-video-1.5-preview
 *   480p $0.08/s, 720p $0.14/s, 1080p $0.25/s
 * ==========================================================================
 */
const GROK_VIDEO: ProductDef = {
  id: "grok-video",
  label: "Grok Video",
  billing: "per-second",
  unitNoun: "秒",
  regions: [
    {
      id: "us",
      label: "全球 (USD)",
      currency: "USD",
      models: [
        {
          id: "grok-imagine-video",
          label: "grok-imagine-video",
          desc: "基础版 · $0.05/s(480p) · $0.07/s(720p) · 官网价",
          tiers: [
            { id: "480p", label: "480p", priceNo: 0.05 },
            { id: "720p", label: "720p", priceNo: 0.07 },
          ],
        },
        {
          id: "grok-imagine-video-1-5-preview",
          label: "grok-imagine-video-1.5-preview",
          desc: "1.5版 · $0.08/s(480p) · $0.14/s(720p) · $0.25/s(1080p) · 官网价",
          tiers: [
            { id: "480p", label: "480p", priceNo: 0.08 },
            { id: "720p", label: "720p", priceNo: 0.14 },
            { id: "1080p", label: "1080p", priceNo: 0.25 },
          ],
        },
      ],
    },
  ],
}

/* ==========================================================================
 * GPT IMAGE — token 计费（文本/图片输入 + 图片输出）
 * 从响应体 usage 提取。
 * 来源（OpenAI 官方）：
 *   https://openai.com/index/image-generation-api/
 *   gpt-image-1: text $5 / img-in $10 / out $40（$/百万token）
 *   gpt-image-1-mini: text $2 / img-in $2.5 / out $8
 * gpt-image-2 逐档 token 单价官方未完全公开 => output 占位($40)，需人工核实。
 * ==========================================================================
 */
const GPT_IMAGE: ProductDef = {
  id: "gpt-image",
  label: "GPT Image",
  billing: "token",
  unitNoun: "百万 Token",
  regions: [
    {
      id: "us",
      label: "全球 (USD)",
      currency: "USD",
      models: [
        {
          id: "gpt-image-1",
          label: "gpt-image-1",
          desc: "text-in $5 · image-in $10 · image-out $40 /百万token · 官网价",
          tiers: [
            { id: "text_in", label: "文本输入 token", priceNo: 5 },
            { id: "image_in", label: "图片输入 token", priceNo: 10 },
            { id: "image_out", label: "图片输出 token", priceNo: 40 },
          ],
        },
        {
          id: "gpt-image-1-mini",
          label: "gpt-image-1-mini",
          desc: "text-in $2 · image-in $2.5 · image-out $8 /百万token · 官网价",
          tiers: [
            { id: "text_in", label: "文本输入 token", priceNo: 2 },
            { id: "image_in", label: "图片输入 token", priceNo: 2.5 },
            { id: "image_out", label: "图片输出 token", priceNo: 8 },
          ],
        },
        {
          id: "gpt-image-2",
          label: "gpt-image-2",
          desc: "占位 · 沿用旗舰档 text $5 / img-in $10 / out $40 · 需人工核实",
          tiers: [
            { id: "text_in", label: "文本输入 token", priceNo: 5 },
            { id: "image_in", label: "图片输入 token", priceNo: 10 },
            { id: "image_out", label: "图片输出 token", priceNo: 40 },
          ],
        },
      ],
    },
  ],
}

/* ==========================================================================
 * GEMINI IMAGE — token 计费（输入 + 文本输出 + 图片输出）
 * 从响应体 usageMetadata 提取。
 * 来源（Google 官方）：https://ai.google.dev/gemini-api/docs/pricing
 *   Gemini 3 Pro Image（Nano Banana Pro）:
 *     input $2 (text/image) · text-out $12 · image-out $120 /百万token
 *   Gemini 3.1 Flash Image（Nano Banana 2）:
 *     input $0.50 · text-out $3 · image-out $60 /百万token
 *   Gemini 2.5 Flash Image（Nano Banana）:
 *     input $0.30 · text-out $2.5 · image-out $30 /百万token
 * ==========================================================================
 */
const GEMINI_IMAGE: ProductDef = {
  id: "gemini-image",
  label: "Gemini Image",
  billing: "token",
  unitNoun: "百万 Token",
  regions: [
    {
      id: "us",
      label: "全球 (USD)",
      currency: "USD",
      models: [
        {
          id: "gemini-3-pro-image-preview",
          label: "gemini-3-pro-image (Nano Banana Pro)",
          desc: "input $2 · text-out $12 · image-out $120 /百万token · 官网价",
          tiers: [
            { id: "input", label: "输入 token (text/image)", priceNo: 2 },
            { id: "text_out", label: "文本输出 token", priceNo: 12 },
            { id: "image_out", label: "图片输出 token", priceNo: 120 },
          ],
        },
        {
          id: "gemini-3-1-flash-image-preview",
          label: "gemini-3.1-flash-image (Nano Banana 2)",
          desc: "input $0.50 · text-out $3 · image-out $60 /百万token · 官网价",
          tiers: [
            { id: "input", label: "输入 token (text/image)", priceNo: 0.5 },
            { id: "text_out", label: "文本输出 token", priceNo: 3 },
            { id: "image_out", label: "图片输出 token", priceNo: 60 },
          ],
        },
        {
          id: "gemini-2-5-flash-image",
          label: "gemini-2.5-flash-image (Nano Banana)",
          desc: "image-out $30 /百万token (≈$0.039/张) · 官网价",
          tiers: [
            { id: "input", label: "输入 token", priceNo: 0.3 },
            { id: "text_out", label: "文本输出 token", priceNo: 2.5 },
            { id: "image_out", label: "图片输出 token", priceNo: 30 },
          ],
        },
      ],
    },
  ],
}

export const PRODUCTS: ProductDef[] = [
  SEEDANCE,
  GROK_IMAGE,
  GROK_VIDEO,
  GPT_IMAGE,
  GEMINI_IMAGE,
]

export function getProduct(id: string): ProductDef | undefined {
  return PRODUCTS.find(p => p.id === id)
}

export const FX_STORAGE_KEY = "ai-cost-fx-rate"

/* ==========================================================================
 * 计算与格式化 — 纯函数，价格只来自 config，用量只来自表单/parser
 * ==========================================================================
 */

export function num(v: string | number, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/** 金额：最多 4 位小数、千分位、去尾零 */
export function fmtMoney(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

/** 单价：整数原样展示，否则 2 位小数 */
export function fmtUnit(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—"
  if (Number.isInteger(v)) return v.toLocaleString("en-US")
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const CUR_SYMBOL: Record<Currency, string> = { CNY: "¥", USD: "$" }

export interface DualPrice {
  cny: number
  usd: number
}

/** 以区域基准货币计价，同时换算人民币与美元 */
export function dual(amountBase: number, base: Currency, rate: number): DualPrice {
  return {
    cny: base === "CNY" ? amountBase : amountBase * (rate || 1),
    usd: base === "USD" ? amountBase : amountBase / (rate || 1),
  }
}

/* ==========================================================================
 * JSON 解析适配器 — 每个产品一个适配器
 * ----------------------------------------------------------------------------
 * 检查解析后的 JSON 对象（请求体或响应体、厂商原生格式或 new-api/网关格式），
 * 命中后返回 ParseResult：识别出的产品/模型 + 提取的计费参数（自动填充表单）。
 * 与价格配置、计算逻辑完全分离，方便新增格式/模型。
 * ==========================================================================
 */

export type SourceType = "request" | "response"

export interface SeedanceFill {
  productId: "seedance"
  modelId?: string
  resolution?: string // 480p/720p/1080p/4k
  tokens?: number
  hasVideo?: boolean
  duration?: number
}
export interface GrokImageFill {
  productId: "grok-image"
  modelId?: string
  resolution?: string // 1k/2k
  n?: number
}
export interface GrokVideoFill {
  productId: "grok-video"
  modelId?: string
  resolution?: string // 480p/720p/1080p
  duration?: number
}
export interface GptImageFill {
  productId: "gpt-image"
  modelId?: string
  textInputTokens?: number
  imageInputTokens?: number
  outputTokens?: number
}
export interface GeminiImageFill {
  productId: "gemini-image"
  modelId?: string
  inputTokens?: number
  textOutputTokens?: number
  imageOutputTokens?: number
}

export type Fill =
  | SeedanceFill
  | GrokImageFill
  | GrokVideoFill
  | GptImageFill
  | GeminiImageFill

export interface ParseResult {
  productId: string
  modelRaw: string // JSON 中出现的原始 model 字符串
  source: SourceType
  fill: Fill
  summary: string // 人类可读的提取摘要
  error?: string // 缺少必填字段时设置
}

/* ------------------------- helpers ------------------------- */

/** BFS 在对象树任意位置查找第一个非空的目标 key */
function deepFind(obj: unknown, keys: string[]): unknown {
  if (obj == null || typeof obj !== "object") return undefined
  const queue: unknown[] = [obj]
  while (queue.length) {
    const cur = queue.shift()
    if (cur && typeof cur === "object") {
      const rec = cur as Record<string, unknown>
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(rec, k) && rec[k] != null) {
          return rec[k]
        }
      }
      for (const v of Object.values(rec)) {
        if (v && typeof v === "object") queue.push(v)
      }
    }
  }
  return undefined
}

/** 查找模型字符串（含 new-api 网关字段） */
function findModel(obj: unknown): string {
  const candidates = ["origin_model_name", "model", "model_name"]
  const m = deepFind(obj, candidates)
  return typeof m === "string" ? m : ""
}

/** 分辨率归一化：'1920x1080' -> '1080p'，'2k'/'1k' 等 */
function normRes(r: unknown): string | undefined {
  if (r == null) return undefined
  const s = String(r).toLowerCase().replace(/\s/g, "")
  if (/^\d+x\d+$/.test(s)) {
    const [w] = s.split("x").map(Number)
    if (w >= 3840) return "4k"
    if (w >= 1920) return "1080p"
    if (w >= 1280) return "720p"
    return "480p"
  }
  if (s.includes("4k") || s === "2160p") return "4k"
  if (s.includes("1080")) return "1080p"
  if (s.includes("720")) return "720p"
  if (s.includes("480")) return "480p"
  if (s === "2k") return "2k"
  if (s === "1k") return "1k"
  return s
}

/* ------------------------- SEEDANCE ------------------------- */
// token 计费 -> 优先用响应体 usage；请求体只读元信息。
function parseSeedance(obj: unknown): ParseResult | null {
  const model = findModel(obj)
  if (!/seedance/i.test(model) && !/seedance/i.test(JSON.stringify(obj))) {
    return null
  }
  const usage = deepFind(obj, ["usage"]) as Record<string, unknown> | undefined
  const totalTokens = usage
    ? Number(usage.total_tokens ?? usage.completion_tokens ?? 0)
    : undefined
  const meta = (deepFind(obj, ["metadata"]) as Record<string, unknown>) || {}
  const resolution = normRes(deepFind(obj, ["resolution"]) ?? meta.resolution)
  const duration =
    Number(deepFind(obj, ["duration"]) ?? meta.duration ?? 0) || undefined

  const source: SourceType = totalTokens ? "response" : "request"
  const modelId = model.replace(/\./g, "-")

  const fill: SeedanceFill = {
    productId: "seedance",
    modelId,
    resolution,
    tokens: totalTokens,
    duration,
  }

  if (source === "response" && totalTokens) {
    return {
      productId: "seedance",
      modelRaw: model,
      source,
      fill,
      summary: `响应体 · 模型 ${model} · 用量 ${totalTokens.toLocaleString()} tokens${
        resolution ? " · " + resolution : ""
      }`,
    }
  }
  return {
    productId: "seedance",
    modelRaw: model,
    source: "request",
    fill,
    summary: `请求体 · 模型 ${model}${resolution ? " · " + resolution : ""}${
      duration ? " · " + duration + "s" : ""
    }`,
    error:
      "Seedance 按 Token 计费，需从响应体读取 usage.total_tokens；当前为请求体，缺少用量。请粘贴任务响应体。",
  }
}

/* ------------------------- GROK IMAGE ------------------------- */
// 按张计费 -> 请求体即可确定。
function parseGrokImage(obj: unknown): ParseResult | null {
  const model = findModel(obj)
  if (!/grok-imagine-image/i.test(model)) return null
  const modelId = /quality/i.test(model)
    ? "grok-imagine-image-quality"
    : "grok-imagine-image"
  const n = Number(deepFind(obj, ["n"]) ?? 1) || 1
  const resolution = normRes(deepFind(obj, ["resolution"])) ?? "1k"
  const fill: GrokImageFill = { productId: "grok-image", modelId, resolution, n }
  return {
    productId: "grok-image",
    modelRaw: model,
    source: "request",
    fill,
    summary: `请求体 · 模型 ${model} · ${n} 张 · ${resolution.toUpperCase()}`,
  }
}

/* ------------------------- GROK VIDEO ------------------------- */
// 按秒计费 -> 请求体即可确定（model + duration + resolution）。
function parseGrokVideo(obj: unknown): ParseResult | null {
  const model = findModel(obj)
  if (!/grok-imagine-video/i.test(model)) return null
  const modelId = /1\.5/i.test(model)
    ? "grok-imagine-video-1-5-preview"
    : "grok-imagine-video"
  const meta = (deepFind(obj, ["metadata"]) as Record<string, unknown>) || {}
  const duration = Number(deepFind(obj, ["duration"]) ?? meta.duration ?? 0)
  const resolution =
    normRes(deepFind(obj, ["resolution"]) ?? meta.resolution) ?? "480p"
  const fill: GrokVideoFill = {
    productId: "grok-video",
    modelId,
    resolution,
    duration: duration || undefined,
  }
  if (!duration) {
    return {
      productId: "grok-video",
      modelRaw: model,
      source: "request",
      fill,
      summary: `请求体 · 模型 ${model} · ${resolution}`,
      error: "缺少 duration（秒）字段，无法按秒计费。请在请求体中包含顶层 duration。",
    }
  }
  return {
    productId: "grok-video",
    modelRaw: model,
    source: "request",
    fill,
    summary: `请求体 · 模型 ${model} · ${duration}s · ${resolution}`,
  }
}

/* ------------------------- GPT IMAGE ------------------------- */
// token 计费 -> 从响应体 usage 提取。
function parseGptImage(obj: unknown): ParseResult | null {
  const model = findModel(obj)
  const looksGpt = /gpt-image/i.test(model)
  const usage = deepFind(obj, ["usage"]) as Record<string, unknown> | undefined
  const hasGptUsage =
    usage &&
    (usage.input_tokens != null || usage.output_tokens != null) &&
    (usage.input_tokens_details != null || looksGpt)
  if (!looksGpt && !hasGptUsage) return null

  const modelId = model
    ? model.includes("mini")
      ? "gpt-image-1-mini"
      : model.includes("2")
        ? "gpt-image-2"
        : "gpt-image-1"
    : "gpt-image-1"

  if (!usage || (usage.input_tokens == null && usage.output_tokens == null)) {
    return {
      productId: "gpt-image",
      modelRaw: model || "gpt-image",
      source: "request",
      fill: { productId: "gpt-image", modelId },
      summary: `请求体 · 模型 ${model || "gpt-image"}`,
      error:
        "GPT Image 按 Token 计费，需响应体的 usage.input_tokens / output_tokens。请粘贴响应体。",
    }
  }
  const details = (usage.input_tokens_details as Record<string, unknown>) || {}
  const textInputTokens = Number(details.text_tokens ?? usage.input_tokens ?? 0)
  const imageInputTokens = Number(details.image_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? 0)
  const fill: GptImageFill = {
    productId: "gpt-image",
    modelId,
    textInputTokens,
    imageInputTokens,
    outputTokens,
  }
  return {
    productId: "gpt-image",
    modelRaw: model || "gpt-image",
    source: "response",
    fill,
    summary: `响应体 · 模型 ${model || modelId} · 输入 ${(
      textInputTokens + imageInputTokens
    ).toLocaleString()} (文${textInputTokens}/图${imageInputTokens}) · 输出 ${outputTokens.toLocaleString()} tokens`,
  }
}

/* ------------------------- GEMINI IMAGE ------------------------- */
// token 计费 -> 从响应体 usageMetadata 提取。
function parseGeminiImage(obj: unknown): ParseResult | null {
  const model = findModel(obj)
  const looksGemini =
    /gemini.*image/i.test(model) || /nano.?banana/i.test(JSON.stringify(obj))
  const um = deepFind(obj, ["usageMetadata"]) as Record<string, unknown> | undefined
  if (!looksGemini && !um) return null
  if (!/image/i.test(model) && !um) return null

  const modelId = model
    ? model.includes("3-pro") || model.includes("3-pro-image")
      ? "gemini-3-pro-image-preview"
      : model.includes("2.5") || model.includes("2-5")
        ? "gemini-2-5-flash-image"
        : "gemini-3-1-flash-image-preview"
    : "gemini-3-pro-image-preview"

  if (!um) {
    return {
      productId: "gemini-image",
      modelRaw: model || "gemini-image",
      source: "request",
      fill: { productId: "gemini-image", modelId },
      summary: `请求体 · 模型 ${model || "gemini-image"}`,
      error:
        "Gemini Image 按 Token 计费，需响应体的 usageMetadata。请粘贴响应体。",
    }
  }
  const promptTok = Number(um.promptTokenCount ?? 0)
  const candTok = Number(um.candidatesTokenCount ?? 0)
  // Gemini 把图片输出 token 也计入 candidatesTokenCount；有明细时优先用明细，
  // 否则把 candidates 整体当作图片输出。
  const candDetails = um.candidatesTokensDetails as
    | { modality?: string; tokenCount?: number }[]
    | undefined
  const imageOut = Number(
    (Array.isArray(candDetails) &&
      candDetails.find(d => /image/i.test(d.modality ?? ""))?.tokenCount) ??
      candTok
  )
  const fill: GeminiImageFill = {
    productId: "gemini-image",
    modelId,
    inputTokens: promptTok,
    textOutputTokens: Math.max(candTok - imageOut, 0),
    imageOutputTokens: imageOut,
  }
  return {
    productId: "gemini-image",
    modelRaw: model || modelId,
    source: "response",
    fill,
    summary: `响应体 · 模型 ${model || modelId} · 输入 ${promptTok.toLocaleString()} · 输出 ${candTok.toLocaleString()} tokens (图 ${imageOut.toLocaleString()})`,
  }
}

/* ------------------------- registry ------------------------- */

const ADAPTERS: ((o: unknown) => ParseResult | null)[] = [
  parseGrokImage, // 模型前缀特异性高的放前面
  parseGrokVideo,
  parseSeedance,
  parseGptImage,
  parseGeminiImage,
]

export interface RecognizeOutcome {
  ok: boolean
  result?: ParseResult
  message?: string
}

/** 主入口：解析原始文本并分发到对应适配器 */
export function recognizeJson(raw: string): RecognizeOutcome {
  const text = raw.trim()
  if (!text) return { ok: false, message: "请输入 JSON 内容。" }
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return { ok: false, message: "JSON 解析失败：请检查格式是否正确。" }
  }
  for (const adapter of ADAPTERS) {
    const r = adapter(obj)
    if (r) return { ok: true, result: r }
  }
  const model = findModel(obj)
  return {
    ok: false,
    message: model
      ? `无法识别产品：未匹配已知模型规则（model="${model}"）。`
      : "无法识别：未找到 model / origin_model_name 等关键字段。",
  }
}
