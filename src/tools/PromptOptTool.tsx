import React, { useState, useEffect, useRef } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, CustomTextarea, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { IconChevron } from '../shared/icons'
import { encryptLlmApiKey, decryptLlmApiKey } from '../shared/api-key-crypto'
import {
  FRAMEWORKS, SCENARIOS, frameworkOf, buildGenerateMessages, buildOptimizeMessages,
  parseOptimizeOutput, joinLlmUrl, type FrameworkId, type FrameworkFieldValues,
} from '../shared/prompt-frameworks'
import PromptOptKnowledge from './PromptOptKnowledge'

const MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace'

interface PromptChannel {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKeyEnc: string
  keyMask: string
}

interface UiState {
  mode: 'write' | 'optimize'
  scenario: string
  framework: FrameworkId
  fields: Record<FrameworkId, FrameworkFieldValues>
  optimizeInput: string
  targetFw: FrameworkId | 'auto'
}

const CH_KEY = 'promptopt-channels'
const ACTIVE_KEY = 'promptopt-active'
const UI_KEY = 'promptopt-ui'
const LLM_TIMEOUT_MS = 120000

const DEFAULT_UI: UiState = { mode: 'write', scenario: '', framework: 'rtf', fields: {}, optimizeInput: '', targetFw: 'auto' }

function loadChannels(): PromptChannel[] {
  try {
    const raw = localStorage.getItem(CH_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(c => c && typeof c.id === 'string') : []
  } catch { return [] }
}

function loadUi(): UiState {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (!raw) return DEFAULT_UI
    const j = JSON.parse(raw)
    return {
      mode: j.mode === 'optimize' ? 'optimize' : 'write',
      scenario: typeof j.scenario === 'string' ? j.scenario : '',
      framework: FRAMEWORKS.some(f => f.id === j.framework) ? j.framework as FrameworkId : 'rtf',
      fields: j.fields && typeof j.fields === 'object' ? j.fields as UiState['fields'] : {},
      optimizeInput: typeof j.optimizeInput === 'string' ? j.optimizeInput : '',
      targetFw: j.targetFw === 'auto' || FRAMEWORKS.some(f => f.id === j.targetFw) ? j.targetFw as FrameworkId | 'auto' : 'auto',
    }
  } catch { return DEFAULT_UI }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function callChat(channel: PromptChannel, messages: { role: string; content: string }[]):
  Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const apiKey = await decryptLlmApiKey(channel.apiKeyEnc)
  if (!apiKey) return { ok: false, error: '渠道 API Key 解密失败，请重新编辑渠道并保存' }
  const url = joinLlmUrl(channel.baseUrl, '/v1/chat/completions')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), LLM_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: channel.model, messages, stream: false }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = JSON.parse(text)
        const m = j?.error?.message ?? j?.message
        if (m) msg = `${msg}：${m}`
      } catch { /* keep status only */ }
      return { ok: false, error: msg }
    }
    let content = ''
    try {
      const j = JSON.parse(text)
      content = j?.choices?.[0]?.message?.content ?? ''
    } catch {
      return { ok: false, error: '响应不是有效的 JSON' }
    }
    if (!content) return { ok: false, error: '响应中没有可用的文本内容' }
    return { ok: true, content }
  } catch (err) {
    const e = err as Error
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { ok: false, error: `请求超时（> ${LLM_TIMEOUT_MS / 1000} 秒）` }
    if (e instanceof TypeError) return { ok: false, error: '网络错误或 CORS 被拦截' }
    return { ok: false, error: e?.message ?? '请求失败' }
  } finally {
    clearTimeout(timer)
  }
}

