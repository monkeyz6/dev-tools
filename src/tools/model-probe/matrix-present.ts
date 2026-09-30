/** 矩阵展示用的说明整理。不改历史里的原文。 */

export interface MatrixNote {
  detail: string
  errBody: string
}

const STATUS_PREFIX = /^(符合预期|异常|失败|通过|不支持|未测|已跳过)[：:]\s*/
const STATUS_WORD = new Set(['通过', '失败', '异常', '不支持', '未测', '已跳过', '符合预期'])
const BOILERPLATE = new Set([
  '基础请求返回成功',
  '用户未勾选',
  '完整 JSON 响应正常',
  '回复含 SYSTEM_OK',
  '第二跳回出口令 ORBIT',
  '识别为主色红',
])

function extractJson(text: string): { text: string; errBody: string } {
  const start = text.indexOf('{')
  if (start < 0) return { text, errBody: '' }
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth !== 0) continue
      const raw = text.slice(start, i + 1)
      try {
        const pretty = JSON.stringify(JSON.parse(raw), null, 2)
        const rest = `${text.slice(0, start)} ${text.slice(i + 1)}`.replace(/\s+/g, ' ').trim()
        return { text: rest, errBody: pretty }
      } catch {
        return { text, errBody: '' }
      }
    }
  }
  return { text, errBody: '' }
}

function tidy(clause: string): string {
  return clause.trim().replace(/[。；;]+$/g, '').trim()
}

function isToolCallNote(text: string): boolean {
  return /^响应含\s*\S.*?，已调用/.test(text)
}

const SPLIT_RETEST_NOTE = /(?:组合互斥符合预期，已拆开重测|组合里工具与 reasoning_effort 互相点名，已拆开重测|一条错误同时点名多个参数，已拆开重测)。?/g

/** 导出和矩阵展示去掉「已拆开重测」这句过程提示，不改历史原文。 */
export function stripSplitRetestNote(detail: string): string {
  return detail
    .replace(SPLIT_RETEST_NOTE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([。；])/g, '$1')
    .replace(/(^|[。；])[ \t]+/g, '$1')
    .trim()
}

function dropClause(clause: string): boolean {
  const text = tidy(clause)
  if (!text) return true
  if (STATUS_WORD.has(text)) return true
  if (BOILERPLATE.has(text)) return true
  if (text.startsWith('组合请求通过')) return true
  if (isToolCallNote(text)) return true
  return false
}

export function presentMatrixNote(detail: string): MatrixNote {
  const extracted = extractJson(stripSplitRetestNote(detail || ''))
  const stripped = extracted.text.replace(STATUS_PREFIX, '').trim()
  const kept: string[] = []
  for (const sentence of stripped.split('。')) {
    const whole = tidy(sentence)
    if (!whole) continue
    if (whole.startsWith('组合请求通过') || isToolCallNote(whole)) continue
    const clauses = sentence.split('；').map(tidy).filter(clause => !dropClause(clause))
    if (clauses.length) kept.push(clauses.join('；'))
  }
  return { detail: kept.join('。'), errBody: extracted.errBody }
}

export function matrixFormatSubtitle(name: string, formatLabel: string): string {
  if (!formatLabel) return ''
  if (name.includes(formatLabel)) return ''
  return formatLabel
}

export function matrixTokenValues(values?: number[] | null): number[] | null {
  if (!values || values.length === 0) return null
  if (values.every(value => value === values[0])) return null
  return values
}

export function probeMatrixProblem(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'abnormal' || status === 'unsupported'
}
