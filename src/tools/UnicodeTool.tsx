import { kvGet, kvSet, kvRemove } from '../shared/app-kv'
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { decodeUnicode, encodeUnicode, UNI_FORMATS, type UniFmt } from '../shared/unicode'

// ─── Tool: Unicode 转换 ─────────────────────────────────────────────────────────

function loadUnicodeOpts(): { fmt: UniFmt; onlyNonAscii: boolean; lowerHex: boolean } {
  try {
    const raw = kvGet('unicode-opts')
    if (!raw) return { fmt: 'js', onlyNonAscii: true, lowerHex: true }
    const p = JSON.parse(raw)
    const fmt = UNI_FORMATS.some(f => f.value === p.fmt) ? (p.fmt as UniFmt) : 'js'
    return { fmt, onlyNonAscii: p.onlyNonAscii !== false, lowerHex: p.lowerHex !== false }
  } catch { return { fmt: 'js', onlyNonAscii: true, lowerHex: true } }
}
function saveUnicodeOpts(o: { fmt: UniFmt; onlyNonAscii: boolean; lowerHex: boolean }) {
  try { kvSet('unicode-opts', JSON.stringify(o)) } catch { /* ignore */ }
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


export default UnicodeTool
