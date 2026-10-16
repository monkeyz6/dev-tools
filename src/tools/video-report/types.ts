export type VideoApiType = 'seedance' | 'google-omni' | 'minimax'

export const VIDEO_API_TYPE_LABEL: Record<VideoApiType, string> = {
  seedance: 'Seedance 火山原生',
  'google-omni': 'Google Omni',
  minimax: 'MiniMax-H3',
}

export function videoApiTypeOf(v: string | null | undefined): VideoApiType {
  if (v === 'google-omni') return 'google-omni'
  if (v === 'minimax') return 'minimax'
  return 'seedance'
}

export type VideoCaseKind =
  | 'material-group'
  | 'material-assets'
  | 't2v'
  | 'i2v'
  | 'i2v-frames'
  | 'ref-omni'
  | 'ref-images'
  | 'ref-image-audio'
  | 'ref-video-edit'
  | 'ref-video-extend'
  | 'ref-audio-only'
  | 'draft-final'
  | 'i2v-reject'

/** 期望结果：success 出片；reject 网关/审核应拒绝；unsupported 由模型能力表推断、运行时才会标上 */
export type VideoExpect = 'success' | 'reject' | 'unsupported'

/**
 * 只列 Seedance 2.x 官方请求参数表里的字段。`camera_fixed`、`seed`、`frames` 官方只列 1.0 pro，
 * 不进用例（camera_fixed 在 2.0 全系实测 400 `must be empty`）。
 */
export interface VideoCaseParams {
  resolution?: string
  ratio?: string
  /** -1 表示由模型在有效范围内自选，实际值看查询回显 */
  duration?: number
  generate_audio?: boolean
  watermark?: boolean
  /** 旧记录兼容：早期 480p 用例带过 seed */
  seed?: number
  return_last_frame?: boolean
  priority?: number
  safety_identifier?: string
  execution_expires_after?: number
  output_format?: string
  draft?: boolean
}

/** 用例要求的模型能力；不满足时按「预期不支持」运行 */
export type VideoCaseRequirement = 'seedance-2.5'

export interface VideoCaseDef {
  id: string
  name: string
  desc: string
  kind: VideoCaseKind
  params: VideoCaseParams
  expect: 'success' | 'reject'
  /** 用例自带提示词，覆盖左栏（编辑 / 延长靠提示词关键词判定任务类型） */
  prompt?: string
  requires?: VideoCaseRequirement
  /** MiniMax 参考图张数。同一左栏 URL 重复这么多次，不写进 Seedance 的 params。 */
  refImageCount?: number
}

export const VIDEO_MATERIAL_DEFS: VideoCaseDef[] = [
  { id: 'material-group', name: '素材组', desc: 'OpenAPI CreateAssetGroup，创建一个 AIGC 素材组', kind: 'material-group', params: {}, expect: 'success' },
  { id: 'material-assets', name: '素材登记', desc: '用当前左栏 URL 登记 Image / Video / Audio，并轮询到 Active', kind: 'material-assets', params: {}, expect: 'success' },
]

/** 480p 用例搭载的终端用户标识：固定、不含个人信息 */
export const VIDEO_SAFETY_IDENTIFIER = 'videotest-tool-user'

