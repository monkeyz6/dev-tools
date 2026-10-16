import type { VideoCaseDef, VideoCheck, VideoExpect, VideoRecord } from './types.ts'
import { vidAspectRatio, vidCheckRatio } from '../../shared/video-meta.ts'

/** 官方 Video V2。网关根另见 videoMinimaxUrl，这里不要带 /minimax。 */
export const MINIMAX_CREATE_ENDPOINT = '/v2/video_generation'

export const MINIMAX_DEFAULT_MODEL = 'MiniMax-H3'

/** 只放已确认的 4 个 id。Fast / Max-Turbo 不预设，也不按「预期不支持」处理。 */
export const MINIMAX_MODEL_OPTIONS = [
  'MiniMax-H3',
  'MiniMax-H3-Max',
  'MiniMax-H3-intl',
  'MiniMax-H3-Max-intl',
].map(m => ({ value: m, label: m }))

/** 文生可指定、图生/参考回显必须落在其中的比例。不含 adaptive。 */
export const MINIMAX_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const

const MINIMAX_DURATION_TOL = 1
const MINIMAX_RATIO_TOL = 0.05

export function minimaxQueryEndpoint(taskId: string): string {
  return `/v2/query/video_generation/${encodeURIComponent(taskId)}`
}

/** 整段 baseUrl 里出现 oinone 或 ainowork（忽略大小写）才走网关的 /minimax 前缀。 */
export function videoNeedsMinimaxPrefix(baseUrl: string): boolean {
  return /oinone|ainowork/i.test(baseUrl)
}

/** 路径里已有独立的 /minimax 段（后面是 / 或结尾）。主机名里的 minimax、以及 minimaxi，都不算。 */
function minimaxRootHasPrefix(root: string): boolean {
  return /\/minimax(\/|$)/i.test(root)
}

/**
 * 把 Video V2 路径接到渠道根上。
 * 需要前缀且路径里还没有 /minimax 段时，在根末尾插入一次；已有则不再加。
 * 官方 api.minimax.io / api.minimax.cn 不含 oinone、ainowork，不会插入。
 * 不插 /byteplus。endpoint 本身不要带 /minimax。
 */
export function videoMinimaxUrl(baseUrl: string, endpoint: string): string {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const rooted = videoNeedsMinimaxPrefix(root) && !minimaxRootHasPrefix(root) ? `${root}/minimax` : root
  return rooted + ep
}

/** 预览用的路径（含 query），不带渠道根。 */
export function videoMinimaxPath(baseUrl: string, endpoint: string): string {
  const full = videoMinimaxUrl(baseUrl, endpoint)
  if (/^https?:\/\//i.test(full)) {
    try {
      const u = new URL(full)
      return u.pathname + u.search
    } catch { /* 落到下面的相对路径 */ }
  }
  return full.startsWith('/') ? full : `/${full}`
}

/** 去掉结尾一次 -intl（忽略大小写）。请求体仍用用户输入的原文。 */
export function videoMinimaxCanonical(model: string): string {
  return model.trim().replace(/-intl$/i, '')
}

export function videoIsMinimaxPreset(model: string): boolean {
  const id = model.trim()
  return MINIMAX_MODEL_OPTIONS.some(o => o.value === id)
}

/** 先认 Max，再认 H3，避免 Max 被当成标准 H3。认不出的（含 Fast / Turbo）两边都不是。 */
export function videoMinimaxFamily(model: string): 'max' | 'h3' | null {
  const id = videoMinimaxCanonical(model).toLowerCase()
  if (id === 'minimax-h3-max') return 'max'
  if (id === 'minimax-h3') return 'h3'
  return null
}

export function videoIsMinimaxMax(model: string): boolean {
  return videoMinimaxFamily(model) === 'max'
}

export function videoIsMinimaxH3(model: string): boolean {
  return videoMinimaxFamily(model) === 'h3'
}

/** 切回 Seedance 时用来把 MiniMax 模型换回默认。含 Fast / Turbo 这类未预设的写法。 */
export function videoLooksLikeMinimaxModel(model: string): boolean {
  return /minimax-h3/i.test(model.trim())
}

