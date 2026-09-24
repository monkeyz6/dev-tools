/** 生成任务路径，不含可选的 /byteplus 前缀。 */
export const VIDEO_TASK_ENDPOINT = '/api/v3/contents/generations/tasks'

export function videoAssetEndpoint(action: 'CreateAssetGroup' | 'CreateAsset' | 'GetAsset') {
  return `/?Action=${action}&Version=2024-01-01`
}

/** 整段 baseUrl 里出现 oinone 或 ainowork（忽略大小写）才走网关的 /byteplus 前缀。 */
export function videoNeedsByteplusPrefix(baseUrl: string) {
  return /oinone|ainowork/i.test(baseUrl)
}

/**
 * 把 Seedance 路径接到渠道根上。
 * 需要前缀且根末尾还不是 /byteplus 时插入一次；末尾已有则不再加。
 * endpoint 本身不要带 /byteplus。
 */
export function videoSeedanceUrl(baseUrl: string, endpoint: string): string {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const needs = videoNeedsByteplusPrefix(root)
  const rooted = needs && !/\/byteplus$/i.test(root) ? `${root}/byteplus` : root
  return rooted + ep
}

/** 预览用的路径（含 query），不带渠道根。 */
export function videoSeedancePath(baseUrl: string, endpoint: string): string {
  const full = videoSeedanceUrl(baseUrl, endpoint)
  if (/^https?:\/\//i.test(full)) {
    try {
      const u = new URL(full)
      return u.pathname + u.search
    } catch { /* 落到下面的相对路径 */ }
  }
  return full.startsWith('/') ? full : `/${full}`
}
