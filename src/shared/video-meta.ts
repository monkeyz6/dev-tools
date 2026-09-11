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

/** 分辨率档位按同档 16:9 参考面积对比，任何比例都能验（Seedance 的 720p 在 1:1 时是 960×960，短边并不等于 720） */
const VID_RESOLUTION_AREA: Array<[string, number]> = [
  ['480p', 864 * 480],
  ['720p', 1280 * 720],
  ['1080p', 1920 * 1080],
  ['4k', 3840 * 2160],
]

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
  const dev = Math.abs(w * h - ref) / ref
  const nearest = vidResolutionTier(w, h)
  return { target: t, nearest: nearest?.tier ?? '—', devPct: +(dev * 100).toFixed(1), pass: dev <= tol }
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

/** 探测视频元数据：不挂载 DOM 的 <video preload="metadata">，超时/失败均 reject 并清空 src 释放资源。`detectAudio` 打开后多返回 hasAudio（尽力，测不出为 null） */
export function probeVideoMeta(src: string, timeoutMs = 20000, opts: { detectAudio?: boolean } = {}): Promise<{ width: number; height: number; duration: number; hasAudio: boolean | null }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      video.src = ''
      reject(new Error(`加载超时（${Math.round(timeoutMs / 1000)}s），请检查链接是否可访问`))
    }, timeoutMs)
    video.onloadedmetadata = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const { videoWidth: width, videoHeight: height, duration } = video
      if (!width || !height) { video.src = ''; reject(new Error('无法读取视频尺寸，文件可能已损坏或格式不受支持')); return }
      if (!opts.detectAudio) { video.src = ''; resolve({ width, height, duration, hasAudio: null }); return }
      vidDetectAudio(video).catch(() => null).then(hasAudio => {
        video.src = ''
        resolve({ width, height, duration, hasAudio })
      })
    }
    video.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.src = ''
      reject(new Error('无法加载视频，链接可能已失效或不允许访问'))
    }
    video.src = src
  })
}
