// 导出报告的总览层：把一批 ImgRecord 的逐项校验（imgBuildChecks 产出的 checks）
// 聚合成「整体通过率 / 能力支持矩阵 / 用例结果行」，让报告第一屏就能回答
// 「这次测下来哪些支持、哪些不支持」。纯函数，不依赖 React。

import type { ImgApiType, ImgCheck, ImgRecord } from './types'
import { IMG_API_LABEL } from './types'

export type ImgSupportLevel = 'ok' | 'partial' | 'fail'

export function imgVerdict(checks: ImgCheck[]): { level: 'ok' | 'fail' | 'warn'; text: string } {
  const real = checks.filter(x => !x.info)
  const fail = real.filter(x => !x.pass).length
  if (!real.length) return { level: 'warn', text: '无校验项' }
  if (!fail) return { level: 'ok', text: `通过 ${real.length}/${real.length}` }
  return { level: 'fail', text: `${real.length - fail}/${real.length} 通过` }
}

/** 预期不支持的用例被上游 4xx 明确拒绝：算通过。401/403/408/429 是鉴权/限流/超时，不代表参数被拒，仍按请求异常 */
export function imgExpectedRejected(r: Pick<ImgRecord, 'expect' | 'ok' | 'status'>): boolean {
  return r.expect === 'unsupported' && !r.ok && r.status >= 400 && r.status < 500 && ![401, 403, 408, 429].includes(r.status)
}

export function imgClassify(r: ImgRecord): 'pass' | 'fail' | 'error' {
  if (imgExpectedRejected(r)) return 'pass'
  return !r.ok ? 'error' : (imgVerdict(r.checks || []).level === 'ok' ? 'pass' : 'fail')
}

/** 校验项 → 能力。多图记录里校验项名带「图N 」前缀，先剥掉再归类 */
const IMG_CAPABILITY_ORDER = ['request', 'size', 'tier', 'ratio', 'n', 'outputFormat', 'responseFormat', 'structure', 'tokens', 'search', 'multiTurn'] as const
const IMG_CAPABILITY_LABEL: Record<string, string> = {
  request: '接口连通',
  size: '精确像素尺寸',
  tier: '分辨率档位（1k / 2k / 4k）',
  ratio: '宽高比 aspect_ratio',
  n: '多图 n 参数',
  outputFormat: 'output_format 输出格式',
  responseFormat: '返回载体',
  structure: '响应结构与模型回显',
  tokens: '用量 token 对账',
  search: '联网搜索 google_search',
  multiTurn: '多轮编辑 previous_interaction_id',
}

function imgCapabilityKey(rawName: string): string | null {
  const name = rawName.replace(/^图\d+\s*/, '')
  if (name.startsWith('请求成功')) return 'request'
  if (name === '精确尺寸') return 'size'
  if (name === '分辨率档位') return 'tier'
  if (name === '宽高比') return 'ratio'
  if (name === '返回张数 (n)') return 'n'
  if (name === '输出格式') return 'outputFormat'
  if (name === 'response_format' || name === '返回载体') return 'responseFormat'
  if (name === '响应结构' || name === '模型回显') return 'structure'
  if (name === '图片输出 token') return 'tokens'
  if (name === '联网搜索') return 'search'
  if (name === '多轮编辑') return 'multiTurn'
  return null
}

export interface ImgCapabilityRow {
  key: string
  label: string
  passedCases: number
  totalCases: number
  level: ImgSupportLevel
  /** 典型失败样例：`请求 X → 实际 Y`，用于说明「为什么判不支持」 */
  sample: string | null
}

export interface ImgCaseRow {
  id: string
  index: number
  caseName: string
  status: 'pass' | 'fail' | 'error'
  httpStatus: number
  durationMs: number
  returnedN: number
  /** 实际出图尺寸，多个不同尺寸时用 · 连接 */
  sizeText: string
  passedChecks: number
  totalChecks: number
  /** 首条未通过校验的摘要，通过时为 null */
  issue: string | null
}