/** 分辨率为主轴各一条，其余参数分摊；时长全部 ≤ 7s（智能时长与编辑由模型定）；拒绝类排最后 */
export const VIDEO_CASE_DEFS: VideoCaseDef[] = [
  { id: 't2v-required', name: '文生 · 仅必填', desc: '只传 model + content[text]，看上游默认能否出片', kind: 't2v', params: {}, expect: 'success' },
  {
    id: 'res-480p', name: '480p · 9:16 · 4s', kind: 't2v', expect: 'success',
    desc: '480p 竖版 4s，generate_audio=false，附带 priority / safety_identifier / execution_expires_after；查询响应返回 priority 与 execution_expires_after 时比对，safety_identifier 官方不回显、只验被接受',
    params: { resolution: '480p', ratio: '9:16', duration: 4, generate_audio: false, priority: 5, safety_identifier: VIDEO_SAFETY_IDENTIFIER, execution_expires_after: 3600 },
  },
  {
    id: 'res-720p', name: '720p · 21:9 · 5s', kind: 't2v', expect: 'success',
    desc: '720p 超宽 5s，generate_audio=true，附带 watermark=true 与 return_last_frame=true（校验尾帧地址与尺寸）',
    params: { resolution: '720p', ratio: '21:9', duration: 5, generate_audio: true, watermark: true, return_last_frame: true },
  },
  {
    id: 'res-1080p', name: '1080p · 1:1 · 5s', kind: 't2v', expect: 'success',
    desc: '1080p 方形 5s，generate_audio=true；fast / mini 官方只到 720p，按「预期不支持」判定',
    params: { resolution: '1080p', ratio: '1:1', duration: 5, generate_audio: true },
  },
  {
    id: 'res-4k', name: '4K · 16:9 · 4s', kind: 't2v', expect: 'success',
    desc: '4K 横版 4s；仅 2.0 标准版官方支持，fast / mini / 2.5 按「预期不支持」判定',
    params: { resolution: '4k', ratio: '16:9', duration: 4 },
  },
  {
    id: 't2v-auto-duration', name: '智能时长 · 480p · 4:3', kind: 't2v', expect: 'success',
    desc: 'duration=-1 由模型自选时长：回显 duration 须在模型范围内（2.0 系列 4~15s、2.5 为 4~30s），成片时长与回显一致',
    params: { resolution: '480p', ratio: '4:3', duration: -1 },
  },
  {
    id: 'i2v-first', name: '首帧', kind: 'i2v', expect: 'success',
    desc: '只传首帧（role=first_frame），ratio=adaptive，720p 5s',
    params: { resolution: '720p', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'i2v-frames', name: '首尾帧', kind: 'i2v-frames', expect: 'success',
    desc: '首帧 + 尾帧，ratio=adaptive，720p 5s',
    params: { resolution: '720p', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'ref-omni', name: '多模态参考', kind: 'ref-omni', expect: 'success',
    desc: '参考图 + 参考视频 + 参考音频打在同一 content[]，ratio=adaptive，720p 5s',
    params: { resolution: '720p', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'ref-image-audio', name: '参考图 + 音频 · 480p', kind: 'ref-image-audio', expect: 'success',
    desc: '参考图 + 参考音频（2.0 系列音频须搭配图片或视频），480p 16:9 4s',
    params: { resolution: '480p', ratio: '16:9', duration: 4 },
  },
  {
    id: 'ref-video-edit', name: '视频编辑', kind: 'ref-video-edit', expect: 'success',
    desc: '只传参考视频，提示词含「编辑视频」，ratio=adaptive、duration=-1，480p；2.5 要求宽高比与时长跟参考视频一致，2.0 系列官方不保证、只记提示',
    prompt: '编辑视频：把视频中的茶杯改成红色的陶瓷杯，其余画面保持不变',
    params: { resolution: '480p', ratio: 'adaptive', duration: -1 },
  },
  {
    id: 'ref-video-extend', name: '视频延长', kind: 'ref-video-extend', expect: 'success',
    desc: '只传参考视频，提示词含「向后延长」，ratio=adaptive，480p 4s；2.5 要求宽高比与参考视频一致，2.0 系列只记提示',
    prompt: '向后延长视频：延续原视频的镜头运动和画面风格，续写接下来的内容',
    params: { resolution: '480p', ratio: 'adaptive', duration: 4 },
  },
  {
    id: 'ref-audio-only', name: '仅参考音频', kind: 'ref-audio-only', expect: 'success', requires: 'seedance-2.5',
    desc: '只传参考音频，480p 16:9 4s；仅 2.5 支持，2.0 系列官方要求音频搭配图片或视频，按「预期不支持」判定',
    params: { resolution: '480p', ratio: '16:9', duration: 4 },
  },
  {
    id: 'output-mov', name: '输出 mov · 480p · 4s', kind: 't2v', expect: 'success', requires: 'seedance-2.5',
    desc: 'output_format=mov（H.264 yuv444p + PCM）；官方查询响应不返回 output_format，本条只验被接受并出片，浏览器读不出 mov 元数据时只记提示；仅 2.5 支持',
    params: { resolution: '480p', ratio: '16:9', duration: 4, output_format: 'mov' },
  },
  {
    id: 'draft-480p', name: '样片 · 480p', kind: 't2v', expect: 'success', requires: 'seedance-2.5',
    desc: 'draft=true 生成 480p 样片（样片只能 480p）；成功后本轮「样片转正式」用它的任务 id；仅 2.5 支持',
    params: { resolution: '480p', ratio: '16:9', duration: 4, draft: true },
  },
  {
    id: 'draft-final', name: '样片转正式 · 1080p', kind: 'draft-final', expect: 'success', requires: 'seedance-2.5',
    desc: 'content 只放 draft_task.id，resolution=1080p（正式视频只能 1080p，提示词 / 素材 / 时长 / 比例禁止再传）；成片时长与比例须与样片一致，响应返回 draft_task_id 时须等于样片 id',
    params: { resolution: '1080p' },
  },
  {
    id: 'reject-500p', name: '拒绝 · 500p', kind: 't2v', expect: 'reject',
    desc: 'resolution=500p 非法档位，网关应 4xx 或任务 failed',
    params: { resolution: '500p' },
  },
  {
    id: 'reject-face', name: '拒绝 · 名人首帧', kind: 'i2v-reject', expect: 'reject',
    desc: '首帧用左栏「敏感人像」https 直链（不登记素材库），审核应拒绝',
    params: { resolution: '720p', ratio: 'adaptive', duration: 5 },
  },
]

export const VIDEO_RESOLUTION_HEIGHT: Record<string, number> = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 }

/**
 * 模型能力表（输出高度上限）：
 * - gemini-omni-flash-preview（非 1.1）：官方仅 720p
 * - Omni 1.1：360p / 720p / 1080p / 4K
 * - 2.0-fast / 2.0-mini：官方只到 720p
 * - 2.5（doubao/dreamina-seedance-2-5）：2026-08-17 起官方原生 1080p，仍无 4K
 * - 其余（2.0 标准版及自定义 id）：视为支持 4K
 */
export function videoModelMaxResolution(model: string): number {
  const id = model.trim()
  if (/gemini-omni|omni-flash|omni-1\.1/i.test(id)) {
    if (/1[.-]1/.test(id)) return 2160
    if (/omni-flash-preview|gemini-omni-flash-preview/i.test(id)) return 720
    return 2160
  }
  if (/-(fast|mini)(-|$)/i.test(id)) return 720
  if (videoIsSeedance25(id)) return 1080
  return 2160
}

/** doubao / dreamina-seedance-2-5（含日期快照）；样片、仅音频、mov 输出只有它支持 */
export function videoIsSeedance25(model: string): boolean {
  return /2-5|2\.5/i.test(model.trim())
}

export function videoModelMeetsRequirement(model: string, req: VideoCaseRequirement | undefined): boolean {
  if (!req) return true
  if (req === 'seedance-2.5') return videoIsSeedance25(model)
  return true
}

export const VIDEO_REQUIREMENT_LABEL: Record<VideoCaseRequirement, string> = {
  'seedance-2.5': '仅 Seedance 2.5 支持',
}

export function videoModelMaxResolutionLabel(model: string): string {
  const h = videoModelMaxResolution(model)
  if (h <= 720) return '720p'
  if (h <= 1080) return '1080p'
  return '4K'
}

export interface VideoCheck {
  name: string
  target: string | number
  actual: string | number
  pass: boolean
  info?: boolean
}

export interface VideoProbeMeta {
  w: number
  h: number
  duration: number
  /** 尽力检测：true/false 测到了，null 该浏览器测不出 */
  hasAudio?: boolean | null
}

export interface VideoPollTick {
  at: number
  status: string
  progress?: string
}

export interface VideoErrorDetail {
  code?: string
  message?: string
  type?: string
}

export interface VideoRecord {
  id: string
  runId?: string
  time: number
  caseName: string
  caseDesc: string
  channelName: string
  model: string
  prompt: string
  /** 缺省视为 seedance（旧记录） */
  apiType?: VideoApiType
  kind: VideoCaseKind
  caseId?: string
  /** 缺省视为 success（旧记录） */
  expect?: VideoExpect
  testMaterials: boolean
  targets: Record<string, string | number | boolean | null>
  skippedRoles: string[]
  status: number
  respHeaders: Record<string, string>
  reqId: string
  sentPreview: string
  ok: boolean
  error: string | null
  /** 查询/提交失败体拆出的 error.code / message / type */
  errorDetail?: VideoErrorDetail | null
  rawSnippet: string
  responseBodyComplete?: boolean
  taskId: string | null
  taskStatus: string | null
  pollCount: number
  videoUrl: string | null
  probe: VideoProbeMeta | null
  usage: Record<string, number> | null
  durationMs: number
  checks: VideoCheck[]
  pollLog: VideoPollTick[]
}

export function videoFmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
