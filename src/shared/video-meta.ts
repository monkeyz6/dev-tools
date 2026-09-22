// 浏览器本地探测视频元数据。视频信息检测与视频接口测试共用，避免两套 <video> 探测逻辑。

const VID_COMMON_RATIOS: [string, number][] = [
  ['21:9', 21 / 9], ['32:9', 32 / 9], ['16:9', 16 / 9], ['16:10', 16 / 10],
  ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:2', 3 / 2], ['1:1', 1],
  ['9:16', 9 / 16], ['9:18', 0.5], ['3:4', 3 / 4], ['2:3', 2 / 3],
]

function vidGcd(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a
}

/** 宽高比：先按常见比例就近吸附（容差 0.025），否则用 GCD 化简，化简后仍过大则退化为小数形式 */
export function vidAspectRatio(w: number, h: number): string {
  if (!w || !h) return '—'
  const r = w / h
  for (const [label, val] of VID_COMMON_RATIOS) {
    if (Math.abs(r - val) < 0.025) return label
  }
  const d = vidGcd(w, h)
  const sw = w / d, sh = h / d
  if (sw > 200 || sh > 200) return r.toFixed(2) + ':1'
  return `${sw}:${sh}`
}

export function vidFormatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function vidParseRatio(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(s).trim())
  if (!m) return null
  const a = parseFloat(m[1]), b = parseFloat(m[2])
  if (!a || !b) return null
  return a / b
}

export function vidCheckRatio(target: string | null | undefined, w: number, h: number, tol = 0.05) {
  const t = vidParseRatio(target)
  if (!t || !w || !h) return null
  const a = w / h
  const dev = Math.abs(a - t) / t
  return { target: t, actual: +a.toFixed(3), devPct: +(dev * 100).toFixed(1), pass: dev <= tol }
}

/**
 * 分辨率两套口径，任一贴合即过：
 * - 面积档：同档 16:9 参考面积（Seedance 720p 1:1 是 960×960，短边不是 720）
 * - 短边档：短边等于档位高度（Seedance 1080p 1:1 实测 1080×1080，面积会偏离 16:9 参考 40%+，会被误判成 720p）
 */
const VID_RESOLUTION_AREA: Array<[string, number]> = [
  ['360p', 640 * 360],
  ['480p', 864 * 480],
  ['720p', 1280 * 720],
  ['1080p', 1920 * 1080],
  ['4k', 3840 * 2160],
]
const VID_RESOLUTION_SHORT: Record<string, number> = {
  '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160,
}
const VID_SHORT_SIDE_TOL = 0.05

export function vidNormalizeResolution(s: string | null | undefined): string | null {
  if (!s) return null
  const v = String(s).trim().toLowerCase()
  if (v === '2160p' || v === 'uhd') return '4k'
  return VID_RESOLUTION_AREA.some(([k]) => k === v) ? v : null
}

/** 面积最接近的档位与相对偏差（%） */
export function vidResolutionTier(w: number, h: number): { tier: string; devPct: number } | null {
  if (!w || !h) return null
  const area = w * h
  let best: { tier: string; devPct: number } | null = null
  for (const [tier, ref] of VID_RESOLUTION_AREA) {
    const devPct = +(Math.abs(area - ref) / ref * 100).toFixed(1)
    if (!best || devPct < best.devPct) best = { tier, devPct }
  }
  return best
}

export function vidCheckResolution(target: string | null | undefined, w: number, h: number, tol = 0.15) {
  const t = vidNormalizeResolution(target)
  if (!t || !w || !h) return null
  const ref = VID_RESOLUTION_AREA.find(([k]) => k === t)![1]
  const areaDev = Math.abs(w * h - ref) / ref
  const nominal = VID_RESOLUTION_SHORT[t]
  const shortDev = nominal ? Math.abs(Math.min(w, h) - nominal) / nominal : Number.POSITIVE_INFINITY
  const areaPass = areaDev <= tol
  const shortPass = shortDev <= VID_SHORT_SIDE_TOL
  const pass = areaPass || shortPass
  const via = areaPass ? 'area' as const : shortPass ? 'short' as const : null
  const nearest = pass ? t : (vidResolutionTier(w, h)?.tier ?? '—')
  const dev = areaPass ? areaDev : shortPass ? shortDev : Math.min(areaDev, shortDev)
  return {
    target: t,
    nearest,
    via,
    areaDevPct: +(areaDev * 100).toFixed(1),
    shortDevPct: +(shortDev * 100).toFixed(1),
    devPct: +(dev * 100).toFixed(1),
    pass,
  }
}

