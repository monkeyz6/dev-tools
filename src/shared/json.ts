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

export function highlightJson(text: string, matchCols?: number | readonly number[]): string {
  // 先以不会被 JSON token 正则识别的占位符标记匹配括号。若提前插入 span，下面的
  // 语法高亮会把 span 的 class="json-bracket-match" 当成 JSON 字符串再次包裹，
  // 从而破坏生成的 HTML 并泄露出类名文本。
  const requestedCols = typeof matchCols === 'number' ? [matchCols] : matchCols ?? []
  const bracketMarks: { marker: string; char: string; col: number }[] = []
  let markerCode = 0xE000
  for (const col of [...new Set(requestedCols)].sort((a, b) => a - b)) {
    if (col < 0 || col >= text.length || !'{[]}'.includes(text[col])) continue
    let marker = String.fromCodePoint(markerCode++)
    while (text.includes(marker)) marker = String.fromCodePoint(markerCode++)
    bracketMarks.push({ marker, char: text[col], col })
  }

  let source = text
  for (const mark of bracketMarks) {
    source = source.slice(0, mark.col) + mark.marker + source.slice(mark.col + 1)
  }

  const safe = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const highlighted = safe.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (m) => {
      if (/^"/.test(m)) return /:$/.test(m) ? `<span class="json-key">${m}</span>` : `<span class="json-str">${m}</span>`
      if (m === 'true' || m === 'false') return `<span class="json-bool">${m}</span>`
      if (m === 'null') return `<span class="json-null">${m}</span>`
      return `<span class="json-num">${m}</span>`
    }
  )

  return bracketMarks.reduce(
    (html, mark) => html.split(mark.marker).join(`<span class="json-bracket-match">${mark.char}</span>`),
    highlighted,
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

export interface JsonBracketPair {
  current: number
  match: number
}

/**
 * 查找光标相邻括号及其配对位置。优先取光标左侧括号，也支持光标停在括号前。
 * 扫描时跳过 JSON 字符串，因此字符串内容和转义引号不会干扰嵌套关系。
 */
export function findBracketPair(text: string, cursorPos: number): JsonBracketPair | null {
  if (cursorPos < 0 || cursorPos > text.length) return null
  const before = cursorPos > 0 ? cursorPos - 1 : -1
  const current = before >= 0 && '{[]}'.includes(text[before])
    ? before
    : cursorPos < text.length && '{[]}'.includes(text[cursorPos])
      ? cursorPos
      : -1
  if (current < 0) return null

  const stack: { char: '{' | '['; index: number }[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
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
    if (ch === '{' || ch === '[') {
      stack.push({ char: ch, index: i })
      continue
    }
    if (ch !== '}' && ch !== ']') continue

    const expected = ch === '}' ? '{' : '['
    const open = stack[stack.length - 1]
    if (!open || open.char !== expected) {
      if (i === current) return null
      continue
    }
    stack.pop()
    if (open.index === current) return { current, match: i }
    if (i === current) return { current, match: open.index }
  }

  return null
}

/** 查找匹配括号的位置（兼容只需要对应位置的调用方）。 */
export function findMatchingBracket(text: string, cursorPos: number): number | null {
  return findBracketPair(text, cursorPos)?.match ?? null
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
