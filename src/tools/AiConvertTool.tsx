import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { convertFormat, type AiFmt } from '../shared/ai-format'
import { highlightJson } from '../shared/json'

// ─── Tool: AI 格式转换 ────────────────────────────────────────────────────────

const FMT_LABELS: Record<AiFmt, string> = {
  'openai-chat': 'OpenAI Chat Completions',
  'anthropic': 'Anthropic Messages',
  'openai-responses': 'OpenAI Responses',
}

const EXAMPLE_BODIES: Record<AiFmt, string> = {
  'openai-chat': JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: '你是一个有帮助的助手。' },
      { role: 'user', content: '请介绍一下你自己。' },
    ],
    max_tokens: 1024,
    temperature: 0.7,
  }, null, 2),
  'anthropic': JSON.stringify({
    model: 'claude-opus-4-8',
    system: '你是一个有帮助的助手。',
    messages: [{ role: 'user', content: '请介绍一下你自己。' }],
    max_tokens: 1024,
  }, null, 2),
  'openai-responses': JSON.stringify({
    model: 'gpt-4o',
    instructions: '你是一个有帮助的助手。',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '请介绍一下你自己。' }] }],
    max_output_tokens: 1024,
  }, null, 2),
}

function AiConvertTool() {
  const [from, setFrom] = useState<AiFmt>('openai-chat')
  const [to, setTo] = useState<AiFmt>('anthropic')
  const [input, setInput] = useState(EXAMPLE_BODIES['openai-chat'])
  const [addCache, setAddCache] = useState(false)

  const outputWithCache = useMemo(() => convertFormat(input, from, to, addCache), [input, from, to, addCache])
  const fmtOptions = (['openai-chat', 'anthropic', 'openai-responses'] as AiFmt[]).map(f => ({ value: f, label: FMT_LABELS[f] }))

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>AI 请求体格式转换</SectionTitle>
        <div className="ml-auto flex items-center gap-3">
          <Toggle value={addCache} onChange={setAddCache} label="注入 cache_control" />
        </div>
      </div>

      <div className="glass flex items-end gap-4 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1">
          <Label className="block mb-1.5">源格式</Label>
          <CustomSelect value={from} onChange={v => { setFrom(v as AiFmt); setInput(EXAMPLE_BODIES[v as AiFmt]) }} options={fmtOptions} />
        </div>
        <div className="flex-shrink-0 pb-2 text-base" style={{ color: 'var(--t3)' }}>→</div>
        <div className="flex-1">
          <Label className="block mb-1.5">目标格式</Label>
          <CustomSelect value={to} onChange={v => setTo(v as AiFmt)} options={fmtOptions} />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <div className="flex flex-col p-4 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center mb-2">
            <Label>输入</Label>
            <div className="ml-auto">
              <CopyBtn text={input} />
            </div>
          </div>
          <CustomTextarea value={input} onChange={setInput} mono stretch className="flex-1" style={{ minHeight: 0 }} />
        </div>
        <div className="flex flex-col p-4 overflow-hidden">
          <div className="flex items-center mb-2">
            <Label>输出</Label>
            <div className="ml-auto">
              <CopyBtn text={outputWithCache} />
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-auto p-3 text-xs"
            style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, whiteSpace: 'pre' }}>
            <div dangerouslySetInnerHTML={{ __html: highlightJson(outputWithCache) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AiConvertTool
