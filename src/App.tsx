import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemeKey = 'light' | 'dark' | 'claude' | 'green'
type ToolKey = 'seedance' | 'json' | 'timestamp' | 'aiconvert' | 'llmbatch' | 'imganalyze'
  | 'idgen' | 'base64' | 'unicode'

interface ImageItem {
  id: string; order: number; source: 'local' | 'url'; name: string
  size: number | null; mime: string; status: 'loading' | 'done' | 'error'
  width: number; height: number; format: string; src: string; origin: string
  url?: string; error?: string; note?: string; formatNote?: string
  crossOriginBlocked?: boolean; sizeBlocked?: boolean
}

interface ThemeVars {
  bg: string; s1: string; s2: string
  border: string; borderHard: string
  text: string; t2: string; t3: string
  accent: string; accentFg: string; accentSub: string; accentSubHard: string
  primary: string; primaryFg: string
  sidebar: string; code: string; shadow: string; shadowMd: string
  ok: string; okBg: string
  err: string; errBg: string
  warn: string; warnBg: string
  addBg: string; addText: string
  rmBg: string; rmText: string
  jKey: string; jStr: string; jNum: string; jBool: string; jNull: string
  inputBg: string; inputBorder: string
}

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: Record<ThemeKey, { label: string; icon: string; dark: boolean; v: ThemeVars }> = {
  light: {
    label: '浅色', icon: '◐', dark: false,
    v: {
      // Nearly white — matches the Zendeeps reference: pure surfaces, ghost borders
      bg: '#ffffff', s1: '#f9fafb', s2: '#f3f4f6',
      border: 'rgba(0,0,0,0.07)', borderHard: 'rgba(0,0,0,0.16)',
      text: '#111827', t2: '#6b7280', t3: '#9ca3af',
      accent: '#2563eb', accentFg: '#fff', accentSub: 'rgba(37,99,235,0.07)', accentSubHard: 'rgba(37,99,235,0.12)',
      primary: '#111827', primaryFg: '#ffffff',
      sidebar: '#f9fafb', code: '#f9fafb', shadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px -4px rgba(0,0,0,0.07)', shadowMd: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
      ok: '#16a34a', okBg: 'rgba(22,163,74,0.08)',
      err: '#dc2626', errBg: 'rgba(220,38,38,0.08)',
      warn: '#d97706', warnBg: 'rgba(217,119,6,0.08)',
      addBg: 'rgba(22,163,74,0.09)', addText: '#15803d',
      rmBg: 'rgba(220,38,38,0.09)', rmText: '#b91c1c',
      jKey: '#7c3aed', jStr: '#15803d', jNum: '#1d4ed8', jBool: '#b45309', jNull: '#9ca3af',
      inputBg: '#ffffff', inputBorder: 'rgba(0,0,0,0.11)',
    },
  },
  dark: {
    label: '深色', icon: '●', dark: true,
    v: {
      bg: '#111113', s1: '#1a1a1c', s2: '#252527',
      border: 'rgba(255,255,255,0.07)', borderHard: 'rgba(255,255,255,0.15)',
      text: '#f0f0f2', t2: '#8e8e93', t3: '#48484a',
      accent: '#3b82f6', accentFg: '#fff', accentSub: 'rgba(59,130,246,0.13)', accentSubHard: 'rgba(59,130,246,0.2)',
      primary: '#ebebed', primaryFg: '#111113',
      sidebar: '#0d0d0f', code: '#0d0d0f', shadow: '0 1px 3px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.6)', shadowMd: '0 4px 20px rgba(0,0,0,0.55)',
      ok: '#34d399', okBg: 'rgba(52,211,153,0.1)',
      err: '#f87171', errBg: 'rgba(248,113,113,0.1)',
      warn: '#fbbf24', warnBg: 'rgba(251,191,36,0.1)',
      addBg: 'rgba(52,211,153,0.13)', addText: '#34d399',
      rmBg: 'rgba(248,113,113,0.13)', rmText: '#f87171',
      jKey: '#c084fc', jStr: '#6ee7b7', jNum: '#7dd3fc', jBool: '#fcd34d', jNull: '#6b7280',
      inputBg: '#1a1a1c', inputBorder: 'rgba(255,255,255,0.1)',
    },
  },
  claude: {
    // Muted clay/terracotta — not yellow. Warm cream base with dusty sienna accent.
    label: '暖陶', icon: '✦', dark: false,
    v: {
      bg: '#fdf8f4', s1: '#f5ede4', s2: '#ede0d4',
      border: 'rgba(120,70,40,0.1)', borderHard: 'rgba(120,70,40,0.22)',
      text: '#2c1f14', t2: '#7a5c44', t3: '#b09880',
      accent: '#b5603a', accentFg: '#fff', accentSub: 'rgba(181,96,58,0.09)', accentSubHard: 'rgba(181,96,58,0.16)',
      primary: '#2c1f14', primaryFg: '#fdf8f4',
      sidebar: '#f7efe6', code: '#f2e8dc', shadow: '0 1px 3px rgba(80,40,20,0.07), 0 4px 12px -4px rgba(80,40,20,0.12)', shadowMd: '0 4px 16px rgba(80,40,20,0.14)',
      ok: '#5a8740', okBg: 'rgba(90,135,64,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#b5603a', warnBg: 'rgba(181,96,58,0.09)',
      addBg: 'rgba(90,135,64,0.12)', addText: '#3d6022',
      rmBg: 'rgba(196,75,56,0.12)', rmText: '#963228',
      jKey: '#8b5cf6', jStr: '#3d7a28', jNum: '#2563eb', jBool: '#b5603a', jNull: '#b09880',
      inputBg: '#fdf8f4', inputBorder: 'rgba(120,70,40,0.15)',
    },
  },
  green: {
    // Dusty sage — muted, not saturated. Matches swatch.
    label: '山野绿', icon: '◉', dark: false,
    v: {
      bg: '#f8fbf8', s1: '#eef4ee', s2: '#e0ece0',
      border: 'rgba(30,70,40,0.09)', borderHard: 'rgba(30,70,40,0.2)',
      text: '#1a2e1f', t2: '#4a7055', t3: '#85a88e',
      accent: '#3d7a54', accentFg: '#fff', accentSub: 'rgba(61,122,84,0.09)', accentSubHard: 'rgba(61,122,84,0.16)',
      primary: '#1a2e1f', primaryFg: '#f8fbf8',
      sidebar: '#f0f7f0', code: '#eaf3ea', shadow: '0 1px 3px rgba(20,50,30,0.06), 0 4px 12px -4px rgba(20,50,30,0.1)', shadowMd: '0 4px 16px rgba(20,50,30,0.12)',
      ok: '#3d7a54', okBg: 'rgba(61,122,84,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#a07030', warnBg: 'rgba(160,112,48,0.09)',
      addBg: 'rgba(61,122,84,0.13)', addText: '#285c3a',
      rmBg: 'rgba(196,75,56,0.13)', rmText: '#8f2e20',
      jKey: '#6d5aad', jStr: '#2e6e44', jNum: '#1d6a9e', jBool: '#8a6030', jNull: '#85a88e',
      inputBg: '#f0faf4', inputBorder: 'rgba(0,80,40,0.16)',
    },
  },
}

const TOOLS: { key: ToolKey; label: string; icon: React.ReactNode }[] = [
  { key: 'seedance', label: 'Seedance 计费', icon: <IconSeedance /> },
  { key: 'json', label: 'JSON 可视化', icon: <IconJson /> },
  { key: 'timestamp', label: '时间戳转换', icon: <IconClock /> },
  { key: 'aiconvert', label: 'AI 格式转换', icon: <IconConvert /> },
  { key: 'llmbatch', label: 'LLM 批量测试', icon: <IconBatch /> },
  { key: 'imganalyze', label: '图片信息识别', icon: <IconImage /> },
  { key: 'idgen', label: 'ID 生成器', icon: <IconId /> },
  { key: 'base64', label: 'Base64 编解码', icon: <IconCode /> },
  { key: 'unicode', label: 'Unicode 转换', icon: <IconType /> },
]

// ─── Icon Components ──────────────────────────────────────────────────────────

function IconSeedance() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  )
}
function IconJson() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IconConvert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IconBatch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/>
      <rect x="2" y="11" width="6" height="6" rx="1"/><rect x="9" y="11" width="6" height="6" rx="1"/><rect x="16" y="11" width="6" height="6" rx="1"/>
    </svg>
  )
}
function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5 3 3L15 11l5 5"/>
    </svg>
  )
}
function IconId() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  )
}
function IconCode() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  )
}
function IconType() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  )
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/>
    </svg>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatJson(raw: string): { ok: boolean; text: string } {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(raw), null, 2) }
  } catch {
    return { ok: false, text: raw }
  }
}

function highlightJson(text: string, matchCol?: number): string {
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

interface DiffLine {
  type: 'same' | 'add' | 'rm'
  left: string | null
  right: string | null
  leftNum: number | null
  rightNum: number | null
}

function computeDiff(a: string[], b: string[]): DiffLine[] {
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
function findMatchingBracket(text: string, cursorPos: number): number | null {
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

/** 计算光标位置对应的 JSON 路径（如 root > name > first） */
function getJsonPath(text: string, line: number, col: number): string | null {
  if (!text.trim()) return null
  const lines = text.split('\n')
  let charIdx = 0
  for (let i = 0; i < Math.min(line, lines.length); i++) charIdx += lines[i].length + 1
  charIdx += Math.min(col, lines[line]?.length || 0)

  const segments: string[] = ['root']
  let inStr = false, currentKey = '', arrIdx = 0, escape = false

  for (let i = 0; i < text.length && i < charIdx; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (inStr) {
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') {
        inStr = false
        const after = text.slice(i + 1).match(/\S/)
        if (after && text[i + 1 + after.index!] === ':' && segments.length > 0) {
          segments[segments.length - 1] = currentKey
        }
        currentKey = ''
      } else { currentKey += ch }
      continue
    }
    if (ch === '"') { inStr = true; currentKey = ''; continue }
    if (ch === '{') { segments.push('?'); continue }
    if (ch === '}') { if (segments.length > 1) segments.pop(); continue }
    if (ch === '[') { arrIdx = 0; segments.push('[0]'); continue }
    if (ch === ']') { if (segments.length > 1) segments.pop(); continue }
    if (ch === ',') {
      const last = segments[segments.length - 1]
      if (last && /^\[\d+\]$/.test(last)) {
        arrIdx++
        segments[segments.length - 1] = `[${arrIdx}]`
      }
    }
  }
  return segments.join(' > ')
}

// ─── Image Analyzer Utilities ────────────────────────────────────────────────────

const IMG_STANDARDS = [
  { tier:'8K', name:'8K UHD (4320p)', w:7680, h:4320 },
  { tier:'8K', name:'8K DCI', w:8192, h:4320 },
  { tier:'6K', name:'6K', w:6144, h:3456 },
  { tier:'5K', name:'5K UHD+', w:5120, h:2880 },
  { tier:'4K', name:'4K DCI', w:4096, h:2160 },
  { tier:'4K', name:'4K UHD (2160p)', w:3840, h:2160 },
  { tier:'4K', name:'4K 宽屏 UW', w:3840, h:1600 },
  { tier:'3K', name:'3K (3200×1800)', w:3200, h:1800 },
  { tier:'2K', name:'2K QHD (1440p)', w:2560, h:1440 },
  { tier:'2K', name:'2K 超宽 UWQHD', w:3440, h:1440 },
  { tier:'2K', name:'2K DCI', w:2048, h:1080 },
  { tier:'2K', name:'QXGA', w:2048, h:1536 },
  { tier:'1080P', name:'WUXGA', w:1920, h:1200 },
  { tier:'1080P', name:'FHD 1080P', w:1920, h:1080 },
  { tier:'1080P', name:'FHD 超宽', w:2560, h:1080 },
  { tier:'900P', name:'HD+ 900P', w:1600, h:900 },
  { tier:'900P', name:'WSXGA+', w:1680, h:1050 },
  { tier:'768P', name:'WXGA (768p)', w:1366, h:768 },
  { tier:'720P', name:'HD 720P', w:1280, h:720 },
  { tier:'720P', name:'WXGA 16:10', w:1280, h:800 },
  { tier:'768P', name:'XGA', w:1024, h:768 },
  { tier:'576P', name:'PAL 576P', w:1024, h:576 },
  { tier:'480P', name:'FWVGA 480P', w:854, h:480 },
  { tier:'480P', name:'VGA 480P', w:640, h:480 },
  { tier:'480P', name:'SVGA', w:800, h:600 },
  { tier:'360P', name:'nHD 360P', w:640, h:360 },
  { tier:'240P', name:'240P', w:426, h:240 },
  { tier:'144P', name:'144P', w:256, h:144 },
] as const

const IMG_TIER_STYLE: Record<string, string> = {
  '8K': 'from-rose-500 to-orange-500',
  '6K': 'from-rose-500 to-pink-500',
  '5K': 'from-fuchsia-500 to-pink-500',
  '4K': 'from-violet-500 to-fuchsia-500',
  '3K': 'from-indigo-500 to-violet-500',
  '2K': 'from-sky-500 to-indigo-500',
  '1080P': 'from-emerald-500 to-teal-500',
  '900P': 'from-teal-500 to-cyan-600',
  '768P': 'from-cyan-600 to-sky-700',
  '720P': 'from-amber-500 to-yellow-600',
  '576P': 'from-amber-600 to-orange-700',
  '480P': 'from-orange-600 to-red-700',
  '360P': 'from-slate-500 to-slate-600',
  '240P': 'from-slate-600 to-slate-700',
  '144P': 'from-slate-700 to-slate-800',
  '非标准': 'from-slate-600 to-slate-700',
}

const IMG_FORMAT_COLOR: Record<string, string> = {
  JPEG: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/25',
  PNG: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-400/25',
  WebP: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-400/25',
  GIF: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-400/25',
  SVG: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-400/25',
  AVIF: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-400/25',
  HEIC: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-400/25',
  BMP: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/25',
  ICO: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-400/25',
  TIFF: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-400/25',
}

const IMG_COMMON_RATIOS: [number, number][] = [
  [16,9],[9,16],[4,3],[3,4],[3,2],[2,3],[1,1],[21,9],[9,21],[16,10],[10,16],[5,4],[4,5],[2,1],[1,2],[32,9],[5,3],[7,5]
]

function imgFormatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '未知'
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(kb < 10 ? 2 : 1) + ' KB'
  const mb = kb / 1024
  if (mb < 1024) return mb.toFixed(2) + ' MB'
  return (mb / 1024).toFixed(2) + ' GB'
}

function imgGcd(a: number, b: number): number { return b === 0 ? a : imgGcd(b, a % b) }

function imgAspectRatio(w: number, h: number): string {
  if (!w || !h) return '—'
  const r = w / h
  let best: [number, number] | null = null; let bestDiff = Infinity
  for (const [a, b] of IMG_COMMON_RATIOS) {
    const d = Math.abs(r - a / b)
    if (d < bestDiff) { bestDiff = d; best = [a, b] }
  }
  if (best && bestDiff / r < 0.012) return `${best[0]}:${best[1]}`
  const g = imgGcd(w, h); const sw = w / g; const sh = h / g
  if (sw <= 40 && sh <= 40) return `${sw}:${sh}`
  return r.toFixed(2) + ':1'
}

interface ImgClassification { tier: string; label: string; standard: boolean; name: string; exact?: boolean; near?: string }

function imgClassifyResolution(w: number, h: number, loose: boolean): ImgClassification {
  if (!w || !h) return { tier: '未知', label: '未知', standard: false, name: '' }
  const long = Math.max(w, h); const short = Math.min(w, h); const tol = loose ? 0.02 : 0
  for (const s of IMG_STANDARDS) {
    const sl = Math.max(s.w, s.h); const ss = Math.min(s.w, s.h)
    const okL = tol ? Math.abs(long - sl) / sl <= tol : long === sl
    const okS = tol ? Math.abs(short - ss) / ss <= tol : short === ss
    if (okL && okS) return { tier: s.tier, label: s.tier, standard: true, name: s.name, exact: long === sl && short === ss }
  }
  let near = '低于 144P'
  const buckets: [number, string][] = [[7680,'8K'],[6144,'6K'],[5120,'5K'],[3840,'4K'],[3200,'3K'],[2560,'2K'],[1920,'1080P'],[1600,'900P'],[1366,'768P'],[1280,'720P'],[1024,'576P'],[854,'480P'],[640,'360P'],[426,'240P'],[256,'144P']]
  for (const [edge, name] of buckets) { if (long >= edge) { near = name; break } }
  return { tier: '非标准', label: '非标准分辨率', standard: false, name: '', near }
}

function imgDetectFormat(buffer: ArrayBuffer): string | null {
  const b = new Uint8Array(buffer)
  const hex = Array.from(b.slice(0, 16)).map(x => x.toString(16).padStart(2, '0')).join('')
  if (hex.startsWith('ffd8ff')) return 'JPEG'
  if (hex.startsWith('89504e47')) return 'PNG'
  if (hex.startsWith('47494638')) return 'GIF'
  if (hex.startsWith('424d')) return 'BMP'
  if (hex.startsWith('00000100')) return 'ICO'
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'TIFF'
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'WebP'
  if (b.length > 12 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...b.slice(8, 12)).toLowerCase()
    if (brand.startsWith('avi')) return 'AVIF'
    if (/heic|heix|hevc|mif1|msf1|heim/.test(brand)) return 'HEIC'
  }
  try {
    const head = new TextDecoder().decode(b.slice(0, 300)).trim().toLowerCase()
    if (head.includes('<svg') || head.startsWith('<?xml')) return 'SVG'
  } catch { /* ignore */ }
  return null
}

function imgMimeToFormat(mime: string = ''): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'JPEG'
  if (m.includes('png')) return 'PNG'
  if (m.includes('webp')) return 'WebP'
  if (m.includes('gif')) return 'GIF'
  if (m.includes('bmp')) return 'BMP'
  if (m.includes('svg')) return 'SVG'
  if (m.includes('avif')) return 'AVIF'
  if (m.includes('heic') || m.includes('heif')) return 'HEIC'
  if (m.includes('icon') || m.includes('ico')) return 'ICO'
  if (m.includes('tiff')) return 'TIFF'
  return ''
}

function imgExtFromUrl(url: string = ''): string {
  try {
    const clean = url.split('?')[0].split('#')[0]
    const m = clean.match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toUpperCase().replace('JPG', 'JPEG') : ''
  } catch { return '' }
}

// ─── Seedance Pricing（每百万 Token 计费） ────────────────────────────────────
// 国内：火山方舟官方定价（元/百万Token）。海外：BytePlus ModelArk 官方美元定价
// （美元/百万Token）。海外 2.5 官方尚未公布，单价留空由用户填写并保存到本地。

type RegionKey = 'cn' | 'us'

interface TierPrice { no: number | null; yes: number | null }
interface PriceTier { id: string; label: string; resolutions: string[]; price: TierPrice }
interface ModelDef { name: string; desc: string; tiers: PriceTier[] }

const INTL_25_KEY = 'dreamina-seedance-2-5'
const DEFAULT_RATE = 7

type SeedCalcResult =
  | { ready: true; totalCN: number; totalUSD: number; unitCN: number; unitUSD: number }
  | { ready: false; reason: string }

const SEEDANCE_PRICING: Record<RegionKey, Record<string, ModelDef>> = {
  cn: {
    'doubao-seedance-2.0': {
      name: 'doubao-seedance-2.0',
      desc: '价格根据输出分辨率及输入是否包含视频而定。',
      tiers: [
        { id: 'hd',  label: 'HD · 480p/720p', resolutions: ['480p', '720p'], price: { no: 46, yes: 28 } },
        { id: 'fhd', label: 'FHD · 1080p',    resolutions: ['1080p'],         price: { no: 51, yes: 31 } },
        { id: 'uhd', label: 'UHD · 4K',       resolutions: ['4K'],            price: { no: 26, yes: 16 } },
      ],
    },
    'doubao-seedance-2.0-fast': {
      name: 'doubao-seedance-2.0-fast',
      desc: '价格根据输入是否包含视频而定，不支持 1080p 输出。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 37, yes: 22 } }],
    },
    'doubao-seedance-2.0-mini': {
      name: 'doubao-seedance-2.0-mini',
      desc: '价格根据输入是否包含视频而定，不支持 1080p 输出。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 23, yes: 14 } }],
    },
    'doubao-seedance-2.5': {
      name: 'doubao-seedance-2.5',
      desc: '2026-07-31 官方公布。当前最高支持 720p 输出。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 70, yes: 42 } }],
    },
  },
  us: {
    'dreamina-seedance-2-0-260128': {
      name: 'dreamina-seedance-2-0-260128',
      desc: '价格根据输出分辨率及输入是否包含视频而定。',
      tiers: [
        { id: 'hd',  label: 'HD · 480p/720p', resolutions: ['480p', '720p'], price: { no: 7.0, yes: 4.3 } },
        { id: 'fhd', label: 'FHD · 1080p',    resolutions: ['1080p'],         price: { no: 7.7, yes: 4.7 } },
        { id: 'uhd', label: 'UHD · 4K',       resolutions: ['4K'],            price: { no: 4.0, yes: 2.4 } },
      ],
    },
    'dreamina-seedance-2-0-fast-260128': {
      name: 'dreamina-seedance-2-0-fast-260128',
      desc: '价格根据输入是否包含视频而定，不支持 1080p 输出。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 5.6, yes: 3.3 } }],
    },
    'dreamina-seedance-2-0-mini-260615': {
      name: 'dreamina-seedance-2-0-mini-260615',
      desc: '价格根据输入是否包含视频而定，不支持 1080p 输出。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 3.5, yes: 2.1 } }],
    },
    [INTL_25_KEY]: {
      name: INTL_25_KEY,
      desc: '海外 2.5 官方单价尚未公布，可在价目表内手动填写（单位：美元/百万 Token），改动自动保存到本地。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: null, yes: null } }],
    },
  },
}

