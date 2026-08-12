import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { IconCheck, IconChevron } from './icons'

export function Btn({ children, onClick, variant = 'ghost', small, className = '', disabled, style, title }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'accent' | 'soft' | 'ghost' | 'danger'
  small?: boolean; className?: string; disabled?: boolean; style?: React.CSSProperties; title?: string
}) {
  const base = `ui-btn ui-btn-${variant} inline-flex items-center justify-center font-semibold select-none cursor-pointer rounded-full border-0 outline-none`
  const sz = small ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-4 py-2 text-sm gap-2'
  const vs = {
    primary: { background: 'var(--primary)', color: 'var(--primaryFg)' },
    accent: { background: 'var(--accent)', color: 'var(--accentFg)' },
    soft: { background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--t2)' },
    danger: { background: 'var(--errBg)', color: 'var(--err)' },
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${sz} ${className} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={{ ...vs, ...style }}>
      {children}
    </button>
  )
}

export function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={`text-xs font-semibold tracking-wide uppercase ${className}`} style={{ color: 'var(--t2)', letterSpacing: '0.06em' }}>
      {children}
    </label>
  )
}

export function Card({ children, className = '', style, tone = 'default', interactive = false }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties
  tone?: 'default' | 'emphasis'; interactive?: boolean
}) {
  const toneClass = tone === 'emphasis' ? 'surface-card-emphasis' : ''
  const interactionClass = interactive ? 'surface-card-interactive' : ''
  return (
    <div className={`surface-card ${toneClass} ${interactionClass} rounded-2xl p-5 ${className}`} style={style}>
      {children}
    </div>
  )
}

export function Badge({ children, color }: { children: React.ReactNode; color?: 'ok' | 'err' | 'warn' | 'default' }) {
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
export function CustomInput({ value, onChange, placeholder, className = '', type = 'text', mono, style }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string
  className?: string; type?: string; mono?: boolean; style?: React.CSSProperties
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className={`ui-control relative flex items-center rounded-xl overflow-hidden ${focused ? 'ui-control-focused' : ''} ${className}`}
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'var(--shadowSm)',
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
          WebkitAppearance: type === 'number' ? 'textfield' : 'none',
          MozAppearance: type === 'number' ? 'textfield' : 'none',
        }}
      />
    </div>
  )
}

// Fully custom Select — replaces native <select>
export function CustomSelect({ value, onChange, options, className = '' }: {
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
        className="ui-control ui-select-trigger w-full flex items-center justify-between overflow-hidden min-w-0 rounded-xl cursor-pointer border-0 outline-none"
        style={{
          padding: '10px 12px',
          background: 'var(--inputBg)',
          border: `1px solid ${open || focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: open || focused ? '0 0 0 3px var(--accentSub)' : 'var(--shadowSm)',
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
          className="floating-material absolute left-0 right-0 z-50 rounded-2xl overflow-hidden"
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
                className={`ui-option ${isActive ? 'ui-option-active' : ''} w-full flex items-center gap-2.5 rounded-xl cursor-pointer border-0 outline-none text-left`}
                style={{
                  padding: '8px 10px',
                  background: isActive ? 'var(--accentSubHard)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  marginBottom: idx < options.length - 1 ? 1 : 0,
                }}
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
export function SearchableSelect({ value, onChange, options, placeholder, className = '' }: {
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
        className="ui-control ui-select-trigger w-full flex items-center justify-between overflow-hidden min-w-0 rounded-xl cursor-pointer border-0 outline-none"
        style={{
          padding: '10px 12px',
          background: 'var(--inputBg)',
          border: `1px solid ${open || focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: open || focused ? '0 0 0 3px var(--accentSub)' : 'var(--shadowSm)',
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
          className="floating-material absolute left-0 right-0 z-50 rounded-2xl overflow-hidden"
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
                  className={`ui-option ${isActive ? 'ui-option-active' : ''} w-full flex items-center gap-2.5 rounded-xl cursor-pointer border-0 outline-none text-left`}
                  style={{
                    padding: '8px 10px',
                    background: isActive ? 'var(--accentSubHard)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    marginBottom: idx < filtered.length - 1 ? 1 : 0,
                  }}
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
export function CustomTextarea({ value, onChange, placeholder, rows, className = '', mono, style, stretch, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  rows?: number; className?: string; mono?: boolean; style?: React.CSSProperties; stretch?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className={`ui-control relative overflow-hidden rounded-xl ${focused ? 'ui-control-focused' : ''} ${className}`}
      style={{
        background: 'var(--inputBg)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'var(--shadowSm)',
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
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="ui-switch relative flex-shrink-0 border-0 outline-none cursor-pointer"
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: value ? 'var(--accent)' : 'var(--s2)',
          boxShadow: value ? '0 0 0 3px var(--accentSub)' : 'none',
        }}
      >
        <span
          className="absolute"
          style={{
            top: 3, left: 3,
            width: 16, height: 16, borderRadius: 8,
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            transform: value ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform 0.24s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </button>
      {label && <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>}
    </label>
  )
}

// Segmented control (replaces inline button groups)
export function SegmentedControl({ value, options, onChange, className = '' }: {
  value: string; options: { value: string; label: string; icon?: React.ReactNode }[]; onChange: (v: string) => void; className?: string
}) {
  return (
    <div className={`segmented-control inline-flex rounded-xl p-1 gap-1 ${className}`} style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`segmented-option ${active ? 'segmented-option-active' : ''} flex-1 px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer border-0 outline-none whitespace-nowrap inline-flex items-center justify-center gap-1.5`}
            style={{
              background: active ? 'var(--bg)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--t2)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              fontFamily: 'inherit',
            }}
          >
            {o.icon ? <span className="shrink-0 inline-flex items-center justify-center">{o.icon}</span> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title text-xl font-bold tracking-tight mb-1" style={{ color: 'var(--text)', letterSpacing: '-0.025em' }}>{children}</h2>
}

export function CopyBtn({ text }: { text: string }) {
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
