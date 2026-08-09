import type React from 'react'

export function formatJson(raw: string): { ok: boolean; text: string } {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(raw), null, 2) }
  } catch {
    return { ok: false, text: raw }
  }
}

/** 兼容 `{{model}}`/`${[model]}` 等占位符的 JSON 格式化：先替换占位符为合法 JSON 标记，
 *  格式化后再还原，确保含占位符的 JSON 也能被语法高亮和折叠。 */
export function formatJsonWithPlaceholders(raw: string): { ok: boolean; text: string } {
  // 匹配 MODEL_PLACEHOLDER_RE 的四种写法
  const PH_RE = /"\{\{model\}\}"|\{\{model\}\}|"\$\{\[\s*model\s*\]\}"|\$\{\[\s*model\s*\]\}/g
  const phMap: string[] = []
  const cleaned = raw.replace(PH_RE, m => {
    const idx = phMap.length
    phMap.push(m)
    // 确保替换后是合法 JSON 字符串值（带引号）
    return `"__PH_${idx}__"`
  })
  try {
    const formatted = JSON.stringify(JSON.parse(cleaned), null, 2)
    const restored = formatted.replace(/"__PH_(\d+)__"/g, (_, idx) => phMap[+idx] ?? `"__PH_${idx}__"`)
    return { ok: true, text: restored }
  } catch {
    return { ok: false, text: raw }
  }
}

export function highlightJson(text: string, matchCol?: number): string {
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 在匹配的括号字符周围插入高亮 span（括号字符不会被 highlightJson 正则匹配，安全）
  if (matchCol != null && matchCol >= 0 && matchCol < safe.length && '{[]}'.includes(safe[matchCol])) {
    safe = safe.slice(0, matchCol) + `<span class="json-bracket-match">${safe[matchCol]}</span>` + safe.slice(matchCol + 1)
  }
  return safe.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (m) => {
      if (/^"/.test(m)) return /:$/.test(m) ? `<span class="json-key">${m}</span>` : `<span class="json-str">${m}</span>`
      if (m === 'true' || m === 'false') return `<span class="json-bool">${m}</span>`
      if (m === 'null') return `<span class="json-null">${m}</span>`
      return `<span class="json-num">${m}</span>`
    }
  )
}

export interface DiffLine {
  type: 'same' | 'add' | 'rm'
  left: string | null
  right: string | null
  leftNum: number | null
  rightNum: number | null
}

export function computeDiff(a: string[], b: string[]): DiffLine[] {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const ops: { t: 'same' | 'add' | 'rm'; a: string | null; b: string | null }[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ t: 'same', a: a[i - 1], b: b[j - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ t: 'add', a: null, b: b[j - 1] }); j--
    } else {
      ops.unshift({ t: 'rm', a: a[i - 1], b: null }); i--
    }
  }
  let li = 0, ri = 0
  return ops.map(o => {
    const row: DiffLine = { type: o.t, left: o.a, right: o.b, leftNum: null, rightNum: null }
    if (o.t === 'same') { row.leftNum = ++li; row.rightNum = ++ri }
    else if (o.t === 'rm') { row.leftNum = ++li }
    else { row.rightNum = ++ri }
    return row
  })
}

/** 查找匹配的括号位置（返回绝对值字符索引，null 表示无匹配） */
export function findMatchingBracket(text: string, cursorPos: number): number | null {
  if (cursorPos <= 0 || cursorPos > text.length) return null
  const ch = text[cursorPos - 1]
  if (!'{[]}'.includes(ch)) return null
  const isOpen = ch === '{' || ch === '['
  const open = ch === '{' || ch === '}' ? '{' : '['
  const close = ch === '{' || ch === '}' ? '}' : ']'
  let depth = 1
  const step = isOpen ? 1 : -1
  let i = cursorPos - 1 + step
  while (i >= 0 && i < text.length) {
    if (text[i] === '"') {
      if (step === 1) {
        i++
        while (i < text.length) {
          if (text[i] === '\\') i += 2
          else if (text[i] === '"') break
          else i++
        }
      } else {
        i--
        while (i >= 0) {
          if (text[i] === '\\') i--
          else if (text[i] === '"') break
          else i--
        }
      }
      i += step
      continue
    }
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) return i
    }
    i += step
  }
  return null
}

export const JSON_ROW = 20        // 单行高度：查看态/编辑态统一，切换时不跳
export const JSON_PAD_TB = 14     // 内容区上下内边距
export const JSON_PAD_L = 8       // 内容区左内边距（行号列之前）
export const JSON_LINE_NO_W = 24  // 行号列宽度（右对齐，容纳 3 位行号）
export const JSON_FOLD_W = 16     // 折叠箭头位宽
export const JSON_GUTTER_W = JSON_LINE_NO_W + JSON_FOLD_W // 行号(24) + 折叠箭头位(16)
export const JSON_CONTENT_X = JSON_PAD_L + JSON_GUTTER_W // 48px：两态内容真正起始的 x 坐标，必须完全一致，否则悬停切换会横向跳动

export const JSON_EDITOR_STYLE: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
  fontSize: '12.5px',
  lineHeight: JSON_ROW + 'px',
  padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_CONTENT_X}px`,
  tabSize: 2,
  whiteSpace: 'pre',
  margin: 0,
}

/** 计算每行「可折叠区间」：起始行 → 配对结束行（括号配对） */
export function computeFoldRanges(lines: string[]): Map<number, number> {
  const stack: { line: number }[] = []
  const ranges = new Map<number, number>()
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '[') stack.push({ line: i })
      else if (ch === '}' || ch === ']') {
        const open = stack.pop()
        if (open && !ranges.has(open.line)) ranges.set(open.line, i)
      }
    }
  }
  return ranges
}

/** 折叠后的可见行序号（折叠起始行保留、其子行隐藏） */
export function getVisibleLines(lines: string[], ranges: Map<number, number>, collapsed: Set<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(i)
    if (collapsed.has(i)) {
      const end = ranges.get(i)
      if (end != null) i = end
    }
  }
  return out
}
