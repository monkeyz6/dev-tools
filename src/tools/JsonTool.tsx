import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { formatJson, highlightJson, computeDiff, findMatchingBracket, JSON_ROW, JSON_PAD_TB, JSON_PAD_L, JSON_LINE_NO_W, JSON_FOLD_W, JSON_GUTTER_W, JSON_CONTENT_X, JSON_EDITOR_STYLE, computeFoldRanges, getVisibleLines } from '../shared/json'

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

export default JsonTool