const modelResolutions = (def: ModelDef): string[] => Array.from(new Set(def.tiers.flatMap(t => t.resolutions)))
const tierFor = (def: ModelDef, res: string): PriceTier | undefined => def.tiers.find(t => t.resolutions.includes(res))
const fmtPrice = (v: number | null | undefined, cur: RegionKey): string => {
  if (v == null) return '—'
  const n = Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
  return (cur === 'cn' ? '¥' : '$') + n
}
const fmtTotal = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })

// ─── AI Format Converters ─────────────────────────────────────────────────────

type AiFmt = 'openai-chat' | 'anthropic' | 'openai-responses'

function convertFormat(raw: string, from: AiFmt, to: AiFmt, addCache = false): string {
  let obj: Record<string, unknown>
  try { obj = JSON.parse(raw) } catch { return '// JSON 解析失败，请检查输入格式' }

  let normalized: { system?: string; messages: { role: string; content: string }[]; model?: string; maxTokens?: number; temperature?: number }

  if (from === 'openai-chat') {
    const msgs: { role: string; content: string }[] = (obj.messages as { role: string; content: string }[]) || []
    const sysMsg = msgs.find(m => m.role === 'system')
    normalized = { system: sysMsg?.content, messages: msgs.filter(m => m.role !== 'system'), model: obj.model as string, maxTokens: (obj.max_tokens as number) || 1024, temperature: obj.temperature as number }
  } else if (from === 'anthropic') {
    normalized = {
      system: obj.system as string,
      messages: ((obj.messages as { role: string; content: unknown }[]) || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
      model: obj.model as string, maxTokens: (obj.max_tokens as number) || 1024, temperature: obj.temperature as number,
    }
  } else {
    const input = obj.input
    let messages: { role: string; content: string }[] = []
    if (typeof input === 'string') { messages = [{ role: 'user', content: input }] }
    else if (Array.isArray(input)) { messages = (input as { role: string; content: { text: string }[] }[]).map(m => ({ role: m.role, content: m.content?.map((c: { text: string }) => c.text).join('') || '' })) }
    normalized = { system: obj.instructions as string, messages, model: obj.model as string, maxTokens: (obj.max_output_tokens as number) || 1024 }
  }

  const wrapContent = (text: string) => addCache ? [{ type: 'text', text, cache_control: { type: 'ephemeral' } }] : text

  if (to === 'openai-chat') {
    const msgs = []
    if (normalized.system) msgs.push({ role: 'system', content: normalized.system })
    normalized.messages.forEach(m => msgs.push({ role: m.role, content: m.content }))
    const out: Record<string, unknown> = { model: normalized.model || 'gpt-4o', messages: msgs, max_tokens: normalized.maxTokens }
    if (normalized.temperature !== undefined) out.temperature = normalized.temperature
    return JSON.stringify(out, null, 2)
  }

  if (to === 'anthropic') {
    const out: Record<string, unknown> = {
      model: normalized.model || 'claude-opus-4-8', max_tokens: normalized.maxTokens,
      messages: normalized.messages.map(m => ({ role: m.role, content: addCache ? wrapContent(m.content) : m.content })),
    }
    if (normalized.system) out.system = addCache ? [{ type: 'text', text: normalized.system, cache_control: { type: 'ephemeral' } }] : normalized.system
    if (normalized.temperature !== undefined) out.temperature = normalized.temperature
    return JSON.stringify(out, null, 2)
  }

  const lastUserMsg = [...normalized.messages].reverse().find(m => m.role === 'user')
  const out: Record<string, unknown> = {
    model: normalized.model || 'gpt-4o',
    input: normalized.messages.map(m => ({ type: 'message', role: m.role, content: [{ type: 'input_text', text: m.content }] })),
    max_output_tokens: normalized.maxTokens,
  }
  if (normalized.system) out.instructions = normalized.system
  if (!lastUserMsg) out.input = normalized.system || ''
  return JSON.stringify(out, null, 2)
}

// ─── Custom UI Components ─────────────────────────────────────────────────────

function Btn({ children, onClick, variant = 'ghost', small, className = '', disabled, style }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'accent' | 'soft' | 'ghost' | 'danger'
  small?: boolean; className?: string; disabled?: boolean; style?: React.CSSProperties
}) {
  const base = `inline-flex items-center justify-center font-semibold select-none cursor-pointer transition-all duration-150 rounded-full border-0 outline-none`
  const sz = small ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-4 py-2 text-sm gap-2'
  const vs = {
    primary: { background: 'var(--primary)', color: 'var(--primaryFg)' },
    accent: { background: 'var(--accent)', color: 'var(--accentFg)' },
    soft: { background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--t2)' },
    danger: { background: 'var(--errBg)', color: 'var(--err)' },
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${sz} ${className} ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
      style={{ ...vs, ...style }}
      onPointerEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.07)' }}
      onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none' }}>
      {children}
    </button>
  )
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={`text-xs font-semibold tracking-wide uppercase ${className}`} style={{ color: 'var(--t2)', letterSpacing: '0.06em' }}>
      {children}
    </label>
  )
}

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', ...style }}>
      {children}
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color?: 'ok' | 'err' | 'warn' | 'default' }) {
  const s = color === 'ok' ? { background: 'var(--okBg)', color: 'var(--ok)' }
    : color === 'err' ? { background: 'var(--errBg)', color: 'var(--err)' }
    : color === 'warn' ? { background: 'var(--warnBg)', color: 'var(--warn)' }
    : { background: 'var(--s2)', color: 'var(--t2)' }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style={s}>
      {children}
    </span>
  )
}

// Fully custom Input — no native appearance
function CustomInput({ value, onChange, placeholder, className = '', type = 'text', mono, style }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string
  className?: string; type?: string; mono?: boolean; style?: React.CSSProperties
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className={`relative flex items-center rounded-xl overflow-hidden transition-all duration-150 ${className}`}
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : '0 1px 2px rgba(0,0,0,0.03)',
        ...style,
      }}
    >
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--text)',
          fontFamily: mono ? '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' : 'inherit',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
        }}
      />
    </div>
  )
}

// Fully custom Select — replaces native <select>
function CustomSelect({ value, onChange, options, className = '' }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [open])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'ArrowDown' && open) {
      const idx = options.findIndex(o => o.value === value)
      if (idx < options.length - 1) onChange(options[idx + 1].value)
    }
    if (e.key === 'ArrowUp' && open) {
      const idx = options.findIndex(o => o.value === value)
      if (idx > 0) onChange(options[idx - 1].value)
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKey}
        className="w-full flex items-center justify-between overflow-hidden min-w-0 rounded-xl transition-all duration-150 cursor-pointer border-0 outline-none active:scale-[0.99]"
        style={{
          padding: '8px 12px',
          background: 'var(--inputBg)',
          border: `1px solid ${open || focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: open || focused ? '0 0 0 3px var(--accentSub)' : '0 1px 2px rgba(0,0,0,0.03)',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      >
        <span className="truncate" style={{ color: selected ? 'var(--text)' : 'var(--t3)' }} title={selected?.label ?? ''}>{selected?.label ?? '选择…'}</span>
        <span style={{ color: 'var(--t3)', marginLeft: 8, flexShrink: 0 }}>
          <IconChevron open={open} />
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 rounded-2xl overflow-hidden"
          style={{
            top: 'calc(100% + 5px)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadowMd)',
            padding: '4px',
          }}
        >
          {options.map((o, idx) => {
            const isActive = o.value === value
            return (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full flex items-center gap-2.5 rounded-xl transition-all duration-100 cursor-pointer border-0 outline-none text-left"
                style={{
                  padding: '8px 10px',
                  background: isActive ? 'var(--accentSubHard)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  marginBottom: idx < options.length - 1 ? 1 : 0,
                }}
                onPointerEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
                onPointerLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                {isActive && <span style={{ color: 'var(--accent)', flexShrink: 0 }}><IconCheck /></span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Fully custom Textarea
function CustomTextarea({ value, onChange, placeholder, rows, className = '', mono, style, stretch }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  rows?: number; className?: string; mono?: boolean; style?: React.CSSProperties; stretch?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-all duration-150 ${className}`}
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : '0 1px 2px rgba(0,0,0,0.03)',
        display: stretch ? 'flex' : undefined,
        flexDirection: stretch ? 'column' : undefined,
        ...style,
      }}
    >
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className="resize-none outline-none"
        style={{
          width: '100%',
          flex: stretch ? 1 : undefined,
          minHeight: stretch ? 0 : undefined,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 13,
          color: 'var(--text)',
          fontFamily: mono ? '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' : 'inherit',
          lineHeight: 1.65,
          display: 'block',
        }}
      />
    </div>
  )
}

// Toggle switch
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative flex-shrink-0 border-0 outline-none cursor-pointer transition-all duration-200 active:scale-95"
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: value ? 'var(--accent)' : 'var(--s2)',
          boxShadow: value ? '0 0 0 3px var(--accentSub)' : 'none',
        }}
      >
        <span
          className="absolute"
          style={{
            top: 3, left: value ? 21 : 3,
            width: 16, height: 16, borderRadius: 8,
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            transition: 'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
      </button>
      {label && <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>}
    </label>
  )
}

