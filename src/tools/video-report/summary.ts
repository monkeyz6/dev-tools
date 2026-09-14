import type { VideoCheck, VideoExpect, VideoRecord } from './types'

export type VideoSupportLevel = 'ok' | 'partial' | 'fail'

export function videoVerdict(checks: VideoCheck[]): { level: 'ok' | 'fail' | 'warn'; text: string } {
  const real = checks.filter(x => !x.info)
  const fail = real.filter(x => !x.pass).length
  if (!real.length) return { level: 'warn', text: '无校验项' }
  if (!fail) return { level: 'ok', text: `通过 ${real.length}/${real.length}` }
  return { level: 'fail', text: `${real.length - fail}/${real.length} 通过` }
}

export function videoClassify(r: VideoRecord): 'pass' | 'fail' | 'error' {
  return !r.ok ? 'error' : (videoVerdict(r.checks || []).level === 'ok' ? 'pass' : 'fail')
}

const VIDEO_CAPABILITY_ORDER = ['request', 'task', 'videoUrl', 'probe', 'resolution', 'duration', 'ratio', 'audio', 'reject', 'material'] as const
const VIDEO_CAPABILITY_LABEL: Record<string, string> = {
  request: '接口连通',
  task: '任务成功',
  videoUrl: '返回视频地址',
  probe: '成片可读',
  resolution: '分辨率档位',
  duration: '时长',
  ratio: '宽高比',
  audio: '音轨',
  reject: '拒绝 / 审核',
  material: '素材登记',
}

function videoCapabilityKey(rawName: string): string | null {
  if (rawName.startsWith('请求成功') || rawName.startsWith('OpenAPI')) return 'request'
  if (rawName === '任务状态') return 'task'
  if (rawName === '视频地址') return 'videoUrl'
  if (rawName === '成片元数据') return 'probe'
  if (rawName === '分辨率') return 'resolution'
  if (rawName === '时长') return 'duration'
  if (rawName === '宽高比') return 'ratio'
  if (rawName === '音轨') return 'audio'
  if (rawName === '预期拒绝' || rawName === '预期不支持') return 'reject'
  if (rawName.startsWith('素材') || rawName.startsWith('素材组')) return 'material'
  return null
}

export interface VideoCapabilityRow {
  key: string
  label: string
  passedCases: number
  totalCases: number
  level: VideoSupportLevel
  sample: string | null
}

export interface VideoCaseRow {
  id: string
  index: number
  caseName: string
  /** 拒绝 / 不支持类用例：通过表示「已按预期拒绝」 */
  expect: VideoExpect
  status: 'pass' | 'fail' | 'error'
  /** 拒绝类用例 status=error 时区分「真出片」与「请求异常」 */
  negativeProduced: boolean
  httpStatus: number
  durationMs: number
  sizeText: string
  passedChecks: number
  totalChecks: number
  issue: string | null
}

export interface VideoReportSummary {
  overall: {
    total: number
    passed: number
    failed: number
    errored: number
    passRate: number | null
    avgDurationMs: number
    level: VideoSupportLevel
    verdictText: string
    headline: string
  }
  capabilities: VideoCapabilityRow[]
  rows: VideoCaseRow[]
  meta: {
    models: string[]
    channels: string[]
    firstAt: number | null
    lastAt: number | null
  }
}

const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)))

function videoCheckSummaryText(c: VideoCheck): string {
  return `${c.name}：请求 ${String(c.target)} → 实际 ${String(c.actual)}`
}

function videoTruncate(s: string, max = 140): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

/** 拒绝 / 不支持类用例没按预期拒绝时：真出片了才是「未被拒绝」，没出片（素材拉取失败、5xx、超时）是「请求异常」 */
export function videoNegativeProduced(r: Pick<VideoRecord, 'videoUrl'>): boolean {
  return !!r.videoUrl
}

function videoIssueText(r: VideoRecord, firstFail: VideoCheck | null): string | null {
  const negative = r.expect === 'reject' || r.expect === 'unsupported'
  if (negative && firstFail && !r.ok) return videoTruncate(`${videoNegativeProduced(r) ? '未被拒绝' : '请求异常'}：${String(firstFail.actual)}`)
  if (!r.ok) return videoTruncate(r.error || (firstFail ? videoCheckSummaryText(firstFail) : `HTTP ${r.status || 0}`))
  return firstFail ? videoTruncate(videoCheckSummaryText(firstFail)) : null
}

