// ─── 共享历史记录存储：IndexedDB（多个工具各自一个 object store）────────────────
//
// LLM 批量测试 / 模型探测 / 图片接口测试 的历史记录原先各自整份写入 localStorage，
// 写入超出浏览器配额（同一域名下几个工具共享同一份 5-10MB 配额）时会从最旧记录开始
// 静默裁剪重试，极端情况下会一路裁到只剩最新 1 条。迁移到 IndexedDB 后配额从
// ~5-10MB 提升到几百 MB 甚至更多，从根本上摆脱这个失败模式。
//
// 排序/裁剪逻辑（各工具的时间字段名不同：ImgRecord.time / BatchReport.startTime /
// ProbeReport.completedAt）不做成通用参数，由各工具自己实现，这里只提供最基础的 CRUD。

const HISTORY_DB_NAME = 'dev-toolkit-history'
const HISTORY_DB_VERSION = 1
const HISTORY_STORES = ['imgtest', 'llmbatch', 'modelprobe'] as const
export type HistoryStore = typeof HISTORY_STORES[number]

let dbPromise: Promise<IDBDatabase> | null = null
function openHistoryDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return }
      const req = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const name of HISTORY_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise = p
    p.catch(() => { dbPromise = null })
  }
  return dbPromise
}

export async function historyDbGetAll<T>(store: HistoryStore): Promise<T[]> {
  try {
    const db = await openHistoryDb()
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  } catch { return [] }
}

export async function historyDbPutOne<T extends { id: string }>(store: HistoryStore, rec: T): Promise<void> {
  const db = await openHistoryDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(rec)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function historyDbPutMany<T extends { id: string }>(store: HistoryStore, recs: T[]): Promise<void> {
  if (!recs.length) return
  const db = await openHistoryDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    recs.forEach(r => os.put(r))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function historyDbDeleteOne(store: HistoryStore, id: string): Promise<void> {
  const db = await openHistoryDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function historyDbDeleteMany(store: HistoryStore, ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await openHistoryDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    ids.forEach(id => os.delete(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function historyDbClear(store: HistoryStore): Promise<void> {
  const db = await openHistoryDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 一次性迁移：把旧版整份存在 localStorage 的历史记录数组搬进 IndexedDB。
 * 迁移成功后清空旧 localStorage key；IndexedDB 不可用等原因导致迁移失败时保留旧 key，
 * 不清空，下次加载再试一次，避免数据丢失。
 */
export async function historyDbMigrateFromLocalStorage<T extends { id: string }>(
  store: HistoryStore,
  localStorageKey: string,
  transform?: (r: T) => T,
): Promise<void> {
  if (typeof window === 'undefined') return
  let raw: string | null = null
  try { raw = localStorage.getItem(localStorageKey) } catch { return }
  if (!raw) return
  try {
    const list = JSON.parse(raw)
    if (Array.isArray(list) && list.length) {
      const recs: T[] = transform ? list.map(transform) : list
      await historyDbPutMany(store, recs)
    }
    localStorage.removeItem(localStorageKey)
  } catch { /* 迁移失败，保留旧 key，下次加载再试 */ }
}
