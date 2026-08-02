import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemeKey = 'light' | 'dark' | 'claude' | 'green'
type ToolKey = 'seedance' | 'json' | 'timestamp' | 'aiconvert' | 'llmbatch'

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

const TOOLS: { key: ToolKey; label: string; sub: string; icon: React.ReactNode }[] = [
  { key: 'seedance', label: 'Seedance 计费', sub: '字节跳动 AI 视频', icon: <IconSeedance /> },
  { key: 'json', label: 'JSON 可视化', sub: '格式化 · 对比 · 折叠', icon: <IconJson /> },
  { key: 'timestamp', label: '时间戳转换', sub: 'ms · s · 双向互转', icon: <IconClock /> },
  { key: 'aiconvert', label: 'AI 格式转换', sub: 'OpenAI · Anthropic', icon: <IconConvert /> },
  { key: 'llmbatch', label: 'LLM 批量测试', sub: '并发请求 · 验真', icon: <IconBatch /> },
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

function highlightJson(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

// ─── Seedance Pricing（每百万 Token 计费） ────────────────────────────────────
// 国内：火山方舟官方定价（元/百万Token）。海外：BytePlus ModelArk 官方美元定价
// （美元/百万Token）。海外 2.5 官方尚未公布，单价留空由用户填写并保存到本地。

type RegionKey = 'cn' | 'us'

interface TierPrice { no: number | null; yes: number | null }
interface PriceTier { id: string; label: string; resolutions: string[]; price: TierPrice }
interface ModelDef { name: string; desc: string; tiers: PriceTier[] }

const INTL_25_KEY = 'dreamina-seedance-2-5'
const DEFAULT_RATE = 7.25

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
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={s}>
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
          fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
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
        className="w-full flex items-center justify-between rounded-xl transition-all duration-150 cursor-pointer border-0 outline-none active:scale-[0.99]"
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
        <span style={{ color: selected ? 'var(--text)' : 'var(--t3)' }}>{selected?.label ?? '选择…'}</span>
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
                <span className="flex-1">{o.label}</span>
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
          fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
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
function SegmentedControl({ value, options, onChange }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer border-0 outline-none transition-all duration-150 active:scale-[0.96]"
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
      className="w-20 text-right rounded-lg border-0 outline-none px-2 py-1 text-xs tabular-nums"
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'none',
        color: 'var(--text)',
        fontFamily: '"JetBrains Mono", monospace',
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
  const [tableOpen, setTableOpen] = useState(true)

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
        {/* 区域 + 模型 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="block mb-2">计费区域</Label>
            <SegmentedControl
              value={region}
              options={[{ value: 'cn', label: '国内' }, { value: 'us', label: '海外' }]}
              onChange={v => onRegionChange(v as RegionKey)}
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
            <SegmentedControl
              value={hasVideo}
              options={[{ value: '是', label: '是' }, { value: '否', label: '否' }]}
              onChange={setHasVideo}
            />
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
            <CustomInput type="number" value={rate} onChange={setRate} placeholder="7.25" mono />
          </div>
        </div>

        {/* 价目表（可折叠） */}
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
      </div>
    </div>
  )
}

// ─── Tool: JSON 可视化 ─────────────────────────────────────────────────────────

const JSON_EDITOR_STYLE: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '12.5px',
  lineHeight: '20px',
  padding: '14px 16px',
  tabSize: 2,
  whiteSpace: 'pre',
  margin: 0,
}

function DiffEditor({ value, onChange, placeholder, lineTypes }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; lineTypes?: ('same' | 'add' | 'rm')[]
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const backRef = useRef<HTMLPreElement>(null)
  const lines = value.length ? value.split('\n') : ['']

  const sync = () => {
    const ta = taRef.current, back = backRef.current
    if (ta && back) { back.scrollTop = ta.scrollTop; back.scrollLeft = ta.scrollLeft }
  }

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
          const mark = t === 'add' ? { c: 'var(--ok)', s: '+' } : t === 'rm' ? { c: 'var(--err)', s: '−' } : null
          return (
            <div key={i} style={{ background: bg, position: 'relative' }}>
              {mark && <span className="absolute select-none" style={{ left: -12, color: mark.c, fontWeight: 700 }}>{mark.s}</span>}
              <span dangerouslySetInnerHTML={{ __html: highlightJson(ln) || '​' }} />
            </div>
          )
        })}
      </pre>
      <textarea
        ref={taRef} value={value} onChange={e => onChange(e.target.value)} onScroll={sync}
        spellCheck={false} wrap="off"
        className="absolute inset-0 w-full h-full resize-none outline-none overflow-auto"
        style={{ ...JSON_EDITOR_STYLE, background: 'transparent', color: 'transparent', caretColor: 'var(--accent)', border: 0, zIndex: 1 }}
      />
    </div>
  )
}

function JsonTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [showDiff, setShowDiff] = useState(false)

  const leftFmt = useMemo(() => formatJson(left), [left])
  const rightFmt = useMemo(() => formatJson(right), [right])

  const diff = useMemo(() => {
    if (!showDiff || !left.trim() || !right.trim()) return undefined
    return computeDiff(left.split('\n'), right.split('\n'))
  }, [showDiff, left, right])

  const leftTypes = useMemo(() => diff?.filter(d => d.left !== null).map(d => d.type), [diff])
  const rightTypes = useMemo(() => diff?.filter(d => d.right !== null).map(d => d.type), [diff])
  const counts = useMemo(() => diff
    ? { add: diff.filter(d => d.type === 'add').length, rm: diff.filter(d => d.type === 'rm').length }
    : null, [diff])

  const formatBoth = () => {
    if (leftFmt.ok) setLeft(leftFmt.text)
    if (rightFmt.ok) setRight(rightFmt.text)
  }

  const Pane = ({ side, value, onChange, fmt, types, placeholder, style }: {
    side: string; value: string; onChange: (v: string) => void
    fmt: { ok: boolean }; types?: ('same' | 'add' | 'rm')[]; placeholder: string
    style?: React.CSSProperties
  }) => (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={style}>
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{side}</span>
        {fmt.ok ? <Badge color="ok">✓ 有效</Badge> : value.trim() ? <Badge color="err">格式错误</Badge> : null}
        <span className="ml-auto text-xs" style={{ color: 'var(--t3)' }}>
          {value.trim() ? `${value.split('\n').length} 行` : ''}
        </span>
      </div>
      <DiffEditor value={value} onChange={onChange} placeholder={placeholder} lineTypes={showDiff ? types : undefined} />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-3 px-6 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>JSON 可视化 & Diff</SectionTitle>
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
          {leftFmt.ok && <CopyBtn text={left} />}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden" style={{ background: 'var(--code)' }}>
        <Pane side="A · 左侧" value={left} onChange={setLeft} fmt={leftFmt} types={leftTypes}
          style={{ borderRight: '1px solid var(--border)' }}
          placeholder={'{\n  "name": "Alice",\n  "age": 30\n}'} />
        <Pane side="B · 右侧" value={right} onChange={setRight} fmt={rightFmt} types={rightTypes}
          placeholder={'{\n  "name": "Bob",\n  "age": 25\n}'} />
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
        <code style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--text)', fontWeight: 600 }}>{now}</code>
        <span style={{ color: 'var(--t3)' }}>ms</span>
        <code style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--text)', fontWeight: 600, marginLeft: 4 }}>{nowTs}</code>
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
                      <code className="flex-1 text-sm" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--text)' }}>{val}</code>
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
                      <code className="flex-1 text-sm font-semibold" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--text)' }}>{val}</code>
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
          </div>
          <CustomTextarea value={input} onChange={setInput} mono stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
        <div className="flex flex-col p-4 overflow-hidden">
          <div className="flex items-center mb-2 gap-2">
            <Label>输出</Label>
            <div className="ml-auto">
              <CopyBtn text={outputWithCache} />
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-auto p-3 text-xs"
            style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.7 }}>
            <div dangerouslySetInnerHTML={{ __html: highlightJson(outputWithCache) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool: LLM 批量测试 ───────────────────────────────────────────────────────

interface BatchResult {
  id: number
  status: 'pending' | 'running' | 'ok' | 'error'
  httpStatus: number | null
  tFirst: number | null
  elapsed: number | null
  returnedModel: string | null
  inputTokens: number | null
  outputTokens: number | null
  content: string | null
  error: string | null
}

function LlmBatchTool() {
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('gpt-4o-mini')
  const [batchN, setBatchN] = useState('3')
  const [body, setBody] = useState(JSON.stringify({ messages: [{ role: 'user', content: '用一句话介绍你自己。' }], max_tokens: 128 }, null, 2))
  const [results, setResults] = useState<BatchResult[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const runBatch = async () => {
    const n = Math.min(Math.max(parseInt(batchN) || 1, 1), 20)
    abortRef.current = new AbortController()
    setRunning(true)
    const initial: BatchResult[] = Array.from({ length: n }, (_, i) => ({
      id: i + 1, status: 'pending', httpStatus: null, tFirst: null, elapsed: null,
      returnedModel: null, inputTokens: null, outputTokens: null, content: null, error: null,
    }))
    setResults(initial)

    let parsedBody: Record<string, unknown> = {}
    try { parsedBody = JSON.parse(body) } catch { parsedBody = {} }

    const tasks = initial.map(async (r) => {
      setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'running' } : x))
      const start = Date.now()
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          signal: abortRef.current?.signal,
          body: JSON.stringify({ ...parsedBody, model: modelId }),
        })
        // 流式读取：以「首字节到达」计时 TTFT，再读余量（流式/非流式均适用）
        let tFirst: number | null = null
        let bodyText = ''
        if (res.body) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          for (;;) {
            const { done, value } = await reader.read()
            if (tFirst === null) tFirst = Date.now() - start
            if (done) break
            bodyText += decoder.decode(value, { stream: true })
          }
          bodyText += decoder.decode()
        } else {
          tFirst = Date.now() - start
          bodyText = await res.text()
        }
        const elapsed = Date.now() - start
        let json: Record<string, any> = {}
        try { json = bodyText ? JSON.parse(bodyText) : {} } catch { json = {} }
        if (!res.ok) {
          setResults(prev => prev.map(x => x.id === r.id ? {
            ...x, status: 'error', httpStatus: res.status, tFirst, elapsed,
            error: json?.error?.message || `HTTP ${res.status}`,
          } : x))
          return
        }
        const choice = json.choices?.[0]
        setResults(prev => prev.map(x => x.id === r.id ? {
          ...x, status: 'ok', httpStatus: res.status, tFirst, elapsed,
          returnedModel: typeof json.model === 'string' ? json.model : null,
          inputTokens: json.usage?.prompt_tokens ?? null,
          outputTokens: json.usage?.completion_tokens ?? null,
          content: choice?.message?.content ?? null,
        } : x))
      } catch (e: unknown) {
        if ((e as { name?: string }).name === 'AbortError') {
          setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'error', error: '已取消' } : x))
        } else {
          setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'error', elapsed: Date.now() - start, error: String(e) } : x))
        }
      }
    })
    await Promise.allSettled(tasks)
    setRunning(false)
  }

  const stop = () => { abortRef.current?.abort(); setRunning(false) }

  const stats = useMemo(() => {
    const settled = results.filter(r => r.status === 'ok' || r.status === 'error')
    if (!settled.length) return null
    const done = results.filter(r => r.status === 'ok')
    const avgTime = done.length ? done.reduce((a, r) => a + (r.elapsed ?? 0), 0) / done.length : null
    const totalIn = done.reduce((a, r) => a + (r.inputTokens ?? 0), 0)
    const totalOut = done.reduce((a, r) => a + (r.outputTokens ?? 0), 0)
    const contents = done.map(r => r.content ?? '').filter(Boolean)
    const unique = new Set(contents).size
    const statuses = Array.from(new Set(settled.map(r => r.httpStatus).filter((v): v is number => v != null)))
    return {
      avgTime, totalIn, totalOut, unique, total: done.length,
      ok: done.length, err: settled.length - done.length, statuses,
    }
  }, [results])

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>LLM 批量测试 & 验真</SectionTitle>
        <div className="ml-auto flex gap-2">
          {running
            ? <Btn variant="danger" onClick={stop}>⏹ 停止</Btn>
            : <Btn variant="primary" onClick={runBatch} disabled={!apiKey || !baseUrl}>▶ 开始批量请求</Btn>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Config panel */}
        <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-4 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
          <div>
            <Label className="block mb-1.5">Base URL</Label>
            <CustomInput value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
          </div>
          <div>
            <Label className="block mb-1.5">API Key</Label>
            <CustomInput value={apiKey} onChange={setApiKey} placeholder="sk-..." type="password" />
          </div>
          <div>
            <Label className="block mb-1.5">Model</Label>
            <CustomInput value={modelId} onChange={setModelId} placeholder="gpt-4o-mini" mono />
          </div>
          <div>
            <Label className="block mb-1.5">批量次数（最多 20）</Label>
            <CustomInput value={batchN} onChange={setBatchN} type="number" placeholder="3" />
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="block mb-1.5">请求体 JSON</Label>
            <CustomTextarea value={body} onChange={setBody} mono stretch
              placeholder='{"messages": [...], "max_tokens": 128}' className="flex-1" style={{ minHeight: 0 }} />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto flex flex-col">
          {stats && (
            <div className="glass sticky top-0 z-10 flex flex-wrap gap-x-6 gap-y-1 px-6 py-3 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
              <div><span style={{ color: 'var(--t2)' }}>均耗时 </span><strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{stats.avgTime != null ? (stats.avgTime / 1000).toFixed(2) + 's' : '—'}</strong></div>
              <div><span style={{ color: 'var(--t2)' }}>成功 </span><strong style={{ color: 'var(--ok)' }}>{stats.ok}</strong>
                <span style={{ color: 'var(--t3)' }}> / 失败 </span><strong style={{ color: stats.err ? 'var(--err)' : 'var(--t2)' }}>{stats.err}</strong></div>
              <div><span style={{ color: 'var(--t2)' }}>输入 tokens </span><strong style={{ color: 'var(--text)' }}>{stats.totalIn}</strong></div>
              <div><span style={{ color: 'var(--t2)' }}>输出 tokens </span><strong style={{ color: 'var(--text)' }}>{stats.totalOut}</strong></div>
              <div>
                <span style={{ color: 'var(--t2)' }}>响应一致性 </span>
                <Badge color={stats.total > 0 && stats.unique === 1 ? 'ok' : stats.total > 0 && stats.unique <= 2 ? 'warn' : 'err'}>
                  {stats.unique}/{stats.total} 种
                </Badge>
              </div>
              {stats.statuses.length > 0 && (
                <div><span style={{ color: 'var(--t2)' }}>状态码 </span>
                  <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{stats.statuses.join(', ')}</strong></div>
              )}
            </div>
          )}
          <div className="p-4 flex flex-col gap-3 flex-1">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--t3)' }}>
                <div className="text-4xl mb-3 opacity-60">⊞</div>
                <p className="text-sm">配置参数后点击「开始批量请求」</p>
              </div>
            ) : results.map(r => (
              <div key={r.id} className="rounded-2xl p-4" style={{ background: 'var(--bg)', boxShadow: 'var(--shadow)', border: `1px solid ${r.status === 'error' ? 'var(--err)' : 'var(--border)'}` }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                  <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>#{r.id}</span>
                  <Badge color={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'err' : 'default'}>
                    {r.status === 'running' ? '⟳ 请求中…' : r.status === 'ok' ? '✓ 成功' : r.status === 'error' ? '✗ 失败' : '等待中'}
                  </Badge>
                  {r.httpStatus != null && <Badge>{r.httpStatus}</Badge>}
                  {r.returnedModel != null && (
                    <Badge color={r.returnedModel === modelId ? 'ok' : 'err'}>
                      返回模型 {r.returnedModel}{r.returnedModel !== modelId ? ' ≠' : ''}
                    </Badge>
                  )}
                  {r.tFirst != null && <span className="text-xs" style={{ color: 'var(--t2)' }}>首字 {r.tFirst}ms</span>}
                  {r.elapsed != null && <span className="text-xs" style={{ color: 'var(--t3)' }}>总 {(r.elapsed / 1000).toFixed(2)}s</span>}
                  {r.inputTokens != null && <span className="text-xs" style={{ color: 'var(--t3)' }}>in: {r.inputTokens}</span>}
                  {r.outputTokens != null && <span className="text-xs" style={{ color: 'var(--t3)' }}>out: {r.outputTokens}</span>}
                  {r.content && <div className="ml-auto"><CopyBtn text={r.content} /></div>}
                </div>
                {r.error && <p className="text-sm" style={{ color: 'var(--err)' }}>{r.error}</p>}
                {r.content && <p className="text-sm leading-relaxed line-clamp-4" style={{ color: 'var(--text)' }}>{r.content}</p>}
                {r.status === 'running' && (
                  <div className="h-0.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--s2)' }}>
                    <div className="h-full rounded-full animate-pulse" style={{ background: 'var(--accent)', width: '60%' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
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

function Sidebar({ tool, setTool, theme, setTheme }: {
  tool: ToolKey; setTool: (t: ToolKey) => void
  theme: ThemeKey; setTheme: (t: ThemeKey) => void
}) {
  return (
    <aside className="glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col" style={{ width: 'var(--sidebar-w)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primaryFg)' }}>D</div>
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
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text)' }}>{t.label}</div>
                    <div className="text-xs leading-snug truncate" style={{ color: 'var(--t3)' }}>{t.sub}</div>
                  </div>
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

// ─── App ──────────────────────────────────────────────────────────────────────

const FULLHEIGHT_TOOLS: ToolKey[] = ['json', 'aiconvert', 'llmbatch']

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
