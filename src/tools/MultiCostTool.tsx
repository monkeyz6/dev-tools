import React, { useEffect, useMemo, useState } from 'react'
import { Card, Label, Badge, Btn, CustomInput, CustomSelect, CustomTextarea, SegmentedControl, SectionTitle } from '../shared/ui'
import { IconSeedance, IconGrokImage, IconGrokVideo, IconGptImage, IconGeminiImage, IconJson, IconChevron } from '../shared/icons'
import {
  PRODUCTS, getProduct, num, fmtMoney, fmtUnit, CUR_SYMBOL, dual,
  recognizeJson, FX_STORAGE_KEY,
  type ProductDef, type RegionDef, type ModelDef,
  type ParseResult, type SourceType,
  type SeedanceFill, type GrokImageFill, type GrokVideoFill, type GptImageFill, type GeminiImageFill,
} from '../shared/multicost'

/* ─── 结果数据结构 ─────────────────────────────────────────────────────────── */

interface ResultData {
  cny: number | null
  usd: number | null
  unitCny: number | null
  unitUsd: number | null
  unitNoun: string
  params: string
  warn?: string
  parseSummary?: string
  parseSource?: SourceType
}

/* ─── 通用小组件 ───────────────────────────────────────────────────────────── */

function Field({ label, hint, full, children }: {
  label: string; hint?: string; full?: boolean; children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label className="block">{label}</Label>
      {children}
      {hint ? <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{hint}</span> : null}
    </div>
  )
}

function ResultCard({ data }: { data: ResultData }) {
  if (data.warn) {
    return (
      <div className="rounded-2xl p-5 flex items-start gap-3" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)' }}>
        <Badge color="warn">无法计算</Badge>
        <span className="text-sm" style={{ color: 'var(--text)' }}>{data.warn}</span>
      </div>
    )
  }
  return (
    <div className="surface-card surface-card-emphasis rounded-2xl p-6" style={{ background: 'var(--accentSub)', borderColor: 'var(--accentSubHard)' }}>
      {data.parseSummary ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
          <Badge color="ok">{data.parseSource === 'response' ? '响应体' : '请求体'}解析</Badge>
          <span style={{ color: 'var(--t2)' }}>{data.parseSummary}</span>
        </div>
      ) : null}
      <p className="text-xs font-bold mb-4 uppercase tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>预估费用</p>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <div className="text-3xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
            ¥{fmtMoney(data.cny)}
          </div>
          <div className="text-xs mt-1.5" style={{ color: 'var(--t2)' }}>人民币</div>
        </div>
        <div>
          <div className="text-3xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
            ${fmtMoney(data.usd)}
          </div>
          <div className="text-xs mt-1.5" style={{ color: 'var(--t2)' }}>美元</div>
        </div>
      </div>
      <div className="mt-4 text-sm font-medium" style={{ color: 'var(--text)' }}>
        单价 <span className="tabular-nums">¥{fmtUnit(data.unitCny)}</span> / {data.unitNoun}
        <span style={{ color: 'var(--t3)' }}>（${fmtUnit(data.unitUsd)} / {data.unitNoun}）</span>
      </div>
      <div className="mt-5 pt-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--t3)' }}>
        {data.params}
      </div>
    </div>
  )
}

