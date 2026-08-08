import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, Legend } from 'recharts'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemeKey = 'light' | 'dark' | 'claude' | 'green'
type ToolKey = 'seedance' | 'json' | 'timestamp' | 'aiconvert' | 'llmbatch' | 'modelprobe' | 'imganalyze'
  | 'videoanalyze' | 'idgen' | 'base64' | 'unicode' | 'graphql'

interface ImageItem {
  id: string; order: number; source: 'local' | 'url' | 'base64json'; name: string
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
  bgGrad: string
}

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: Record<ThemeKey, { label: string; icon: string; dark: boolean; v: ThemeVars }> = {
  light: {
    label: '浅色', icon: '◐', dark: false,
    v: {
      bg: '#ffffff', s1: '#f5f6f7', s2: '#eef0f2',
      border: 'rgba(0,0,0,0.07)', borderHard: 'rgba(0,0,0,0.16)',
      text: '#111827', t2: '#6b7280', t3: '#9ca3af',
      accent: '#2563eb', accentFg: '#fff', accentSub: 'rgba(37,99,235,0.07)', accentSubHard: 'rgba(37,99,235,0.12)',
      primary: '#111827', primaryFg: '#ffffff',
      sidebar: '#ffffff', code: '#f5f6f7',
      shadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px -4px rgba(0,0,0,0.07)', shadowMd: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
      ok: '#16a34a', okBg: 'rgba(22,163,74,0.08)',
      err: '#dc2626', errBg: 'rgba(220,38,38,0.08)',
      warn: '#d97706', warnBg: 'rgba(217,119,6,0.08)',
      addBg: 'rgba(22,163,74,0.09)', addText: '#15803d',
      rmBg: 'rgba(220,38,38,0.09)', rmText: '#b91c1c',
      jKey: '#7c3aed', jStr: '#15803d', jNum: '#1d4ed8', jBool: '#b45309', jNull: '#9ca3af',
      inputBg: '#ffffff', inputBorder: 'rgba(0,0,0,0.11)',
      bgGrad: 'radial-gradient(1200px 700px at 80% -10%, rgba(37,99,235,0.03) 0%, transparent 60%), radial-gradient(900px 600px at -5% 110%, rgba(37,99,235,0.02) 0%, transparent 55%)',
    },
  },
  dark: {
    // 深色科技 — 参照 Forge C：暖橙主色 + 靛蓝氛围光 + 毛玻璃表面
    label: '深色', icon: '●', dark: true,
    v: {
      bg: '#090b12', s1: 'rgba(255,255,255,0.045)', s2: 'rgba(255,255,255,0.07)',
      border: 'rgba(255,255,255,0.10)', borderHard: 'rgba(255,255,255,0.20)',
      text: '#eceef5', t2: '#9aa3b4', t3: '#69728a',
      accent: '#ff7a45', accentFg: '#1a0d05', accentSub: 'rgba(255,122,69,0.16)', accentSubHard: 'rgba(255,122,69,0.24)',
      primary: '#ebebed', primaryFg: '#090b12',
      sidebar: 'rgba(255,255,255,0.035)', code: '#12141d',
      shadow: '0 1px 2px rgba(0,0,0,0.4)',
      shadowMd: '0 4px 20px rgba(0,0,0,0.55)',
      ok: '#34d399', okBg: 'rgba(52,211,153,0.1)',
      err: '#ff6b81', errBg: 'rgba(255,107,129,0.1)',
      warn: '#ffc24b', warnBg: 'rgba(255,194,75,0.1)',
      addBg: 'rgba(52,211,153,0.13)', addText: '#34d399',
      rmBg: 'rgba(255,107,129,0.13)', rmText: '#ff6b81',
      jKey: '#c084fc', jStr: '#6ee7b7', jNum: '#7dd3fc', jBool: '#fcd34d', jNull: '#6b7280',
      inputBg: '#12141d', inputBorder: 'rgba(255,255,255,0.10)',
      bgGrad: 'radial-gradient(900px 560px at 12% -8%, rgba(255,122,69,.20) 0%, transparent 55%), radial-gradient(820px 560px at 96% 8%, rgba(124,108,255,.20) 0%, transparent 52%), radial-gradient(700px 700px at 70% 120%, rgba(124,108,255,.12) 0%, transparent 60%)',
    },
  },
  claude: {
    // Muted clay/terracotta — not yellow. Warm cream base with dusty sienna accent.
    label: '暖陶', icon: '✦', dark: false,
    v: {
      bg: '#f8f2ec', s1: '#efe6dd', s2: '#e6d9cd',
      border: 'rgba(120,70,40,0.1)', borderHard: 'rgba(120,70,40,0.22)',
      text: '#2c1f14', t2: '#7a5c44', t3: '#b09880',
      accent: '#b5603a', accentFg: '#fff', accentSub: 'rgba(181,96,58,0.09)', accentSubHard: 'rgba(181,96,58,0.16)',
      primary: '#2c1f14', primaryFg: '#f8f2ec',
      sidebar: '#f8f2ec', code: '#f2e8dc', shadow: '0 1px 3px rgba(80,40,20,0.07), 0 4px 12px -4px rgba(80,40,20,0.12)', shadowMd: '0 4px 16px rgba(80,40,20,0.14)',
      ok: '#5a8740', okBg: 'rgba(90,135,64,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#b5603a', warnBg: 'rgba(181,96,58,0.09)',
      addBg: 'rgba(90,135,64,0.12)', addText: '#3d6022',
      rmBg: 'rgba(196,75,56,0.12)', rmText: '#963228',
      jKey: '#8b5cf6', jStr: '#3d7a28', jNum: '#2563eb', jBool: '#b5603a', jNull: '#b09880',
      inputBg: '#fdf8f4', inputBorder: 'rgba(120,70,40,0.15)',
      bgGrad: 'radial-gradient(1200px 700px at 80% -10%, #f3e4dc 0%, transparent 60%), radial-gradient(900px 600px at -5% 110%, #f1e7e0 0%, transparent 55%)',
    },
  },
  green: {
    // Dusty sage — muted, not saturated. Matches swatch.
    label: '山野绿', icon: '◉', dark: false,
    v: {
      bg: '#f0f5f0', s1: '#e6eee6', s2: '#dae6da',
      border: 'rgba(30,70,40,0.09)', borderHard: 'rgba(30,70,40,0.2)',
      text: '#1a2e1f', t2: '#4a7055', t3: '#85a88e',
      accent: '#3d7a54', accentFg: '#fff', accentSub: 'rgba(61,122,84,0.09)', accentSubHard: 'rgba(61,122,84,0.16)',
      primary: '#1a2e1f', primaryFg: '#f0f5f0',
      sidebar: '#f0f5f0', code: '#eaf3ea', shadow: '0 1px 3px rgba(20,50,30,0.06), 0 4px 12px -4px rgba(20,50,30,0.1)', shadowMd: '0 4px 16px rgba(20,50,30,0.12)',
      ok: '#3d7a54', okBg: 'rgba(61,122,84,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#a07030', warnBg: 'rgba(160,112,48,0.09)',
      addBg: 'rgba(61,122,84,0.13)', addText: '#285c3a',
      rmBg: 'rgba(196,75,56,0.13)', rmText: '#8f2e20',
      jKey: '#6d5aad', jStr: '#2e6e44', jNum: '#1d6a9e', jBool: '#8a6030', jNull: '#85a88e',
      inputBg: '#f0faf4', inputBorder: 'rgba(0,80,40,0.16)',
      bgGrad: 'radial-gradient(1200px 700px at 80% -10%, #e3efe8 0%, transparent 60%), radial-gradient(900px 600px at -5% 110%, #e6eee9 0%, transparent 55%)',
    },
  },
}

const TOOLS: { key: ToolKey; label: string; icon: React.ReactNode }[] = [
  { key: 'seedance', label: 'Seedance 计费', icon: <IconSeedance /> },
  { key: 'json', label: 'JSON 可视化', icon: <IconJson /> },
  { key: 'timestamp', label: '时间戳转换', icon: <IconClock /> },
  { key: 'aiconvert', label: 'AI 格式转换', icon: <IconConvert /> },
  { key: 'llmbatch', label: 'LLM 批量测试', icon: <IconBatch /> },
  { key: 'modelprobe', label: '模型探测', icon: <IconProbe /> },
  { key: 'imganalyze', label: '图片信息识别', icon: <IconImage /> },
  { key: 'videoanalyze', label: '视频信息检测', icon: <IconVideo /> },
  { key: 'idgen', label: 'ID 生成器', icon: <IconId /> },
  { key: 'base64', label: 'Base64 编解码', icon: <IconCode /> },
  { key: 'unicode', label: 'Unicode 转换', icon: <IconType /> },
  { key: 'graphql', label: 'GraphQL 格式化', icon: <IconGraphql /> },
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
function IconVideo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>
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
function IconGraphql() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8l8-5 8 5v8l-8 5-8-5z"/><path d="M4 8l8 5 8-5"/><path d="M12 3v18"/><path d="M4 16l8-5 8 5"/>
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

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IconRepeat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  )
}
function IconExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  )
}
function IconProbe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <line x1="21" y1="21" x2="16.5" y2="16.5"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
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

/** 兼容 `{{model}}`/`${[model]}` 等占位符的 JSON 格式化：先替换占位符为合法 JSON 标记，
 *  格式化后再还原，确保含占位符的 JSON 也能被语法高亮和折叠。 */
function formatJsonWithPlaceholders(raw: string): { ok: boolean; text: string } {
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
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--text)',
          fontFamily: mono ? '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' : 'inherit',
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
          padding: '10px 12px',
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

