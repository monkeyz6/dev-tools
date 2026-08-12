import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { compressGraphql, formatGraphql, highlightGraphql, unescapeString } from '../shared/graphql'

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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => { toastTimer.current = null; setToast(null) }, 1800)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

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
            animation: 'ia-ti .35s cubic-bezier(.22,1,.36,1) both',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

export default GraphqlTool
