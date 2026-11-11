import type { VideoCaseDef, VideoCheck, VideoExpect, VideoRecord } from './types.ts'
import { vidAspectRatio, vidCheckRatio, vidCheckResolution } from '../../shared/video-meta.ts'

/**
 * 可灵 4.0 / 4.0 Flash 的新官方路径。模型在 URL 末段，不走旧的 /v1/videos/text2video。
 * 网关根另见 videoKlingUrl，这里不要带 /kling。
 */
export const KLING_DEFAULT_MODEL = 'kling-4.0'

export const KLING_MODEL_OPTIONS = ['kling-4.0', 'kling-4.0-flash'].map(m => ({ value: m, label: m }))

const KLING_DURATION_TOL = 1
const KLING_RATIO_TOL = 0.05
const KLING_RESOLUTION_TOL = 0.15

/** 精确 Flash 才标预期不支持。别的字符串按 4.0 正向计分。 */
const KLING_FLASH_UNSUPPORTED = new Set(['kling:t2v-1080p', 'kling:i2v-frames', 'kling:t2v-21s'])

export function klingQueryEndpoint(taskId: string): string {
  return `/tasks?task_ids=${encodeURIComponent(taskId)}`
}

/** 整段 baseUrl 里出现 oinone 或 ainowork（忽略大小写）才走网关的 /kling 前缀。 */
export function videoNeedsKlingPrefix(baseUrl: string): boolean {
  return /oinone|ainowork/i.test(baseUrl)
}

/** 路径里已有独立的 /kling 段（后面是 / 或结尾）。主机名里的 klingai 不算。 */
function klingRootHasPrefix(root: string): boolean {
  return /\/kling(\/|$)/i.test(root)
}

/**
 * 把官方路径接到渠道根上。
 * 需要前缀且路径里还没有 /kling 段时，在根末尾插入一次；已有则不再加。
 * 官方 api-singapore.klingai.com 不含 oinone、ainowork，不会插入。
 * 不插 /byteplus。endpoint 本身不要带 /kling。
 */
export function videoKlingUrl(baseUrl: string, endpoint: string): string {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const rooted = videoNeedsKlingPrefix(root) && !klingRootHasPrefix(root) ? `${root}/kling` : root
  return rooted + ep
}

/** 预览用的路径（含 query），不带渠道根。 */
export function videoKlingPath(baseUrl: string, endpoint: string): string {
  const full = videoKlingUrl(baseUrl, endpoint)
  if (/^https?:\/\//i.test(full)) {
    try {
      const u = new URL(full)
      return u.pathname + u.search
    } catch { /* 落到下面的相对路径 */ }
  }
  return full.startsWith('/') ? full : `/${full}`
}

/** 路径末段用原文，只做转义。空模型由调用方换成默认。 */
export function klingCreateEndpoint(kind: 't2v' | 'i2v', model: string): string {
  const seg = encodeURIComponent(model.trim())
  return kind === 'i2v' ? `/image-to-video/${seg}` : `/text-to-video/${seg}`
}

/** 去掉首尾空格、忽略大小写后恰好是 kling-4.0-flash。 */
export function klingIsFlash(model: string): boolean {
  return model.trim().toLowerCase() === 'kling-4.0-flash'
}

export function videoIsKlingPreset(model: string): boolean {
  const id = model.trim().toLowerCase()
  return id === 'kling-4.0' || id === 'kling-4.0-flash'
}

/** 切回其它接口时用来把可灵模型换回该接口的默认。含 kling-4.0 开头的手改名。 */
export function videoLooksLikeKlingModel(model: string): boolean {
  return /^kling-4\.0($|-)/i.test(model.trim())
}

export function klingExpect(def: VideoCaseDef, model: string): VideoExpect {
  if (def.expect === 'reject') return 'reject'
  if (klingIsFlash(model) && KLING_FLASH_UNSUPPORTED.has(def.id)) return 'unsupported'
  return 'success'
}

export function klingCapabilityHint(model: string, caseId?: string): string {
  if (!klingIsFlash(model)) return '720p / 1080p · 3–30s'
  if (caseId === 'kling:t2v-1080p') return '仅 720p'
  if (caseId === 'kling:i2v-frames') return '图生只要首帧'
  if (caseId === 'kling:t2v-21s') return '时长 3–20s'
  return '仅 720p · 仅首帧 · 时长 3–20s'
}

