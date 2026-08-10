import * as XLSX from 'xlsx'

// ─── LLM 日志报告：数据解析 + 报告计算（纯函数，无 React 依赖） ──────────────

export interface LogRow {
  id: number
  createdAt: number
  model: string
  user: string
  tokenName: string
  group: string
  channelId: number | null
  promptTokens: number
  completionTokens: number
  useTime: number | null
  isStream: boolean
  ok: boolean
  frt: number | null
  status: string
  endReason: string
  requestPath: string
  requestConversion: string
  cacheTokens: number
  cacheCreationTokens: number
}

export interface Percentiles {
  min: number | null
  avg: number | null
  p50: number | null
  p90: number | null
  p95: number | null
  p99: number | null
  max: number | null
}

export interface BucketPoint {
  ts: number
  label: string
  ok: number
  fail: number
  prompt: number
  completion: number
}

export interface ErrorStat { key: string; count: number }

export interface FailureItem {
  at: string
  model: string
  user: string
  status: string
  endReason: string
  path: string
  prompt: number
  completion: number
  useTime: number | null
}

export type Granularity = 'minute' | 'hour' | 'day'

export const DEFAULT_REPORT_TITLE = 'LLM 日志性能分析报告'

export interface Report {
  generatedAt: string
  title: string
  source: { kind: string; rows: number; skipped: number; fileName?: string; concurrency?: number }
  total: number
  ok: number
  fail: number
  successRate: number | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  timeStart: number
  timeEnd: number
  durationH: number
  stream: number
  nonStream: number
  granularity: Granularity
  series: BucketPoint[]
  ttftStream: Percentiles | null
  ttftHist: { bins: number[]; counts: number[]; p50: number | null; p99: number | null } | null
  useTime: Percentiles | null
  models: string[]
  userCount: number
  groupCount: number
  byError: ErrorStat[]
  failures: FailureItem[]
}

export interface ParseResult {
  rows: LogRow[]
  skipped: number
  error?: string
}

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '')

const KEY_ALIASES: Record<string, string[]> = {
  createdAt: ['createdat', 'createdtime', 'time', 'ts'],
  model: ['modelname', 'model'],
  username: ['username', 'user'],
  tokenName: ['tokenname', 'token'],
  group: ['group', 'usergroup'],
  channelId: ['channelid'],
  promptTokens: ['prompttokens', 'prompttoken', 'prompt'],
  completionTokens: ['completiontokens', 'completiontoken', 'completion', 'outputtokens'],
  useTime: ['usetime', 'duration'],
  isStream: ['isstream'],
  other: ['other', 'extrainfo', 'metadata'],
  requestId: ['requestid'],
}

/** 把任意来源的一行（JSON 对象 / Excel 行）归一化为 LogRow，无法归一化返回 null */
export function normalizeRow(raw: Record<string, unknown>, idx: number): LogRow | null {
  const lookup = (aliases: string[]): unknown => {
    for (const a of aliases) {
      if (raw[a] !== undefined && raw[a] !== null) return raw[a]
    }
    const nk = new Set(aliases.map(normKey))
    for (const k of Object.keys(raw)) {
      if (nk.has(normKey(k))) return raw[k]
    }
    return undefined
  }

  const getStr = (aliases: string[]): string => {
    const v = lookup(aliases)
    if (v == null) return ''
    return String(v).trim()
  }
  const getNum = (aliases: string[]): number | null => {
    const v = lookup(aliases)
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  const createdAt = getNum(KEY_ALIASES.createdAt)
  if (createdAt == null) return null

  const otherRaw = getStr(KEY_ALIASES.other)
  let other: Record<string, unknown> | null = null
  if (otherRaw) {
    try { other = JSON.parse(otherRaw) } catch { other = null }
  }
  const streamStatus = (other?.stream_status as Record<string, unknown> | undefined) ?? null
  const status = streamStatus && typeof streamStatus.status === 'string' ? streamStatus.status : ''
  const endReason = streamStatus && typeof streamStatus.end_reason === 'string' ? streamStatus.end_reason : ''
  const rawFrt = typeof other?.frt === 'number' ? other.frt : Number(other?.frt) || -1000

  const promptTokens = getNum(KEY_ALIASES.promptTokens) ?? 0
  const completionTokens = getNum(KEY_ALIASES.completionTokens) ?? 0
  const useTime = getNum(KEY_ALIASES.useTime)
  const isStream = (getNum(KEY_ALIASES.isStream) ?? 0) === 1

  return {
    id: getNum(['id']) ?? idx,
    createdAt,
    model: getStr(KEY_ALIASES.model) || '(未命名模型)',
    user: getStr(KEY_ALIASES.username) || getStr(KEY_ALIASES.tokenName) || '(未知用户)',
    tokenName: getStr(KEY_ALIASES.tokenName),
    group: getStr(KEY_ALIASES.group) || '(默认)',
    channelId: getNum(KEY_ALIASES.channelId),
    promptTokens,
    completionTokens,
    useTime,
    isStream,
    ok: status === '' || status === 'ok',
    frt: rawFrt > 0 ? rawFrt : null,
    status,
    endReason,
    requestPath: typeof other?.request_path === 'string' ? other.request_path : '',
    requestConversion: Array.isArray(other?.request_conversion)
      ? String(other.request_conversion[0])
      : typeof other?.request_conversion === 'string' ? other.request_conversion : '',
    cacheTokens: typeof other?.cache_tokens === 'number' ? other.cache_tokens : 0,
    cacheCreationTokens: typeof other?.cache_creation_tokens === 'number' ? other.cache_creation_tokens : 0,
  }
}

/** 解析 JSON 文本（数组，或包含数组的对象） */
export function parseJsonText(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { rows: [], skipped: 0, error: 'JSON 解析失败，请检查格式' }
  }
  if (Array.isArray(data)) return rowsFromList(data)
  if (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)) {
    return rowsFromList((data as { rows: unknown[] }).rows)
  }
  return { rows: [], skipped: 0, error: 'JSON 顶层应为数组（每条日志一个对象）' }
}

