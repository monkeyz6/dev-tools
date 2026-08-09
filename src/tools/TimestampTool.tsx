import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'

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

export default TimestampTool
