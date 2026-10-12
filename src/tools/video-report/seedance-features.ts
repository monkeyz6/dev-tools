import type { VideoCaseKind, VideoCheck, VideoProbeMeta } from './types.ts'
import { videoIsSeedance25 } from './types.ts'

export type VideoMediaRole = 'firstFrame' | 'lastFrame' | 'refImage' | 'refVideo' | 'refAudio'

export interface VideoRoleSpec {
  key: VideoMediaRole
  type: 'image_url' | 'video_url' | 'audio_url'
  role: string
}

const FIRST_FRAME: VideoRoleSpec = { key: 'firstFrame', type: 'image_url', role: 'first_frame' }
const LAST_FRAME: VideoRoleSpec = { key: 'lastFrame', type: 'image_url', role: 'last_frame' }
const REF_IMAGE: VideoRoleSpec = { key: 'refImage', type: 'image_url', role: 'reference_image' }
const REF_VIDEO: VideoRoleSpec = { key: 'refVideo', type: 'video_url', role: 'reference_video' }
const REF_AUDIO: VideoRoleSpec = { key: 'refAudio', type: 'audio_url', role: 'reference_audio' }

/** 各用例类型要打进 content[] 的左栏素材（首帧 / 首尾帧 / 全模态参考为官方三种互斥场景）；素材全空时不发送，只剩文本会退化成文生 */
export const VIDEO_KIND_ROLES: Partial<Record<VideoCaseKind, VideoRoleSpec[]>> = {
  'i2v': [FIRST_FRAME],
  'i2v-frames': [FIRST_FRAME, LAST_FRAME],
  'ref-omni': [REF_IMAGE, REF_VIDEO, REF_AUDIO],
  'ref-image-audio': [REF_IMAGE, REF_AUDIO],
  'ref-video-edit': [REF_VIDEO],
  'ref-video-extend': [REF_VIDEO],
  'ref-audio-only': [REF_AUDIO],
}

export const VIDEO_DRAFT_ID_PLACEHOLDER = '{{DRAFT_TASK_ID}}'

/** 本轮「样片 · 480p」成功后留下的信息，供「样片转正式」引用并核对参数复用 */
export interface VideoDraftRef {
  taskId: string
  w?: number
  h?: number
  duration?: number
}

/** 样片转正式：content 只放 draft_task，提示词 / 素材都由模型复用，官方禁止再传 */
export function videoDraftFinalContent(draftTaskId: string | null): Record<string, unknown>[] {
  return [{ type: 'draft_task', draft_task: { id: draftTaskId || VIDEO_DRAFT_ID_PLACEHOLDER } }]
}

/** duration=-1 时模型自选时长的有效范围（官方参数表） */
export function videoAutoDurationRange(model: string): [number, number] {
  return videoIsSeedance25(model) ? [4, 30] : [4, 15]
}

/**
 * 查询任务响应里官方列出、可用来核对请求的字段（BytePlus「Retrieve a video generation task」）。
 * safety_identifier / output_format 不在响应里；draft 只有 1.5 pro 返回，2.5 不核对。
 */
export interface VideoFeatureEcho {
  priority?: number
  execution_expires_after?: number
  lastFrameUrl?: string
  /** 样片转正式时返回的样片任务 id */
  draftTaskId?: string
}

function videoEchoSources(json: any): any[] {
  const out: any[] = []
  if (json?.data?.data && typeof json.data.data === 'object') out.push(json.data.data)
  if (json?.data && typeof json.data === 'object') out.push(json.data)
  if (json && typeof json === 'object') out.push(json)
  return out
}

function videoPick<T>(sources: any[], read: (s: any) => T | undefined): T | undefined {
  for (const s of sources) {
    const v = read(s)
    if (v !== undefined) return v
  }
  return undefined
}

function videoNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

/**
 * 查询响应里的基础回显（分辨率 / 比例 / 时长 / 音频 / seed）。
 * 与功能回显同样按 data.data → data → 根 逐字段取：new-api 常见一层包装 { data: { content, duration } }
 * 也要读得到，智能时长的判定全靠回显 duration。
 */
