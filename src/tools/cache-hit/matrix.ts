// 缓存命中率矩阵：短词、该保留哪些行、列头是否带渠道。
// 长报告的结论文案与这里的短词走同一套分支，避免两处判定分叉。

export type CacheFormat = 'chat' | 'responses' | 'anthropic'
export type CacheCaseId = 'repeat' | 'multiturn' | 'suffix'
export type CacheMatrixTone = 'ok' | 'warn' | 'err'
export type CacheMatrixWord = '命中' | '部分命中' | '未命中' | '无字段' | '失败' | '已停止'

export const CACHE_CASE_ORDER: CacheCaseId[] = ['repeat', 'multiturn', 'suffix']
export const CACHE_FORMAT_ORDER: CacheFormat[] = ['chat', 'responses', 'anthropic']

export const CACHE_CASE_LABELS: Record<CacheCaseId, string> = {
  repeat: '重复请求',
  multiturn: '多轮对话',
  suffix: '尾部变化',
}

export const CACHE_FORMAT_LABELS: Record<CacheFormat, string> = {
  chat: 'OpenAI Chat Completions',
  responses: 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
}

const CACHE_FIELD_HINTS: Record<CacheFormat, string> = {
  chat: 'usage.prompt_tokens_details.cached_tokens',
  responses: 'usage.input_tokens_details.cached_tokens',
  anthropic: 'usage.cache_read_input_tokens / cache_creation_input_tokens',
}

export const cachePct = (v: number | null): string => (v == null ? '—' : (v * 100).toFixed(1) + '%')

export interface CacheVerdictInput {
  format: CacheFormat
  status: 'ok' | 'error' | 'stopped'
  error?: string
  measured: number
  fieldMissing: number
  hitRate: number | null
  hitCount: number
  coverage: number | null
}

export interface CacheMatrixCase<T> {
  caseId: CacheCaseId
  nonce: string
  rounds: number
  results: T[]
}

export interface CacheMatrixReport<T> {
  completedAt: string
  target: { baseUrl?: string; model?: string; channelName?: string }
  params: { nonce: string; rounds: number }
  results: T[]
  caseResults?: CacheMatrixCase<T>[]
}

export interface CacheMatrixColumn {
  model: string
  source: string
}

export interface CacheMatrixGroup {
  caseId: CacheCaseId
  title: string
  rows: { format: CacheFormat; label: string }[]
}

/** 旧历史没有 caseResults 时，整份结果视为一次尾部变化。 */
export function cacheCasesOf<T extends { format: string }>(report: CacheMatrixReport<T>): CacheMatrixCase<T>[] {
  if (report.caseResults && report.caseResults.length) return report.caseResults
  return [{ caseId: 'suffix', nonce: report.params.nonce, rounds: report.params.rounds, results: report.results }]
}

export function cacheVerdictOf(r: CacheVerdictInput, caseId: CacheCaseId = 'suffix'): { tone: CacheMatrixTone; word: CacheMatrixWord; text: string } {
  if (r.status === 'error') return { tone: 'err', word: '失败', text: `测试未完成：${r.error || '预热请求失败'}` }
  if (r.status === 'stopped') return { tone: 'warn', word: '已停止', text: '测试已停止，以下为已完成轮次。' }
  if (!r.measured) return { tone: 'err', word: '失败', text: '没有成功的测量轮次，无法计算命中率。' }
  if (r.fieldMissing === r.measured) {
    return { tone: 'warn', word: '无字段', text: `渠道未返回缓存字段（${CACHE_FIELD_HINTS[r.format]}），无法判定命中。` }
  }
  const rate = r.hitRate ?? 0
  if (rate >= 1) {
    if (caseId === 'multiturn') return { tone: 'ok', word: '命中', text: `前缀仍命中 · ${r.hitCount}/${r.measured} 轮` }
    if ((r.coverage ?? 0) >= 0.8) return { tone: 'ok', word: '命中', text: `全部命中 · 覆盖率 ${cachePct(r.coverage)}` }
    return { tone: 'warn', word: '命中', text: `全部命中，但 Token 覆盖率仅 ${cachePct(r.coverage)}` }
  }
  if (rate > 0) return { tone: 'warn', word: '部分命中', text: `部分命中（${r.hitCount}/${r.measured} 轮）` }
  return { tone: 'err', word: '未命中', text: '全部未命中' }
}

export function cacheMatrixCell<T extends { format: string }>(report: CacheMatrixReport<T>, caseId: CacheCaseId, format: CacheFormat): T | null {
  const block = cacheCasesOf(report).find(item => item.caseId === caseId)
  if (!block) return null
  return block.results.find(item => item.format === format) ?? null
}

/** 整行在所有报告里都没有结果时不出现；组内协议顺序固定。 */
export function cacheMatrixGroups<T extends { format: string }>(reports: CacheMatrixReport<T>[]): CacheMatrixGroup[] {
  const groups: CacheMatrixGroup[] = []
  for (const caseId of CACHE_CASE_ORDER) {
    const rows: CacheMatrixGroup['rows'] = []
    for (const format of CACHE_FORMAT_ORDER) {
      if (reports.some(report => cacheMatrixCell(report, caseId, format))) {
        rows.push({ format, label: CACHE_FORMAT_LABELS[format] })
      }
    }
    if (rows.length) groups.push({ caseId, title: CACHE_CASE_LABELS[caseId], rows })
  }
  return groups
}

function channelKey(report: { target: { channelName?: string; baseUrl?: string } }): string {
  return (report.target.channelName || '').trim() || (report.target.baseUrl || '').trim()
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 渠道一致时列头只有模型名。不一致时第二行是渠道名，没有渠道名就用 Base URL。
 * 模型名加第二行仍然撞车时，再补上完成时间。
 */
export function cacheMatrixColumns(reports: { completedAt: string; target: { model?: string; channelName?: string; baseUrl?: string } }[]): CacheMatrixColumn[] {
  const mixed = new Set(reports.map(channelKey)).size > 1
  const base = reports.map(report => ({
    model: (report.target.model || '').trim() || '未命名模型',
    source: mixed ? channelKey(report) : '',
  }))
  const keyOf = (column: CacheMatrixColumn) => `${column.model}\0${column.source}`
  const counts = new Map<string, number>()
  for (const column of base) counts.set(keyOf(column), (counts.get(keyOf(column)) ?? 0) + 1)
  return reports.map((report, index) => {
    const column = base[index]
    if ((counts.get(keyOf(column)) ?? 0) < 2) return column
    const time = fmtTime(report.completedAt)
    return { model: column.model, source: column.source ? `${column.source} · ${time}` : time }
  })
}
