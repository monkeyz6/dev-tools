export type VideoCaseKind =
  | 'material-group'
  | 'material-assets'
  | 't2v'
  | 'i2v-frames'
  | 'ref-omni'
  | 'i2v-reject'

/** 期望结果：success 出片；reject 网关/审核应拒绝；unsupported 由模型能力表推断、运行时才会标上 */
export type VideoExpect = 'success' | 'reject' | 'unsupported'

/** 只列 Seedance 2.x 官方请求参数表里的字段；`camera_fixed` 是 1.x 专属，2.0 全系 400，不进用例 */
export interface VideoCaseParams {
  resolution?: string
  ratio?: string
  duration?: number
  generate_audio?: boolean
  watermark?: boolean
  seed?: number
}

export interface VideoCaseDef {
  id: string
  name: string
  desc: string
  kind: VideoCaseKind
  params: VideoCaseParams
  expect: 'success' | 'reject'
}

export const VIDEO_MATERIAL_DEFS: VideoCaseDef[] = [
  { id: 'material-group', name: '素材组', desc: 'OpenAPI CreateAssetGroup，创建一个 AIGC 素材组', kind: 'material-group', params: {}, expect: 'success' },
  { id: 'material-assets', name: '素材登记', desc: '用当前左栏 URL 登记 Image / Video / Audio，并轮询到 Active', kind: 'material-assets', params: {}, expect: 'success' },
]

/** 分辨率为主轴各一条，其余参数分摊；时长全部 ≤ 7s；拒绝类排最后 */
export const VIDEO_CASE_DEFS: VideoCaseDef[] = [
  { id: 't2v-required', name: '文生 · 仅必填', desc: '只传 model + content[text]，看上游默认能否出片', kind: 't2v', params: {}, expect: 'success' },
  {
    id: 'res-480p', name: '480p · 9:16 · 4s', kind: 't2v', expect: 'success',
    desc: '480p 竖版 4s，generate_audio=false，附带 seed=42（校验响应回显的 seed）',
    params: { resolution: '480p', ratio: '9:16', duration: 4, generate_audio: false, seed: 42 },
  },
  {
    id: 'res-720p', name: '720p · 21:9 · 5s', kind: 't2v', expect: 'success',
    desc: '720p 超宽 5s，generate_audio=true，附带 watermark=true',
    params: { resolution: '720p', ratio: '21:9', duration: 5, generate_audio: true, watermark: true },
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

export const VIDEO_RESOLUTION_HEIGHT: Record<string, number> = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 }

/**
 * 模型能力表（输出高度上限）：
 * - 2.0-fast / 2.0-mini：官方只到 720p
 * - 2.5（doubao/dreamina-seedance-2-5）：2026-08-17 起官方原生 1080p，仍无 4K
 * - 其余（2.0 标准版及自定义 id）：视为支持 4K
 */
export function videoModelMaxResolution(model: string): number {
  const id = model.trim()
  if (/-(fast|mini)(-|$)/i.test(id)) return 720
  if (/2-5|2\.5/i.test(id)) return 1080
  return 2160
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

export interface VideoRecord {
  id: string
  runId?: string
  time: number
  caseName: string
  caseDesc: string
  channelName: string
  model: string
  prompt: string
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
