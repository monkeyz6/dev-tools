import type { VideoCaseDef, VideoErrorDetail } from './types.ts'

export const OMNI_DEFAULT_MODEL = 'gemini-omni-flash-preview'
export const OMNI_MODEL_OPTIONS = [
  'gemini-omni-flash-preview',
  'gemini-omni-1.1-flash',
].map(m => ({ value: m, label: m }))

/** 浏览器 fetch 可读的默认素材（Wikimedia upload 对 fetch 常常无 CORS，不用来当 Omni 默认图） */
export const OMNI_DEFAULT_URLS = {
  firstFrame: 'https://picsum.photos/id/1015/1280/720.jpg',
  lastFrame: 'https://picsum.photos/id/1016/1280/720.jpg',
  refImage: 'https://picsum.photos/id/1025/1280/720.jpg',
  refVideo: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
}

export const OMNI_CASE_DEFS: VideoCaseDef[] = [
  {
    id: 'google-omni:t2v-required', name: 'Omni · 文生仅必填', kind: 't2v', expect: 'success',
    desc: '只传 model + input 文本，不写 delivery，走官方默认 data（inline base64）',
    params: {},
  },
  {
    id: 'google-omni:t2v-360p', name: 'Omni · 360p 9:16 4s', kind: 't2v', expect: 'success',
    desc: '360p 竖版 4s，显式 text_to_video，delivery=uri；flash-preview 官方仅 720p，按「预期不支持」',
    params: { resolution: '360p', ratio: '9:16', duration: 4 },
  },
  {
    id: 'google-omni:t2v-1080p', name: 'Omni · 1080p 16:9 8s', kind: 't2v', expect: 'success',
    desc: '1080p 横版 8s（1.1 为 upscale），delivery=uri；flash-preview 官方仅 720p，按「预期不支持」',
    params: { resolution: '1080p', ratio: '16:9', duration: 8 },
  },
  {
    id: 'google-omni:i2v-first', name: 'Omni · 图生首帧', kind: 'i2v', expect: 'success',
    desc: '官方 image_to_video：单张首帧 + 文本，720p · 16:9 · 5s，delivery=uri',
    params: { resolution: '720p', ratio: '16:9', duration: 5 },
  },
  {
    id: 'google-omni:i2v-frames', name: 'Omni · 首尾帧', kind: 'i2v-frames', expect: 'success',
    desc: '两张图 + image_to_video，16:9 · 720p · 5s，delivery=uri',
    params: { resolution: '720p', ratio: '16:9', duration: 5 },
  },
  {
    id: 'google-omni:ref', name: 'Omni · 参考图+视频', kind: 'ref-omni', expect: 'success',
    desc: '参考图 + 参考视频 + reference_to_video（官方不支持 audio reference），delivery=uri',
    params: { resolution: '720p', ratio: '16:9', duration: 5 },
  },
  {
    id: 'google-omni:edit', name: 'Omni · 编辑上一轮', kind: 't2v', expect: 'success',
    desc: 'previous_interaction_id + task=edit，依赖本轮最近成功的 interaction，delivery=uri',
    params: {},
  },
  {
    id: 'google-omni:extend', name: 'Omni · 延长上一轮', kind: 't2v', expect: 'success',
    desc: 'previous_interaction_id + task=extend，delivery=uri',
    params: {},
  },
  {
    id: 'google-omni:reject-ratio', name: 'Omni · 拒绝 21:9', kind: 't2v', expect: 'reject',
    desc: 'aspect_ratio=21:9 非法，应 4xx 或 failed（同步 JSON）',
    params: { ratio: '21:9' },
  },
  {
    id: 'google-omni:reject-face', name: 'Omni · 拒绝名人图', kind: 'i2v-reject', expect: 'reject',
    desc: '左栏敏感人像；官方不支持可识别真人。CORS 读失败记请求异常，不算已拒绝',
    params: { resolution: '720p', ratio: '16:9', duration: 5 },
  },
]