export interface ImgReportSummary {
  overall: {
    total: number
    passed: number
    failed: number
    errored: number
    passRate: number | null
    avgDurationMs: number
    level: ImgSupportLevel
    /** 结论 pill 文案 */
    verdictText: string
    /** 一句话结论 */
    headline: string
  }
  capabilities: ImgCapabilityRow[]
  rows: ImgCaseRow[]
  meta: {
    apiTypes: ImgApiType[]
    apiLabel: string
    models: string[]
    channels: string[]
    firstAt: number | null
    lastAt: number | null
  }
}

const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)))

function imgCheckSummaryText(c: ImgCheck): string {
  return `${c.name.replace(/^图\d+\s*/, '')}：请求 ${String(c.target)} → 实际 ${String(c.actual)}`
}

function imgTruncate(s: string, max = 140): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

/** 请求本身没成功时，网关返回的错误文本比「请求成功：请求 HTTP 2xx → 实际 HTTP 400」有用得多 */
function imgIssueText(r: ImgRecord, firstFail: ImgCheck | null): string | null {
  if (!r.ok) return imgTruncate(r.error || (firstFail ? imgCheckSummaryText(firstFail) : `HTTP ${r.status || 0}`))
  return firstFail ? imgTruncate(imgCheckSummaryText(firstFail)) : null
}

export function imgBuildReportSummary(records: ImgRecord[]): ImgReportSummary {
  const rows: ImgCaseRow[] = records.map((r, i) => {
    const real = (r.checks || []).filter(x => !x.info)
    const firstFail = real.find(x => !x.pass) || null
    const sizes = uniq((r.images || []).map(im => (im.w > 0 && im.h > 0 ? `${im.w}×${im.h}` : '')))
    return {
      id: r.id,
      index: i + 1,
      caseName: r.caseName || '（未命名用例）',
      status: imgClassify(r),
      httpStatus: r.status || 0,
      durationMs: r.durationMs || 0,
      returnedN: r.returnedN || 0,
      sizeText: sizes.length ? sizes.join(' · ') : '—',
      passedChecks: real.filter(x => x.pass).length,
      totalChecks: real.length,
      issue: imgIssueText(r, firstFail),
    }
  })

  // 能力按「用例」而非「校验项」计数：一条多图记录里同一能力有多项校验，
  // 只要有一项没过就算这个用例没支持住，读起来才和用例结果表对得上
  const buckets = new Map<string, { passedCases: number; totalCases: number; sample: string | null }>()
  for (const r of records) {
    const seen = new Map<string, { pass: boolean; sample: string | null }>()
    for (const c of r.checks || []) {
      if (c.info) continue
      const key = imgCapabilityKey(c.name)
      if (!key) continue
      const prev = seen.get(key)
      const pass = (prev ? prev.pass : true) && c.pass
      const failText = key === 'request'
        ? imgTruncate(r.error || imgCheckSummaryText(c))
        : imgTruncate(imgCheckSummaryText(c))
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
    const i = (IMG_CAPABILITY_ORDER as readonly string[]).indexOf(key)
    return i < 0 ? IMG_CAPABILITY_ORDER.length : i
  }
  const capabilities: ImgCapabilityRow[] = Array.from(buckets.entries())
    .map(([key, b]) => ({
      key,
      label: IMG_CAPABILITY_LABEL[key] || key,
      passedCases: b.passedCases,
      totalCases: b.totalCases,
      level: (b.passedCases === b.totalCases ? 'ok' : b.passedCases === 0 ? 'fail' : 'partial') as ImgSupportLevel,
      sample: b.sample,
    }))
    .sort((a, b) => orderOf(a.key) - orderOf(b.key))

  const total = rows.length
  const passed = rows.filter(x => x.status === 'pass').length
  const failed = rows.filter(x => x.status === 'fail').length
  const errored = rows.filter(x => x.status === 'error').length
  const unsupported = capabilities.filter(c => c.level !== 'ok').length
  const level: ImgSupportLevel = errored > 0 ? 'fail' : failed > 0 ? 'partial' : 'ok'
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
      apiTypes: uniq(records.map(r => r.apiType)) as ImgApiType[],
      apiLabel: uniq(records.map(r => IMG_API_LABEL[r.apiType] || r.apiType)).join(' / '),
      models: uniq(records.map(r => r.model)),
      channels: uniq(records.map(r => r.channelName)),
      firstAt: times.length ? Math.min(...times) : null,
      lastAt: times.length ? Math.max(...times) : null,
    },
  }
}