export function minimaxExpect(def: VideoCaseDef, model: string): VideoExpect {
  if (def.expect === 'reject') return 'reject'
  if (def.params.resolution === '2K' && videoIsMinimaxMax(model)) return 'unsupported'
  return 'success'
}

export function minimaxCapabilityHint(model: string): string {
  return videoIsMinimaxMax(model) ? '480P / 768P' : '768P / 2K'
}

/** 免费张数边界再加一档。Max 为 1、2、3、4 张，其余（含认不出的名字）按 H3 的 1、5、6 张。 */
export function minimaxRefImageCounts(model: string): number[] {
  return videoIsMinimaxMax(model) ? [1, 2, 3, 4] : [1, 5, 6]
}

function minimaxT2v480Case(): VideoCaseDef {
  return {
    id: 'minimax:t2v-480p',
    name: '文生 · 480P · 16:9 · 5s',
    kind: 't2v',
    expect: 'success',
    desc: 'resolution=480P。只出现在 MiniMax-H3-Max / Max-intl。5s · 16:9，只发文本。',
    params: { resolution: '480P', ratio: '16:9', duration: 5 },
  }
}

function minimaxRefImageCase(count: number): VideoCaseDef {
  return {
    id: `minimax:ref-img-${count}`,
    name: `参考图 · ${count} 张 · 768P · 5s`,
    kind: 'ref-images',
    expect: 'success',
    refImageCount: count,
    desc: `只发参考图，同一左栏 URL 重复 ${count} 次，不带参考视频和音频。768P · 5s · adaptive。默认图是已核对可访问的火山示例 r2v_tea_pic1.jpg`,
    params: { resolution: '768P', ratio: 'adaptive', duration: 5 },
  }
}

/** 固定 5 条加上当前模型的参考图张数。插在混合参考之后、2K 文生之前。 */
export function minimaxCaseDefsFor(model: string): VideoCaseDef[] {
  const imageCases = minimaxRefImageCounts(model).map(minimaxRefImageCase)
  const at = MINIMAX_CASE_DEFS.findIndex(d => d.id === 'minimax:t2v-2k')
  const defs = [...MINIMAX_CASE_DEFS.slice(0, at), ...imageCases, ...MINIMAX_CASE_DEFS.slice(at)]
  if (!videoIsMinimaxMax(model)) return defs
  const after = defs.findIndex(d => d.id === 'minimax:t2v-768p')
  return [...defs.slice(0, after + 1), minimaxT2v480Case(), ...defs.slice(after + 1)]
}

