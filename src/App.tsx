import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import HomePage from './HomePage'
import { kvHydrate } from './shared/app-kv'
import { IconCheck, IconSettings } from './shared/icons'
import {
  TOOL_DEFINITIONS, TOOL_GROUP_SECTIONS, preloadTool, resolveToolRoute,
  type ToolIntent, type ToolKey, type ToolRoute,
} from './toolRegistry'

type ThemeKey = 'light' | 'dark' | 'claude' | 'green'

interface ThemeVars {
  bg: string; s1: string; s2: string
  border: string; borderHard: string
  text: string; t2: string; t3: string
  accent: string; accentFg: string; accentSub: string; accentSubHard: string
  primary: string; primaryFg: string
  sidebar: string; code: string; shadowSm: string; shadow: string; shadowMd: string
  ok: string; okBg: string
  err: string; errBg: string
  warn: string; warnBg: string
  addBg: string; addText: string
  rmBg: string; rmText: string
  jKey: string; jStr: string; jNum: string; jBool: string; jNull: string
  inputBg: string; inputBorder: string
  bgGrad: string
  surface: string; surfaceStrong: string; surfaceMuted: string
  surfaceEdge: string; surfaceGlow: string
  shadowHover: string
  sceneA: string; sceneB: string; sceneC: string
  gridLine: string; ringLine: string; noiseOpacity: string
}

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: Record<ThemeKey, { label: string; icon: string; dark: boolean; v: ThemeVars }> = {
  light: {
    label: '浅色', icon: '◐', dark: false,
    v: {
      bg: '#f5f7fb', s1: 'rgba(255,255,255,0.74)', s2: 'rgba(238,242,249,0.78)',
      border: 'rgba(0,0,0,0.07)', borderHard: 'rgba(0,0,0,0.16)',
      text: '#111827', t2: '#6b7280', t3: '#9ca3af',
      accent: '#2563eb', accentFg: '#fff', accentSub: 'rgba(37,99,235,0.07)', accentSubHard: 'rgba(37,99,235,0.12)',
      primary: '#111827', primaryFg: '#ffffff',
      sidebar: 'rgba(248,250,255,0.82)', code: '#f1f4f9', shadowSm: '0 1px 2px rgba(27,39,70,0.05)',
      shadow: '0 1px 2px rgba(27,39,70,0.04), 0 10px 28px -18px rgba(27,39,70,0.24)', shadowMd: '0 18px 48px -24px rgba(31,48,89,0.34), 0 2px 8px rgba(31,48,89,0.05)',
      ok: '#16a34a', okBg: 'rgba(22,163,74,0.08)',
      err: '#dc2626', errBg: 'rgba(220,38,38,0.08)',
      warn: '#d97706', warnBg: 'rgba(217,119,6,0.08)',
      addBg: 'rgba(22,163,74,0.09)', addText: '#15803d',
      rmBg: 'rgba(220,38,38,0.09)', rmText: '#b91c1c',
      jKey: '#7c3aed', jStr: '#15803d', jNum: '#1d4ed8', jBool: '#b45309', jNull: '#9ca3af',
      inputBg: 'rgba(255,255,255,0.9)', inputBorder: 'rgba(27,39,70,0.12)',
      bgGrad: 'linear-gradient(145deg, rgba(255,255,255,0.45), transparent 42%), radial-gradient(1200px 700px at 80% -10%, rgba(37,99,235,0.06) 0%, transparent 60%)',
      surface: 'rgba(255,255,255,0.68)', surfaceStrong: 'rgba(251,252,255,0.84)', surfaceMuted: 'rgba(246,249,255,0.62)',
      surfaceEdge: 'rgba(255,255,255,0.92)', surfaceGlow: 'rgba(37,99,235,0.14)',
      shadowHover: '0 26px 64px -34px rgba(31,48,89,0.42), 0 8px 24px -18px rgba(31,48,89,0.28)',
      sceneA: 'rgba(47,128,255,0.24)', sceneB: 'rgba(167,96,255,0.18)', sceneC: 'rgba(47,200,168,0.13)',
      gridLine: 'rgba(38,58,96,0.045)', ringLine: 'rgba(68,105,196,0.14)', noiseOpacity: '0.22',
    },
  },
  dark: {
    // 深色科技 — 参照 Forge C：暖橙主色 + 靛蓝氛围光 + 毛玻璃表面
    label: '深色', icon: '●', dark: true,
    v: {
      bg: '#090b12', s1: 'rgba(255,255,255,0.045)', s2: 'rgba(255,255,255,0.07)',
      border: 'rgba(255,255,255,0.10)', borderHard: 'rgba(255,255,255,0.20)',
      text: '#eceef5', t2: '#9aa3b4', t3: '#7e88a0',
      accent: '#ff7a45', accentFg: '#1a0d05', accentSub: 'rgba(255,122,69,0.16)', accentSubHard: 'rgba(255,122,69,0.24)',
      primary: '#ebebed', primaryFg: '#090b12',
      sidebar: 'rgba(255,255,255,0.035)', code: '#12141d', shadowSm: '0 1px 2px rgba(0,0,0,0.32)',
      shadow: '0 1px 2px rgba(0,0,0,0.4)',
      shadowMd: '0 4px 20px rgba(0,0,0,0.55)',
      ok: '#34d399', okBg: 'rgba(52,211,153,0.1)',
      err: '#ff6b81', errBg: 'rgba(255,107,129,0.1)',
      warn: '#ffc24b', warnBg: 'rgba(255,194,75,0.1)',
      addBg: 'rgba(52,211,153,0.13)', addText: '#34d399',
      rmBg: 'rgba(255,107,129,0.13)', rmText: '#ff6b81',
      jKey: '#c084fc', jStr: '#6ee7b7', jNum: '#7dd3fc', jBool: '#fcd34d', jNull: '#6b7280',
      inputBg: '#12141d', inputBorder: 'rgba(255,255,255,0.10)',
      bgGrad: 'linear-gradient(145deg, rgba(255,255,255,0.025), transparent 40%), radial-gradient(900px 560px at 12% -8%, rgba(255,122,69,.12) 0%, transparent 58%), radial-gradient(820px 560px at 96% 8%, rgba(124,108,255,.13) 0%, transparent 56%)',
      surface: 'rgba(17,20,31,0.68)', surfaceStrong: 'rgba(14,17,27,0.84)', surfaceMuted: 'rgba(22,26,39,0.62)',
      surfaceEdge: 'rgba(255,255,255,0.12)', surfaceGlow: 'rgba(255,122,69,0.16)',
      shadowHover: '0 30px 72px -34px rgba(0,0,0,0.82), 0 12px 32px -24px rgba(124,108,255,0.42)',
      sceneA: 'rgba(255,113,66,0.22)', sceneB: 'rgba(110,96,255,0.24)', sceneC: 'rgba(58,199,214,0.12)',
      gridLine: 'rgba(255,255,255,0.035)', ringLine: 'rgba(137,126,255,0.16)', noiseOpacity: '0.16',
    },
  },
  claude: {
    // Muted clay/terracotta — not yellow. Warm cream base with dusty sienna accent.
    label: '暖陶', icon: '✦', dark: false,
    v: {
      bg: '#f8f2ec', s1: 'rgba(239,230,221,0.78)', s2: 'rgba(230,217,205,0.76)',
      border: 'rgba(120,70,40,0.14)', borderHard: 'rgba(120,70,40,0.22)',
      text: '#2c1f14', t2: '#7a5c44', t3: '#9a7d61',
      accent: '#b5603a', accentFg: '#fff', accentSub: 'rgba(181,96,58,0.09)', accentSubHard: 'rgba(181,96,58,0.16)',
      primary: '#2c1f14', primaryFg: '#f8f2ec',
      sidebar: '#f8f2ec', code: '#f2e8dc', shadowSm: '0 1px 2px rgba(80,40,20,0.06)', shadow: '0 1px 3px rgba(80,40,20,0.07), 0 4px 12px -4px rgba(80,40,20,0.12)', shadowMd: '0 4px 16px rgba(80,40,20,0.14)',
      ok: '#5a8740', okBg: 'rgba(90,135,64,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#b5603a', warnBg: 'rgba(181,96,58,0.09)',
      addBg: 'rgba(90,135,64,0.12)', addText: '#3d6022',
      rmBg: 'rgba(196,75,56,0.12)', rmText: '#963228',
      jKey: '#8b5cf6', jStr: '#3d7a28', jNum: '#2563eb', jBool: '#b5603a', jNull: '#b09880',
      inputBg: '#fdf8f4', inputBorder: 'rgba(120,70,40,0.15)',
      bgGrad: 'linear-gradient(145deg, rgba(255,255,255,0.38), transparent 45%), radial-gradient(1200px 700px at 80% -10%, rgba(219,158,126,0.16) 0%, transparent 62%)',
      surface: 'rgba(255,250,246,0.67)', surfaceStrong: 'rgba(251,246,241,0.84)', surfaceMuted: 'rgba(247,238,230,0.64)',
      surfaceEdge: 'rgba(255,255,255,0.78)', surfaceGlow: 'rgba(181,96,58,0.13)',
      shadowHover: '0 26px 64px -34px rgba(91,52,31,0.38), 0 8px 22px -18px rgba(91,52,31,0.24)',
      sceneA: 'rgba(201,113,76,0.18)', sceneB: 'rgba(158,115,180,0.13)', sceneC: 'rgba(218,167,99,0.11)',
      gridLine: 'rgba(96,61,42,0.04)', ringLine: 'rgba(174,102,70,0.13)', noiseOpacity: '0.18',
    },
  },
  green: {
    // Dusty sage — muted, not saturated. Matches swatch.
    label: '山野绿', icon: '◉', dark: false,
    v: {
      bg: '#f0f5f0', s1: 'rgba(230,238,230,0.78)', s2: 'rgba(218,230,218,0.76)',
      border: 'rgba(30,70,40,0.13)', borderHard: 'rgba(30,70,40,0.2)',
      text: '#1a2e1f', t2: '#4a7055', t3: '#67917a',
      accent: '#3d7a54', accentFg: '#fff', accentSub: 'rgba(61,122,84,0.09)', accentSubHard: 'rgba(61,122,84,0.16)',
      primary: '#1a2e1f', primaryFg: '#f0f5f0',
      sidebar: '#f0f5f0', code: '#eaf3ea', shadowSm: '0 1px 2px rgba(20,50,30,0.05)', shadow: '0 1px 3px rgba(20,50,30,0.06), 0 4px 12px -4px rgba(20,50,30,0.1)', shadowMd: '0 4px 16px rgba(20,50,30,0.12)',
      ok: '#3d7a54', okBg: 'rgba(61,122,84,0.09)',
      err: '#c44b38', errBg: 'rgba(196,75,56,0.09)',
      warn: '#a07030', warnBg: 'rgba(160,112,48,0.09)',
      addBg: 'rgba(61,122,84,0.13)', addText: '#285c3a',
      rmBg: 'rgba(196,75,56,0.13)', rmText: '#8f2e20',
      jKey: '#6d5aad', jStr: '#2e6e44', jNum: '#1d6a9e', jBool: '#8a6030', jNull: '#85a88e',
      inputBg: '#f0faf4', inputBorder: 'rgba(0,80,40,0.16)',
      bgGrad: 'linear-gradient(145deg, rgba(255,255,255,0.36), transparent 44%), radial-gradient(1200px 700px at 80% -10%, rgba(134,181,151,0.16) 0%, transparent 62%)',
      surface: 'rgba(247,252,248,0.67)', surfaceStrong: 'rgba(242,249,244,0.84)', surfaceMuted: 'rgba(236,246,239,0.64)',
      surfaceEdge: 'rgba(255,255,255,0.78)', surfaceGlow: 'rgba(61,122,84,0.13)',
      shadowHover: '0 26px 64px -34px rgba(28,76,45,0.34), 0 8px 22px -18px rgba(28,76,45,0.22)',
      sceneA: 'rgba(57,139,91,0.17)', sceneB: 'rgba(90,134,189,0.12)', sceneC: 'rgba(176,154,76,0.10)',
      gridLine: 'rgba(36,76,48,0.04)', ringLine: 'rgba(65,126,86,0.13)', noiseOpacity: '0.18',
    },
  },
}