export function videoExtractEcho(json: any): { resolution?: string; ratio?: string; duration?: number; generate_audio?: boolean; seed?: number } {
  const src = videoEchoSources(json)
  const str = (v: unknown) => (v != null && v !== '' ? String(v) : undefined)
  return {
    resolution: videoPick(src, s => str(s?.resolution)),
    ratio: videoPick(src, s => str(s?.ratio)),
    duration: videoPick(src, s => videoNum(s?.duration)),
    generate_audio: videoPick(src, s => (typeof s?.generate_audio === 'boolean' ? s.generate_audio : undefined)),
    seed: videoPick(src, s => videoNum(s?.seed)),
  }
}

/** 查询响应里本次新增要比对的回显字段（官方查询任务 API 的响应参数） */
export function videoExtractFeatureEcho(json: any): VideoFeatureEcho {
  const src = videoEchoSources(json)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return {
    priority: videoPick(src, s => videoNum(s?.priority)),
    execution_expires_after: videoPick(src, s => videoNum(s?.execution_expires_after)),
    lastFrameUrl: videoPick(src, s => str(s?.content?.last_frame_url)),
    draftTaskId: videoPick(src, s => str(s?.draft_task_id)),
  }
}

type VideoTargets = Record<string, string | number | boolean | null>

/** 回显写进 targets 的键：与请求参数分开存，旧记录没有这些键就不出对应校验 */
export function videoApplyFeatureEcho(targets: VideoTargets, echo: VideoFeatureEcho) {
  if (echo.priority !== undefined) targets.echoPriority = echo.priority
  if (echo.execution_expires_after !== undefined) targets.echoExpiresAfter = echo.execution_expires_after
  if (echo.lastFrameUrl !== undefined) targets.lastFrameUrl = echo.lastFrameUrl
  if (echo.draftTaskId !== undefined) targets.echoDraftTaskId = echo.draftTaskId
}

const VIDEO_ECHO_FIELDS: Array<{ param: string; echo: string }> = [
  { param: 'priority', echo: 'echoPriority' },
  { param: 'execution_expires_after', echo: 'echoExpiresAfter' },
]

const VIDEO_RATIO_TOL = 0.05
const VIDEO_DURATION_TOL = 1

function videoRatioDevPct(w: number, h: number, refW: number, refH: number): number {
  const a = w / h
  const b = refW / refH
  return Math.round((Math.abs(a - b) / b) * 1000) / 10
}

export interface VideoFeatureCheckInput {
  model: string
  kind: VideoCaseKind
  targets: VideoTargets
  probe: VideoProbeMeta | null
}

/**
 * 任务成功后追加的功能校验：参数回显、尾帧、样片复用、编辑 / 延长与参考视频一致。
 * 请求里没写对应字段的不出校验项，所以旧记录与其它用例不受影响。
 */
