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
  return st === 'succeeded' || st === 'success' || st === 'completed'
}

function videoTaskFailed(st: string) {
  return st === 'failed' || st === 'failure' || st === 'cancelled'
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

export function videoReprobeSrc(rec: Pick<VideoRecord, 'videoUrl' | 'targets'>): string | null {
  const uri = typeof rec.targets?.outputUri === 'string' ? rec.targets.outputUri : ''
  if (/^https?:\/\//i.test(uri)) return uri
  if (rec.videoUrl && /^https?:\/\//i.test(rec.videoUrl)) return rec.videoUrl
  if (rec.videoUrl && (rec.videoUrl.startsWith('blob:') || rec.videoUrl.startsWith('data:'))) return rec.videoUrl
  return null
}

export function videoHasUsableProbe(rec: Pick<VideoRecord, 'probe'>): boolean {
  return !!(rec.probe && rec.probe.w && rec.probe.h && rec.probe.duration > 0)
}

/**
 * 能否重新识别成片：有地址或已有元数据，且还没读到宽高、或校验未通过。
 * 只重探 / 重算校验，不重提任务。已通过的不再打扰。
 */
export function videoCanReprobe(rec: Pick<VideoRecord, 'videoUrl' | 'probe' | 'kind' | 'targets' | 'ok' | 'checks'>): boolean {
  if (rec.kind === 'material-group' || rec.kind === 'material-assets') return false
  const src = videoReprobeSrc(rec)
  const probed = videoHasUsableProbe(rec)
  if (!src && !probed) return false
  if (!probed) return true
  if (rec.ok === false) return true
  return (rec.checks || []).some(c => !c.info && !c.pass)
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
