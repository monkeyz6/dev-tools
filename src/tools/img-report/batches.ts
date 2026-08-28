// 历史记录的「批次」视图：一次「全部运行 / 运行选中」是一批，之后的单条补跑归入当前批。
// 纯函数，不依赖 React，方便 ImgApiTestTool.tsx 与 e2e 之外的单元验证复用。

import type { ImgApiType, ImgRecord } from './types'
import { imgClassify } from './summary'

/** 历史按批裁剪，保留最近这么多批（不再按条裁剪，避免出现被切成半批的旧记录） */
export const IMG_HIST_MAX_BATCHES = 20

/** 旧记录没有 runId，同渠道 + 同接口 + 同模型且相邻记录间隔小于这个值就算一批 */
const IMG_LEGACY_GAP_MS = 3 * 60 * 1000

export interface ImgBatch {
  id: string
  records: ImgRecord[]
  startAt: number
  endAt: number
  channelName: string
  apiType: ImgApiType
  models: string[]
  passed: number
  failed: number
  errored: number
  /** 无 runId 的旧记录靠时间窗口兜底分组，展示时可以标一下 */
  legacy: boolean
}

function imgBatchOf(id: string, records: ImgRecord[], legacy: boolean): ImgBatch {
  const sorted = [...records].sort((a, b) => b.time - a.time)
  const times = sorted.map(r => r.time)
  const models: string[] = []
  for (const r of sorted) if (r.model && !models.includes(r.model)) models.push(r.model)
  let passed = 0, failed = 0, errored = 0
  for (const r of sorted) {
    const k = imgClassify(r)
    if (k === 'pass') passed++
    else if (k === 'fail') failed++
    else errored++
  }
  return {
    id,
    records: sorted,
    startAt: times.length ? Math.min(...times) : 0,
    endAt: times.length ? Math.max(...times) : 0,
    channelName: sorted[0]?.channelName || '',
    apiType: sorted[0]?.apiType ?? 'openai',
    models,
    passed, failed, errored,
    legacy,
  }
}

/**
 * 按批分组，最新的批在前。
 * 有 runId 的按 runId 归组；旧记录按「渠道 + 接口 + 模型」相同且相邻间隔 < 3 分钟聚成一批。
 * 时间窗口是启发式的：手动补跑的单条可能被并进相邻批次，属可接受误差。
 */
export function imgGroupBatches(records: ImgRecord[]): ImgBatch[] {
  const byRunId = new Map<string, ImgRecord[]>()
  const legacy: ImgRecord[] = []
  for (const r of records) {
    if (r.runId) {
      const list = byRunId.get(r.runId)
      if (list) list.push(r)
      else byRunId.set(r.runId, [r])
    } else {
      legacy.push(r)
    }
  }

  const batches: ImgBatch[] = []
  for (const [runId, list] of byRunId) batches.push(imgBatchOf(runId, list, false))

  const legacyByKey = new Map<string, ImgRecord[]>()
  for (const r of legacy) {
    const key = `${r.channelName}|${r.apiType}|${r.model}`
    const list = legacyByKey.get(key)
    if (list) list.push(r)
    else legacyByKey.set(key, [r])
  }
  for (const list of legacyByKey.values()) {
    const asc = [...list].sort((a, b) => a.time - b.time)
    let chunk: ImgRecord[] = []
    const flush = () => {
      if (!chunk.length) return
      batches.push(imgBatchOf('legacy:' + chunk[0].id, chunk, true))
      chunk = []
    }
    for (const r of asc) {
      if (chunk.length && r.time - chunk[chunk.length - 1].time > IMG_LEGACY_GAP_MS) flush()
      chunk.push(r)
    }
    flush()
  }

  return batches.sort((a, b) => b.endAt - a.endAt)
}

/** 只留最近 N 批的记录，返回保留下来的记录（顺序仍按时间倒序） */
export function imgTrimByBatch(records: ImgRecord[], maxBatches = IMG_HIST_MAX_BATCHES): ImgRecord[] {
  const batches = imgGroupBatches(records)
  if (batches.length <= maxBatches) return [...records].sort((a, b) => b.time - a.time)
  const keep = new Set<string>()
  for (const b of batches.slice(0, maxBatches)) for (const r of b.records) keep.add(r.id)
  return records.filter(r => keep.has(r.id)).sort((a, b) => b.time - a.time)
}