function rowsFromList(list: unknown[]): ParseResult {
  const rows: LogRow[] = []
  let skipped = 0
  list.forEach((item, idx) => {
    if (!item || typeof item !== 'object') { skipped++; return }
    const row = normalizeRow(item as Record<string, unknown>, idx)
    if (!row) skipped++
    else rows.push(row)
  })
  return { rows, skipped }
}

/** 解析 Excel（xlsx/xls/csv 均可，xlsx 库统一处理）：跳过 Query 等非数据 sheet，优先表头匹配的 sheet */
export function parseExcelBuffer(buf: ArrayBuffer, fileName?: string): ParseResult {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array' })
  } catch {
    return { rows: [], skipped: 0, error: '文件解析失败，请确认是有效的 Excel/CSV 文件' }
  }
  const sheetNames = (wb.SheetNames || []).filter(n => !/query|sql/i.test(n))
  if (!sheetNames.length) return { rows: [], skipped: 0, error: '文件中没有数据 sheet（已跳过 Query/SQL 类）' }

  const dataSheet = sheetNames.find(name => {
    const sheet = wb.Sheets[name]
    if (!sheet) return false
    const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' })[0] as unknown[]
    if (!Array.isArray(firstRow)) return false
    const keys = firstRow.map(k => normKey(String(k ?? '')))
    return keys.some(k => k === 'createdat' || k === 'createdtime')
      && keys.some(k => k === 'modelname' || k === 'model')
  })
  const target = dataSheet ?? sheetNames[0]
  const sheet = wb.Sheets[target]
  const list = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (!list.length) return { rows: [], skipped: 0, error: `sheet「${target}」没有数据行` }
  const result = rowsFromList(list)
  return { ...result, error: dataSheet ? undefined : `未找到标准日志表头，按第一个数据 sheet「${target}」解析` }
}

// ─── 统计计算 ─────────────────────────────────────────────────────────────────

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function statsOf(values: number[]): Percentiles | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    min: sorted[0],
    avg: sum / values.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  }
}

const pad2 = (v: number) => String(v).padStart(2, '0')