/** 尽力检测音轨：Firefox mozHasAudio、Safari audioTracks、Chrome 需静音播一小段看 webkitAudioDecodedByteCount；都拿不到回 null */
async function vidDetectAudio(video: HTMLVideoElement, capMs = 3000): Promise<boolean | null> {
  const v = video as HTMLVideoElement & { mozHasAudio?: boolean; audioTracks?: { length: number }; webkitAudioDecodedByteCount?: number }
  if (typeof v.mozHasAudio === 'boolean') return v.mozHasAudio
  if (v.audioTracks && typeof v.audioTracks.length === 'number') return v.audioTracks.length > 0
  if (typeof v.webkitAudioDecodedByteCount !== 'number') return null
  const attempt = (async () => {
    video.muted = true
    video.playsInline = true
    try { await video.play() } catch { return null }
    await new Promise(r => setTimeout(r, 600))
    try { video.pause() } catch { /* ignore */ }
    return (v.webkitAudioDecodedByteCount ?? 0) > 0
  })()
  const cap = new Promise<null>(r => setTimeout(() => r(null), capMs))
  return Promise.race([attempt, cap])
}

export type VideoProbeResult = {
  width: number
  height: number
  duration: number
  hasAudio: boolean | null
  /** 可塞进 <video src> 的地址：直链能播就是原 URL，否则是 fetch 出来的 blob: */
  playUrl: string
}

export function videoIsRemoteHttpUrl(src: string) {
  return /^https?:\/\//i.test(src)
}

/** 火山 TOS 签名成片：HEAD 常 403、Content-Disposition: attachment，<video> 不稳 */
export function videoLooksLikeSignedTosUrl(src: string) {
  return /tos-|volces\.com|X-Tos-|ark-acg-/i.test(src)
}

function mp4Type(view: DataView, off: number) {
  return String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3))
}

function mp4Walk(view: DataView, start: number, end: number, visit: (type: string, payload: number, boxEnd: number) => void) {
  let off = start
  while (off + 8 <= end) {
    let size = view.getUint32(off)
    const type = mp4Type(view, off + 4)
    let hdr = 8
    if (size === 1) {
      if (off + 16 > end) break
      const big = view.getBigUint64(off + 8)
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(big)
      hdr = 16
    } else if (size === 0) {
      size = end - off
    }
    if (size < hdr) break
    const boxEnd = Math.min(off + size, end)
    visit(type, off + hdr, boxEnd)
    if (size === 0 || off + size <= off) break
    off += size
  }
}

/**
 * 从 ISO BMFF 读宽高时长。Seedance TOS 成片的 tkhd 宽度经常是 0，要以 stsd 视觉样本为准。
 * 有 vide/soun handler 就能判断音轨，不依赖 video 元素。
 */
export function parseMp4Meta(buf: ArrayBuffer): { width: number; height: number; duration: number; hasAudio: boolean | null } | null {
  if (buf.byteLength < 16) return null
  const view = new DataView(buf)
  let movieDur = 0
  let videoDur = 0
  let width = 0
  let height = 0
  let hasVideo = false
  let hasAudio = false

  const readTimeSec = (payload: number, boxEnd: number) => {
    if (payload >= boxEnd) return 0
    const ver = view.getUint8(payload)
    if (ver === 1 && payload + 32 <= boxEnd) {
      const ts = view.getUint32(payload + 20)
      const dur = Number(view.getBigUint64(payload + 24))
      return ts ? dur / ts : 0
    }
    if (payload + 20 <= boxEnd) {
      const ts = view.getUint32(payload + 12)
      const dur = view.getUint32(payload + 16)
      return ts ? dur / ts : 0
    }
    return 0
  }

  const readStsdVisual = (payload: number, boxEnd: number) => {
    if (payload + 16 > boxEnd) return
    if (!view.getUint32(payload + 4)) return
    mp4Walk(view, payload + 8, boxEnd, (sampleType, samplePayload, sampleEnd) => {
      if (sampleEnd - samplePayload < 28) return
      if (!/^(avc1|avc3|hvc1|hev1|vp09|av01|mp4v|encv)$/.test(sampleType)) return
      const w = view.getUint16(samplePayload + 24)
      const h = view.getUint16(samplePayload + 26)
      if (w && h) { width = w; height = h }
    })
  }

  const walkTrackBoxes = (start: number, end: number, state: { handler: string; duration: number }) => {
    mp4Walk(view, start, end, (type, payload, boxEnd) => {
      if (type === 'mdia' || type === 'minf' || type === 'stbl') {
        walkTrackBoxes(payload, boxEnd, state)
        return
      }
      if (type === 'hdlr' && payload + 12 <= boxEnd) state.handler = mp4Type(view, payload + 8)
      if (type === 'mdhd') state.duration = readTimeSec(payload, boxEnd)
      if (type === 'stsd') readStsdVisual(payload, boxEnd)
    })
  }

  mp4Walk(view, 0, view.byteLength, (type, payload, boxEnd) => {
    if (type !== 'moov') return
    mp4Walk(view, payload, boxEnd, (inner, ip, ie) => {
      if (inner === 'mvhd') {
        const sec = readTimeSec(ip, ie)
        if (sec > 0) movieDur = sec
      }
      if (inner === 'trak') {
        const state = { handler: '', duration: 0 }
        walkTrackBoxes(ip, ie, state)
        if (state.handler === 'soun') hasAudio = true
        if (state.handler === 'vide') {
          hasVideo = true
          if (state.duration > 0) videoDur = state.duration
        }
      }
    })
  })

  if (!width || !height) return null
  const duration = videoDur > 0 ? videoDur : movieDur
  if (!(duration > 0)) return null
  return { width, height, duration, hasAudio: hasVideo || hasAudio ? hasAudio : null }
}