export const MINIMAX_CASE_DEFS: VideoCaseDef[] = [
  {
    id: 'minimax:t2v-768p', name: '文生 · 768P · 16:9 · 5s', kind: 't2v', expect: 'success',
    desc: '只传文本。resolution=768P，duration=5，ratio=16:9。H3 与 Max 都支持',
    params: { resolution: '768P', ratio: '16:9', duration: 5 },
  },
  {
    id: 'minimax:i2v-first', name: '首帧 · 768P · 5s', kind: 'i2v', expect: 'success',
    desc: '文本 + 首帧（role=first_frame）。图生比例由图片决定，ratio 固定 adaptive；左栏首帧为空则不发送',
    params: { resolution: '768P', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'minimax:i2v-frames', name: '首尾帧 · 768P · 5s', kind: 'i2v-frames', expect: 'success',
    desc: '文本 + 首帧 + 尾帧，ratio=adaptive。任一帧 URL 为空则不发送，不退化成文生',
    params: { resolution: '768P', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'minimax:ref', name: '参考 · 768P · 5s', kind: 'ref-omni', expect: 'success',
    desc: '文本 + 参考图 + 参考视频 + 参考音频，ratio=adaptive。三个素材都要有，缺一则不发送，不退化成文生',
    params: { resolution: '768P', ratio: 'adaptive', duration: 5 },
  },
  {
    id: 'minimax:t2v-2k', name: '文生 · 2K · 16:9 · 5s', kind: 't2v', expect: 'success',
    desc: 'resolution=2K。MiniMax-H3 / H3-intl 正向；MiniMax-H3-Max / Max-intl 官方无 2K，按「预期不支持」判定',
    params: { resolution: '2K', ratio: '16:9', duration: 5 },
  },
]

export interface MinimaxPlan {
  kind: 'task'
  endpoint: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface MinimaxMediaUrls {
  firstFrame: string
  lastFrame: string
  refImage: string
  refVideo: string
  refAudio: string
}

interface MinimaxRole {
  key: keyof MinimaxMediaUrls
  type: 'image_url' | 'video_url' | 'audio_url'
  role: string
  label: string
}

const MINIMAX_KIND_ROLES: Partial<Record<VideoCaseDef['kind'], MinimaxRole[]>> = {
  i2v: [{ key: 'firstFrame', type: 'image_url', role: 'first_frame', label: '首帧' }],
  'i2v-frames': [
    { key: 'firstFrame', type: 'image_url', role: 'first_frame', label: '首帧' },
    { key: 'lastFrame', type: 'image_url', role: 'last_frame', label: '尾帧' },
  ],
  'ref-omni': [
    { key: 'refImage', type: 'image_url', role: 'reference_image', label: '参考图' },
    { key: 'refVideo', type: 'video_url', role: 'reference_video', label: '参考视频' },
    { key: 'refAudio', type: 'audio_url', role: 'reference_audio', label: '参考音频' },
  ],
}

function minimaxMediaItem(role: MinimaxRole, url: string): Record<string, unknown> {
  if (role.type === 'image_url') return { type: 'image_url', image_url: { url }, role: role.role }
  if (role.type === 'video_url') return { type: 'video_url', video_url: { url }, role: role.role }
  return { type: 'audio_url', audio_url: { url }, role: role.role }
}

/**
 * 官方字段只有 model / content / resolution / duration / ratio。
 * 带素材的用例缺任一 URL 时 missing 非空，调用方不得发送，也不能只剩文本当文生。
 */
export function minimaxBuildPlan(
  def: VideoCaseDef,
  model: string,
  prompt: string,
  urls: MinimaxMediaUrls,
): { plan: MinimaxPlan; skipped: string[]; missing: string | null; targets: Record<string, string | number | boolean | null> } {
  const text = def.prompt ?? prompt
  const content: Record<string, unknown>[] = [{ type: 'text', text }]
  let missing: string | null = null
  if (def.kind === 'ref-images') {
    const url = urls.refImage.trim()
    const count = def.refImageCount ?? 0
    if (!url || count < 1) missing = '参考图 URL（左栏为空，不发送）'
    else {
      for (let i = 0; i < count; i++) {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
      }
    }
  }
  const roles = def.kind === 'ref-images' ? undefined : MINIMAX_KIND_ROLES[def.kind]
  if (roles) {
    const absent = roles.filter(r => !urls[r.key].trim())
    if (absent.length) missing = `${absent.map(r => r.label).join(' / ')} URL（左栏为空，不发送）`
    for (const r of roles) {
      const url = urls[r.key].trim()
      if (url) content.push(minimaxMediaItem(r, url))
    }
  }
  const body: Record<string, unknown> = {
    model,
    content,
    resolution: def.params.resolution,
    duration: def.params.duration,
    ratio: def.params.ratio,
  }
  const targets: Record<string, string | number | boolean | null> = {}
  if (def.params.resolution != null) targets.resolution = def.params.resolution
  if (def.params.duration != null) targets.duration = def.params.duration
  if (def.params.ratio != null) targets.ratio = def.params.ratio
  return {
    plan: {
      kind: 'task',
      method: 'POST',
      endpoint: MINIMAX_CREATE_ENDPOINT,
      headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
      body,
    },
    skipped: [],
    missing,
    targets,
  }
}

function minimaxEnvelope(json: any): any {
  const layers = [json, json?.data, json?.data?.data].filter(
    (layer): layer is Record<string, unknown> => !!layer && typeof layer === 'object' && !Array.isArray(layer),
  )
  // 先找 task。外层若只抄了创建时的 task_id，不能挡住内层的查询结果。
  for (const layer of layers) {
    if (layer.task && typeof layer.task === 'object') return layer
  }
  for (const layer of layers) {
    if (layer.task_id != null && String(layer.task_id) !== '') return layer
  }
  return layers[0] ?? null
}

export function minimaxExtractTask(json: any): any | null {
  const task = minimaxEnvelope(json)?.task
  return task && typeof task === 'object' ? task : null
}

/** 创建响应的 task_id，或查询响应的 task.id。数字 id 转成字符串。 */
export function minimaxExtractTaskId(json: any): string | null {
  const layer = minimaxEnvelope(json)
  const raw = layer?.task_id ?? layer?.task?.id
  if (raw == null || String(raw) === '') return null
  return String(raw)
}

export function minimaxExtractStatus(json: any): string {
  const status = minimaxExtractTask(json)?.status
  return String(status || '').trim().toLowerCase()
}

/** 只认 task.content.url。content.video_url 不是 MiniMax 的成片地址。 */
export function minimaxExtractVideoUrl(json: any): string | null {
  const url = minimaxExtractTask(json)?.content?.url
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed || null
}

export function minimaxExtractEcho(json: any): { resolution?: string; duration?: number; ratio?: string } {
  const task = minimaxExtractTask(json)
  if (!task) return {}
  const resolution = typeof task.resolution === 'string' && task.resolution.trim() ? task.resolution.trim() : undefined
  let duration: number | undefined
  if (typeof task.duration === 'number' && Number.isFinite(task.duration)) duration = task.duration
  else if (typeof task.duration === 'string' && task.duration.trim() && Number.isFinite(Number(task.duration))) duration = Number(task.duration)
  const ratio = typeof task.ratio === 'string' && task.ratio.trim() ? task.ratio.trim() : undefined
  return { resolution, duration, ratio }
}

export function minimaxExtractUsage(json: any): Record<string, number> | null {
  const usage = minimaxExtractTask(json)?.usage
  if (!usage || typeof usage !== 'object') return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(usage)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/** 查询失败时的 task.error.code / task.error.message。HTTP 错误仍走 OpenAI 风格 error.message。 */
export function minimaxFormatTaskError(json: any): string | null {
  const err = minimaxExtractTask(json)?.error
  if (!err || typeof err !== 'object') return null
  const code = err.code != null && String(err.code).trim() ? String(err.code).trim() : ''
  const message = typeof err.message === 'string' ? err.message.trim() : ''
  const text = `${code} ${message}`.trim()
  return text || null
}

export function minimaxTaskErrorDetail(json: any): { code?: string; message?: string } | null {
  const err = minimaxExtractTask(json)?.error
  if (!err || typeof err !== 'object') return null
  const code = err.code != null && String(err.code).trim() ? String(err.code).trim() : undefined
  const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : undefined
  if (!code && !message) return null
  return { code, message }
}

function minimaxTaskSucceeded(st: string | null | undefined): boolean {
  const s = (st || '').toLowerCase()
  return s === 'succeeded' || s === 'success' || s === 'completed'
}

function minimaxConcreteRatio(ratio: string | null | undefined): string | null {
  if (!ratio || ratio === 'adaptive') return null
  return (MINIMAX_RATIOS as readonly string[]).includes(ratio) ? ratio : null
}

/**
 * 正向校验。调用方先处理「预期不支持」的那条 info，这里不要再写一遍。
 * 回显只在任务成功时核对，避免 4xx 上再堆一条「无回显」。
 * 像素没有官方宽高表，只记 info，不失败。
 */
export function minimaxBuildChecks(rec: VideoRecord): VideoCheck[] {
  const checks: VideoCheck[] = []
  const httpOk = rec.status >= 200 && rec.status < 300
  checks.push({
    name: '请求成功',
    target: 'HTTP 2xx',
    actual: rec.status ? `HTTP ${rec.status}` : '无响应',
    pass: httpOk,
  })
  const succeeded = minimaxTaskSucceeded(rec.taskStatus)
  if (rec.taskStatus) {
    checks.push({ name: '任务状态', target: 'succeeded', actual: rec.taskStatus, pass: succeeded })
  }
  checks.push({
    name: '视频地址',
    target: 'task.content.url',
    actual: rec.videoUrl || '无',
    pass: !!rec.videoUrl,
  })
  if (rec.usage && rec.usage.total_tokens != null) {
    checks.push({ name: 'usage', target: 'total_tokens', actual: rec.usage.total_tokens, pass: true, info: true })
  }
  if (!succeeded) return checks

  const wantRes = rec.targets.resolution
  if (typeof wantRes === 'string') {
    const echo = typeof rec.targets.echoResolution === 'string' ? rec.targets.echoResolution : ''
    checks.push({ name: '分辨率回显', target: wantRes, actual: echo || '无回显', pass: echo === wantRes })
  }
  const wantDur = rec.targets.duration
  const echoDur = typeof rec.targets.echoDuration === 'number' ? rec.targets.echoDuration : null
  if (typeof wantDur === 'number') {
    checks.push({
      name: '时长回显',
      target: `${wantDur}s`,
      actual: echoDur == null ? '无回显' : `${echoDur}s`,
      pass: echoDur === wantDur,
    })
  }
  const wantRatio = typeof rec.targets.ratio === 'string' ? rec.targets.ratio : ''
  const echoRatio = typeof rec.targets.echoRatio === 'string' ? rec.targets.echoRatio : ''
  if (wantRatio === 'adaptive') {
    // 官方首帧实测原样回 adaptive，不解析成 1:1 这类具体比例。解析了才拿成片去对。
    const echoedAdaptive = echoRatio.toLowerCase() === 'adaptive'
    const allowed = minimaxConcreteRatio(echoRatio)
    checks.push({
      name: '比例回显',
      target: echoedAdaptive || !echoRatio ? 'adaptive' : MINIMAX_RATIOS.join(' / '),
      actual: echoRatio || '无回显',
      pass: echoedAdaptive || !!allowed,
    })
    if (allowed) pushRatioProbe(checks, allowed, rec)
  } else if (wantRatio) {
    checks.push({ name: '比例回显', target: wantRatio, actual: echoRatio || '无回显', pass: echoRatio === wantRatio })
    const probeTarget = minimaxConcreteRatio(echoRatio) || minimaxConcreteRatio(wantRatio)
    if (probeTarget) pushRatioProbe(checks, probeTarget, rec)
  }
  if (echoDur != null) {
    if (rec.probe && rec.probe.duration > 0) {
      const diff = Math.abs(rec.probe.duration - echoDur)
      checks.push({
        name: '时长',
        target: `回显 ${echoDur}s ±${MINIMAX_DURATION_TOL}s`,
        actual: `${rec.probe.duration.toFixed(2)}s`,
        pass: diff <= MINIMAX_DURATION_TOL,
      })
    } else {
      checks.push({ name: '时长', target: `回显 ${echoDur}s ±${MINIMAX_DURATION_TOL}s`, actual: '未读到成片', pass: false })
    }
  }
  if (rec.probe && rec.probe.w && rec.probe.h) {
    checks.push({ name: '成片像素', target: '仅记录', actual: `${rec.probe.w}×${rec.probe.h}`, pass: true, info: true })
  } else if (rec.videoUrl) {
    checks.push({ name: '成片像素', target: '仅记录', actual: '未读到', pass: true, info: true })
  }
  return checks
}

function pushRatioProbe(checks: VideoCheck[], ratio: string, rec: VideoRecord) {
  if (!rec.probe || !rec.probe.w || !rec.probe.h) {
    checks.push({ name: '宽高比', target: `${ratio} ±5%`, actual: '未读到成片', pass: false })
    return
  }
  const hit = vidCheckRatio(ratio, rec.probe.w, rec.probe.h, MINIMAX_RATIO_TOL)
  checks.push({
    name: '宽高比',
    target: `${ratio} ±5%`,
    actual: hit ? `${vidAspectRatio(rec.probe.w, rec.probe.h)}（偏差 ${hit.devPct}%）` : `${rec.probe.w}×${rec.probe.h}`,
    pass: !!hit?.pass,
  })
}
