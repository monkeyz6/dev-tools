import React, { useEffect, useRef } from 'react'
import { TOOL_DEFINITIONS, type ToolIntent, type ToolKey } from './toolRegistry'

const CARD_VARIANTS = ['blue', 'purple', 'green', 'orange'] as const
type CardVariant = (typeof CARD_VARIANTS)[number]

interface HomePageProps {
  themeMenu: React.ReactNode
  onNavigate: (key: ToolKey) => void
  onToolIntent: (key: ToolKey, intent: ToolIntent) => void
  onHome: () => void
}

function shouldHandleClientNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export default function HomePage({ themeMenu, onNavigate, onToolIntent, onHome }: HomePageProps) {
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
    <div className="home-wrap">
      <header className="home-topbar">
        <a className="home-brand" href="/"
          onClick={event => {
            if (!shouldHandleClientNavigation(event)) return
            event.preventDefault()
            onHome()
          }}>
          <span className="home-brand-mark" aria-hidden="true"><img src="/logo.svg" alt="" /></span>
          <span>
            <span className="home-brand-name">Dev Toolkit</span>
            <span className="home-brand-sub">纯前端工具箱</span>
          </span>
        </a>
        <div className="home-controls">{themeMenu}</div>
      </header>

      <section className="home-hero">
        <span className="home-hero-badge">
          <span className="home-dot" aria-hidden="true" />
          <span className="home-badge-copy">
            13 个工具 · 持续迭代中
            <span className="home-ellipsis" aria-hidden="true"><span className="home-ellipsis-dot">.</span><span className="home-ellipsis-dot">.</span><span className="home-ellipsis-dot">.</span></span>
          </span>
        </span>
        <h1><span>Dev Toolkit </span><span className="home-hero-grad">工具集合</span></h1>
        <p>纯前端实现的工具箱，覆盖前后端开发者高频场景，所有数据均在浏览器本地处理。</p>
      </section>

      <main className="home-grid">
        {TOOL_DEFINITIONS.map((tool, index) => {
          const variant: CardVariant = CARD_VARIANTS[index % CARD_VARIANTS.length]
          return (
            <a key={tool.key}
              className={`home-card home-card-${variant}`}
              href={tool.path}
              data-tool-key={tool.key}
              style={{ animationDelay: `${0.3 + index * 0.06}s` }}
              onPointerEnter={event => scheduleHover(tool.key, event.pointerType)}
              onPointerLeave={cancelHover}
              onFocus={() => onToolIntent(tool.key, 'focus')}
              onPointerDown={() => onToolIntent(tool.key, 'activate')}
              onPointerMove={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                event.currentTarget.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`)
                event.currentTarget.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`)
              }}
              onClick={event => {
                cancelHover()
                if (!shouldHandleClientNavigation(event)) return
                event.preventDefault()
                onToolIntent(tool.key, 'activate')
                onNavigate(tool.key)
              }}>
              <div className="home-card-head">
                <span className="home-card-icon" aria-hidden="true">{tool.icon}</span>
                <span className="home-card-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                </span>
              </div>
              <h2>{tool.label}</h2>
              <p className="home-card-desc">{tool.desc}</p>
            </a>
          )
        })}
      </main>

      <footer className="home-footer">
        <div className="home-copyright">© {new Date().getFullYear()} cvking.cn · 纯前端工具箱</div>
        <div className="home-beian">
          <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener nofollow">皖ICP备20012269号</a>
          <span className="home-sep">·</span>
          <span>cvking.cn</span>
        </div>
      </footer>
    </div>
  )
}