function videoReleaseEl(video: HTMLVideoElement) {
  video.onloadedmetadata = null
  video.onerror = null
  video.removeAttribute('src')
  video.load()
  video.remove()
}

/** TOS 签名链常只签 GET：HEAD 会 403，部分引擎的 <video> 先发 HEAD 就 onerror；成片还带 Content-Disposition: attachment。CORS 允许时改 GET 拉成 blob 再播。 */
export async function fetchVideoObjectUrl(src: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(src, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' })
    if (!resp.ok) throw new Error(`拉取视频失败 HTTP ${resp.status}`)
    const blob = await resp.blob()
    if (!blob.size) throw new Error('拉取视频为空')
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'video/mp4'
    const playable = blob.type === type ? blob : new Blob([blob], { type })
    return URL.createObjectURL(playable)
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`拉取视频超时（${Math.round(timeoutMs / 1000)}s）`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function probeWithElement(src: string, timeoutMs: number, opts: { detectAudio?: boolean }): Promise<Omit<VideoProbeResult, 'playUrl'>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.referrerPolicy = 'no-referrer'
    video.setAttribute('playsinline', '')
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body?.appendChild(video)
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      videoReleaseEl(video)
    }
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`加载超时（${Math.round(timeoutMs / 1000)}s），请检查链接是否可访问`)))
    }, timeoutMs)
    video.onloadedmetadata = () => {
      if (settled) return
      const { videoWidth: width, videoHeight: height, duration } = video
      if (!width || !height) {
        finish(() => reject(new Error('无法读取视频尺寸，文件可能已损坏或格式不受支持')))
        return
      }
      if (!opts.detectAudio) {
        finish(() => resolve({ width, height, duration, hasAudio: null }))
        return
      }
      settled = true
      clearTimeout(timer)
      vidDetectAudio(video).catch(() => null).then(hasAudio => {
        videoReleaseEl(video)
        resolve({ width, height, duration, hasAudio })
      })
    }
    video.onerror = () => {
      finish(() => reject(new Error('无法加载视频，链接可能已失效或不允许访问')))
    }
    video.src = src
  })
}

async function probeFromObjectUrl(blobUrl: string, timeoutMs: number, opts: { detectAudio?: boolean }): Promise<VideoProbeResult> {
  try {
    const bytes = await (await fetch(blobUrl)).arrayBuffer()
    const parsed = parseMp4Meta(bytes)
    if (parsed && parsed.width && parsed.height && parsed.duration > 0) {
      return { ...parsed, playUrl: blobUrl }
    }
  } catch { /* 再交给 <video> */ }
  const meta = await probeWithElement(blobUrl, timeoutMs, opts)
  return { ...meta, playUrl: blobUrl }
}

/**
 * 探测视频元数据。blob/data 与火山 TOS 签名成片先读 moov/stsd 宽高（tkhd 宽度经常是 0），
 * 不依赖 <video>；其它地址仍先走播放器，失败再 fetch。`playUrl` 若是 blob: 由调用方 revoke。
 */
export async function probeVideoMeta(src: string, timeoutMs = 20000, opts: { detectAudio?: boolean } = {}): Promise<VideoProbeResult> {
  const started = Date.now()
  const remaining = () => Math.max(timeoutMs - (Date.now() - started), 800)
  const local = src.startsWith('blob:') || src.startsWith('data:')
  if (local) return probeFromObjectUrl(src, timeoutMs, opts)
  const tos = videoIsRemoteHttpUrl(src) && videoLooksLikeSignedTosUrl(src)

  if (tos) {
    try {
      const blobUrl = await fetchVideoObjectUrl(src, timeoutMs)
      try {
        return await probeFromObjectUrl(blobUrl, remaining(), opts)
      } catch (e) {
        URL.revokeObjectURL(blobUrl)
        throw e
      }
    } catch {
      /* 拉不下来再试直链播放器 */
    }
  }

  try {
    const meta = await probeWithElement(src, tos ? remaining() : timeoutMs, opts)
    return { ...meta, playUrl: src }
  } catch (err) {
    if (!videoIsRemoteHttpUrl(src) || remaining() < 800) throw err
    let blobUrl: string | null = null
    try {
      blobUrl = await fetchVideoObjectUrl(src, remaining())
      return await probeFromObjectUrl(blobUrl, remaining(), opts)
    } catch {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      throw err
    }
  }
}
