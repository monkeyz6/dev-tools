import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { decodeB64, encodeB64 } from '../shared/base64'

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

export default Base64Tool