export function videoFeatureChecks({ model, kind, targets, probe }: VideoFeatureCheckInput): VideoCheck[] {
  const checks: VideoCheck[] = []

  for (const f of VIDEO_ECHO_FIELDS) {
    const want = targets[f.param]
    if (want == null) continue
    const got = targets[f.echo]
    const name = `${f.param} 回显`
    if (got == null) checks.push({ name, target: String(want), actual: '响应未回显', pass: true, info: true })
    else checks.push({ name, target: String(want), actual: String(got), pass: got === want })
  }

  if (targets.return_last_frame === true) {
    const url = typeof targets.lastFrameUrl === 'string' ? targets.lastFrameUrl : ''
    checks.push({ name: '尾帧', target: 'content.last_frame_url', actual: url || '无', pass: !!url })
    const lw = targets.lastFrameW
    const lh = targets.lastFrameH
    if (url && typeof lw === 'number' && typeof lh === 'number' && probe) {
      const same = Math.abs(lw - probe.w) <= 2 && Math.abs(lh - probe.h) <= 2
      checks.push({ name: '尾帧尺寸', target: `与成片一致 ${probe.w}×${probe.h}`, actual: `${lw}×${lh}`, pass: same })
    } else if (url && targets.lastFrameProbe === 'failed') {
      checks.push({ name: '尾帧尺寸', target: '与成片一致', actual: '尾帧图片读取失败（可能已过期）', pass: true, info: true })
    }
  }

  if (kind === 'draft-final' && typeof targets.draftTaskId === 'string') {
    const got = targets.echoDraftTaskId
    if (typeof got === 'string') checks.push({ name: '样片复用（任务 id）', target: `draft_task_id = ${targets.draftTaskId}`, actual: got, pass: got === targets.draftTaskId })
    else checks.push({ name: '样片复用（任务 id）', target: `draft_task_id = ${targets.draftTaskId}`, actual: '响应未返回 draft_task_id', pass: true, info: true })
  }

  if (kind === 'draft-final' && probe) {
    const dd = targets.draftDuration
    if (typeof dd === 'number' && dd > 0) {
      checks.push({ name: '样片复用（时长）', target: `与样片一致 ${dd.toFixed(2)}s ±${VIDEO_DURATION_TOL}s`, actual: `${probe.duration.toFixed(2)}s`, pass: Math.abs(probe.duration - dd) <= VIDEO_DURATION_TOL })
    }
    const dw = targets.draftW
    const dh = targets.draftH
    if (typeof dw === 'number' && typeof dh === 'number' && dw > 0 && dh > 0) {
      const dev = videoRatioDevPct(probe.w, probe.h, dw, dh)
      checks.push({ name: '样片复用（宽高比）', target: `与样片一致 ${dw}×${dh} ±${VIDEO_RATIO_TOL * 100}%`, actual: `${probe.w}×${probe.h}（偏差 ${dev}%）`, pass: dev <= VIDEO_RATIO_TOL * 100 })
    }
  }

  if ((kind === 'ref-video-edit' || kind === 'ref-video-extend') && probe) {
    // 2.5 官方写明编辑 / 延长保持所选视频的宽高比（编辑还保持时长，可能短约 0.4s）；
    // 2.0 系列编辑 / 延长可指定比例、-1 时在 [4,15] 内自选时长，不保证与原视频一致，只记提示
    const strict = videoIsSeedance25(model)
    const rw = targets.refVideoW
    const rh = targets.refVideoH
    if (typeof rw === 'number' && typeof rh === 'number' && rw > 0 && rh > 0) {
      const dev = videoRatioDevPct(probe.w, probe.h, rw, rh)
      const pass = dev <= VIDEO_RATIO_TOL * 100
      checks.push({
        name: '宽高比', target: `与参考视频一致 ${rw}×${rh} ±${VIDEO_RATIO_TOL * 100}%`,
        actual: `${probe.w}×${probe.h}（偏差 ${dev}%）${strict ? '' : ' · 2.0 系列不保证，仅提示'}`,
        pass: strict ? pass : true, info: strict ? undefined : true,
      })
    } else if (targets.refVideoProbe === 'failed') {
      checks.push({ name: '宽高比', target: '与参考视频一致', actual: '参考视频元数据读取失败，无法比对', pass: true, info: true })
    }
    const rd = targets.refVideoDuration
    if (kind === 'ref-video-edit' && typeof rd === 'number' && rd > 0) {
      const pass = Math.abs(probe.duration - rd) <= VIDEO_DURATION_TOL
      checks.push({
        name: '时长', target: `与参考视频一致 ${rd.toFixed(2)}s ±${VIDEO_DURATION_TOL}s`,
        actual: `${probe.duration.toFixed(2)}s${strict ? '' : ' · 2.0 系列不保证，仅提示'}`,
        pass: strict ? pass : true, info: strict ? undefined : true,
      })
    }
  }

  return checks
}

/** duration=-1：回显 duration 须落在模型范围内，成片时长再与回显比对（回显是整数秒，向下取整） */
export function videoAutoDurationChecks(model: string, targets: VideoTargets, probe: VideoProbeMeta | null): VideoCheck[] {
  const [lo, hi] = videoAutoDurationRange(model)
  const echo = targets.echoDuration
  if (typeof echo !== 'number') {
    return [{ name: '回显时长', target: `${lo}~${hi}s`, actual: '响应未回显 duration', pass: true, info: true }]
  }
  const checks: VideoCheck[] = [{ name: '回显时长', target: `${lo}~${hi}s（duration=-1 由模型自选）`, actual: `${echo}s`, pass: echo >= lo && echo <= hi }]
  if (probe) {
    checks.push({ name: '时长', target: `回显 ${echo}s ±${VIDEO_DURATION_TOL}s`, actual: `${probe.duration.toFixed(2)}s`, pass: Math.abs(probe.duration - echo) <= VIDEO_DURATION_TOL })
  }
  return checks
}
