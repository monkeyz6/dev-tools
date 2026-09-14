import type { VideoCaseKind, VideoRecord } from './types.ts'

export type VideoRetryAction = 'requery' | 'resubmit'

export type VideoRetryCase = {
  selected: boolean
  status: 'idle' | 'running' | 'pass' | 'fail' | 'error'
  kind: VideoCaseKind
  def: { expect: string }
  result?: Pick<VideoRecord, 'taskId' | 'taskStatus' | 'kind' | 'videoUrl'> | null
}

function videoTaskSucceeded(st: string) {
  return st === 'succeeded' || st === 'success'
}

function videoTaskFailed(st: string) {
  return st === 'failed' || st === 'failure'
}

/**
 * 能否手动重试查询：拿到了任务 id、不是素材类记录，且任务还没到终态
 * （succeeded 但没拿到 video_url 也算——可能是响应被截断，再查一次）。
 */
export function videoCanRequery(rec: Pick<VideoRecord, 'taskId' | 'taskStatus' | 'kind' | 'videoUrl'>): boolean {
  if (!rec.taskId || rec.kind === 'material-group' || rec.kind === 'material-assets') return false
  const st = rec.taskStatus || ''
  if (videoTaskFailed(st)) return false
  if (videoTaskSucceeded(st) && rec.videoUrl) return false
  return true
}

export function videoRetryAction(rec: Pick<VideoRecord, 'taskId' | 'taskStatus' | 'kind' | 'videoUrl'> | null | undefined): VideoRetryAction {
  return rec && videoCanRequery(rec) ? 'requery' : 'resubmit'
}

export function videoRetrySortRank(c: { kind: VideoCaseKind; def: { expect: string } }): number {
  if (c.kind === 'material-group') return 0
  if (c.kind === 'material-assets') return 1
  if (c.def.expect === 'reject') return 3
  return 2
}

export function videoRetrySort<T extends { kind: VideoCaseKind; def: { expect: string } }>(list: T[]): T[] {
  return [...list].sort((a, b) => videoRetrySortRank(a) - videoRetrySortRank(b))
}

/** 已勾选且请求失败的用例，按与批量运行相同的顺序（素材组 → 素材登记 → 普通 → 拒绝类） */
export function videoRetryTargets<T extends VideoRetryCase>(cases: T[]): T[] {
  return videoRetrySort(cases.filter(c => c.selected && c.status === 'error'))
}
