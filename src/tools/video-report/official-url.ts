/** Seedance 成片官方桶。只比对 hostname，不拿 videoLooksLikeSignedTosUrl 那种宽匹配来判。 */
export const VIDEO_OFFICIAL_HOST_DOUBAO = 'ark-acg-cn-beijing.tos-cn-beijing.volces.com'
export const VIDEO_OFFICIAL_HOST_DREAMINA = 'ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com'
export const VIDEO_OFFICIAL_REGION_TARGET = '模型名含 doubao 或 dreamina 之一'

export interface VideoOfficialUrlVerdict {
  pass: boolean
  target: string
  actual: string
}

function describeVideoUrl(videoUrl: string): { kind: 'ok'; host: string } | { kind: 'bad'; actual: string } {
  let u: URL
  try {
    u = new URL(videoUrl)
  } catch {
    return { kind: 'bad', actual: '无法解析' }
  }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:') return { kind: 'bad', actual: host ? `非 https · ${host}` : '非 https' }
  if (!host) return { kind: 'bad', actual: '无法解析' }
  if (u.port && u.port !== '443') return { kind: 'bad', actual: `带端口 · ${host}:${u.port}` }
  return { kind: 'ok', host }
}

/**
 * 要核对的是网关返回的远程成片地址。
 * TOS 探测成功后 `videoUrl` 会换成 blob: 以便播放，原始 https 留在 `targets.outputUri`。
 */
export function videoOfficialLink(rec: { videoUrl?: string | null; targets?: { outputUri?: unknown } }): string | null {
  const uri = rec.targets?.outputUri
  if (typeof uri === 'string' && /^https?:\/\//i.test(uri)) return uri
  if (rec.videoUrl && /^https?:\/\//i.test(rec.videoUrl)) return rec.videoUrl
  return rec.videoUrl || null
}

/**
 * 按模型名认官方成片域名。
 * 含 doubao 且不含 dreamina → 北京桶；含 dreamina 且不含 doubao → 新加坡桶。
 * 两个都有或都没有，无法判断地域。
 * 只认 https、默认端口，路径和签名 query 忽略。
 */
export function videoOfficialUrlVerdict(model: string, videoUrl: string): VideoOfficialUrlVerdict {
  const m = model.toLowerCase()
  const doubao = m.includes('doubao')
  const dreamina = m.includes('dreamina')
  if (doubao === dreamina) {
    return { pass: false, target: VIDEO_OFFICIAL_REGION_TARGET, actual: '无法按模型判断地域' }
  }
  const expected = doubao ? VIDEO_OFFICIAL_HOST_DOUBAO : VIDEO_OFFICIAL_HOST_DREAMINA
  const parsed = describeVideoUrl(videoUrl)
  if (parsed.kind !== 'ok') return { pass: false, target: expected, actual: parsed.actual }
  return { pass: parsed.host === expected, target: expected, actual: parsed.host }
}