export function videoBuildReportSummary(records: VideoRecord[]): VideoReportSummary {
  const rows: VideoCaseRow[] = records.map((r, i) => {
    const real = (r.checks || []).filter(x => !x.info)
    const firstFail = real.find(x => !x.pass) || null
    const size = r.probe && r.probe.w > 0 ? `${r.probe.w}×${r.probe.h}` : ''
    return {
      id: r.id,
      index: i + 1,
      caseName: r.caseName || '（未命名用例）',
      expect: r.expect ?? 'success',
      status: videoClassify(r),
      negativeProduced: videoNegativeProduced(r),
      httpStatus: r.status || 0,
      durationMs: r.durationMs || 0,
      sizeText: size || '—',
      passedChecks: real.filter(x => x.pass).length,
      totalChecks: real.length,
      issue: videoIssueText(r, firstFail),
    }
  })

  const buckets = new Map<string, { passedCases: number; totalCases: number; sample: string | null }>()
  for (const r of records) {
    const seen = new Map<string, { pass: boolean; sample: string | null }>()
    for (const c of r.checks || []) {
      if (c.info) continue
      const key = videoCapabilityKey(c.name)
      if (!key) continue
      const prev = seen.get(key)
      const pass = (prev ? prev.pass : true) && c.pass
      const failText = key === 'request'
        ? videoTruncate(r.error || videoCheckSummaryText(c))
        : videoTruncate(videoCheckSummaryText(c))
      const sample = c.pass ? (prev?.sample ?? null) : (prev?.sample ?? failText)
      seen.set(key, { pass, sample })
    }
    for (const [key, v] of seen) {
      const b = buckets.get(key) || { passedCases: 0, totalCases: 0, sample: null }
      b.totalCases += 1
      if (v.pass) b.passedCases += 1
      else if (!b.sample) b.sample = v.sample
      buckets.set(key, b)
    }
  }

  const orderOf = (key: string) => {
    const i = (VIDEO_CAPABILITY_ORDER as readonly string[]).indexOf(key)
    return i < 0 ? VIDEO_CAPABILITY_ORDER.length : i
  }
  const capabilities: VideoCapabilityRow[] = Array.from(buckets.entries())
    .map(([key, b]) => ({
      key,
      label: VIDEO_CAPABILITY_LABEL[key] || key,
      passedCases: b.passedCases,
      totalCases: b.totalCases,
      level: (b.passedCases === b.totalCases ? 'ok' : b.passedCases === 0 ? 'fail' : 'partial') as VideoSupportLevel,
      sample: b.sample,
    }))
    .sort((a, b) => orderOf(a.key) - orderOf(b.key))

  const total = rows.length
  const passed = rows.filter(x => x.status === 'pass').length
  const failed = rows.filter(x => x.status === 'fail').length
  const errored = rows.filter(x => x.status === 'error').length
  const unsupported = capabilities.filter(c => c.level !== 'ok').length
  const level: VideoSupportLevel = errored > 0 ? 'fail' : failed > 0 ? 'partial' : 'ok'
  const verdictText = level === 'ok' ? '全部通过' : level === 'partial' ? '部分能力不支持' : '存在请求失败'
  const headline = total === 0
    ? '没有可展示的测试记录'
    : level === 'ok'
      ? `${total} 个用例全部通过，所测参数均被正确支持`
      : errored > 0
        ? `${passed}/${total} 个用例通过 · ${errored} 个请求失败${unsupported ? ` · ${unsupported} 项能力未完整支持` : ''}`
        : `${passed}/${total} 个用例通过 · ${unsupported} 项能力未完整支持`

  const times = records.map(r => r.time).filter(t => typeof t === 'number')
  return {
    overall: {
      total, passed, failed, errored,
      passRate: total ? passed / total : null,
      avgDurationMs: total ? Math.round(records.reduce((s, r) => s + (r.durationMs || 0), 0) / total) : 0,
      level, verdictText, headline,
    },
    capabilities,
    rows,
    meta: {
      models: uniq(records.map(r => r.model)),
      channels: uniq(records.map(r => r.channelName)),
      firstAt: times.length ? Math.min(...times) : null,
      lastAt: times.length ? Math.max(...times) : null,
    },
  }
}
