import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { IconChevron } from '../shared/icons'

// ─── Seedance Pricing（每百万 Token 计费） ────────────────────────────────────
// 国内：火山方舟官方定价（元/百万Token）。海外：BytePlus ModelArk 官方美元定价
// （美元/百万Token）。海外 2.5 于 2026-08 官方公布：不含视频 $10.70、含视频 $6.40。

type RegionKey = 'cn' | 'us'

interface TierPrice { no: number | null; yes: number | null }
interface PriceTier { id: string; label: string; resolutions: string[]; price: TierPrice }
interface ModelDef { name: string; desc: string; tiers: PriceTier[] }

const INTL_25_KEY = 'dreamina-seedance-2-5-260628'
const DEFAULT_RATE = 7

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
      desc: '2026-08 官方公布。当前最高支持 720p 输出，1080p/4K 暂未开放。',
      tiers: [{ id: 'flat', label: '480p/720p', resolutions: ['480p', '720p'], price: { no: 10.7, yes: 6.4 } }],
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

// ─── Tool: Seedance 计费 ───────────────────────────────────────────────────────

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
  const [tableOpen, setTableOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('seedance-fx-rate', rate)
  }, [rate])
  useEffect(() => {
    // 旧版本手填单价入口已移除（官方价格已公布），清理遗留数据
    localStorage.removeItem('seedance-intl-25-prices')
  }, [])

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

    const price = hasVideo === '是' ? tier.price.yes : tier.price.no

    if (price == null) return { ready: false, reason: '该档位暂无定价' }

    const base = (tok / 1_000_000) * price
    return {
      ready: true,
      totalCN: region === 'cn' ? base : base * xr,
      totalUSD: region === 'us' ? base : base / xr,
      unitCN: region === 'cn' ? price : price * xr,
      unitUSD: region === 'us' ? price : price / xr,
    }
  }, [region, model, resolution, hasVideo, tokens, rate])

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <SectionTitle>Seedance 计费计算器</SectionTitle>

      <div className="grid gap-5">
        {/* 操作区（整块表单卡片） */}
        <Card>
          {/* 区域 + 模型 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block mb-1">计费区域</Label>
              <SegmentedControl
                value={region}
                options={[{ value: 'cn', label: '国内' }, { value: 'us', label: '海外' }]}
                onChange={v => onRegionChange(v as RegionKey)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="block mb-1">模型变体</Label>
              <CustomSelect value={model} onChange={onModelChange}
                options={Object.keys(SEEDANCE_PRICING[region]).map(m => ({ value: m, label: m }))} />
            </div>
          </div>

          {/* 分辨率 + 是否含视频 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block mb-1">输出分辨率</Label>
              <CustomSelect value={resolution} onChange={setResolution}
                options={availableRes.map(r => ({ value: r, label: r }))} />
            </div>
            <div>
              <Label className="block mb-1">输入是否包含视频</Label>
              <CustomSelect value={hasVideo} onChange={setHasVideo}
                options={[{ value: '是', label: '是' }, { value: '否', label: '否' }]} />
            </div>
          </div>

          {/* Token 数 + 汇率 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-1">Token 数量</Label>
              <CustomInput type="number" value={tokens} onChange={setTokens} placeholder="200000" mono />
            </div>
            <div>
              <Label className="block mb-1">汇率 1 USD = ? CNY</Label>
              <CustomInput type="number" value={rate} onChange={setRate} placeholder="7" mono />
            </div>
          </div>
        </Card>

        {/* 结果 */}
        {result.ready ? (
          <div className="surface-card surface-card-emphasis rounded-2xl p-6" style={{ background: 'var(--accentSub)', borderColor: 'var(--accentSubHard)' }}>
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

        {/* 价目表（可折叠，默认收起，放最下面） */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => setTableOpen(o => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-0 outline-none cursor-pointer"
            style={{ background: 'transparent', fontFamily: 'inherit' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              价目表 · {region === 'cn' ? '国内（元/百万 Token）' : '海外（美元/百万 Token）'}
            </span>
            <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--t3)' }}>点击行选中</span>
            <IconChevron open={tableOpen} />
          </button>
          {tableOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {Object.entries(SEEDANCE_PRICING[region]).map(([mk, md]) => {
                const activeTierId = model === mk ? tierFor(md, resolution)?.id : null
                return (
                  <div key={mk}>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>
                      {md.name}
                    </div>
                    {md.tiers.map(tier => {
                      const isActive = mk === model && tier.id === activeTierId
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
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export default SeedanceTool