// 带搜索框的下拉选择器：视觉/交互结构对齐 CustomSelect，仅在浮层顶部加一个 sticky 搜索框按 label 过滤选项
function SearchableSelect({ value, onChange, options, placeholder, className = '' }: {
  value: string | null; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [open])

  useEffect(() => {
    if (open) { setSearch(''); requestAnimationFrame(() => searchRef.current?.focus()) }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full flex items-center justify-between overflow-hidden min-w-0 rounded-xl transition-all duration-150 cursor-pointer border-0 outline-none active:scale-[0.99]"
        style={{
          padding: '10px 12px',
          background: 'var(--inputBg)',
          border: `1px solid ${open || focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: open || focused ? '0 0 0 3px var(--accentSub)' : '0 1px 2px rgba(0,0,0,0.03)',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      >
        <span className="truncate" style={{ color: selected ? 'var(--text)' : 'var(--t3)' }} title={selected?.label ?? ''}>{selected?.label ?? placeholder ?? '选择…'}</span>
        <span style={{ color: 'var(--t3)', marginLeft: 8, flexShrink: 0 }}>
          <IconChevron open={open} />
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 rounded-2xl overflow-hidden"
          style={{ top: 'calc(100% + 5px)', background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)' }}
        >
          <div className="sticky top-0" style={{ padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索…"
              className="w-full outline-none border-0"
              style={{ padding: '6px 8px', background: 'var(--inputBg)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-xs" style={{ color: 'var(--t3)' }}>无匹配结果</div>
            ) : filtered.map((o, idx) => {
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
                    marginBottom: idx < filtered.length - 1 ? 1 : 0,
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
        </div>
      )}
    </div>
  )
}

// Fully custom Textarea
function CustomTextarea({ value, onChange, placeholder, rows, className = '', mono, style, stretch, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  rows?: number; className?: string; mono?: boolean; style?: React.CSSProperties; stretch?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
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
        onKeyDown={onKeyDown}
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
          fontFamily: mono ? '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' : 'inherit',
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
        fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
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
    <div className="mx-auto max-w-2xl px-6 py-12">
      <SectionTitle>Seedance 计费计算器</SectionTitle>

      <div className="grid gap-5">
        {/* 操作区（整块表单卡片） */}
        <Card>
          {/* 区域 + 模型 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block mb-1">计费区域</Label>
              <SegmentedControl
                value={region}
                options={[{ value: 'cn', label: '国内' }, { value: 'us', label: '海外' }]}
                onChange={v => onRegionChange(v as RegionKey)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="block mb-1">模型变体</Label>
              <CustomSelect value={model} onChange={onModelChange}
                options={Object.keys(SEEDANCE_PRICING[region]).map(m => ({ value: m, label: m }))} />
            </div>
          </div>

          {/* 分辨率 + 是否含视频 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block mb-1">输出分辨率</Label>
              <CustomSelect value={resolution} onChange={setResolution}
                options={availableRes.map(r => ({ value: r, label: r }))} />
            </div>
            <div>
              <Label className="block mb-1">输入是否包含视频</Label>
              <CustomSelect value={hasVideo} onChange={setHasVideo}
                options={[{ value: '是', label: '是' }, { value: '否', label: '否' }]} />
            </div>
          </div>

          {/* Token 数 + 汇率 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-1">Token 数量</Label>
              <CustomInput type="number" value={tokens} onChange={setTokens} placeholder="200000" mono />
            </div>
            <div>
              <Label className="block mb-1">汇率 1 USD = ? CNY</Label>
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
  fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
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
        style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', fontSize: '12.5px', lineHeight: JSON_ROW + 'px', padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_PAD_L}px`, tabSize: 2 }}>
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

function DiffEditor({ value, onChange, placeholder, lineTypes, scrollRef, onFocus, onBlur, autoFocus, onGutterEnter }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; lineTypes?: ('same' | 'add' | 'rm')[]
  scrollRef: React.MutableRefObject<{ top: number; left: number }>
  onFocus?: () => void; onBlur?: () => void; autoFocus?: boolean
  onGutterEnter: () => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const backRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = value.length ? value.split('\n') : ['']
  const [matchPos, setMatchPos] = useState<{ line: number; col: number } | null>(null)

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

  /** 键盘事件：Tab 缩进/补全，智能删除空配对 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart, selectionEnd } = ta
    const val = value

    if (e.key === 'Tab') {
      e.preventDefault()
      if (selectionStart !== selectionEnd) {
        // 多行选中：Tab 缩进全部选中行，Shift+Tab 减少缩进
        const sel = val.slice(selectionStart, selectionEnd)
        const selLines = sel.split('\n')
        if (e.shiftKey) {
          // Shift+Tab：去掉每行行首 2 空格（第一行非行首时跳过）
          const newLines = selLines.map((l, i) => {
            if (i === 0 && selectionStart > 0) return l
            return l.startsWith('  ') ? l.slice(2) : l
          })
          const newSel = newLines.join('\n')
          const firstTrimmed = (selectionStart > 0) ? 0 : (selLines[0].startsWith('  ') ? 2 : 0)
          onChange(val.slice(0, selectionStart) + newSel + val.slice(selectionEnd))
          requestAnimationFrame(() => {
            ta.selectionStart = selectionStart - firstTrimmed
            ta.selectionEnd = selectionStart - firstTrimmed + newSel.length
            updateCursor()
          })
        } else {
          // Tab：每行行首加 2 空格
          const newLines = selLines.map((l, i) => {
            if (i === 0 && selectionStart > 0) return l
            return '  ' + l
          })
          const newSel = newLines.join('\n')
          onChange(val.slice(0, selectionStart) + newSel + val.slice(selectionEnd))
          requestAnimationFrame(() => {
            ta.selectionStart = selectionStart
            ta.selectionEnd = selectionStart + newSel.length
            updateCursor()
          })
        }
        return
      }

      // 无选中：Tab 补全或缩进
      if (e.shiftKey) {
        // Shift+Tab：删除行首 2 空格
        const lineStart = val.lastIndexOf('\n', selectionStart - 1) + 1
        if (val.slice(lineStart, lineStart + 2) === '  ') {
          onChange(val.slice(0, lineStart) + val.slice(lineStart + 2))
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = selectionStart - 2
            updateCursor()
          })
        }
        return
      }

      // 补全：检查光标前字符
      const prevChar = selectionStart > 0 ? val[selectionStart - 1] : ''
      const nextChar = selectionStart < val.length ? val[selectionStart] : ''

      if (prevChar === '{' && nextChar !== '}') {
        onChange(val.slice(0, selectionStart) + '}' + val.slice(selectionEnd))
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart
          updateCursor()
        })
        return
      }
      if (prevChar === '[' && nextChar !== ']') {
        onChange(val.slice(0, selectionStart) + ']' + val.slice(selectionEnd))
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart
          updateCursor()
        })
        return
      }
      if (prevChar === '"' && nextChar !== '"') {
        // 引号补全：仅当光标前引号未闭合（奇数个）时补全
        const quotesBefore = val.slice(0, selectionStart).split('').filter(c => c === '"').length
        if (quotesBefore % 2 === 1) {
          onChange(val.slice(0, selectionStart) + '"' + val.slice(selectionEnd))
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = selectionStart
            updateCursor()
          })
          return
        }
      }

      // 默认：插入 2 空格缩进
      onChange(val.slice(0, selectionStart) + '  ' + val.slice(selectionEnd))
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2
        updateCursor()
      })
      return
    }

    // Backspace：在空配对 {} [] "" 中时删除整个配对
    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
      const prev = val[selectionStart - 1]
      const next = val[selectionStart]
      if ((prev === '{' && next === '}') || (prev === '[' && next === ']') || (prev === '"' && next === '"')) {
        e.preventDefault()
        onChange(val.slice(0, selectionStart - 1) + val.slice(selectionStart + 1))
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
        ref={taRef} value={value} onChange={e => onChange(e.target.value)}
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
function JsonPane({ value, onChange, fmt, types, placeholder, style, paneId }: {
  value: string; onChange: (v: string) => void; fmt: { ok: boolean; text: string }
  types?: ('same' | 'add' | 'rm')[]; placeholder: string; style?: React.CSSProperties
  paneId: 'a' | 'b'
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
          autoFocus={wantFocus} />
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
            placeholder={'{\n  "name": "Alice",\n  "age": 30\n}'} />
        </div>
        <div onPointerDown={onDividerDown} className="flex-shrink-0"
          style={{ width: 10, cursor: 'col-resize', touchAction: 'none', display: 'flex', justifyContent: 'center' }}>
          <div className="h-full w-px" style={{ background: 'var(--border)' }} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <JsonPane paneId="b" value={right} onChange={setRight} fmt={rightFmt} types={rightTypes}
            placeholder={'{\n  "name": "Bob",\n  "age": 25\n}'} />
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
        <code style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', fontWeight: 600 }}>{now}</code>
        <span style={{ color: 'var(--t3)' }}>ms</span>
        <code style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', fontWeight: 600, marginLeft: 4 }}>{nowTs}</code>
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
                      <code className="flex-1 text-sm" style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)' }}>{val}</code>
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
                      <code className="flex-1 text-sm font-semibold" style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)' }}>{val}</code>
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
            style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, whiteSpace: 'pre' }}>
            <div dangerouslySetInnerHTML={{ __html: highlightJson(outputWithCache) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared: 只读 JSON 查看器（复用 JSON 可视化工具的高亮/折叠/虚拟滚动能力）───

const LLM_JSON_VIEWER_DEGRADE_LINES = 5000
const LLM_JSON_VIEWER_DEGRADE_CHARS = 500_000
const LLM_JSON_VIEWER_DEGRADE_LINE_LEN = 20_000

function ReadOnlyJsonTree({ text }: { text: string }) {
  const OVERSCAN = 10
  const lines = useMemo(() => text.split('\n'), [text])
  const degrade = useMemo(() =>
    lines.length > LLM_JSON_VIEWER_DEGRADE_LINES ||
    text.length > LLM_JSON_VIEWER_DEGRADE_CHARS ||
    lines.some(l => l.length > LLM_JSON_VIEWER_DEGRADE_LINE_LEN)
  , [lines, text])
  const ranges = useMemo(() => degrade ? new Map<number, number>() : computeFoldRanges(lines), [lines, degrade])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setViewportH(el.clientHeight)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggleFold = (line: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line); else next.add(line)
      return next
    })
  }

  const visible = useMemo(() => getVisibleLines(lines, ranges, collapsed), [lines, ranges, collapsed])
  const start = Math.max(0, Math.floor(scrollTop / JSON_ROW) - OVERSCAN)
  const end = Math.min(visible.length, Math.ceil((scrollTop + viewportH) / JSON_ROW) + OVERSCAN)
  const slice = visible.slice(start, end)

  const onScroll = () => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {degrade && (
        <div className="text-[11px] px-4 py-1.5 flex-shrink-0" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
          ⚠ 内容较大（{lines.length} 行 / {text.length} 字符），已关闭语法高亮与折叠以保证流畅度
        </div>
      )}
      <div ref={containerRef} onScroll={onScroll}
        className="absolute inset-0 overflow-auto"
        style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', fontSize: '12.5px', lineHeight: JSON_ROW + 'px', padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_PAD_L}px`, tabSize: 2 }}>
        <div style={{ height: visible.length * JSON_ROW, position: 'relative' }}>
          {slice.map((i, k) => {
            const vi = start + k
            const foldEnd = ranges.get(i)
            const foldable = !degrade && foldEnd != null && foldEnd > i
            const isCollapsed = collapsed.has(i)
            return (
              <div key={i} style={{ position: 'absolute', top: vi * JSON_ROW, left: 0, right: 0, height: JSON_ROW, display: 'flex', alignItems: 'center' }}>
                <span className="select-none" style={{ width: JSON_LINE_NO_W, flexShrink: 0, textAlign: 'right', paddingRight: 4, color: 'var(--t3)', fontSize: '11px', position: 'sticky', left: 0, background: 'var(--code)' }}>{i + 1}</span>
                {foldable ? (
                  <button onClick={() => toggleFold(i)} aria-label={isCollapsed ? '展开' : '折叠'}
                    className="flex-shrink-0 border-0 bg-transparent cursor-pointer outline-none"
                    style={{ width: JSON_FOLD_W, height: JSON_FOLD_W, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', padding: 0, fontFamily: 'inherit', fontSize: '10px', position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }}>
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : <span className="flex-shrink-0" style={{ width: JSON_FOLD_W, position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }} />}
                <span style={{ whiteSpace: 'pre', color: 'var(--text)', flex: 1, height: '100%' }}
                  dangerouslySetInnerHTML={degrade ? undefined : { __html: highlightJson(lines[i]) || '​' }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LlmJsonViewerModal({ title, subtitle, text, onClose, extraActions }: {
  title: string; subtitle?: string; text: string; onClose: () => void; extraActions?: React.ReactNode
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  const fmt = useMemo(() => formatJsonWithPlaceholders(text), [text])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 ia-lightbox-enter"
      style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 720, maxWidth: '92vw', height: '78vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
            {subtitle && <span className="text-xs" style={{ color: 'var(--t2)' }}>{subtitle}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {extraActions}
            <CopyBtn text={fmt.ok ? fmt.text : text} />
            <Btn small variant="ghost" onClick={onClose}>✕</Btn>
          </div>
        </div>
        {!fmt.ok && text.trim() !== '' && (
          <div className="mx-5 mb-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 内容不是合法 JSON，按原始文本展示
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 px-5 pb-4">
          <ReadOnlyJsonTree text={fmt.ok ? fmt.text : text} />
        </div>
      </div>
    </div>
  )
}

// 提示词编辑器用的可编辑 JSON 弹框（支持 Tab 缩进 + 格式化 + 占位符原样显示）
function LlmPromptEditorModal({ title, initial, onSave, onClose }: {
  title: string; initial: string; onSave: (body: string) => void; onClose: () => void
}) {
  const [text, setText] = useState(initial)
  const fmt = useMemo(() => formatJsonWithPlaceholders(text), [text])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart, selectionEnd, value } = ta
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = selectionStart + 2
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 ia-lightbox-enter"
      style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 760, maxWidth: '92vw', height: '82vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn small variant="ghost" onClick={() => setText(fmt.ok ? fmt.text : text)}>格式化</Btn>
            <Btn small variant="primary" onClick={() => { onSave(text); onClose() }}>保存</Btn>
            <button onClick={onClose} aria-label="关闭" className="rounded-lg p-1.5 border-0 outline-none cursor-pointer text-sm" style={{ background: 'transparent', color: 'var(--t2)' }}
              onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s2)' }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>✕</button>
          </div>
        </div>
        {!fmt.ok && text.trim() !== '' && (
          <div className="mx-5 mb-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 内容不是合法 JSON，按原始文本展示
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 px-5 pb-5">
          <CustomTextarea value={text} onChange={setText} onKeyDown={handleTab} mono stretch className="flex-1" style={{ minHeight: 0, fontSize: 12, lineHeight: 1.6 }} />
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
  responseHeaders?: Record<string, string> | null
  responseBody?: string | null
  responseBodyTruncated?: boolean
}

interface BatchReport {
  id: string
  title?: string
  startTime: number
  endTime: number
  durationMs: number
  apiType: ApiType
  endpoint: string
  baseUrl?: string
  timeout?: number
  bodyText: string
  promptId?: string | null
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
  storeResponseBody: boolean
}

// ── 提示词库：可管理、可搜索、可拖拽排序的请求体来源 ──
interface LlmPrompt {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
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

// 反向推导：从拼接好的端点剥离协议路径后缀还原 baseUrl，用于历史「复用」在老数据（未存 baseUrl 字段）
// 上的兜底；两种剥离方式都对不上就返回 null，调用方保留当前 baseUrl 不变。
function llmBaseUrlFromEndpoint(apiType: ApiType, endpoint: string): string | null {
  const p = LLM_API_PATHS[apiType]
  const e = endpoint.trim().replace(/\/+$/, '')
  if (e.endsWith(p)) return e.slice(0, e.length - p.length)
  const shortSuffix = p.replace(/^\/v1/, '')
  if (shortSuffix && e.endsWith(shortSuffix)) return e.slice(0, e.length - shortSuffix.length)
  return null
}

// 占位符：{{model}}（旧，双花括号）与 ${[model]}（新，方括号内允许可选空白）两种写法并存，
// 均兼容带引号 "..." 和不带引号两种形式。
const MODEL_PLACEHOLDER_RE = /"\{\{model\}\}"|\{\{model\}\}|"\$\{\[\s*model\s*\]\}"|\$\{\[\s*model\s*\]\}/g
function fillModelPlaceholder(text: string, jsonStringLiteral: string): string {
  return text.replace(MODEL_PLACEHOLDER_RE, jsonStringLiteral)
}
function bodyHasModelPlaceholder(text: string): boolean {
  MODEL_PLACEHOLDER_RE.lastIndex = 0
  return MODEL_PLACEHOLDER_RE.test(text)
}
// Body 写了占位符就替换；没写就在顶层自动注入 model 字段，两种写法都能跑
function buildRequestBody(bodyText: string, model: string): Record<string, unknown> {
  if (bodyHasModelPlaceholder(bodyText)) {
    return JSON.parse(fillModelPlaceholder(bodyText, JSON.stringify(model)))
  }
  const obj = JSON.parse(bodyText) as Record<string, unknown>
  return { ...obj, model }
}
// 请求体 JSON 语法校验（占位符替换后再 parse），供左侧预览、提示词编辑器、runBatch() 校验共用。
// 成功返回空字符串，失败返回错误信息。
function validateLlmBodyJson(text: string): string {
  try {
    JSON.parse(fillModelPlaceholder(text, '"__MODEL__"'))
    return ''
  } catch (e) {
    return 'JSON 语法错误：' + ((e as Error)?.message || String(e))
  }
}

// ── 提示词请求体协议自动识别 + 转换 ──
// ApiType（下划线拼写，LLM 批量测试用）与 AiFmt（连字符拼写，AI 格式转换工具用）值域相同、字面量不同，
// 用一张映射表适配，不合并成同一类型（避免牵连 AiConvertTool 及其一整套下游）。
const API_TYPE_TO_AI_FMT: Record<ApiType, AiFmt> = {
  anthropic: 'anthropic',
  openai_chat: 'openai-chat',
  openai_responses: 'openai-responses',
}

// 结构兼容性判定：读取请求体里的结构性字段，判断它跟三种协议里的哪些"结构上说得通"。
// 返回 0~2 个协议（Anthropic/Chat 都要求 messages 存在、Responses 要求 messages 不存在，
// 二者互斥，故最多同时命中 Anthropic 和 Chat 两个，不会三个同时命中）。
function compatiblePromptApiTypes(obj: Record<string, unknown>): ApiType[] {
  const hasMessages = Array.isArray(obj.messages)
  const hasTopSystem = typeof obj.system === 'string' || Array.isArray(obj.system)
  const messagesHasSystemRole = hasMessages && (obj.messages as { role?: unknown }[]).some(m => m?.role === 'system')
  const hasInput = obj.input !== undefined
  const hasInstructions = typeof obj.instructions === 'string'
  const hasMaxOutputTokens = typeof obj.max_output_tokens === 'number'
  const hasMaxCompletionTokens = typeof obj.max_completion_tokens === 'number'
  const hasStreamOptions = typeof obj.stream_options === 'object' && obj.stream_options !== undefined && obj.stream_options !== null

  const systemConflict = hasTopSystem && messagesHasSystemRole // 顶层 system 与 messages 里的 system 消息同时出现，规则冲突

  const anthropicOk = hasMessages && !hasInput && !hasInstructions && !hasMaxOutputTokens
    && !hasMaxCompletionTokens && !hasStreamOptions && !messagesHasSystemRole && !systemConflict
  const chatOk = hasMessages && !hasInput && !hasInstructions && !hasMaxOutputTokens && !hasTopSystem && !systemConflict
  const responsesOk = !hasMessages && !hasTopSystem && !hasMaxCompletionTokens && !hasStreamOptions
    && (hasInput || hasInstructions || hasMaxOutputTokens)

  const out: ApiType[] = []
  if (anthropicOk) out.push('anthropic')
  if (chatOk) out.push('openai_chat')
  if (responsesOk) out.push('openai_responses')
  return out
}

// 单一归约：真正需要发起转换时才用（候选为 0 个→无法识别；候选为 2 个时固定选 anthropic——
// 可证明这种二义性只发生在请求体完全不含 system 信息时，此时后续的有损判定/展平预处理对
// Anthropic 和 Chat 两条分支检查的是同一批 messages[].content，选哪个不影响最终结果）。
function detectPromptApiType(obj: Record<string, unknown>): ApiType | null {
  const c = compatiblePromptApiTypes(obj)
  if (c.length === 0) return null
  if (c.length === 1) return c[0]
  return 'anthropic'
}

// content 是否"纯文本"：字符串本身算，或者数组且每个 block 的 type 都等于约定类型（text / input_text）。
// 其它情况（image/tool_use/tool_result 等非文本 block、混合数组、非字符串非数组如仅 tool_calls 的轮次）一律不算。
function isTextOnlyContent(content: unknown, allowedType: string): boolean {
  if (typeof content === 'string') return true
  if (!Array.isArray(content)) return false
  return content.every(b => b && typeof b === 'object' && (b as { type?: unknown }).type === allowedType)
}

// 有损判定：返回 null 表示可以无损转换，否则返回人类可读的丢失原因，调用方据此直接拒绝转换。
function assessContentLoss(srcApiType: ApiType, obj: Record<string, unknown>): string | null {
  const toolField = ['tools', 'tool_choice', 'functions', 'function_call'].find(f => obj[f] !== undefined)
  if (toolField) return `工具调用相关字段 "${toolField}"（转换逻辑不支持迁移，会被静默丢弃）`

  if (srcApiType === 'anthropic') {
    if (obj.system !== undefined && !isTextOnlyContent(obj.system, 'text')) return '顶层 system 字段中的非纯文本内容块'
    for (const m of (obj.messages as { role?: unknown; content?: unknown }[]) ?? []) {
      if (!isTextOnlyContent(m?.content, 'text')) return `messages 中角色为 "${String(m?.role)}" 的消息使用了非纯文本 content block（如 image / tool_use / tool_result）`
    }
    return null
  }
  if (srcApiType === 'openai_chat') {
    for (const m of (obj.messages as { role?: unknown; content?: unknown }[]) ?? []) {
      if (!isTextOnlyContent(m?.content, 'text')) return `messages 中角色为 "${String(m?.role)}" 的消息使用了非纯文本 content parts（如 image_url / input_audio）`
    }
    return null
  }
  // openai_responses
  const input = obj.input
  if (typeof input === 'string' || input === undefined) return null
  if (Array.isArray(input)) {
    for (const item of input as { role?: unknown; content?: unknown }[]) {
      if (!isTextOnlyContent(item?.content, 'input_text')) return `input 中角色为 "${String(item?.role)}" 的条目使用了非 input_text 内容（如 input_image / input_file）`
    }
  }
  return null
}

// 把纯文本 content block 数组折叠成字符串，供转换前预处理用
function joinTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  return ((content as { text?: unknown }[]) ?? []).map(b => typeof b?.text === 'string' ? b.text : '').join('\n')
}

// 展平预处理：assessContentLoss 判定无损之后才调用。convertFormat 的 anthropic/openai-chat 来源分支
// 对数组 content 处理不正确（会整体 JSON.stringify 或直接透传，而不是提取纯文本），必须先在这里把
// 纯文本 block 数组折叠成字符串再交给它，否则会产出"看似成功实则语义已错"的转换结果。
// openai_responses 来源不需要展平，convertFormat 的对应分支本身处理正确。
function flattenForConversion(srcApiType: ApiType, obj: Record<string, unknown>): Record<string, unknown> {
  if (srcApiType === 'anthropic') {
    return {
      ...obj,
      system: Array.isArray(obj.system) ? joinTextBlocks(obj.system) : obj.system,
      messages: Array.isArray(obj.messages)
        ? (obj.messages as { content?: unknown }[]).map(m => Array.isArray(m?.content) ? { ...m, content: joinTextBlocks(m.content) } : m)
        : obj.messages,
    }
  }
  if (srcApiType === 'openai_chat') {
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? (obj.messages as { content?: unknown }[]).map(m => Array.isArray(m?.content) ? { ...m, content: joinTextBlocks(m.content) } : m)
        : obj.messages,
    }
  }
  return obj
}

// 唯一对外入口：给定提示词原文和目标 API 类型，识别原文协议、按需转换。
// 结果只在运行时使用，从不写回提示词库；识别失败或有损一律拒绝，不输出任何转换结果。
function convertPromptBodyForApiType(bodyText: string, targetApiType: ApiType): { ok: true; body: string } | { ok: false; error: string } {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(fillModelPlaceholder(bodyText, '"__MODEL__"')) as Record<string, unknown>
  } catch (e) {
    // 防御性分支：正常情况下调用方只在 validateLlmBodyJson 通过后才会调用本函数
    return { ok: false, error: '请求体不是合法 JSON：' + ((e as Error)?.message || String(e)) }
  }

  // 先算出"这段请求体到底是哪种协议"的单一归约判断（detectPromptApiType 内部已经处理了
  // 0/1/2 个候选的所有情况），再拿它跟目标协议比较——只有当归约结果就是目标协议本身时，
  // 才是"无需转换、原样透传"，此时不做任何有损检查（因为压根没有发生任何结构重组，
  // image/tool_use 等复杂 content block 原样保留，不存在丢失的问题）。
  // 注意：不能用"结构上是否兼容目标协议"（candidates.includes(targetApiType)）来判断是否透传——
  // 结构兼容只保证顶层字段（messages/system 等）说得通，不代表 content 里的非文本 block
  // 就是该目标协议的原生写法（比如 Anthropic 的 image block 结构和 OpenAI 的 image_url 完全不同，
  // 但顶层 messages 数组本身两边都认，会被误判为"结构兼容"）。
  const srcApiType = detectPromptApiType(obj)
  if (srcApiType === null) {
    return { ok: false, error: `无法识别该提示词请求体所属的 API 协议格式（既不符合 Anthropic、也不符合 OpenAI Chat、也不符合 OpenAI Responses 的结构特征），因此无法自动转换为「${LLM_API_LABELS[targetApiType]}」。请检查请求体结构，或手动调整为该协议对应的格式。` }
  }
  if (srcApiType === targetApiType) {
    return { ok: true, body: bodyText } // 归约结果就是目标协议本身，无需任何转换，原样透传
  }

  const lossReason = assessContentLoss(srcApiType, obj)
  if (lossReason) {
    return { ok: false, error: `识别到该提示词请求体是「${LLM_API_LABELS[srcApiType]}」格式，但其中包含${lossReason}，无法无损转换为「${LLM_API_LABELS[targetApiType]}」，已阻止自动转换。请手动调整请求体，或切换回「${LLM_API_LABELS[srcApiType]}」。` }
  }

  const flatText = JSON.stringify(flattenForConversion(srcApiType, obj))
  const convertedSentinelText = convertFormat(flatText, API_TYPE_TO_AI_FMT[srcApiType], API_TYPE_TO_AI_FMT[targetApiType], false)
  if (convertedSentinelText.startsWith('// JSON 解析失败')) {
    return { ok: false, error: '内部转换异常，请检查请求体格式。' } // 防御性分支，正常不会触发
  }

  const useNewPlaceholder = /\$\{\[\s*model\s*\]\}/.test(bodyText)
  const restoreLiteral = useNewPlaceholder ? '"${[model]}"' : '"{{model}}"'
  const finalBody = convertedSentinelText.split('"__MODEL__"').join(restoreLiteral)
  return { ok: true, body: finalBody }
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

// ── Token / model / 正文提取（SSE 流式）──
// 正文（text）只用于「存储响应体」功能：把各协议的文本增量拼接成完整回复，与 usage/model 提取互不影响。
function makeStreamExtractor(apiType: ApiType) {
  let inTok: number | null = null
  let outTok: number | null = null
  let model: string | null = null
  let text = ''
  return {
    onData(o: any) {
      if (apiType === 'anthropic') {
        if (o?.type === 'message_start' && o.message) {
          if (o.message.usage?.input_tokens != null) inTok = o.message.usage.input_tokens
          if (typeof o.message.model === 'string') model = o.message.model
        }
        if (o?.type === 'message_delta' && o.usage?.output_tokens != null) outTok = o.usage.output_tokens
        if (o?.type === 'content_block_delta' && o.delta?.type === 'text_delta' && typeof o.delta.text === 'string') text += o.delta.text
      } else if (apiType === 'openai_chat') {
        if (typeof o?.model === 'string') model = o.model
        if (o?.usage) {
          if (o.usage.prompt_tokens != null) inTok = o.usage.prompt_tokens
          if (o.usage.completion_tokens != null) outTok = o.usage.completion_tokens
        }
        const delta = o?.choices?.[0]?.delta?.content
        if (typeof delta === 'string') text += delta
      } else {
        if (o?.type === 'response.completed' && o.response) {
          if (typeof o.response.model === 'string') model = o.response.model
          if (o.response.usage?.input_tokens != null) inTok = o.response.usage.input_tokens
          if (o.response.usage?.output_tokens != null) outTok = o.response.usage.output_tokens
        }
        if (o?.type === 'response.output_text.delta' && typeof o.delta === 'string') text += o.delta
      }
    },
    result() { return { inTok, outTok, model, text } },
  }
}

// ── 响应体存储（可选）：单条响应正文超过阈值就截断，避免历史记录把 localStorage 撑爆 ──
const LLM_RESPONSE_BODY_MAX = 20000
function truncateResponseBody(text: string): { body: string; truncated: boolean } {
  if (text.length <= LLM_RESPONSE_BODY_MAX) return { body: text, truncated: false }
  return { body: text.slice(0, LLM_RESPONSE_BODY_MAX), truncated: true }
}
// cfg.storeResponseBody 为真时才写入响应头/正文，关闭时完全不做任何事（不产生多余开销）。
// bodyText 由调用方传入：非流式/错误分支传原始响应文本，流式分支传拼接好的正文增量。
function llmApplyResponseCapture(rec: BatchResult, cfg: LlmBatchCfg, res: Response, bodyText: string) {
  if (!cfg.storeResponseBody) return
  rec.responseHeaders = Object.fromEntries(res.headers.entries())
  const { body, truncated } = truncateResponseBody(bodyText)
  rec.responseBody = body
  rec.responseBodyTruncated = truncated
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
      llmApplyResponseCapture(rec, cfg, res, txt)
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
      llmApplyResponseCapture(rec, cfg, res, r.text)
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
        llmApplyResponseCapture(rec, cfg, res, txt)
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
      llmApplyResponseCapture(rec, cfg, res, txt)
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
function llmReportExportName(report: BatchReport, ext: string): string {
  const base = report.title?.trim()
    ? report.title.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    : 'report'
  return `${base}_${llmTsName(report.startTime)}.${ext}`
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
  const rows: (string | number)[][] = [['序号', '模型', '状态', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时(ms)', '错误信息', '响应体']]
  report.results.forEach(r => rows.push([
    r.seq, r.model, r.status === 'ok' ? '成功' : '失败',
    r.inputTokens ?? '-', r.outputTokens ?? '-',
    (r.inputTokens != null && r.outputTokens != null) ? r.inputTokens + r.outputTokens : '-',
    r.tFirst ?? '-', r.elapsed ?? '-', r.error ?? '',
    r.responseBody ?? '',
  ]))
  return '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')
}

// ── 报告导出：图片 / PDF / HTML ──

function llmDownloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

function svgToPngDataUrl(liveSvg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = liveSvg.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height))
    const liveNodes = [liveSvg, ...Array.from(liveSvg.querySelectorAll<SVGElement>('*'))]
    const clone = liveSvg.cloneNode(true) as SVGSVGElement
    const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))]
    liveNodes.forEach((el, i) => {
      const cs = getComputedStyle(el)
      if (cs.fill && cs.fill !== 'none') cloneNodes[i].setAttribute('fill', cs.fill)
      if (cs.stroke && cs.stroke !== 'none') cloneNodes[i].setAttribute('stroke', cs.stroke)
    })
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(2, window.devicePixelRatio || 1)
      const canvas = document.createElement('canvas')
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

function withExpandedScrollAreas<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-export-scroll]'))
  const saved = els.map(el => ({ maxHeight: el.style.maxHeight, overflowY: el.style.overflowY, overflowX: el.style.overflowX }))
  els.forEach(el => { el.style.maxHeight = 'none'; el.style.overflowY = 'visible'; el.style.overflowX = 'visible' })
  return fn().finally(() => els.forEach((el, i) => { el.style.maxHeight = saved[i].maxHeight; el.style.overflowY = saved[i].overflowY; el.style.overflowX = saved[i].overflowX }))
}

async function captureReportCanvas(rootEl: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return withExpandedScrollAreas(rootEl, async () => {
    const chartRoots = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-chart-root] svg')) as SVGSVGElement[]
    const restores: (() => void)[] = []
    for (const svg of chartRoots) {
      try {
        const dataUrl = await svgToPngDataUrl(svg)
        const img = document.createElement('img')
        img.src = dataUrl
        img.style.width = svg.getBoundingClientRect().width + 'px'
        img.style.height = svg.getBoundingClientRect().height + 'px'
        svg.replaceWith(img)
        restores.push(() => img.replaceWith(svg))
      } catch { /* 图表转换失败时保留原 SVG，html2canvas 兜底 */ }
    }
    try {
      return await html2canvas(rootEl, {
        backgroundColor: getComputedStyle(rootEl).getPropertyValue('--bg').trim() || '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
      })
    } finally {
      restores.forEach(r => r())
    }
  })
}