function PriceTable({ region, unitNoun, selectedModel, selectedTier, onSelect, showYes, yesLabel = '含视频', noLabel = '不含视频' }: {
  region: RegionDef
  unitNoun: string
  selectedModel: string
  selectedTier: string
  onSelect: (modelId: string, tierId: string) => void
  showYes: boolean
  yesLabel?: string
  noLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const sym = CUR_SYMBOL[region.currency]

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 border-0 outline-none cursor-pointer"
        style={{ background: 'transparent', fontFamily: 'inherit' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          价目表 · {region.label}（{sym} / {unitNoun}）
        </span>
        <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--t3)' }}>点击行选中</span>
        <IconChevron open={open} />
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {region.models.map(m => (
            <div key={m.id}>
              <div className="px-4 pt-3 pb-1">
                <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>{m.label}</div>
                {m.desc ? <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{m.desc}</div> : null}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-5 py-1 text-[10px] font-medium" style={{ color: 'var(--t3)' }}>
                <span>档位</span>
                <span className="text-right w-20">{noLabel}</span>
                {showYes ? <span className="text-right w-20">{yesLabel}</span> : null}
              </div>
              {m.tiers.map(t => {
                const active = selectedModel === m.id && selectedTier === t.id
                return (
                  <button key={t.id} onClick={() => onSelect(m.id, t.id)}
                    className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-xs border-0 outline-none cursor-pointer text-left transition-all duration-100 active:scale-[0.995]"
                    style={{ background: active ? 'var(--accentSubHard)' : 'transparent', borderTop: '1px solid var(--border)', fontFamily: 'inherit' }}
                    onPointerEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
                    onPointerLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                    <span className="font-medium truncate" style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                    <span className="tabular-nums text-right w-20" style={{ color: active ? 'var(--accent)' : 'var(--t2)' }}>
                      {t.priceNo == null ? '—' : sym + fmtUnit(t.priceNo)}
                    </span>
                    {showYes ? (
                      <span className="tabular-nums text-right w-20" style={{ color: active ? 'var(--accent)' : 'var(--t2)' }}>
                        {t.priceYes == null ? '—' : sym + fmtUnit(t.priceYes)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── 粘贴 JSON 自动识别 ─────────────────────────────────────────────────────── */

interface ProductJsonHint {
  subtitle: string
  placeholder: string
  examples: { label: string; json: string }[]
}

const PRODUCT_HINTS: Record<string, ProductJsonHint> = {
  seedance: {
    subtitle: '粘贴 Seedance 任务响应体，自动提取 model / usage / resolution',
    placeholder: '{\n  "data": {\n    "data": {\n      "model": "doubao-seedance-2.0",\n      "resolution": "720p",\n      "usage": { "total_tokens": 308880 }\n    }\n  }\n}',
    examples: [
      {
        label: 'Seedance 2.0 响应体',
        json: JSON.stringify({ data: { data: { model: 'doubao-seedance-2.0', resolution: '720p', usage: { total_tokens: 308880, completion_tokens: 308880 } } } }, null, 2),
      },
      {
        label: 'Seedance 2.5 响应体',
        json: JSON.stringify({ data: { data: { model: 'doubao-seedance-2.5', resolution: '480p', usage: { total_tokens: 180000 } } } }, null, 2),
      },
      {
        label: 'new-api 网关 (Seedance)',
        json: JSON.stringify({ task_id: 't_abc', quota: 14000, properties: { origin_model_name: 'doubao-seedance-2.0' }, data: { data: { model: 'doubao-seedance-2.0', resolution: '720p', usage: { total_tokens: 308880 } } } }, null, 2),
      },
    ],
  },
  'grok-image': {
    subtitle: '粘贴 Grok Image 请求体，自动提取 model / n / resolution',
    placeholder: '{\n  "model": "grok-imagine-image-quality",\n  "n": 4,\n  "resolution": "2k",\n  "aspect_ratio": "1:1"\n}',
    examples: [
      { label: '标准模型 · 1K · 2张', json: JSON.stringify({ model: 'grok-imagine-image', n: 2, resolution: '1k' }, null, 2) },
      { label: '高质量 · 2K · 4张', json: JSON.stringify({ model: 'grok-imagine-image-quality', n: 4, resolution: '2k', aspect_ratio: '1:1' }, null, 2) },
      {
        label: 'new-api 网关 (Grok Image)',
        json: JSON.stringify({ task_id: 't_123', quota: 12000, properties: { origin_model_name: 'grok-imagine-image', n: 2, resolution: '1k' } }, null, 2),
      },
    ],
  },
  'grok-video': {
    subtitle: '粘贴 Grok Video 请求体，自动提取 model / duration / resolution',
    placeholder: '{\n  "model": "grok-imagine-video-1.5-preview",\n  "duration": 6,\n  "metadata": {\n    "resolution": "720p"\n  }\n}',
    examples: [
      { label: '基础版 · 480p · 6s', json: JSON.stringify({ model: 'grok-imagine-video', duration: 6, metadata: { resolution: '480p', aspect_ratio: '16:9' } }, null, 2) },
      { label: '1.5版 · 720p · 10s', json: JSON.stringify({ model: 'grok-imagine-video-1.5-preview', duration: 10, metadata: { resolution: '720p' } }, null, 2) },
      { label: '1.5版 · 1080p · 6s', json: JSON.stringify({ model: 'grok-imagine-video-1.5-preview', duration: 6, metadata: { resolution: '1080p' } }, null, 2) },
    ],
  },
  'gpt-image': {
    subtitle: '粘贴 GPT Image 响应体，自动提取 model / usage token 明细',
    placeholder: '{\n  "model": "gpt-image-1-mini",\n  "usage": {\n    "input_tokens": 120,\n    "output_tokens": 1568,\n    "input_tokens_details": {\n      "text_tokens": 20,\n      "image_tokens": 100\n    }\n  }\n}',
    examples: [
      { label: 'gpt-image-1-mini 响应', json: JSON.stringify({ model: 'gpt-image-1-mini', usage: { input_tokens: 120, output_tokens: 1568, input_tokens_details: { text_tokens: 20, image_tokens: 100 } } }, null, 2) },
      { label: 'gpt-image-1 响应', json: JSON.stringify({ model: 'gpt-image-1', usage: { input_tokens: 250, output_tokens: 4176, input_tokens_details: { text_tokens: 50, image_tokens: 200 } } }, null, 2) },
      { label: 'gpt-image-2 响应', json: JSON.stringify({ model: 'gpt-image-2', usage: { input_tokens: 180, output_tokens: 3520, input_tokens_details: { text_tokens: 80, image_tokens: 100 } } }, null, 2) },
    ],
  },
  'gemini-image': {
    subtitle: '粘贴 Gemini Image 响应体，自动提取 model / usageMetadata',
    placeholder: '{\n  "model": "gemini-3-pro-image-preview",\n  "usageMetadata": {\n    "promptTokenCount": 560,\n    "candidatesTokenCount": 1120,\n    "totalTokenCount": 1680\n  }\n}',
    examples: [
      { label: 'Gemini 3 Pro Image 响应', json: JSON.stringify({ model: 'gemini-3-pro-image-preview', usageMetadata: { promptTokenCount: 560, candidatesTokenCount: 1120, totalTokenCount: 1680 } }, null, 2) },
      { label: 'Gemini 3.1 Flash Image 响应', json: JSON.stringify({ model: 'gemini-3.1-flash-image-preview', usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 747, totalTokenCount: 947 } }, null, 2) },
      { label: 'Gemini 2.5 Flash Image 响应', json: JSON.stringify({ model: 'gemini-2.5-flash-image', usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 1290, totalTokenCount: 1410 } }, null, 2) },
    ],
  },
}

function JsonRecognizer({ activeProduct, onRecognized }: {
  activeProduct: string
  onRecognized: (r: ParseResult) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const hint = PRODUCT_HINTS[activeProduct] ?? PRODUCT_HINTS['seedance']

  function handleParse(raw?: string) {
    const outcome = recognizeJson(raw ?? text)
    if (!outcome.ok || !outcome.result) {
      setError(outcome.message || '识别失败')
      return
    }
    setError(outcome.result.error ?? null)
    onRecognized(outcome.result)
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 border-0 outline-none cursor-pointer text-left"
        style={{ background: 'transparent', fontFamily: 'inherit' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
            <IconJson />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>粘贴 JSON 自动识别</div>
            <div className="text-[11px] leading-snug truncate" style={{ color: 'var(--t3)' }}>{hint.subtitle}</div>
          </div>
        </div>
        <IconChevron open={open} />
      </button>
      {open && (
        <div className="space-y-3" style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          <CustomTextarea
            value={text}
            onChange={v => { setText(v); setError(null) }}
            placeholder={hint.placeholder}
            rows={7}
            mono
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="accent" onClick={() => handleParse()}>解析并填充</Btn>
            <Btn variant="soft" onClick={() => { setText(''); setError(null) }}>清空</Btn>
          </div>
          {error ? (
            <div className="rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: 'var(--warnBg)', color: 'var(--warn)', border: '1px solid var(--warn)' }}>
              {error}
            </div>
          ) : null}
          <div className="pt-1">
            <div className="mb-1.5 text-[11px] font-medium" style={{ color: 'var(--t3)' }}>示例（点击填入并解析）：</div>
            <div className="flex flex-wrap gap-1.5">
              {hint.examples.map(ex => (
                <button key={ex.label} type="button"
                  onClick={() => { setText(ex.json); handleParse(ex.json) }}
                  className="rounded-full px-3 py-1 text-[11px] font-medium border-0 outline-none cursor-pointer transition-all duration-150 active:scale-95"
                  style={{ background: 'var(--s2)', color: 'var(--t2)', border: '1px solid var(--border)', fontFamily: 'inherit' }}
                  onPointerEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'}
                  onPointerLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'}>
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ─── SEEDANCE 面板（token 计费，区域/模型/分辨率/含视频） ──────────────────── */

interface SeedanceState {
  regionId: string
  modelId: string
  tierId: string
  hasVideo: boolean
  tokens: string
}

const SEEDANCE_PRODUCT = getProduct('seedance')!

function defaultSeedanceState(): SeedanceState {
  const region = SEEDANCE_PRODUCT.regions[0]
  const model = region.models[0]
  return { regionId: region.id, modelId: model.id, tierId: model.tiers[0].id, hasVideo: false, tokens: '200000' }
}

function applySeedanceFill(s: SeedanceState, fill: SeedanceFill): SeedanceState {
  let regionId = s.regionId
  let region = SEEDANCE_PRODUCT.regions.find(r => r.id === regionId)!
  let model: ModelDef | undefined
  for (const r of SEEDANCE_PRODUCT.regions) {
    const m = r.models.find(mm => mm.id === fill.modelId)
    if (m) { region = r; regionId = r.id; model = m; break }
  }
  if (!model) model = region.models[0]
  let tierId = model.tiers[0].id
  if (fill.resolution) {
    const res = fill.resolution
    const match = model.tiers.find(t => {
      const l = t.label.toLowerCase()
      if (res === '4k') return l.includes('4k') || l.includes('uhd')
      if (res === '1080p') return l.includes('1080') || l.includes('fhd')
      return l.includes('480') || l.includes('720') || l.includes('hd')
    })
    if (match) tierId = match.id
  }
  return {
    regionId,
    modelId: model.id,
    tierId,
    hasVideo: fill.hasVideo ?? s.hasVideo,
    tokens: fill.tokens != null ? String(fill.tokens) : s.tokens,
  }
}

function blankWarn(product: ProductDef, msg: string): ResultData {
  return { cny: null, usd: null, unitCny: null, unitUsd: null, unitNoun: product.unitNoun, params: '', warn: msg }
}

function SeedancePanel({ state, setState, rate, parseSummary, parseSource }: {
  state: SeedanceState
  setState: (s: SeedanceState) => void
  rate: number
  parseSummary?: string
  parseSource?: SourceType
}) {
  const region = SEEDANCE_PRODUCT.regions.find(r => r.id === state.regionId)!
  const model = region.models.find(m => m.id === state.modelId)
  const tier = model?.tiers.find(t => t.id === state.tierId)

  const result: ResultData = useMemo(() => {
    const tokens = Math.max(num(state.tokens), 0)
    if (!model) return blankWarn(SEEDANCE_PRODUCT, `模型 ${state.modelId} 无定价`)
    if (!tier) return blankWarn(SEEDANCE_PRODUCT, '所选分辨率档位不在该模型支持范围内')
    const unit = state.hasVideo ? tier.priceYes : tier.priceNo
    if (unit == null) return blankWarn(SEEDANCE_PRODUCT, '该档位在当前输入类型下无定价')
    const amountBase = (tokens / 1_000_000) * unit
    const money = dual(amountBase, region.currency, rate)
    const unitD = dual(unit, region.currency, rate)
    return {
      cny: money.cny,
      usd: money.usd,
      unitCny: unitD.cny,
      unitUsd: unitD.usd,
      unitNoun: SEEDANCE_PRODUCT.unitNoun,
      params: `${model.label} · ${tier.label} · 输入${state.hasVideo ? '含' : '不含'}视频 · ${tokens.toLocaleString()} tokens · 汇率 1 USD = ${rate} CNY`,
      parseSummary,
      parseSource,
    }
  }, [state, model, tier, region, rate, parseSummary, parseSource])

  function onRegion(regionId: string) {
    const r = SEEDANCE_PRODUCT.regions.find(x => x.id === regionId)!
    const m = r.models[0]
    setState({ ...state, regionId, modelId: m.id, tierId: m.tiers[0].id })
  }
  function onModel(modelId: string) {
    const m = region.models.find(x => x.id === modelId)!
    const tierStillValid = m.tiers.some(t => t.id === state.tierId)
    setState({ ...state, modelId, tierId: tierStillValid ? state.tierId : m.tiers[0].id })
  }

  return (
    <div className="grid gap-5">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="计费区域" full>
            <SegmentedControl
              value={state.regionId}
              options={SEEDANCE_PRODUCT.regions.map(r => ({ value: r.id, label: `${r.label} (${r.currency})` }))}
              onChange={onRegion}
              className="w-full"
            />
          </Field>
          <Field label="模型变体">
            <CustomSelect value={state.modelId} onChange={onModel}
              options={region.models.map(m => ({ value: m.id, label: m.label }))} />
          </Field>
          <Field label="输出分辨率">
            <CustomSelect value={state.tierId} onChange={v => setState({ ...state, tierId: v })}
              options={(model?.tiers ?? []).map(t => ({ value: t.id, label: t.label }))} />
          </Field>
          <Field label="输入是否包含视频">
            <CustomSelect value={state.hasVideo ? 'yes' : 'no'} onChange={v => setState({ ...state, hasVideo: v === 'yes' })}
              options={[
                { value: 'no', label: '否（纯生成，更贵）' },
                { value: 'yes', label: '是（视频编辑，更便宜）' },
              ]} />
          </Field>
          <Field label="Token 数量" hint="以 API 响应 usage.total_tokens 为准">
            <CustomInput type="number" value={state.tokens} onChange={v => setState({ ...state, tokens: v })} placeholder="200000" mono />
          </Field>
        </div>
      </Card>

      <ResultCard data={result} />

      <PriceTable
        region={region}
        unitNoun={SEEDANCE_PRODUCT.unitNoun}
        selectedModel={state.modelId}
        selectedTier={state.tierId}
        onSelect={(modelId, tierId) => setState({ ...state, modelId, tierId })}
        showYes
      />
    </div>
  )
}

/* ─── GROK IMAGE 面板（按张计费） ────────────────────────────────────────────── */

interface GrokImageState {
  modelId: string
  tierId: string
  n: string
}

const GROK_IMAGE_PRODUCT = getProduct('grok-image')!
const GROK_IMAGE_REGION = GROK_IMAGE_PRODUCT.regions[0]

function defaultGrokImageState(): GrokImageState {
  const m = GROK_IMAGE_REGION.models[0]
  return { modelId: m.id, tierId: m.tiers[0].id, n: '1' }
}

function applyGrokImageFill(s: GrokImageState, fill: GrokImageFill): GrokImageState {
  const m = GROK_IMAGE_REGION.models.find(x => x.id === fill.modelId) || GROK_IMAGE_REGION.models[0]
  let tierId = m.tiers[0].id
  if (fill.resolution) {
    const match = m.tiers.find(t => t.label.toLowerCase().startsWith(fill.resolution!.toLowerCase()))
    if (match) tierId = match.id
  }
  return { modelId: m.id, tierId, n: fill.n != null ? String(fill.n) : s.n }
}

function GrokImagePanel({ state, setState, rate, parseSummary, parseSource }: {
  state: GrokImageState
  setState: (s: GrokImageState) => void
  rate: number
  parseSummary?: string
  parseSource?: SourceType
}) {
  const model = GROK_IMAGE_REGION.models.find(m => m.id === state.modelId)
  const tier = model?.tiers.find(t => t.id === state.tierId)

  const result: ResultData = useMemo(() => {
    const n = Math.max(num(state.n), 0)
    if (!model) return blankWarn(GROK_IMAGE_PRODUCT, '模型无定价')
    if (!tier || tier.priceNo == null) return blankWarn(GROK_IMAGE_PRODUCT, '所选分辨率档位无定价')
    const unit = tier.priceNo
    const amountBase = n * unit
    const money = dual(amountBase, GROK_IMAGE_REGION.currency, rate)
    const unitD = dual(unit, GROK_IMAGE_REGION.currency, rate)
    return {
      cny: money.cny,
      usd: money.usd,
      unitCny: unitD.cny,
      unitUsd: unitD.usd,
      unitNoun: GROK_IMAGE_PRODUCT.unitNoun,
      params: `${model.label} · ${tier.label} · ${n} 张 · 汇率 1 USD = ${rate} CNY`,
      parseSummary,
      parseSource,
    }
  }, [state, model, tier, rate, parseSummary, parseSource])

  function onModel(modelId: string) {
    const m = GROK_IMAGE_REGION.models.find(x => x.id === modelId)!
    const valid = m.tiers.some(t => t.id === state.tierId)
    setState({ ...state, modelId, tierId: valid ? state.tierId : m.tiers[0].id })
  }

  return (
    <div className="grid gap-5">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="模型变体">
            <CustomSelect value={state.modelId} onChange={onModel}
              options={GROK_IMAGE_REGION.models.map(m => ({ value: m.id, label: m.label }))} />
          </Field>
          <Field label="分辨率档位">
            <CustomSelect value={state.tierId} onChange={v => setState({ ...state, tierId: v })}
              options={(model?.tiers ?? []).map(t => ({ value: t.id, label: t.label }))} />
          </Field>
          <Field label="生成张数 (n)" full hint="按张计费：单价 × 张数">
            <CustomInput type="number" value={state.n} onChange={v => setState({ ...state, n: v })} placeholder="1" mono />
          </Field>
        </div>
      </Card>

      <ResultCard data={result} />

      <PriceTable
        region={GROK_IMAGE_REGION}
        unitNoun={GROK_IMAGE_PRODUCT.unitNoun}
        selectedModel={state.modelId}
        selectedTier={state.tierId}
        onSelect={(modelId, tierId) => setState({ ...state, modelId, tierId })}
        showYes={false}
        noLabel="单价/张"
      />
    </div>
  )
}

/* ─── GROK VIDEO 面板（按秒计费） ────────────────────────────────────────────── */

interface GrokVideoState {
  modelId: string
  tierId: string
  duration: string
}

const GROK_VIDEO_PRODUCT = getProduct('grok-video')!
const GROK_VIDEO_REGION = GROK_VIDEO_PRODUCT.regions[0]

function defaultGrokVideoState(): GrokVideoState {
  const m = GROK_VIDEO_REGION.models[0]
  return { modelId: m.id, tierId: m.tiers[0].id, duration: '6' }
}

function applyGrokVideoFill(s: GrokVideoState, fill: GrokVideoFill): GrokVideoState {
  const m = GROK_VIDEO_REGION.models.find(x => x.id === fill.modelId) || GROK_VIDEO_REGION.models[0]
  let tierId = m.tiers[0].id
  if (fill.resolution) {
    const match = m.tiers.find(t => t.id === fill.resolution)
    if (match) tierId = match.id
  }
  return { modelId: m.id, tierId, duration: fill.duration != null ? String(fill.duration) : s.duration }
}

function GrokVideoPanel({ state, setState, rate, parseSummary, parseSource }: {
  state: GrokVideoState
  setState: (s: GrokVideoState) => void
  rate: number
  parseSummary?: string
  parseSource?: SourceType
}) {
  const model = GROK_VIDEO_REGION.models.find(m => m.id === state.modelId)
  const tier = model?.tiers.find(t => t.id === state.tierId)

  const result: ResultData = useMemo(() => {
    const dur = Math.max(num(state.duration), 0)
    if (!model) return blankWarn(GROK_VIDEO_PRODUCT, '模型无定价')
    if (!tier || tier.priceNo == null) return blankWarn(GROK_VIDEO_PRODUCT, '所选分辨率档位无定价（如 fast/base 不支持 1080p）')
    const unit = tier.priceNo
    const amountBase = dur * unit
    const money = dual(amountBase, GROK_VIDEO_REGION.currency, rate)
    const unitD = dual(unit, GROK_VIDEO_REGION.currency, rate)
    return {
      cny: money.cny,
      usd: money.usd,
      unitCny: unitD.cny,
      unitUsd: unitD.usd,
      unitNoun: GROK_VIDEO_PRODUCT.unitNoun,
      params: `${model.label} · ${tier.label} · ${dur} 秒 · 汇率 1 USD = ${rate} CNY`,
      parseSummary,
      parseSource,
    }
  }, [state, model, tier, rate, parseSummary, parseSource])

  function onModel(modelId: string) {
    const m = GROK_VIDEO_REGION.models.find(x => x.id === modelId)!
    const valid = m.tiers.some(t => t.id === state.tierId)
    setState({ ...state, modelId, tierId: valid ? state.tierId : m.tiers[0].id })
  }

  return (
    <div className="grid gap-5">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="模型变体">
            <CustomSelect value={state.modelId} onChange={onModel}
              options={GROK_VIDEO_REGION.models.map(m => ({ value: m.id, label: m.label }))} />
          </Field>
          <Field label="输出分辨率">
            <CustomSelect value={state.tierId} onChange={v => setState({ ...state, tierId: v })}
              options={(model?.tiers ?? []).map(t => ({ value: t.id, label: t.label }))} />
          </Field>
          <Field label="时长（秒）" full hint="按秒计费：单价/秒 × 时长（1–15s）">
            <CustomInput type="number" value={state.duration} onChange={v => setState({ ...state, duration: v })} placeholder="6" mono />
          </Field>
        </div>
      </Card>

      <ResultCard data={result} />

      <PriceTable
        region={GROK_VIDEO_REGION}
        unitNoun={GROK_VIDEO_PRODUCT.unitNoun}
        selectedModel={state.modelId}
        selectedTier={state.tierId}
        onSelect={(modelId, tierId) => setState({ ...state, modelId, tierId })}
        showYes={false}
        noLabel="单价/秒"
      />
    </div>
  )
}

/* ─── TOKEN 计费的图片模型面板（GPT Image / Gemini Image 共用） ───────────────── */

interface TokenImageState {
  modelId: string
  /** 按 tier id 记录的 token 数 */
  tokens: Record<string, string>
}

function makeTokenImage(productId: 'gpt-image' | 'gemini-image') {
  const PRODUCT: ProductDef = getProduct(productId)!
  const REGION = PRODUCT.regions[0]

  function defaultState(): TokenImageState {
    const m = REGION.models[0]
    const tokens: Record<string, string> = {}
    m.tiers.forEach(t => (tokens[t.id] = '0'))
    if (tokens['image_out'] != null) tokens['image_out'] = '1120'
    if (tokens['text_in'] != null) tokens['text_in'] = '50'
    if (tokens['input'] != null) tokens['input'] = '50'
    return { modelId: m.id, tokens }
  }

  function applyFill(s: TokenImageState, fill: GptImageFill | GeminiImageFill): TokenImageState {
    const m = REGION.models.find(x => x.id === fill.modelId) || REGION.models[0]
    const tokens: Record<string, string> = {}
    m.tiers.forEach(t => (tokens[t.id] = s.tokens[t.id] ?? '0'))
    if (productId === 'gpt-image') {
      const f = fill as GptImageFill
      if (f.textInputTokens != null) tokens['text_in'] = String(f.textInputTokens)
      if (f.imageInputTokens != null) tokens['image_in'] = String(f.imageInputTokens)
      if (f.outputTokens != null) tokens['image_out'] = String(f.outputTokens)
    } else {
      const f = fill as GeminiImageFill
      if (f.inputTokens != null) tokens['input'] = String(f.inputTokens)
      if (f.textOutputTokens != null) tokens['text_out'] = String(f.textOutputTokens)
      if (f.imageOutputTokens != null) tokens['image_out'] = String(f.imageOutputTokens)
    }
    return { modelId: m.id, tokens }
  }

  function Panel({ state, setState, rate, parseSummary, parseSource }: {
    state: TokenImageState
    setState: (s: TokenImageState) => void
    rate: number
    parseSummary?: string
    parseSource?: SourceType
  }) {
    const model = REGION.models.find(m => m.id === state.modelId)

    const result: ResultData = useMemo(() => {
      if (!model) return blankWarn(PRODUCT, '模型无定价')
      let amountBase = 0
      let anyPrice = false
      let totalTokens = 0
      for (const t of model.tiers) {
        const tk = Math.max(num(state.tokens[t.id] ?? '0'), 0)
        totalTokens += tk
        if (t.priceNo == null) continue
        anyPrice = true
        amountBase += (tk / 1_000_000) * t.priceNo
      }
      if (!anyPrice) return blankWarn(PRODUCT, '该模型缺少 token 定价')
      const money = dual(amountBase, REGION.currency, rate)
      const blendedUnit = totalTokens > 0 ? amountBase / (totalTokens / 1_000_000) : 0
      const unitD = dual(blendedUnit, REGION.currency, rate)
      const usageStr = model.tiers
        .map(t => `${t.label.replace(' token', '')} ${num(state.tokens[t.id] ?? '0').toLocaleString()}`)
        .join(' · ')
      return {
        cny: money.cny,
        usd: money.usd,
        unitCny: unitD.cny,
        unitUsd: unitD.usd,
        unitNoun: '百万 Token(混合)',
        params: `${model.label} · ${usageStr} · 汇率 1 USD = ${rate} CNY`,
        parseSummary,
        parseSource,
      }
    }, [state, model, rate, parseSummary, parseSource])

    function onModel(modelId: string) {
      const m = REGION.models.find(x => x.id === modelId)!
      const tokens: Record<string, string> = {}
      m.tiers.forEach(t => (tokens[t.id] = state.tokens[t.id] ?? '0'))
      setState({ modelId, tokens })
    }

    const sym = CUR_SYMBOL[REGION.currency]

    return (
      <div className="grid gap-5">
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="模型变体" full>
              <CustomSelect value={state.modelId} onChange={onModel}
                options={REGION.models.map(m => ({ value: m.id, label: m.label }))} />
            </Field>
            {model?.tiers.map(t => (
              <Field key={t.id} label={t.label}
                hint={t.priceNo == null ? '无定价' : `${sym}${fmtUnit(t.priceNo)} / 百万 token`}>
                <CustomInput
                  type="number"
                  value={state.tokens[t.id] ?? '0'}
                  onChange={v => setState({ ...state, tokens: { ...state.tokens, [t.id]: v } })}
                  mono
                />
              </Field>
            ))}
          </div>
        </Card>

        <ResultCard data={result} />

        <PriceTable
          region={REGION}
          unitNoun="百万 Token"
          selectedModel={state.modelId}
          selectedTier=""
          onSelect={modelId => onModel(modelId)}
          showYes={false}
          noLabel="单价"
        />
      </div>
    )
  }

  return { defaultState, applyFill, Panel }
}

const gptImage = makeTokenImage('gpt-image')
const geminiImage = makeTokenImage('gemini-image')

/* ─── 工具主组件 ────────────────────────────────────────────────────────────── */

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  seedance: <IconSeedance />,
  'grok-image': <IconGrokImage />,
  'grok-video': <IconGrokVideo />,
  'gpt-image': <IconGptImage />,
  'gemini-image': <IconGeminiImage />,
}

function MultiCostTool() {
  const [rateStr, setRateStr] = useState<string>(() => {
    try {
      return localStorage.getItem(FX_STORAGE_KEY) || '7'
    } catch {
      return '7'
    }
  })
  useEffect(() => {
    try { localStorage.setItem(FX_STORAGE_KEY, rateStr) } catch {}
  }, [rateStr])
  const rate = num(rateStr, 7) || 7

  const [product, setProduct] = useState<string>('seedance')
  const [seedance, setSeedance] = useState<SeedanceState>(defaultSeedanceState)
  const [grokImage, setGrokImage] = useState<GrokImageState>(defaultGrokImageState)
  const [grokVideo, setGrokVideo] = useState<GrokVideoState>(defaultGrokVideoState)
  const [gpt, setGpt] = useState<TokenImageState>(gptImage.defaultState)
  const [gemini, setGemini] = useState<TokenImageState>(geminiImage.defaultState)

  const [parseInfo, setParseInfo] = useState<{
    productId: string
    summary: string
    source: SourceType
  } | null>(null)

  function handleRecognized(r: ParseResult) {
    setProduct(r.productId)
    setParseInfo({ productId: r.productId, summary: r.summary, source: r.source })
    switch (r.fill.productId) {
      case 'seedance':
        setSeedance(s => applySeedanceFill(s, r.fill as SeedanceFill))
        break
      case 'grok-image':
        setGrokImage(s => applyGrokImageFill(s, r.fill as GrokImageFill))
        break
      case 'grok-video':
        setGrokVideo(s => applyGrokVideoFill(s, r.fill as GrokVideoFill))
        break
      case 'gpt-image':
        setGpt(s => gptImage.applyFill(s, r.fill as GptImageFill))
        break
      case 'gemini-image':
        setGemini(s => geminiImage.applyFill(s, r.fill as GeminiImageFill))
        break
    }
  }

  const activeParse = useMemo(
    () => (parseInfo && parseInfo.productId === product ? parseInfo : null),
    [parseInfo, product]
  )

  const tabOptions = PRODUCTS.map(p => ({
    value: p.id,
    label: p.label,
    icon: PRODUCT_ICONS[p.id],
  }))

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionTitle>图片视频计费计算器</SectionTitle>
      <p className="text-sm mt-1 mb-5" style={{ color: 'var(--t3)' }}>
        多模型 · 双币种 · 支持粘贴 JSON 自动识别计费
      </p>

      <div className="grid gap-5">
        <SegmentedControl value={product} options={tabOptions} onChange={setProduct} className="w-full" />

        <JsonRecognizer activeProduct={product} onRecognized={handleRecognized} />

        <Card>
          <div className="max-w-[240px]">
            <Field label="汇率 1 USD = ? CNY" hint="修改后自动保存到本地 (localStorage)">
              <CustomInput type="number" value={rateStr} onChange={setRateStr} placeholder="7" mono />
            </Field>
          </div>
        </Card>

        {product === 'seedance' && (
          <SeedancePanel state={seedance} setState={setSeedance} rate={rate}
            parseSummary={activeParse?.summary} parseSource={activeParse?.source} />
        )}
        {product === 'grok-image' && (
          <GrokImagePanel state={grokImage} setState={setGrokImage} rate={rate}
            parseSummary={activeParse?.summary} parseSource={activeParse?.source} />
        )}
        {product === 'grok-video' && (
          <GrokVideoPanel state={grokVideo} setState={setGrokVideo} rate={rate}
            parseSummary={activeParse?.summary} parseSource={activeParse?.source} />
        )}
        {product === 'gpt-image' && (
          <gptImage.Panel state={gpt} setState={setGpt} rate={rate}
            parseSummary={activeParse?.summary} parseSource={activeParse?.source} />
        )}
        {product === 'gemini-image' && (
          <geminiImage.Panel state={gemini} setState={setGemini} rate={rate}
            parseSummary={activeParse?.summary} parseSource={activeParse?.source} />
        )}
      </div>

      <footer className="mt-10 text-center text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>
        价格数据于开发阶段联网核实自各官方来源（火山方舟 / x.ai / OpenAI / Google AI）。
        <br />
        标注「占位 / 需人工核实」的项请以官网最新价格为准。运行时纯本地计算，无网络请求。
      </footer>
    </div>
  )
}

export default MultiCostTool