export interface OmniPlan {
  kind: 'task'
  endpoint: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface OmniVideoPart {
  uri?: string
  data?: string
  mime: string
}

export type OmniSubmitResult =
  | { kind: 'done'; id: string | null; status: string; video: OmniVideoPart | null; usage: Record<string, number> | null }
  | { kind: 'poll'; id: string; status: string }
  | { kind: 'error'; id: string | null; status: string; message: string; detail: VideoErrorDetail | null }

const SLOT_TO_URL: Record<string, 'firstFrame' | 'lastFrame' | 'refImage' | 'refVideo' | 'sensitiveFace'> = {
  first_frame: 'firstFrame',
  last_frame: 'lastFrame',
  reference_image: 'refImage',
  reference_video: 'refVideo',
  sensitive_face: 'sensitiveFace',
}

export function omniLooksLikeModel(model: string): boolean {
  return /gemini-omni|omni-flash|omni-1\.1/i.test(model)
}

/** 初代 preview：Cloud 卡写明只出 720p。1.1 / 1-1 走 360p–4k */
export function omniIs720OnlyModel(model: string): boolean {
  const id = model.trim().toLowerCase()
  if (/1[.-]1/.test(id)) return false
  return /omni-flash-preview|gemini-omni-flash-preview/.test(id)
}

const OMNI_WIDE_RESOLUTIONS = new Set(['360p', '720p', '1080p', '4k'])

export function omniSupportsResolution(model: string, resolution?: string): boolean {
  if (!resolution) return true
  const key = resolution.trim().toLowerCase()
  if (omniIs720OnlyModel(model)) return key === '720p'
  return OMNI_WIDE_RESOLUTIONS.has(key)
}

export function omniNeedsPrevious(def: VideoCaseDef): boolean {
  return def.id === 'google-omni:edit' || def.id === 'google-omni:extend'
}

export interface OmniTransport {
  background: boolean
}

/** 官方视频生成全部同步 JSON：不传 background，不传 stream */
export function omniTransport(_def: VideoCaseDef): OmniTransport {
  return { background: false }
}

export function omniTransportLabel(_t?: OmniTransport): string {
  return '同步 JSON'
}

export function omniPollUrl(baseUrl: string, id: string, model: string): string {
  const root = baseUrl.replace(/\/+$/, '')
  const q = new URLSearchParams()
  if (model.trim()) q.set('model', model.trim())
  const qs = q.toString()
  return `${root}/v1beta/interactions/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
}

export function omniPreviewBody(body: Record<string, unknown>): string {
  return JSON.stringify(omniScrubValue(body), null, 2)
}

export function omniScrubBody(text: string): string {
  if (!text) return ''
  try {
    return JSON.stringify(omniScrubValue(JSON.parse(text)), null, 2)
  } catch {
    return text.length > 80_000 ? text.slice(0, 80_000) + '\n…' : text
  }
}

export function omniScrubValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(omniScrubValue)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'data' && typeof val === 'string' && val.length > 80 && !/^\{\{\w+\}\}$/.test(val)) {
        o[k] = `<base64 omitted ${val.length} chars>`
      } else {
        o[k] = omniScrubValue(val)
      }
    }
    return o
  }
  return v
}

export function omniParseGoogleError(json: any): { message: string | null; detail: VideoErrorDetail | null } {
  const err = json?.error
  if (!err) return { message: null, detail: null }
  if (typeof err === 'string') {
    const message = err.trim() || null
    return { message, detail: message ? { message } : null }
  }
  if (typeof err !== 'object') return { message: null, detail: null }
  const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : undefined
  const status = typeof err.status === 'string' && err.status.trim() ? err.status.trim() : undefined
  const code = err.code != null ? String(err.code) : undefined
  const detail: VideoErrorDetail = { message, type: status, code }
  const text = [status, message].filter(Boolean).join(' ') || null
  return { message: text, detail: message || status || code ? detail : null }
}

export function omniExtractVideo(json: any): OmniVideoPart | null {
  const steps = json?.steps
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const contents = Array.isArray(step?.content) ? step.content : []
      for (const c of contents) {
        if (c && c.type === 'video' && (c.uri || c.data)) {
          return { uri: typeof c.uri === 'string' ? c.uri : undefined, data: typeof c.data === 'string' ? c.data : undefined, mime: typeof c.mime_type === 'string' ? c.mime_type : 'video/mp4' }
        }
      }
    }
  }
  const ov = json?.output_video
  if (ov && (ov.uri || ov.data)) {
    return { uri: typeof ov.uri === 'string' ? ov.uri : undefined, data: typeof ov.data === 'string' ? ov.data : undefined, mime: typeof ov.mime_type === 'string' ? ov.mime_type : 'video/mp4' }
  }
  return null
}

export function omniExtractUsage(json: any): Record<string, number> | null {
  const u = json?.usage || json?.usage_metadata
  if (!u || typeof u !== 'object') return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(u)) {
    if (typeof v === 'number') out[k] = v
  }
  return Object.keys(out).length ? out : null
}

function omniStatusOf(json: any): string {
  return String(json?.status || '').toLowerCase()
}

export function omniParseSubmit(httpStatus: number, json: any, text: string): OmniSubmitResult {
  const id = typeof json?.id === 'string' && json.id ? json.id : null
  const status = omniStatusOf(json)
  const parsedErr = omniParseGoogleError(json)
  if (httpStatus >= 400) {
    return {
      kind: 'error',
      id,
      status: status || String(httpStatus),
      message: parsedErr.message || (text ? text.slice(0, 400) : `HTTP ${httpStatus}`),
      detail: parsedErr.detail,
    }
  }
  if (status === 'failed' || status === 'cancelled') {
    return { kind: 'error', id, status, message: parsedErr.message || `任务 ${status}`, detail: parsedErr.detail }
  }
  const video = omniExtractVideo(json)
  if (video) {
    return { kind: 'done', id, status: status || 'completed', video, usage: omniExtractUsage(json) }
  }
  // 官方终态 completed 时 GET 必带 steps[].content video；再当 poll 会空转 15 分钟
  if (status === 'completed') {
    return { kind: 'error', id, status, message: '任务已完成但未返回视频', detail: parsedErr.detail }
  }
  if (id) return { kind: 'poll', id, status: status || 'in_progress' }
  return { kind: 'error', id: null, status, message: '未返回 interaction id', detail: null }
}

export function omniBuildPlan(
  def: VideoCaseDef,
  model: string,
  prompt: string,
  urls: { firstFrame: string; lastFrame: string; refImage: string; refVideo: string; sensitiveFace: string },
  previousId: string | null,
): { plan: OmniPlan; skipped: string[]; missing: string | null; targets: Record<string, string | number | boolean | null> } {
  const skipped: string[] = []
  let missing: string | null = null
  const targets: Record<string, string | number | boolean | null> = {}
  const inputParts: Record<string, unknown>[] = []

  if (omniNeedsPrevious(def) && !previousId) {
    missing = '请先跑一条成功的文生（需要 previous_interaction_id）'
  }

  const pushImage = (slot: string, url: string, label: string) => {
    const u = url.trim()
    if (!u) {
      skipped.push(`${label}（未提供 URL，已跳过）`)
      return false
    }
    inputParts.push({ type: 'image', data: `{{${slot}}}`, mime_type: 'image/jpeg' })
    return true
  }

  if (def.kind === 'i2v') {
    if (!pushImage('first_frame', urls.firstFrame, '首帧') && !missing) missing = '首帧 URL'
  } else if (def.kind === 'i2v-frames') {
    if (!pushImage('first_frame', urls.firstFrame, '首帧') && !missing) missing = '首帧 URL'
    if (!pushImage('last_frame', urls.lastFrame, '尾帧') && !missing) missing = '尾帧 URL'
  } else if (def.kind === 'ref-omni') {
    if (!pushImage('reference_image', urls.refImage, '参考图') && !missing) missing = '参考图 URL'
    const v = urls.refVideo.trim()
    if (!v) {
      skipped.push('参考视频（未提供 URL，已跳过）')
      if (!missing) missing = '参考视频 URL'
    } else {
      inputParts.push({ type: 'video', data: '{{reference_video}}', mime_type: 'video/mp4' })
    }
  } else if (def.kind === 'i2v-reject') {
    if (!pushImage('sensitive_face', urls.sensitiveFace, '敏感人像') && !missing) missing = '敏感人像 URL（左栏为空）'
  }

  const text = def.id === 'google-omni:edit'
    ? (prompt.trim() || 'Keep everything else the same. Slightly increase the brightness.')
    : def.id === 'google-omni:extend'
      ? (prompt.trim() || 'Extend this video. The scene continues.')
      : prompt

  let input: unknown = text
  if (inputParts.length) {
    inputParts.push({ type: 'text', text })
    input = inputParts
  }

  const task = def.id === 'google-omni:edit' ? 'edit'
    : def.id === 'google-omni:extend' ? 'extend'
    : def.kind === 'i2v' || def.kind === 'i2v-frames' || def.kind === 'i2v-reject' ? 'image_to_video'
    : def.kind === 'ref-omni' ? 'reference_to_video'
    : def.params.resolution || def.params.ratio || def.params.duration != null ? 'text_to_video'
    : undefined

  const inlineData = def.id === 'google-omni:t2v-required'
  const responseFormat: Record<string, unknown> = { type: 'video' }
  if (def.expect === 'success' && !inlineData) {
    responseFormat.delivery = 'uri'
    targets.delivery = 'uri'
  } else if (inlineData) {
    targets.delivery = 'data'
  }
  if (def.params.ratio) {
    responseFormat.aspect_ratio = def.params.ratio
    targets.ratio = def.params.ratio
  }
  if (def.params.resolution) {
    responseFormat.resolution = def.params.resolution
    targets.resolution = def.params.resolution
    if (def.params.resolution === '1080p' || def.params.resolution === '4k') targets.upscaled = true
  }
  if (typeof def.params.duration === 'number') {
    responseFormat.duration = `${def.params.duration}s`
    targets.duration = def.params.duration
  }
  if (def.id === 'google-omni:t2v-required') targets.generate_audio = true

  targets.omniTransport = omniTransportLabel()

  const body: Record<string, unknown> = {
    model,
    input,
    store: true,
    response_format: responseFormat,
  }
  if (task) body.generation_config = { video_config: { task } }
  if (omniNeedsPrevious(def) && previousId) body.previous_interaction_id = previousId

  return {
    plan: {
      kind: 'task',
      method: 'POST',
      endpoint: '/v1beta/interactions',
      headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
      body,
    },
    skipped,
    missing,
    targets,
  }
}

function mimeFrom(url: string, contentType: string): string {
  const ct = contentType.split(';')[0].trim().toLowerCase()
  if (ct && ct !== 'application/octet-stream' && ct !== 'text/plain') return ct
  if (/\.png(\?|$)/i.test(url)) return 'image/png'
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp'
  if (/\.gif(\?|$)/i.test(url)) return 'image/gif'
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4'
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm'
  return 'image/jpeg'
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function omniFetchMedia(url: string): Promise<{ mime: string; b64: string }> {
  let resp: Response
  try {
    resp = await fetch(url, { mode: 'cors' })
  } catch {
    throw new Error(`素材跨域读失败：浏览器无法读取 ${url}（目标站未允许 CORS，请换可被页面 fetch 的链接）`)
  }
  if (!resp.ok) throw new Error(`素材跨域读失败：HTTP ${resp.status}`)
  const buf = await resp.arrayBuffer()
  return { mime: mimeFrom(url, resp.headers.get('content-type') || ''), b64: bytesToBase64(buf) }
}

export async function omniMaterializeRequest(
  body: Record<string, unknown>,
  urls: Record<string, string>,
  cache: Map<string, { mime: string; b64: string }>,
  fetchMedia: (url: string) => Promise<{ mime: string; b64: string }> = omniFetchMedia,
): Promise<Record<string, unknown>> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (Array.isArray(v)) return Promise.all(v.map(walk))
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>
      const next: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(src)) {
        if (k === 'data' && typeof val === 'string') {
          const m = /^\{\{(\w+)\}\}$/.exec(val)
          if (m) {
            const slot = m[1]
            const urlKey = SLOT_TO_URL[slot]
            const url = urlKey ? (urls[urlKey] || '').trim() : ''
            if (!url) throw new Error(`缺少素材：${slot}`)
            let hit = cache.get(url)
            if (!hit) {
              hit = await fetchMedia(url)
              cache.set(url, hit)
            }
            next[k] = hit.b64
            next.mime_type = hit.mime
            continue
          }
        }
        // 占位计划里写死了 image/jpeg，不能盖掉 fetch 到的真实 MIME
        if (k === 'mime_type' && typeof src.data === 'string' && /^\{\{\w+\}\}$/.test(src.data)) continue
        next[k] = await walk(val)
      }
      return next
    }
    return v
  }
  return await walk(body) as Record<string, unknown>
}

export function omniBase64ToBlobUrl(data: string, mime: string): string {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'video/mp4' }))
}

export function omniIsCorsError(err: string | null | undefined): boolean {
  if (!err) return false
  return /素材跨域读失败/i.test(err)
}

/** 网关 Files 成片：`/v1beta/files/…:download?alt=media&model=`，必须带 Bearer GET，不能当普通直链 */
export function omniLooksLikeFileUrl(url: string): boolean {
  return /\/v1beta\/files\/|:download\b|[?&]alt=media\b/i.test(url)
}

/** 相对路径拼渠道根；http(s) Files 链改走渠道 origin（保留 path/query），避免网关回 https 而渠道是 http */
export function omniResolveFileUrl(uri: string, baseUrl: string): string {
  const raw = uri.trim()
  if (!raw) return raw
  const root = baseUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(raw)) {
    const path = raw.startsWith('/') ? raw : (raw.startsWith('files/') ? '/v1beta/' + raw : '/' + raw)
    return root + path
  }
  if (!omniLooksLikeFileUrl(raw) || !root) return raw
  try {
    const file = new URL(raw)
    const base = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(root) ? root : `http://${root}`)
    if (file.origin === base.origin) return raw
    return `${base.origin}${file.pathname}${file.search}`
  } catch {
    return raw
  }
}