export const KLING_CASE_DEFS: VideoCaseDef[] = [
  {
    id: 'kling:t2v-720p', name: '文生 · 720p · 16:9 · 5s', kind: 't2v', expect: 'success',
    desc: 'POST /text-to-video/{模型}。settings.duration=5、resolution=720p、aspect_ratio=16:9。4.0 与 Flash 都正向',
    params: { resolution: '720p', ratio: '16:9', duration: 5 },
  },
  {
    id: 'kling:i2v-first', name: '首帧 · 720p · 5s', kind: 'i2v', expect: 'success',
    desc: 'POST /image-to-video/{模型}。contents 只有 prompt 和 first_frame。图生不写 aspect_ratio。左栏首帧为空则不发送',
    params: { resolution: '720p', duration: 5 },
  },
  {
    id: 'kling:t2v-1080p', name: '文生 · 1080p · 16:9 · 5s', kind: 't2v', expect: 'success',
    desc: 'resolution=1080p。kling-4.0 正向；去掉空格、忽略大小写后恰好是 kling-4.0-flash 时标「预期不支持」（官方只写 720p）',
    params: { resolution: '1080p', ratio: '16:9', duration: 5 },
  },
  {
    id: 'kling:i2v-frames', name: '首尾帧 · 720p · 5s', kind: 'i2v-frames', expect: 'success',
    desc: 'first_frame + last_frame，720p · 5s，不写 aspect_ratio。任一帧为空则不发送，不退化成只发首帧。精确 Flash 标「预期不支持」',
    params: { resolution: '720p', duration: 5 },
  },
  {
    id: 'kling:t2v-21s', name: '文生 · 720p · 16:9 · 21s', kind: 't2v', expect: 'success',
    desc: 'duration=21，刚过 Flash 的 20 秒。固定 720p，避免和 1080p 的拒绝缠在一起。精确 Flash 标「预期不支持」',
    params: { resolution: '720p', ratio: '16:9', duration: 21 },
  },
]

