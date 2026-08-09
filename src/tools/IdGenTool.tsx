import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { formatUuids, genRandomStrings, randActiveClasses, uuidBytes, type RandOpts, type UuidFmt } from '../shared/id'

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

export default IdGenTool