async function exportReportAsImage(rootEl: HTMLElement, filename: string) {
  try {
    const canvas = await captureReportCanvas(rootEl)
    canvas.toBlob(blob => { if (blob) llmDownloadBlob(filename, blob) }, 'image/png')
  } catch {
    window.alert('导出图片失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

async function exportReportAsPdf(rootEl: HTMLElement, filename: string) {
  try {
    const { jsPDF } = await import('jspdf')
    const canvas = await captureReportCanvas(rootEl)
    const pxToMm = (px: number) => px * 0.264583
    const w = pxToMm(canvas.width), h = pxToMm(canvas.height)
    const doc = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'mm', format: [w, h] })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    doc.save(filename)
  } catch {
    window.alert('导出 PDF 失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

async function exportReportAsHtml(rootEl: HTMLElement, filename: string) {
  try {
    await withExpandedScrollAreas(rootEl, async () => {
      const clone = rootEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-html2canvas-ignore]').forEach(el => el.remove())
      const liveSvgs = Array.from(rootEl.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
      const cloneSvgs = Array.from(clone.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
      for (let i = 0; i < liveSvgs.length; i++) {
        try {
          const dataUrl = await svgToPngDataUrl(liveSvgs[i])
          const img = document.createElement('img')
          img.src = dataUrl
          cloneSvgs[i].replaceWith(img)
        } catch { /* 图表转换失败保留原样 */ }
      }
      const varNames = ['bg','s1','s2','border','borderHard','text','t2','t3','accent','accentFg','accentSub','accentSubHard','primary','primaryFg','sidebar','code','shadow','shadowMd','ok','okBg','err','errBg','warn','warnBg','jKey','jStr','jNum','jBool','jNull','inputBg','inputBorder']
      const cs = getComputedStyle(rootEl)
      const varsCss = ':root{' + varNames.map(n => `--${n}:${cs.getPropertyValue('--' + n).trim()}`).join(';') + '}'
      let appCss = ''
      for (const sheet of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sheet.cssRules)) appCss += rule.cssText + '\n' } catch { /* 跨域表跳过 */ }
      }
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><title>LLM 批量测试报告</title><style>${varsCss}\nbody{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}\n${appCss}</style></head><body>${clone.outerHTML}</body></html>`
      llmDownload(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch {
    window.alert('导出 HTML 失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

// ── 持久化：配置、加密后的 API Key、历史报告（最多 20 条）、提示词库 ──
const LLM_CFG_KEY = 'llmbatch-config'
const LLM_KEY_STORAGE_KEY = 'llmbatch-key'
const LLM_HIST_KEY = 'llmbatch-history'
const LLM_HIST_MAX = 20
const LLM_PROMPTS_KEY = 'llmbatch-prompts'

interface LlmBatchCfgStored {
  apiType?: ApiType
  baseUrl?: string
  timeout?: string
  models?: string
  n?: string
  c?: string
  body?: string                 // 旧字段：请求体已迁移到 llmbatch-prompts，这里仅保留供一次性迁移读取，不再写入
  promptId?: string             // 上次选中的提示词 id
  storeResponseBody?: boolean   // 是否存储响应体，默认 true
  testTitle?: string            // 测试标题
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
function renameLlmHistoryItem(id: string, title: string): BatchReport[] {
  const list = loadLlmHistory().map(r => r.id === id ? { ...r, title } : r)
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

// ── 提示词库持久化：结构/读写模式对齐上面的历史报告（loadLlmHistory/saveLlmHistory）──
function loadLlmPromptsRaw(): LlmPrompt[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LLM_PROMPTS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((p): p is LlmPrompt =>
      p && typeof p === 'object' && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.body === 'string')
  } catch { return [] }
}
function saveLlmPrompts(list: LlmPrompt[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LLM_PROMPTS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
function makeLlmPrompt(title: string, body: string): LlmPrompt {
  const now = Date.now()
  return { id: 'p' + now + '_' + Math.random().toString(36).slice(2, 7), title, body, createdAt: now, updatedAt: now }
}
// 首次加载时的迁移/兜底种子：老版本的请求体存在 llmbatch-config.body 里，迁移成一条提示词；
// 全新用户则用 DEFAULT_LLM_BODY 种一条示例，保证下拉框永远至少有一个选项可用。
// 必须是同步函数（用作 useState 懒初始化器），保证首帧渲染前 prompts 已就绪。
function loadOrMigrateLlmPrompts(): LlmPrompt[] {
  const existing = loadLlmPromptsRaw()
  if (existing.length > 0) return existing
  const legacyBody = loadLlmCfg().body
  const seed = legacyBody && legacyBody.trim()
    ? makeLlmPrompt('默认提示词', legacyBody)
    : makeLlmPrompt('示例提示词', DEFAULT_LLM_BODY)
  saveLlmPrompts([seed])
  return [seed]
}

// 表格里的长文本单元格（模型名等）：单行截断 + 原生 title 提示，鼠标悬浮可见完整内容
function TruncatedCell({ text, maxWidth = 160, color }: { text: string; maxWidth?: number; color?: string }) {
  return (
    <span className="inline-block overflow-hidden align-bottom" style={{ maxWidth, color, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={text}>
      {text}
    </span>
  )
}

function Tooltip({ label, children, side = 'top' }: {
  label: string; children: React.ReactElement; side?: 'top' | 'bottom'
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos(side === 'top'
      ? { top: r.top - 8, left: r.left + r.width / 2 }
      : { top: r.bottom + 8, left: r.left + r.width / 2 })
  }
  return (
    <span ref={ref} className="inline-flex" onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children}
      {pos && (
        <span className="fixed z-[70] px-2 py-1 rounded-lg text-[11px] font-medium pointer-events-none tt-enter"
          style={{ top: pos.top, left: pos.left, transform: side === 'top' ? 'translate(-50%,-100%)' : 'translate(-50%,0)', background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </span>
  )
}

function IconBtn({ icon, tooltip, onClick, danger }: {
  icon: React.ReactNode; tooltip: string; onClick: () => void; danger?: boolean
}) {
  return (
    <Tooltip label={tooltip}>
      <button onClick={onClick} aria-label={tooltip}
        className="rounded-lg p-1.5 border-0 outline-none cursor-pointer transition-colors"
        style={{ background: 'transparent', color: danger ? 'var(--err)' : 'var(--t2)' }}
        onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'var(--errBg)' : 'var(--s2)' }}
        onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
        {icon}
      </button>
    </Tooltip>
  )
}

function InlineEditableTitle({ value, placeholder, onSave }: {
  value: string; placeholder: string; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span className="text-sm font-semibold cursor-text" style={{ color: 'var(--text)', borderBottom: '1px dashed transparent' }}
        onClick={() => { setDraft(value); setEditing(true) }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--t3)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent'}>
        {value.trim() || placeholder}
      </span>
    )
  }
  const commit = () => { setEditing(false); const t = draft.trim(); if (t !== value.trim()) onSave(t) }
  return (
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="text-sm font-semibold bg-transparent outline-none"
      style={{ color: 'var(--text)', border: 'none', borderBottom: '1px solid var(--accent)' }} />
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
    <div data-chart-root className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
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
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
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

// ── 对比模式组合图表（对比双方的输入/输出放到同一图表）──
function LlmCompareChart({ reportA, reportB, model, field, title }: {
  reportA: BatchReport; reportB: BatchReport; model: string; field: 'inputTokens' | 'outputTokens'; title: string
}) {
  const rsA = useMemo(() => reportA.results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx), [reportA, model])
  const rsB = useMemo(() => reportB.results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx), [reportB, model])
  const maxLen = Math.max(rsA.length, rsB.length)
  const [chartType, setChartType] = useState<'bar' | 'line'>(maxLen > 30 ? 'line' : 'bar')
  const labelA = reportA.title?.trim() || llmFmtTime(reportA.startTime)
  const labelB = reportB.title?.trim() || llmFmtTime(reportB.startTime)
  const chartData = useMemo(() => {
    const idxs = new Set<number>()
    rsA.forEach(r => idxs.add(r.localIdx))
    rsB.forEach(r => idxs.add(r.localIdx))
    const sorted = [...idxs].sort((a, b) => a - b)
    return sorted.map(idx => {
      const ra = rsA.find(r => r.localIdx === idx)
      const rb = rsB.find(r => r.localIdx === idx)
      const aOk = ra?.status === 'ok' && ra[field] != null
      const bOk = rb?.status === 'ok' && rb[field] != null
      return {
        label: '#' + idx,
        reportA: aOk ? (ra[field] as number) : 0,
        reportB: bOk ? (rb[field] as number) : 0,
        aOk,
        bOk,
        aDisplay: aOk ? String(ra[field] ?? '-') : '失败',
        bDisplay: bOk ? String(rb[field] ?? '-') : '失败',
      }
    })
  }, [rsA, rsB, field])
  return (
    <div data-chart-root className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{model}</span>
          <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
          <button onClick={() => setChartType('bar')}
            className="px-2 py-0.5 text-[11px] font-medium rounded-md border-0 cursor-pointer outline-none"
            style={{ background: chartType === 'bar' ? 'var(--bg)' : 'transparent', color: chartType === 'bar' ? 'var(--text)' : 'var(--t2)', boxShadow: chartType === 'bar' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>柱状图</button>
          <button onClick={() => setChartType('line')}
            className="px-2 py-0.5 text-[11px] font-medium rounded-md border-0 cursor-pointer outline-none"
            style={{ background: chartType === 'line' ? 'var(--bg)' : 'transparent', color: chartType === 'line' ? 'var(--text)' : 'var(--t2)', boxShadow: chartType === 'line' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>折线图</button>
        </div>
      </div>
      <div style={{ height: 220, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--s1)' }}
                contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'var(--t2)' }}
                formatter={(value: number, name: string) => [value + ' tok', name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value === 'reportA' ? labelA : labelB}</span>}
              />
              <Bar dataKey="reportA" name="reportA" radius={[4, 4, 0, 0]} isAnimationActive={false} fill="var(--accent)" />
              <Bar dataKey="reportB" name="reportB" radius={[4, 4, 0, 0]} isAnimationActive={false} fill="var(--ok)" />
            </BarChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'var(--t2)' }}
                formatter={(value: number, name: string) => [value + ' tok', name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value === 'reportA' ? labelA : labelB}</span>}
              />
              <Line type="monotone" dataKey="reportA" name="reportA" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="reportB" name="reportB" stroke="var(--ok)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ok)', strokeWidth: 0 }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 报告渲染（当前报告 / 历史「查看」共用）──
function LlmExportMenu({ report, rootRef }: { report: BatchReport; rootRef: React.RefObject<HTMLDivElement | null> }) {
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

  return (
    <div ref={ref} className="relative" data-html2canvas-ignore="true">
      <Btn small variant="ghost" onClick={() => setOpen(o => !o)}>导出 ▾</Btn>
      {open && (
        <div className="absolute right-0 z-50 rounded-2xl overflow-hidden" style={{ top: 'calc(100% + 5px)', background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', padding: 4, minWidth: 140 }}>
          <button onClick={() => { llmDownload(llmReportExportName(report, 'json'), JSON.stringify(report, null, 2), 'application/json'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 JSON</button>
          <button onClick={() => { llmDownload(llmReportExportName(report, 'csv'), reportToCsv(report), 'text/csv;charset=utf-8'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 CSV</button>
          <button onClick={() => { rootRef.current && exportReportAsImage(rootRef.current, llmReportExportName(report, 'png')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出图片</button>
          <button onClick={() => { rootRef.current && exportReportAsPdf(rootRef.current, llmReportExportName(report, 'pdf')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 PDF</button>
          <button onClick={() => { rootRef.current && exportReportAsHtml(rootRef.current, llmReportExportName(report, 'html')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 HTML</button>
        </div>
      )}
    </div>
  )
}

function LlmBatchReportView({ report, apiKey, hideCharts }: { report: BatchReport; apiKey: string; hideCharts?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [viewingModel, setViewingModel] = useState<string | null>(null)
  const [viewingResult, setViewingResult] = useState<BatchResult | null>(null)
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
    <div ref={rootRef} className="flex flex-col gap-5">
      {/* 概况 */}
      <div className="rounded-2xl flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5 text-sm" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
        <b style={{ color: 'var(--text)' }}>{report.title?.trim() || llmFmtTime(report.startTime)}</b>
        <span style={{ color: 'var(--t3)' }}>{LLM_API_LABELS[report.apiType]}</span>
        <span style={{ color: 'var(--t3)' }}>总耗时 <strong style={{ color: 'var(--text)' }}>{llmFmtDur(report.durationMs)}</strong></span>
        <span style={{ color: 'var(--t3)' }}>总请求 <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{report.total}</strong></span>
        <span>
          <span style={{ color: 'var(--t3)' }}>成功 </span><strong className="tabular-nums" style={{ color: 'var(--ok)' }}>{report.success}</strong>
          <span style={{ color: 'var(--t3)' }}> / 失败 </span><strong className="tabular-nums" style={{ color: report.fail ? 'var(--err)' : 'var(--t2)' }}>{report.fail}</strong>
        </span>
        {report.stopped && <Badge color="warn">⚠ 已手动停止</Badge>}
        <div className="ml-auto flex gap-2">
          <LlmExportMenu report={report} rootRef={rootRef} />
        </div>
        <div className="w-full text-[11px]" style={{ color: 'var(--t3)' }}>{llmFmtTime(report.startTime)} → {llmFmtTime(report.endTime)}</div>
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
        {!hideCharts && report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).length > 0 && (
          <div className="flex flex-col gap-4">
            {report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).map(m => (
              <LlmTokenChart key={m} model={m} results={report.results} field="inputTokens" title="输入 Token 分布（不一致）" />
            ))}
          </div>
        )}
      </div>

      {!hideCharts && (
        <div>
          <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>② 输出 Token 波动</h3>
          <div className="flex flex-col gap-4">
            {report.models.map(m => (
              <LlmTokenChart key={m} model={m} results={report.results} field="outputTokens" title="输出 Token 分布" />
            ))}
          </div>
        </div>
      )}

      {/* ③ 各模型汇总统计 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>
          ③ 各模型汇总统计 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>（均值保留 1 位小数，仅统计成功请求）</span>
        </h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div data-export-scroll className="overflow-x-auto">
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
          <div data-export-scroll className="overflow-x-auto" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="w-full text-sm min-w-[920px]">
              <thead style={{ background: 'var(--s1)', position: 'sticky', top: 0 }}>
                <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                  {['序号', '模型', '状态', '返回模型', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时', '错误信息', '响应'].map(h => (
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
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.responseBody != null
                        ? <Btn small variant="ghost" onClick={() => setViewingResult(r)}>响应</Btn>
                        : <span className="text-xs" style={{ color: 'var(--t3)' }}>未存储响应体</span>}
                    </td>
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
              <Btn small variant="ghost" onClick={() => setViewingModel(null)}>✕</Btn>
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>请求体 JSON</Label>
                  {viewingBodyObj != null && <CopyBtn text={JSON.stringify(viewingBodyObj, null, 2)} />}
                </div>
                <div className="rounded-xl flex flex-col overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', height: '30vh' }}>
                  {viewingBodyObj != null
                    ? <ReadOnlyJsonTree text={JSON.stringify(viewingBodyObj, null, 2)} />
                    : <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--t3)' }}>（请求体解析失败）</div>}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>cURL 命令</Label>
                  {viewingBodyObj != null && <CopyBtn text={buildCurlCommand(report, viewingBodyObj, apiKey)} />}
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '30vh', wordBreak: 'break-all' }}>
                  {viewingBodyObj != null ? buildCurlCommand(report, viewingBodyObj, apiKey) : '（请求体解析失败）'}
                </pre>
                <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ cURL 命令含明文 API Key，注意妥善保管，不要粘贴到公开场合</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 查看响应头 / 响应正文 */}
      {viewingResult != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewingResult(null)}>
          <div className="rounded-2xl p-5 w-full flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', maxWidth: 640, maxHeight: '82vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <b className="text-sm" style={{ color: 'var(--text)' }}>[#{viewingResult.seq} {viewingResult.model}] 响应</b>
              <Btn small variant="ghost" onClick={() => setViewingResult(null)}>✕</Btn>
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>响应头</Label>
                  <CopyBtn text={JSON.stringify(viewingResult.responseHeaders ?? {}, null, 2)} />
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '20vh' }}>
                  {JSON.stringify(viewingResult.responseHeaders ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>响应正文{viewingResult.responseBodyTruncated ? `（已截断，超过 ${LLM_RESPONSE_BODY_MAX} 字符）` : ''}</Label>
                  <CopyBtn text={viewingResult.responseBody ?? ''} />
                </div>
                <div className="rounded-xl flex flex-col overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', height: '40vh' }}>
                  <ReadOnlyJsonTree text={viewingResult.responseBody ?? ''} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 可拖拽排序的单条提示词行。必须是模块级顶层函数组件（不能嵌套定义在 LlmPromptsPane 内部），
// 因为 useSortable 依赖跨渲染保持稳定的组件标识，嵌套定义会导致每次渲染都创建新的组件类型、拖拽状态丢失。
function SortablePromptRow({ prompt, active, onSelect, onDelete }: {
  prompt: LlmPrompt; active: boolean; onSelect: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prompt.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.6 : 1,
    background: active ? 'var(--accentSubHard)' : 'transparent',
  }
  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}
      className="flex items-center gap-2 rounded-xl px-2.5 py-2 cursor-pointer transition-all duration-100"
    >
      <div
        {...attributes} {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ color: 'var(--t3)', fontSize: 14, lineHeight: 1, padding: '2px 2px' }}
        onClick={e => e.stopPropagation()}
      >⠿</div>
      <div className="flex-1 min-w-0">
        <TruncatedCell text={prompt.title || '（未命名）'} maxWidth={160} color={active ? 'var(--accent)' : 'var(--text)'} />
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{llmFmtTime(prompt.updatedAt)}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="flex-shrink-0 rounded-lg border-0 outline-none cursor-pointer px-1.5 py-1 text-xs"
        style={{ background: 'transparent', color: 'var(--t3)' }}
      >✕</button>
    </div>
  )
}

function LlmPromptsPane({ prompts, onChange }: {
  prompts: LlmPrompt[]; onChange: (next: LlmPrompt[]) => void
}) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(prompts[0]?.id ?? null)
  const [expandedBody, setExpandedBody] = useState<string | null>(null)
  const editing = prompts.find(p => p.id === editingId) ?? null
  const editingBodyErr = editing ? validateLlmBodyJson(editing.body) : ''
  const filtered = prompts.filter(p => p.title.toLowerCase().includes(search.trim().toLowerCase()))
  const searching = search.trim() !== ''

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const updateEditing = (patch: Partial<Pick<LlmPrompt, 'title' | 'body'>>) => {
    if (!editingId) return
    onChange(prompts.map(p => p.id === editingId ? { ...p, ...patch, updatedAt: Date.now() } : p))
  }

  const formatEditingBody = () => {
    if (!editing) return
    const fmt = formatJsonWithPlaceholders(editing.body)
    if (fmt.ok) updateEditing({ body: fmt.text })
  }

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart, selectionEnd, value } = ta
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
    updateEditing({ body: next })
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = selectionStart + 2
    })
  }

  const createPrompt = () => {
    const np = makeLlmPrompt('未命名提示词', DEFAULT_LLM_BODY)
    onChange([...prompts, np])
    setEditingId(np.id)
    setSearch('')
  }

  const deletePrompt = (id: string) => {
    if (!window.confirm('确认删除该条提示词？此操作不可恢复。')) return
    const next = prompts.filter(p => p.id !== id)
    onChange(next)
    if (editingId === id) setEditingId(next[0]?.id ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const oldIdx = prompts.findIndex(p => p.id === e.active.id)
    const newIdx = prompts.findIndex(p => p.id === e.over!.id)
    if (oldIdx < 0 || newIdx < 0) return
    onChange(arrayMove(prompts, oldIdx, newIdx))
  }

  return (
    <div className="flex h-full">
      {/* 左：搜索 + 可拖拽排序的提示词列表 */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-2.5 p-4 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--t3)' }}>共 {prompts.length} 条</span>
          <Btn small variant="primary" onClick={createPrompt}>+ 新建提示词</Btn>
        </div>
        <CustomInput value={search} onChange={setSearch} placeholder="搜索提示词标题…" />
        {searching && <p className="text-[11px]" style={{ color: 'var(--t3)' }}>搜索时暂不支持拖拽排序，清空搜索后可拖拽</p>}
        {filtered.length === 0 ? (
          <p className="text-xs mt-2" style={{ color: 'var(--t3)' }}>{prompts.length === 0 ? '还没有提示词，点击上方新建' : '无匹配结果'}</p>
        ) : searching ? (
          <div className="flex flex-col gap-1">
            {filtered.map(p => (
              <SortablePromptRow key={p.id} prompt={p} active={p.id === editingId}
                onSelect={() => setEditingId(p.id)} onDelete={() => deletePrompt(p.id)} />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={prompts.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {prompts.map(p => (
                  <SortablePromptRow key={p.id} prompt={p} active={p.id === editingId}
                    onSelect={() => setEditingId(p.id)} onDelete={() => deletePrompt(p.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 右：编辑区，编辑即时保存 */}
      <div className="flex-1 flex flex-col p-4 min-h-0">
        {editing ? (
          <>
            <Label className="block mb-1.5">标题</Label>
            <CustomInput value={editing.title} onChange={v => updateEditing({ title: v })} className="mb-3" />
            <div className="flex items-center justify-between mb-1.5">
              <Label>请求体 JSON（占位符：{'{{model}}'} 或 {'${[model]}'}）</Label>
              <div className="flex items-center gap-1">
                <button onClick={formatEditingBody}
                  className="rounded-lg px-2 py-1 border-0 cursor-pointer outline-none text-xs"
                  style={{ background: 'transparent', color: 'var(--t2)' }}
                  onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                  onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)' }}>格式化</button>
                {editing && <button onClick={() => setExpandedBody(editing.body)}
                  className="rounded-lg p-1 border-0 cursor-pointer outline-none flex items-center gap-1 text-xs"
                  style={{ background: 'transparent', color: 'var(--t2)' }}
                  onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                  onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)' }}><IconExpand /> 展开查看</button>}
              </div>
            </div>
            <CustomTextarea value={editing.body} onChange={v => updateEditing({ body: v })} onKeyDown={handleBodyKeyDown} mono stretch className="flex-1"
              style={{ minHeight: 0, ...(editingBodyErr ? { border: '1px solid var(--err)', boxShadow: '0 0 0 3px var(--errBg)' } : {}) }} />
            {editingBodyErr && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{editingBodyErr}</p>}
            <div className="flex gap-2 mt-3 flex-shrink-0">
              <Btn small variant="danger" onClick={() => deletePrompt(editing.id)}>删除该提示词</Btn>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--t3)' }}>
            <p className="text-sm">选择或新建一个提示词开始编辑</p>
          </div>
        )}
      </div>
      {expandedBody != null && editing && (
        <LlmPromptEditorModal
          title="编辑请求体 JSON"
          initial={expandedBody}
          onSave={body => { updateEditing({ body }); setExpandedBody(null) }}
          onClose={() => setExpandedBody(null)}
        />
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
  // 提示词库：请求体来源。prompts 是单一数据源，selectedPromptId 是本次批量测试实际使用的那条。
  const [prompts, setPrompts] = useState<LlmPrompt[]>(() => loadOrMigrateLlmPrompts())
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(() => loadLlmCfg().promptId ?? null)
  const [storeResponseBody, setStoreResponseBody] = useState(() => loadLlmCfg().storeResponseBody ?? true)
  const [testTitle, setTestTitle] = useState(() => loadLlmCfg().testTitle ?? '')
  const [reuseNotice, setReuseNotice] = useState('')

  // 选中项失效（首次加载时持久化的 id 已不存在 / 当前选中的提示词被删除 / prompts 变空）时自动回退到第一条
  useEffect(() => {
    if (selectedPromptId != null && prompts.some(p => p.id === selectedPromptId)) return
    setSelectedPromptId(prompts[0]?.id ?? null)
  }, [prompts, selectedPromptId])

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId) ?? null
  const promptBodyErr = selectedPrompt ? validateLlmBodyJson(selectedPrompt.body) : ''

  // 根据当前 API 类型自动识别提示词请求体协议并按需转换：级联在 promptBodyErr 之后
  // （语法都不对就不跑识别，交给 promptBodyErr 展示），只在运行时生效，绝不写回提示词库。
  const convertedBody = useMemo(() => {
    if (!selectedPrompt) return null
    if (promptBodyErr) return null
    return convertPromptBodyForApiType(selectedPrompt.body, apiType)
  }, [selectedPrompt?.body, apiType, promptBodyErr])

  useEffect(() => {
    saveLlmCfg({ apiType, baseUrl, timeout: timeoutSec, models: modelListText, n: nReq, c: concurrency, promptId: selectedPromptId ?? undefined, storeResponseBody, testTitle })
  }, [apiType, baseUrl, timeoutSec, modelListText, nReq, concurrency, selectedPromptId, storeResponseBody])

  useEffect(() => { saveLlmPrompts(prompts) }, [prompts])

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

  // ── 运行状态 ──
  const [pane, setPane] = useState<'live' | 'report' | 'history' | 'prompts' | 'compare'>('live')
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
  const [lastRunReportId, setLastRunReportId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [histNotice, setHistNotice] = useState('')
  const [jsonViewerBody, setJsonViewerBody] = useState<{ body: string; model: string } | null>(null)

  const toggleCompare = (id: string) => setCompareIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 2 ? prev : [...prev, id]))

  const viewHistoryReport = (rep: BatchReport) => {
    setReport(rep)
    setLastRunReportId(rep.id)
    setPane('report')
  }

  const runBatch = async () => {
    setStartErr('')
    const errs: string[] = []
    let finalBodyText: string | null = null
    if (!selectedPrompt) {
      errs.push('请先选择一个提示词作为请求体来源。')
    } else if (promptBodyErr) {
      errs.push('提示词请求体不是合法 JSON：' + promptBodyErr)
    } else if (!convertedBody || !convertedBody.ok) {
      errs.push(convertedBody ? convertedBody.error : '请求体协议识别失败，请检查请求体内容。')
    } else {
      finalBodyText = convertedBody.body
    }
    const models = parseModelList(modelListText)
    if (models.length === 0) errs.push('模型列表不能为空。')
    if (!apiKey.trim()) errs.push('API Key 不能为空。')
    if (!baseUrl.trim()) errs.push('Base URL 不能为空。')
    const N = Math.max(1, parseInt(nReq, 10) || 1)
    const C = Math.max(1, parseInt(concurrency, 10) || 1)
    const timeoutNum = Math.max(1, parseFloat(timeoutSec) || 120)
    if (errs.length) { setStartErr(errs.join('\n')); return }

    const cfg: LlmBatchCfg = { apiType, endpoint: llmEndpointOf(apiType, baseUrl), apiKey: apiKey.trim(), timeout: timeoutNum, bodyText: finalBodyText!, storeResponseBody }

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
      title: testTitle.trim() || undefined,
      startTime, endTime, durationMs: endTime - startTime,
      apiType, endpoint: cfg.endpoint, baseUrl: baseUrl.trim(), timeout: timeoutNum,
      bodyText: cfg.bodyText, promptId: selectedPromptId ?? null, models, n: N, c: C, stopped: wasStopped,
      total: finalResults.length,
      success: finalResults.filter(r => r.status === 'ok').length,
      fail: finalResults.filter(r => r.status === 'error').length,
      results: finalResults,
    }
    const { list, dropped } = saveLlmHistory(rep)
    setHistory(list)
    setHistNotice(dropped ? '存储空间有限，已自动删除最早的历史报告为新报告腾出空间。' : '')
    setReport(rep)
    setLastRunReportId(rep.id)
    setPane('report')
  }

  const stopBatch = () => {
    stopRef.current = true
    setStopping(true)
  }

  // 历史「复用」：把某条历史报告的配置回填到左侧面板。API Key 从不回填（历史本来就不存）。
  const reuseHistoryReport = (rep: BatchReport) => {
    setApiType(rep.apiType)
    const derivedBase = rep.baseUrl ?? llmBaseUrlFromEndpoint(rep.apiType, rep.endpoint)
    if (derivedBase) setBaseUrl(derivedBase)
    if (rep.timeout != null) setTimeoutSec(String(rep.timeout))
    setModelListText(rep.models.join('\n'))
    setNReq(String(rep.n))
    setConcurrency(String(rep.c))
    setTestTitle(rep.title ?? '')

    let targetId = rep.promptId && prompts.some(p => p.id === rep.promptId) ? rep.promptId : null
    if (!targetId) {
      const np = makeLlmPrompt(`复用于 ${llmFmtTime(rep.startTime)}`, rep.bodyText)
      setPrompts(prev => [...prev, np])
      targetId = np.id
    }
    setSelectedPromptId(targetId)

    // 让「实时」面板真正回到空状态，而不是残留上一次运行的日志/报告
    setResults([])
    setLiveLog([])
    setReport(null)
    setPane('live')

    setReuseNotice(`已从「${llmFmtTime(rep.startTime)}」的历史报告回填配置到左侧面板。`)
    setTimeout(() => setReuseNotice(''), 4000)
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
            : <Btn variant="primary" onClick={runBatch} disabled={!apiKey.trim() || !baseUrl.trim() || prompts.length === 0 || (convertedBody !== null && !convertedBody.ok)}>▶ 开始批量请求</Btn>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧配置栏 */}
        <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
          <div>
            <Label className="block mb-1.5">测试标题（可选）</Label>
            <CustomInput value={testTitle} onChange={setTestTitle} placeholder="例如：claude-3.5 vs haiku 计费核查" />
          </div>
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

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">模型列表（每行一个，或逗号分隔）</Label>
            <CustomTextarea value={modelListText} onChange={setModelListText} mono rows={3}
              placeholder={'claude-3-5-sonnet-20241022\nclaude-3-haiku-20240307'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="block mb-1.5">每模型次数 N</Label><CustomInput value={nReq} onChange={setNReq} type="number" placeholder="5" /></div>
            <div><Label className="block mb-1.5">全局并发数 C</Label><CustomInput value={concurrency} onChange={setConcurrency} type="number" placeholder="3" /></div>
          </div>
          <div>
            <Toggle value={storeResponseBody} onChange={setStoreResponseBody} label="存储响应体" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">提示词（请求体来源）</Label>
            {prompts.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--err)' }}>⚠ 还没有任何提示词，请切换到右侧「提示词」标签页新建一条。</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect value={selectedPromptId} onChange={setSelectedPromptId}
                      options={prompts.map(p => ({ value: p.id, label: p.title || '（未命名）' }))}
                      placeholder="选择一个提示词…" />
                  </div>
                  {selectedPrompt && (
                    <button onClick={() => {
                      const firstModel = parseModelList(modelListText)[0] || ''
                      const body = firstModel && bodyHasModelPlaceholder(selectedPrompt.body)
                        ? fillModelPlaceholder(selectedPrompt.body, JSON.stringify(firstModel))
                        : selectedPrompt.body
                      setJsonViewerBody({ body, model: firstModel })
                    }}
                      className="rounded-lg p-1.5 border-0 outline-none cursor-pointer flex-shrink-0"
                      style={{ background: 'transparent', color: 'var(--t2)' }}
                      onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--accentSub)' }}
                      onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                      title="查看完整请求体"><IconExpand /></button>
                  )}
                </div>
                {!selectedPromptId && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请选择一个提示词作为请求体来源。</p>}
                {promptBodyErr && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{promptBodyErr}</p>}
                {convertedBody && !convertedBody.ok && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{convertedBody.error}</p>}
              </>
            )}
          </div>
          {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
        </div>

        {/* 右侧结果区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane === 'compare' ? 'history' : pane} onChange={v => setPane(v as 'live' | 'report' | 'history' | 'prompts')} options={[
              { value: 'live', label: '实时' },
              { value: 'report', label: '报告' },
              { value: 'history', label: `历史 (${history.length})` },
              { value: 'prompts', label: `提示词 (${prompts.length})` },
            ]} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {pane === 'live' && (
              <div className="flex flex-col">
                {reuseNotice && <p className="px-6 pt-3 text-xs" style={{ color: 'var(--accent)' }}>{reuseNotice}</p>}
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
                {report ? (
                  <>
                    {history.length > 0 && report.id !== lastRunReportId && (
                      <div className="mb-3 flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
                        正在查看历史报告{report.title?.trim() ? `「${report.title.trim()}」` : ''}。
                        {lastRunReportId && <button className="underline cursor-pointer border-0 bg-transparent" style={{ color: 'var(--accent)' }} onClick={() => setReport(history.find(h => h.id === lastRunReportId) ?? null)}>返回最近一次运行结果</button>}
                      </div>
                    )}
                    <LlmBatchReportView report={report} apiKey={apiKey} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">还没有已完成的测试报告。</p>
                  </div>
                )}
              </div>
            )}

            {pane === 'compare' && compareIds.length === 2 && (
              <div className="p-5 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <Btn small variant="ghost" onClick={() => setPane('history')}>← 返回历史列表</Btn>
                  <b style={{ color: 'var(--text)' }}>历史报告对比</b>
                </div>
                {(() => {
                  const a = history.find(h => h.id === compareIds[0])
                  const b = history.find(h => h.id === compareIds[1])
                  if (!a || !b) return null
                  const metrics: { key: string; label: string; get: (r: BatchReport) => number; fmt: (v: number) => string; better?: 'higher' | 'lower' }[] = [
                    { key: 'total', label: '总请求数', get: r => r.total, fmt: v => String(v) },
                    { key: 'successRate', label: '成功率', get: r => r.total ? (r.success / r.total * 100) : 0, fmt: v => v.toFixed(1) + '%', better: 'higher' },
                    { key: 'fail', label: '失败数', get: r => r.fail, fmt: v => String(v), better: 'lower' },
                    { key: 'duration', label: '总耗时', get: r => r.durationMs, fmt: v => llmFmtDur(v), better: 'lower' },
                    { key: 'avgElapsed', label: '平均单请求耗时', get: r => { const v = r.results.map(x => x.elapsed).filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => (v / 1000).toFixed(2) + 's', better: 'lower' },
                    { key: 'avgInput', label: '输入 Token 均值', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.inputTokens != null).map(x => x.inputTokens as number); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => v.toFixed(0) },
                    { key: 'avgOutput', label: '输出 Token 均值', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.outputTokens != null).map(x => x.outputTokens as number); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => v.toFixed(0) },
                    { key: 'outputRange', label: '输出 Token 波动', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.outputTokens != null).map(x => x.outputTokens as number); return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0 }, fmt: v => String(v), better: 'lower' },
                  ]
                  return (
                    <>
                      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        <table className="w-full text-sm">
                          <thead style={{ background: 'var(--s1)' }}>
                            <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                              <th className="text-left px-4 py-2.5 font-semibold">指标</th>
                              <th className="text-left px-4 py-2.5 font-semibold">{a.title?.trim() || llmFmtTime(a.startTime)}</th>
                              <th className="text-left px-4 py-2.5 font-semibold">{b.title?.trim() || llmFmtTime(b.startTime)}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.map(m => {
                              const va = m.get(a), vb = m.get(b)
                              let aBetter = false, bBetter = false
                              if (m.better && va !== vb) {
                                if (m.better === 'higher') { aBetter = va > vb; bBetter = vb > va }
                                else { aBetter = va < vb; bBetter = vb < va }
                              }
                              return (
                                <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{m.label}</td>
                                  <td className="px-4 py-2 tabular-nums text-xs" style={{ color: aBetter ? 'var(--ok)' : 'var(--text)', fontWeight: aBetter ? 700 : 400 }}>{m.fmt(va)}</td>
                                  <td className="px-4 py-2 tabular-nums text-xs" style={{ color: bBetter ? 'var(--ok)' : 'var(--text)', fontWeight: bBetter ? 700 : 400 }}>{m.fmt(vb)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 组合图表（对比双方的输入/输出放到同一图表） */}
                      {(() => {
                        const modelsInBoth = a.models.filter(m => b.models.includes(m))
                        if (modelsInBoth.length === 0) return null
                        return (
                          <div className="flex flex-col gap-5">
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Token 对比图表</h3>
                            {modelsInBoth.map(m => (
                              <div key={m} className="flex flex-col gap-4">
                                <LlmCompareChart reportA={a} reportB={b} model={m} field="inputTokens" title="输入 Token 对比" />
                                <LlmCompareChart reportA={a} reportB={b} model={m} field="outputTokens" title="输出 Token 对比" />
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* 个体报告摘要（不含图表） */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="min-w-0"><LlmBatchReportView report={a} apiKey={apiKey} hideCharts /></div>
                        <div className="min-w-0"><LlmBatchReportView report={b} apiKey={apiKey} hideCharts /></div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            {pane === 'history' && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--t3)' }}>已存 {history.length} / {LLM_HIST_MAX} 条历史报告</span>
                  {history.length > 0 && (
                    <Btn small variant="danger" onClick={() => {
                      if (window.confirm('确认清空全部历史报告？此操作不可恢复。')) {
                        clearLlmHistory(); setHistory([]); setCompareIds([])
                      }
                    }}>清空全部</Btn>
                  )}
                </div>
                {histNotice && <p className="text-xs" style={{ color: 'var(--warn)' }}>⚠ {histNotice}</p>}
                {compareIds.length === 2 && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: 'var(--accentSub)' }}>
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>已选择 2 条历史报告</span>
                    <div className="flex gap-2">
                      <Btn small variant="ghost" onClick={() => setCompareIds([])}>取消选择</Btn>
                      <Btn small variant="accent" onClick={() => setPane('compare')}>对比所选 →</Btn>
                    </div>
                  </div>
                )}
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">暂无历史报告。</p>
                  </div>
                ) : history.map(rep => (
                  <div key={rep.id} className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input type="checkbox" checked={compareIds.includes(rep.id)}
                          disabled={!compareIds.includes(rep.id) && compareIds.length >= 2}
                          onChange={() => toggleCompare(rep.id)}
                          style={{ accentColor: 'var(--accent)' }} className="w-3.5 h-3.5" />
                        <div className="min-w-0">
                          <InlineEditableTitle
                            value={rep.title ?? ''}
                            placeholder={llmFmtTime(rep.startTime)}
                            onSave={title => { setHistory(renameLlmHistoryItem(rep.id, title)) }}
                          />
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                            {llmFmtTime(rep.startTime)} · 模型 {rep.models.join(', ')} · 成功 <span style={{ color: 'var(--ok)' }}>{rep.success}</span>/{rep.total} · {llmFmtDur(rep.durationMs)}
                            {rep.stopped && <span style={{ color: 'var(--warn)' }}> · 已手动停止</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <IconBtn icon={<IconEye />} tooltip="查看报告" onClick={() => viewHistoryReport(rep)} />
                        <IconBtn icon={<IconRepeat />} tooltip="复用此配置" onClick={() => reuseHistoryReport(rep)} />
                        <IconBtn icon={<IconTrash />} tooltip="删除该历史报告" danger onClick={() => {
                          if (window.confirm('确认删除该条历史报告？此操作不可恢复。')) {
                            const list = deleteLlmHistoryItem(rep.id)
                            setHistory(list)
                            setCompareIds(ids => ids.filter(id => id !== rep.id))
                          }
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pane === 'prompts' && (
              <div className="h-full">
                <LlmPromptsPane prompts={prompts} onChange={setPrompts} />
              </div>
            )}
          </div>
        </div>
      </div>
      {jsonViewerBody != null && (
        <LlmJsonViewerModal
  title="请求体预览"
  subtitle={jsonViewerBody.model ? `模型：${jsonViewerBody.model}` : undefined}
  text={jsonViewerBody.body}
  onClose={() => setJsonViewerBody(null)}
/>
      )}
    </div>
  )
}

// ─── Tool: 模型探测 ─────────────────────────────────────────────────────────────
// 定位：API 渠道兼容性实验台 —— 三种协议格式 × 参数/流式/缓存/Token 计数稳定性，
// 智能降级定位不支持的参数；每条请求记录 Token 用量、缓存读写与 Request ID。

type ProbeFormat = 'chat' | 'responses' | 'anthropic'
type ProbeStatus = 'passed' | 'failed' | 'unsupported' | 'skipped'

interface ProbeTestDef {
  id: string
  group: string
  name: string
  desc: string
  explain: string
  kind: 'basic' | 'parameter' | 'stream' | 'token' | 'cache' | 'extra'
  format?: ProbeFormat
  subtype?: string
}

interface ProbeSseEvent { index: number; event: string; id: string; data: string; json: any }

interface ProbeUsage { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null }

interface ProbeLog {
  id: string
  resultKey: string
  label: string
  format: ProbeFormat
  url: string
  method: string
  status: number | null
  statusText: string
  duration: number
  time: string
  requestHeaders: Record<string, string>
  requestBody: any
  responseHeaders: Record<string, string>
  responseBody: any
  sse: ProbeSseEvent[]
  chunks: string[]
  usage: ProbeUsage
  requestId: string | null
}

interface ProbeResult {
  status: ProbeStatus
  detail: string
  duration: number | null
  format?: ProbeFormat
  usage?: ProbeUsage
  cache?: { hits: number; total: number; reads: number[] }
  tokenValues?: number[]
  repro: { url: string; headers: Record<string, string>; body: any; status: number | null; requestId: string | null } | null
}

interface ProbeReport {
  id: string
  name: string
  startedAt: string
  completedAt: string
  durationMs: number
  target: { baseUrl: string; model: string; overrides: Record<ProbeFormat, string | null> }
  results: Record<string, ProbeResult>
  summary: Record<ProbeStatus, number>
  logs: ProbeLog[]
}

interface ProbeCfg {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  urlOf: Record<ProbeFormat, string>
}

const PROBE_STORAGE_KEY = 'modelprobe-config'
const PROBE_KEY_STORAGE_KEY = 'modelprobe-key'
const PROBE_HISTORY_KEY = 'modelprobe-history'
const PROBE_HISTORY_MAX = 20

const PROBE_MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace'
const PROBE_FORMAT_LABELS: Record<ProbeFormat, string> = {
  chat: 'Chat Completions', responses: 'Responses', anthropic: 'Anthropic Messages',
}
const PROBE_FORMAT_SHORT: Record<ProbeFormat, string> = { chat: 'chat', responses: 'responses', anthropic: 'anthropic' }
const PROBE_ENDPOINTS: Record<ProbeFormat, string> = {
  chat: '/v1/chat/completions', responses: '/v1/responses', anthropic: '/v1/messages',
}
const PROBE_REQUEST_ID_HEADERS = ['x-oneapi-request-id', 'x-request-id', 'x-openai-request-id', 'request-id', 'x-goog-request-id']
const PROBE_STATUS_LABELS: Record<ProbeStatus, string> = { passed: '通过', failed: '失败', unsupported: '不支持', skipped: '已跳过' }
const PROBE_ROW_STATUS_LABELS: Record<string, string> = { ...PROBE_STATUS_LABELS, pending: '待执行', running: '执行中' }

const PROBE_TESTS: ProbeTestDef[] = [
  { id: 'chat-basic', group: '协议基础', name: 'OpenAI Chat Completions', desc: '验证 /v1/chat/completions 基础非流式请求', explain: 'OpenAI 系兼容网关最通用的协议格式，也是中转渠道的第一道验证关卡。', kind: 'basic', format: 'chat' },
  { id: 'responses-basic', group: '协议基础', name: 'OpenAI Responses', desc: '验证 /v1/responses 基础非流式请求', explain: 'Responses API 是 OpenAI 新一代接口，请求/响应结构与 Chat Completions 不同。', kind: 'basic', format: 'responses' },
  { id: 'anthropic-basic', group: '协议基础', name: 'Anthropic Messages', desc: '验证 /v1/messages 基础非流式请求', explain: 'Anthropic Messages 使用 x-api-key 鉴权与不同的消息结构，常被中转站映射为 OpenAI 格式。', kind: 'basic', format: 'anthropic' },
  { id: 'temperature', group: '参数与特性', name: 'temperature', desc: '采样温度参数支持情况', explain: 'temperature 控制采样随机性；部分轻量模型或中转映射可能忽略该参数，极端情况下直接报错。', kind: 'parameter' },
  { id: 'top_p', group: '参数与特性', name: 'top_p', desc: '核采样参数支持情况', explain: 'top_p 与 temperature 同为采样参数，有些实现只支持其一或两者互斥。', kind: 'parameter' },
  { id: 'reasoning_effort', group: '参数与特性', name: 'reasoning_effort', desc: '推理强度参数支持情况', explain: 'reasoning_effort（low/medium/high）仅推理模型支持，普通模型通常会报参数错误。', kind: 'parameter' },
  { id: 'max_tokens', group: '参数与特性', name: 'Token 上限参数', desc: 'max_completion_tokens / max_output_tokens / max_tokens', explain: '三种协议对 Token 上限参数的命名不同，验证目标渠道是否接受对应写法。', kind: 'parameter' },
  { id: 'structured_output', group: '参数与特性', name: '结构化输出', desc: 'JSON Schema / response_format 支持情况', explain: '结构化输出要求模型严格按 Schema 返回；Anthropic 原生无此参数，直接判为不支持。', kind: 'parameter' },
  { id: 'tool_calling', group: '参数与特性', name: '工具调用', desc: 'function calling / tool use 能力', explain: '工具调用需要请求体带 tools 声明，部分代理仅透传文本请求。', kind: 'parameter' },
  { id: 'stream-false', group: '传输与稳定性', name: '非流式响应', desc: '验证 stream=false 的完整 JSON 响应', explain: '非流式是计费与解析最简单的路径，任何渠道都应支持。', kind: 'stream' },
  { id: 'stream-true', group: '传输与稳定性', name: 'SSE 流式响应', desc: '验证 stream=true、SSE 格式与结束标记', explain: '流式响应按 SSE 分块返回，验证事件解析与结束标记（[DONE] / response.completed / message_stop）。', kind: 'stream' },
  { id: 'token-stability', group: '传输与稳定性', name: 'Token 计算稳定性', desc: '对固定短输入重复计数并比较波动', explain: '同一输入多次请求的输入 Token 应恒定；混入固定随机串可暴露计数不一致（如后端换编码）。', kind: 'token' },
  { id: 'cache-chat', group: '缓存能力', name: 'Chat 自动前缀缓存', desc: '重复长前缀并读取 cached_tokens', explain: 'OpenAI 系自动前缀缓存无需显式声明，命中时 prompt_tokens_details.cached_tokens > 0。最多 3 次，首次命中即停。', kind: 'cache', format: 'chat' },
  { id: 'cache-responses', group: '缓存能力', name: 'Responses 自动前缀缓存', desc: '重复长前缀并读取 cached_tokens', explain: 'Responses 格式命中时 input_tokens_details.cached_tokens > 0。最多 3 次，首次命中即停。', kind: 'cache', format: 'responses' },
  { id: 'cache-anthropic', group: '缓存能力', name: 'Anthropic 显式缓存', desc: '使用 cache_control 并读取 cache_read_input_tokens', explain: 'Anthropic 需在 content block 显式声明 cache_control，命中时 cache_read_input_tokens > 0。最多 3 次，首次命中即停。', kind: 'cache', format: 'anthropic' },
  { id: 'system-prompt', group: '补充场景', name: 'System 提示词', desc: '检查系统指令是否被正确遵循', explain: '验证 system 角色消息是否被渠道接受并生效。', kind: 'extra', subtype: 'system' },
  { id: 'multi-turn', group: '补充场景', name: '多轮对话', desc: '检查上下文角色与对话延续能力', explain: '多轮对话验证 assistant 角色消息回传与上下文保留。', kind: 'extra', subtype: 'multiturn' },
  { id: 'error-shape', group: '补充场景', name: '错误码规范性', desc: '使用无效模型检查 HTTP 状态与错误结构', explain: '无效模型应返回 4xx 与结构化错误对象，验证错误形态是否规范。', kind: 'extra', subtype: 'error' },
  { id: 'concurrency', group: '补充场景', name: '并发请求稳定性', desc: '并行发起 3 个低消耗请求', explain: '并发请求检验渠道的连接池与限流策略。', kind: 'extra', subtype: 'concurrency' },
]

const probeTestById = (id: string): ProbeTestDef | undefined => PROBE_TESTS.find(t => t.id === id)
const probeKey = (id: string, format?: ProbeFormat): string => format ? `${id}@${format}` : id
const probeFormatOfKey = (key: string): ProbeFormat | null => {
  const at = key.indexOf('@')
  return at > 0 ? (key.slice(at + 1) as ProbeFormat) : null
}
const probeMakeRandom = (): string => Math.random().toString(36).slice(2, 10).toUpperCase() + '-FIXED-' + Math.random().toString(36).slice(2, 8)
const probeNowName = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const probeSafeName = (v: string): string => v.replace(/[\\/:*?"<>|\s]+/g, '_')
const probeEscapeHtml = (v: string): string => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] as string))
const probeJoinUrl = (base: string, path: string): string => {
  const clean = base.trim().replace(/\/+$/, '')
  return /\/v1$/i.test(clean) && path.startsWith('/v1/') ? clean + path.slice(3) : clean + path
}
const probeJsonPretty = (v: any): string => {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
const probeMaskValue = (v: string): string => (v.length > 10 ? v.slice(0, 7) + '***' + v.slice(-4) : '***')
const probeMaskHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(headers)) {
    const v = headers[k]
    if (/authorization|api-key/i.test(k)) out[k] = /^Bearer\s+/i.test(v) ? 'Bearer ' + probeMaskValue(v.slice(7)) : probeMaskValue(v)
    else out[k] = v
  }
  return out
}
const probeHeadersObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => { out[k] = v })
  return out
}
const probeExtractRequestId = (headers: Headers): string | null => {
  for (const name of PROBE_REQUEST_ID_HEADERS) {
    const v = headers.get(name)
    if (v) return v
  }
  return null
}
const probeEmptyUsage = (): ProbeUsage => ({ input: null, output: null, cacheRead: null, cacheWrite: null })
const probeNum = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
const probeUsageOf = (format: ProbeFormat, data: any): ProbeUsage => {
  const u = probeEmptyUsage()
  if (!data || typeof data !== 'object') return u
  if (format === 'anthropic') {
    u.input = probeNum(data?.usage?.input_tokens)
    u.output = probeNum(data?.usage?.output_tokens)
    u.cacheRead = probeNum(data?.usage?.cache_read_input_tokens)
    u.cacheWrite = probeNum(data?.usage?.cache_creation_input_tokens)
    return u
  }
  const usage = data?.usage || {}
  u.input = probeNum(usage.prompt_tokens ?? usage.input_tokens)
  u.output = probeNum(usage.completion_tokens ?? usage.output_tokens)
  u.cacheRead = probeNum(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens)
  return u
}
const probeParseSseBlock = (block: string, index: number): ProbeSseEvent => {
  let event = 'message', id = ''
  const data: string[] = []
  block.split(/\r?\n/).forEach(line => {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('id:')) id = line.slice(3).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trim())
  })
  const raw = data.join('\n')
  let json: any = null
  try { json = JSON.parse(raw) } catch { /* ignore */ }
  return { index, event, id, data: raw, json }
}
const probeUsageFromSse = (format: ProbeFormat, events: ProbeSseEvent[]): ProbeUsage => {
  const u = probeEmptyUsage()
  for (const ev of events) {
    const j = ev.json
    if (!j || typeof j !== 'object') continue
    if (format === 'chat') {
      if (j.usage && typeof j.usage === 'object') {
        u.input = probeNum(j.usage.prompt_tokens) ?? u.input
        u.output = probeNum(j.usage.completion_tokens) ?? u.output
        u.cacheRead = probeNum(j.usage.prompt_tokens_details?.cached_tokens) ?? u.cacheRead
      }
    } else if (format === 'responses') {
      if (ev.event === 'response.completed' && j.response?.usage) {
        u.input = probeNum(j.response.usage.input_tokens) ?? u.input
        u.output = probeNum(j.response.usage.output_tokens) ?? u.output
        u.cacheRead = probeNum(j.response.usage.input_tokens_details?.cached_tokens) ?? u.cacheRead
      }
    } else if (ev.event === 'message_start' && j.message?.usage) {
      u.input = probeNum(j.message.usage.input_tokens) ?? u.input
      u.cacheRead = probeNum(j.message.usage.cache_read_input_tokens) ?? u.cacheRead
      u.cacheWrite = probeNum(j.message.usage.cache_creation_input_tokens) ?? u.cacheWrite
    } else if (ev.event === 'message_delta' && j.usage) {
      u.output = probeNum(j.usage.output_tokens) ?? u.output
      u.cacheRead = probeNum(j.usage.cache_read_input_tokens) ?? u.cacheRead
    }
  }
  return u
}
const probeExtractError = (data: any): string => {
  if (typeof data === 'string') return data
  return probeJsonPretty(data?.error || data)
}
const probeBaseBody = (cfg: ProbeCfg, format: ProbeFormat, prompt = 'Reply with exactly: OK') => {
  const model = cfg.model
  if (format === 'responses') return { model, input: prompt }
  if (format === 'anthropic') return { model, max_tokens: 32, messages: [{ role: 'user', content: prompt }] }
  return { model, messages: [{ role: 'user', content: prompt }] }
}
const probeParamSpec = (id: string, format: ProbeFormat): Record<string, any> => {
  switch (id) {
    case 'temperature': return { temperature: 0.2 }
    case 'top_p': return { top_p: 0.9 }
    case 'reasoning_effort': return { reasoning_effort: 'low' }
    case 'max_tokens':
      if (format === 'responses') return { max_output_tokens: 32 }
      if (format === 'anthropic') return { max_tokens: 32 }
      return { max_completion_tokens: 32 }
    case 'structured_output':
      if (format === 'responses') return { text: { format: { type: 'json_schema', name: 'probe', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } } }
      if (format === 'anthropic') return {}
      return { response_format: { type: 'json_schema', json_schema: { name: 'probe', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } } }
    case 'tool_calling':
      if (format === 'anthropic') return { tools: [{ name: 'get_probe_value', description: 'Return a probe value', input_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] }
      return { tools: [{ type: 'function', function: { name: 'get_probe_value', description: 'Return a probe value', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } } }] }
    default: return {}
  }
}
const probeParamMatched = (id: string, err: string): boolean => {
  if (id === 'max_tokens') return /max[_ ]?(completion|output)?[_ ]?tokens/.test(err)
  if (id === 'structured_output') return /response_format|json\s?schema|text\.format/.test(err)
  if (id === 'tool_calling') return /tool|function/.test(err)
  return err.includes(id)
}
const probeParamLabel = (id: string): string => probeTestById(id)?.name || id
const probeResult = (status: ProbeStatus, detail: string, extra: Partial<ProbeResult> = {}): ProbeResult => ({ status, detail, duration: null, repro: null, ...extra })
const probeReproOf = (log: ProbeLog): ProbeResult['repro'] => ({
  url: log.url, headers: log.requestHeaders, body: log.requestBody, status: log.status, requestId: log.requestId,
})
const probeResultKeysOf = (t: ProbeTestDef, results: Record<string, ProbeResult>): string[] => {
  if (t.kind === 'parameter' || t.kind === 'token') {
    const prefix = t.id + '@'
    return Object.keys(results).filter(k => k.startsWith(prefix)).sort((a, b) => a.localeCompare(b))
  }
  return results[t.id] ? [t.id] : []
}
const probeAggregateStatus = (items: { status: ProbeStatus }[]): ProbeStatus => {
  if (!items.length) return 'skipped'
  if (items.some(x => x.status === 'failed')) return 'failed'
  if (items.every(x => x.status === 'passed')) return 'passed'
  if (items.every(x => x.status === 'unsupported')) return 'unsupported'
  if (items.every(x => x.status === 'skipped')) return 'skipped'
  return 'failed'
}

function loadProbeCfg(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(PROBE_STORAGE_KEY) || '{}') } catch { return {} }
}
function saveProbeCfg(cfg: Record<string, any>) {
  try { localStorage.setItem(PROBE_STORAGE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}
function loadProbeHistory(): ProbeReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PROBE_HISTORY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}
function saveProbeHistory(rep: ProbeReport): ProbeReport[] {
  let list = [rep, ...loadProbeHistory()]
  while (list.length > PROBE_HISTORY_MAX) list.pop()
  while (typeof window !== 'undefined') {
    try { localStorage.setItem(PROBE_HISTORY_KEY, JSON.stringify(list)); break }
    catch {
      if (list.length > 1) list.pop()
      else { try { localStorage.removeItem(PROBE_HISTORY_KEY) } catch { /* ignore */ }; break }
    }
  }
  return list
}
function deleteProbeHistory(id: string): ProbeReport[] {
  const list = loadProbeHistory().filter(r => r.id !== id)
  try { localStorage.setItem(PROBE_HISTORY_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}
function clearProbeHistory() {
  try { localStorage.removeItem(PROBE_HISTORY_KEY) } catch { /* ignore */ }
}
function probeDownload(content: string, type: string, name: string) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function ProbeCodeBlock({ title, children, maxH = 320 }: { title: string; children: string; maxH?: number }) {
  const text = children ?? ''
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-bold" style={{ color: 'var(--t3)' }}>{title}</div>
      <pre className="overflow-auto rounded-xl p-3 font-mono text-[11px] leading-5" style={{ background: 'var(--code)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: maxH, fontFamily: PROBE_MONO }}>
        <code dangerouslySetInnerHTML={{ __html: highlightJson(text) || ' ' }} />
      </pre>
    </div>
  )
}

function ProbeCopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      }}
      className="border-0 outline-none cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[10px] flex-shrink-0 active:scale-95"
      title="复制 Request ID"
      style={{ background: copied ? 'var(--okBg)' : 'var(--s2)', color: copied ? 'var(--ok)' : 'var(--t2)', fontFamily: PROBE_MONO }}
    >
      {copied ? '✓ 已复制' : (value.length > 14 ? value.slice(0, 13) + '…' : value)}
    </button>
  )
}

function ProbeUsageChip({ usage }: { usage: ProbeUsage }) {
  const chip = (v: number | null) => (v == null ? '—' : String(v))
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--s2)', color: 'var(--t2)', fontFamily: PROBE_MONO }}>
      ↑{chip(usage.input)} ↓{chip(usage.output)} 缓存读{chip(usage.cacheRead)} 写{chip(usage.cacheWrite)}
    </span>
  )
}

function ProbeStatusBadge({ status }: { status: ProbeStatus }) {
  const s = status === 'passed' ? { background: 'var(--okBg)', color: 'var(--ok)' }
    : status === 'failed' ? { background: 'var(--errBg)', color: 'var(--err)' }
    : status === 'unsupported' ? { background: 'var(--warnBg)', color: 'var(--warn)' }
    : { background: 'var(--s2)', color: 'var(--t2)' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={s}>
      {PROBE_STATUS_LABELS[status]}
    </span>
  )
}

function ProbeReportRow({ t, report }: { t: ProbeTestDef; report: ProbeReport }) {
  const [open, setOpen] = useState(false)
  const keys = probeResultKeysOf(t, report.results)
  const items = keys.map(k => ({ key: k, r: report.results[k] }))
  const agg = probeAggregateStatus(items.map(x => x.r))
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}
        style={{ background: 'var(--bg)' }}
        onPointerEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--s1)' }}
        onPointerLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)' }}>
        <span className="text-xs" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.name}</div>
          {t.kind === 'parameter' || t.kind === 'token' ? (
            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>
              {items.map(x => `${probeFormatOfKey(x.key) ?? ''}:${PROBE_STATUS_LABELS[x.r.status]}`).join(' · ')}
            </div>
          ) : (
            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--t3)' }}>{items[0]?.r.detail || ''}</div>
          )}
        </div>
        <ProbeStatusBadge status={agg} />
        <span className="font-mono text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--t2)', fontFamily: PROBE_MONO }}>
          {items.length ? (items[0].r.duration != null ? items[0].r.duration + ' ms' : '-') : ''}
        </span>
      </div>
      {open && (
        <div className="px-5 pb-5 pt-1" style={{ background: 'var(--s1)' }}>
          <p className="text-xs leading-5 mb-4" style={{ color: 'var(--t2)' }}>
            <span className="font-bold" style={{ color: 'var(--text)' }}>说明：</span>{t.explain}
          </p>
          {items.map(({ key, r }) => (
            <div key={key} className="mb-3 rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {t.name}{probeFormatOfKey(key) ? ` · ${PROBE_FORMAT_LABELS[probeFormatOfKey(key)!]}` : ''}
                </span>
                <ProbeStatusBadge status={r.status} />
                <span className="text-xs" style={{ color: 'var(--t3)' }}>{r.detail}</span>
                {r.duration != null && <span className="font-mono text-xs" style={{ color: 'var(--t2)', fontFamily: PROBE_MONO }}>{r.duration} ms</span>}
              </div>
              {r.usage && (r.usage.input != null || r.usage.output != null || r.usage.cacheRead != null || r.usage.cacheWrite != null) && (
                <div className="mb-2"><ProbeUsageChip usage={r.usage} /></div>
              )}
              {r.cache && (
                <div className="text-xs mb-2" style={{ color: 'var(--t2)' }}>缓存：{r.cache.hits}/{r.cache.total} 次命中 · 读取值 {r.cache.reads.join(', ')}</div>
              )}
              {r.tokenValues && r.tokenValues.length > 0 && (
                <div className="text-xs mb-2" style={{ color: 'var(--t2)' }}>每次输入 Token：{r.tokenValues.join(', ')}</div>
              )}
              <div className="text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>复现步骤</div>
              {r.repro ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--s2)', color: 'var(--text)', fontFamily: PROBE_MONO }}>POST {r.repro.url}</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--s2)', color: 'var(--text)', fontFamily: PROBE_MONO }}>HTTP {r.repro.status ?? '—'}</span>
                    {r.repro.requestId && (
                      <span className="inline-flex items-center gap-1"><span className="font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>Request ID</span><ProbeCopyId value={r.repro.requestId} /></span>
                    )}
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    <ProbeCodeBlock title="请求头（密钥已脱敏）" children={probeJsonPretty(r.repro.headers)} />
                    <ProbeCodeBlock title="请求体" children={probeJsonPretty(r.repro.body)} />
                  </div>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--t3)' }}>本轮无实际请求（已跳过 / 未执行）。</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelProbeTool() {
  const cfg0 = loadProbeCfg()
  const [baseUrl, setBaseUrl] = useState(cfg0.baseUrl ?? 'https://api.openai.com')
  const [model, setModel] = useState(cfg0.model ?? '')
  const [timeoutSec, setTimeoutSec] = useState(cfg0.timeout ?? '60')
  const [chatUrl, setChatUrl] = useState(cfg0.chatUrl ?? '')
  const [responsesUrl, setResponsesUrl] = useState(cfg0.responsesUrl ?? '')
  const [anthropicUrl, setAnthropicUrl] = useState(cfg0.anthropicUrl ?? '')
  const [randomString, setRandomString] = useState(cfg0.randomString ?? probeMakeRandom())
  const [tokenRuns, setTokenRuns] = useState(cfg0.tokenRuns ?? '3')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {}
    PROBE_TESTS.forEach(t => { all[t.id] = cfg0.selected?.[t.id] !== false })
    return all
  })
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => {
    saveProbeCfg({ baseUrl, model, timeout: timeoutSec, chatUrl, responsesUrl, anthropicUrl, randomString, tokenRuns, selected })
  }, [baseUrl, model, timeoutSec, chatUrl, responsesUrl, anthropicUrl, randomString, tokenRuns, selected])

  useEffect(() => {
    let cancelled = false
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PROBE_KEY_STORAGE_KEY) : null
    if (!raw) { setApiKeyLoaded(true); return }
    decryptLlmApiKey(raw).then(v => { if (!cancelled) { if (v) setApiKey(v); setApiKeyLoaded(true) } })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!apiKeyLoaded) return
    if (!apiKey) { try { localStorage.removeItem(PROBE_KEY_STORAGE_KEY) } catch { /* ignore */ }; return }
    encryptLlmApiKey(apiKey).then(enc => {
      if (!enc) return
      try { localStorage.setItem(PROBE_KEY_STORAGE_KEY, enc) } catch { /* ignore */ }
    })
  }, [apiKey, apiKeyLoaded])

  const [pane, setPane] = useState<'live' | 'logs' | 'report' | 'history'>('live')
  const [running, setRunning] = useState(false)
  const [nameModal, setNameModal] = useState(false)
  const [testName, setTestName] = useState('')
  const [report, setReport] = useState<ProbeReport | null>(null)
  const [history, setHistory] = useState<ProbeReport[]>(() => loadProbeHistory())
  const [logs, setLogs] = useState<ProbeLog[]>([])
  const [logFilter, setLogFilter] = useState('all')
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, { status: ProbeStatus | 'pending' | 'running'; detail: string }>>({})
  const [progress, setProgress] = useState<{ done: number; total: number; label: string }>({ done: 0, total: 0, label: '' })
  const [advOpen, setAdvOpen] = useState(false)
  const [startErr, setStartErr] = useState('')
  const [connRunning, setConnRunning] = useState(false)
  const [connResults, setConnResults] = useState<Record<ProbeFormat, { ok: boolean; status: number | null; ms: number; err: string } | null>>({ chat: null, responses: null, anthropic: null })

  const logsRef = useRef<ProbeLog[]>([])
  const stopRef = useRef(false)
  const activeAbortRef = useRef<AbortController | null>(null)

  const pushLog = (log: ProbeLog) => {
    logsRef.current.push(log)
    setLogs([...logsRef.current])
  }
  const setTestStatus = (key: string, status: ProbeStatus | 'pending' | 'running', detail = '') => {
    setStatuses(prev => ({ ...prev, [key]: { status, detail } }))
  }

  const probeNewLog = (resultKey: string, label: string, format: ProbeFormat, url?: string): ProbeLog => ({
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    resultKey, label, format,
    url: url ?? (cfgRef.current?.urlOf[format] ?? ''),
    method: 'POST', status: null, statusText: '', duration: 0, time: new Date().toISOString(),
    requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: null,
    sse: [], chunks: [], usage: probeEmptyUsage(), requestId: null,
  })
  const cfgRef = useRef<ProbeCfg | null>(null)

  const probeRequest = async (log: ProbeLog, format: ProbeFormat, body: any, opts: { stream?: boolean } = {}): Promise<{ ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }> => {
    const cfg = cfgRef.current
    if (!cfg) throw new Error('测试配置缺失')
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
    if (format === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    } else {
      headers.Authorization = `Bearer ${cfg.apiKey}`
    }
    const controller = new AbortController()
    activeAbortRef.current = controller
    const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), cfg.timeoutMs)
    const started = performance.now()
    log.requestHeaders = probeMaskHeaders(headers)
    log.requestBody = body
    try {
      const res = await fetch(log.url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      log.status = res.status
      log.statusText = res.statusText
      log.responseHeaders = probeHeadersObject(res.headers)
      log.requestId = probeExtractRequestId(res.headers)
      const rawBody = opts.stream && res.body ? await probeReadStream(res, log) : await res.text()
      let data: any
      try { data = rawBody ? JSON.parse(rawBody) : null } catch { data = rawBody }
      log.responseBody = data
      log.duration = Math.round(performance.now() - started)
      log.usage = opts.stream ? probeUsageFromSse(format, log.sse) : probeUsageOf(format, data)
      pushLog(log)
      return { ok: res.ok, status: res.status, data, raw: rawBody, log }
    } catch (err: any) {
      if (!log.status) {
        log.status = 0
        log.statusText = 'Network Error'
      }
      log.duration = Math.round(performance.now() - started)
      log.responseBody = { error: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? '请求超时或已中止' : String(err?.message || err) }
      pushLog(log)
      throw err
    } finally {
      clearTimeout(timer)
      if (activeAbortRef.current === controller) activeAbortRef.current = null
    }
  }

  const probeReadStream = async (res: Response, log: ProbeLog): Promise<string> => {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let raw = '', buffer = '', index = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      log.chunks.push(chunk)
      raw += chunk
      buffer += chunk
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        if (block.trim()) log.sse.push(probeParseSseBlock(block, ++index))
      }
    }
    if (buffer.trim()) log.sse.push(probeParseSseBlock(buffer, ++index))
    return raw
  }

  const runProbeBasic = async (t: ProbeTestDef): Promise<ProbeResult> => {
    const format = t.format!
    const log = probeNewLog(t.id, t.name, format)
    try {
      const r = await probeRequest(log, format, probeBaseBody(cfgRef.current!, format))
      if (r.ok) return probeResult('passed', '基础请求返回成功', { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
    } catch (e: any) {
      return probeResult('failed', e?.message || String(e), { format, repro: probeReproOf(log) })
    }
  }

  const runProbeParamSuite = async (format: ProbeFormat, paramIds: string[]): Promise<Record<string, ProbeResult>> => {
    const outcomes: Record<string, ProbeResult> = {}
    const pending = new Set(paramIds)
    if (format === 'anthropic' && paramIds.includes('structured_output')) {
      outcomes[probeKey('structured_output', format)] = probeResult('unsupported', 'Anthropic Messages 无原生 response_format 参数', { format })
      pending.delete('structured_output')
    }
    const body: Record<string, any> = { ...probeBaseBody(cfgRef.current!, format, 'Return a JSON object with ok=true. If a tool is available, call it with value="ok".') }
    for (const id of pending) Object.assign(body, probeParamSpec(id, format))
    while (pending.size) {
      const combinedKey = [...pending].join('+') + '@' + format
      const log = probeNewLog(combinedKey, `${[...pending].map(probeParamLabel).join(' + ')}（${PROBE_FORMAT_LABELS[format]}）`, format)
      let r: { ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }
      try {
        r = await probeRequest(log, format, body)
      } catch (e: any) {
        for (const id of pending) outcomes[probeKey(id, format)] = probeResult('failed', e?.message || String(e), { format, repro: probeReproOf(log) })
        break
      }
      if (r.ok) {
        for (const id of pending) outcomes[probeKey(id, format)] = probeResult('passed', '组合请求通过', { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
        break
      }
      const errText = probeExtractError(r.data).toLowerCase()
      const identified = [...pending].filter(id => probeParamMatched(id, errText))
      if (identified.length) {
        for (const id of identified) {
          outcomes[probeKey(id, format)] = probeResult('unsupported', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
          pending.delete(id)
          const spec = probeParamSpec(id, format)
          for (const k of Object.keys(spec)) delete body[k]
        }
        continue
      }
      for (const id of [...pending]) {
        const singleLog = probeNewLog(probeKey(id, format), `${probeParamLabel(id)}（${PROBE_FORMAT_LABELS[format]}）`, format)
        const singleBody: Record<string, any> = { ...probeBaseBody(cfgRef.current!, format), ...probeParamSpec(id, format) }
        try {
          const one = await probeRequest(singleLog, format, singleBody)
          if (one.ok) {
            outcomes[probeKey(id, format)] = probeResult('passed', '独立降级请求通过', { format, duration: one.log.duration, usage: one.log.usage, repro: probeReproOf(one.log) })
          } else {
            const s: ProbeStatus = /unsupported|unknown|invalid|not supported|not implemented/i.test(probeExtractError(one.data)) ? 'unsupported' : 'failed'
            outcomes[probeKey(id, format)] = probeResult(s, probeExtractError(one.data), { format, duration: one.log.duration, usage: one.log.usage, repro: probeReproOf(one.log) })
          }
        } catch (e: any) {
          outcomes[probeKey(id, format)] = probeResult('failed', e?.message || String(e), { format, repro: probeReproOf(singleLog) })
        }
        pending.delete(id)
      }
    }
    return outcomes
  }

  const runProbeStream = async (t: ProbeTestDef, stream: boolean): Promise<ProbeResult> => {
    const log = probeNewLog(t.id, t.name, 'chat')
    const body = { ...probeBaseBody(cfgRef.current!, 'chat'), stream }
    try {
      const r = await probeRequest(log, 'chat', body, { stream })
      if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format: 'chat', duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      if (stream) {
        const valid = r.log.sse.length > 0 && r.log.sse.some(e => e.data)
        const complete = /\[DONE\]|response\.completed|message_stop/.test(r.raw || '')
        return probeResult(valid ? 'passed' : 'failed', valid ? `收到 ${r.log.sse.length} 个 SSE 事件${complete ? '，包含结束标记' : '，未识别结束标记'}` : '未解析到有效 SSE data 字段', { format: 'chat', duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      }
      return probeResult('passed', '完整 JSON 响应正常', { format: 'chat', duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
    } catch (e: any) {
      return probeResult('failed', e?.message || String(e), { format: 'chat', repro: probeReproOf(log) })
    }
  }

  const runProbeToken = async (format: ProbeFormat, count: number, fixed: string): Promise<ProbeResult> => {
    const key = probeKey('token-stability', format)
    const values: number[] = []
    const durations: number[] = []
    let lastLog: ProbeLog | null = null
    for (let i = 0; i < count; i++) {
      const log = probeNewLog(key, `Token 计算稳定性（${PROBE_FORMAT_LABELS[format]}）`, format)
      lastLog = log
      try {
        const r = await probeRequest(log, format, probeBaseBody(cfgRef.current!, format, `Token stability probe. Fixed string: ${fixed}`))
        if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, tokenValues: values, repro: probeReproOf(r.log) })
        const input = r.log.usage.input
        if (typeof input !== 'number') return probeResult('unsupported', '响应中缺少输入 Token 字段', { format, duration: r.log.duration, usage: r.log.usage, tokenValues: values, repro: probeReproOf(r.log) })
        values.push(input)
        durations.push(r.log.duration)
      } catch (e: any) {
        return probeResult('failed', e?.message || String(e), { format, tokenValues: values, repro: probeReproOf(log) })
      }
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    return probeResult(min === max ? 'passed' : 'failed',
      min === max ? `${count} 次输入 Token 均为 ${min}` : `Token 计数波动 ${min} - ${max}`,
      { format, duration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null, usage: lastLog?.usage, tokenValues: values, repro: lastLog ? probeReproOf(lastLog) : null })
  }

  const runProbeCache = async (format: ProbeFormat): Promise<ProbeResult> => {
    const t = probeTestById('cache-' + format)!
    const prefix = ('ModelProbe fixed cache prefix. The following context is intentionally repeated for cache verification. ').repeat(180)
    const body: Record<string, any> = probeBaseBody(cfgRef.current!, format, prefix + '\nReply OK.')
    if (format === 'anthropic') {
      body.messages = [{ role: 'user', content: [{ type: 'text', text: prefix, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Reply OK.' }] }]
    }
    const reads: number[] = []
    const durations: number[] = []
    let lastLog: ProbeLog | null = null
    for (let i = 0; i < 3; i++) {
      const log = probeNewLog(t.id, t.name, format)
      lastLog = log
      let r: { ok: boolean; status: number; data: any; raw: string | null; log: ProbeLog }
      try {
        r = await probeRequest(log, format, body)
      } catch (e: any) {
        return probeResult('failed', `第 ${i + 1} 次请求失败：${e?.message || String(e)}`, { format, repro: probeReproOf(log) })
      }
      if (!r.ok) return probeResult('failed', probeExtractError(r.data), { format, duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      const read = r.log.usage.cacheRead || 0
      reads.push(read)
      durations.push(r.log.duration)
      if (read > 0) {
        return probeResult('passed', `第 ${i + 1} 次请求命中缓存，读取 Token: ${read}`, { format, duration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length), usage: r.log.usage, cache: { hits: 1, total: i + 1, reads }, repro: probeReproOf(r.log) })
      }
    }
    return probeResult('unsupported', '连续 3 次请求均未报告缓存命中，已停止重试', { format, duration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null, usage: lastLog?.usage, cache: { hits: 0, total: 3, reads }, repro: lastLog ? probeReproOf(lastLog) : null })
  }

  const runProbeExtra = async (subtype: string): Promise<ProbeResult> => {
    if (subtype === 'error') {
      const log = probeNewLog('error-shape', '错误码规范性', 'chat')
      const body = { ...probeBaseBody(cfgRef.current!, 'chat'), model: 'modelprobe-intentionally-invalid-model' }
      try {
        const r = await probeRequest(log, 'chat', body)
        const structured = typeof r.data === 'object' && r.data !== null && (r.data.error || r.data.message)
        return probeResult(!r.ok && r.status >= 400 && structured ? 'passed' : 'failed',
          !r.ok ? `返回 HTTP ${r.status}${structured ? ' 且包含结构化错误' : '，但错误结构不明确'}` : '无效模型意外返回成功',
          { format: 'chat', duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
      } catch (e: any) {
        return probeResult('failed', e?.message || String(e), { format: 'chat', repro: probeReproOf(log) })
      }
    }
    if (subtype === 'concurrency') {
      const logs: ProbeLog[] = []
      const rs = await Promise.allSettled([1, 2, 3].map(async i => {
        const log = probeNewLog('concurrency', '并发请求稳定性', 'chat')
        logs.push(log)
        return probeRequest(log, 'chat', probeBaseBody(cfgRef.current!, 'chat', `Reply only ${i}`))
      }))
      const ok = rs.filter(x => x.status === 'fulfilled' && (x.value as { ok: boolean }).ok).length
      const ds = rs.filter(x => x.status === 'fulfilled').map(x => (x.value as { log: ProbeLog }).log.duration)
      return probeResult(ok === 3 ? 'passed' : 'failed', `${ok}/3 个并发请求成功`, { format: 'chat', duration: ds.length ? Math.max(...ds) : null, repro: logs.length ? probeReproOf(logs[0]) : null })
    }
    const isSystem = subtype === 'system'
    const key = isSystem ? 'system-prompt' : 'multi-turn'
    const body: Record<string, any> = isSystem
      ? { ...probeBaseBody(cfgRef.current!, 'chat'), messages: [{ role: 'system', content: 'Always reply exactly SYSTEM_OK' }, { role: 'user', content: 'Respond now' }] }
      : { ...probeBaseBody(cfgRef.current!, 'chat'), messages: [{ role: 'user', content: 'Remember codeword ORBIT.' }, { role: 'assistant', content: 'I will remember ORBIT.' }, { role: 'user', content: 'Reply with only the codeword.' }] }
    const log = probeNewLog(key, isSystem ? 'System 提示词' : '多轮对话', 'chat')
    try {
      const r = await probeRequest(log, 'chat', body)
      return probeResult(r.ok ? 'passed' : 'failed', r.ok ? '请求成功并返回多角色上下文响应' : probeExtractError(r.data), { format: 'chat', duration: r.log.duration, usage: r.log.usage, repro: probeReproOf(r.log) })
    } catch (e: any) {
      return probeResult('failed', e?.message || String(e), { format: 'chat', repro: probeReproOf(log) })
    }
  }

  const testConnection = async () => {
    const cfg: ProbeCfg = {
      baseUrl: baseUrl.trim(), apiKey, model: model.trim(),
      timeoutMs: Math.min((Number(timeoutSec) || 60) * 1000, 15000),
      urlOf: {
        chat: probeJoinUrl(chatUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.chat),
        responses: probeJoinUrl(responsesUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.responses),
        anthropic: probeJoinUrl(anthropicUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.anthropic),
      },
    }
    if (!cfg.baseUrl || !cfg.apiKey.trim() || !cfg.model) {
      setStartErr('测试连接需要先填写默认 Base URL、API Key 与模型名称。')
      return
    }
    setStartErr('')
    setConnRunning(true)
    setConnResults({ chat: null, responses: null, anthropic: null })
    await Promise.all((['chat', 'responses', 'anthropic'] as ProbeFormat[]).map(async f => {
      const started = performance.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), cfg.timeoutMs)
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      if (f === 'anthropic') {
        headers['x-api-key'] = cfg.apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers.Authorization = `Bearer ${cfg.apiKey}`
      }
      let res: { ok: boolean; status: number | null; ms: number; err: string }
      try {
        const r = await fetch(cfg.urlOf[f], {
          method: 'POST', headers, body: JSON.stringify(probeBaseBody(cfg, f, 'Reply OK.')), signal: controller.signal,
        })
        const ms = Math.round(performance.now() - started)
        let err = ''
        if (!r.ok) {
          try {
            const j = await r.json()
            err = j?.error?.message ?? j?.message ?? ''
          } catch { /* ignore */ }
        }
        res = { ok: r.ok, status: r.status, ms, err }
      } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        res = {
          ok: false, status: null, ms: Math.round(performance.now() - started),
          err: timedOut ? '请求超时' : (e instanceof TypeError ? '网络或 CORS 被拦截' : String(e?.message || e)),
        }
      } finally {
        clearTimeout(timer)
      }
      setConnResults(prev => ({ ...prev, [f]: res }))
    }))
    setConnRunning(false)
  }

  const runProbe = async (name: string) => {
    const cfg: ProbeCfg = {
      baseUrl: baseUrl.trim(), apiKey, model: model.trim(),
      timeoutMs: (Number(timeoutSec) || 60) * 1000,
      urlOf: {
        chat: probeJoinUrl(chatUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.chat),
        responses: probeJoinUrl(responsesUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.responses),
        anthropic: probeJoinUrl(anthropicUrl.trim() || baseUrl.trim(), PROBE_ENDPOINTS.anthropic),
      },
    }
    const errs: string[] = []
    if (!cfg.baseUrl) errs.push('默认 Base URL 不能为空。')
    if (!cfg.apiKey.trim()) errs.push('API Key 不能为空。')
    if (!cfg.model) errs.push('模型名称不能为空。')
    const selectedTests = PROBE_TESTS.filter(t => selectedRef.current[t.id])
    if (!selectedTests.length) errs.push('请至少勾选一个测试项。')
    const paramIds = selectedTests.filter(t => t.kind === 'parameter').map(t => t.id)
    const needFormats = selectedTests.some(t => t.kind === 'parameter' || t.kind === 'token')
    const activeFormats = (['chat', 'responses', 'anthropic'] as ProbeFormat[]).filter(f => selectedRef.current[`${f}-basic`])
    if (needFormats && activeFormats.length === 0) errs.push('参数 / Token 稳定性测试需要至少勾选一个基础格式测试（Chat / Responses / Anthropic）。')
    if (errs.length) { setStartErr(errs.join('\n')); return }
    setStartErr('')

    cfgRef.current = cfg
    stopRef.current = false
    logsRef.current = []
    setLogs([])
    setOpenLogs({})
    setReport(null)
    setRunning(true)
    setPane('live')
    setStatuses({})

    const resultsObj: Record<string, ProbeResult> = {}
    PROBE_TESTS.forEach(t => {
      if (!selectedRef.current[t.id]) {
        const keys = (t.kind === 'parameter' || t.kind === 'token')
          ? activeFormats.map(f => probeKey(t.id, f))
          : [t.id]
        keys.forEach(k => {
          resultsObj[k] = probeResult('skipped', '用户未勾选', { format: probeFormatOfKey(k) ?? undefined })
          setTestStatus(k, 'skipped', '用户未勾选')
        })
      }
    })
    const total = selectedTests.reduce((acc, t) => acc + (t.kind === 'parameter' || t.kind === 'token' ? Math.max(1, activeFormats.length) : 1), 0)
    let completed = 0
    let curLabel = '准备测试'
    const updateProgress = (label?: string) => {
      if (label) curLabel = label
      setProgress({ done: completed, total, label: curLabel })
    }

    const startedAt = new Date().toISOString()
    const startMs = Date.now()
    let parametersDone = false
    try {
      for (const t of PROBE_TESTS) {
        if (stopRef.current) break
        if (!selectedRef.current[t.id]) continue
        if (t.kind === 'parameter') {
          if (parametersDone) continue
          parametersDone = true
          for (const f of activeFormats) {
            if (stopRef.current) break
            const keys = paramIds.map(id => probeKey(id, f))
            keys.forEach(k => setTestStatus(k, 'running'))
            updateProgress(`参数组合与智能降级（${PROBE_FORMAT_LABELS[f]}）`)
            const outcomes = await runProbeParamSuite(f, paramIds)
            for (const k of Object.keys(outcomes)) {
              resultsObj[k] = outcomes[k]
              setTestStatus(k, outcomes[k].status, outcomes[k].detail)
              completed++
            }
            updateProgress()
          }
          continue
        }
        if (t.kind === 'token') {
          for (const f of activeFormats) {
            if (stopRef.current) break
            const key = probeKey(t.id, f)
            setTestStatus(key, 'running')
            updateProgress(`Token 计算稳定性（${PROBE_FORMAT_LABELS[f]}）`)
            const count = Math.max(2, Math.min(10, Number(tokenRuns) || 3))
            const out = await runProbeToken(f, count, randomString.trim())
            resultsObj[key] = out
            setTestStatus(key, out.status, out.detail)
            completed++
            updateProgress()
          }
          continue
        }
        const key = t.id
        setTestStatus(key, 'running')
        updateProgress(`正在执行：${t.name}`)
        let out: ProbeResult
        if (t.kind === 'basic') out = await runProbeBasic(t)
        else if (t.kind === 'stream') out = await runProbeStream(t, t.id === 'stream-true')
        else if (t.kind === 'cache') out = await runProbeCache(t.format!)
        else out = await runProbeExtra(t.subtype!)
        resultsObj[key] = out
        setTestStatus(key, out.status, out.detail)
        completed++
        updateProgress(`${t.name}：${PROBE_STATUS_LABELS[out.status]}`)
      }
      PROBE_TESTS.forEach(t => {
        if (!selectedRef.current[t.id]) return
        const expectedKeys = (t.kind === 'parameter' || t.kind === 'token')
          ? activeFormats.map(f => probeKey(t.id, f))
          : [t.id]
        expectedKeys.forEach(k => {
          if (!resultsObj[k]) {
            resultsObj[k] = probeResult('skipped', '测试被用户中止', { format: probeFormatOfKey(k) ?? undefined })
            setTestStatus(k, 'skipped', '测试被用户中止')
          }
        })
      })
    } finally {
      const summary: Record<ProbeStatus, number> = { passed: 0, failed: 0, unsupported: 0, skipped: 0 }
      Object.values(resultsObj).forEach(r => { summary[r.status]++ })
      const rep: ProbeReport = {
        id: 'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
        target: {
          baseUrl: cfg.baseUrl, model: cfg.model,
          overrides: { chat: chatUrl.trim() || null, responses: responsesUrl.trim() || null, anthropic: anthropicUrl.trim() || null },
        },
        results: resultsObj, summary, logs: logsRef.current,
      }
      setReport(rep)
      setHistory(saveProbeHistory({ ...rep, logs: [] }))
      setRunning(false)
      setProgress({ done: total, total, label: '测试完成' })
      setPane('report')
    }
  }

  const viewHistoryReport = (rep: ProbeReport) => {
    setReport(rep)
    setPane('report')
  }
  const reuseHistoryConfig = (rep: ProbeReport) => {
    setBaseUrl(rep.target.baseUrl)
    setModel(rep.target.model)
    setChatUrl(rep.target.overrides.chat ?? '')
    setResponsesUrl(rep.target.overrides.responses ?? '')
    setAnthropicUrl(rep.target.overrides.anthropic ?? '')
    setPane('live')
  }

  useEffect(() => {
    if (!nameModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNameModal(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nameModal])

  const exportJson = () => {
    if (!report) return
    probeDownload(JSON.stringify(report, null, 2), 'application/json', `${probeSafeName(report.name)}.json`)
  }
  const exportMd = () => {
    if (!report) return
    const r = report
    let md = `# ${r.name}\n\n`
    md += `- 开始时间: ${r.startedAt}\n- 完成时间: ${r.completedAt}\n- 总耗时: ${(r.durationMs / 1000).toFixed(1)} s\n- Base URL: ${r.target.baseUrl}\n`
    if (r.target.overrides.chat) md += `- Chat Base URL: ${r.target.overrides.chat}\n`
    if (r.target.overrides.responses) md += `- Responses Base URL: ${r.target.overrides.responses}\n`
    if (r.target.overrides.anthropic) md += `- Anthropic Base URL: ${r.target.overrides.anthropic}\n`
    md += `- 模型: ${r.target.model}\n`
    md += `- 通过: ${r.summary.passed} · 失败: ${r.summary.failed} · 不支持: ${r.summary.unsupported} · 跳过: ${r.summary.skipped}\n\n`
    for (const t of PROBE_TESTS) {
      const keys = probeResultKeysOf(t, r.results)
      if (!keys.length) continue
      md += `## ${t.name}\n\n`
      md += `> ${t.explain}\n\n`
      for (const key of keys) {
        const x = r.results[key]
        const fmtLabel = probeFormatOfKey(key) ? `（${PROBE_FORMAT_LABELS[probeFormatOfKey(key)!]}）` : ''
        md += `### ${t.name}${fmtLabel} — ${PROBE_STATUS_LABELS[x.status]}\n\n`
        md += `- 结论: ${x.detail.replaceAll('\n', ' ')}\n`
        if (x.duration != null) md += `- 耗时: ${x.duration} ms\n`
        if (x.usage && (x.usage.input != null || x.usage.output != null)) {
          md += `- 用量: 输入 ${x.usage.input ?? '—'} · 输出 ${x.usage.output ?? '—'} · 缓存读 ${x.usage.cacheRead ?? '—'} · 缓存写 ${x.usage.cacheWrite ?? '—'}\n`
        }
        if (x.cache) md += `- 缓存: 命中 ${x.cache.hits}/${x.cache.total} 次 · 读取值 ${x.cache.reads.join(', ')}\n`
        if (x.tokenValues) md += `- 每次输入 Token: ${x.tokenValues.join(', ')}\n`
        if (x.repro) {
          md += `\n复现步骤：\n\n\`\`\`\nPOST ${x.repro.url}\n`
          if (x.repro.requestId) md += `Request ID: ${x.repro.requestId}\n`
          md += `HTTP: ${x.repro.status ?? '—'}\n`
          md += `\`\`\`\n\n请求头（密钥已脱敏）：\n\n\`\`\`json\n${probeJsonPretty(x.repro.headers)}\n\`\`\`\n\n请求体：\n\n\`\`\`json\n${probeJsonPretty(x.repro.body)}\n\`\`\`\n\n`
        }
      }
    }
    probeDownload(md, 'text/markdown', `${probeSafeName(r.name)}.md`)
  }

  const statusOf = (t: ProbeTestDef): { status: ProbeStatus | 'pending' | 'running'; detail: string } => {
    if (t.kind === 'parameter' || t.kind === 'token') {
      const keys = Object.keys(statuses).filter(k => k.startsWith(t.id + '@')).sort()
      if (!keys.length) return { status: 'pending', detail: '' }
      const sts = keys.map(k => statuses[k])
      const fmtText = keys.map(k => {
        const f = k.split('@')[1]
        const s = statuses[k].status
        const mark = s === 'passed' ? '✓' : s === 'failed' ? '✗' : s === 'unsupported' ? '△' : s === 'skipped' ? '−' : '…'
        return `${f}${mark}`
      }).join('  ')
      const agg: ProbeStatus = probeAggregateStatus(sts.filter(x => x.status !== 'running' && x.status !== 'pending').map(x => ({ status: x.status as ProbeStatus })))
      if (sts.some(x => x.status === 'running')) return { status: 'running', detail: fmtText }
      if (sts.some(x => x.status === 'pending')) return { status: 'pending', detail: fmtText }
      return { status: agg, detail: fmtText }
    }
    return statuses[t.id] ?? { status: 'pending', detail: '' }
  }

  const renderLogRow = (log: ProbeLog) => {
    const open = !!openLogs[log.id]
    const ok = log.status != null && log.status >= 200 && log.status < 300
    const fmt = (v: number | null) => (v == null ? '—' : String(v))
    return (
      <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setOpenLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
          onPointerEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--s1)' }}
          onPointerLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{log.label}</span>
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px] flex-shrink-0" style={{ background: ok ? 'var(--okBg)' : 'var(--errBg)', color: ok ? 'var(--ok)' : 'var(--err)', fontFamily: PROBE_MONO }}>{log.status ?? 'ERR'}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--t3)', fontFamily: PROBE_MONO }}>{log.method} {log.url}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ProbeUsageChip usage={log.usage} />
            {log.requestId && <ProbeCopyId value={log.requestId} />}
            <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--t2)', fontFamily: PROBE_MONO }}>{log.duration} ms</span>
            <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{new Date(log.time).toLocaleTimeString()}</span>
          </div>
        </div>
        {open && (
          <div className="px-4 pb-5 lg:px-8" style={{ background: 'var(--s1)' }}>
            <div className="grid gap-4 pt-4 xl:grid-cols-2">
              <ProbeCodeBlock title="请求头（密钥已脱敏）" children={probeJsonPretty(log.requestHeaders)} />
              <ProbeCodeBlock title="请求体" children={probeJsonPretty(log.requestBody)} />
              <ProbeCodeBlock title="响应头" children={probeJsonPretty(log.responseHeaders)} />
              <ProbeCodeBlock title="响应体" children={typeof log.responseBody === 'string' ? log.responseBody : probeJsonPretty(log.responseBody)} />
            </div>
            {log.sse.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                  SSE 事件 <span className="font-normal" style={{ color: 'var(--t3)' }}>{log.sse.length} 条事件 · {log.chunks.length} 个网络数据块</span>
                </div>
                <div className="space-y-1.5">
                  {log.sse.map(ev => (
                    <details key={ev.index} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <summary className="cursor-pointer px-3 py-2 font-mono text-xs list-none" style={{ color: 'var(--text)', fontFamily: PROBE_MONO }}>
                        <span style={{ color: 'var(--t3)' }}>#{ev.index}</span> {ev.event}
                      </summary>
                      <pre className="overflow-auto max-h-48 p-3 font-mono text-[11px] leading-5" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)', fontFamily: PROBE_MONO }}>
                        {ev.json ? <code dangerouslySetInnerHTML={{ __html: highlightJson(probeJsonPretty(ev.json)) }} /> : ev.data}
                      </pre>
                    </details>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold" style={{ color: 'var(--accent)' }}>查看拼接后的原始流</summary>
                  <pre className="mt-2 overflow-auto max-h-80 rounded-xl p-3 font-mono text-[11px] leading-5" style={{ background: 'var(--code)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: PROBE_MONO }}>{probeEscapeHtml(log.chunks.join(''))}</pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.resultKey === logFilter || l.resultKey.startsWith(logFilter + '@'))

  const groups = [...new Set(PROBE_TESTS.map(t => t.group))]

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>模型探测</SectionTitle>
        <div className="ml-auto flex gap-2">
          {running ? (
            <Btn variant="danger" onClick={() => { stopRef.current = true; activeAbortRef.current?.abort() }}>⏹ 停止</Btn>
          ) : (
            <Btn variant="primary" onClick={() => { setTestName(probeNowName()); setNameModal(true) }} disabled={!apiKey.trim() || !baseUrl.trim() || !model.trim()}>▶ 开始测试</Btn>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧配置栏 */}
        <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
          <div>
            <Label className="block mb-1.5">默认 Base URL</Label>
            <CustomInput value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com" />
          </div>
          <div>
            <Label className="block mb-1.5">API Key</Label>
            <CustomInput value={apiKey} onChange={setApiKey} placeholder="sk-...（本地加密存储）" type="password" />
          </div>
          <div>
            <Label className="block mb-1.5">模型名称</Label>
            <CustomInput value={model} onChange={setModel} placeholder="gpt-4o-mini / deepseek-chat" />
          </div>
          <div>
            <Label className="block mb-1.5">请求超时（秒）</Label>
            <CustomInput value={timeoutSec} onChange={setTimeoutSec} type="number" placeholder="60" />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div className="flex items-center justify-between mb-2">
              <Label className="block">连接测试</Label>
              <Btn small variant="soft" onClick={testConnection} disabled={running || connRunning || !apiKey.trim() || !baseUrl.trim() || !model.trim()}>
                {connRunning ? '测试中…' : '测试连接'}
              </Btn>
            </div>
            <div className="space-y-1.5">
              {(['chat', 'responses', 'anthropic'] as ProbeFormat[]).map(f => {
                const r = connResults[f]
                if (!r) return null
                const color = r.ok ? 'var(--ok)' : 'var(--err)'
                const bg = r.ok ? 'var(--okBg)' : 'var(--errBg)'
                return (
                  <div key={f} data-conn={f} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                    style={{ background: bg, color: 'var(--text)' }}>
                    <span className="font-semibold flex-shrink-0" style={{ color }}>{PROBE_FORMAT_LABELS[f]}</span>
                    <span className="ml-auto font-mono text-[11px] truncate" style={{ color, fontFamily: PROBE_MONO }}>
                      {r.ok ? `✓ ${r.ms} ms` : `✗ ${(r.status ?? r.err) || '失败'}`}{!r.ok && r.err ? ` · ${r.err.length > 18 ? r.err.slice(0, 18) + '…' : r.err}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <button onClick={() => setAdvOpen(o => !o)} className="w-full flex items-center justify-between cursor-pointer border-0 outline-none text-sm font-semibold"
              style={{ background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', padding: 0 }}>
              <span>高级设置</span>
              <span style={{ color: 'var(--t3)' }}>{advOpen ? '−' : '+'}</span>
            </button>
            {advOpen && (
              <div className="mt-3 space-y-3">
                {(['chat', 'responses', 'anthropic'] as ProbeFormat[]).map(f => {
                  const val = f === 'chat' ? chatUrl : f === 'responses' ? responsesUrl : anthropicUrl
                  const setVal = f === 'chat' ? setChatUrl : f === 'responses' ? setResponsesUrl : setAnthropicUrl
                  const fallback = !val.trim()
                  return (
                    <div key={f}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--t2)' }}>{PROBE_FORMAT_LABELS[f]}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: fallback ? 'var(--s2)' : 'var(--accentSub)', color: fallback ? 'var(--t3)' : 'var(--accent)' }}>{fallback ? '回退默认' : '独立配置'}</span>
                      </div>
                      <CustomInput value={val} onChange={setVal} placeholder={baseUrl || 'https://api.example.com'} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">Token 稳定性配置</Label>
            <div className="flex gap-2">
              <CustomInput value={randomString} onChange={setRandomString} mono placeholder="FIXED-XXXX" />
              <Btn small variant="soft" onClick={() => setRandomString(probeMakeRandom())} title="重新生成随机字符串">↻</Btn>
            </div>
            <div className="mt-2.5">
              <Label className="block mb-1.5">重复请求次数</Label>
              <CustomInput value={tokenRuns} onChange={setTokenRuns} type="number" placeholder="3" />
            </div>
          </div>

          {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
          <p className="text-[11px] leading-4" style={{ color: 'var(--t3)' }}>密钥仅以加密形式保存于本浏览器。请确认目标 API 允许浏览器跨域访问。</p>
        </div>

        {/* 右侧结果区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane} onChange={v => setPane(v as 'live' | 'logs' | 'report' | 'history')} options={[
              { value: 'live', label: '实时进度' },
              { value: 'logs', label: `请求日志 (${logs.length})` },
              { value: 'report', label: '测试报告' },
              { value: 'history', label: `历史 (${history.length})` },
            ]} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {pane === 'live' && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>测试用例</h3>
                    <span className="text-xs" style={{ color: 'var(--t3)' }}>参数项会对每个已勾选的基础格式分别执行</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    <button onClick={() => { setSelected(Object.fromEntries(PROBE_TESTS.map(t => [t.id, true]))); }} disabled={running} className="cursor-pointer border-0 outline-none font-semibold" style={{ background: 'transparent', color: 'var(--accent)', fontFamily: 'inherit' }}>全选</button>
                    <span style={{ color: 'var(--borderHard)' }}>|</span>
                    <button onClick={() => { setSelected(Object.fromEntries(PROBE_TESTS.map(t => [t.id, false]))); }} disabled={running} className="cursor-pointer border-0 outline-none font-semibold" style={{ background: 'transparent', color: 'var(--t2)', fontFamily: 'inherit' }}>全不选</button>
                  </div>
                </div>

                {progress.total > 0 && (
                  <div className="px-6 pb-4 flex-shrink-0">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>{progress.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: 'var(--t2)' }}>{progress.done} / {progress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: progress.total ? (progress.done / progress.total * 100) + '%' : 0 }} />
                    </div>
                  </div>
                )}

                {groups.map(group => (
                  <div key={group}>
                    <div className="px-6 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--s1)', color: 'var(--t3)', letterSpacing: '0.08em' }}>{group}</div>
                    {PROBE_TESTS.filter(t => t.group === group).map(t => {
                      const st = statusOf(t)
                      const color = st.status === 'failed' ? 'var(--err)' : st.status === 'passed' ? 'var(--ok)' : st.status === 'unsupported' ? 'var(--warn)' : st.status === 'running' ? 'var(--accent)' : 'var(--t3)'
                      return (
                        <div key={t.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                          <input type="checkbox" data-id={t.id} checked={!!selected[t.id]} disabled={running} onChange={() => setSelected(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                            className="h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--accent)]" aria-label={`选择 ${t.name}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.name}</div>
                            <div className="text-xs truncate mt-0.5" style={{ color: 'var(--t3)' }}>{st.detail || t.desc}</div>
                          </div>
                          <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color }}>{PROBE_ROW_STATUS_LABELS[st.status] ?? st.status}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {pane === 'logs' && (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <select value={logFilter} onChange={e => setLogFilter(e.target.value)} className="rounded-lg px-3 py-2 text-sm border-0 outline-none cursor-pointer"
                    style={{ background: 'var(--inputBg)', border: '1px solid var(--inputBorder)', color: 'var(--text)', fontFamily: 'inherit' }}>
                    <option value="all">全部测试项</option>
                    {PROBE_TESTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <Btn small variant="soft" onClick={() => { logsRef.current = []; setLogs([]); setOpenLogs({}) }}>清空日志</Btn>
                </div>
                {filteredLogs.length === 0 ? (
                  <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>没有匹配的请求记录</div>
                ) : (
                  [...filteredLogs].reverse().map(renderLogRow)
                )}
              </div>
            )}

            {pane === 'report' && (
              !report ? (
                <div className="py-20 text-center text-sm" style={{ color: 'var(--t3)' }}>完成一轮测试后，报告将显示在这里</div>
              ) : (
                <div className="p-6">
                  <div className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-6">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>测试报告</div>
                        <h3 className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{report.name}</h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>{report.target.baseUrl} · {report.target.model}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--text)', fontFamily: PROBE_MONO }}>{(report.durationMs / 1000).toFixed(1)}s</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>总耗时 · {new Date(report.completedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2">
                      {(['passed', 'failed', 'unsupported', 'skipped'] as ProbeStatus[]).map(s => (
                        <div key={s}>
                          <span className="text-xs" style={{ color: 'var(--t3)' }}>{PROBE_STATUS_LABELS[s]} </span>
                          <span className="font-mono text-lg font-bold tabular-nums" style={{ color: s === 'passed' ? 'var(--ok)' : s === 'failed' ? 'var(--err)' : s === 'unsupported' ? 'var(--warn)' : 'var(--t2)', fontFamily: PROBE_MONO }}>{report.summary[s] || 0}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Btn small variant="soft" onClick={exportJson}>导出 JSON</Btn>
                      <Btn small variant="soft" onClick={exportMd}>导出 Markdown</Btn>
                    </div>
                  </div>
                  <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {PROBE_TESTS.map(t => <ProbeReportRow key={t.id} t={t} report={report} />)}
                  </div>
                </div>
              )
            )}

            {pane === 'history' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm" style={{ color: 'var(--t2)' }}>已存 {history.length} / {PROBE_HISTORY_MAX} 条历史报告</p>
                  {history.length > 0 && <Btn small variant="danger" onClick={() => { clearProbeHistory(); setHistory([]) }}>清空历史</Btn>}
                </div>
                {history.length === 0 ? (
                  <div className="py-16 text-center text-sm" style={{ color: 'var(--t3)' }}>暂无历史报告，完成一轮测试后自动入库</div>
                ) : (
                  <div className="space-y-3">
                    {history.map(h => (
                      <div key={h.id} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{h.name}</div>
                          <div className="text-xs mt-1 flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: 'var(--t3)' }}>
                            <span>{new Date(h.completedAt).toLocaleString()}</span>
                            <span className="font-mono truncate">{h.target.baseUrl} · {h.target.model}</span>
                            <span>通过 {h.summary.passed} · 失败 {h.summary.failed} · 不支持 {h.summary.unsupported}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Btn small variant="soft" onClick={() => viewHistoryReport(h)}>查看</Btn>
                          <Btn small variant="soft" onClick={() => reuseHistoryConfig(h)}>回填配置</Btn>
                          <Btn small variant="ghost" onClick={() => setHistory(deleteProbeHistory(h.id))}>删除</Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {nameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setNameModal(false) }}>
          <div role="dialog" aria-modal="true" className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>命名本次测试</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>名称会写入报告与导出文件，便于后续定位。</p>
            <CustomInput value={testName} onChange={setTestName} className="mt-4" placeholder="例如：2026-08-08 15:30:00" />
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setNameModal(false)}>取消</Btn>
              <Btn variant="primary" onClick={() => { const name = testName.trim() || probeNowName(); setNameModal(false); runProbe(name) }}>确认并开始</Btn>
            </div>
          </div>
        </div>
      )}
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
    light: '#2563eb', dark: '#ff7a45', claude: '#b5603a', green: '#3d7a54',
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
                className={"w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm font-medium cursor-pointer border-0 outline-none " + (active ? "sb-menu-item-active" : "sb-menu-item")}
                style={{ background: active ? 'var(--accentSubHard)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)', fontFamily: 'inherit' }}
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
        className={"w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border-0 outline-none transition-all duration-150 active:scale-95 " + (open ? "" : "sb-settings-btn")}
        style={{ background: open ? 'var(--accentSubHard)' : 'var(--s1)', color: open ? 'var(--accent)' : 'var(--t2)', border: '1px solid var(--border)' }}
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

  // 解析 OpenAI 图片接口的标准响应结构 { "data": [ { "b64_json": "..." }, ... ] }
  // 每个 b64_json 单独解码为二进制后按 magic bytes 嗅探真实格式，不假设固定为 PNG
  const addOpenAiB64Json = useCallback((text: string) => {
    let json: unknown
    try { json = JSON.parse(text) } catch { addToast('JSON 解析失败，请检查内容是否完整、格式是否正确', 'err'); return }
    const dataArr = (json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data))
      ? (json as { data: unknown[] }).data : null
    if (!dataArr) { addToast('未识别到 OpenAI 图片响应结构：需包含 data 数组，如 { "data": [ { "b64_json": "..." } ] }', 'err'); return }
    const found = dataArr
      .map(entry => (entry && typeof entry === 'object') ? entry as { b64_json?: unknown } : null)
      .filter((entry): entry is { b64_json?: unknown } => !!entry && typeof entry.b64_json === 'string' && (entry.b64_json as string).trim().length > 0)
      .map(entry => (entry.b64_json as string).trim())
    if (!found.length) { addToast('data[] 中未找到 b64_json 字段', 'err'); return }
    found.forEach((b64, i) => {
      const idx = i + 1
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'base64json', name: `openai-image-${idx}`,
        size: null, mime: '', status: 'loading', width: 0, height: 0,
        format: '', src: '', origin: 'OpenAI Base64 JSON',
      }
      setItems(prev => [...prev, item])
      let buf: ArrayBuffer
      try {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
        buf = bytes.buffer
      } catch {
        updateItem(id, { status: 'error', error: 'base64 解码失败，可能不是合法的 base64 字符串' }); return
      }
      const fmt = imgDetectFormat(buf) || 'PNG'
      const mimeByFmt: Record<string, string> = { JPEG: 'image/jpeg', PNG: 'image/png', GIF: 'image/gif', BMP: 'image/bmp', WebP: 'image/webp', TIFF: 'image/tiff', AVIF: 'image/avif', HEIC: 'image/heic', ICO: 'image/x-icon', SVG: 'image/svg+xml' }
      const mime = mimeByFmt[fmt] || 'image/png'
      const ext = fmt === 'JPEG' ? 'jpg' : fmt.toLowerCase()
      const dataUrl = `data:${mime};base64,${b64}`
      const img = new Image()
      img.onload = () => updateItem(id, {
        width: img.naturalWidth, height: img.naturalHeight, src: dataUrl, status: 'done',
        format: fmt, mime, size: buf.byteLength, name: `openai-image-${idx}.${ext}`,
      })
      img.onerror = () => updateItem(id, { status: 'error', error: '图片解码失败，base64 数据可能已损坏或被截断' })
      img.src = dataUrl
    })
    addToast(`已从 JSON 中解析出 ${found.length} 张图片`, 'ok')
  }, [addToast, updateItem])

  const addUrls = useCallback((text: string) => {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) { addOpenAiB64Json(trimmed); return }
    const urls = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean).filter(u => /^(https?:)?\/\/|^data:image\//i.test(u))
    if (!urls.length) { addToast('请输入有效的图片 URL（以 http(s):// 开头），或粘贴 OpenAI 图片接口返回的 JSON', 'err'); return }
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
  }, [addToast, updateItem, addOpenAiB64Json])

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
      const trimmed = text?.trim()
      if (!trimmed) return
      // 全局粘贴要保守判断，避免误触发：URL 或者「看起来像带 b64_json 的 JSON」才当图片处理
      if (/^https?:\/\//i.test(trimmed) || (trimmed.startsWith('{') && /"b64_json"/.test(trimmed))) addUrls(text!)
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
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>图片 URL 加载 <span style={{ color: 'var(--t3)' }} className="font-normal">（每行一个，可批量；也支持粘贴 OpenAI 图片接口返回的 JSON）</span></span>
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
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: it.source === 'local' ? 'var(--accent)' : it.source === 'base64json' ? 'var(--jKey)' : 'var(--warn)' }} />{it.origin}
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
        placeholder={'https://example.com/photo.jpg\nhttps://example.com/banner.png\n\n也支持粘贴 OpenAI 图片接口返回的 JSON（自动提取 data[].b64_json，可含多张）'}
        className="w-full flex-1 rounded-xl p-3 text-xs leading-relaxed resize-y outline-none transition-all duration-150"
        style={{
          background: 'var(--inputBg)', color: 'var(--text)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'none',
          fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', minHeight: 80,
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

// ─── Tool: 视频信息检测 ─────────────────────────────────────────────────────────

interface VideoItem {
  id: string; order: number; source: 'local' | 'url'; name: string
  status: 'loading' | 'done' | 'error'
  width: number; height: number; duration: number
  ratio: string; mime: string
  url?: string; error?: string
  src?: string // 探测成功后的可播放地址：url 条目为原链接，本地条目为 Blob URL（用于预览播放）
}

const VID_COMMON_RATIOS: [string, number][] = [
  ['21:9', 21 / 9], ['32:9', 32 / 9], ['16:9', 16 / 9], ['16:10', 16 / 10],
  ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:2', 3 / 2], ['1:1', 1],
  ['9:16', 9 / 16], ['9:18', 0.5], ['3:4', 3 / 4], ['2:3', 2 / 3],
]

function vidGcd(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a
}

// 宽高比：先按常见比例就近吸附（容差 0.025），否则用 GCD 化简，化简后仍过大则退化为小数形式
function vidAspectRatio(w: number, h: number): string {
  if (!w || !h) return '—'
  const r = w / h
  for (const [label, val] of VID_COMMON_RATIOS) {
    if (Math.abs(r - val) < 0.025) return label
  }
  const d = vidGcd(w, h)
  const sw = w / d, sh = h / d
  if (sw > 200 || sh > 200) return r.toFixed(2) + ':1'
  return `${sw}:${sh}`
}

function vidFormatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const VID_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg',
  mov: 'video/quicktime', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mkv: 'video/x-matroska', m4v: 'video/mp4', '3gp': 'video/3gpp', ts: 'video/mp2t', mts: 'video/mp2t',
}
const VID_VALID_EXTS = Object.keys(VID_MIME_MAP)

function vidExtFromName(nameOrUrl: string): string {
  try {
    const clean = nameOrUrl.split(/[?#]/)[0]
    const last = clean.split('/').pop() || clean
    return (last.split('.').pop() || '').toLowerCase()
  } catch { return '' }
}

function vidMimeFromName(nameOrUrl: string): string {
  const ext = vidExtFromName(nameOrUrl)
  return VID_MIME_MAP[ext] || ext || '未知'
}

function vidIsVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return VID_VALID_EXTS.includes(vidExtFromName(file.name))
}

function vidDisplayNameFromUrl(url: string): string {
  try {
    const clean = url.split(/[?#]/)[0]
    return decodeURIComponent(clean.split('/').pop() || url) || url
  } catch { return url }
}

// 探测视频元数据：不挂载 DOM 的 <video preload="metadata">，超时/失败均 reject 并清空 src 释放资源
function probeVideoMeta(src: string, timeoutMs = 20000): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      video.src = ''
      reject(new Error(`加载超时（${Math.round(timeoutMs / 1000)}s），请检查链接是否可访问`))
    }, timeoutMs)
    video.onloadedmetadata = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const { videoWidth: width, videoHeight: height, duration } = video
      video.src = ''
      if (!width || !height) { reject(new Error('无法读取视频尺寸，文件可能已损坏或格式不受支持')); return }
      resolve({ width, height, duration })
    }
    video.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.src = ''
      reject(new Error('无法加载视频，链接可能已失效或不允许访问'))
    }
    video.src = src
  })
}

let vidCounter = 0

function VideoAnalyzerTool() {
  const [items, setItems] = useState<VideoItem[]>([])
  const [urlText, setUrlText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [formMsg, setFormMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewItem, setPreviewItem] = useState<VideoItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 本地文件生成的 Blob URL 需要手动释放：探测成功后保留供预览播放，条目被移除/重新检测/组件卸载时统一回收
  const localBlobUrlsRef = useRef<Set<string>>(new Set())

  const updateItem = useCallback((id: string, patch: Partial<VideoItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  // 卸载时兜底释放所有未回收的本地文件 Blob URL
  useEffect(() => {
    return () => { localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u)) }
  }, [])

  // Esc 关闭预览播放器
  useEffect(() => {
    if (!previewItem) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewItem(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewItem])

  const addPendingFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(vidIsVideoFile)
    if (!files.length) { setFormMsg('未检测到有效的视频文件'); return }
    setFormMsg(null)
    setPendingFiles(prev => [...prev, ...files])
  }, [])

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id)
      if (target?.source === 'local' && target.src) {
        URL.revokeObjectURL(target.src)
        localBlobUrlsRef.current.delete(target.src)
      }
      return prev.filter(i => i.id !== id)
    })
    setPreviewItem(p => (p && p.id === id ? null : p))
  }, [])

  const clearAll = useCallback(() => {
    localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    localBlobUrlsRef.current.clear()
    setUrlText(''); setPendingFiles([]); setItems([]); setFormMsg(null); setPreviewItem(null)
  }, [])

  const runDetect = useCallback(() => {
    if (busy) return
    const urls = urlText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).filter(u => /^https?:\/\//i.test(u))
    const files = pendingFiles.slice()
    if (!urls.length && !files.length) {
      setFormMsg('请输入至少一个视频链接，或选择/拖拽本地视频文件')
      return
    }
    setFormMsg(null)
    setBusy(true)
    setPreviewItem(null)
    // 本次检测会整体替换结果列表，先回收上一轮本地文件残留的 Blob URL，避免内存泄漏
    localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    localBlobUrlsRef.current.clear()

    const urlItems: VideoItem[] = urls.map(url => ({
      id: Math.random().toString(36).slice(2, 10), order: vidCounter++, source: 'url',
      name: vidDisplayNameFromUrl(url), status: 'loading', width: 0, height: 0, duration: 0,
      ratio: '', mime: vidMimeFromName(url), url,
    }))
    const fileItems: VideoItem[] = files.map(f => ({
      id: Math.random().toString(36).slice(2, 10), order: vidCounter++, source: 'local',
      name: f.name, status: 'loading', width: 0, height: 0, duration: 0,
      ratio: '', mime: f.type || vidMimeFromName(f.name),
    }))
    setItems([...urlItems, ...fileItems])

    const tasks: Promise<void>[] = []
    urlItems.forEach((item, i) => {
      const url = urls[i]
      tasks.push(
        probeVideoMeta(url)
          .then(meta => updateItem(item.id, { status: 'done', width: meta.width, height: meta.height, duration: meta.duration, ratio: vidAspectRatio(meta.width, meta.height), src: url }))
          .catch((err: Error) => updateItem(item.id, { status: 'error', error: err.message || '检测失败' }))
      )
    })
    fileItems.forEach((item, i) => {
      const file = files[i]
      const blobUrl = URL.createObjectURL(file)
      localBlobUrlsRef.current.add(blobUrl)
      tasks.push(
        probeVideoMeta(blobUrl)
          .then(meta => updateItem(item.id, { status: 'done', width: meta.width, height: meta.height, duration: meta.duration, ratio: vidAspectRatio(meta.width, meta.height), src: blobUrl }))
          .catch((err: Error) => {
            URL.revokeObjectURL(blobUrl)
            localBlobUrlsRef.current.delete(blobUrl)
            updateItem(item.id, { status: 'error', error: err.message || '检测失败' })
          })
      )
    })

    Promise.allSettled(tasks).then(() => setBusy(false))
  }, [busy, urlText, pendingFiles, updateItem])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) addPendingFiles(e.dataTransfer.files)
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12 space-y-6">
      <div>
        <SectionTitle>视频信息检测</SectionTitle>
        <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>粘贴视频直链（支持多个，一行一个）或上传本地视频文件，批量获取分辨率、时长、宽高比与格式信息</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Label className="block mb-1.5">视频 URL 链接</Label>
          <CustomTextarea
            value={urlText} onChange={setUrlText} rows={7} mono
            placeholder={'粘贴视频直链，每行一个\n例如：https://example.com/a.mp4'}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runDetect() } }}
          />
        </Card>
        <Card>
          <Label className="block mb-1.5">本地视频文件</Label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
            onDrop={onDrop}
            className={`rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${dragOver ? 'ia-drag-active' : ''}`}
            style={{ border: '2px dashed var(--border)', background: 'var(--s1)' }}
          >
            <div className="flex justify-center mb-2" style={{ color: 'var(--t3)', transform: 'scale(1.8)' }}><IconVideo /></div>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>拖拽视频文件到此处，或<span style={{ color: 'var(--accent)', fontWeight: 600 }}>点击选择</span></p>
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>支持 MP4 / WebM / MOV / MKV 等常见格式，可多选</p>
            <input ref={fileInputRef} type="file" multiple accept="video/*" className="hidden" onChange={e => { if (e.target.files?.length) addPendingFiles(e.target.files); e.target.value = '' }} />
          </div>
          {pendingFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              {pendingFiles.map((f, idx) => (
                <div key={f.name + idx} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--s1)' }}>
                  <span className="truncate" style={{ color: 'var(--text)' }} title={f.name}>{f.name}</span>
                  <button onClick={() => removePendingFile(idx)} className="flex-shrink-0 transition-colors duration-100" style={{ color: 'var(--t3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}>移除</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Btn variant="accent" onClick={runDetect} disabled={busy}>{busy ? '检测中…' : '开始检测'}</Btn>
        <Btn variant="soft" onClick={clearAll}>清除全部</Btn>
        <span className="text-xs" style={{ color: 'var(--t3)' }}>Ctrl / Cmd + Enter 快速检测</span>
        {formMsg && <span className="text-xs" style={{ color: 'var(--err)' }}>{formMsg}</span>}
      </div>

      {items.length > 0 ? (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--t3)' }}>共 {items.length} 个 · 成功 {doneCount} · 失败 {errorCount}</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead style={{ background: 'var(--s1)' }}>
                  <tr className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t2)' }}>
                    {['预览', '来源', '分辨率', '时长', '宽高比', '格式 / MIME', '状态', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    // 缩略图：本地/URL 探测成功后用小号 <video> 静音展示第一帧，默认不播放，点击放大观看
                    const thumbCell = (
                      <td className="px-4 py-2">
                        {it.status === 'done' && it.src ? (
                          <div
                            onClick={() => setPreviewItem(it)}
                            className="w-16 h-11 rounded-lg overflow-hidden cursor-zoom-in flex items-center justify-center"
                            style={{ background: '#000', border: '1px solid var(--border)' }}
                            title="点击放大观看"
                          >
                            <video
                              src={it.src} muted playsInline preload="metadata"
                              className="w-full h-full object-cover pointer-events-none"
                              onLoadedMetadata={e => { try { e.currentTarget.currentTime = Math.min(0.1, (e.currentTarget.duration || 1) / 2) } catch { /* ignore */ } }}
                            />
                          </div>
                        ) : it.status === 'loading' ? (
                          <div className="w-16 h-11 rounded-lg ia-shimmer" />
                        ) : (
                          <div className="w-16 h-11 rounded-lg flex items-center justify-center" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
                            <IconVideo />
                          </div>
                        )}
                      </td>
                    )
                    const nameCell = (
                      <td className="px-4 py-3 text-xs max-w-[220px] truncate" style={{ color: 'var(--text)' }} title={it.url || it.name}>
                        {it.source === 'url' ? '🔗 ' : '📄 '}{it.name}
                      </td>
                    )
                    if (it.status === 'loading') {
                      return (
                        <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                          {thumbCell}
                          {nameCell}
                          <td className="px-4 py-3" colSpan={6}><div className="h-6 rounded ia-shimmer" /></td>
                        </tr>
                      )
                    }
                    if (it.status === 'error') {
                      return (
                        <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                          {thumbCell}
                          {nameCell}
                          <td className="px-4 py-3 text-xs" colSpan={4} style={{ color: 'var(--err)' }}>{it.error}</td>
                          <td className="px-4 py-3"><Badge color="err">失败</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeItem(it.id)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>移除</button>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                        {thumbCell}
                        {nameCell}
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text)' }}>{vidFormatDuration(it.duration)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{it.ratio}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{it.mime}</td>
                        <td className="px-4 py-3"><Badge color="ok">成功</Badge></td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => setPreviewItem(it)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>预览</button>
                          <button onClick={() => removeItem(it.id)} className="ml-3 text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>移除</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl py-16 text-center" style={{ background: 'var(--s1)', border: '1px dashed var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--t3)' }}>还没有检测结果，粘贴视频链接或上传本地文件后点击「开始检测」</p>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--t3)' }}>所有检测均在浏览器本地完成，视频数据不会上传至任何服务器</p>

      {/* 预览播放器：点击表格中的成功条目放大观看 */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewItem(null) }}
        >
          <div className="max-w-4xl w-full max-h-full flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)' }} title={previewItem.url || previewItem.name}>{previewItem.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>
                  {previewItem.width} × {previewItem.height} px · {vidFormatDuration(previewItem.duration)} · {previewItem.ratio} · {previewItem.mime}
                </p>
              </div>
              <Btn small variant="soft" onClick={() => setPreviewItem(null)}>关闭 ✕</Btn>
            </div>
            <div className="rounded-xl overflow-hidden flex items-center justify-center min-h-0" style={{ border: '1px solid var(--border)', background: '#000' }}>
              {previewItem.src && (
                <video key={previewItem.id} src={previewItem.src} controls autoPlay className="max-w-full max-h-[72vh]" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
                className={"w-full text-left px-3 py-2.5 rounded-xl cursor-pointer border-0 outline-none active:scale-[0.98] " + (active ? "sb-nav-item-active" : "sb-nav-item")}
                style={{ fontFamily: 'inherit' }}
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
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace' }}>{opts.rand.len}</span>
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
            <code className="flex-1 text-sm font-semibold" style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', overflowWrap: 'anywhere' }}>{first}</code>
            <CopyBtn text={first} />
          </div>
        )}
        <div
          className="idgen-result rounded-xl overflow-auto p-4 text-xs leading-relaxed"
          style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', color: 'var(--text)', whiteSpace: 'pre', maxHeight: 460 }}
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

// ─── GraphQL Utilities ────────────────────────────────────────────────────

const GQL_KEYWORDS = new Set([
  'query', 'mutation', 'subscription', 'fragment', 'on', 'type', 'input',
  'enum', 'union', 'interface', 'scalar', 'extend', 'implements', 'schema',
  'directive', 'repeatable',
])

interface GqlToken {
  type: 'keyword' | 'type' | 'string' | 'blockstring' | 'number' | 'boolean' | 'null'
    | 'comment' | 'variable' | 'directive' | 'spread' | 'punc' | 'name' | 'argname' | 'ws'
  value: string
}

function graphqlTokenize(text: string): GqlToken[] {
  const tokens: GqlToken[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let ws = ''
      while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
        ws += text[i]; i++
      }
      tokens.push({ type: 'ws', value: ws })
      continue
    }

    // Comment
    if (ch === '#') {
      let comment = ''
      while (i < len && text[i] !== '\n') { comment += text[i]; i++ }
      tokens.push({ type: 'comment', value: comment })
      continue
    }

    // String (single-line or block)
    if (ch === '"') {
      if (text.slice(i, i + 3) === '"""') {
        let s = '"""'
        i += 3
        while (i < len) {
          if (text.slice(i, i + 3) === '"""') { s += '"""'; i += 3; break }
          s += text[i]; i++
        }
        tokens.push({ type: 'blockstring', value: s })
      } else {
        let s = '"'
        i++
        while (i < len && text[i] !== '"') {
          if (text[i] === '\\') { s += '\\'; i++; if (i < len) { s += text[i]; i++ } }
          else { s += text[i]; i++ }
        }
        if (i < len) { s += '"'; i++ }
        tokens.push({ type: 'string', value: s })
      }
      continue
    }

    // Numbers
    if (/\d/.test(ch) || (ch === '-' && /\d/.test(text[i + 1]))) {
      let num = ''
      if (ch === '-') { num += '-'; i++ }
      while (i < len && /\d/.test(text[i])) { num += text[i]; i++ }
      if (text[i] === '.') { num += '.'; i++; while (i < len && /\d/.test(text[i])) { num += text[i]; i++ } }
      if (text[i] === 'e' || text[i] === 'E') {
        num += text[i]; i++
        if (text[i] === '+' || text[i] === '-') { num += text[i]; i++ }
        while (i < len && /\d/.test(text[i])) { num += text[i]; i++ }
      }
      tokens.push({ type: 'number', value: num })
      continue
    }

    // Spread operator
    if (text.slice(i, i + 3) === '...') {
      tokens.push({ type: 'spread', value: '...' }); i += 3; continue
    }

    // Variable
    if (ch === '$') {
      let v = '$'; i++
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { v += text[i]; i++ }
      tokens.push({ type: 'variable', value: v })
      continue
    }

    // Directive
    if (ch === '@') {
      let d = '@'; i++
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { d += text[i]; i++ }
      tokens.push({ type: 'directive', value: d })
      continue
    }

    // Punctuation
    if ('{}()[]:,!='.includes(ch)) {
      tokens.push({ type: 'punc', value: ch }); i++; continue
    }

    // Identifiers & keywords
    if (/[A-Za-z_]/.test(ch)) {
      let word = ''
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { word += text[i]; i++ }

      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word })
      } else if (word === 'null') {
        tokens.push({ type: 'null', value: word })
      } else if (GQL_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word })
      } else if (/[A-Z]/.test(word[0])) {
        tokens.push({ type: 'type', value: word })
      } else {
        // Check if this is an argument name (identifier followed by colon, ignoring whitespace)
        // We'll do a lookahead for this
        let j = i
        while (j < len && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++
        if (j < len && text[j] === ':') {
          tokens.push({ type: 'argname', value: word })
        } else {
          tokens.push({ type: 'name', value: word })
        }
      }
      continue
    }

    // Skip any other character
    tokens.push({ type: 'punc', value: ch }); i++
  }

  return tokens
}

function formatGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  const out: string[] = []
  let indent = 0
  const INDENT_STR = '  '

  // Helper to determine if we should add a newline before closing bracket
  const shouldBreak = (tokens: GqlToken[], idx: number): boolean => {
    // If the matching open bracket was on a different line, break
    if (idx <= 0) return false
    // Check if there's content between the brackets
    let depth = 1
    let j = idx - 1
    while (j >= 0 && depth > 0) {
      const t = tokens[j]
      if (t.type === 'punc' && (t.value === '}' || t.value === ')' || t.value === ']')) depth++
      if (t.type === 'punc' && (t.value === '{' || t.value === '(' || t.value === '[')) depth--
      if (depth === 0) break
      j--
    }
    // Found matching open bracket at j
    // Check if there are any non-ws tokens between j and idx
    let k = j + 1
    while (k < idx) {
      if (tokens[k].type !== 'ws') return true
      k++
    }
    return false
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t.type === 'ws') {
      // Skip whitespace — we'll add our own
      continue
    }

    if (t.type === 'comment') {
      out.push('\n' + INDENT_STR.repeat(indent) + t.value)
      continue
    }

    if (t.type === 'punc') {
      if (t.value === '{' || t.value === '(' || t.value === '[') {
        // Check if next non-ws token is a closing bracket
        let nextNonWs = -1
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type !== 'ws') { nextNonWs = j; break }
        }
        const closeMap: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
        if (nextNonWs >= 0 && tokens[nextNonWs].value === closeMap[t.value]) {
          // Empty brackets — keep on same line
          out.push(t.value)
          continue
        }
        out.push(t.value)
        indent++
        out.push('\n' + INDENT_STR.repeat(indent))
        continue
      }
      if (t.value === '}' || t.value === ')' || t.value === ']') {
        indent = Math.max(0, indent - 1)
        // Check if the content inside was empty
        if (shouldBreak(tokens, i)) {
          out.push('\n' + INDENT_STR.repeat(indent))
        }
        out.push(t.value)
        // Look ahead — if next non-ws is not a closing bracket/comma, add newline
        let nextNonWs = -1
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type !== 'ws') { nextNonWs = j; break }
        }
        if (nextNonWs >= 0 && tokens[nextNonWs].type === 'punc' && tokens[nextNonWs].value === ',') {
          // comma will be handled below
        } else if (nextNonWs >= 0 && tokens[nextNonWs].type !== 'punc') {
          out.push('\n' + INDENT_STR.repeat(indent))
        } else if (nextNonWs >= 0 && tokens[nextNonWs].type === 'punc' && '}])'.includes(tokens[nextNonWs].value)) {
          // Multiple closing brackets — no newline between them
        } else if (nextNonWs >= 0) {
          out.push('\n' + INDENT_STR.repeat(indent))
        }
        continue
      }
      if (t.value === ',') {
        // Skip commas in formatted output (we use newlines instead)
        continue
      }
      if (t.value === ':') {
        out.push(': ')
        continue
      }
      out.push(t.value)
      continue
    }

    // Add space before value if previous output doesn't end with whitespace or opening bracket
    const last = out[out.length - 1] || ''
    if (last.length > 0 && !last.endsWith(' ') && !last.endsWith('\n') && !last.endsWith('(') && !last.endsWith('[') && !last.endsWith('{') && !last.endsWith(':') && !last.endsWith('!') && !last.endsWith(',')) {
      out.push(' ')
    }

    out.push(t.value)
  }

  return out.join('').trim()
}

function compressGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  const out: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'comment' || t.type === 'ws') continue

    // Add space between identifiers/keywords/types/etc
    if (out.length > 0) {
      const prev = tokens[i - 1]
      if (prev && prev.type !== 'ws' && prev.type !== 'comment') {
        const needSpace = (
          (t.type === 'name' || t.type === 'keyword' || t.type === 'type' || t.type === 'boolean' || t.type === 'null' || t.type === 'variable' || t.type === 'argname') &&
          (prev.type === 'name' || prev.type === 'keyword' || prev.type === 'type' || prev.type === 'boolean' || prev.type === 'null' || prev.type === 'variable' || prev.type === 'argname' || prev.type === 'number' || prev.type === 'string' || prev.type === 'blockstring')
        )
        if (needSpace || (t.type === 'spread' && prev.type === 'name') || (t.type === 'name' && prev.type === 'spread')) {
          out.push(' ')
        }
      }
    }

    out.push(t.value)
  }

  return out.join('').trim()
}

function highlightGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  let html = ''

  for (const t of tokens) {
    if (t.type === 'ws') {
      html += t.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;')
      continue
    }
    const safe = t.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html += `<span class="gql-${t.type}">${safe}</span>`
  }

  return html
}

function unescapeString(text: string): string {
  let result = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const next = text[i + 1]
      switch (next) {
        case '"':  result += '"'; break
        case '\\': result += '\\'; break
        case 'n':  result += '\n'; break
        case 't':  result += '\t'; break
        case 'r':  result += '\r'; break
        case '/':  result += '/'; break
        case 'b':  result += '\b'; break
        case 'f':  result += '\f'; break
        default:   result += '\\' + next; break
      }
      i += 2
    } else {
      result += text[i]; i++
    }
  }
  // Check if result is valid JSON and format it
  try {
    const parsed = JSON.parse(result)
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2)
    }
  } catch { /* not JSON */ }
  return result
}