export interface KlingPlan {
  kind: 'task'
  endpoint: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface KlingMediaUrls {
  firstFrame: string
  lastFrame: string
}

function klingPlanShell(endpoint: string, body: Record<string, unknown>): KlingPlan {
  return {
    kind: 'task',
    method: 'POST',
    endpoint,
    headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
    body,
  }
}

function klingTargets(def: VideoCaseDef): Record<string, string | number | boolean | null> {
  const targets: Record<string, string | number | boolean | null> = {}
  if (def.params.resolution != null) targets.resolution = def.params.resolution
  if (def.params.duration != null) targets.duration = def.params.duration
  if (def.kind === 't2v' && def.params.ratio != null) targets.ratio = def.params.ratio
  return targets
}

/**
 * 文生用顶层 prompt。图生用 contents，并且不写 aspect_ratio。
 * 缺帧时 missing 非空，调用方不得发送，也不能退化成文生或只发首帧。
 */
export function klingBuildPlan(
  def: VideoCaseDef,
  model: string,
  prompt: string,
  urls: KlingMediaUrls,
): { plan: KlingPlan; skipped: string[]; missing: string | null; targets: Record<string, string | number | boolean | null> } {
  const text = def.prompt ?? prompt
  const targets = klingTargets(def)
  const resolution = def.params.resolution
  const duration = def.params.duration
  if (def.kind === 't2v') {
    return {
      plan: klingPlanShell(klingCreateEndpoint('t2v', model), {
        prompt: text,
        settings: { duration, resolution, aspect_ratio: def.params.ratio },
      }),
      skipped: [],
      missing: null,
      targets,
    }
  }
  const first = urls.firstFrame.trim()
  const last = urls.lastFrame.trim()
  const needLast = def.kind === 'i2v-frames'
  const absent: string[] = []
  if (!first) absent.push('首帧')
  if (needLast && !last) absent.push('尾帧')
  const contents: Record<string, unknown>[] = [{ type: 'prompt', text }]
  if (first) contents.push({ type: 'first_frame', url: first, id: 'image_1' })
  if (needLast && last) contents.push({ type: 'last_frame', url: last, id: 'image_2' })
  return {
    plan: klingPlanShell(klingCreateEndpoint('i2v', model), {
      contents,
      settings: { duration, resolution },
    }),
    skipped: [],
    missing: absent.length ? `${absent.join(' / ')} URL（左栏为空，不发送）` : null,
    targets,
  }
}

function klingLayers(json: any): any[] {
  return [json, json?.data, json?.data?.data].filter(layer => layer && typeof layer === 'object')
}

/** 查询的 data 数组、data.result 数组，或创建响应里带 id 的单个对象。多一层 data 也剥一次。 */
export function klingTaskList(json: any): any[] {
  for (const layer of klingLayers(json)) {
    if (Array.isArray(layer)) return layer
    if (Array.isArray(layer.result)) return layer.result
  }
  const objects = klingLayers(json).filter(layer => !Array.isArray(layer))
  const official = new Set(['submitted', 'processing', 'succeeded', 'failed'])
  const candidates = objects.filter(layer => layer.id != null && String(layer.id).trim() && typeof layer.status === 'string' && layer.status.trim())
  for (let i = candidates.length - 1; i >= 0; i--) {
    const status = String(candidates[i].status).trim().toLowerCase()
    if (official.has(status)) return [candidates[i]]
    // success / completed 只有本层和内层都没有非 0 业务码时才算任务，避免信封 id 盖住 code≠0。
    const code = klingBusinessCode(candidates[i])
    if ((status === 'success' || status === 'completed') && (code == null || code === 0)) {
      return [candidates[i]]
    }
  }
  return []
}

export function klingFindTask(json: any, taskId?: string | null): any | null {
  const list = klingTaskList(json)
  if (!list.length) return null
  if (taskId) return list.find(task => String(task?.id ?? '') === taskId) ?? null
  return list[0]
}

export function klingExtractTaskId(json: any): string | null {
  const id = klingFindTask(json)?.id
  if (typeof id === 'string' && id.trim()) return id.trim()
  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  return null
}

export function klingExtractStatus(json: any, taskId?: string | null): string {
  const status = klingFindTask(json, taskId)?.status
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

export function klingExtractVideoUrl(json: any, taskId?: string | null): string | null {
  const outputs = klingFindTask(json, taskId)?.outputs
  if (!Array.isArray(outputs)) return null
  const video = outputs.find(item => item && item.type === 'video' && typeof item.url === 'string' && item.url.trim())
  return video ? String(video.url).trim() : null
}

/** 只收能解析成数字的 output_duration / input_duration。没有就返回 null，调用方记 info 或不记。 */
export function klingExtractUsage(json: any, taskId?: string | null): Record<string, number> | null {
  const usage = klingFindTask(json, taskId)?.usage
  if (!usage || typeof usage !== 'object') return null
  const out: Record<string, number> = {}
  const output = Number(usage.output_duration)
  if (Number.isFinite(output)) out.output_duration = output
  const input = Number(usage.input_duration)
  if (Number.isFinite(input)) out.input_duration = input
  return Object.keys(out).length ? out : null
}

export function klingExtractRequestId(json: any): string | null {
  const id = json?.request_id ?? json?.data?.request_id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function klingErrorText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.toUpperCase() === 'SUCCEED') return null
  return text
}

function klingObjectLayers(json: any): any[] {
  return [json, json?.data, json?.data?.data].filter(layer => layer && typeof layer === 'object' && !Array.isArray(layer))
}

function klingReadCode(layer: any): number | null {
  const code = layer?.code
  if (typeof code === 'number' && Number.isFinite(code)) return code
  if (typeof code === 'string' && code.trim() && Number.isFinite(Number(code))) return Number(code)
  return null
}

/** 业务 code。内层非 0 优先于外层信封的 0。都没有就返回 null。 */
export function klingBusinessCode(json: any): number | null {
  let zero = false
  for (const layer of klingObjectLayers(json)) {
    const code = klingReadCode(layer)
    if (code == null) continue
    if (code !== 0) return code
    zero = true
  }
  return zero ? 0 : null
}

/**
 * 可灵参数错误经常是 HTTP 200 加 code≠0，并且没有任务 id。
 * 这只给 Kling 的预期不支持用，调用方仍要排除已有 taskId 的查询。
 */
export function klingBusinessRejected(status: number, taskId: string | null, code: unknown): boolean {
  return !taskId && status >= 200 && status < 300 && typeof code === 'number' && code !== 0
}

/** 创建失败的 code/message。网关可能再包一层 data，成功信封 code=0 的 SUCCEED 不当成错误。 */
function klingBusinessError(json: any): string | null {
  for (const layer of klingObjectLayers(json)) {
    if (klingReadCode(layer) == null || klingReadCode(layer) === 0) continue
    const text = klingErrorText(layer.message)
    if (text) return text
  }
  return null
}

/** 任务失败看该条 message。创建失败看 code≠0 的 message，成功时的 SUCCEED 不当成错误。 */
export function klingFormatTaskError(json: any, taskId?: string | null): string | null {
  const taskMessage = klingErrorText(klingFindTask(json, taskId)?.message)
  if (taskMessage) return taskMessage
  return klingBusinessError(json)
}

function klingSucceeded(status: string | null | undefined): boolean {
  const st = (status || '').toLowerCase()
  return st === 'succeeded' || st === 'success' || st === 'completed'
}

/**
 * 正向：HTTP 2xx、succeeded、有 video url、成片过分辨率档、时长与请求 ±1s。
 * 比例只判文生。usage 有数字才记 info。任务没成功就停在地址，不再堆成片项。
 */
export function klingBuildChecks(rec: VideoRecord): VideoCheck[] {
  const checks: VideoCheck[] = []
  const httpOk = rec.status >= 200 && rec.status < 300
  const businessFail = klingBusinessRejected(rec.status, rec.taskId, rec.targets.klingCode)
  checks.push({
    name: '请求成功',
    target: businessFail ? 'HTTP 2xx 且 code=0' : 'HTTP 2xx',
    actual: businessFail ? `HTTP ${rec.status} · code ${rec.targets.klingCode}` : (rec.status ? `HTTP ${rec.status}` : '无响应'),
    pass: httpOk && !businessFail,
  })
  const succeeded = klingSucceeded(rec.taskStatus)
  if (rec.taskStatus) {
    checks.push({ name: '任务状态', target: 'succeeded', actual: rec.taskStatus, pass: succeeded })
  }
  checks.push({
    name: '视频地址',
    target: 'outputs[].url',
    actual: rec.videoUrl || '无',
    pass: !!rec.videoUrl,
  })
  if (rec.usage && rec.usage.output_duration != null) {
    checks.push({ name: 'usage', target: 'output_duration', actual: rec.usage.output_duration, pass: true, info: true })
  }
  if (!succeeded) return checks

  const probeOk = !!(rec.probe && rec.probe.w && rec.probe.h && rec.probe.duration > 0)
  checks.push({
    name: '成片元数据',
    target: '可读宽高时长',
    actual: probeOk ? `${rec.probe!.w}×${rec.probe!.h} · ${rec.probe!.duration.toFixed(2)}s` : '未读到',
    pass: probeOk,
  })
  const wantRes = rec.targets.resolution
  if (typeof wantRes === 'string' && rec.probe && rec.probe.w && rec.probe.h) {
    const hit = vidCheckResolution(wantRes, rec.probe.w, rec.probe.h, KLING_RESOLUTION_TOL)
    if (hit) {
      checks.push({
        name: '分辨率',
        target: `${wantRes}（面积 ±${Math.round(KLING_RESOLUTION_TOL * 100)}% 或短边 ±5%）`,
        actual: hit.via === 'short'
          ? `${rec.probe.w}×${rec.probe.h} · 短边档 ${hit.target}`
          : hit.via === 'area'
            ? `${rec.probe.w}×${rec.probe.h} · 面积档 ${hit.target}（偏差 ${hit.devPct}%）`
            : `${rec.probe.w}×${rec.probe.h} → 最近 ${hit.nearest}（面积 ${hit.areaDevPct}% / 短边 ${hit.shortDevPct}%）`,
        pass: hit.pass,
      })
    }
  }
  const wantDur = rec.targets.duration
  if (typeof wantDur === 'number' && wantDur > 0 && rec.probe && rec.probe.duration > 0) {
    const diff = Math.abs(rec.probe.duration - wantDur)
    checks.push({
      name: '时长',
      target: `${wantDur}s ±${KLING_DURATION_TOL}s`,
      actual: `${rec.probe.duration.toFixed(2)}s`,
      pass: diff <= KLING_DURATION_TOL,
    })
  }
  const wantRatio = rec.targets.ratio
  if (rec.kind === 't2v' && typeof wantRatio === 'string' && wantRatio !== 'adaptive' && rec.probe && rec.probe.w && rec.probe.h) {
    const hit = vidCheckRatio(wantRatio, rec.probe.w, rec.probe.h, KLING_RATIO_TOL)
    checks.push({
      name: '宽高比',
      target: `${wantRatio} ±5%`,
      actual: hit ? `${vidAspectRatio(rec.probe.w, rec.probe.h)}（偏差 ${hit.devPct}%）` : `${rec.probe.w}×${rec.probe.h}`,
      pass: !!hit?.pass,
    })
  }
  return checks
}