// Segmented control (replaces inline button groups)
function SegmentedControl({ value, options, onChange, className = '' }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string
}) {
  return (
    <div className={`inline-flex rounded-xl p-1 gap-1 ${className}`} style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer border-0 outline-none transition-all duration-150 active:scale-[0.96] whitespace-nowrap"
            style={{
              background: active ? 'var(--bg)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--t2)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold tracking-tight mb-1" style={{ color: 'var(--text)', letterSpacing: '-0.025em' }}>{children}</h2>
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <Btn onClick={copy} small variant="ghost" style={{ color: copied ? 'var(--ok)' : 'var(--t2)' }}>
      {copied ? '✓ 已复制' : '复制'}
    </Btn>
  )
}

// ─── Tool: Seedance 计费 ───────────────────────────────────────────────────────

function MiniNumInput({ value, placeholder, onChange }: {
  value: number | null; placeholder: string; onChange: (v: number | null) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => { const t = e.target.value.trim(); onChange(t === '' ? null : (parseFloat(t) || 0)) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={e => e.stopPropagation()}
      className="no-spinner w-20 text-right rounded-lg border-0 outline-none px-2 py-1 text-xs tabular-nums"
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'none',
        color: 'var(--text)',
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
        WebkitAppearance: 'none', MozAppearance: 'none',
      }}
    />
  )
}

function SeedanceTool() {
  const [region, setRegion] = useState<RegionKey>('cn')
  const [model, setModel] = useState('doubao-seedance-2.0')
  const [resolution, setResolution] = useState('480p')
  const [hasVideo, setHasVideo] = useState('否')
  const [tokens, setTokens] = useState('200000')
  const [rate, setRate] = useState(() => {
    if (typeof window !== 'undefined') {
      const v = parseFloat(localStorage.getItem('seedance-fx-rate') || '')
      if (!isNaN(v) && v > 0) return String(v)
    }
    return String(DEFAULT_RATE)
  })
  const [userIntl25, setUserIntl25] = useState<{ no: number | null; yes: number | null } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('seedance-intl-25-prices')
        if (!raw) return null
        const p = JSON.parse(raw)
        if (p && typeof p.no === 'number' && typeof p.yes === 'number') return { no: p.no, yes: p.yes }
      } catch { /* ignore */ }
    }
    return null
  })
  const [tableOpen, setTableOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('seedance-fx-rate', rate)
  }, [rate])
  useEffect(() => {
    if (userIntl25) localStorage.setItem('seedance-intl-25-prices', JSON.stringify(userIntl25))
  }, [userIntl25])

  const def = SEEDANCE_PRICING[region][model]
  const availableRes = def ? modelResolutions(def) : []

  const onRegionChange = (r: RegionKey) => {
    const first = Object.keys(SEEDANCE_PRICING[r])[0]
    setRegion(r)
    setModel(first)
    setResolution(modelResolutions(SEEDANCE_PRICING[r][first])[0])
  }
  const onModelChange = (m: string) => {
    setModel(m)
    const next = modelResolutions(SEEDANCE_PRICING[region][m])
    if (!next.includes(resolution)) setResolution(next[0])
  }

  const result = useMemo<SeedCalcResult>(() => {
    const tok = Math.max(parseFloat(tokens) || 0, 0)
    const xr = parseFloat(rate) || DEFAULT_RATE
    const def = SEEDANCE_PRICING[region][model]
    if (!def) return { ready: false, reason: '未找到该模型的定价' }
    const tier = tierFor(def, resolution)
    if (!tier) return { ready: false, reason: '当前分辨率不在该模型支持范围内' }

    const editable = region === 'us' && model === INTL_25_KEY
    const price = editable && userIntl25
      ? (hasVideo === '是' ? userIntl25.yes : userIntl25.no)
      : (hasVideo === '是' ? tier.price.yes : tier.price.no)

    if (price == null) {
      return {
        ready: false,
        reason: editable
          ? '海外 2.5 单价未填写，请在下方价目表中补全（自动保存到本地）'
          : '该档位暂无定价',
      }
    }

    const base = (tok / 1_000_000) * price
    return {
      ready: true,
      totalCN: region === 'cn' ? base : base * xr,
      totalUSD: region === 'us' ? base : base / xr,
      unitCN: region === 'cn' ? price : price * xr,
      unitUSD: region === 'us' ? price : price / xr,
    }
  }, [region, model, resolution, hasVideo, tokens, rate, userIntl25])

  const setIntl25Price = (k: 'no' | 'yes', v: number | null) => {
    setUserIntl25(prev => ({ no: prev?.no ?? null, yes: prev?.yes ?? null, [k]: v }))
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <SectionTitle>Seedance 计费计算器</SectionTitle>

      <div className="grid gap-5">
        {/* 操作区（整块表单卡片） */}
        <Card>
          {/* 区域 + 模型 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-2">计费区域</Label>
              <SegmentedControl
                value={region}
                options={[{ value: 'cn', label: '国内' }, { value: 'us', label: '海外' }]}
                onChange={v => onRegionChange(v as RegionKey)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="block mb-2">模型变体</Label>
              <CustomSelect value={model} onChange={onModelChange}
                options={Object.keys(SEEDANCE_PRICING[region]).map(m => ({ value: m, label: m }))} />
            </div>
          </div>

          {/* 分辨率 + 是否含视频 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-2">输出分辨率</Label>
              <CustomSelect value={resolution} onChange={setResolution}
                options={availableRes.map(r => ({ value: r, label: r }))} />
            </div>
            <div>
              <Label className="block mb-2">输入是否包含视频</Label>
              <CustomSelect value={hasVideo} onChange={setHasVideo}
                options={[{ value: '是', label: '是' }, { value: '否', label: '否' }]} />
            </div>
          </div>

          {/* Token 数 + 汇率 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-2">Token 数量</Label>
              <CustomInput type="number" value={tokens} onChange={setTokens} placeholder="200000" mono />
            </div>
            <div>
              <Label className="block mb-2">汇率 1 USD = ? CNY</Label>
              <CustomInput type="number" value={rate} onChange={setRate} placeholder="7" mono />
            </div>
          </div>
        </Card>

        {/* 结果 */}
        {result.ready ? (
          <div className="rounded-2xl p-6" style={{ background: 'var(--accentSub)', border: '1px solid var(--accentSubHard)' }}>
            <p className="text-xs font-bold mb-4 uppercase tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>预估费用</p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  ¥{fmtTotal(result.totalCN)}
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--t2)' }}>人民币</div>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  ${fmtTotal(result.totalUSD)}
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--t2)' }}>美元</div>
              </div>
            </div>
            <div className="mt-4 text-sm font-medium" style={{ color: 'var(--text)' }}>
              单价 <span className="tabular-nums">{fmtPrice(result.unitCN, 'cn')}</span> / 百万 Token
              <span style={{ color: 'var(--t3)' }}>（{fmtPrice(result.unitUSD, 'us')} / 百万 Token）</span>
            </div>
            <div className="mt-5 pt-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--t3)' }}>
              {model} · {resolution} · {hasVideo === '是' ? '输入含视频' : '输入不含视频'} · {tokens} tokens · 汇率 1 USD = {rate} CNY
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-5 flex items-start gap-3" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)' }}>
            <Badge color="warn">无法计算</Badge>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{result.reason}</span>
          </div>
        )}

        {/* 价目表（可折叠，默认收起，放最下面） */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => setTableOpen(o => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-0 outline-none cursor-pointer"
            style={{ background: 'var(--bg)', fontFamily: 'inherit' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              价目表 · {region === 'cn' ? '国内（元/百万 Token）' : '海外（美元/百万 Token）'}
            </span>
            <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--t3)' }}>点击行选中</span>
            <IconChevron open={tableOpen} />
          </button>
          {tableOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {Object.entries(SEEDANCE_PRICING[region]).map(([mk, md]) => {
                const isEditable = region === 'us' && mk === INTL_25_KEY
                const activeTierId = model === mk ? tierFor(md, resolution)?.id : null
                return (
                  <div key={mk}>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>
                      {md.name}
                    </div>
                    {md.tiers.map(tier => {
                      const isActive = mk === model && tier.id === activeTierId
                      if (isEditable) {
                        return (
                          <div key={`${mk}:${tier.id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-xs"
                            style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="font-medium" style={{ color: 'var(--text)' }}>{tier.label}</span>
                            <MiniNumInput value={userIntl25?.no ?? null} placeholder="不含视频"
                              onChange={v => setIntl25Price('no', v)} />
                            <MiniNumInput value={userIntl25?.yes ?? null} placeholder="含视频"
                              onChange={v => setIntl25Price('yes', v)} />
                          </div>
                        )
                      }
                      return (
                        <button key={`${mk}:${tier.id}`} onClick={() => { onModelChange(mk); setResolution(tier.resolutions[0]) }}
                          className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-xs border-0 outline-none cursor-pointer text-left transition-all duration-100 active:scale-[0.995]"
                          style={{ background: isActive ? 'var(--accentSubHard)' : 'transparent', borderTop: '1px solid var(--border)', fontFamily: 'inherit' }}
                          onPointerEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
                          onPointerLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                          <span className="font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>{tier.label}</span>
                          <span className="tabular-nums" style={{ color: isActive ? 'var(--accent)' : 'var(--t2)' }}>{fmtPrice(tier.price.no, region)}</span>
                          <span className="tabular-nums" style={{ color: isActive ? 'var(--accent)' : 'var(--t2)' }}>{fmtPrice(tier.price.yes, region)}</span>
                        </button>
                      )
                    })}
                    {isEditable && (
                      <div className="px-4 pb-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>
                        海外 2.5 官方单价未公布，手动填写（美元/百万 Token）后自动保存到本地。
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Tool: JSON 可视化 ─────────────────────────────────────────────────────────

const JSON_ROW = 20        // 单行高度：查看态/编辑态统一，切换时不跳
const JSON_PAD_TB = 14     // 内容区上下内边距
const JSON_PAD_L = 8       // 内容区左内边距（行号列之前）
const JSON_LINE_NO_W = 24  // 行号列宽度（右对齐，容纳 3 位行号）
const JSON_FOLD_W = 16     // 折叠箭头位宽
const JSON_GUTTER_W = JSON_LINE_NO_W + JSON_FOLD_W // 行号(24) + 折叠箭头位(16)
const JSON_CONTENT_X = JSON_PAD_L + JSON_GUTTER_W // 48px：两态内容真正起始的 x 坐标，必须完全一致，否则悬停切换会横向跳动

const JSON_EDITOR_STYLE: React.CSSProperties = {
  fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
  fontSize: '12.5px',
  lineHeight: JSON_ROW + 'px',
  padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_CONTENT_X}px`,
  tabSize: 2,
  whiteSpace: 'pre',
  margin: 0,
}

/** 计算每行「可折叠区间」：起始行 → 配对结束行（括号配对） */
function computeFoldRanges(lines: string[]): Map<number, number> {
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
function getVisibleLines(lines: string[], ranges: Map<number, number>, collapsed: Set<number>): number[] {
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

/**
 * 查看态：虚拟滚动 + 行号 + 折叠 + diff 高亮（只读）。
 * 行号/折叠箭头列（gutter）悬停不触发编辑；内容列悬停即让父组件切到编辑态。
 */
function JsonTreeView({ text, types, collapsed, toggleFold, scrollRef, onContentEnter, onContentActivate }: {
  text: string; types?: ('same' | 'add' | 'rm')[]
  collapsed: Set<number>; toggleFold: (line: number) => void
  scrollRef: React.MutableRefObject<{ top: number; left: number }>
  onContentEnter: () => void; onContentActivate: (e: React.PointerEvent) => void
}) {
  const OVERSCAN = 10
  const lines = useMemo(() => text.split('\n'), [text])
  const ranges = useMemo(() => computeFoldRanges(lines), [lines])
  const [scrollTop, setScrollTop] = useState(scrollRef.current.top)
  const [viewportH, setViewportH] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // 挂载时把上次记录的滚动位置带回来，避免悬停切回查看态时视口跳变
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = scrollRef.current.top
    el.scrollLeft = scrollRef.current.left
    setViewportH(el.clientHeight)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const visible = useMemo(() => getVisibleLines(lines, ranges, collapsed), [lines, ranges, collapsed])
  const start = Math.max(0, Math.floor(scrollTop / JSON_ROW) - OVERSCAN)
  const end = Math.min(visible.length, Math.ceil((scrollTop + viewportH) / JSON_ROW) + OVERSCAN)
  const slice = visible.slice(start, end)

  const onScroll = () => {
    const el = containerRef.current
    if (!el) return
    scrollRef.current = { top: el.scrollTop, left: el.scrollLeft }
    setScrollTop(el.scrollTop)
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div ref={containerRef} onScroll={onScroll}
        className="absolute inset-0 overflow-auto"
        style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', fontSize: '12.5px', lineHeight: JSON_ROW + 'px', padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_PAD_L}px`, tabSize: 2 }}>
        <div style={{ height: visible.length * JSON_ROW, position: 'relative' }}>
          {slice.map((i, k) => {
            const vi = start + k // 可见序位（用于绝对定位），i 才是真实行号（用于取值/折叠区间）
            const t = types?.[i]
            const bg = t === 'add' ? 'var(--addBg)' : t === 'rm' ? 'var(--rmBg)' : 'transparent'
            const foldEnd = ranges.get(i)
            const foldable = foldEnd != null && foldEnd > i
            const isCollapsed = collapsed.has(i)
            return (
              <div key={i} style={{ position: 'absolute', top: vi * JSON_ROW, left: 0, right: 0, height: JSON_ROW, display: 'flex', alignItems: 'center', background: bg }}>
                <span data-testid="json-gutter" className="select-none" style={{ width: JSON_LINE_NO_W, flexShrink: 0, textAlign: 'right', paddingRight: 4, color: 'var(--t3)', fontSize: '11px', position: 'sticky', left: 0, background: 'var(--code)' }}>{i + 1}</span>
                {foldable ? (
                  <button onClick={() => toggleFold(i)} aria-label={isCollapsed ? '展开' : '折叠'}
                    className="flex-shrink-0 border-0 bg-transparent cursor-pointer outline-none"
                    style={{ width: JSON_FOLD_W, height: JSON_FOLD_W, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', padding: 0, fontFamily: 'inherit', fontSize: '10px', position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }}>
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : <span className="flex-shrink-0" style={{ width: JSON_FOLD_W, position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }} />}
                <span data-testid="json-content" onMouseEnter={onContentEnter} onPointerDown={onContentActivate}
                  style={{ whiteSpace: 'pre', color: 'var(--text)', flex: 1, height: '100%' }}
                  dangerouslySetInnerHTML={{ __html: highlightJson(lines[i]) || '​' }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DiffEditor({ value, onChange, placeholder, lineTypes, scrollRef, onFocus, onBlur, autoFocus, onGutterEnter, onCursorChange }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; lineTypes?: ('same' | 'add' | 'rm')[]
  scrollRef: React.MutableRefObject<{ top: number; left: number }>
  onFocus?: () => void; onBlur?: () => void; autoFocus?: boolean
  onGutterEnter: () => void
  onCursorChange?: (line: number, col: number) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const backRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = value.length ? value.split('\n') : ['']
  const [matchPos, setMatchPos] = useState<{ line: number; col: number } | null>(null)
  const prevValueRef = useRef(value)

  const sync = () => {
    const ta = taRef.current, back = backRef.current, gutter = gutterRef.current
    if (!ta) return
    if (back) { back.scrollTop = ta.scrollTop; back.scrollLeft = ta.scrollLeft }
    if (gutter) gutter.style.transform = `translateY(${-ta.scrollTop}px)`
    scrollRef.current = { top: ta.scrollTop, left: ta.scrollLeft }
  }

  /** 更新光标位置和括号匹配 */
  const updateCursor = () => {
    const ta = taRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const text = ta.value
    // 计算行列
    const before = text.slice(0, pos)
    const line = before.split('\n').length - 1
    const lastNL = before.lastIndexOf('\n')
    const col = lastNL === -1 ? pos : pos - lastNL - 1
    onCursorChange?.(line, col)
    // 括号匹配高亮
    const matchIdx = findMatchingBracket(text, pos)
    if (matchIdx != null) {
      const beforeM = text.slice(0, matchIdx)
      const mLines = beforeM.split('\n')
      setMatchPos({ line: mLines.length - 1, col: mLines[mLines.length - 1].length })
    } else {
      setMatchPos(null)
    }
  }

  /** 键盘事件：自动补全括号/引号，智能删除空配对 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart, selectionEnd } = ta
    const val = value

    if (e.key === '{') {
      e.preventDefault()
      const newVal = val.slice(0, selectionStart) + '{}' + val.slice(selectionEnd)
      onChange(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1
        updateCursor()
      })
      return
    }
    if (e.key === '[') {
      e.preventDefault()
      const newVal = val.slice(0, selectionStart) + '[]' + val.slice(selectionEnd)
      onChange(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1
        updateCursor()
      })
      return
    }
    if (e.key === '"') {
      // 选中文本时用引号包裹
      if (selectionStart !== selectionEnd) {
        e.preventDefault()
        const newVal = val.slice(0, selectionStart) + '"' + val.slice(selectionStart, selectionEnd) + '"' + val.slice(selectionEnd)
        onChange(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = selectionStart + 1
          ta.selectionEnd = selectionEnd + 1
          updateCursor()
        })
        return
      }
      // 不在字符串内部才自动补全
      const before = val.slice(0, selectionStart)
      const after = val.slice(selectionStart)
      // 简单判断：如果前面有未闭合的引号，则不自动补全
      const quotesBefore = before.split('').filter(c => c === '"').length
      const quotesAfter = after.split('').filter(c => c === '"').length
      if (quotesBefore % 2 === 0 && quotesAfter % 2 === 0) {
        e.preventDefault()
        const newVal = val.slice(0, selectionStart) + '""' + val.slice(selectionEnd)
        onChange(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1
          updateCursor()
        })
        return
      }
    }
    // Backspace：在空配对 {} [] "" 中时删除整个配对
    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
      const prev = val[selectionStart - 1]
      const next = val[selectionStart]
      if ((prev === '{' && next === '}') || (prev === '[' && next === ']') || (prev === '"' && next === '"')) {
        e.preventDefault()
        const newVal = val.slice(0, selectionStart - 1) + val.slice(selectionStart + 1)
        onChange(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart - 1
          updateCursor()
        })
        return
      }
    }
  }

  // 挂载时把查看态留下的滚动位置带回来，避免悬停切换时视口跳变
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.scrollTop = scrollRef.current.top
    ta.scrollLeft = scrollRef.current.left
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 跟踪 value 变化，用于检测自动补全后的光标保持
  useEffect(() => { prevValueRef.current = value }, [value])

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <pre ref={backRef} aria-hidden
        className="absolute inset-0 overflow-auto pointer-events-none"
        style={{ ...JSON_EDITOR_STYLE, color: 'var(--text)', zIndex: 0 }}>
        {value.length === 0 ? (
          <div style={{ color: 'var(--t3)' }}>{placeholder}</div>
        ) : lines.map((ln, i) => {
          const t = lineTypes?.[i]
          const bg = t === 'add' ? 'var(--addBg)' : t === 'rm' ? 'var(--rmBg)' : 'transparent'
          const mL = matchPos && matchPos.line === i ? matchPos.col : undefined
          return (
            <div key={i} style={{ background: bg, position: 'relative' }}>
              <span dangerouslySetInnerHTML={{ __html: highlightJson(ln, mL) || '​' }} />
            </div>
          )
        })}
      </pre>
      <textarea
        ref={taRef} value={value} onChange={e => { onChange(e.target.value); prevValueRef.current = e.target.value }}
        onKeyDown={handleKeyDown}
        onScroll={sync} onClick={updateCursor} onKeyUp={updateCursor}
        spellCheck={false} wrap="off" autoFocus={autoFocus}
        onFocus={onFocus} onBlur={onBlur}
        data-testid="json-content"
        className="absolute inset-0 w-full h-full resize-none outline-none overflow-auto"
        style={{ ...JSON_EDITOR_STYLE, background: 'transparent', color: 'transparent', caretColor: 'var(--accent)', border: 0, zIndex: 1 }}
      />
      {/* 只读行号列：宽度与查看态一致，悬停即切回查看态，与内容区构成双向通道 */}
      <div onMouseEnter={onGutterEnter} data-testid="json-gutter"
        className="absolute top-0 bottom-0 left-0 overflow-hidden select-none"
        style={{ width: JSON_CONTENT_X, zIndex: 2, background: 'var(--code)' }}>
        <div ref={gutterRef} style={{ position: 'absolute', top: JSON_PAD_TB, left: 0, right: 0 }}>
          {lines.map((_, i) => {
            const t = lineTypes?.[i]
            const bg = t === 'add' ? 'var(--addBg)' : t === 'rm' ? 'var(--rmBg)' : 'transparent'
            const mark = t === 'add' ? { c: 'var(--ok)', s: '+' } : t === 'rm' ? { c: 'var(--err)', s: '−' } : null
            return (
              <div key={i} style={{ height: JSON_ROW, lineHeight: JSON_ROW + 'px', display: 'flex', alignItems: 'center', background: bg }}>
                <span style={{ width: JSON_LINE_NO_W, flexShrink: 0, textAlign: 'right', paddingRight: 4, color: 'var(--t3)', fontSize: '11px', marginLeft: JSON_PAD_L }}>{i + 1}</span>
                <span style={{ width: JSON_FOLD_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mark?.c ?? 'transparent', fontWeight: 700, fontSize: '11px' }}>{mark?.s ?? ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 单侧面板：鼠标进入内容区即编辑（不改写内容、不抢焦点），行号列悬停/移出面板/失焦则回到查看态。
 * 折叠状态与滚动位置提升到本组件持有，避免查看态/编辑态互相切换时被重置。
 */
function JsonPane({ value, onChange, fmt, types, placeholder, style, paneId, onCursorChange }: {
  value: string; onChange: (v: string) => void; fmt: { ok: boolean; text: string }
  types?: ('same' | 'add' | 'rm')[]; placeholder: string; style?: React.CSSProperties
  paneId: 'a' | 'b'
  onCursorChange?: (line: number, col: number) => void
}) {
  const [focus, setFocus] = useState(false)
  const [contentHover, setContentHover] = useState(false)
  const [wantFocus, setWantFocus] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const scrollRef = useRef({ top: 0, left: 0 })
  const isTouchRef = useRef(false)

  // 查看态：JSON 合法且非空，且鼠标未停留在内容区、textarea 未聚焦
  const viewMode = fmt.ok && value.trim() !== '' && !focus && !contentHover

  const toggleFold = (line: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line); else next.add(line)
      return next
    })
  }

  return (
    <div data-testid={`json-pane-${paneId}`} className="flex-1 min-w-0 flex flex-col overflow-hidden" style={style}
      onMouseLeave={() => setContentHover(false)}>
      {viewMode ? (
        <JsonTreeView text={value} types={types} collapsed={collapsed} toggleFold={toggleFold} scrollRef={scrollRef}
          onContentEnter={() => setContentHover(true)}
          onContentActivate={(e) => {
            if (e.pointerType !== 'mouse') isTouchRef.current = true
            setContentHover(true)
            setWantFocus(true)
          }} />
      ) : (
        <DiffEditor value={value} onChange={onChange} placeholder={placeholder} lineTypes={types} scrollRef={scrollRef}
          onFocus={() => { setFocus(true); setWantFocus(false) }}
          onBlur={() => {
            setFocus(false)
            setWantFocus(false)
            // 触屏无「悬停移出」概念，失焦即视为退出编辑，避免卡在编辑态出不来
            if (isTouchRef.current) { setContentHover(false); isTouchRef.current = false }
          }}
          onGutterEnter={() => setContentHover(false)}
          autoFocus={wantFocus} onCursorChange={onCursorChange} />
      )}
    </div>
  )
}

function JsonTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [leftW, setLeftW] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const [cursorPath, setCursorPath] = useState<string | null>(null)
  const [cursorPane, setCursorPane] = useState<'a' | 'b'>('a')

  const leftFmt = useMemo(() => formatJson(left), [left])
  const rightFmt = useMemo(() => formatJson(right), [right])

  const diff = useMemo(() => {
    if (!showDiff || !leftFmt.ok || !rightFmt.ok) return undefined
    return computeDiff(leftFmt.text.split('\n'), rightFmt.text.split('\n'))
  }, [showDiff, leftFmt, rightFmt])

  const leftTypes = useMemo(() => diff?.filter(d => d.left !== null).map(d => d.type), [diff])
  const rightTypes = useMemo(() => diff?.filter(d => d.right !== null).map(d => d.type), [diff])
  const counts = useMemo(() => diff
    ? { add: diff.filter(d => d.type === 'add').length, rm: diff.filter(d => d.type === 'rm').length }
    : null, [diff])

  const formatBoth = () => {
    if (leftFmt.ok) setLeft(leftFmt.text)
    if (rightFmt.ok) setRight(rightFmt.text)
  }

  const handleCursorChange = (pane: 'a' | 'b') => (line: number, col: number) => {
    setCursorPane(pane)
    const text = pane === 'a' ? left : right
    const fmt = pane === 'a' ? leftFmt : rightFmt
    if (fmt.ok && text.trim()) {
      setCursorPath(getJsonPath(text, line, col))
    } else {
      setCursorPath(null)
    }
  }

  // 中间分隔条拖拽调宽
  const onDividerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { startX: e.clientX, startW: leftW }
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const w = containerRef.current?.getBoundingClientRect().width || 1
      const next = Math.min(85, Math.max(15, dragRef.current.startW + ((ev.clientX - dragRef.current.startX) / w) * 100))
      setLeftW(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-2 px-6 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>JSON 可视化 & Diff</SectionTitle>
        {cursorPath && (
          <span className="text-xs font-mono truncate max-w-[300px]" style={{ color: 'var(--t2)' }} title={cursorPath}>
            <span className="opacity-50 mr-1">📎</span>
            {cursorPane === 'b' && <span className="opacity-50">右: </span>}
            {cursorPath}
          </span>
        )}
        {left.trim() && (
          <Badge color={leftFmt.ok ? 'ok' : 'err'}>{leftFmt.ok ? '左 ✓' : '左 格式错误'}</Badge>
        )}
        {right.trim() && (
          <Badge color={rightFmt.ok ? 'ok' : 'err'}>{rightFmt.ok ? '右 ✓' : '右 格式错误'}</Badge>
        )}
        {counts && (
          <span className="flex gap-1.5 ml-1">
            <Badge color="ok">+{counts.add}</Badge>
            <Badge color="err">−{counts.rm}</Badge>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Btn small variant="soft" onClick={formatBoth}>格式化</Btn>
          <Btn small variant={showDiff ? 'primary' : 'soft'} onClick={() => setShowDiff(v => !v)}>
            {showDiff ? '✓ A/B 对比中' : 'A/B 对比'}
          </Btn>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden" ref={containerRef} style={{ background: 'var(--code)' }}>
        <div style={{ flex: `0 0 ${leftW}%`, minWidth: 0 }} className="flex flex-col overflow-hidden">
          <JsonPane paneId="a" value={left} onChange={setLeft} fmt={leftFmt} types={leftTypes}
            placeholder={'{\n  "name": "Alice",\n  "age": 30\n}'}
            onCursorChange={handleCursorChange('a')} />
        </div>
        <div onPointerDown={onDividerDown} className="flex-shrink-0"
          style={{ width: 10, cursor: 'col-resize', touchAction: 'none', display: 'flex', justifyContent: 'center' }}>
          <div className="h-full w-px" style={{ background: 'var(--border)' }} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <JsonPane paneId="b" value={right} onChange={setRight} fmt={rightFmt} types={rightTypes}
            placeholder={'{\n  "name": "Bob",\n  "age": 25\n}'}
            onCursorChange={handleCursorChange('b')} />
        </div>
      </div>
    </div>
  )
}

// ─── Tool: 时间戳转换 ─────────────────────────────────────────────────────────

function TimestampTool() {
  const [tsInput, setTsInput] = useState('')
  const [dtInput, setDtInput] = useState('')
  const [unit, setUnit] = useState<'auto' | 'ms' | 's' | 'ns'>('auto')
  const now = Date.now()

  const tsResult = useMemo(() => {
    if (!tsInput.trim()) return null
    const cleaned = tsInput.replace(/[^0-9]/g, '')
    const n = parseInt(cleaned, 10)
    if (isNaN(n)) return { ok: false, error: '无法解析数字' }
    const detectedUnit = cleaned.length >= 19 ? 'ns' : cleaned.length >= 13 ? 'ms' : 's'
    const effectiveUnit = unit === 'auto' ? detectedUnit : unit
    const ms = effectiveUnit === 'ms' ? n : effectiveUnit === 'ns' ? n / 1e6 : n * 1000
    const date = new Date(ms)
    if (isNaN(date.getTime())) return { ok: false, error: '无效时间戳' }
    return {
      ok: true, detectedUnit, ms, s: Math.floor(ms / 1000),
      ns: Math.round(ms * 1e6),
      local: date.toLocaleString('zh-CN', { timeZoneName: 'short' }),
      utc: date.toUTCString(),
      iso: date.toISOString(),
      relative: (() => {
        const diff = now - ms
        const abs = Math.abs(diff)
        if (abs < 60000) return '刚刚'
        if (abs < 3600000) return `${Math.round(abs / 60000)} 分钟${diff > 0 ? '前' : '后'}`
        if (abs < 86400000) return `${Math.round(abs / 3600000)} 小时${diff > 0 ? '前' : '后'}`
        return `${Math.round(abs / 86400000)} 天${diff > 0 ? '前' : '后'}`
      })(),
    }
  }, [tsInput, unit, now])

  const dtResult = useMemo(() => {
    if (!dtInput.trim()) return null
    const d = new Date(dtInput)
    if (isNaN(d.getTime())) return { ok: false, error: '无法解析日期时间，尝试格式：2024-01-15 14:30:00' }
    return { ok: true, ms: d.getTime(), s: Math.floor(d.getTime() / 1000) }
  }, [dtInput])

  const nowTs = Math.floor(now / 1000)

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <SectionTitle>时间戳转换</SectionTitle>
      <p className="text-sm mb-8" style={{ color: 'var(--t2)' }}>毫秒 / 秒级时间戳双向互转，自动识别类型</p>

      {/* Current timestamp pill */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6 text-sm" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--t2)' }}>当前时间戳</span>
        <code style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', fontWeight: 600 }}>{now}</code>
        <span style={{ color: 'var(--t3)' }}>ms</span>
        <code style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', fontWeight: 600, marginLeft: 4 }}>{nowTs}</code>
        <span style={{ color: 'var(--t3)' }}>s</span>
        <Btn small onClick={() => setTsInput(String(now))} className="ml-auto">使用当前</Btn>
      </div>

      <div className="grid gap-5">
        {/* TS → Date */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>时间戳 → 日期时间</h3>
            <div className="ml-auto">
              <SegmentedControl
                value={unit}
                options={[{ value: 'auto', label: '自动' }, { value: 'ms', label: 'MS' }, { value: 's', label: 'S' }, { value: 'ns', label: 'NS' }]}
                onChange={v => setUnit(v as 'auto' | 'ms' | 's' | 'ns')}
              />
            </div>
          </div>
          <CustomInput value={tsInput} onChange={setTsInput} placeholder="输入时间戳，如 1705289400000" mono />
          {tsResult && (
            <div className="mt-4">
              {tsResult.ok ? (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge color="ok">自动识别为 {tsResult.detectedUnit?.toUpperCase()}</Badge>
                    {unit !== 'auto' && unit !== tsResult.detectedUnit && (
                      <Badge color="warn">已强制为 {unit.toUpperCase()}</Badge>
                    )}
                    <Badge>{tsResult.relative}</Badge>
                  </div>
                  {[
                    ['本地时间', tsResult.local],
                    ['UTC 时间', tsResult.utc],
                    ['ISO 8601', tsResult.iso],
                    ['毫秒时间戳', String(tsResult.ms)],
                    ['秒时间戳', String(tsResult.s)],
                    ...((tsResult.detectedUnit === 'ns' || unit === 'ns') ? [['纳秒时间戳', String(tsResult.ns)] as [string, string]] : []),
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--t2)' }}>{label}</span>
                      <code className="flex-1 text-sm" style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)' }}>{val}</code>
                      <CopyBtn text={val ?? ''} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2">
                  <Badge color="err">错误</Badge>
                  <span className="text-sm" style={{ color: 'var(--err)' }}>{tsResult.error}</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Date → TS */}
        <Card>
          <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text)' }}>日期时间 → 时间戳</h3>
          <CustomInput value={dtInput} onChange={setDtInput} placeholder="如 2024-01-15 14:30:00 或 ISO 格式" />
          {dtResult && (
            <div className="mt-4">
              {dtResult.ok ? (
                <div className="grid gap-2">
                  {[
                    ['毫秒时间戳 (ms)', String(dtResult.ms)],
                    ['秒时间戳 (s)', String(dtResult.s)],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <span className="text-xs w-36 flex-shrink-0" style={{ color: 'var(--t2)' }}>{label}</span>
                      <code className="flex-1 text-sm font-semibold" style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)' }}>{val}</code>
                      <CopyBtn text={val ?? ''} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2">
                  <Badge color="err">错误</Badge>
                  <span className="text-sm" style={{ color: 'var(--err)' }}>{dtResult.error}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Tool: AI 格式转换 ────────────────────────────────────────────────────────

const FMT_LABELS: Record<AiFmt, string> = {
  'openai-chat': 'OpenAI Chat Completions',
  'anthropic': 'Anthropic Messages',
  'openai-responses': 'OpenAI Responses',
}

const EXAMPLE_BODIES: Record<AiFmt, string> = {
  'openai-chat': JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: '你是一个有帮助的助手。' },
      { role: 'user', content: '请介绍一下你自己。' },
    ],
    max_tokens: 1024,
    temperature: 0.7,
  }, null, 2),
  'anthropic': JSON.stringify({
    model: 'claude-opus-4-8',
    system: '你是一个有帮助的助手。',
    messages: [{ role: 'user', content: '请介绍一下你自己。' }],
    max_tokens: 1024,
  }, null, 2),
  'openai-responses': JSON.stringify({
    model: 'gpt-4o',
    instructions: '你是一个有帮助的助手。',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '请介绍一下你自己。' }] }],
    max_output_tokens: 1024,
  }, null, 2),
}

function AiConvertTool() {
  const [from, setFrom] = useState<AiFmt>('openai-chat')
  const [to, setTo] = useState<AiFmt>('anthropic')
  const [input, setInput] = useState(EXAMPLE_BODIES['openai-chat'])
  const [addCache, setAddCache] = useState(false)

  const outputWithCache = useMemo(() => convertFormat(input, from, to, addCache), [input, from, to, addCache])
  const fmtOptions = (['openai-chat', 'anthropic', 'openai-responses'] as AiFmt[]).map(f => ({ value: f, label: FMT_LABELS[f] }))

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>AI 请求体格式转换</SectionTitle>
        <div className="ml-auto flex items-center gap-3">
          <Toggle value={addCache} onChange={setAddCache} label="注入 cache_control" />
        </div>
      </div>

      <div className="glass flex items-end gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1">
          <Label className="block mb-1.5">源格式</Label>
          <CustomSelect value={from} onChange={v => { setFrom(v as AiFmt); setInput(EXAMPLE_BODIES[v as AiFmt]) }} options={fmtOptions} />
        </div>
        <div className="flex-shrink-0 pb-2 text-base" style={{ color: 'var(--t3)' }}>→</div>
        <div className="flex-1">
          <Label className="block mb-1.5">目标格式</Label>
          <CustomSelect value={to} onChange={v => setTo(v as AiFmt)} options={fmtOptions} />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <div className="flex flex-col p-4 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center mb-2">
            <Label>输入</Label>
            <div className="ml-auto">
              <CopyBtn text={input} />
            </div>
          </div>
          <CustomTextarea value={input} onChange={setInput} mono stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
        <div className="flex flex-col p-4 overflow-hidden">
          <div className="flex items-center mb-2">
            <Label>输出</Label>
            <div className="ml-auto">
              <CopyBtn text={outputWithCache} />
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-auto p-3 text-xs"
            style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, whiteSpace: 'pre' }}>
            <div dangerouslySetInnerHTML={{ __html: highlightJson(outputWithCache) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool: LLM 批量测试 ───────────────────────────────────────────────────────
// 定位：Token 计费口径核查 —— 同一份请求体反复发送，输入 Token 是否恒定？换模型差多少？
// 输出 Token 波动多大？验真（返回模型是否被中转站偷换）作为辅助指标保留。

type ApiType = 'anthropic' | 'openai_chat' | 'openai_responses'

interface BatchTask {
  seq: number
  model: string
  localIdx: number // 该模型内的第几次
}

interface BatchResult {
  seq: number
  model: string
  localIdx: number
  status: 'pending' | 'running' | 'ok' | 'error'
  httpStatus: number | null
  tFirst: number | null
  elapsed: number | null
  returnedModel: string | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
}

interface BatchReport {
  id: string
  startTime: number
  endTime: number
  durationMs: number
  apiType: ApiType
  endpoint: string
  bodyText: string
  models: string[]
  n: number
  c: number
  stopped: boolean
  total: number
  success: number
  fail: number
  results: BatchResult[]
}

interface LlmBatchCfg {
  apiType: ApiType
  endpoint: string
  apiKey: string
  timeout: number
  bodyText: string
}

// ── 协议适配 ──

const LLM_API_PATHS: Record<ApiType, string> = {
  anthropic: '/v1/messages',
  openai_chat: '/v1/chat/completions',
  openai_responses: '/v1/responses',
}
const LLM_API_LABELS: Record<ApiType, string> = {
  anthropic: 'Anthropic Messages API',
  openai_chat: 'OpenAI Chat Completions API',
  openai_responses: 'OpenAI Responses API',
}

// baseUrl 允许填到 host（如 https://api.anthropic.com）或已含 /v1（如 https://api.openai.com/v1），
// 两种写法都推导出正确端点，避免拼出 /v1/v1/...
function llmEndpointOf(apiType: ApiType, baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '')
  const p = LLM_API_PATHS[apiType]
  return b.endsWith('/v1') ? b + p.replace(/^\/v1/, '') : b + p
}

// {{model}} 占位符：兼容带引号 "{{model}}" 和不带引号 {{model}} 两种写法
const MODEL_PLACEHOLDER_RE = /"\{\{model\}\}"|\{\{model\}\}/g
function fillModelPlaceholder(text: string, jsonStringLiteral: string): string {
  return text.replace(MODEL_PLACEHOLDER_RE, jsonStringLiteral)
}
function bodyHasModelPlaceholder(text: string): boolean {
  MODEL_PLACEHOLDER_RE.lastIndex = 0
  return MODEL_PLACEHOLDER_RE.test(text)
}
// Body 写了 {{model}} 就替换占位符；没写就在顶层自动注入 model 字段，两种写法都能跑
function buildRequestBody(bodyText: string, model: string): Record<string, unknown> {
  if (bodyHasModelPlaceholder(bodyText)) {
    return JSON.parse(fillModelPlaceholder(bodyText, JSON.stringify(model)))
  }
  const obj = JSON.parse(bodyText) as Record<string, unknown>
  return { ...obj, model }
}

// 单引号内的单引号需要转义成 '\''，保证生成的 curl 命令在 shell 里语法安全
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
function buildCurlCommand(report: { apiType: ApiType; endpoint: string }, bodyObj: unknown, apiKey: string): string {
  const headers: string[] = ['-H ' + shellSingleQuote('content-type: application/json')]
  if (report.apiType === 'anthropic') {
    headers.push('-H ' + shellSingleQuote(`x-api-key: ${apiKey || 'YOUR_API_KEY'}`))
    headers.push('-H ' + shellSingleQuote('anthropic-version: 2023-06-01'))
  } else {
    headers.push('-H ' + shellSingleQuote(`Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}`))
  }
  return [
    `curl -X POST ${shellSingleQuote(report.endpoint)} \\`,
    ...headers.map(h => `  ${h} \\`),
    `  -d ${shellSingleQuote(JSON.stringify(bodyObj))}`,
  ].join('\n')
}

// ── Token / model 提取（非流式）──
function extractUsageNonStream(json: any): { inTok: number | null; outTok: number | null; model: string | null } {
  const u = json?.usage
  let inTok: number | null = null
  let outTok: number | null = null
  if (u) {
    if (u.input_tokens != null || u.output_tokens != null) {
      inTok = u.input_tokens ?? null
      outTok = u.output_tokens ?? null
    } else if (u.prompt_tokens != null || u.completion_tokens != null) {
      inTok = u.prompt_tokens ?? null
      outTok = u.completion_tokens ?? null
    }
  }
  const model = typeof json?.model === 'string' ? json.model
    : typeof json?.response?.model === 'string' ? json.response.model
    : null
  return { inTok, outTok, model }
}

// ── Token / model 提取（SSE 流式）──
function makeStreamExtractor(apiType: ApiType) {
  let inTok: number | null = null
  let outTok: number | null = null
  let model: string | null = null
  return {
    onData(o: any) {
      if (apiType === 'anthropic') {
        if (o?.type === 'message_start' && o.message) {
          if (o.message.usage?.input_tokens != null) inTok = o.message.usage.input_tokens
          if (typeof o.message.model === 'string') model = o.message.model
        }
        if (o?.type === 'message_delta' && o.usage?.output_tokens != null) outTok = o.usage.output_tokens
      } else if (apiType === 'openai_chat') {
        if (typeof o?.model === 'string') model = o.model
        if (o?.usage) {
          if (o.usage.prompt_tokens != null) inTok = o.usage.prompt_tokens
          if (o.usage.completion_tokens != null) outTok = o.usage.completion_tokens
        }
      } else {
        if (o?.type === 'response.completed' && o.response) {
          if (typeof o.response.model === 'string') model = o.response.model
          if (o.response.usage?.input_tokens != null) inTok = o.response.usage.input_tokens
          if (o.response.usage?.output_tokens != null) outTok = o.response.usage.output_tokens
        }
      }
    },
    result() { return { inTok, outTok, model } },
  }
}

// ── 单次请求 ──
async function doLlmRequest(cfg: LlmBatchCfg, task: BatchTask): Promise<BatchResult> {
  const rec: BatchResult = {
    seq: task.seq, model: task.model, localIdx: task.localIdx,
    status: 'error', httpStatus: null, tFirst: null, elapsed: null,
    returnedModel: null, inputTokens: null, outputTokens: null, error: null,
  }
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, cfg.timeout * 1000)
  const start = Date.now()
  try {
    let bodyObj: Record<string, any>
    try {
      bodyObj = buildRequestBody(cfg.bodyText, task.model)
    } catch (e) {
      rec.error = '请求体不是合法 JSON：' + ((e as Error)?.message || String(e))
      return rec
    }
    const isStream = bodyObj.stream === true
    if (isStream && cfg.apiType === 'openai_chat' && bodyObj.stream_options == null) {
      bodyObj.stream_options = { include_usage: true }
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (cfg.apiType === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers.Authorization = 'Bearer ' + cfg.apiKey
    }

    const res = await fetch(cfg.endpoint, {
      method: 'POST', headers, body: JSON.stringify(bodyObj), signal: controller.signal,
    })

    if (!res.ok) {
      let txt = ''
      try { txt = await res.text() } catch { /* ignore */ }
      // 错误信息始终带上 HTTP 状态码前缀，即便服务端提供了更具体的 error.message，
      // 状态码本身也是排查问题（如限流 429 / 鉴权 401）的关键信息，不能被覆盖掉。
      let detail = ''
      try {
        const j = JSON.parse(txt)
        detail = j?.error?.message || ''
      } catch {
        if (txt) detail = txt.slice(0, 200)
      }
      rec.httpStatus = res.status
      rec.error = `HTTP ${res.status}` + (detail ? '：' + detail : '')
      rec.elapsed = Date.now() - start
      return rec
    }

    let tFirst: number | null = null
    if (isStream && res.body) {
      const ex = makeStreamExtractor(cfg.apiType)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (tFirst === null) tFirst = Date.now() - start
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try { ex.onData(JSON.parse(payload)) } catch { /* ignore malformed chunk */ }
        }
      }
      const r = ex.result()
      rec.status = 'ok'
      rec.httpStatus = res.status
      rec.tFirst = tFirst
      rec.elapsed = Date.now() - start
      rec.inputTokens = r.inTok
      rec.outputTokens = r.outTok
      rec.returnedModel = r.model
    } else {
      tFirst = Date.now() - start
      const txt = await res.text()
      let json: any = {}
      try {
        json = txt ? JSON.parse(txt) : {}
      } catch {
        rec.error = '响应解析失败（非 JSON）：' + txt.slice(0, 200)
        rec.httpStatus = res.status
        rec.elapsed = Date.now() - start
        return rec
      }
      const u = extractUsageNonStream(json)
      rec.status = 'ok'
      rec.httpStatus = res.status
      rec.tFirst = tFirst
      rec.elapsed = Date.now() - start
      rec.inputTokens = u.inTok
      rec.outputTokens = u.outTok
      rec.returnedModel = u.model
    }
  } catch (e: unknown) {
    rec.elapsed = Date.now() - start
    if (timedOut) {
      rec.error = `请求超时（> ${cfg.timeout} 秒）`
    } else if (e instanceof TypeError) {
      rec.error = '网络错误或可能被 CORS 拦截：' + (e.message || 'Failed to fetch') + '（若目标服务器未允许跨域，浏览器会拦截响应）'
    } else if ((e as { name?: string })?.name === 'AbortError') {
      rec.error = '已取消'
    } else {
      rec.error = (e as Error)?.message || String(e)
    }
  } finally {
    clearTimeout(timer)
  }
  return rec
}

// ── 统计 ──
function llmStatsOf(arr: number[]) {
  if (!arr.length) return null
  const sum = arr.reduce((a, b) => a + b, 0)
  const mean = sum / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length
  return { sum, mean, max: Math.max(...arr), min: Math.min(...arr), std: Math.sqrt(variance) }
}

function parseModelList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  text.split(/[\n,]/).map(s => s.trim()).filter(Boolean).forEach(m => {
    if (!seen.has(m)) { seen.add(m); out.push(m) }
  })
  return out
}

// ── 格式化 ──
function llmPad2(n: number) { return String(n).padStart(2, '0') }
function llmFmtTime(d: number) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${llmPad2(dt.getMonth() + 1)}-${llmPad2(dt.getDate())} ${llmPad2(dt.getHours())}:${llmPad2(dt.getMinutes())}:${llmPad2(dt.getSeconds())}`
}
function llmFmtDur(ms: number) {
  if (ms < 1000) return ms + ' ms'
  const s = ms / 1000
  if (s < 60) return s.toFixed(1) + ' s'
  return Math.floor(s / 60) + ' 分 ' + (s % 60).toFixed(0) + ' 秒'
}
function llmTsName(d: number) {
  const dt = new Date(d)
  return `${dt.getFullYear()}${llmPad2(dt.getMonth() + 1)}${llmPad2(dt.getDate())}_${llmPad2(dt.getHours())}${llmPad2(dt.getMinutes())}${llmPad2(dt.getSeconds())}`
}
function llmDownload(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
function reportToCsv(report: BatchReport): string {
  const rows: (string | number)[][] = [['序号', '模型', '状态', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时(ms)', '错误信息']]
  report.results.forEach(r => rows.push([
    r.seq, r.model, r.status === 'ok' ? '成功' : '失败',
    r.inputTokens ?? '-', r.outputTokens ?? '-',
    (r.inputTokens != null && r.outputTokens != null) ? r.inputTokens + r.outputTokens : '-',
    r.tFirst ?? '-', r.elapsed ?? '-', r.error ?? '',
  ]))
  return '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')
}

// ── 持久化：配置、加密后的 API Key、历史报告（最多 20 条）──
const LLM_CFG_KEY = 'llmbatch-config'
const LLM_KEY_STORAGE_KEY = 'llmbatch-key'
const LLM_HIST_KEY = 'llmbatch-history'
const LLM_HIST_MAX = 20

interface LlmBatchCfgStored {
  apiType?: ApiType
  baseUrl?: string
  timeout?: string
  models?: string
  n?: string
  c?: string
  body?: string
}
function loadLlmCfg(): LlmBatchCfgStored {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LLM_CFG_KEY)
    if (!raw) return {}
    const c = JSON.parse(raw)
    return c && typeof c === 'object' ? c : {}
  } catch { return {} }
}
function saveLlmCfg(cfg: LlmBatchCfgStored) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LLM_CFG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

// API Key 用 AES-GCM 加密后再落盘，避免它以明文形式直接躺在 localStorage 里被一眼看到
// 或被简单脚本正则扫描出来。注意：这是纯前端工具，没有服务端，加密密钥必然内嵌在代码里，
// 无法防御能在本页面执行任意 JS 的攻击者（如恶意浏览器扩展/XSS）——它只是「不落盘明文」，不是真正的机密保护。
const LLM_KEY_PASSPHRASE = 'dev-toolkit-llmbatch-v1'
function llmCryptoAvailable(): boolean {
  return typeof window !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle
}
let llmCryptoKeyPromise: Promise<CryptoKey> | null = null
function deriveLlmCryptoKey(): Promise<CryptoKey> {
  if (!llmCryptoKeyPromise) {
    llmCryptoKeyPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(LLM_KEY_PASSPHRASE))
      .then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']))
  }
  return llmCryptoKeyPromise
}
function llmBufToBase64(buf: ArrayBuffer): string {
  let bin = ''
  new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
function llmBase64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}
async function encryptLlmApiKey(plain: string): Promise<string> {
  if (!plain || !llmCryptoAvailable()) return ''
  const key = await deriveLlmCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return llmBufToBase64(iv.buffer) + '.' + llmBufToBase64(cipherBuf)
}
async function decryptLlmApiKey(stored: string): Promise<string> {
  if (!stored || !llmCryptoAvailable()) return ''
  try {
    const [ivB64, cipherB64] = stored.split('.')
    if (!ivB64 || !cipherB64) return ''
    const key = await deriveLlmCryptoKey()
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(llmBase64ToBuf(ivB64)) }, key, llmBase64ToBuf(cipherB64))
    return new TextDecoder().decode(plainBuf)
  } catch { return '' }
}

function loadLlmHistory(): BatchReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LLM_HIST_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch { return [] }
}
// 存满 20 条后淘汰最早；QuotaExceededError 时继续删最早的重试，返回是否发生了淘汰
function saveLlmHistory(report: BatchReport): { list: BatchReport[]; dropped: boolean } {
  let list = [report, ...loadLlmHistory()]
  let dropped = false
  while (list.length > LLM_HIST_MAX) { list.pop(); dropped = true }
  while (typeof window !== 'undefined') {
    try { localStorage.setItem(LLM_HIST_KEY, JSON.stringify(list)); break }
    catch {
      if (list.length > 0) { list.pop(); dropped = true } else break
    }
  }
  return { list, dropped }
}
function deleteLlmHistoryItem(id: string): BatchReport[] {
  const list = loadLlmHistory().filter(r => r.id !== id)
  try { localStorage.setItem(LLM_HIST_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}
function clearLlmHistory() {
  try { localStorage.removeItem(LLM_HIST_KEY) } catch { /* ignore */ }
}

const DEFAULT_LLM_BODY = `{
  "model": "{{model}}",
  "max_tokens": 100,
  "messages": [{"role": "user", "content": "Say hello."}]
}`

// 表格里的长文本单元格（模型名等）：单行截断 + 原生 title 提示，鼠标悬浮可见完整内容
function TruncatedCell({ text, maxWidth = 160, color }: { text: string; maxWidth?: number; color?: string }) {
  return (
    <span className="inline-block overflow-hidden align-bottom" style={{ maxWidth, color, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={text}>
      {text}
    </span>
  )
}

// Token 分布柱状图（输出 Token 波动始终展示；输入 Token 仅在跨请求不一致时展示，直观呈现差异）
function LlmTokenChart({ model, results, field, title }: {
  model: string; results: BatchResult[]; field: 'inputTokens' | 'outputTokens'; title: string
}) {
  const rs = results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx)
  const okVals = rs.filter(r => r.status === 'ok' && r[field] != null).map(r => r[field] as number)
  const st = llmStatsOf(okVals)
  const maxVal = okVals.length ? Math.max(...okVals) : 1
  const placeholder = Math.max(1, maxVal * 0.08)
  const chartData = rs.map(r => ({
    label: '#' + r.localIdx,
    value: r.status === 'ok' && r[field] != null ? (r[field] as number) : placeholder,
    ok: r.status === 'ok' && r[field] != null,
    display: r.status === 'ok' ? String(r[field] ?? '-') : '失败',
  }))
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <b className="text-sm" style={{ color: 'var(--text)' }}>[{model}] {title}</b>
      <div style={{ height: 220, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--s1)' }}
              contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: 'var(--t2)' }}
              formatter={(_value: unknown, _name: unknown, item: any) => [item?.payload?.ok ? item.payload.display + ' tok' : '请求失败', title]}
            />
            {st && <ReferenceLine y={st.mean} stroke="var(--t3)" strokeDasharray="4 3" />}
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.ok ? 'var(--accent)' : 'var(--t3)'} />)}
              <LabelList dataKey="display" position="top" style={{ fill: 'var(--text)', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--t2)' }}>
        均值 {st ? st.mean.toFixed(1) : '—'} ｜ 最大 {st ? st.max : '—'} ｜ 最小 {st ? st.min : '—'} ｜ 标准差（总体）{st ? st.std.toFixed(2) : '—'}
      </div>
    </div>
  )
}

// ── 报告渲染（当前报告 / 历史「查看」共用）──
function LlmBatchReportView({ report, apiKey }: { report: BatchReport; apiKey: string }) {
  const [viewingModel, setViewingModel] = useState<string | null>(null)
  const viewingBodyObj = useMemo(() => {
    if (viewingModel == null) return null
    try { return buildRequestBody(report.bodyText, viewingModel) } catch { return null }
  }, [viewingModel, report.bodyText])
  const consistency = useMemo(() => {
    const map: Record<string, { uniq: number[]; counts: Record<number, number>; consistent: boolean; value: number | null }> = {}
    for (const m of report.models) {
      const vals = report.results.filter(r => r.model === m && r.status === 'ok' && r.inputTokens != null).map(r => r.inputTokens as number)
      if (!vals.length) { map[m] = { uniq: [], counts: {}, consistent: false, value: null }; continue }
      const counts: Record<number, number> = {}
      vals.forEach(v => { counts[v] = (counts[v] || 0) + 1 })
      const uniq = Object.keys(counts).map(Number)
      map[m] = { uniq, counts, consistent: uniq.length === 1, value: uniq.length === 1 ? uniq[0] : null }
    }
    return map
  }, [report])

  const crossModelNumeric = report.models.map(m => consistency[m]?.value).filter((v): v is number => typeof v === 'number')
  const crossModelDiff = crossModelNumeric.length > 1 ? Math.max(...crossModelNumeric) - Math.min(...crossModelNumeric) : null

  return (
    <div className="flex flex-col gap-5">
      {/* 概况 */}
      <div className="rounded-2xl flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5 text-sm" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--t2)' }}>{llmFmtTime(report.startTime)} → {llmFmtTime(report.endTime)}</span>
        <span style={{ color: 'var(--t3)' }}>{LLM_API_LABELS[report.apiType]}</span>
        <span style={{ color: 'var(--t3)' }}>总耗时 <strong style={{ color: 'var(--text)' }}>{llmFmtDur(report.durationMs)}</strong></span>
        <span style={{ color: 'var(--t3)' }}>总请求 <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{report.total}</strong></span>
        <span>
          <span style={{ color: 'var(--t3)' }}>成功 </span><strong className="tabular-nums" style={{ color: 'var(--ok)' }}>{report.success}</strong>
          <span style={{ color: 'var(--t3)' }}> / 失败 </span><strong className="tabular-nums" style={{ color: report.fail ? 'var(--err)' : 'var(--t2)' }}>{report.fail}</strong>
        </span>
        {report.stopped && <Badge color="warn">⚠ 已手动停止</Badge>}
        <div className="ml-auto flex gap-2">
          <Btn small variant="ghost" onClick={() => llmDownload(`report_${llmTsName(report.startTime)}.json`, JSON.stringify(report, null, 2), 'application/json')}>导出 JSON</Btn>
          <Btn small variant="ghost" onClick={() => llmDownload(`report_${llmTsName(report.startTime)}.csv`, reportToCsv(report), 'text/csv;charset=utf-8')}>导出 CSV</Btn>
        </div>
      </div>

      {/* ① 输入 Token 一致性校验 —— 核心结论置顶 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>① 输入 Token 一致性校验</h3>
        <div className="flex flex-col gap-1.5 mb-3">
          {report.models.map(m => {
            const c = consistency[m]
            if (!c || c.uniq.length === 0) {
              return (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <Badge color="warn">⚠</Badge>
                  <span style={{ color: 'var(--t2)' }}>[{m}] 无可用的成功请求输入 Token 数据</span>
                </div>
              )
            }
            if (c.consistent) {
              return (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <Badge color="ok">✓</Badge>
                  <span style={{ color: 'var(--text)' }}>[{m}] 输入 Token 恒定，均为 <strong className="tabular-nums">{c.value}</strong></span>
                </div>
              )
            }
            const detail = Object.entries(c.counts).sort((a, b) => b[1] - a[1]).map(([v, cnt]) => `${v}（${cnt} 次）`).join('、')
            return (
              <div key={m} className="flex items-center gap-2 text-sm">
                <Badge color="err">✗</Badge>
                <span style={{ color: 'var(--text)' }}>[{m}] 输入 Token 不一致：{detail}</span>
              </div>
            )
          })}
        </div>
        <div className="rounded-2xl overflow-hidden mb-2.5" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--s1)' }}>
              <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                <th className="text-left px-4 py-2.5 font-semibold">模型</th>
                <th className="text-left px-4 py-2.5 font-semibold">输入 Token 值</th>
              </tr>
            </thead>
            <tbody>
              {report.models.map(m => {
                const c = consistency[m]
                return (
                  <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={m} color="var(--accent)" maxWidth={260} /></td>
                    <td className="px-4 py-2 tabular-nums">{c?.value ?? (c?.uniq.length ? '不一致' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {crossModelDiff != null && crossModelDiff > 0 && (
          <div className="rounded-xl px-4 py-2.5 text-sm mb-2.5" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 不同模型对同一请求体的 Token 计算存在差异（可能是分词器不同所致），最大相差 {crossModelDiff} tokens
          </div>
        )}
        {report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).length > 0 && (
          <div className="flex flex-col gap-4">
            {report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).map(m => (
              <LlmTokenChart key={m} model={m} results={report.results} field="inputTokens" title="输入 Token 分布（不一致）" />
            ))}
          </div>
        )}
      </div>

      {/* ② 输出 Token 波动图 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>② 输出 Token 波动</h3>
        <div className="flex flex-col gap-4">
          {report.models.map(m => (
            <LlmTokenChart key={m} model={m} results={report.results} field="outputTokens" title="输出 Token 分布" />
          ))}
        </div>
      </div>

      {/* ③ 各模型汇总统计 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>
          ③ 各模型汇总统计 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>（均值保留 1 位小数，仅统计成功请求）</span>
        </h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead style={{ background: 'var(--s1)' }}>
                <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                  {['模型', '总请求', '成功', '失败', '输入Token总量', '输入Token均值', '输出Token总量', '输出Token均值', '输出Token最大', '输出Token最小', '操作'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.models.map(m => {
                  const rs = report.results.filter(r => r.model === m)
                  const okIn = rs.filter(r => r.status === 'ok' && r.inputTokens != null).map(r => r.inputTokens as number)
                  const okOut = rs.filter(r => r.status === 'ok' && r.outputTokens != null).map(r => r.outputTokens as number)
                  const si = llmStatsOf(okIn)
                  const so = llmStatsOf(okOut)
                  return (
                    <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={m} color="var(--accent)" maxWidth={180} /></td>
                      <td className="px-4 py-2 tabular-nums">{rs.length}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--ok)' }}>{rs.filter(r => r.status === 'ok').length}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--err)' }}>{rs.filter(r => r.status === 'error').length}</td>
                      <td className="px-4 py-2 tabular-nums">{si ? si.sum : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{si ? si.mean.toFixed(1) : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.sum : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.mean.toFixed(1) : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.max : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.min : '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Btn small variant="ghost" onClick={() => setViewingModel(m)}>请求体 / cURL</Btn>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ④ 逐请求明细 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>④ 逐请求明细</h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="overflow-x-auto" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="w-full text-sm min-w-[920px]">
              <thead style={{ background: 'var(--s1)', position: 'sticky', top: 0 }}>
                <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                  {['序号', '模型', '状态', '返回模型', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时', '错误信息'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.results.map(r => (
                  <tr key={r.seq} style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--s1)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">#{r.seq}</td>
                    <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={r.model} color="var(--accent)" maxWidth={140} /></td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.status === 'ok' ? <Badge color="ok">✓ 成功</Badge> : <Badge color="err">✗ 失败</Badge>}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: r.returnedModel && r.returnedModel !== r.model ? 'var(--err)' : 'var(--t2)' }}>
                      {r.returnedModel != null ? (
                        <span className="inline-flex items-center gap-1">
                          <TruncatedCell text={r.returnedModel} maxWidth={140} />
                          {r.returnedModel !== r.model && <span className="flex-shrink-0">≠</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{r.inputTokens ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.outputTokens ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{(r.inputTokens != null && r.outputTokens != null) ? r.inputTokens + r.outputTokens : '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.tFirst ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.elapsed != null ? (r.elapsed / 1000).toFixed(2) + 's' : '—'}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: 'var(--err)', maxWidth: 280, wordBreak: 'break-all' }}>{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 查看请求体 / 复制 cURL */}
      {viewingModel != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewingModel(null)}>
          <div className="rounded-2xl p-5 w-full flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', maxWidth: 640, maxHeight: '82vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <b className="text-sm" style={{ color: 'var(--text)' }}>[{viewingModel}] 请求体 / cURL</b>
              <Btn small variant="ghost" onClick={() => setViewingModel(null)}>✕ 关闭</Btn>
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>请求体 JSON</Label>
                  {viewingBodyObj != null && <CopyBtn text={JSON.stringify(viewingBodyObj, null, 2)} />}
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '30vh' }}>
                  {viewingBodyObj != null ? JSON.stringify(viewingBodyObj, null, 2) : '（请求体解析失败）'}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>cURL 命令</Label>
                  {viewingBodyObj != null && <CopyBtn text={buildCurlCommand(report, viewingBodyObj, apiKey)} />}
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '30vh', wordBreak: 'break-all' }}>
                  {viewingBodyObj != null ? buildCurlCommand(report, viewingBodyObj, apiKey) : '（请求体解析失败）'}
                </pre>
                <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ cURL 命令含明文 API Key，注意妥善保管，不要粘贴到公开场合</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LlmBatchTool() {
  // ── 配置（持久化）──
  const [apiType, setApiType] = useState<ApiType>(() => loadLlmCfg().apiType ?? 'anthropic')
  const [baseUrl, setBaseUrl] = useState(() => loadLlmCfg().baseUrl ?? 'https://api.anthropic.com')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false) // 解密完成前不落盘，避免用初始空值把已保存的 key 冲掉
  const [timeoutSec, setTimeoutSec] = useState(() => loadLlmCfg().timeout ?? '120')
  const [modelListText, setModelListText] = useState(() => loadLlmCfg().models ?? 'claude-3-5-sonnet-20241022')
  const [nReq, setNReq] = useState(() => loadLlmCfg().n ?? '5')
  const [concurrency, setConcurrency] = useState(() => loadLlmCfg().c ?? '3')
  const [body, setBody] = useState(() => loadLlmCfg().body ?? DEFAULT_LLM_BODY)
  const [bodyErr, setBodyErr] = useState('')

  useEffect(() => {
    saveLlmCfg({ apiType, baseUrl, timeout: timeoutSec, models: modelListText, n: nReq, c: concurrency, body })
  }, [apiType, baseUrl, timeoutSec, modelListText, nReq, concurrency, body])

  // API Key 加密存储：挂载时异步解密回填一次；此后每次变化都异步加密后写回
  useEffect(() => {
    let cancelled = false
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LLM_KEY_STORAGE_KEY) : null
    if (!raw) { setApiKeyLoaded(true); return }
    decryptLlmApiKey(raw).then(v => { if (!cancelled) { if (v) setApiKey(v); setApiKeyLoaded(true) } })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!apiKeyLoaded) return
    if (!apiKey) { try { localStorage.removeItem(LLM_KEY_STORAGE_KEY) } catch { /* ignore */ }; return }
    encryptLlmApiKey(apiKey).then(enc => {
      if (!enc) return
      try { localStorage.setItem(LLM_KEY_STORAGE_KEY, enc) } catch { /* ignore */ }
    })
  }, [apiKey, apiKeyLoaded])

  const handleBodyChange = (v: string) => {
    setBody(v)
    try {
      JSON.parse(fillModelPlaceholder(v, '"__MODEL__"'))
      setBodyErr('')
    } catch (e) {
      setBodyErr('JSON 语法错误：' + ((e as Error)?.message || String(e)))
    }
  }

  // ── 运行状态 ──
  const [pane, setPane] = useState<'live' | 'report' | 'history'>('live')
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [startErr, setStartErr] = useState('')
  const [results, setResults] = useState<BatchResult[]>([])
  const [liveLog, setLiveLog] = useState<BatchResult[]>([])
  const [liveModels, setLiveModels] = useState<string[]>([])
  const [liveN, setLiveN] = useState(0)
  const stopRef = useRef(false)

  // ── 报告 / 历史 ──
  const [report, setReport] = useState<BatchReport | null>(null)
  const [history, setHistory] = useState<BatchReport[]>(() => loadLlmHistory())
  const [expandedHistId, setExpandedHistId] = useState<string | null>(null)
  const [histNotice, setHistNotice] = useState('')

  const runBatch = async () => {
    setStartErr('')
    const errs: string[] = []
    try {
      JSON.parse(fillModelPlaceholder(body, '"__MODEL__"'))
    } catch (e) {
      errs.push('请求体不是合法 JSON：' + ((e as Error)?.message || String(e)))
    }
    const models = parseModelList(modelListText)
    if (models.length === 0) errs.push('模型列表不能为空。')
    if (!apiKey.trim()) errs.push('API Key 不能为空。')
    if (!baseUrl.trim()) errs.push('Base URL 不能为空。')
    const N = Math.max(1, parseInt(nReq, 10) || 1)
    const C = Math.max(1, parseInt(concurrency, 10) || 1)
    const timeoutNum = Math.max(1, parseFloat(timeoutSec) || 120)
    if (errs.length) { setStartErr(errs.join('\n')); return }

    const cfg: LlmBatchCfg = { apiType, endpoint: llmEndpointOf(apiType, baseUrl), apiKey: apiKey.trim(), timeout: timeoutNum, bodyText: body }

    const queue: BatchTask[] = []
    let seqCounter = 0
    for (const m of models) {
      for (let i = 1; i <= N; i++) queue.push({ seq: ++seqCounter, model: m, localIdx: i })
    }
    const initial: BatchResult[] = queue.map(t => ({
      seq: t.seq, model: t.model, localIdx: t.localIdx, status: 'pending',
      httpStatus: null, tFirst: null, elapsed: null, returnedModel: null,
      inputTokens: null, outputTokens: null, error: null,
    }))

    stopRef.current = false
    setStopping(false)
    setRunning(true)
    setPane('live')
    setReport(null)
    setResults(initial)
    setLiveLog([])
    setLiveModels(models)
    setLiveN(N)

    // 用一个普通局部数组同步维护最新结果，作为报告数据的唯一真源；
    // setResults 只负责触发渲染 —— React 的 setState 是异步/批处理的，
    // Promise.all(workers) resolve 后不能保证最后一次 setResults 的 updater 已经跑完，
    // 若报告直接从 state（或镜像 state 的 ref）读取，最后完成的那条请求可能还来不及写入。
    const resultsArr = initial
    const startTime = Date.now()
    let cursor = 0
    const worker = async () => {
      while (!stopRef.current && cursor < queue.length) {
        const task = queue[cursor++]
        const idx = task.seq - 1
        resultsArr[idx] = { ...resultsArr[idx], status: 'running' }
        setResults([...resultsArr])
        const rec = await doLlmRequest(cfg, task)
        resultsArr[idx] = rec
        setResults([...resultsArr])
        setLiveLog(prev => [rec, ...prev])
      }
    }
    const workerCount = Math.min(C, queue.length)
    await Promise.all(Array.from({ length: workerCount }, worker))

    const endTime = Date.now()
    const wasStopped = stopRef.current
    stopRef.current = false
    setStopping(false)
    setRunning(false)

    const finalResults = [...resultsArr].sort((a, b) => a.seq - b.seq)
    const rep: BatchReport = {
      id: 'r' + endTime + '_' + Math.random().toString(36).slice(2, 7),
      startTime, endTime, durationMs: endTime - startTime,
      apiType, endpoint: cfg.endpoint, bodyText: cfg.bodyText, models, n: N, c: C, stopped: wasStopped,
      total: finalResults.length,
      success: finalResults.filter(r => r.status === 'ok').length,
      fail: finalResults.filter(r => r.status === 'error').length,
      results: finalResults,
    }
    const { list, dropped } = saveLlmHistory(rep)
    setHistory(list)
    setHistNotice(dropped ? '存储空间有限，已自动删除最早的历史报告为新报告腾出空间。' : '')
    setReport(rep)
    setPane('report')
  }

  const stopBatch = () => {
    stopRef.current = true
    setStopping(true)
  }

  const completed = results.filter(r => r.status === 'ok' || r.status === 'error').length
  const total = results.length
  const pct = total ? Math.round(completed / total * 100) : 0
  const okCount = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length
  const statusCodes = Array.from(new Set(results.map(r => r.httpStatus).filter((v): v is number => v != null))).sort((a, b) => a - b)

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>LLM 批量测试 & 验真</SectionTitle>
        <div className="ml-auto flex gap-2">
          {running
            ? <Btn variant="danger" onClick={stopBatch} disabled={stopping}>{stopping ? '正在停止…' : '⏹ 停止'}</Btn>
            : <Btn variant="primary" onClick={runBatch} disabled={!apiKey.trim() || !baseUrl.trim()}>▶ 开始批量请求</Btn>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧配置栏 */}
        <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
          <div>
            <Label className="block mb-1.5">API 类型</Label>
            <CustomSelect value={apiType} onChange={v => setApiType(v as ApiType)} options={[
              { value: 'anthropic', label: 'Anthropic Messages API' },
              { value: 'openai_chat', label: 'OpenAI Chat Completions API' },
              { value: 'openai_responses', label: 'OpenAI Responses API' },
            ]} />
          </div>
          <div>
            <Label className="block mb-1.5">Base URL</Label>
            <CustomInput value={baseUrl} onChange={setBaseUrl} placeholder="https://api.anthropic.com" />
          </div>
          <div>
            <Label className="block mb-1.5">API Key</Label>
            <CustomInput value={apiKey} onChange={setApiKey} placeholder="sk-...（本地加密存储）" type="password" />
          </div>
          <div>
            <Label className="block mb-1.5">请求超时（秒）</Label>
            <CustomInput value={timeoutSec} onChange={setTimeoutSec} type="number" placeholder="120" />
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>实际请求端点：{llmEndpointOf(apiType, baseUrl || '{BaseURL}')}</p>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">模型列表（每行一个，或逗号分隔）</Label>
            <CustomTextarea value={modelListText} onChange={setModelListText} mono rows={3}
              placeholder={'claude-3-5-sonnet-20241022\nclaude-3-haiku-20240307'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="block mb-1.5">每模型次数 N</Label><CustomInput value={nReq} onChange={setNReq} type="number" placeholder="5" /></div>
            <div><Label className="block mb-1.5">全局并发数 C</Label><CustomInput value={concurrency} onChange={setConcurrency} type="number" placeholder="3" /></div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="block mb-1.5">请求体 JSON（{'{{model}}'} 占位，或留空自动注入 model）</Label>
            <CustomTextarea value={body} onChange={handleBodyChange} mono stretch className="flex-1"
              style={{ minHeight: 0, ...(bodyErr ? { border: '1px solid var(--err)', boxShadow: '0 0 0 3px var(--errBg)' } : {}) }} />
            {bodyErr && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{bodyErr}</p>}
          </div>
          {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
        </div>

        {/* 右侧结果区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane} onChange={v => setPane(v as 'live' | 'report' | 'history')} options={[
              { value: 'live', label: '实时' },
              { value: 'report', label: '报告' },
              { value: 'history', label: `历史 (${history.length})` },
            ]} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {pane === 'live' && (
              <div className="flex flex-col">
                {total > 0 && (
                  <div className="px-6 py-3 flex flex-col gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--t2)' }}>总进度</span>
                      <span className="tabular-nums" style={{ color: 'var(--t2)' }}>{completed} / {total}（{pct}%）</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: pct + '%' }} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs pt-0.5">
                      <span style={{ color: 'var(--t2)' }}>成功 <strong className="tabular-nums" style={{ color: 'var(--ok)' }}>{okCount}</strong></span>
                      <span style={{ color: 'var(--t2)' }}>失败 <strong className="tabular-nums" style={{ color: errCount ? 'var(--err)' : 'var(--t2)' }}>{errCount}</strong></span>
                      {statusCodes.length > 0 && (
                        <span style={{ color: 'var(--t2)' }}>状态码 <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{statusCodes.join(', ')}</strong></span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2.5 pt-1">
                      {liveModels.map(m => {
                        const rs = results.filter(r => r.model === m)
                        const doneM = rs.filter(r => r.status === 'ok' || r.status === 'error').length
                        const okM = rs.filter(r => r.status === 'ok').length
                        const failM = rs.filter(r => r.status === 'error').length
                        const pctM = liveN ? Math.round(doneM / liveN * 100) : 0
                        return (
                          <div key={m}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono" style={{ color: 'var(--text)' }}>{m}</span>
                              <span style={{ color: 'var(--t3)' }}>
                                <span style={{ color: 'var(--ok)' }}>成功 {okM}</span> / <span style={{ color: 'var(--err)' }}>失败 {failM}</span> · {doneM}/{liveN}
                              </span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                              <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: pctM + '%' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="p-4 flex flex-col gap-2">
                  {liveLog.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                      <div className="text-4xl mb-3 opacity-60">⊞</div>
                      <p className="text-sm">配置参数后点击「开始批量请求」</p>
                    </div>
                  ) : liveLog.map(r => (
                    <div key={r.seq} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3.5 py-2.5 text-xs"
                      style={{ background: 'var(--bg)', border: `1px solid ${r.status === 'error' ? 'var(--err)' : 'var(--border)'}`, boxShadow: 'var(--shadow)' }}>
                      <span className="font-bold" style={{ color: 'var(--t2)' }}>#{r.seq}</span>
                      <span className="font-mono" style={{ color: 'var(--accent)' }}>{r.model}</span>
                      <Badge color={r.status === 'ok' ? 'ok' : 'err'}>{r.status === 'ok' ? '✓ 成功' : '✗ 失败'}</Badge>
                      {r.httpStatus != null && <Badge>{r.httpStatus}</Badge>}
                      {r.returnedModel != null && (
                        <Badge color={r.returnedModel === r.model ? 'ok' : 'err'}>
                          返回模型 {r.returnedModel}{r.returnedModel !== r.model ? ' ≠' : ''}
                        </Badge>
                      )}
                      {r.tFirst != null && <span style={{ color: 'var(--t2)' }}>首字 {r.tFirst}ms</span>}
                      {r.elapsed != null && <span style={{ color: 'var(--t3)' }}>总 {(r.elapsed / 1000).toFixed(2)}s</span>}
                      {r.inputTokens != null && <span style={{ color: 'var(--t3)' }}>in: {r.inputTokens}</span>}
                      {r.outputTokens != null && <span style={{ color: 'var(--t3)' }}>out: {r.outputTokens}</span>}
                      {r.error && <span style={{ color: 'var(--err)' }}>{r.error.slice(0, 160)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pane === 'report' && (
              <div className="p-5">
                {report ? <LlmBatchReportView report={report} apiKey={apiKey} /> : (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">还没有已完成的测试报告。</p>
                  </div>
                )}
              </div>
            )}

            {pane === 'history' && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--t3)' }}>已存 {history.length} / {LLM_HIST_MAX} 条历史报告</span>
                  {history.length > 0 && (
                    <Btn small variant="danger" onClick={() => {
                      if (window.confirm('确认清空全部历史报告？此操作不可恢复。')) {
                        clearLlmHistory(); setHistory([]); setExpandedHistId(null)
                      }
                    }}>清空全部</Btn>
                  )}
                </div>
                {histNotice && <p className="text-xs" style={{ color: 'var(--warn)' }}>⚠ {histNotice}</p>}
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">暂无历史报告。</p>
                  </div>
                ) : history.map(rep => (
                  <div key={rep.id} className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {llmFmtTime(rep.startTime)}
                          {rep.stopped && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--warn)' }}>（已手动停止）</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                          模型：{rep.models.join(', ')} ｜ 成功 <span style={{ color: 'var(--ok)' }}>{rep.success}</span> / 总 {rep.total} ｜ 耗时 {llmFmtDur(rep.durationMs)}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Btn small variant="ghost" onClick={() => setExpandedHistId(id => id === rep.id ? null : rep.id)}>
                          {expandedHistId === rep.id ? '收起' : '查看'}
                        </Btn>
                        <Btn small variant="ghost" onClick={() => llmDownload(`report_${llmTsName(rep.startTime)}.json`, JSON.stringify(rep, null, 2), 'application/json')}>JSON</Btn>
                        <Btn small variant="ghost" onClick={() => llmDownload(`report_${llmTsName(rep.startTime)}.csv`, reportToCsv(rep), 'text/csv;charset=utf-8')}>CSV</Btn>
                        <Btn small variant="danger" onClick={() => {
                          if (window.confirm('确认删除该条历史报告？此操作不可恢复。')) {
                            const list = deleteLlmHistoryItem(rep.id)
                            setHistory(list)
                            if (expandedHistId === rep.id) setExpandedHistId(null)
                          }
                        }}>删除</Btn>
                      </div>
                    </div>
                    {expandedHistId === rep.id && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                        <LlmBatchReportView report={rep} apiKey={apiKey} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function ThemeMenu({ theme, setTheme }: { theme: ThemeKey; setTheme: (t: ThemeKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const SWATCHES: Record<ThemeKey, string> = {
    light: '#f3f4f6', dark: '#1a1a1c', claude: '#c4855a', green: '#4a8060',
  }

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute left-0 bottom-full mb-2 rounded-2xl z-20"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 180, padding: '6px' }}>
          <p className="text-xs font-semibold px-2 pt-1 pb-2" style={{ color: 'var(--t3)', letterSpacing: '0.06em' }}>THEME</p>
          {(Object.keys(THEMES) as ThemeKey[]).map(t => {
            const active = theme === t
            return (
              <button key={t} onClick={() => { setTheme(t); setOpen(false) }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm font-medium cursor-pointer border-0 outline-none transition-all duration-150"
                style={{ background: active ? 'var(--accentSubHard)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)', fontFamily: 'inherit' }}
                onPointerEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
                onPointerLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ background: SWATCHES[t], border: `2px solid ${active ? 'var(--accent)' : 'var(--borderHard)'}` }} />
                <span className="flex-1 text-left">{THEMES[t].label}</span>
                {active && <span style={{ color: 'var(--accent)' }}><IconCheck /></span>}
              </button>
            )
          })}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} aria-label="切换主题"
        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border-0 outline-none transition-all duration-150 active:scale-95"
        style={{ background: open ? 'var(--accentSubHard)' : 'var(--s1)', color: open ? 'var(--accent)' : 'var(--t2)', border: '1px solid var(--border)' }}
        onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
        onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = open ? 'var(--accent)' : 'var(--t2)' }}
      >
        <IconSettings />
      </button>
    </div>
  )
}

// ─── Tool: 图片信息识别 ─────────────────────────────────────────────────────────

let imgCounter = 0

function ImageAnalyzerTool() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [view, setView] = useState<'card' | 'table'>('card')
  const [sortBy, setSortBy] = useState<'added' | 'pixels' | 'size' | 'name' | 'width'>('added')
  const [filterTier, setFilterTier] = useState('')
  const [search, setSearch] = useState('')
  const [loose, setLoose] = useState(false)
  const [lightboxItem, setLightboxItem] = useState<ImageItem | null>(null)
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'info' | 'ok' | 'err' }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropzoneRef = useRef<HTMLDivElement>(null)

  const addToast = useCallback((msg: string, type: 'info' | 'ok' | 'err' = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, msg: '' } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 320)
    }, 2600)
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg|avif|heic|ico|tiff?)$/i.test(f.name))
    if (!files.length) { addToast('未检测到有效的图片文件', 'err'); return }
    files.forEach(file => {
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'local', name: file.name,
        size: file.size, mime: file.type, status: 'loading',
        width: 0, height: 0, format: '', src: '', origin: '本地文件',
      }
      setItems(prev => [...prev, item])
      const headReader = new FileReader()
      headReader.onload = () => {
        const detected = imgDetectFormat(headReader.result as ArrayBuffer)
        const fmt = detected || imgMimeToFormat(file.type) || imgExtFromUrl(file.name) || '未知'
        const patch: Partial<ImageItem> = { format: fmt }
        if (detected && imgMimeToFormat(file.type) && detected !== imgMimeToFormat(file.type)) {
          patch.formatNote = `扩展名声明为 ${imgMimeToFormat(file.type)}`
        }
        updateItem(id, patch)
      }
      headReader.readAsArrayBuffer(file.slice(0, 512))
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = () => {
          const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height
          updateItem(id, { width: w || 0, height: h || 0, src: e.target!.result as string, status: 'done', note: (!w || !h) ? '矢量图 / 无固有尺寸' : undefined })
        }
        img.onerror = () => updateItem(id, { status: 'error', error: '图片解码失败，可能是浏览器不支持的格式（如 HEIC）' })
        img.src = e.target!.result as string
      }
      reader.onerror = () => updateItem(id, { status: 'error', error: '文件读取失败' })
      reader.readAsDataURL(file)
    })
    addToast(`已添加 ${files.length} 张本地图片`, 'ok')
  }, [addToast, updateItem])

  const addUrls = useCallback((text: string) => {
    const urls = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean).filter(u => /^(https?:)?\/\/|^data:image\//i.test(u))
    if (!urls.length) { addToast('请输入有效的图片 URL（以 http(s):// 开头）', 'err'); return }
    urls.forEach(url => {
      const rawName = decodeURIComponent(url.split('/').pop()!.split('?')[0]) || '远程图片'
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'url', name: rawName.length > 44 ? rawName.slice(0, 42) + '…' : rawName,
        url, size: null, mime: '', status: 'loading', width: 0, height: 0,
        format: imgExtFromUrl(url) || '', src: url, origin: 'URL 链接',
      }
      setItems(prev => [...prev, item])
      const img = new Image(); img.crossOrigin = 'anonymous'
      const fallback = () => {
        const img2 = new Image()
        img2.onload = () => updateItem(id, { width: img2.naturalWidth, height: img2.naturalHeight, status: 'done', crossOriginBlocked: true, format: item.format || '未知' })
        img2.onerror = () => updateItem(id, { status: 'error', error: '无法加载该 URL（链接失效、非图片或被防盗链拦截）' })
        img2.src = url
      }
      img.onload = () => updateItem(id, { width: img.naturalWidth, height: img.naturalHeight, status: 'done' })
      img.onerror = fallback; img.src = url
      fetch(url, { mode: 'cors' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
        .then(async blob => {
          const fmt = await blob.slice(0, 512).arrayBuffer().then(buf => imgDetectFormat(buf) || imgMimeToFormat(blob.type) || item.format || '未知').catch(() => imgMimeToFormat(blob.type) || item.format || '未知')
          updateItem(id, { size: blob.size, mime: blob.type, format: fmt })
        })
        .catch(() => updateItem(id, { sizeBlocked: true, format: item.format || '未知' }))
    })
    addToast(`已开始加载 ${urls.length} 个 URL 图片`, 'ok')
  }, [addToast, updateItem])

  const removeItem = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), [])

  const visibleItems = useMemo(() => {
    let list = items.filter(it => {
      const c = imgClassifyResolution(it.width, it.height, loose)
      if (filterTier && c.tier !== filterTier) return false
      if (search && !(it.name.toLowerCase().includes(search) || (it.format || '').toLowerCase().includes(search))) return false
      return true
    })
    list.sort((a, b) => {
      if (sortBy === 'pixels') return (b.width * b.height) - (a.width * a.height)
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0)
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sortBy === 'width') return b.width - a.width
      return a.order - b.order
    })
    return list
  }, [items, sortBy, filterTier, search, loose])

  const tierOptions = useMemo(() => {
    const tiers = [...new Set(items.filter(i => i.status === 'done').map(i => imgClassifyResolution(i.width, i.height, loose).tier))]
    return [{ value: '', label: '全部' }, ...tiers.map(t => ({ value: t, label: t }))]
  }, [items, loose])

  const stats = useMemo(() => {
    const done = items.filter(i => i.status === 'done')
    const totalSize = done.reduce((s, i) => s + (i.size || 0), 0)
    const stdCount = done.filter(i => imgClassifyResolution(i.width, i.height, loose).standard).length
    const maxItem = done.slice().sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    const totalMP = done.reduce((s, i) => s + i.width * i.height, 0) / 1e6
    return { done, totalSize, stdCount, maxItem, totalMP }
  }, [items, loose])

  // Paste handler
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) { addFiles(files); return }
      const text = e.clipboardData?.getData('text')
      if (text && /^https?:\/\//i.test(text.trim())) addUrls(text)
    }
    window.addEventListener('paste', handler as EventListener)
    return () => window.removeEventListener('paste', handler as EventListener)
  }, [addFiles, addUrls])

  // Lightbox escape
  useEffect(() => {
    if (!lightboxItem) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxItem(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxItem])

  // Prevent default drag on document
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragover', prevent); document.addEventListener('dragenter', prevent)
    return () => { document.removeEventListener('dragover', prevent); document.removeEventListener('dragenter', prevent) }
  }, [])

  const has = items.length > 0
  const done = stats.done

  const tierBadge = (c: ImgClassification) => {
    const grad = IMG_TIER_STYLE[c.tier] || IMG_TIER_STYLE['非标准']
    return <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-gradient-to-r ${grad} text-white px-2 py-0.5 text-[10px]`} style={{ textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>{c.standard ? c.tier : '非标准'}</span>
  }

  const copyInfo = (it: ImageItem) => {
    const c = imgClassifyResolution(it.width, it.height, loose)
    const txt = `文件名：${it.name}\n分辨率：${it.width} × ${it.height} 像素\n文件大小：${it.size == null ? '未知' : imgFormatBytes(it.size)}\n分辨率等级：${c.standard ? c.tier + '（' + c.name + '）' : '非标准分辨率（最接近 ' + c.near + '）'}\n图片格式：${it.format}\n宽高比：${imgAspectRatio(it.width, it.height)}\n来源：${it.origin}`
    navigator.clipboard.writeText(txt).then(() => addToast('图片信息已复制到剪贴板', 'ok')).catch(() => addToast('复制失败', 'err'))
  }

  const exportCsv = () => {
    const rows = [['文件名', '来源', '宽度(px)', '高度(px)', '分辨率', '文件大小(字节)', '文件大小', '分辨率等级', '标准规格', '图片格式', '宽高比', '百万像素']]
    visibleItems.filter(i => i.status === 'done').forEach(it => {
      const c = imgClassifyResolution(it.width, it.height, loose)
      rows.push([it.name, it.origin, String(it.width), String(it.height), `${it.width}x${it.height}`, String(it.size ?? ''), it.size == null ? '未知' : imgFormatBytes(it.size),
        c.standard ? c.tier : '非标准分辨率', c.standard ? c.name : ('最接近 ' + (c.near || '')), it.format, imgAspectRatio(it.width, it.height), ((it.width * it.height) / 1e6).toFixed(2)])
    })
    const csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `图片信息_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); addToast('CSV 已导出', 'ok')
  }

  const [dragOver, setDragOver] = useState(false)
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); if (!dropzoneRef.current?.contains(e.relatedTarget as Node)) setDragOver(false) }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    else { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (url) addUrls(url) }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-12 space-y-6">
      <SectionTitle>图片信息识别器</SectionTitle>

      {/* Input Area */}
      <section className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>本地上传 <span style={{ color: 'var(--t3)' }} className="font-normal">（支持多选 / 拖拽 / 粘贴）</span></span>
          </div>
          <div ref={dropzoneRef}
            className={`ia-checker rounded-xl border-2 border-dashed cursor-pointer p-8 text-center select-none transition-all duration-200 ${dragOver ? 'ia-drag-active' : ''}`}
            style={{ borderColor: dragOver ? undefined : 'var(--border)' }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" className="w-11 h-11 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--t3)' }}>
              <path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="M12 3v13m0-13 5 5m-5-5-5 5" />
            </svg>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>拖拽图片到此处，或 <span style={{ color: 'var(--accent)' }} className="underline decoration-dotted">点击选择文件</span></p>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--t3)' }}>支持 JPG / PNG / WebP / GIF / BMP / AVIF / SVG / ICO 等 · 可一次选择多张</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>

        <div className="rounded-2xl p-5 flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" /></svg>
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>图片 URL 加载 <span style={{ color: 'var(--t3)' }} className="font-normal">（每行一个，可批量）</span></span>
          </div>
          <UrlInput onSubmit={addUrls} />
        </div>
      </section>

      {/* Toolbar */}
      {has && (
        <section className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <SegmentedControl value={view} options={[{ value: 'card', label: '卡片' }, { value: 'table', label: '表格' }]} onChange={v => setView(v as 'card' | 'table')} />
          <div className="w-px h-5" style={{ background: 'var(--border)' }} />
          <CustomSelect value={sortBy} onChange={v => setSortBy(v as typeof sortBy)}
            options={[{ value: 'added', label: '添加顺序' }, { value: 'pixels', label: '像素总数 ↓' }, { value: 'size', label: '文件大小 ↓' }, { value: 'name', label: '文件名 A→Z' }, { value: 'width', label: '宽度 ↓' }]} />
          <CustomSelect value={filterTier} onChange={setFilterTier} options={tierOptions} />
          <input type="text" placeholder="搜索文件名 / 格式…" value={search} onChange={e => setSearch(e.target.value)}
            className="rounded-xl px-3 py-1.5 text-xs outline-none transition-all duration-150"
            style={{ background: 'var(--inputBg)', border: '1px solid var(--inputBorder)', color: 'var(--text)', width: 176 }}
          />
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" checked={loose} onChange={e => setLoose(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5" />
            宽松匹配 ±2%
          </label>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>显示 {visibleItems.length} / {items.length} 张</span>
          <Btn small onClick={exportCsv}>导出 CSV</Btn>
          <Btn small variant="danger" onClick={() => { setItems([]); addToast('已清空全部图片') }}>清空</Btn>
        </section>
      )}

      {/* Stats */}
      {has && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['图片总数', items.length + ' 张', `已解析 ${done.length} · 加载中 ${items.filter(i => i.status === 'loading').length}`, 'text-blue-500'],
            ['总文件大小', imgFormatBytes(stats.totalSize), `${done.filter(i => i.size == null).length} 张体积未知`, 'text-emerald-500'],
            ['标准分辨率', `${stats.stdCount} / ${done.length}`, `${done.length - stats.stdCount} 张为非标准分辨率`, 'text-violet-500'],
            ['最高分辨率', stats.maxItem ? `${stats.maxItem.width}×${stats.maxItem.height}` : '—', `合计 ${stats.totalMP.toFixed(1)} 百万像素`, 'text-amber-500'],
          ] as const).map(([t, v, s, c]) => (
            <div key={t} className="rounded-2xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
              <p className="text-[11px]" style={{ color: 'var(--t2)' }}>{t}</p>
              <p className={`text-xl font-bold mt-1 font-mono ${c}`}>{v}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>{s}</p>
            </div>
          ))}
        </section>
      )}

      {/* Empty State */}
      {!has && (
        <section className="rounded-2xl py-20 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <svg viewBox="0 0 24 24" className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--t3)' }}>
            <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 17 4.5-4.5 3 3L15 11l5 5" />
          </svg>
          <p className="font-medium" style={{ color: 'var(--t2)' }}>还没有图片</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--t3)' }}>上传本地图片或粘贴图片 URL，即可自动识别分辨率、大小、等级与格式</p>
        </section>
      )}

      {/* Card View */}
      {view === 'card' && has && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleItems.map(it => {
            const c = imgClassifyResolution(it.width, it.height, loose)
            const fmtCls = IMG_FORMAT_COLOR[it.format] || 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
            if (it.status === 'loading') return (
              <div key={it.id} className="rounded-2xl overflow-hidden ia-card-enter" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <div className="h-44 ia-shimmer" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-3/4 rounded ia-shimmer" />
                  <div className="h-3 w-1/2 rounded ia-shimmer" />
                  <div className="grid grid-cols-2 gap-2 pt-1"><div className="h-11 rounded-lg ia-shimmer" /><div className="h-11 rounded-lg ia-shimmer" /></div>
                </div>
              </div>
            )
            if (it.status === 'error') return (
              <div key={it.id} className="rounded-2xl overflow-hidden ia-card-enter" style={{ background: 'var(--bg)', border: '1px solid var(--err)', boxShadow: 'var(--shadow)' }}>
                <div className="h-44 grid place-items-center" style={{ background: 'var(--errBg)' }}>
                  <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--err)' }}><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3h.01" /></svg>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{it.error || '加载失败'}</p>
                  <Btn small variant="soft" className="mt-3 w-full" onClick={() => removeItem(it.id)}>移除</Btn>
                </div>
              </div>
            )
            const mp = ((it.width * it.height) / 1e6).toFixed(2)
            const orientation = it.width === it.height ? '正方形' : (it.width > it.height ? '横向' : '纵向')
            return (
              <div key={it.id} className="rounded-2xl overflow-hidden ia-card-enter group transition-all duration-200" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accentSubHard)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div className="relative h-44 ia-checker cursor-zoom-in overflow-hidden" onClick={() => setLightboxItem(it)}>
                  <img src={it.src} alt={it.name} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
                  <div className="absolute top-2 left-2 flex gap-1.5">{tierBadge(c)}</div>
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${fmtCls}`}>{it.format || '未知'}</span>
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-mono" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)', border: '1px solid var(--border)', color: 'var(--text)' }}>{it.width}×{it.height}</div>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p>
                  <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: it.source === 'local' ? 'var(--accent)' : 'var(--warn)' }} />{it.origin}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>分辨率</p>
                      <p className="font-mono text-sm font-semibold" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>文件大小</p>
                      <p className="font-mono text-sm font-semibold" style={{ color: it.size == null ? 'var(--t3)' : 'var(--ok)' }}>{it.size == null ? '未知' : imgFormatBytes(it.size)}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>分辨率等级</p>
                      <p className="text-sm font-semibold" style={{ color: c.standard ? 'var(--accent)' : 'var(--warn)' }}>{c.standard ? c.tier : '非标准'}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>图片格式</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{it.format || '未知'}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--t2)' }}>
                    {c.standard
                      ? <span style={{ color: 'var(--ok)' }}>✓ 标准规格：{c.name}{c.exact ? '' : '（±2% 近似）'}</span>
                      : <><span style={{ color: 'var(--warn)' }}>⚠ 非标准分辨率</span> · 最接近 <b style={{ color: 'var(--text)' }}>{c.near}</b></>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]" style={{ color: 'var(--t3)' }}>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>宽高比 {imgAspectRatio(it.width, it.height)}</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>{mp} MP</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>{orientation}</span>
                    {it.sizeBlocked && <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>跨域·体积未知</span>}
                    {it.formatNote && <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>{it.formatNote}</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Btn small variant="soft" className="flex-1" onClick={() => copyInfo(it)}>复制信息</Btn>
                    <Btn small variant="accent" className="flex-1" onClick={() => setLightboxItem(it)}>查看大图</Btn>
                    <Btn small variant="danger" onClick={() => removeItem(it.id)}>✕</Btn>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && has && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead style={{ background: 'var(--s1)' }}>
                <tr className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t2)' }}>
                  {['预览', '名称 / 来源', '分辨率', '等级', '文件大小', '格式', '宽高比', '像素', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(it => {
                  const c = imgClassifyResolution(it.width, it.height, loose)
                  if (it.status === 'loading') return <tr key={it.id}><td colSpan={9} className="px-4 py-3"><div className="h-8 rounded ia-shimmer" /></td></tr>
                  if (it.status === 'error') return <tr key={it.id}><td className="px-4 py-3" style={{ color: 'var(--err)' }}>—</td><td className="px-4 py-3 text-xs">{it.name}</td><td colSpan={6} className="px-4 py-3 text-xs" style={{ color: 'var(--err)' }}>{it.error}</td><td className="px-4 py-3"><button onClick={() => removeItem(it.id)} className="text-xs hover:underline" style={{ color: 'var(--err)' }}>移除</button></td></tr>
                  const fmtCls = IMG_FORMAT_COLOR[it.format] || 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
                  return (
                    <tr key={it.id} className="transition-colors duration-100" style={{ borderTop: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2"><div className="w-14 h-10 ia-checker rounded overflow-hidden cursor-zoom-in" onClick={() => setLightboxItem(it)}><img src={it.src} className="w-full h-full object-contain" /></div></td>
                      <td className="px-4 py-2 max-w-[220px]"><p className="truncate text-xs font-medium" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p><p className="text-[10px]" style={{ color: 'var(--t3)' }}>{it.origin}</p></td>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</td>
                      <td className="px-4 py-2">{tierBadge(c)}<span className="block text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{c.standard ? c.name : '最接近 ' + c.near}</span></td>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: it.size == null ? 'var(--t3)' : 'var(--ok)' }}>{it.size == null ? '未知' : imgFormatBytes(it.size)}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${fmtCls}`}>{it.format || '未知'}</span></td>
                      <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{imgAspectRatio(it.width, it.height)}</td>
                      <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{((it.width * it.height) / 1e6).toFixed(2)} MP</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button onClick={() => copyInfo(it)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>复制</button>
                        <button onClick={() => removeItem(it.id)} className="ml-2 text-[11px] transition-colors duration-100" style={{ color: 'var(--err)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>删除</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Standards Reference */}
      <section className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <details>
          <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 select-none" style={{ color: 'var(--text)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)' }}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
            分辨率标准规格参照表（判定规则说明）
          </summary>
          <div className="mt-4 text-xs space-y-3" style={{ color: 'var(--t2)' }}>
            <p>判定逻辑：取图片的<strong style={{ color: 'var(--text)' }}>长边与短边</strong>与标准规格比对（自动兼容横屏 / 竖屏）。完全一致时判定为对应标准等级；开启"宽松匹配"后允许 ±2% 误差；均不匹配时显示<span style={{ color: 'var(--warn)', fontWeight: 600 }}>非标准分辨率</span>，并给出最接近的等级参考（按长边区间归类）。</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {IMG_STANDARDS.map(s => (
                <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                  <span className="text-[11px] truncate" style={{ color: 'var(--t2)' }}>{s.name}</span>
                  <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--t3)' }}>{s.w}×{s.h}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r ${IMG_TIER_STYLE[s.tier]} text-white`}>{s.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <footer className="text-center text-[11px] py-6" style={{ color: 'var(--t3)' }}>
        纯前端实现 · 所有图片均在本地浏览器解析，不会上传到任何服务器 · FileReader API + Image 动态加载
      </footer>

      {/* Lightbox */}
      {lightboxItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setLightboxItem(null) }}
        >
          <div className="max-w-6xl w-full max-h-full flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{lightboxItem.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>
                  {lightboxItem.width} × {lightboxItem.height} px · {lightboxItem.size == null ? '体积未知' : imgFormatBytes(lightboxItem.size)} · {lightboxItem.format} · {(() => { const c = imgClassifyResolution(lightboxItem.width, lightboxItem.height, loose); return c.standard ? c.tier + '（' + c.name + '）' : '非标准分辨率' })()} · {imgAspectRatio(lightboxItem.width, lightboxItem.height)}
                </p>
              </div>
              <Btn small variant="soft" onClick={() => setLightboxItem(null)}>关闭 ✕</Btn>
            </div>
            <div className="ia-checker rounded-xl overflow-hidden flex-1 grid place-items-center min-h-0" style={{ border: '1px solid var(--border)' }}>
              <img src={lightboxItem.src} className="max-w-full max-h-[72vh] object-contain" alt="" />
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-20 right-4 z-[60] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`ia-toast-in pointer-events-auto px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl max-w-xs ${t.msg === '' ? 'opacity-0 translate-y-[-10px]' : ''}`}
            style={{
              background: t.type === 'ok' ? 'var(--ok)' : t.type === 'err' ? 'var(--err)' : 'var(--s2)',
              color: t.type === 'ok' || t.type === 'err' ? '#fff' : 'var(--text)',
              border: `1px solid ${t.type === 'ok' ? 'var(--ok)' : t.type === 'err' ? 'var(--err)' : 'var(--border)'}`,
              transition: 'opacity 0.3s, transform 0.3s',
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

function UrlInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <>
      <textarea
        value={value} onChange={e => setValue(e.target.value)} rows={4} spellCheck={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="https://example.com/photo.jpg&#10;https://example.com/banner.png"
        className="w-full flex-1 rounded-xl p-3 text-xs leading-relaxed resize-y outline-none transition-all duration-150"
        style={{
          background: 'var(--inputBg)', color: 'var(--text)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'none',
          fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', minHeight: 80,
        }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onSubmit(value); setValue('') } }}
      />
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Btn variant="accent" onClick={() => { onSubmit(value); setValue('') }}>加载 URL 图片</Btn>
        {[
          { url: 'https://picsum.photos/id/1015/1920/1080', label: '示例 1080P' },
          { url: 'https://picsum.photos/id/1043/3840/2160', label: '示例 4K' },
          { url: 'https://picsum.photos/id/1025/1000/667', label: '示例 非标准' },
        ].map(s => (
          <Btn key={s.url} small variant="soft" onClick={() => onSubmit(s.url)}>{s.label}</Btn>
        ))}
        <span className="text-[10px]" style={{ color: 'var(--t3)' }}>跨域图片可能无法读取文件大小</span>
      </div>
    </>
  )
}

function Sidebar({ tool, setTool, theme, setTheme }: {
  tool: ToolKey; setTool: (t: ToolKey) => void
  theme: ThemeKey; setTheme: (t: ThemeKey) => void
}) {
  return (
    <aside className="glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col" style={{ width: 'var(--sidebar-w)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="SparkQ" className="w-8 h-8 rounded-xl flex-shrink-0" />
          <div>
            <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>Dev Toolkit</div>
            <div className="text-xs" style={{ color: 'var(--t3)' }}>前端导航工具</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto">
        <div className="flex flex-col gap-0.5">
          {TOOLS.map(t => {
            const active = tool === t.key
            return (
              <button key={t.key} onClick={() => setTool(t.key)}
                className="w-full text-left px-3 py-2.5 rounded-xl cursor-pointer border-0 outline-none transition-all duration-150 active:scale-[0.98]"
                style={{ background: active ? 'var(--bg)' : 'transparent', boxShadow: active ? 'var(--shadow)' : 'none', fontFamily: 'inherit' }}
                onPointerEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
                onPointerLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150"
                    style={{ background: active ? 'var(--accentSubHard)' : 'var(--s2)', color: active ? 'var(--accent)' : 'var(--t2)' }}>
                    {t.icon}
                  </span>
                  <span className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text)' }}>{t.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 flex-shrink-0 flex items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
        <ThemeMenu theme={theme} setTheme={setTheme} />
        <p className="text-xs leading-tight" style={{ color: 'var(--t3)' }}>本地运算<br />不上传数据</p>
      </div>
    </aside>
  )
}

// ─── ID / 编码 纯函数 ──────────────────────────────────────────────────────────

// 随机字节源：crypto.getRandomValues（密码学安全，禁止 Math.random）。单次上限 65536，超限自动分块。
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let filled = 0; filled < n; filled += 65536) {
    crypto.getRandomValues(out.subarray(filled, Math.min(filled + 65536, n)))
  }
  return out
}

// 256 项 hex 查表：避免 toString(16).padStart 在批量生成下的开销
const HEX_LUT: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

type UuidFmt = 'standard' | 'compact' | 'braced' | 'urn'

// 生成 count 条 UUID 的原始字节（每条 16 字节、扁平排布），并打好版本位/variant 位
function uuidBytes(count: number, version: 'v4' | 'v7'): Uint8Array {
  const n = Math.max(1, Math.floor(count))
  const raw = randomBytes(n * 16)
  let v7Ms = 0
  let v7Counter = -1
  for (let i = 0; i < n; i++) {
    const b = i * 16
    if (version === 'v4') {
      raw[b + 6] = (raw[b + 6] & 0x0f) | 0x40 // version 4
      raw[b + 8] = (raw[b + 8] & 0x3f) | 0x80 // variant 10xx
    } else {
      // v7（RFC 9562）：前 48 bit 为大端毫秒时间戳；同一毫秒内用 12 bit 计数器保证批内单调递增
      const now = Date.now()
      if (now !== v7Ms) { v7Ms = now; v7Counter = ((raw[b + 6] & 0x0f) << 8) | raw[b + 7] }
      else { v7Counter = (v7Counter + 1) & 0x0fff }
      raw[b + 0] = (v7Ms / 2 ** 40) & 0xff
      raw[b + 1] = (v7Ms / 2 ** 32) & 0xff
      raw[b + 2] = (v7Ms / 2 ** 24) & 0xff
      raw[b + 3] = (v7Ms / 2 ** 16) & 0xff
      raw[b + 4] = (v7Ms / 2 ** 8) & 0xff
      raw[b + 5] = v7Ms & 0xff
      raw[b + 6] = 0x70 | ((v7Counter >> 8) & 0x0f) // version 7 + 12 bit rand_a 高 4 位
      raw[b + 7] = v7Counter & 0xff
      raw[b + 8] = (raw[b + 8] & 0x3f) | 0x80 // variant 10xx
    }
  }
  return raw
}

// 将原始字节按格式排版为 UUID 字符串（大小写在最后一次性处理）
function formatUuids(raw: Uint8Array, fmt: UuidFmt, upper: boolean): string[] {
  const out: string[] = new Array(raw.length / 16)
  for (let i = 0; i < raw.length; i += 16) {
    let s = ''
    for (let j = 0; j < 16; j++) s += HEX_LUT[raw[i + j]]
    if (fmt !== 'compact') {
      s = s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20)
    }
    if (fmt === 'braced') s = '{' + s + '}'
    else if (fmt === 'urn') s = 'urn:uuid:' + s
    out[i / 16] = upper ? s.toUpperCase() : s
  }
  return out
}

interface RandOpts {
  len: number
  upper: boolean
  lower: boolean
  digit: boolean
  symbol: boolean
  custom: string
  excludeAmbiguous: boolean
  requireEach: boolean
}

const RAND_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const RAND_LOWER = 'abcdefghijklmnopqrstuvwxyz'
const RAND_DIGIT = '0123456789'
const RAND_SYMBOL = '!@#$%^&*()_+-=[]{}|;:,.<>?'
const RAND_AMBIGUOUS = '0O1lI'

function randActiveClasses(o: RandOpts): number {
  let n = 0
  if (o.upper) n++
  if (o.lower) n++
  if (o.digit) n++
  if (o.symbol) n++
  if (o.custom) n++
  return n
}

// 生成 count 条随机字符串：无模偏采样 + 每类至少 1 个（Fisher-Yates 洗牌打散占位字符）
function genRandomStrings(opts: RandOpts, count: number): string[] {
  const n = Math.max(1, Math.floor(count))
  const len = Math.max(1, Math.floor(opts.len))

  const classes: string[] = []
  if (opts.upper) classes.push(RAND_UPPER)
  if (opts.lower) classes.push(RAND_LOWER)
  if (opts.digit) classes.push(RAND_DIGIT)
  if (opts.symbol) classes.push(RAND_SYMBOL)
  const custom = [...new Set(opts.custom.split(''))].join('')
  if (custom) classes.push(custom)

  // 剔除易混淆字符（对池与各字符集同时生效）
  const clean = (s: string) =>
    opts.excludeAmbiguous ? [...s].filter(ch => !RAND_AMBIGUOUS.includes(ch)).join('') : s
  let pool = [...new Set(classes.map(clean).join('').split(''))]
  if (pool.length === 0) pool = [...RAND_UPPER] // 全被剔除时的兜底
  const effectiveClasses = classes.map(clean).filter(s => s.length > 0)
  const requireEach = opts.requireEach && len >= effectiveClasses.length && effectiveClasses.length > 0

  let bytes = randomBytes(65536)
  let pos = 0
  // 无模偏采样：丢弃 ≥ max 的字节，避免 % 引入偏差；耗尽自动换一块
  const randByte = (divisor: number): number => {
    const max = Math.floor(256 / divisor) * divisor
    while (true) {
      if (pos >= bytes.length) { bytes = randomBytes(65536); pos = 0 }
      const b = bytes[pos++]
      if (b < max) return b
    }
  }

  const out: string[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const arr: string[] = new Array(len)
    let idx = 0
    if (requireEach) {
      for (const s of effectiveClasses) arr[idx++] = s[randByte(s.length) % s.length]
    }
    while (idx < len) arr[idx++] = pool[randByte(pool.length) % pool.length]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randByte(i + 1) % (i + 1)
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
    }
    out[k] = arr.join('')
  }
  return out
}

type B64DecodeResult = { ok: true; text: string; valid: boolean } | { ok: false; error: string }

function encodeB64(s: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  const CHUNK = 0x8000 // 32K 分块：避免一次 apply 超大数组导致栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  let b64 = btoa(binary)
  if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64
}

function decodeB64(s: string, lenient: boolean): B64DecodeResult {
  let clean = s
  if (lenient) {
    clean = clean.replace(/\s+/g, '')
    clean = clean.replace(/-/g, '+').replace(/_/g, '/')
    if (clean.length % 4 === 2) clean += '=='
    else if (clean.length % 4 === 3) clean += '='
  }
  let binary: string
  try {
    binary = atob(clean)
  } catch {
    return { ok: false, error: '无效的 Base64：字符集不合法或长度错误' }
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), valid: true }
  } catch {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), valid: false }
  }
}

type UniFmt = 'js' | 'es6' | 'htmlHex' | 'htmlDec' | 'codePoint' | 'percent'

const UNI_FORMATS: { value: UniFmt; label: string; hint: string }[] = [
  { value: 'js', label: '\\uXXXX（JS / JSON）', hint: 'UTF-16 单元，非 BMP 字符拆为代理对' },
  { value: 'es6', label: '\\u{XXXXX}（ES6）', hint: '按码点输出，直接支持 emoji' },
  { value: 'htmlHex', label: '&#x4E2D;（HTML 十六进制）', hint: 'HTML 实体，十六进制码点' },
  { value: 'htmlDec', label: '&#20013;（HTML 十进制）', hint: 'HTML 实体，十进制码点' },
  { value: 'codePoint', label: 'U+4E2D（标准记法）', hint: 'Unicode 标准码点记法' },
  { value: 'percent', label: '%u4E2D（旧 escape）', hint: 'UTF-16 单元，%u 旧式 URL 编码' },
]

const uniHex = (n: number, lower: boolean) => (lower ? n.toString(16) : n.toString(16).toUpperCase())
const uniHex4 = (n: number, lower: boolean) => uniHex(n, lower).padStart(4, '0')

// 编码：按码点迭代，正确处理代理对；结果 push 进数组，避免字符串 += 累加
function encodeUnicode(s: string, fmt: UniFmt, onlyNonAscii: boolean, lowerHex: boolean): string {
  const parts: string[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (onlyNonAscii && cp < 0x80) { parts.push(ch); continue }
    if (fmt === 'js' || fmt === 'percent') {
      const hi = ch.charCodeAt(0)
      const escaped = fmt === 'js' ? '\\u' : '%u'
      if (hi >= 0xd800 && hi <= 0xdbff && ch.length === 2) {
        parts.push(escaped + uniHex4(hi, lowerHex) + escaped + uniHex4(ch.charCodeAt(1), lowerHex))
      } else {
        parts.push(escaped + uniHex4(hi, lowerHex))
      }
    } else if (fmt === 'es6') {
      parts.push('\\u{' + uniHex(cp, lowerHex) + '}')
    } else if (fmt === 'htmlHex') {
      parts.push('&#x' + uniHex(cp, lowerHex) + ';')
    } else if (fmt === 'htmlDec') {
      parts.push('&#' + cp + ';')
    } else {
      parts.push('U+' + uniHex(cp, lowerHex) + ' ')
    }
  }
  return parts.join('')
}

// 解码：单趟正则混合识别 6 种写法，可混在同一段文本
const UNI_DECODE_RE = /\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|%u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]{1,6});|&#(\d{1,7});|U\+([0-9a-fA-F]{4,6})\s?/g

function decodeUnicode(s: string): string {
  const parts: string[] = []
  let last = 0
  UNI_DECODE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = UNI_DECODE_RE.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1] !== undefined) parts.push(String.fromCodePoint(parseInt(m[1], 16)))
    else if (m[2] !== undefined || m[3] !== undefined) parts.push(String.fromCharCode(parseInt((m[2] ?? m[3])!, 16)))
    else if (m[4] !== undefined) parts.push(String.fromCodePoint(parseInt(m[4], 16)))
    else if (m[5] !== undefined) parts.push(String.fromCodePoint(parseInt(m[5], 10)))
    else if (m[6] !== undefined) parts.push(String.fromCodePoint(parseInt(m[6], 16)))
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts.join('')
}

// ─── Tool: ID 生成器 ───────────────────────────────────────────────────────────

const ID_COUNTS = [1, 10, 50, 100, 1000]

const RAND_PRESETS: { label: string; patch: Partial<RandOpts> }[] = [
  { label: '强密码', patch: { len: 24, upper: true, lower: true, digit: true, symbol: true, custom: '', excludeAmbiguous: true, requireEach: true } },
  { label: 'API Key', patch: { len: 32, upper: true, lower: true, digit: true, symbol: false, custom: '', excludeAmbiguous: true, requireEach: true } },
  { label: '纯数字 ID', patch: { len: 20, upper: false, lower: false, digit: true, symbol: false, custom: '', excludeAmbiguous: false, requireEach: false } },
  { label: '短码', patch: { len: 8, upper: true, lower: false, digit: true, symbol: false, custom: '', excludeAmbiguous: true, requireEach: false } },
]

type IdMode = 'uuid' | 'rand'

interface IdGenOpts {
  mode: IdMode
  uuidVersion: 'v4' | 'v7'
  uuidFmt: UuidFmt
  upper: boolean
  count: number
  rand: RandOpts
}

const DEFAULT_IDGEN_OPTS: IdGenOpts = {
  mode: 'uuid', uuidVersion: 'v4', uuidFmt: 'standard', upper: false, count: 10,
  rand: { len: 24, upper: true, lower: true, digit: true, symbol: true, custom: '', excludeAmbiguous: true, requireEach: true },
}

function loadIdGenOpts(): IdGenOpts {
  if (typeof window === 'undefined') return DEFAULT_IDGEN_OPTS
  try {
    const raw = localStorage.getItem('idgen-opts')
    if (!raw) return DEFAULT_IDGEN_OPTS
    const p = JSON.parse(raw)
    return { ...DEFAULT_IDGEN_OPTS, ...p, rand: { ...DEFAULT_IDGEN_OPTS.rand, ...(p.rand ?? {}) } }
  } catch { return DEFAULT_IDGEN_OPTS }
}
function saveIdGenOpts(o: IdGenOpts) { try { localStorage.setItem('idgen-opts', JSON.stringify(o)) } catch { /* ignore */ } }

function IdGenTool() {
  const [opts, setOpts] = useState<IdGenOpts>(loadIdGenOpts)
  const [seed, setSeed] = useState(0)
  const [customCount, setCustomCount] = useState('')
  const deferredCount = useDeferredValue(opts.count)

  useEffect(() => { saveIdGenOpts(opts) }, [opts])

  const set = <K extends keyof IdGenOpts>(k: K, v: IdGenOpts[K]) => setOpts(o => ({ ...o, [k]: v }))
  const setRand = (patch: Partial<RandOpts>) => setOpts(o => ({ ...o, rand: { ...o.rand, ...patch } }))

  const count = Math.min(1000, Math.max(1, opts.count || 1))

  // 熵与格式分离：切格式/大小写只重新排版，不重新取随机数
  const raw = useMemo(() => uuidBytes(count, opts.uuidVersion), [count, opts.uuidVersion, seed])
  const uuidLines = useMemo(() => formatUuids(raw, opts.uuidFmt, opts.upper), [raw, opts.uuidFmt, opts.upper])
  const uuidText = useMemo(() => uuidLines.join('\n'), [uuidLines])
  const randLines = useMemo(() => genRandomStrings(opts.rand, deferredCount), [opts.rand, deferredCount, seed])
  const randText = useMemo(() => randLines.join('\n'), [randLines])

  const lines = opts.mode === 'uuid' ? uuidLines : randLines
  const text = opts.mode === 'uuid' ? uuidText : randText
  const first = lines[0] ?? ''

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = opts.mode === 'uuid' ? 'uuids.txt' : 'random-strings.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const setCount = (n: number) => set('count', Math.min(1000, Math.max(1, Math.floor(n))))

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <SectionTitle>ID 生成器</SectionTitle>
      <p className="text-sm mb-8" style={{ color: 'var(--t2)' }}>UUID 与随机字符串批量生成，全部本地计算</p>

      <div className="mb-6">
        <SegmentedControl
          value={opts.mode}
          options={[{ value: 'uuid', label: 'UUID' }, { value: 'rand', label: '随机字符串' }]}
          onChange={v => set('mode', v as IdMode)}
        />
      </div>

      {opts.mode === 'uuid' ? (
        <Card>
          <div className="flex flex-col gap-5">
            <div>
              <Label className="block mb-1.5">版本</Label>
              <SegmentedControl
                value={opts.uuidVersion}
                options={[{ value: 'v4', label: 'v4 随机' }, { value: 'v7', label: 'v7 时间有序' }]}
                onChange={v => set('uuidVersion', v as 'v4' | 'v7')}
              />
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--t3)' }}>
                {opts.uuidVersion === 'v4'
                  ? 'v4 纯随机生成，适合通用标识符'
                  : 'v7 前 48 位为毫秒时间戳，批量结果按生成顺序递增，适合数据库主键'}
              </p>
            </div>
            <div>
              <Label className="block mb-1.5">输出格式</Label>
              <CustomSelect
                value={opts.uuidFmt}
                onChange={v => set('uuidFmt', v as UuidFmt)}
                options={[
                  { value: 'standard', label: '标准（带横杠）' },
                  { value: 'compact', label: '无横杠' },
                  { value: 'braced', label: '大括号' },
                  { value: 'urn', label: 'urn:uuid:' },
                ]}
              />
            </div>
            <Toggle value={opts.upper} onChange={v => set('upper', v)} label="大写字母" />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>规则</h3>
            <div className="ml-auto">
              <SegmentedControl
                value=""
                options={RAND_PRESETS.map(p => ({ value: p.label, label: p.label }))}
                onChange={v => { const p = RAND_PRESETS.find(x => x.label === v); if (p) setRand(p.patch) }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>长度</Label>
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)', fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' }}>{opts.rand.len}</span>
              </div>
              <input
                type="range" min={1} max={256} value={opts.rand.len}
                onChange={e => setRand({ len: parseInt(e.target.value, 10) })}
                className="w-full cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>
            <div>
              <Label className="block mb-2">字符集</Label>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Toggle value={opts.rand.upper} onChange={v => setRand({ upper: v })} label="大写 A-Z" />
                <Toggle value={opts.rand.lower} onChange={v => setRand({ lower: v })} label="小写 a-z" />
                <Toggle value={opts.rand.digit} onChange={v => setRand({ digit: v })} label="数字 0-9" />
                <Toggle value={opts.rand.symbol} onChange={v => setRand({ symbol: v })} label="符号 !@#$%^&*" />
              </div>
            </div>
            <div>
              <Label className="block mb-1.5">自定义追加字符</Label>
              <CustomInput value={opts.rand.custom} onChange={v => setRand({ custom: v })} placeholder="如 -_ 或自定义字符集" mono />
            </div>
            <div className="flex flex-col gap-2.5">
              <Toggle value={opts.rand.excludeAmbiguous} onChange={v => setRand({ excludeAmbiguous: v })} label="排除易混淆字符 (0 O 1 l I)" />
              <div className="flex items-center gap-2">
                <Toggle value={opts.rand.requireEach} onChange={v => setRand({ requireEach: v })} label="每类至少包含 1 个" />
                {opts.rand.requireEach && opts.rand.len < randActiveClasses(opts.rand) && (
                  <Badge color="warn">长度小于启用字符集数，已自动降级</Badge>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>生成数量</h3>
          <Badge>{count} 条</Badge>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SegmentedControl
            value={ID_COUNTS.includes(count) ? String(count) : ''}
            options={ID_COUNTS.map(c => ({ value: String(c), label: c === 1 ? '1' : String(c) }))}
            onChange={v => { setCount(parseInt(v, 10)); setCustomCount('') }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--t3)' }}>自定义</span>
            <CustomInput
              value={customCount}
              onChange={v => {
                const digits = v.replace(/\D/g, '')
                setCustomCount(digits)
                const n = parseInt(digits, 10)
                if (!isNaN(n) && n > 0) setCount(n)
              }}
              placeholder="1–1000"
              mono
              className="w-24"
            />
          </div>
        </div>
      </Card>

      <Card className="mt-5">
        <div className="flex items-center mb-3">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>生成结果</h3>
          <div className="ml-auto flex items-center gap-2">
            <Btn onClick={() => setSeed(s => s + 1)} variant="accent" small>重新生成</Btn>
            <CopyBtn text={text} />
            <Btn onClick={download} variant="soft" small>下载 .txt</Btn>
          </div>
        </div>
        {first && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
            <Badge color="ok">首条</Badge>
            <code className="flex-1 text-sm font-semibold" style={{ fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', overflowWrap: 'anywhere' }}>{first}</code>
            <CopyBtn text={first} />
          </div>
        )}
        <div
          className="idgen-result rounded-xl overflow-auto p-4 text-xs leading-relaxed"
          style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', whiteSpace: 'pre', maxHeight: 460 }}
        >
          {text}
        </div>
      </Card>
    </div>
  )
}

// ─── Tool: Base64 编解码 ───────────────────────────────────────────────────────

function loadBase64Opts(): { urlSafe: boolean; lenient: boolean } {
  try {
    const raw = localStorage.getItem('base64-opts')
    if (!raw) return { urlSafe: false, lenient: true }
    const p = JSON.parse(raw)
    return { urlSafe: !!p.urlSafe, lenient: p.lenient !== false }
  } catch { return { urlSafe: false, lenient: true } }
}
function saveBase64Opts(o: { urlSafe: boolean; lenient: boolean }) {
  try { localStorage.setItem('base64-opts', JSON.stringify(o)) } catch { /* ignore */ }
}

function Base64Tool() {
  const [opts, setOpts] = useState(loadBase64Opts)
  const [src, setSrc] = useState<'text' | 'b64'>('text')
  const [text, setText] = useState('')
  const [b64, setB64] = useState('')
  const deferredText = useDeferredValue(text)
  const deferredB64 = useDeferredValue(b64)

  useEffect(() => { saveBase64Opts(opts) }, [opts])

  const setOpt = <K extends keyof typeof opts>(k: K, v: boolean) => setOpts(o => ({ ...o, [k]: v }))

  const enc = useMemo(() => encodeB64(deferredText, opts.urlSafe), [deferredText, opts.urlSafe])
  const dec = useMemo(() => decodeB64(deferredB64, opts.lenient), [deferredB64, opts.lenient])

  const showText = src === 'text' ? deferredText : (dec.ok ? dec.text : '')
  const showB64 = src === 'b64' ? deferredB64 : enc

  const editText = (v: string) => { setText(v); setSrc('text') }
  const editB64 = (v: string) => { setB64(v); setSrc('b64') }
  const clear = () => { setText(''); setB64(''); setSrc('text') }
  const exchange = () => {
    const t = showText, b = showB64
    setText(b); setB64(t)
    setSrc(src === 'text' ? 'b64' : 'text')
  }

  const textBytes = useMemo(() => new TextEncoder().encode(text).length, [text])
  const ratio = enc.length > 0 && textBytes > 0 ? ((enc.length / textBytes) * 100).toFixed(1) : '—'

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>Base64 编解码</SectionTitle>
        <div className="ml-auto flex items-center gap-4">
          <Toggle value={opts.urlSafe} onChange={v => setOpt('urlSafe', v)} label="URL-safe" />
          <Toggle value={opts.lenient} onChange={v => setOpt('lenient', v)} label="宽容解码" />
          <Btn onClick={exchange} small variant="ghost">⇄ 互换</Btn>
          <Btn onClick={clear} small variant="ghost">清空</Btn>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <div className="flex flex-col p-4 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center mb-2">
            <Label>原文</Label>
            <div className="ml-auto"><CopyBtn text={showText} /></div>
          </div>
          <CustomTextarea value={showText} onChange={editText} stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
        <div className="flex flex-col p-4 overflow-hidden">
          <div className="flex items-center mb-2">
            <Label>Base64</Label>
            <div className="ml-auto"><CopyBtn text={showB64} /></div>
          </div>
          <CustomTextarea value={showB64} onChange={editB64} mono stretch className="flex-1" style={{ minHeight: 0 }} />
          {src === 'b64' && !dec.ok && (
            <div className="mt-2 flex items-center gap-2">
              <Badge color="err">错误</Badge>
              <span className="text-xs" style={{ color: 'var(--err)' }}>{dec.error}</span>
            </div>
          )}
          {src === 'b64' && dec.ok && !dec.valid && (
            <div className="mt-2 flex items-center gap-2">
              <Badge color="warn">非 UTF-8 文本</Badge>
              <span className="text-xs" style={{ color: 'var(--warn)' }}>解码成功但不是合法 UTF-8 文本（可能是二进制数据）</span>
            </div>
          )}
        </div>
      </div>

      <div className="glass flex items-center gap-4 px-6 py-2.5 flex-shrink-0 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--t3)' }}>
        <span>原文 {text.length} 字符</span>
        <span>UTF-8 {textBytes} 字节</span>
        <span>Base64 {showB64.length} 字符</span>
        <span>膨胀率 {ratio}%</span>
      </div>
    </div>
  )
}

// ─── Tool: Unicode 转换 ─────────────────────────────────────────────────────────

function loadUnicodeOpts(): { fmt: UniFmt; onlyNonAscii: boolean; lowerHex: boolean } {
  try {
    const raw = localStorage.getItem('unicode-opts')
    if (!raw) return { fmt: 'js', onlyNonAscii: true, lowerHex: true }
    const p = JSON.parse(raw)
    const fmt = UNI_FORMATS.some(f => f.value === p.fmt) ? (p.fmt as UniFmt) : 'js'
    return { fmt, onlyNonAscii: p.onlyNonAscii !== false, lowerHex: p.lowerHex !== false }
  } catch { return { fmt: 'js', onlyNonAscii: true, lowerHex: true } }
}
function saveUnicodeOpts(o: { fmt: UniFmt; onlyNonAscii: boolean; lowerHex: boolean }) {
  try { localStorage.setItem('unicode-opts', JSON.stringify(o)) } catch { /* ignore */ }
}

function UnicodeTool() {
  const [opts, setOpts] = useState(loadUnicodeOpts)
  const [src, setSrc] = useState<'plain' | 'esc'>('plain')
  const [plain, setPlain] = useState('')
  const [esc, setEsc] = useState('')
  const deferredPlain = useDeferredValue(plain)
  const deferredEsc = useDeferredValue(esc)

  useEffect(() => { saveUnicodeOpts(opts) }, [opts])
  const setOpt = <K extends keyof typeof opts>(k: K, v: typeof opts[K]) => setOpts(o => ({ ...o, [k]: v }))

  const enc = useMemo(() => encodeUnicode(deferredPlain, opts.fmt, opts.onlyNonAscii, opts.lowerHex), [deferredPlain, opts.fmt, opts.onlyNonAscii, opts.lowerHex])
  const dec = useMemo(() => decodeUnicode(deferredEsc), [deferredEsc])

  const showPlain = src === 'plain' ? deferredPlain : dec
  const showEsc = src === 'esc' ? deferredEsc : enc

  const editPlain = (v: string) => { setPlain(v); setSrc('plain') }
  const editEsc = (v: string) => { setEsc(v); setSrc('esc') }
  const clear = () => { setPlain(''); setEsc(''); setSrc('plain') }
  const exchange = () => {
    const p = showPlain, e = showEsc
    setPlain(e); setEsc(p)
    setSrc(src === 'plain' ? 'esc' : 'plain')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>Unicode 转换</SectionTitle>
        <div className="ml-auto flex items-center gap-3">
          <Btn onClick={exchange} small variant="ghost">⇄ 互换</Btn>
          <Btn onClick={clear} small variant="ghost">清空</Btn>
        </div>
      </div>

      <div className="glass flex items-end gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-72 flex-shrink-0">
          <Label className="block mb-1.5">编码为</Label>
          <CustomSelect value={opts.fmt} onChange={v => setOpt('fmt', v as UniFmt)} options={UNI_FORMATS.map(f => ({ value: f.value, label: f.label }))} />
        </div>
        <div className="flex items-center gap-4 pb-0.5">
          <Toggle value={opts.onlyNonAscii} onChange={v => setOpt('onlyNonAscii', v)} label="仅转非 ASCII" />
          <Toggle value={opts.lowerHex} onChange={v => setOpt('lowerHex', v)} label="十六进制小写" />
        </div>
        <p className="ml-auto text-xs leading-snug pb-0.5 text-right" style={{ color: 'var(--t3)' }}>
          {'解码自动识别：\\uXXXX · \\u{…} · %uXXXX · &#x…; · &#…; · U+…'}
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <div className="flex flex-col p-4 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center mb-2">
            <Label>原文</Label>
            <div className="ml-auto"><CopyBtn text={showPlain} /></div>
          </div>
          <CustomTextarea value={showPlain} onChange={editPlain} stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
        <div className="flex flex-col p-4 overflow-hidden">
          <div className="flex items-center mb-2">
            <Label>转义结果</Label>
            <div className="ml-auto"><CopyBtn text={showEsc} /></div>
          </div>
          <CustomTextarea value={showEsc} onChange={editEsc} mono stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const FULLHEIGHT_TOOLS: ToolKey[] = ['json', 'aiconvert', 'llmbatch', 'base64', 'unicode']

export default function App() {
  const [theme, setTheme] = useState<ThemeKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dev-toolkit-theme') as ThemeKey
      if (saved && saved in THEMES) return saved
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
    }
    return 'light'
  })
  const [tool, setTool] = useState<ToolKey>('seedance')
  const [animating, setAnimating] = useState(false)
  const [themeX, setThemeX] = useState(false)

  useEffect(() => {
    localStorage.setItem('dev-toolkit-theme', theme)
  }, [theme])

  const switchTool = useCallback((t: ToolKey) => {
    if (t === tool) return
    setAnimating(true)
    setTimeout(() => setAnimating(false), 180)
    setTool(t)
  }, [tool])

  // 主题切换时短暂加 .theme-x 类，让颜色平滑过渡（避免明暗突变）
  const changeTheme = useCallback((t: ThemeKey) => {
    setTheme(t)
    setThemeX(true)
    window.setTimeout(() => setThemeX(false), 260)
  }, [])

  const vars = THEMES[theme].v
  const cssVars = Object.entries(vars).reduce((acc, [k, v]) => ({ ...acc, [`--${k}`]: v }), {} as Record<string, string>)
  const isFullH = FULLHEIGHT_TOOLS.includes(tool)

  const toolMap: Record<ToolKey, React.ReactElement> = {
    seedance: <SeedanceTool />,
    json: <JsonTool />,
    timestamp: <TimestampTool />,
    aiconvert: <AiConvertTool />,
    llmbatch: <LlmBatchTool />,
    imganalyze: <ImageAnalyzerTool />,
    idgen: <IdGenTool />,
    base64: <Base64Tool />,
    unicode: <UnicodeTool />,
  }

  return (
    <div className={themeX ? 'theme-x' : undefined} style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', ...cssVars,
      backgroundImage: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 4%, transparent) 0%, transparent 220px)',
    }}>
      <Sidebar tool={tool} setTool={switchTool} theme={theme} setTheme={changeTheme} />
      <main className="flex-1 overflow-hidden flex flex-col" style={{ paddingLeft: 'var(--sidebar-w)' }}>
        <div
          className="flex-1 overflow-hidden"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating ? 'translateY(4px)' : 'translateY(0)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
        >
          {isFullH ? (
            <div className="h-full overflow-hidden">{toolMap[tool]}</div>
          ) : (
            <div className="h-full overflow-y-auto">{toolMap[tool]}</div>
          )}
        </div>
      </main>
    </div>
  )
}
