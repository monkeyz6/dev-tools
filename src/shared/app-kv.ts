// ─── 应用键值存储：IndexedDB 持久化 + 内存同步缓存 ────────────────────────────────
//
// 工具配置、渠道（含 AES-GCM 加密的 API Key）、提示词库等原先散落在 localStorage，
// 与历史记录共享同一份 5-10MB 配额且每次都整串 stringify 写入。迁移到 IndexedDB
// （dev-toolkit-history 库的 kv store）后配额大得多，也便于统一管理。
//
// 读写模型：App 挂载时先 kvHydrate() 把整个 kv store 载入内存 Map（数据量小，毫秒级），
// 工具挂载前即完成——因此各工具原有的「useState 懒初始化器同步读配置」模式不用改成
// 异步水合，只需把 localStorage.getItem/setItem 换成 kvGet/kvSet。写入是写穿：先改
// 内存，再异步落库（失败时回退写 localStorage，键仍在迁移清单里，下次启动可自愈迁回）。
//
// 说明：IndexedDB 与 localStorage 同源页面 JS 均可读取，本迁移不是密级提升；
// API Key 的保护仍靠 shared/api-key-crypto.ts 的 AES-GCM 加密。
//
// 值统一为字符串（与 localStorage 语义一致），JSON 的解析/序列化仍由各工具自己做。

import { kvDbGetAllEntries, kvDbSet, kvDbRemove } from './history-db'

/** 一次性迁移清单：这些 localStorage key 首次水合时搬进 kv store 并删除旧 key。
    主题（dev-toolkit-theme）/侧栏折叠态除外——首帧渲染前需同步读取，留在 localStorage。 */
const LEGACY_LOCALSTORAGE_KEYS = [
  // LLM 批量测试（llmbatch-key 为更早版本的单一加密 key，仅供渠道迁移读取）
  'llmbatch-config', 'llmbatch-key', 'llmbatch-prompts', 'llmbatch-channels', 'llmbatch-active-channel',
  // 模型探测
  'modelprobe-config', 'modelprobe-key', 'modelprobe-channels', 'modelprobe-active-channel',
  // 图片接口测试
  'imgtest-channels', 'imgtest-active', 'imgtest-prices', 'imgtest-rate', 'imgtest-ui', 'imgtest-hideprices',
  // 提示词优化
  'promptopt-channels', 'promptopt-active', 'promptopt-ui',
  // LLM 报告生成
  'llmreport-opts', 'llmreport-title',
  // 小工具配置
  'idgen-opts', 'base64-opts', 'unicode-opts',
  // 汇率
  'seedance-fx-rate', 'ai-cost-fx-rate',
] as const

const cache = new Map<string, string>()
let dbAvailable = true
let hydratePromise: Promise<void> | null = null

/** 启动时调用一次：整表载入内存 + 迁移 legacy localStorage。工具渲染前必须完成。 */
export function kvHydrate(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const entries = await kvDbGetAllEntries()
        entries.forEach((v, k) => cache.set(k, v))
      } catch {
        dbAvailable = false
      }
      for (const key of LEGACY_LOCALSTORAGE_KEYS) {
        if (cache.has(key)) continue
        let raw: string | null = null
        try { raw = localStorage.getItem(key) } catch { break }
        if (raw == null) continue
        cache.set(key, raw)
        if (!dbAvailable) continue
        // 落库成功才删旧 key；失败保留，下次启动重试，避免数据丢失
        try {
          await kvDbSet(key, raw)
          localStorage.removeItem(key)
        } catch { /* keep legacy key for retry */ }
      }
    })()
  }
  return hydratePromise
}

/** 同步读（需在 kvHydrate 完成后调用；App 已在工具渲染前保证这一点）。 */
export function kvGet(key: string): string | null {
  return cache.has(key) ? cache.get(key)! : null
}

/** 写穿：同步改内存，异步落库；库不可用时回退 localStorage（下次启动自愈迁回）。 */
export function kvSet(key: string, value: string): void {
  cache.set(key, value)
  if (dbAvailable) {
    kvDbSet(key, value).catch(() => {
      try { localStorage.setItem(key, value) } catch { /* ignore */ }
    })
  } else {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  }
}

export function kvRemove(key: string): void {
  cache.delete(key)
  if (dbAvailable) kvDbRemove(key).catch(() => { /* ignore */ })
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