// ─── Tool: GraphQL 格式化 ───────────────────────────────────────────────────

const GQL_HISTORY_MAX = 80

function useGqlHistory(initial: string) {
  const undoStack = useRef<string[]>([initial])
  const redoStack = useRef<string[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback((val: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const last = undoStack.current[undoStack.current.length - 1]
      if (last !== val) {
        undoStack.current.push(val)
        if (undoStack.current.length > GQL_HISTORY_MAX) undoStack.current.shift()
        redoStack.current = []
      }
    }, 400)
  }, [])

  const undo = useCallback((current: string, setVal: (v: string) => void) => {
    if (undoStack.current.length > 1) {
      redoStack.current.push(current)
      const prev = undoStack.current.pop()!
      setVal(prev)
    }
  }, [])

  const redo = useCallback((current: string, setVal: (v: string) => void) => {
    if (redoStack.current.length > 0) {
      undoStack.current.push(current)
      const next = redoStack.current.pop()!
      setVal(next)
    }
  }, [])

  return { save, undo, redo }
}

function GraphqlTool() {
  const [leftText, setLeftText] = useState('')
  const [rightText, setRightText] = useState('')
  const [leftPreUnescape, setLeftPreUnescape] = useState<string | null>(null)
  const [rightPreUnescape, setRightPreUnescape] = useState<string | null>(null)
  const [leftFocused, setLeftFocused] = useState(false)
  const [rightFocused, setRightFocused] = useState(false)
  const [split, setSplit] = useState(50) // percentage for left panel
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const leftTaRef = useRef<HTMLTextAreaElement>(null)
  const rightTaRef = useRef<HTMLTextAreaElement>(null)

  // History hooks
  const leftHistory = useGqlHistory('')
  const rightHistory = useGqlHistory('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }, [])

  // Shared operation: apply function to a panel
  const applyToPanel = useCallback((
    side: 'left' | 'right',
    fn: (text: string) => string,
    extra?: { preUnescape?: string | null }
  ) => {
    const text = side === 'left' ? leftText : rightText
    const result = fn(text)
    if (side === 'left') {
      setLeftText(result)
      if (extra?.preUnescape !== undefined) setLeftPreUnescape(extra.preUnescape)
    } else {
      setRightText(result)
      if (extra?.preUnescape !== undefined) setRightPreUnescape(extra.preUnescape)
    }
  }, [leftText, rightText])

  const formatLeft = useCallback(() => {
    applyToPanel('left', formatGraphql)
    showToast('格式化完成')
  }, [applyToPanel, showToast])
  const formatRight = useCallback(() => {
    applyToPanel('right', formatGraphql)
    showToast('格式化完成')
  }, [applyToPanel, showToast])

  const compressLeft = useCallback(() => {
    applyToPanel('left', compressGraphql)
    showToast('压缩完成')
  }, [applyToPanel, showToast])
  const compressRight = useCallback(() => {
    applyToPanel('right', compressGraphql)
    showToast('压缩完成')
  }, [applyToPanel, showToast])

  const unescapeLeft = useCallback(() => {
    const text = leftText
    const result = unescapeString(text)
    setLeftText(result)
    setLeftPreUnescape(text)
    showToast('反转义完成')
  }, [leftText, showToast])
  const unescapeRight = useCallback(() => {
    const text = rightText
    const result = unescapeString(text)
    setRightText(result)
    setRightPreUnescape(text)
    showToast('反转义完成')
  }, [rightText, showToast])

  const restoreLeft = useCallback(() => {
    if (leftPreUnescape != null) {
      setLeftText(leftPreUnescape)
      setLeftPreUnescape(null)
      showToast('已还原转义')
    }
  }, [leftPreUnescape, showToast])
  const restoreRight = useCallback(() => {
    if (rightPreUnescape != null) {
      setRightText(rightPreUnescape)
      setRightPreUnescape(null)
      showToast('已还原转义')
    }
  }, [rightPreUnescape, showToast])

  const copyLeft = useCallback(() => {
    if (!leftText) { showToast('编辑器为空'); return }
    navigator.clipboard.writeText(leftText).then(() => showToast('已复制'))
  }, [leftText, showToast])
  const copyRight = useCallback(() => {
    if (!rightText) { showToast('编辑器为空'); return }
    navigator.clipboard.writeText(rightText).then(() => showToast('已复制'))
  }, [rightText, showToast])

  const clearLeft = useCallback(() => {
    setLeftText('')
    setLeftPreUnescape(null)
  }, [])
  const clearRight = useCallback(() => {
    setRightText('')
    setRightPreUnescape(null)
  }, [])

  // Undo/Redo
  const undoLeft = useCallback(() => {
    leftHistory.undo(leftText, setLeftText)
  }, [leftHistory, leftText])
  const redoLeft = useCallback(() => {
    leftHistory.redo(leftText, setLeftText)
  }, [leftHistory, leftText])
  const undoRight = useCallback(() => {
    rightHistory.undo(rightText, setRightText)
  }, [rightHistory, rightText])
  const redoRight = useCallback(() => {
    rightHistory.redo(rightText, setRightText)
  }, [rightHistory, rightText])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isLeft = leftFocused
      const isRight = rightFocused
      if (!isLeft && !isRight) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (isLeft) undoLeft()
        else undoRight()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (isLeft) redoLeft()
        else redoRight()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [leftFocused, rightFocused, undoLeft, undoRight, redoLeft, redoRight])

  // Smart indentation and paste auto-format
  const handleKeyDown = (side: 'left' | 'right', e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const { selectionStart, selectionEnd } = ta
    const val = side === 'left' ? leftText : rightText
    const setVal = side === 'left' ? setLeftText : setRightText

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        // Shift+Tab: remove 2 spaces from start of line
        const startLine = val.slice(0, selectionStart).lastIndexOf('\n') + 1
        const lineStart = val.slice(startLine, selectionStart)
        const remove = lineStart.startsWith('  ') ? 2 : lineStart.startsWith(' ') ? 1 : 0
        const newVal = val.slice(0, startLine) + lineStart.slice(remove) + val.slice(selectionStart)
        setVal(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart - remove
        })
      } else {
        // Tab: insert 2 spaces
        const newVal = val.slice(0, selectionStart) + '  ' + val.slice(selectionEnd)
        setVal(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 2
        })
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const lineStart = val.slice(0, selectionStart).lastIndexOf('\n') + 1
      const currentLine = val.slice(lineStart, selectionStart)
      const indent = currentLine.match(/^\s*/)?.[0] || ''
      // Check if previous line ends with opening bracket
      const trimmed = currentLine.trimEnd()
      const extraIndent = trimmed.endsWith('{') || trimmed.endsWith('(') || trimmed.endsWith('[') ? '  ' : ''
      const newVal = val.slice(0, selectionStart) + '\n' + indent + extraIndent + val.slice(selectionEnd)
      setVal(newVal)
      requestAnimationFrame(() => {
        const pos = selectionStart + 1 + indent.length + extraIndent.length
        ta.selectionStart = ta.selectionEnd = pos
      })
      return
    }

    // Auto-dedent for closing brackets
    if ('}])'.includes(e.key)) {
      const lineStart = val.slice(0, selectionStart).lastIndexOf('\n') + 1
      const beforeCursor = val.slice(lineStart, selectionStart)
      if (beforeCursor.trim() === '' && beforeCursor.length >= 2) {
        e.preventDefault()
        const dedented = beforeCursor.slice(0, -2)
        const newVal = val.slice(0, lineStart) + dedented + e.key + val.slice(selectionEnd)
        setVal(newVal)
        requestAnimationFrame(() => {
          const pos = lineStart + dedented.length + 1
          ta.selectionStart = ta.selectionEnd = pos
        })
        return
      }
    }
  }

  // Paste auto-format via native paste
  const handlePaste = (side: 'left' | 'right', e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Let the paste happen naturally, then after a tick, try to format
    const setVal = side === 'left' ? setLeftText : setRightText
    const ta = e.currentTarget
    requestAnimationFrame(() => {
      const formatted = formatGraphql(ta.value)
      if (formatted !== ta.value) {
        setVal(formatted)
      }
    })
  }

  // Draggable splitter
  const handleSplitMouseDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX
    const startSplit = split
    const container = containerRef.current
    if (!container) return

    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      const clamped = Math.max(2, Math.min(98, pct))
      setSplit(clamped)
    }

    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [split])

  const handleSplitDoubleClick = useCallback(() => {
    setSplit(50)
  }, [])

  // Line/char count
  const leftLines = leftText ? leftText.split('\n').length : 0
  const leftChars = leftText.length
  const rightLines = rightText ? rightText.split('\n').length : 0
  const rightChars = rightText.length

  // Save history on text change
  useEffect(() => { leftHistory.save(leftText) }, [leftText, leftHistory])
  useEffect(() => { rightHistory.save(rightText) }, [rightText, rightHistory])

  // Compute highlight HTML outside of renderPanel to avoid hooks-in-regular-function issue
  const leftHighlightHtml = useMemo(() => highlightGraphql(leftText), [leftText])
  const rightHighlightHtml = useMemo(() => highlightGraphql(rightText), [rightText])

  // Render a single panel
  const renderPanel = (side: 'left' | 'right') => {
    const text = side === 'left' ? leftText : rightText
    const setText = side === 'left' ? setLeftText : setRightText
    const setFocused = side === 'left' ? setLeftFocused : setRightFocused
    const taRef = side === 'left' ? leftTaRef : rightTaRef
    const preUnescape = side === 'left' ? leftPreUnescape : rightPreUnescape
    const highlightHtml = side === 'left' ? leftHighlightHtml : rightHighlightHtml
    const lines = text ? text.split('\n').length : 0
    const chars = text.length

    // Scroll sync between textarea and highlight layer
    const syncScroll = () => {
      const ta = taRef.current
      if (!ta) return
      const highlight = ta.previousElementSibling as HTMLElement | null
      if (highlight) {
        highlight.scrollTop = ta.scrollTop
        highlight.scrollLeft = ta.scrollLeft
      }
    }

    return (
      <div className="flex flex-col h-full" style={{ minWidth: 0 }}>
        {/* Status bar */}
        <div className="flex items-center gap-3 px-4 py-1.5 text-xs flex-shrink-0" style={{ color: 'var(--t3)', borderBottom: '1px solid var(--border)' }}>
          <span className="tabular-nums">{lines} 行 · {chars} 字符</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <Btn onClick={side === 'left' ? formatLeft : formatRight} small variant="soft">格式化</Btn>
          <Btn onClick={side === 'left' ? compressLeft : compressRight} small variant="soft">压缩</Btn>
          <Btn onClick={side === 'left' ? unescapeLeft : unescapeRight} small variant="soft">反转义</Btn>
          <Btn
            onClick={side === 'left' ? restoreLeft : restoreRight}
            small variant="soft"
            disabled={preUnescape == null}
          >还原转义</Btn>
          <div className="ml-auto flex items-center gap-1.5">
            <Btn onClick={side === 'left' ? copyLeft : copyRight} small variant="ghost">复制</Btn>
            <Btn onClick={side === 'left' ? clearLeft : clearRight} small variant="ghost">清空</Btn>
          </div>
        </div>

        {/* Code editor area */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
          {/* Syntax highlight layer */}
          <div
            className="absolute inset-0 overflow-auto pointer-events-none"
            style={{
              fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.65,
              padding: '10px 12px',
              whiteSpace: 'pre',
              tabSize: 2,
              color: 'var(--text)',
            }}
            dangerouslySetInnerHTML={{ __html: highlightHtml || '​' }}
          />
          {/* Textarea */}
          <textarea
            ref={taRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => handleKeyDown(side, e)}
            onPaste={e => handlePaste(side, e)}
            onScroll={syncScroll}
            spellCheck={false}
            autoComplete="off"
            className="absolute inset-0 resize-none outline-none"
            style={{
              width: '100%',
              height: '100%',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace',
              lineHeight: 1.65,
              color: 'transparent',
              caretColor: 'var(--text)',
              whiteSpace: 'pre',
              tabSize: 2,
              overflow: 'auto',
              WebkitTextFillColor: 'transparent',
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>GraphQL 格式化</SectionTitle>
      </div>

      {/* Panels area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden" style={{ position: 'relative' }}>
        {/* Left panel */}
        <div style={{ width: `${split}%`, flexShrink: 0, overflow: 'hidden', borderRight: dragging ? 'none' : '1px solid var(--border)' }}>
          {renderPanel('left')}
        </div>

        {/* Splitter */}
        <div
          className="flex-shrink-0 cursor-col-resize select-none"
          style={{
            width: 6,
            cursor: 'col-resize',
            position: 'relative',
            zIndex: 10,
            background: dragging ? 'var(--accent)' : 'transparent',
            transition: dragging ? 'none' : 'background 0.15s ease',
          }}
          onPointerDown={handleSplitMouseDown}
          onDoubleClick={handleSplitDoubleClick}
          onPointerEnter={e => { if (!dragging) (e.currentTarget as HTMLElement).style.background = 'var(--accentSub)' }}
          onPointerLeave={e => { if (!dragging) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: 'none' }}
          >
            <div style={{ width: 2, height: 24, borderRadius: 1, background: 'var(--t3)', opacity: 0.5 }} />
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {renderPanel('right')}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium pointer-events-none"
          style={{
            background: 'var(--text)',
            color: 'var(--bg)',
            boxShadow: 'var(--shadowMd)',
            animation: 'ia-ti .35s cubic-bezier(.34,1.56,.64,1) both',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const FULLHEIGHT_TOOLS: ToolKey[] = ['json', 'aiconvert', 'llmbatch', 'modelprobe', 'base64', 'unicode', 'graphql']

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
    modelprobe: <ModelProbeTool />,
    imganalyze: <ImageAnalyzerTool />,
    videoanalyze: <VideoAnalyzerTool />,
    idgen: <IdGenTool />,
    base64: <Base64Tool />,
    unicode: <UnicodeTool />,
    graphql: <GraphqlTool />,
  }

  return (
    <div className={themeX ? 'theme-x' : undefined} style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', ...cssVars,
      backgroundImage: 'var(--bgGrad)',
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