function fmtBucket(ts: number, granularity: Granularity): string {
  const d = new Date(ts * 1000)
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (granularity === 'day') return md
  if (granularity === 'hour') return `${md} ${pad2(d.getHours())}时`
  return `${md} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function chooseGranularity(spanS: number): Granularity {
  if (spanS <= 3 * 86400) return 'minute'
  if (spanS <= 60 * 86400) return 'hour'
  return 'day'
}

export function buildReport(rows: LogRow[], source: Report['source'], title?: string): Report {
  const total = rows.length
  const ok = rows.filter(r => r.ok).length
  const fail = total - ok

  const sortedByTime = [...rows].sort((a, b) => a.createdAt - b.createdAt)
  const timeStart = sortedByTime.length ? sortedByTime[0].createdAt : 0
  const timeEnd = sortedByTime.length ? sortedByTime[sortedByTime.length - 1].createdAt : 0
  const durationH = timeEnd - timeStart > 0 ? (timeEnd - timeStart) / 3600 : 0

  const granularity = total ? chooseGranularity(timeEnd - timeStart) : 'minute'
  const buckets = new Map<number, BucketPoint>()
  sortedByTime.forEach(r => {
    const d = new Date(r.createdAt * 1000)
    let ts: number
    if (granularity === 'day') ts = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000
    else if (granularity === 'hour') ts = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()) / 1000
    else ts = Math.floor(r.createdAt / 60) * 60
    if (!buckets.has(ts)) {
      buckets.set(ts, { ts, label: fmtBucket(ts, granularity), ok: 0, fail: 0, prompt: 0, completion: 0 })
    }
    const b = buckets.get(ts)!
    if (r.ok) b.ok++
    else b.fail++
    b.prompt += r.promptTokens
    b.completion += r.completionTokens
  })
  const series = [...buckets.values()].sort((a, b) => a.ts - b.ts)

  const ttftVals = rows.filter(r => r.isStream && r.frt != null).map(r => r.frt as number)
  const useTimeVals = rows.filter(r => r.useTime != null).map(r => r.useTime as number)
  const ttftStats = statsOf(ttftVals)
  const useTimeStats = statsOf(useTimeVals)

  // TTFT 直方图（流式样本）
  let ttftHist: Report['ttftHist'] = null
  if (ttftVals.length > 0) {
    const min = Math.min(...ttftVals)
    const max = Math.max(...ttftVals)
    const range = max - min
    const width = range > 0 ? Math.max(1, Math.round(range / 20)) : 1
    const binCount = Math.max(1, Math.ceil(range / width))
    const bins: number[] = []
    const counts: number[] = []
    for (let i = 0; i < binCount; i++) {
      bins.push(min + i * width)
      counts.push(0)
    }
    ttftVals.forEach(v => {
      const idx = Math.min(binCount - 1, Math.floor((v - min) / width))
      counts[idx]++
    })
    const binIdxOf = (v: number | null) => (v == null ? null : Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width))))
    ttftHist = { bins, counts, p50: binIdxOf(ttftStats?.p50 ?? null), p99: binIdxOf(ttftStats?.p99 ?? null) }
  }

  // 优先按 end_reason 分类（更具体，如 timeout/abort），兜底用 status（如 fail），都缺失才归为 unknown。
  // 注：失败行必然有非空且 != 'ok' 的 status（见 normalizeRow 的 ok 判定），所以 unknown 分支实际不会触发，
  // 仅作为未来 ok 判定逻辑变化时的防御性兜底保留。
  const errMap = new Map<string, number>()
  rows.forEach(r => {
    if (r.ok) return
    const k = r.endReason || r.status || 'unknown'
    errMap.set(k, (errMap.get(k) ?? 0) + 1)
  })
  const byError = [...errMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)

  const failures: FailureItem[] = rows
    .filter(r => !r.ok)
    .map(r => ({
      at: fmtBucket(r.createdAt, 'minute'),
      model: r.model,
      user: r.user,
      status: r.status || '—',
      endReason: r.endReason || '—',
      path: r.requestPath || '—',
      prompt: r.promptTokens,
      completion: r.completionTokens,
      useTime: r.useTime,
    }))
    .slice(0, 100)

  const modelOrder = new Map<string, number>()
  rows.forEach(r => modelOrder.set(r.model, (modelOrder.get(r.model) ?? 0) + 1))
  const models = [...modelOrder.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)

  return {
    generatedAt: new Date().toISOString(),
    title: title?.trim() ? title.trim() : DEFAULT_REPORT_TITLE,
    source,
    total,
    ok,
    fail,
    successRate: total ? ok / total : null,
    promptTokens: rows.reduce((a, r) => a + r.promptTokens, 0),
    completionTokens: rows.reduce((a, r) => a + r.completionTokens, 0),
    totalTokens: rows.reduce((a, r) => a + r.promptTokens + r.completionTokens, 0),
    timeStart,
    timeEnd,
    durationH,
    stream: rows.filter(r => r.isStream).length,
    nonStream: rows.filter(r => !r.isStream).length,
    granularity,
    series,
    ttftStream: ttftStats,
    ttftHist,
    useTime: useTimeStats,
    models,
    userCount: new Set(rows.map(r => r.user)).size,
    groupCount: new Set(rows.map(r => r.group)).size,
    byError,
    failures,
  }
}

/** 示例数据（用于「载入示例」按钮，含 6 条真实样例 + 1 条模拟失败样本演示失败分类） */
export const SAMPLE_JSON = `[
  { "id": 46200553, "user_id": 64, "created_at": 1785318047, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 519, "prompt_tokens": 33, "completion_tokens": 191, "use_time": 6, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290940413919050008268d9d6bGlLh4CQ", "upstream_request_id": "202607290940431409939398268d9d6Sm0S2s2f", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"completion_ratio\\":3,\\"frt\\":2659,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"OpenAI Compatible\\"],\\"request_path\\":\\"/v1/chat/completions\\",\\"stream_status\\":{\\"end_reason\\":\\"done\\",\\"status\\":\\"ok\\"},\\"user_group_ratio\\":-1}" },
  { "id": 46200554, "user_id": 64, "created_at": 1785318048, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1858, "prompt_tokens": 68, "completion_tokens": 700, "use_time": 21, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290940271061060008268d9d68QMTNbyV", "upstream_request_id": "202607290940302051174838268d9d67vJtBA36", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"completion_ratio\\":3,\\"frt\\":3505,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"OpenAI Responses\\"],\\"request_path\\":\\"/v1/responses\\",\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"},\\"user_group_ratio\\":-1}" },
  { "id": 46200555, "user_id": 64, "created_at": 1785318053, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1393, "prompt_tokens": 68, "completion_tokens": 519, "use_time": 16, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290940371209850008268d9d6Q8UcbnWq", "upstream_request_id": "202607290940389167216508268d9d6lvBPMNmF", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"completion_ratio\\":3,\\"frt\\":2197,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"OpenAI Responses\\"],\\"request_path\\":\\"/v1/responses\\",\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"},\\"user_group_ratio\\":-1}" },
  { "id": 46200556, "user_id": 64, "created_at": 1785318054, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 414, "prompt_tokens": 33, "completion_tokens": 150, "use_time": 6, "is_stream": 0, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290940483352910008268d9d6oA4W594c", "upstream_request_id": "202607290940491323942548268d9d6GNLwirAW", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"completion_ratio\\":3,\\"frt\\":-1000,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"OpenAI Compatible\\"],\\"request_path\\":\\"/v1/chat/completions\\",\\"user_group_ratio\\":-1}" },
  { "id": 46200557, "user_id": 64, "created_at": 1785318060, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 247, "prompt_tokens": 33, "completion_tokens": 85, "use_time": 3, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290940573873610008268d9d6I3FedG1f", "upstream_request_id": "202607290940577632181458268d9d6VVNZji38", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"completion_ratio\\":3,\\"frt\\":1793,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"OpenAI Compatible\\"],\\"request_path\\":\\"/v1/chat/completions\\",\\"stream_status\\":{\\"end_reason\\":\\"done\\",\\"status\\":\\"ok\\"},\\"user_group_ratio\\":-1}" },
  { "id": 46200558, "user_id": 64, "created_at": 1785318078, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1761, "prompt_tokens": 378, "completion_tokens": 559, "use_time": 16, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290941025503820008268d9d6AEqGgRlv", "upstream_request_id": "202607290941028444772018268d9d6OfHvitL1", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"billing_source\\":\\"wallet\\",\\"cache_creation_ratio\\":1.25,\\"cache_creation_tokens\\":0,\\"cache_ratio\\":0.1,\\"cache_tokens\\":0,\\"claude\\":true,\\"completion_ratio\\":3,\\"frt\\":1543,\\"group_ratio\\":1,\\"model_price\\":-1,\\"model_ratio\\":0.85714285715,\\"request_conversion\\":[\\"Claude Messages\\"],\\"request_path\\":\\"/v1/messages\\",\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"},\\"usage_semantic\\":\\"anthropic\\",\\"user_group_ratio\\":-1}" },
  { "id": 46200559, "user_id": 64, "created_at": 1785318120, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 0, "prompt_tokens": 12, "completion_tokens": 0, "use_time": 60, "is_stream": 1, "channel_id": 62, "channel_name": null, "token_id": 329, "group": "PRO", "ip": "", "request_id": "202607290942000000000008268d9d6DEMOFAIL", "upstream_request_id": "", "other": "{\\"admin_info\\":{\\"use_channel\\":[\\"62\\"]},\\"frt\\":12000,\\"request_path\\":\\"/v1/chat/completions\\",\\"stream_status\\":{\\"end_reason\\":\\"timeout\\",\\"status\\":\\"fail\\"}}" }
]`