function PromptOptTool() {
  const [channels, setChannels] = useState<PromptChannel[]>(() => loadChannels())
  const [activeChId, setActiveChId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ACTIVE_KEY)
  })
  const [showChannels, setShowChannels] = useState(false)
  const [chForm, setChForm] = useState({ name: '', baseUrl: '', model: '', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)

  const [ui, setUi] = useState<UiState>(() => loadUi())
  const [kbOpen, setKbOpen] = useState(false)
  const [busy, setBusy] = useState<'write' | 'optimize' | null>(null)
  const [writeErr, setWriteErr] = useState('')
  const [writeResult, setWriteResult] = useState<string | null>(null)
  const [optErr, setOptErr] = useState('')
  const [optResult, setOptResult] = useState<{ optimized: string; notes: string } | null>(null)
  const [toast, setToast] = useState('')
  const toastRef = useRef<number | null>(null)

  const activeChannel = channels.find(c => c.id === activeChId) ?? null
  const fw = frameworkOf(ui.framework)
  const scenario = SCENARIOS.find(s => s.id === ui.scenario) ?? null
  const scenarioMatched = !!scenario && scenario.frameworkId === ui.framework
  const fieldValues = ui.fields[fw.id] ?? {}

  useEffect(() => { try { localStorage.setItem(CH_KEY, JSON.stringify(channels)) } catch { /* ignore */ } }, [channels])
  useEffect(() => {
    if (activeChId) { try { localStorage.setItem(ACTIVE_KEY, activeChId) } catch { /* ignore */ } }
  }, [activeChId])
  useEffect(() => {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)) } catch { /* ignore */ }
  }, [ui])

  const toastShow = (m: string) => {
    setToast(m)
    if (toastRef.current) window.clearTimeout(toastRef.current)
    toastRef.current = window.setTimeout(() => setToast(''), 2200)
  }

  const setField = (fwId: FrameworkId, key: string, v: string) => {
    setUi(u => ({ ...u, fields: { ...u.fields, [fwId]: { ...(u.fields[fwId] ?? {}), [key]: v } } }))
  }

  const saveChannel = async () => {
    const name = chForm.name.trim()
    const base = chForm.baseUrl.trim().replace(/\/+$/, '')
    const model = chForm.model.trim()
    const key = chForm.apiKey.trim()
    if (!name || !base) { toastShow('请填写渠道名称与 baseUrl'); return }
    if (!model) { toastShow('请填写模型编码'); return }
    let apiKeyEnc = ''
    let keyMask = ''
    if (key) {
      const enc = await encryptLlmApiKey(key)
      if (!enc) { toastShow('加密失败，请重试'); return }
      apiKeyEnc = enc
      keyMask = key.slice(0, 8) + '••••' + key.slice(-4)
    }
    if (editingChId) {
      const target = channels.find(c => c.id === editingChId)
      if (!target) return
      const nc: PromptChannel = { ...target, name, baseUrl: base, model }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(c => c.id === editingChId ? nc : c))
    } else {
      if (!apiKeyEnc) { toastShow('请填写 apiKey'); return }
      const nc: PromptChannel = { id: uid(), name, baseUrl: base, model, apiKeyEnc, keyMask }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm({ name: '', baseUrl: '', model: '', apiKey: '' })
    setEditingChId(null)
    toastShow('已保存')
  }

  const editChannel = (c: PromptChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, model: c.model, apiKey: '' })
    setEditingChId(c.id)
  }

  const delChannel = (id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(channels.filter(c => c.id !== id))
    if (activeChId === id) setActiveChId(null)
  }

  const pickScenario = (id: string, fwId: FrameworkId) => {
    setUi(u => ({ ...u, scenario: id, framework: fwId }))
  }

  const runGenerate = async () => {
    const ch = activeChannel
    if (!ch) { setWriteErr('请先添加并选择一个渠道'); return }
    const core = fw.fields.filter(f => f.core)
    if (!core.some(f => (fieldValues[f.key] ?? '').trim())) {
      setWriteErr(`请至少填写一个必填要素（${core.map(f => f.cn).join('、')}）`)
      return
    }
    setBusy('write'); setWriteErr(''); setWriteResult(null)
    const { system, user } = buildGenerateMessages(fw, fieldValues)
    const res = await callChat(ch, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    setBusy(null)
    if (res.ok) setWriteResult(res.content)
    else setWriteErr(res.error)
  }

  const runOptimize = async () => {
    const ch = activeChannel
    if (!ch) { setOptErr('请先添加并选择一个渠道'); return }
    const raw = ui.optimizeInput.trim()
    if (raw.length < 5) { setOptErr('请先粘贴要优化的提示词'); return }
    setBusy('optimize'); setOptErr(''); setOptResult(null)
    const { system, user } = buildOptimizeMessages(raw, ui.targetFw)
    const res = await callChat(ch, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    setBusy(null)
    if (res.ok) setOptResult(parseOptimizeOutput(res.content))
    else setOptErr(res.error)
  }

  const channelPane = (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
          已保存的渠道 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{channels.length}</span>
        </p>
        {channels.length === 0 && <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>还没有渠道，请在下方添加。</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {channels.map(c => (
            <div key={c.id} className="rounded-2xl p-4 relative" style={{ border: `1px solid ${c.id === activeChId ? 'var(--accent)' : 'var(--border)'}`, background: c.id === activeChId ? 'var(--accentSub)' : 'var(--s1)' }}>
              {c.id === activeChId && <span className="absolute top-3 right-4 text-[11px] font-bold" style={{ color: 'var(--accent)' }}>✓ 当前使用</span>}
              <div className="text-sm font-bold pr-16 truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
              <div className="text-xs break-all mt-1" style={{ color: 'var(--t3)' }}>{c.baseUrl}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--accent)' }}>{c.model}</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--t3)' }}>{c.keyMask || '（未设置）'}</div>
              <div className="flex gap-2 mt-3">
                <Btn small variant="soft" onClick={() => setActiveChId(c.id)}>设为当前</Btn>
                <Btn small variant="soft" onClick={() => editChannel(c)}>编辑</Btn>
                <Btn small variant="danger" onClick={() => delChannel(c.id)}>删除</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{editingChId ? '编辑渠道' : '添加新渠道'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="block mb-1.5">渠道名称</Label>
            <CustomInput value={chForm.name} onChange={v => setChForm(f => ({ ...f, name: v }))} placeholder="例如：主线-oinone" />
          </div>
          <div>
            <Label className="block mb-1.5">Base URL</Label>
            <CustomInput value={chForm.baseUrl} onChange={v => setChForm(f => ({ ...f, baseUrl: v }))} placeholder="https://api.openai.com" mono />
          </div>
          <div>
            <Label className="block mb-1.5">模型编码</Label>
            <CustomInput value={chForm.model} onChange={v => setChForm(f => ({ ...f, model: v }))} placeholder="gpt-4o-mini" mono />
          </div>
          <div>
            <Label className="block mb-1.5">apiKey {editingChId ? '（留空保持不变，本地加密存储）' : ''}</Label>
            <CustomInput value={chForm.apiKey} onChange={v => setChForm(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" mono />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Btn variant="primary" onClick={saveChannel}>保存渠道</Btn>
          <Btn variant="soft" onClick={() => { setChForm({ name: '', baseUrl: '', model: '', apiKey: '' }); setEditingChId(null) }}>清空表单</Btn>
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>渠道信息保存在本浏览器 localStorage 中（apiKey 经 AES-GCM 加密）。</span>
        </div>
      </Card>
    </div>
  )

  const writePane = (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>① 选择场景，获取智能推荐</p>
        <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>你的任务有什么突出特点？选择最符合的一项，系统会推荐最合适的框架。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {SCENARIOS.map(s => {
            const active = ui.scenario === s.id
            return (
              <button key={s.id} onClick={() => pickScenario(s.id, s.frameworkId)}
                className="text-left px-3.5 py-3 rounded-xl text-xs leading-relaxed cursor-pointer outline-none transition-all duration-150"
                style={{
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accentSub)' : 'var(--s1)',
                  color: active ? 'var(--accent)' : 'var(--t2)',
                }}>
                {s.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3.5 mt-3 rounded-2xl px-4 py-3.5" style={{ background: 'linear-gradient(135deg, var(--accentSub), var(--s1))', border: '1px solid var(--border)' }}>
          <div className="flex-shrink-0 w-11 h-11 rounded-xl grid place-items-center text-[11px] font-bold text-white" style={{ background: 'linear-gradient(145deg, var(--accent), var(--accent))', boxShadow: '0 6px 14px var(--accentSub)' }}>{fw.abbr}</div>
          <div className="min-w-0">
            <strong className="block text-sm" style={{ color: 'var(--text)' }}>{scenarioMatched ? `优先推荐 ${fw.abbr}` : `已手动选择 ${fw.abbr}`}</strong>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
              {scenarioMatched ? scenario!.reason : `${fw.fullName} · ${fw.tagline}，适合${fw.bestFor}。`}
            </p>
          </div>
          <div className="ml-auto w-44 flex-shrink-0 hidden sm:block">
            <Label className="block mb-1">换一个框架</Label>
            <CustomSelect value={fw.id} onChange={v => setUi(u => ({ ...u, framework: v as FrameworkId }))} options={FRAMEWORKS.map(f => ({ value: f.id, label: `${f.abbr} · ${f.tagline}` }))} />
          </div>
        </div>
        <div className="sm:hidden mt-2.5">
          <Label className="block mb-1.5">换一个框架</Label>
          <CustomSelect value={fw.id} onChange={v => setUi(u => ({ ...u, framework: v as FrameworkId }))} options={FRAMEWORKS.map(f => ({ value: f.id, label: `${f.abbr} · ${f.tagline}` }))} />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>② 填写 {fw.abbr} 要素</p>
        <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>{fw.fullName} · {fw.fields.length} 个要素，标「必填」的至少填一个，其余可留空由 LLM 合理补全。</p>
        <div className="flex flex-col gap-3">
          {fw.fields.map(f => (
            <div key={f.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-baseline gap-2">
                  <Label>{f.name}</Label>
                  <span className="text-xs" style={{ color: 'var(--t3)' }}>{f.cn}</span>
                </div>
                {f.core && <Badge color="warn">必填</Badge>}
              </div>
              <CustomTextarea value={fieldValues[f.key] ?? ''} onChange={v => setField(fw.id, f.key, v)} rows={2} placeholder={f.hint} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Btn variant="primary" disabled={busy !== null} onClick={runGenerate}>
            {busy === 'write' ? '生成中…' : '✨ 生成系统提示词'}
          </Btn>
          {activeChannel && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>将使用渠道「{activeChannel.name}」· {activeChannel.model}</span>}
        </div>
        {writeErr && <p className="text-xs mt-3" style={{ color: 'var(--err)' }}>⚠ {writeErr}</p>}
        {writeResult && (
          <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)' }}>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] tracking-wide" style={{ color: 'var(--t3)', letterSpacing: '0.06em' }}>系统提示词 · {fw.abbr}</span>
              <CopyBtn text={writeResult} />
            </div>
            <pre className="px-3 pb-3 overflow-auto text-xs leading-relaxed whitespace-pre-wrap break-all" style={{ color: 'var(--text)', fontFamily: MONO, margin: 0, maxHeight: '24rem' }}>{writeResult}</pre>
          </div>
        )}
      </Card>
    </div>
  )

  const optimizePane = (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>粘贴现有提示词</p>
        <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>LLM 将对照四大核心要素诊断薄弱环节并输出优化版本与改动说明。</p>
        <CustomTextarea value={ui.optimizeInput} onChange={v => setUi(u => ({ ...u, optimizeInput: v }))} rows={8} mono placeholder={'你是一名客服助手，请回答用户的问题。\n（在此粘贴一段现有提示词）'} />
        <div className="mt-3 w-full sm:w-72">
          <Label className="block mb-1.5">目标框架（可选）</Label>
          <CustomSelect value={ui.targetFw} onChange={v => setUi(u => ({ ...u, targetFw: v as FrameworkId | 'auto' }))} options={[
            { value: 'auto', label: '自动判断最适合的框架' },
            ...FRAMEWORKS.map(f => ({ value: f.id, label: `${f.abbr} · ${f.tagline}` })),
          ]} />
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Btn variant="primary" disabled={busy !== null} onClick={runOptimize}>
            {busy === 'optimize' ? '优化中…' : '✨ 优化提示词'}
          </Btn>
          {activeChannel && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>将使用渠道「{activeChannel.name}」· {activeChannel.model}</span>}
        </div>
        {optErr && <p className="text-xs mt-3" style={{ color: 'var(--err)' }}>⚠ {optErr}</p>}
        {optResult && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)' }}>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] tracking-wide" style={{ color: 'var(--t3)', letterSpacing: '0.06em' }}>优化后的提示词</span>
                <CopyBtn text={optResult.optimized} />
              </div>
              <pre className="px-3 pb-3 overflow-auto text-xs leading-relaxed whitespace-pre-wrap break-all" style={{ color: 'var(--text)', fontFamily: MONO, margin: 0, maxHeight: '24rem' }}>{optResult.optimized}</pre>
            </div>
            {optResult.notes && (
              <div className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--text)' }}>改动说明</p>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--t2)', fontFamily: 'inherit', margin: 0 }}>{optResult.notes}</pre>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionTitle>提示词优化</SectionTitle>
      <p className="text-sm mb-8 leading-relaxed" style={{ color: 'var(--t2)' }}>
        选择场景获得框架推荐，按模板引导填写要素，由 LLM 生成可直接使用的系统提示词；也可以粘贴现有提示词，让 LLM 审视并改写。
      </p>

      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-full sm:w-96 flex-shrink-0">
            <Label className="block mb-1.5">使用渠道</Label>
            <CustomSelect value={activeChId ?? ''} onChange={v => setActiveChId(v)} options={channels.map(c => ({ value: c.id, label: `${c.name} — ${c.baseUrl} · ${c.model}` }))} />
          </div>
          <div className="ml-auto">
            <Btn variant="soft" onClick={() => setShowChannels(s => !s)}>
              渠道管理 {showChannels ? '▲' : '▼'}
            </Btn>
          </div>
        </div>
        {channels.length === 0 && <p className="text-xs mt-2.5" style={{ color: 'var(--warn)' }}>⚠ 还没有渠道，请先添加一个。</p>}
      </Card>

      {showChannels && <div className="mt-4">{channelPane}</div>}

      <div className="mt-4">
        <SegmentedControl value={ui.mode} onChange={v => setUi(u => ({ ...u, mode: v as UiState['mode'] }))} options={[
          { value: 'write', label: '撰写系统提示词' },
          { value: 'optimize', label: '优化现有提示词' },
        ]} />
      </div>

      <div className="mt-4">
        {ui.mode === 'write' ? writePane : optimizePane}
      </div>

      <Card className="mt-5">
        <button onClick={() => setKbOpen(o => !o)} aria-expanded={kbOpen}
          className="w-full flex items-center justify-between gap-3 cursor-pointer border-0 outline-none bg-transparent text-left"
          style={{ color: 'var(--text)' }}>
          <span className="text-sm font-bold">框架知识库 <span className="font-normal" style={{ color: 'var(--t3)' }}>RTF · ICIO · CRISPE · CO-STAR · TIDD-EC · BROKE</span></span>
          <span style={{ color: 'var(--t3)' }}><IconChevron open={kbOpen} /></span>
        </button>
        {kbOpen && (
          <div className="mt-4">
            <PromptOptKnowledge />
          </div>
        )}
      </Card>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-xl px-4 py-2 text-sm ia-toast-in"
          style={{ background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadowMd)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default PromptOptTool
