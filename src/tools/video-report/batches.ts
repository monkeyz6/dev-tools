import type { VideoRecord } from './types'
import { videoClassify } from './summary'

export const VIDEO_HIST_MAX_BATCHES = 20
const VIDEO_LEGACY_GAP_MS = 3 * 60 * 1000

export interface VideoBatch {
  id: string
  records: VideoRecord[]
  startAt: number
  endAt: number
  channelName: string
  models: string[]
  passed: number
  failed: number
  errored: number
  legacy: boolean
}

function videoBatchOf(id: string, records: VideoRecord[], legacy: boolean): VideoBatch {
  const sorted = [...records].sort((a, b) => b.time - a.time)
  const times = sorted.map(r => r.time)
  const models: string[] = []
  for (const r of sorted) if (r.model && !models.includes(r.model)) models.push(r.model)
  let passed = 0, failed = 0, errored = 0
  for (const r of sorted) {
    const k = videoClassify(r)
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
    models,
    passed, failed, errored,
    legacy,
  }
}

export function videoGroupBatches(records: VideoRecord[]): VideoBatch[] {
  const byRunId = new Map<string, VideoRecord[]>()
  const legacy: VideoRecord[] = []
  for (const r of records) {
    if (r.runId) {
      const list = byRunId.get(r.runId)
      if (list) list.push(r)
      else byRunId.set(r.runId, [r])
    } else {
      legacy.push(r)
    }
  }

  const batches: VideoBatch[] = []
  for (const [runId, list] of byRunId) batches.push(videoBatchOf(runId, list, false))

  const legacyByKey = new Map<string, VideoRecord[]>()
  for (const r of legacy) {
    const key = `${r.channelName}|${r.model}`
    const list = legacyByKey.get(key)
    if (list) list.push(r)
    else legacyByKey.set(key, [r])
  }
  for (const list of legacyByKey.values()) {
    const asc = [...list].sort((a, b) => a.time - b.time)
    let chunk: VideoRecord[] = []
    const flush = () => {
      if (!chunk.length) return
      batches.push(videoBatchOf('legacy:' + chunk[0].id, chunk, true))
      chunk = []
    }
    for (const r of asc) {
      if (chunk.length && r.time - chunk[chunk.length - 1].time > VIDEO_LEGACY_GAP_MS) flush()
      chunk.push(r)
    }
    flush()
  }

  return batches.sort((a, b) => b.endAt - a.endAt)
}

export function videoTrimByBatch(records: VideoRecord[], maxBatches = VIDEO_HIST_MAX_BATCHES): VideoRecord[] {
  const batches = videoGroupBatches(records)
  if (batches.length <= maxBatches) return [...records].sort((a, b) => b.time - a.time)
  const keep = new Set<string>()
  for (const b of batches.slice(0, maxBatches)) for (const r of b.records) keep.add(r.id)
  return records.filter(r => keep.has(r.id)).sort((a, b) => b.time - a.time)
}
