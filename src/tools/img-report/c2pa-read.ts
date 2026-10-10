// 浏览器里懒加载 c2pa-web。开关关闭时不要 import 这个模块。

import { sniffImageMime } from './carrier'
import { imgC2paSettings, imgC2paUnavailable, imgC2paUnreadable, imgSummarizeC2pa } from './c2pa'
import type { ImgC2paResult } from './types'

// 只用签名列表。时间戳列表若并进 manifest 锚，只在 TSA 列表里的根也会被当成签名根认可。
const SIGNER_PEM_URL = 'https://cdn.jsdelivr.net/gh/c2pa-org/conformance-public@main/trust-list/C2PA-TRUST-LIST.pem'
const TRUST_TIMEOUT_MS = 15_000
/** 拉取失败后这段时间内不再重试，直接判「未核对」。墙内一批图只等第一张。 */
const TRUST_RETRY_AFTER_MS = 5 * 60_000
const SOURCE_TIMEOUT_MS = 300_000

type C2paHandle = {
  c2pa: Awaited<ReturnType<typeof import('@contentauth/c2pa-web').createC2pa>>
  Reader: typeof import('@contentauth/c2pa-web').Reader
  Context: typeof import('@contentauth/c2pa-web').Context
}

let sdkPromise: Promise<C2paHandle> | null = null
let trustPromise: Promise<string | null> | null = null
let trustFailedAt = 0
let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job)
  chain = run.then(() => undefined, () => undefined)
  return run
}

/** 连同正文一起计时：响应头到了、正文卡住也会超时。HTTP 非 2xx 时返回状态码。 */
async function fetchWithTimeout<T>(url: string, ms: number, read: (res: Response) => Promise<T>): Promise<{ ok: true; body: T } | { ok: false; status: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, body: await read(res) }
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`请求超时（${Math.round(ms / 1000)}s）`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function loadSdk(): Promise<C2paHandle> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const [{ createC2pa, Reader, Context }, wasmMod] = await Promise.all([
        import('@contentauth/c2pa-web'),
        import('@contentauth/c2pa-web/resources/c2pa.wasm?url'),
      ])
      const c2pa = await createC2pa({ wasmSrc: wasmMod.default })
      return { c2pa, Reader, Context }
    })()
    sdkPromise.catch(() => { sdkPromise = null })
  }
  return sdkPromise
}

/** 拉不到就返回 null（本次不核信任）。失败记下时间，过了 TRUST_RETRY_AFTER_MS 才重拉。 */
async function loadTrustPem(): Promise<string | null> {
  if (!trustPromise) {
    if (Date.now() - trustFailedAt < TRUST_RETRY_AFTER_MS) return null
    const job = (async () => {
      try {
        const res = await fetchWithTimeout(SIGNER_PEM_URL, TRUST_TIMEOUT_MS, r => r.text())
        return res.ok && res.body.includes('BEGIN CERTIFICATE') ? res.body : null
      } catch {
        return null
      }
    })()
    trustPromise = job
    void job.then(pem => {
      if (pem || trustPromise !== job) return
      trustPromise = null
      trustFailedAt = Date.now()
    })
  }
  return trustPromise
}

/** 按文件头字节定格式。HTTP Content-Type 常是 octet-stream，data URI 的标签也可能写错；认不出交给 c2pa-rs 自己探测。 */
async function sniffFormat(blob: Blob): Promise<string | undefined> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  return sniffImageMime(btoa(String.fromCharCode(...head))) ?? undefined
}

async function readOne(blob: Blob): Promise<ImgC2paResult> {
  let reader: Awaited<ReturnType<C2paHandle['Reader']['fromBlob']>> = null
  try {
    const [{ c2pa, Reader, Context }, pem] = await Promise.all([loadSdk(), loadTrustPem()])
    const trustChecked = !!pem
    reader = await Reader.fromBlob(c2pa, await sniffFormat(blob), blob, new Context(imgC2paSettings(pem)))
    if (!reader) return imgSummarizeC2pa(null, { trustChecked })
    const manifestStore = await reader.manifestStore()
    let cr: unknown
    try { cr = await reader.crJson() } catch { /* 证书细节拿不到不影响结论 */ }
    return imgSummarizeC2pa(manifestStore, { trustChecked }, cr)
  } catch (e) {
    return imgC2paUnreadable(e instanceof Error ? e.message : String(e))
  } finally {
    if (reader) {
      try { await reader.free() } catch { /* 释放失败不影响已经拿到的结论 */ }
    }
  }
}

export function imgReadC2paBlob(blob: Blob): Promise<ImgC2paResult> {
  return enqueue(() => readOne(blob))
}

export async function imgReadC2paSource(source: { dataUri?: string | null; url?: string | null }): Promise<ImgC2paResult> {
  try {
    if (source.dataUri) {
      const res = await fetch(source.dataUri)
      if (!res.ok) return imgC2paUnavailable(`HTTP ${res.status}`)
      return imgReadC2paBlob(await res.blob())
    }
    if (source.url && /^https?:/i.test(source.url)) {
      const res = await fetchWithTimeout(source.url, SOURCE_TIMEOUT_MS, r => r.blob())
      if (!res.ok) return imgC2paUnavailable(`HTTP ${res.status}`)
      return imgReadC2paBlob(res.body)
    }
    return imgC2paUnavailable('没有原图')
  } catch (e) {
    return imgC2paUnavailable(e instanceof Error ? e.message : '无法读取原图')
  }
}