function ThemeMenu({ theme, setTheme, placement = 'up' }: { theme: ThemeKey; setTheme: (t: ThemeKey) => void; placement?: 'up' | 'down' }) {
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
        <div className={"floating-material absolute rounded-2xl z-20 " + (placement === 'down' ? "right-0 top-full mt-2" : "left-0 bottom-full mb-2")}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 180, padding: '6px', transformOrigin: placement === 'down' ? '50% 0%' : '50% 100%' }}>
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
        className={"ui-icon-button w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border-0 outline-none " + (open ? "" : "sb-settings-btn")}
        style={{ background: open ? 'var(--accentSubHard)' : 'var(--s1)', color: open ? 'var(--accent)' : 'var(--t2)', border: '1px solid var(--border)' }}
      >
        <IconSettings />
      </button>
    </div>
  )
}

function shouldHandleClientNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

function Sidebar({ tool, onNavigate, onToolIntent, theme, setTheme, collapsed, onToggle }: {
  tool: ToolKey | null; onNavigate: (t: ToolKey) => void; onToolIntent: (t: ToolKey, intent: ToolIntent) => void
  theme: ThemeKey; setTheme: (t: ThemeKey) => void
  collapsed: boolean; onToggle: () => void
}) {
  const hoverTimer = useRef<number | null>(null)
  const cancelHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  const scheduleHover = (key: ToolKey, pointerType: string) => {
    cancelHover()
    if (pointerType !== 'mouse') return
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null
      onToolIntent(key, 'hover')
    }, 120)
  }
  useEffect(() => cancelHover, [])

  return (
    <aside className="glass-sidebar sb-sidebar shell-enter-sidebar fixed inset-y-0 left-0 z-30 flex flex-col" style={{ width: 'var(--sidebar-w)', borderRight: '1px solid var(--border)' }}>
      {/* Logo（点击可收起/展开） */}
      <div className={collapsed ? 'pt-5 pb-4 px-2 flex-shrink-0 flex justify-center' : 'px-5 pt-6 pb-5 flex-shrink-0'}>
        <button onClick={onToggle} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className={"brand-control flex items-center gap-2.5 cursor-pointer border-0 outline-none rounded-xl " + (collapsed ? "" : "px-1.5 py-1 -mx-1.5")}
          style={{ background: 'transparent', fontFamily: 'inherit' }}>
          <img src="/logo.svg" alt="SparkQ" className="brand-mark w-8 h-8 rounded-xl flex-shrink-0" />
          {!collapsed && (
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>Dev Toolkit</div>
              <div className="text-xs" style={{ color: 'var(--t3)' }}>前端工具箱</div>
            </div>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className={"sb-nav flex-1 overflow-y-auto " + (collapsed ? "sb-nav-collapsed px-1.5" : "px-3")}>
        {TOOL_GROUP_SECTIONS.map(group => (
          <div key={group.key} className="sb-nav-group" role="group" aria-label={group.label}>
            {!collapsed && (
              <p className="sb-nav-group-title px-3" aria-hidden="true" style={{ color: 'var(--t3)', letterSpacing: '0.08em' }}>{group.label}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.tools.map(t => {
                const active = tool === t.key
                return (
                  <a key={t.key}
                    href={t.path}
                    data-tool-key={t.key}
                    onPointerEnter={e => scheduleHover(t.key, e.pointerType)}
                    onPointerLeave={cancelHover}
                    onFocus={() => onToolIntent(t.key, 'focus')}
                    onPointerDown={() => onToolIntent(t.key, 'activate')}
                    onClick={event => {
                      cancelHover()
                      if (!shouldHandleClientNavigation(event)) return
                      event.preventDefault()
                      onToolIntent(t.key, 'activate')
                      onNavigate(t.key)
                    }}
                    title={collapsed ? t.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={"sb-nav-item block w-full text-left px-3 py-2.5 rounded-xl cursor-pointer border-0 outline-none no-underline " + (collapsed ? "flex justify-center !px-0 " : "") + (active ? "sb-nav-item-active" : "")}
                    style={{ fontFamily: 'inherit' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="sb-nav-icon w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: active ? 'var(--accentSubHard)' : 'var(--s2)', color: active ? 'var(--accent)' : 'var(--t2)' }}>
                        {t.icon}
                      </span>
                      {!collapsed && (
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text)' }}>{t.label}</span>
                          {t.beta && <span className="beta-badge">Beta</span>}
                        </span>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={"sidebar-footer flex-shrink-0 flex items-center " + (collapsed ? "flex-col gap-2 py-4" : "px-4 py-4 gap-3")} style={{ borderTop: '1px solid var(--border)' }}>
        <ThemeMenu theme={theme} setTheme={setTheme} />
        <button onClick={onToggle} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className="ui-icon-button w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border-0 outline-none sb-settings-btn"
          style={{ background: 'var(--s1)', color: 'var(--t2)', border: '1px solid var(--border)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.24s var(--ease-fluid)' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {!collapsed && <p className="text-xs leading-tight flex-1" style={{ color: 'var(--t3)' }}>本地运算<br />不上传数据</p>}
      </div>
    </aside>
  )
}


function AmbientBackground() {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <div className="ambient-ring ambient-ring-a" />
      <div className="ambient-ring ambient-ring-b" />
      <div className="ambient-orb ambient-orb-a" />
      <div className="ambient-orb ambient-orb-b" />
      <div className="ambient-orb ambient-orb-c" />
      <div className="ambient-grid" />
      <div className="ambient-noise" />
    </div>
  )
}

/** 与目标工具布局同构的骨架屏：workbench = 全高工作台（顶部工具栏 + 双栏面板），否则为居中窄栏表单。 */
function ToolLoading({ label, workbench }: { label: string; workbench?: boolean }) {
  if (workbench) {
    return (
      <div className="tool-loading h-full flex flex-col overflow-hidden" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">正在载入{label}</span>
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="tool-loading-chip rounded-full" style={{ width: 108 }} />
          <div className="tool-loading-chip rounded-full" style={{ width: 64 }} />
          <div className="tool-loading-chip rounded-full" style={{ width: 64 }} />
          <div className="flex-1" />
          <div className="tool-loading-chip rounded-full" style={{ width: 88 }} />
        </div>
        <div className="flex-1 min-h-0 flex gap-4 p-5">
          <div className="tool-loading-panel flex-1 rounded-2xl" style={{ height: 'auto' }} />
          <div className="tool-loading-panel flex-1 rounded-2xl" style={{ height: 'auto' }} />
        </div>
      </div>
    )
  }
  return (
    <div className="tool-loading h-full overflow-hidden" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在载入{label}</span>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="tool-loading-title rounded-full" />
        <div className="tool-loading-line tool-loading-line-short mt-3 rounded-full" />
        <div className="surface-card tool-loading-card mt-6 rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <div className="tool-loading-chip rounded-full" style={{ width: 56 + (i % 2) * 18 }} />
                <div className="tool-loading-field mt-2 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card mt-5 rounded-2xl p-5">
          <div className="tool-loading-line rounded-full" />
          <div className="tool-loading-line tool-loading-line-short mt-3 rounded-full" />
        </div>
      </div>
    </div>
  )
}

class ToolLoadBoundary extends React.Component<
  { label: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('工具模块加载失败', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="h-full flex items-center justify-center p-8" role="alert">
        <div className="surface-card rounded-3xl p-7 text-center max-w-md">
          <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>{this.props.label}载入失败</h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--t2)' }}>网络或缓存中的旧版本资源可能已失效，请重新加载工作台。</p>
          <button className="ui-btn mt-5 rounded-full px-4 py-2 text-sm font-semibold border-0 cursor-pointer" style={{ background: 'var(--primary)', color: 'var(--primaryFg)' }} onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </div>
    )
  }
}

function ToolNotFound({ pathname, onNavigate, onHome }: { pathname: string; onNavigate: (key: ToolKey) => void; onHome: () => void }) {
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, key: ToolKey) => {
    if (!shouldHandleClientNavigation(event)) return
    event.preventDefault()
    onNavigate(key)
  }

  return (
    <div className="h-full overflow-y-auto px-7 py-8 flex items-center justify-center">
      <div className="surface-card rounded-3xl p-7 w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>404 · TOOL NOT FOUND</p>
        <h1 className="section-title text-2xl font-bold tracking-tight mt-2" style={{ color: 'var(--text)' }}>工具不存在</h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--t2)' }}>
          路径 <code className="font-mono px-1.5 py-0.5 rounded-md" style={{ background: 'var(--s2)', color: 'var(--text)' }}>{pathname}</code> 没有对应的工具。
        </p>
        <a href="/"
          onClick={event => {
            if (!shouldHandleClientNavigation(event)) return
            event.preventDefault()
            onHome()
          }}
          className="ui-btn inline-flex mt-5 rounded-full px-4 py-2 text-sm font-semibold no-underline"
          style={{ background: 'var(--primary)', color: 'var(--primaryFg)' }}>
          返回首页
        </a>
        <div className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--t3)', letterSpacing: '0.06em' }}>可用工具</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TOOL_DEFINITIONS.map(tool => (
              <a key={tool.key} href={tool.path}
                onFocus={() => preloadTool(tool.key, 'focus')}
                onPointerDown={() => preloadTool(tool.key, 'activate')}
                onClick={event => navigate(event, tool.key)}
                className="ui-btn flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold no-underline"
                style={{ background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{tool.icon}</span>
                {tool.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<ThemeKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dev-toolkit-theme') as ThemeKey
      if (saved && saved in THEMES) return saved
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
    }
    return 'light'
  })
  const [route, setRoute] = useState<ToolRoute>(() => resolveToolRoute(window.location.pathname))
  const [themeX, setThemeX] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('dev-toolkit-sidebar') === '1'
    return false
  })

  useEffect(() => { localStorage.setItem('dev-toolkit-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('dev-toolkit-sidebar', sidebarCollapsed ? '1' : '0') }, [sidebarCollapsed])

  // 工具配置存于 IndexedDB（kv store）：渲染工具前先水合到内存缓存，
  // 各工具内部即可保持同步读取配置的既有模式。水合是一次 getAll，毫秒级。
  const [kvReady, setKvReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    kvHydrate().finally(() => { if (!cancelled) setKvReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = resolveToolRoute(window.location.pathname)
      if (nextRoute.kind === 'tool' && window.location.pathname !== nextRoute.path) {
        window.history.replaceState(null, '', nextRoute.path)
      }
      setRoute(nextRoute)
    }
    syncRoute()
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const navigateTool = useCallback((next: ToolKey) => {
    const definition = TOOL_DEFINITIONS.find(tool => tool.key === next) ?? TOOL_DEFINITIONS[0]
    const currentRoute = resolveToolRoute(window.location.pathname)
    if (currentRoute.kind === 'tool' && currentRoute.key === definition.key) {
      if (window.location.pathname !== definition.path || window.location.search || window.location.hash) {
        window.history.replaceState(null, '', definition.path)
        setRoute({ kind: 'tool', key: definition.key, path: definition.path })
      }
      return
    }
    window.history.pushState(null, '', definition.path)
    setRoute({ kind: 'tool', key: definition.key, path: definition.path })
  }, [])
  const handleToolIntent = useCallback((next: ToolKey, intent: ToolIntent) => preloadTool(next, intent), [])
  const navigateHome = useCallback(() => {
    if (window.location.pathname === '/') return
    window.history.pushState(null, '', '/')
    setRoute({ kind: 'home' })
  }, [])
  const themeXTimer = useRef<number | null>(null)
  const changeTheme = useCallback((next: ThemeKey) => {
    setTheme(next)
    setThemeX(true)
    if (themeXTimer.current !== null) window.clearTimeout(themeXTimer.current)
    themeXTimer.current = window.setTimeout(() => { themeXTimer.current = null; setThemeX(false) }, 260)
  }, [])
  useEffect(() => () => { if (themeXTimer.current !== null) window.clearTimeout(themeXTimer.current) }, [])

  const definition = route.kind === 'tool' ? TOOL_DEFINITIONS.find(item => item.key === route.key) ?? null : null

  useEffect(() => {
    if (route.kind === 'home') {
      document.title = 'Dev Toolkit · 前端工具箱'
    } else {
      document.title = definition ? `${definition.label} · Dev Toolkit` : '工具不存在 · Dev Toolkit'
    }
  }, [route.kind, definition])

  const vars = THEMES[theme].v
  const cssVars = Object.fromEntries(Object.entries(vars).map(([key, value]) => [`--${key}`, value])) as Record<string, string>
  const ToolComponent = definition?.component
  const stageKey = route.kind === 'tool' ? route.key : route.kind === 'home' ? 'home' : `not-found:${route.pathname}`

  return (
    <div className={`app-shell ${themeX ? 'theme-x' : ''}`} data-theme={theme} style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', ...cssVars,
      '--sidebar-w': sidebarCollapsed ? '60px' : '224px',
      backgroundImage: 'var(--bgGrad)',
    } as React.CSSProperties}>
      <AmbientBackground />
      {route.kind !== 'home' && (
        <Sidebar tool={route.kind === 'tool' ? route.key : null} onNavigate={navigateTool} onToolIntent={handleToolIntent} theme={theme} setTheme={changeTheme}
          collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(current => !current)} />
      )}
      <main className="app-main relative z-[1] flex-1 overflow-hidden flex flex-col" style={{ paddingLeft: route.kind === 'home' ? 0 : 'var(--sidebar-w)' }}>
        <div key={stageKey} className="tool-stage flex-1 overflow-hidden">
          {route.kind === 'home' ? (
            <div className="h-full overflow-y-auto">
              <HomePage
                themeMenu={<ThemeMenu theme={theme} setTheme={changeTheme} placement="down" />}
                onNavigate={navigateTool}
                onToolIntent={handleToolIntent}
                onHome={navigateHome}
              />
            </div>
          ) : definition && ToolComponent ? (
            kvReady ? (
              <ToolLoadBoundary key={definition.key} label={definition.label}>
                <Suspense fallback={<ToolLoading label={definition.label} workbench={definition.fullHeight} />}>
                  {definition.fullHeight ? (
                    <div className="h-full overflow-hidden"><ToolComponent /></div>
                  ) : (
                    <div className="h-full overflow-y-auto"><ToolComponent /></div>
                  )}
                </Suspense>
              </ToolLoadBoundary>
            ) : (
              <ToolLoading label={definition.label} workbench={definition.fullHeight} />
            )
          ) : (
            <ToolNotFound pathname={route.kind === 'not-found' ? route.pathname : window.location.pathname} onNavigate={navigateTool} onHome={navigateHome} />
          )}
        </div>
      </main>
    </div>
  )
}
