import React, { Suspense, useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue  } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { IconEye, IconRepeat, IconTrash, IconExpand } from '../shared/icons'
import { formatJson, formatJsonWithPlaceholders, highlightJson, computeDiff, findMatchingBracket, JSON_ROW, JSON_PAD_TB, JSON_PAD_L, JSON_LINE_NO_W, JSON_FOLD_W, JSON_GUTTER_W, JSON_CONTENT_X, JSON_EDITOR_STYLE, computeFoldRanges, getVisibleLines } from '../shared/json'
import { convertFormat, type AiFmt } from '../shared/ai-format'
import { decryptLlmApiKey, encryptLlmApiKey } from '../shared/api-key-crypto'

// ─── Shared: 只读 JSON 查看器（复用 JSON 可视化工具的高亮/折叠/虚拟滚动能力）───

const LLM_JSON_VIEWER_DEGRADE_LINES = 5000
const LLM_JSON_VIEWER_DEGRADE_CHARS = 500_000
const LLM_JSON_VIEWER_DEGRADE_LINE_LEN = 20_000

function ReadOnlyJsonTree({ text }: { text: string }) {
  const OVERSCAN = 10
  const lines = useMemo(() => text.split('\n'), [text])
  const degrade = useMemo(() =>
    lines.length > LLM_JSON_VIEWER_DEGRADE_LINES ||
    text.length > LLM_JSON_VIEWER_DEGRADE_CHARS ||
    lines.some(l => l.length > LLM_JSON_VIEWER_DEGRADE_LINE_LEN)
  , [lines, text])
  const ranges = useMemo(() => degrade ? new Map<number, number>() : computeFoldRanges(lines), [lines, degrade])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setViewportH(el.clientHeight)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggleFold = (line: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line); else next.add(line)
      return next
    })
  }

  const visible = useMemo(() => getVisibleLines(lines, ranges, collapsed), [lines, ranges, collapsed])
  const start = Math.max(0, Math.floor(scrollTop / JSON_ROW) - OVERSCAN)
  const end = Math.min(visible.length, Math.ceil((scrollTop + viewportH) / JSON_ROW) + OVERSCAN)
  const slice = visible.slice(start, end)

  const onScroll = () => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {degrade && (
        <div className="text-[11px] px-4 py-1.5 flex-shrink-0" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
          ⚠ 内容较大（{lines.length} 行 / {text.length} 字符），已关闭语法高亮与折叠以保证流畅度
        </div>
      )}
      <div ref={containerRef} onScroll={onScroll}
        className="absolute inset-0 overflow-auto"
        style={{ fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', fontSize: '12.5px', lineHeight: JSON_ROW + 'px', padding: `${JSON_PAD_TB}px 16px ${JSON_PAD_TB}px ${JSON_PAD_L}px`, tabSize: 2 }}>
        <div style={{ height: visible.length * JSON_ROW, position: 'relative' }}>
          {slice.map((i, k) => {
            const vi = start + k
            const foldEnd = ranges.get(i)
            const foldable = !degrade && foldEnd != null && foldEnd > i
            const isCollapsed = collapsed.has(i)
            return (
              <div key={i} style={{ position: 'absolute', top: vi * JSON_ROW, left: 0, right: 0, height: JSON_ROW, display: 'flex', alignItems: 'center' }}>
                <span className="select-none" style={{ width: JSON_LINE_NO_W, flexShrink: 0, textAlign: 'right', paddingRight: 4, color: 'var(--t3)', fontSize: '11px', position: 'sticky', left: 0, background: 'var(--code)' }}>{i + 1}</span>
                {foldable ? (
                  <button onClick={() => toggleFold(i)} aria-label={isCollapsed ? '展开' : '折叠'}
                    className="flex-shrink-0 border-0 bg-transparent cursor-pointer outline-none"
                    style={{ width: JSON_FOLD_W, height: JSON_FOLD_W, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', padding: 0, fontFamily: 'inherit', fontSize: '10px', position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }}>
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : <span className="flex-shrink-0" style={{ width: JSON_FOLD_W, position: 'sticky', left: JSON_LINE_NO_W, background: 'var(--code)' }} />}
                <span style={{ whiteSpace: 'pre', color: 'var(--text)', flex: 1, height: '100%' }}
                  dangerouslySetInnerHTML={degrade ? undefined : { __html: highlightJson(lines[i]) || '​' }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LlmJsonViewerModal({ title, subtitle, text, onClose, extraActions }: {
  title: string; subtitle?: string; text: string; onClose: () => void; extraActions?: React.ReactNode
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  const fmt = useMemo(() => formatJsonWithPlaceholders(text), [text])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 ia-lightbox-enter"
      style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="floating-material rounded-2xl flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 720, maxWidth: '92vw', height: '78vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
            {subtitle && <span className="text-xs" style={{ color: 'var(--t2)' }}>{subtitle}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {extraActions}
            <CopyBtn text={fmt.ok ? fmt.text : text} />
            <Btn small variant="ghost" onClick={onClose}>✕</Btn>
          </div>
        </div>
        {!fmt.ok && text.trim() !== '' && (
          <div className="mx-5 mb-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 内容不是合法 JSON，按原始文本展示
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 px-5 pb-4">
          <ReadOnlyJsonTree text={fmt.ok ? fmt.text : text} />
        </div>
      </div>
    </div>
  )
}

// 提示词编辑器用的可编辑 JSON 弹框（支持 Tab 缩进 + 格式化 + 占位符原样显示）
function LlmPromptEditorModal({ title, initial, onSave, onClose }: {
  title: string; initial: string; onSave: (body: string) => void; onClose: () => void
}) {
  const [text, setText] = useState(initial)
  const fmt = useMemo(() => formatJsonWithPlaceholders(text), [text])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart, selectionEnd, value } = ta
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = selectionStart + 2
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 ia-lightbox-enter"
      style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="floating-material rounded-2xl flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', width: 760, maxWidth: '92vw', height: '82vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn small variant="ghost" onClick={() => setText(fmt.ok ? fmt.text : text)}>格式化</Btn>
            <Btn small variant="primary" onClick={() => { onSave(text); onClose() }}>保存</Btn>
            <button onClick={onClose} aria-label="关闭" className="rounded-lg p-1.5 border-0 outline-none cursor-pointer text-sm" style={{ background: 'transparent', color: 'var(--t2)' }}
              onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s2)' }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>✕</button>
          </div>
        </div>
        {!fmt.ok && text.trim() !== '' && (
          <div className="mx-5 mb-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 内容不是合法 JSON，按原始文本展示
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 px-5 pb-5">
          <CustomTextarea value={text} onChange={setText} onKeyDown={handleTab} mono stretch className="flex-1" style={{ minHeight: 0, fontSize: 12, lineHeight: 1.6 }} />
        </div>
      </div>
    </div>
  )
}

// ─── Tool: LLM 批量测试 ───────────────────────────────────────────────────────
// 定位：Token 计费口径核查 —— 同一份请求体反复发送，输入 Token 是否恒定？换模型差多少？
// 输出 Token 波动多大？验真（返回模型是否被中转站偷换）作为辅助指标保留。

type ApiType = 'anthropic' | 'openai_chat' | 'openai_responses'

interface BatchTask {
  seq: number
  model: string
  localIdx: number // 该模型内的第几次
}

export interface BatchResult {
  seq: number
  model: string
  localIdx: number
  status: 'pending' | 'running' | 'ok' | 'error'
  httpStatus: number | null
  tFirst: number | null
  elapsed: number | null
  returnedModel: string | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
  tokenNote?: string | null // 非阻断诊断：status 为 'ok' 但流式响应未识别到 usage 时的原因提示，与 error（真正失败）区分开
  responseHeaders?: Record<string, string> | null
  responseBody?: string | null
  responseBodyTruncated?: boolean
}

export interface BatchReport {
  id: string
  title?: string
  startTime: number
  endTime: number
  durationMs: number
  apiType: ApiType
  endpoint: string
  baseUrl?: string
  timeout?: number
  channelName?: string
  bodyText: string
  promptId?: string | null
  models: string[]
  n: number
  c: number
  stopped: boolean
  total: number
  success: number
  fail: number
  results: BatchResult[]
}

interface LlmBatchCfg {
  apiType: ApiType
  endpoint: string
  apiKey: string
  timeout: number
  bodyText: string
  storeResponseBody: boolean
}

// ── 渠道（连接目标）：baseUrl + apiKey + 超时，可保存多个、选一个当前使用；
// apiType（协议）/模型列表保持全局，不属于渠道 ──
interface LlmChannel {
  id: string
  name: string
  baseUrl: string
  timeoutSec: string
  apiKeyEnc: string
  keyMask: string
}

// ── 提示词库：可管理、可搜索、可拖拽排序的请求体来源 ──
interface LlmPrompt {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

// ── 协议适配 ──

const LLM_API_PATHS: Record<ApiType, string> = {
  anthropic: '/v1/messages',
  openai_chat: '/v1/chat/completions',
  openai_responses: '/v1/responses',
}
const LLM_API_LABELS: Record<ApiType, string> = {
  anthropic: 'Anthropic Messages API',
  openai_chat: 'OpenAI Chat Completions API',
  openai_responses: 'OpenAI Responses API',
}

// baseUrl 允许填到 host（如 https://api.anthropic.com）或已含 /v1（如 https://api.openai.com/v1），
// 两种写法都推导出正确端点，避免拼出 /v1/v1/...
function llmEndpointOf(apiType: ApiType, baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '')
  const p = LLM_API_PATHS[apiType]
  return b.endsWith('/v1') ? b + p.replace(/^\/v1/, '') : b + p
}

// 反向推导：从拼接好的端点剥离协议路径后缀还原 baseUrl，用于历史「复用」在老数据（未存 baseUrl 字段）
// 上的兜底；两种剥离方式都对不上就返回 null，调用方保留当前 baseUrl 不变。
function llmBaseUrlFromEndpoint(apiType: ApiType, endpoint: string): string | null {
  const p = LLM_API_PATHS[apiType]
  const e = endpoint.trim().replace(/\/+$/, '')
  if (e.endsWith(p)) return e.slice(0, e.length - p.length)
  const shortSuffix = p.replace(/^\/v1/, '')
  if (shortSuffix && e.endsWith(shortSuffix)) return e.slice(0, e.length - shortSuffix.length)
  return null
}

// 占位符：{{model}}（旧，双花括号）与 ${[model]}（新，方括号内允许可选空白）两种写法并存，
// 均兼容带引号 "..." 和不带引号两种形式。
const MODEL_PLACEHOLDER_RE = /"\{\{model\}\}"|\{\{model\}\}|"\$\{\[\s*model\s*\]\}"|\$\{\[\s*model\s*\]\}/g
function fillModelPlaceholder(text: string, jsonStringLiteral: string): string {
  return text.replace(MODEL_PLACEHOLDER_RE, jsonStringLiteral)
}
function bodyHasModelPlaceholder(text: string): boolean {
  MODEL_PLACEHOLDER_RE.lastIndex = 0
  return MODEL_PLACEHOLDER_RE.test(text)
}
// Body 写了占位符就替换；没写就在顶层自动注入 model 字段，两种写法都能跑
function buildRequestBody(bodyText: string, model: string): Record<string, unknown> {
  if (bodyHasModelPlaceholder(bodyText)) {
    return JSON.parse(fillModelPlaceholder(bodyText, JSON.stringify(model)))
  }
  const obj = JSON.parse(bodyText) as Record<string, unknown>
  return { ...obj, model }
}
// 请求体 JSON 语法校验（占位符替换后再 parse），供左侧预览、提示词编辑器、runBatch() 校验共用。
// 成功返回空字符串，失败返回错误信息。
function validateLlmBodyJson(text: string): string {
  try {
    JSON.parse(fillModelPlaceholder(text, '"__MODEL__"'))
    return ''
  } catch (e) {
    return 'JSON 语法错误：' + ((e as Error)?.message || String(e))
  }
}

// ── 提示词请求体协议自动识别 + 转换 ──
// ApiType（下划线拼写，LLM 批量测试用）与 AiFmt（连字符拼写，AI 格式转换工具用）值域相同、字面量不同，
// 用一张映射表适配，不合并成同一类型（避免牵连 AiConvertTool 及其一整套下游）。
const API_TYPE_TO_AI_FMT: Record<ApiType, AiFmt> = {
  anthropic: 'anthropic',
  openai_chat: 'openai-chat',
  openai_responses: 'openai-responses',
}

// 结构兼容性判定：读取请求体里的结构性字段，判断它跟三种协议里的哪些"结构上说得通"。
// 返回 0~2 个协议（Anthropic/Chat 都要求 messages 存在、Responses 要求 messages 不存在，
// 二者互斥，故最多同时命中 Anthropic 和 Chat 两个，不会三个同时命中）。
function compatiblePromptApiTypes(obj: Record<string, unknown>): ApiType[] {
  const hasMessages = Array.isArray(obj.messages)
  const hasTopSystem = typeof obj.system === 'string' || Array.isArray(obj.system)
  const messagesHasSystemRole = hasMessages && (obj.messages as { role?: unknown }[]).some(m => m?.role === 'system')
  const hasInput = obj.input !== undefined
  const hasInstructions = typeof obj.instructions === 'string'
  const hasMaxOutputTokens = typeof obj.max_output_tokens === 'number'
  const hasMaxCompletionTokens = typeof obj.max_completion_tokens === 'number'
  const hasStreamOptions = typeof obj.stream_options === 'object' && obj.stream_options !== undefined && obj.stream_options !== null

  const systemConflict = hasTopSystem && messagesHasSystemRole // 顶层 system 与 messages 里的 system 消息同时出现，规则冲突

  const anthropicOk = hasMessages && !hasInput && !hasInstructions && !hasMaxOutputTokens
    && !hasMaxCompletionTokens && !hasStreamOptions && !messagesHasSystemRole && !systemConflict
  const chatOk = hasMessages && !hasInput && !hasInstructions && !hasMaxOutputTokens && !hasTopSystem && !systemConflict
  const responsesOk = !hasMessages && !hasTopSystem && !hasMaxCompletionTokens && !hasStreamOptions
    && (hasInput || hasInstructions || hasMaxOutputTokens)

  const out: ApiType[] = []
  if (anthropicOk) out.push('anthropic')
  if (chatOk) out.push('openai_chat')
  if (responsesOk) out.push('openai_responses')
  return out
}

// 单一归约：真正需要发起转换时才用（候选为 0 个→无法识别；候选为 2 个且目标协议就是候选
// 之一时，直接选目标协议本身——这种二义性只发生在请求体完全不含 system 信息时，此时
// messages[].content 的文本性检查（isTextOnlyContent 的 allowedType 对 Anthropic/Chat 两边
// 都是字面量 'text'）对两条分支完全等价，选目标协议不会带来任何额外的内容损失风险，
// 反而能避免走一趟有损的字段转换：convertFormat 只搬运 model/messages/max_tokens/system/
// temperature 五个字段，stream/stream_options 等请求体里的其它字段会被静默丢弃，
// 这正是"流式请求 token 无法识别"问题的根因之一——请求体只要没写 system 且没写
// stream_options（典型的极简流式模板），就会被误判为二义性从而被迫转换、连带把 stream
// 字段一起丢掉。目标协议不在候选内时才退回固定选 anthropic 作为转换源）。
function detectPromptApiType(obj: Record<string, unknown>, targetApiType?: ApiType): ApiType | null {
  const c = compatiblePromptApiTypes(obj)
  if (c.length === 0) return null
  if (c.length === 1) return c[0]
  if (targetApiType && c.includes(targetApiType)) return targetApiType
  return 'anthropic'
}

// content 是否"纯文本"：字符串本身算，或者数组且每个 block 的 type 都等于约定类型（text / input_text）。
// 其它情况（image/tool_use/tool_result 等非文本 block、混合数组、非字符串非数组如仅 tool_calls 的轮次）一律不算。
function isTextOnlyContent(content: unknown, allowedType: string): boolean {
  if (typeof content === 'string') return true
  if (!Array.isArray(content)) return false
  return content.every(b => b && typeof b === 'object' && (b as { type?: unknown }).type === allowedType)
}

// 有损判定：返回 null 表示可以无损转换，否则返回人类可读的丢失原因，调用方据此直接拒绝转换。
function assessContentLoss(srcApiType: ApiType, obj: Record<string, unknown>): string | null {
  const toolField = ['tools', 'tool_choice', 'functions', 'function_call'].find(f => obj[f] !== undefined)
  if (toolField) return `工具调用相关字段 "${toolField}"（转换逻辑不支持迁移，会被静默丢弃）`

  if (srcApiType === 'anthropic') {
    if (obj.system !== undefined && !isTextOnlyContent(obj.system, 'text')) return '顶层 system 字段中的非纯文本内容块'
    for (const m of (obj.messages as { role?: unknown; content?: unknown }[]) ?? []) {
      if (!isTextOnlyContent(m?.content, 'text')) return `messages 中角色为 "${String(m?.role)}" 的消息使用了非纯文本 content block（如 image / tool_use / tool_result）`
    }
    return null
  }
  if (srcApiType === 'openai_chat') {
    for (const m of (obj.messages as { role?: unknown; content?: unknown }[]) ?? []) {
      if (!isTextOnlyContent(m?.content, 'text')) return `messages 中角色为 "${String(m?.role)}" 的消息使用了非纯文本 content parts（如 image_url / input_audio）`
    }
    return null
  }
  // openai_responses
  const input = obj.input
  if (typeof input === 'string' || input === undefined) return null
  if (Array.isArray(input)) {
    for (const item of input as { role?: unknown; content?: unknown }[]) {
      if (!isTextOnlyContent(item?.content, 'input_text')) return `input 中角色为 "${String(item?.role)}" 的条目使用了非 input_text 内容（如 input_image / input_file）`
    }
  }
  return null
}

// 把纯文本 content block 数组折叠成字符串，供转换前预处理用
function joinTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  return ((content as { text?: unknown }[]) ?? []).map(b => typeof b?.text === 'string' ? b.text : '').join('\n')
}

// 展平预处理：assessContentLoss 判定无损之后才调用。convertFormat 的 anthropic/openai-chat 来源分支
// 对数组 content 处理不正确（会整体 JSON.stringify 或直接透传，而不是提取纯文本），必须先在这里把
// 纯文本 block 数组折叠成字符串再交给它，否则会产出"看似成功实则语义已错"的转换结果。
// openai_responses 来源不需要展平，convertFormat 的对应分支本身处理正确。
function flattenForConversion(srcApiType: ApiType, obj: Record<string, unknown>): Record<string, unknown> {
  if (srcApiType === 'anthropic') {
    return {
      ...obj,
      system: Array.isArray(obj.system) ? joinTextBlocks(obj.system) : obj.system,
      messages: Array.isArray(obj.messages)
        ? (obj.messages as { content?: unknown }[]).map(m => Array.isArray(m?.content) ? { ...m, content: joinTextBlocks(m.content) } : m)
        : obj.messages,
    }
  }
  if (srcApiType === 'openai_chat') {
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? (obj.messages as { content?: unknown }[]).map(m => Array.isArray(m?.content) ? { ...m, content: joinTextBlocks(m.content) } : m)
        : obj.messages,
    }
  }
  return obj
}

// 唯一对外入口：给定提示词原文和目标 API 类型，识别原文协议、按需转换。
// 结果只在运行时使用，从不写回提示词库；识别失败或有损一律拒绝，不输出任何转换结果。
function convertPromptBodyForApiType(bodyText: string, targetApiType: ApiType): { ok: true; body: string } | { ok: false; error: string } {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(fillModelPlaceholder(bodyText, '"__MODEL__"')) as Record<string, unknown>
  } catch (e) {
    // 防御性分支：正常情况下调用方只在 validateLlmBodyJson 通过后才会调用本函数
    return { ok: false, error: '请求体不是合法 JSON：' + ((e as Error)?.message || String(e)) }
  }

  // 先算出"这段请求体到底是哪种协议"的单一归约判断（detectPromptApiType 内部已经处理了
  // 0/1/2 个候选的所有情况，2 个候选且目标协议就在其中时会直接选目标协议，见该函数注释），
  // 再拿它跟目标协议比较——只有当归约结果就是目标协议本身时，才是"无需转换、原样透传"，
  // 此时不做任何有损检查（因为压根没有发生任何结构重组，image/tool_use 等复杂 content
  // block、以及 stream/stream_options 等转换环节不认识的自定义字段，都原样保留）。
  // 注意：不能在只有单个候选、且它不等于目标协议时也直接透传——单候选意味着结构已经明确
  // 排除了目标协议（比如候选是 openai_responses 但目标是 anthropic），这种情况必须走真正的
  // 转换（或因内容有损被拒绝），不能囫囵放行。
  const srcApiType = detectPromptApiType(obj, targetApiType)
  if (srcApiType === null) {
    return { ok: false, error: `无法识别该提示词请求体所属的 API 协议格式（既不符合 Anthropic、也不符合 OpenAI Chat、也不符合 OpenAI Responses 的结构特征），因此无法自动转换为「${LLM_API_LABELS[targetApiType]}」。请检查请求体结构，或手动调整为该协议对应的格式。` }
  }
  if (srcApiType === targetApiType) {
    return { ok: true, body: bodyText } // 归约结果就是目标协议本身，无需任何转换，原样透传
  }

  const lossReason = assessContentLoss(srcApiType, obj)
  if (lossReason) {
    return { ok: false, error: `识别到该提示词请求体是「${LLM_API_LABELS[srcApiType]}」格式，但其中包含${lossReason}，无法无损转换为「${LLM_API_LABELS[targetApiType]}」，已阻止自动转换。请手动调整请求体，或切换回「${LLM_API_LABELS[srcApiType]}」。` }
  }

  const flatText = JSON.stringify(flattenForConversion(srcApiType, obj))
  const convertedSentinelText = convertFormat(flatText, API_TYPE_TO_AI_FMT[srcApiType], API_TYPE_TO_AI_FMT[targetApiType], false)
  if (convertedSentinelText.startsWith('// JSON 解析失败')) {
    return { ok: false, error: '内部转换异常，请检查请求体格式。' } // 防御性分支，正常不会触发
  }

  const useNewPlaceholder = /\$\{\[\s*model\s*\]\}/.test(bodyText)
  const restoreLiteral = useNewPlaceholder ? '"${[model]}"' : '"{{model}}"'
  const finalBody = convertedSentinelText.split('"__MODEL__"').join(restoreLiteral)
  return { ok: true, body: finalBody }
}

// 单引号内的单引号需要转义成 '\''，保证生成的 curl 命令在 shell 里语法安全
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
function buildCurlCommand(report: { apiType: ApiType; endpoint: string }, bodyObj: unknown, apiKey: string): string {
  const headers: string[] = ['-H ' + shellSingleQuote('content-type: application/json')]
  if (report.apiType === 'anthropic') {
    headers.push('-H ' + shellSingleQuote(`x-api-key: ${apiKey || 'YOUR_API_KEY'}`))
    headers.push('-H ' + shellSingleQuote('anthropic-version: 2023-06-01'))
  } else {
    headers.push('-H ' + shellSingleQuote(`Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}`))
  }
  return [
    `curl -X POST ${shellSingleQuote(report.endpoint)} \\`,
    ...headers.map(h => `  ${h} \\`),
    `  -d ${shellSingleQuote(JSON.stringify(bodyObj))}`,
  ].join('\n')
}

// ── Token / model 提取（非流式）──
function extractUsageNonStream(json: any): { inTok: number | null; outTok: number | null; model: string | null } {
  const u = json?.usage
  let inTok: number | null = null
  let outTok: number | null = null
  if (u) {
    if (u.input_tokens != null || u.output_tokens != null) {
      inTok = u.input_tokens ?? null
      outTok = u.output_tokens ?? null
    } else if (u.prompt_tokens != null || u.completion_tokens != null) {
      inTok = u.prompt_tokens ?? null
      outTok = u.completion_tokens ?? null
    }
  }
  const model = typeof json?.model === 'string' ? json.model
    : typeof json?.response?.model === 'string' ? json.response.model
    : null
  return { inTok, outTok, model }
}

// ── Token / model / 正文提取（SSE 流式）──
// 正文（text）只用于「存储响应体」功能：把各协议的文本增量拼接成完整回复，与 usage/model 提取互不影响。
function makeStreamExtractor(apiType: ApiType) {
  let inTok: number | null = null
  let outTok: number | null = null
  let model: string | null = null
  let text = ''
  return {
    onData(o: any) {
      if (apiType === 'anthropic') {
        if (o?.type === 'message_start' && o.message) {
          if (o.message.usage?.input_tokens != null) inTok = o.message.usage.input_tokens
          if (typeof o.message.model === 'string') model = o.message.model
        }
        if (o?.type === 'message_delta' && o.usage?.output_tokens != null) outTok = o.usage.output_tokens
        if (o?.type === 'content_block_delta' && o.delta?.type === 'text_delta' && typeof o.delta.text === 'string') text += o.delta.text
      } else if (apiType === 'openai_chat') {
        if (typeof o?.model === 'string') model = o.model
        if (o?.usage) {
          if (o.usage.prompt_tokens != null) inTok = o.usage.prompt_tokens
          if (o.usage.completion_tokens != null) outTok = o.usage.completion_tokens
        }
        const delta = o?.choices?.[0]?.delta?.content
        if (typeof delta === 'string') text += delta
      } else {
        if (o?.type === 'response.completed' && o.response) {
          if (typeof o.response.model === 'string') model = o.response.model
          if (o.response.usage?.input_tokens != null) inTok = o.response.usage.input_tokens
          if (o.response.usage?.output_tokens != null) outTok = o.response.usage.output_tokens
        }
        if (o?.type === 'response.output_text.delta' && typeof o.delta === 'string') text += o.delta
      }
    },
    result() { return { inTok, outTok, model, text } },
  }
}

// ── 响应体存储（可选）：单条响应正文超过阈值就截断，避免历史记录把 localStorage 撑爆 ──
const LLM_RESPONSE_BODY_MAX = 20000
function truncateResponseBody(text: string): { body: string; truncated: boolean } {
  if (text.length <= LLM_RESPONSE_BODY_MAX) return { body: text, truncated: false }
  return { body: text.slice(0, LLM_RESPONSE_BODY_MAX), truncated: true }
}
// cfg.storeResponseBody 为真时才写入响应头/正文，关闭时完全不做任何事（不产生多余开销）。
// bodyText 由调用方传入：非流式/错误分支传原始响应文本，流式分支传拼接好的正文增量。
function llmApplyResponseCapture(rec: BatchResult, cfg: LlmBatchCfg, res: Response, bodyText: string) {
  if (!cfg.storeResponseBody) return
  rec.responseHeaders = Object.fromEntries(res.headers.entries())
  const { body, truncated } = truncateResponseBody(bodyText)
  rec.responseBody = body
  rec.responseBodyTruncated = truncated
}

// ── 单次请求 ──
async function doLlmRequest(cfg: LlmBatchCfg, task: BatchTask): Promise<BatchResult> {
  const rec: BatchResult = {
    seq: task.seq, model: task.model, localIdx: task.localIdx,
    status: 'error', httpStatus: null, tFirst: null, elapsed: null,
    returnedModel: null, inputTokens: null, outputTokens: null, error: null,
  }
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, cfg.timeout * 1000)
  const start = Date.now()
  try {
    let bodyObj: Record<string, any>
    try {
      bodyObj = buildRequestBody(cfg.bodyText, task.model)
    } catch (e) {
      rec.error = '请求体不是合法 JSON：' + ((e as Error)?.message || String(e))
      return rec
    }
    const isStream = bodyObj.stream === true
    // 始终合并 include_usage:true（而非只在 stream_options 完全不存在时才注入），
    // 否则请求体模板里只要带了 stream_options（哪怕是空对象或 include_usage:false），
    // 网关默认就不会在最后一个 SSE chunk 里下发 usage，token 会全程识别不到。
    if (isStream && cfg.apiType === 'openai_chat') {
      bodyObj.stream_options = { ...(bodyObj.stream_options as Record<string, unknown> ?? {}), include_usage: true }
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (cfg.apiType === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers.Authorization = 'Bearer ' + cfg.apiKey
    }

    const res = await fetch(cfg.endpoint, {
      method: 'POST', headers, body: JSON.stringify(bodyObj), signal: controller.signal,
    })

    if (!res.ok) {
      let txt = ''
      try { txt = await res.text() } catch { /* ignore */ }
      // 错误信息始终带上 HTTP 状态码前缀，即便服务端提供了更具体的 error.message，
      // 状态码本身也是排查问题（如限流 429 / 鉴权 401）的关键信息，不能被覆盖掉。
      let detail = ''
      try {
        const j = JSON.parse(txt)
        detail = j?.error?.message || ''
      } catch {
        if (txt) detail = txt.slice(0, 200)
      }
      rec.httpStatus = res.status
      rec.error = `HTTP ${res.status}` + (detail ? '：' + detail : '')
      rec.elapsed = Date.now() - start
      llmApplyResponseCapture(rec, cfg, res, txt)
      return rec
    }

    let tFirst: number | null = null
    if (isStream && res.body) {
      const ex = makeStreamExtractor(cfg.apiType)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let hadParseError = false
      for (;;) {
        const { done, value } = await reader.read()
        if (tFirst === null) tFirst = Date.now() - start
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try { ex.onData(JSON.parse(payload)) } catch { hadParseError = true }
        }
      }
      const r = ex.result()
      rec.status = 'ok'
      rec.httpStatus = res.status
      rec.tFirst = tFirst
      rec.elapsed = Date.now() - start
      rec.inputTokens = r.inTok
      rec.outputTokens = r.outTok
      rec.returnedModel = r.model
      // 请求本身成功但 token 没识别到时给出非阻断提示，避免用户对着空 "—" 无从排查
      if (r.inTok == null && r.outTok == null) {
        rec.tokenNote = hadParseError
          ? '流式响应中出现无法解析的数据块，usage 提取失败（响应可能是非标准 SSE / JSON 格式）'
          : '流式响应未包含 usage 数据（网关可能不支持 stream_options.include_usage，或返回了非标准格式）'
      }
      llmApplyResponseCapture(rec, cfg, res, r.text)
    } else {
      tFirst = Date.now() - start
      const txt = await res.text()
      let json: any = {}
      try {
        json = txt ? JSON.parse(txt) : {}
      } catch {
        rec.error = '响应解析失败（非 JSON）：' + txt.slice(0, 200)
        rec.httpStatus = res.status
        rec.elapsed = Date.now() - start
        llmApplyResponseCapture(rec, cfg, res, txt)
        return rec
      }
      const u = extractUsageNonStream(json)
      rec.status = 'ok'
      rec.httpStatus = res.status
      rec.tFirst = tFirst
      rec.elapsed = Date.now() - start
      rec.inputTokens = u.inTok
      rec.outputTokens = u.outTok
      rec.returnedModel = u.model
      llmApplyResponseCapture(rec, cfg, res, txt)
    }
  } catch (e: unknown) {
    rec.elapsed = Date.now() - start
    if (timedOut) {
      rec.error = `请求超时（> ${cfg.timeout} 秒）`
    } else if (e instanceof TypeError) {
      rec.error = '网络错误或可能被 CORS 拦截：' + (e.message || 'Failed to fetch') + '（若目标服务器未允许跨域，浏览器会拦截响应）'
    } else if ((e as { name?: string })?.name === 'AbortError') {
      rec.error = '已取消'
    } else {
      rec.error = (e as Error)?.message || String(e)
    }
  } finally {
    clearTimeout(timer)
  }
  return rec
}

// ── 统计 ──
function llmStatsOf(arr: number[]) {
  if (!arr.length) return null
  const sum = arr.reduce((a, b) => a + b, 0)
  const mean = sum / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length
  return { sum, mean, max: Math.max(...arr), min: Math.min(...arr), std: Math.sqrt(variance) }
}

function parseModelList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  text.split(/[\n,]/).map(s => s.trim()).filter(Boolean).forEach(m => {
    if (!seen.has(m)) { seen.add(m); out.push(m) }
  })
  return out
}

// ── 格式化 ──
function llmPad2(n: number) { return String(n).padStart(2, '0') }
function llmFmtTime(d: number) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${llmPad2(dt.getMonth() + 1)}-${llmPad2(dt.getDate())} ${llmPad2(dt.getHours())}:${llmPad2(dt.getMinutes())}:${llmPad2(dt.getSeconds())}`
}
function llmFmtDur(ms: number) {
  if (ms < 1000) return ms + ' ms'
  const s = ms / 1000
  if (s < 60) return s.toFixed(1) + ' s'
  return Math.floor(s / 60) + ' 分 ' + (s % 60).toFixed(0) + ' 秒'
}
function llmTsName(d: number) {
  const dt = new Date(d)
  return `${dt.getFullYear()}${llmPad2(dt.getMonth() + 1)}${llmPad2(dt.getDate())}_${llmPad2(dt.getHours())}${llmPad2(dt.getMinutes())}${llmPad2(dt.getSeconds())}`
}
function llmReportExportName(report: BatchReport, ext: string): string {
  const base = report.title?.trim()
    ? report.title.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    : 'report'
  return `${base}_${llmTsName(report.startTime)}.${ext}`
}
function llmDownload(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
function reportToCsv(report: BatchReport): string {
  const rows: (string | number)[][] = [['序号', '模型', '状态', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时(ms)', '错误信息', '响应体']]
  report.results.forEach(r => rows.push([
    r.seq, r.model, r.status === 'ok' ? '成功' : '失败',
    r.inputTokens ?? '-', r.outputTokens ?? '-',
    (r.inputTokens != null && r.outputTokens != null) ? r.inputTokens + r.outputTokens : '-',
    r.tFirst ?? '-', r.elapsed ?? '-', r.error || (r.tokenNote ? '⚠ ' + r.tokenNote : ''),
    r.responseBody ?? '',
  ]))
  return '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')
}

// ── 报告导出：图片 / PDF / HTML ──

function llmDownloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

function svgToPngDataUrl(liveSvg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = liveSvg.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height))
    const liveNodes = [liveSvg, ...Array.from(liveSvg.querySelectorAll<SVGElement>('*'))]
    const clone = liveSvg.cloneNode(true) as SVGSVGElement
    const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))]
    liveNodes.forEach((el, i) => {
      const cs = getComputedStyle(el)
      if (cs.fill && cs.fill !== 'none') cloneNodes[i].setAttribute('fill', cs.fill)
      if (cs.stroke && cs.stroke !== 'none') cloneNodes[i].setAttribute('stroke', cs.stroke)
    })
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(2, window.devicePixelRatio || 1)
      const canvas = document.createElement('canvas')
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

function withExpandedScrollAreas<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-export-scroll]'))
  const saved = els.map(el => ({ maxHeight: el.style.maxHeight, overflowY: el.style.overflowY, overflowX: el.style.overflowX }))
  els.forEach(el => { el.style.maxHeight = 'none'; el.style.overflowY = 'visible'; el.style.overflowX = 'visible' })
  return fn().finally(() => els.forEach((el, i) => { el.style.maxHeight = saved[i].maxHeight; el.style.overflowY = saved[i].overflowY; el.style.overflowX = saved[i].overflowX }))
}

async function captureReportCanvas(rootEl: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return withExpandedScrollAreas(rootEl, async () => {
    const chartRoots = Array.from(rootEl.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
    const restores: (() => void)[] = []
    for (const svg of chartRoots) {
      try {
        const dataUrl = await svgToPngDataUrl(svg)
        const img = document.createElement('img')
        img.src = dataUrl
        img.style.width = svg.getBoundingClientRect().width + 'px'
        img.style.height = svg.getBoundingClientRect().height + 'px'
        svg.replaceWith(img)
        restores.push(() => img.replaceWith(svg))
      } catch { /* 图表转换失败时保留原 SVG，html2canvas 兜底 */ }
    }
    try {
      return await html2canvas(rootEl, {
        backgroundColor: getComputedStyle(rootEl).getPropertyValue('--bg').trim() || '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
      })
    } finally {
      restores.forEach(r => r())
    }
  })
}

async function exportReportAsImage(rootEl: HTMLElement, filename: string) {
  try {
    const canvas = await captureReportCanvas(rootEl)
    canvas.toBlob(blob => { if (blob) llmDownloadBlob(filename, blob) }, 'image/png')
  } catch {
    window.alert('导出图片失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

async function exportReportAsPdf(rootEl: HTMLElement, filename: string) {
  try {
    const { jsPDF } = await import('jspdf')
    const canvas = await captureReportCanvas(rootEl)
    const pxToMm = (px: number) => px * 0.264583
    const w = pxToMm(canvas.width), h = pxToMm(canvas.height)
    const doc = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'mm', format: [w, h] })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    doc.save(filename)
  } catch {
    window.alert('导出 PDF 失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

async function exportReportAsHtml(rootEl: HTMLElement, filename: string) {
  try {
    await withExpandedScrollAreas(rootEl, async () => {
      const clone = rootEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-html2canvas-ignore]').forEach(el => el.remove())
      const liveSvgs = Array.from(rootEl.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
      const cloneSvgs = Array.from(clone.querySelectorAll<SVGSVGElement>('[data-chart-root] svg'))
      for (let i = 0; i < liveSvgs.length; i++) {
        try {
          const dataUrl = await svgToPngDataUrl(liveSvgs[i])
          const img = document.createElement('img')
          img.src = dataUrl
          cloneSvgs[i].replaceWith(img)
        } catch { /* 图表转换失败保留原样 */ }
      }
      const varNames = ['bg','s1','s2','border','borderHard','text','t2','t3','accent','accentFg','accentSub','accentSubHard','primary','primaryFg','sidebar','code','shadow','shadowMd','ok','okBg','err','errBg','warn','warnBg','jKey','jStr','jNum','jBool','jNull','inputBg','inputBorder']
      const cs = getComputedStyle(rootEl)
      const varsCss = ':root{' + varNames.map(n => `--${n}:${cs.getPropertyValue('--' + n).trim()}`).join(';') + '}'
      let appCss = ''
      for (const sheet of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sheet.cssRules)) appCss += rule.cssText + '\n' } catch { /* 跨域表跳过 */ }
      }
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><title>LLM 批量测试报告</title><style>${varsCss}\nbody{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}\n${appCss}</style></head><body>${clone.outerHTML}</body></html>`
      llmDownload(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch {
    window.alert('导出 HTML 失败，请改用 JSON/CSV 导出获取完整数据。')
  }
}

// ── 持久化：配置、加密后的 API Key、历史报告（最多 20 条）、提示词库、渠道列表 ──
const LLM_CFG_KEY = 'llmbatch-config'
const LLM_KEY_STORAGE_KEY = 'llmbatch-key'   // 旧字段：单一配置的加密 apiKey，已迁移到渠道，仅保留供一次性迁移读取
const LLM_HIST_KEY = 'llmbatch-history'
const LLM_HIST_MAX = 20
const LLM_PROMPTS_KEY = 'llmbatch-prompts'
const LLM_CHANNELS_KEY = 'llmbatch-channels'
const LLM_ACTIVE_CH_KEY = 'llmbatch-active-channel'

interface LlmBatchCfgStored {
  apiType?: ApiType
  baseUrl?: string               // 旧字段：单一配置的 baseUrl，已迁移到渠道，仅保留供一次性迁移读取，不再写入
  timeout?: string                // 旧字段：单一配置的超时，已迁移到渠道，仅保留供一次性迁移读取，不再写入
  models?: string
  n?: string
  c?: string
  body?: string                 // 旧字段：请求体已迁移到 llmbatch-prompts，这里仅保留供一次性迁移读取，不再写入
  promptId?: string             // 上次选中的提示词 id
  storeResponseBody?: boolean   // 是否存储响应体，默认 true
  testTitle?: string            // 测试标题
}
function loadLlmCfg(): LlmBatchCfgStored {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LLM_CFG_KEY)
    if (!raw) return {}
    const c = JSON.parse(raw)
    return c && typeof c === 'object' ? c : {}
  } catch { return {} }
}
function saveLlmCfg(cfg: LlmBatchCfgStored) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LLM_CFG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

function loadLlmHistory(): BatchReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LLM_HIST_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch { return [] }
}
// 存满 20 条后淘汰最早；QuotaExceededError 时继续删最早的重试，返回是否发生了淘汰
function saveLlmHistory(report: BatchReport): { list: BatchReport[]; dropped: boolean } {
  let list = [report, ...loadLlmHistory()]
  let dropped = false
  while (list.length > LLM_HIST_MAX) { list.pop(); dropped = true }
  while (typeof window !== 'undefined') {
    try { localStorage.setItem(LLM_HIST_KEY, JSON.stringify(list)); break }
    catch {
      if (list.length > 0) { list.pop(); dropped = true } else break
    }
  }
  return { list, dropped }
}
function deleteLlmHistoryItem(id: string): BatchReport[] {
  const list = loadLlmHistory().filter(r => r.id !== id)
  try { localStorage.setItem(LLM_HIST_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}
function renameLlmHistoryItem(id: string, title: string): BatchReport[] {
  const list = loadLlmHistory().map(r => r.id === id ? { ...r, title } : r)
  try { localStorage.setItem(LLM_HIST_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}
function clearLlmHistory() {
  try { localStorage.removeItem(LLM_HIST_KEY) } catch { /* ignore */ }
}

const DEFAULT_LLM_BODY = `{
  "model": "{{model}}",
  "max_tokens": 100,
  "messages": [{"role": "user", "content": "Say hello."}]
}`

// ── 提示词库持久化：结构/读写模式对齐上面的历史报告（loadLlmHistory/saveLlmHistory）──
function loadLlmPromptsRaw(): LlmPrompt[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LLM_PROMPTS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((p): p is LlmPrompt =>
      p && typeof p === 'object' && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.body === 'string')
  } catch { return [] }
}
function saveLlmPrompts(list: LlmPrompt[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LLM_PROMPTS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
function makeLlmPrompt(title: string, body: string): LlmPrompt {
  const now = Date.now()
  return { id: 'p' + now + '_' + Math.random().toString(36).slice(2, 7), title, body, createdAt: now, updatedAt: now }
}
// 首次加载时的迁移/兜底种子：老版本的请求体存在 llmbatch-config.body 里，迁移成一条提示词；
// 全新用户则用 DEFAULT_LLM_BODY 种一条示例，保证下拉框永远至少有一个选项可用。
// 必须是同步函数（用作 useState 懒初始化器），保证首帧渲染前 prompts 已就绪。
function loadOrMigrateLlmPrompts(): LlmPrompt[] {
  const existing = loadLlmPromptsRaw()
  if (existing.length > 0) return existing
  const legacyBody = loadLlmCfg().body
  const seed = legacyBody && legacyBody.trim()
    ? makeLlmPrompt('默认提示词', legacyBody)
    : makeLlmPrompt('示例提示词', DEFAULT_LLM_BODY)
  saveLlmPrompts([seed])
  return [seed]
}

// ── 持久化：渠道（连接目标）列表 + 当前激活渠道 ──
function loadLlmChannelsRaw(): LlmChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LLM_CHANNELS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((c): c is LlmChannel =>
      c && typeof c === 'object' && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.baseUrl === 'string')
  } catch { return [] }
}
function saveLlmChannels(list: LlmChannel[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LLM_CHANNELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
function loadLlmActiveChId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(LLM_ACTIVE_CH_KEY) } catch { return null }
}
// 首次加载时的迁移/兜底：老版本的单一配置（llmbatch-config.baseUrl/timeout + llmbatch-key 加密密文）
// 迁移成一条「默认渠道」；密文直接搬运，无需解密重加密（同一套 AES-GCM passphrase，见 shared/api-key-crypto.ts）。
// 必须是同步函数（用作 useState 懒初始化器），保证首帧渲染前渠道已就绪。
function loadOrMigrateLlmChannels(): { channels: LlmChannel[]; activeId: string | null } {
  const existing = loadLlmChannelsRaw()
  if (existing.length > 0) return { channels: existing, activeId: loadLlmActiveChId() }
  const legacyBaseUrl = loadLlmCfg().baseUrl
  if (!legacyBaseUrl || !legacyBaseUrl.trim()) return { channels: [], activeId: null }
  const legacyKeyEnc = (typeof window !== 'undefined' && localStorage.getItem(LLM_KEY_STORAGE_KEY)) || ''
  const ch: LlmChannel = {
    id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: '默认渠道',
    baseUrl: legacyBaseUrl.trim(),
    timeoutSec: loadLlmCfg().timeout ?? '120',
    apiKeyEnc: legacyKeyEnc,
    keyMask: legacyKeyEnc ? '（已加密，未展示）' : '',
  }
  saveLlmChannels([ch])
  try { localStorage.setItem(LLM_ACTIVE_CH_KEY, ch.id) } catch { /* ignore */ }
  return { channels: [ch], activeId: ch.id }
}

// 表格里的长文本单元格（模型名等）：单行截断 + 原生 title 提示，鼠标悬浮可见完整内容
function TruncatedCell({ text, maxWidth = 160, color }: { text: string; maxWidth?: number; color?: string }) {
  return (
    <span className="inline-block overflow-hidden align-bottom" style={{ maxWidth, color, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={text}>
      {text}
    </span>
  )
}

function Tooltip({ label, children, side = 'top' }: {
  label: string; children: React.ReactElement; side?: 'top' | 'bottom'
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos(side === 'top'
      ? { top: r.top - 8, left: r.left + r.width / 2 }
      : { top: r.bottom + 8, left: r.left + r.width / 2 })
  }
  return (
    <span ref={ref} className="inline-flex" onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children}
      {pos && (
        <span className="fixed z-[70] px-2 py-1 rounded-lg text-[11px] font-medium pointer-events-none tt-enter"
          style={{ top: pos.top, left: pos.left, transform: side === 'top' ? 'translate(-50%,-100%)' : 'translate(-50%,0)', background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </span>
  )
}

function IconBtn({ icon, tooltip, onClick, danger }: {
  icon: React.ReactNode; tooltip: string; onClick: () => void; danger?: boolean
}) {
  return (
    <Tooltip label={tooltip}>
      <button onClick={onClick} aria-label={tooltip}
        className="rounded-lg p-1.5 border-0 outline-none cursor-pointer transition-colors"
        style={{ background: 'transparent', color: danger ? 'var(--err)' : 'var(--t2)' }}
        onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'var(--errBg)' : 'var(--s2)' }}
        onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
        {icon}
      </button>
    </Tooltip>
  )
}

function InlineEditableTitle({ value, placeholder, onSave }: {
  value: string; placeholder: string; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span className="text-sm font-semibold cursor-text" style={{ color: 'var(--text)', borderBottom: '1px dashed transparent' }}
        onClick={() => { setDraft(value); setEditing(true) }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--t3)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent'}>
        {value.trim() || placeholder}
      </span>
    )
  }
  const commit = () => { setEditing(false); const t = draft.trim(); if (t !== value.trim()) onSave(t) }
  return (
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="text-sm font-semibold bg-transparent outline-none"
      style={{ color: 'var(--text)', border: 'none', borderBottom: '1px solid var(--accent)' }} />
  )
}

const LazyLlmTokenChart = React.lazy(() => import('./LlmCharts').then(module => ({ default: module.LlmTokenChart })))
const LazyLlmCompareChart = React.lazy(() => import('./LlmCharts').then(module => ({ default: module.LlmCompareChart })))

function LlmChartSkeleton() {
  return (
    <div className="surface-card llm-chart-loading rounded-2xl p-4" role="status" aria-label="正在载入图表" aria-busy="true">
      <div className="tool-loading-line rounded-full" />
      <div className="tool-loading-panel mt-4 rounded-xl" style={{ height: 220 }} />
    </div>
  )
}

function LlmTokenChart(props: { model: string; results: BatchResult[]; field: 'inputTokens' | 'outputTokens'; title: string }) {
  return <Suspense fallback={<LlmChartSkeleton />}><LazyLlmTokenChart {...props} /></Suspense>
}

function LlmCompareChart(props: { reportA: BatchReport; reportB: BatchReport; model: string; field: 'inputTokens' | 'outputTokens'; title: string }) {
  return <Suspense fallback={<LlmChartSkeleton />}><LazyLlmCompareChart {...props} /></Suspense>
}

// ── 报告渲染（当前报告 / 历史「查看」共用）──
function LlmExportMenu({ report, rootRef }: { report: BatchReport; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative" data-html2canvas-ignore="true">
      <Btn small variant="ghost" onClick={() => setOpen(o => !o)}>导出 ▾</Btn>
      {open && (
        <div className="floating-material absolute right-0 z-50 rounded-2xl overflow-hidden" style={{ top: 'calc(100% + 5px)', background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', padding: 4, minWidth: 140 }}>
          <button onClick={() => { llmDownload(llmReportExportName(report, 'json'), JSON.stringify(report, null, 2), 'application/json'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 JSON</button>
          <button onClick={() => { llmDownload(llmReportExportName(report, 'csv'), reportToCsv(report), 'text/csv;charset=utf-8'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 CSV</button>
          <button onClick={() => { rootRef.current && exportReportAsImage(rootRef.current, llmReportExportName(report, 'png')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出图片</button>
          <button onClick={() => { rootRef.current && exportReportAsPdf(rootRef.current, llmReportExportName(report, 'pdf')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 PDF</button>
          <button onClick={() => { rootRef.current && exportReportAsHtml(rootRef.current, llmReportExportName(report, 'html')); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs rounded-xl border-0 cursor-pointer outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s1)' }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>导出 HTML</button>
        </div>
      )}
    </div>
  )
}

function LlmBatchReportView({ report, apiKey, hideCharts }: { report: BatchReport; apiKey: string; hideCharts?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [viewingModel, setViewingModel] = useState<string | null>(null)
  const [viewingResult, setViewingResult] = useState<BatchResult | null>(null)
  const viewingBodyObj = useMemo(() => {
    if (viewingModel == null) return null
    try { return buildRequestBody(report.bodyText, viewingModel) } catch { return null }
  }, [viewingModel, report.bodyText])
  const consistency = useMemo(() => {
    const map: Record<string, { uniq: number[]; counts: Record<number, number>; consistent: boolean; value: number | null }> = {}
    for (const m of report.models) {
      const vals = report.results.filter(r => r.model === m && r.status === 'ok' && r.inputTokens != null).map(r => r.inputTokens as number)
      if (!vals.length) { map[m] = { uniq: [], counts: {}, consistent: false, value: null }; continue }
      const counts: Record<number, number> = {}
      vals.forEach(v => { counts[v] = (counts[v] || 0) + 1 })
      const uniq = Object.keys(counts).map(Number)
      map[m] = { uniq, counts, consistent: uniq.length === 1, value: uniq.length === 1 ? uniq[0] : null }
    }
    return map
  }, [report])

  const crossModelNumeric = report.models.map(m => consistency[m]?.value).filter((v): v is number => typeof v === 'number')
  const crossModelDiff = crossModelNumeric.length > 1 ? Math.max(...crossModelNumeric) - Math.min(...crossModelNumeric) : null

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {/* 概况 */}
      <div className="rounded-2xl flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5 text-sm" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
        <b style={{ color: 'var(--text)' }}>{report.title?.trim() || llmFmtTime(report.startTime)}</b>
        <span style={{ color: 'var(--t3)' }}>{LLM_API_LABELS[report.apiType]}</span>
        <span style={{ color: 'var(--t3)' }}>总耗时 <strong style={{ color: 'var(--text)' }}>{llmFmtDur(report.durationMs)}</strong></span>
        <span style={{ color: 'var(--t3)' }}>总请求 <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{report.total}</strong></span>
        <span>
          <span style={{ color: 'var(--t3)' }}>成功 </span><strong className="tabular-nums" style={{ color: 'var(--ok)' }}>{report.success}</strong>
          <span style={{ color: 'var(--t3)' }}> / 失败 </span><strong className="tabular-nums" style={{ color: report.fail ? 'var(--err)' : 'var(--t2)' }}>{report.fail}</strong>
        </span>
        {report.stopped && <Badge color="warn">⚠ 已手动停止</Badge>}
        <div className="ml-auto flex gap-2">
          <LlmExportMenu report={report} rootRef={rootRef} />
        </div>
        <div className="w-full text-[11px]" style={{ color: 'var(--t3)' }}>{llmFmtTime(report.startTime)} → {llmFmtTime(report.endTime)}</div>
      </div>

      {/* ① 输入 Token 一致性校验 —— 核心结论置顶 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>① 输入 Token 一致性校验</h3>
        <div className="flex flex-col gap-1.5 mb-3">
          {report.models.map(m => {
            const c = consistency[m]
            if (!c || c.uniq.length === 0) {
              return (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <Badge color="warn">⚠</Badge>
                  <span style={{ color: 'var(--t2)' }}>[{m}] 无可用的成功请求输入 Token 数据</span>
                </div>
              )
            }
            if (c.consistent) {
              return (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <Badge color="ok">✓</Badge>
                  <span style={{ color: 'var(--text)' }}>[{m}] 输入 Token 恒定，均为 <strong className="tabular-nums">{c.value}</strong></span>
                </div>
              )
            }
            const detail = Object.entries(c.counts).sort((a, b) => b[1] - a[1]).map(([v, cnt]) => `${v}（${cnt} 次）`).join('、')
            return (
              <div key={m} className="flex items-center gap-2 text-sm">
                <Badge color="err">✗</Badge>
                <span style={{ color: 'var(--text)' }}>[{m}] 输入 Token 不一致：{detail}</span>
              </div>
            )
          })}
        </div>
        <div className="rounded-2xl overflow-hidden mb-2.5" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--s1)' }}>
              <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                <th className="text-left px-4 py-2.5 font-semibold">模型</th>
                <th className="text-left px-4 py-2.5 font-semibold">输入 Token 值</th>
              </tr>
            </thead>
            <tbody>
              {report.models.map(m => {
                const c = consistency[m]
                return (
                  <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={m} color="var(--accent)" maxWidth={260} /></td>
                    <td className="px-4 py-2 tabular-nums">{c?.value ?? (c?.uniq.length ? '不一致' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {crossModelDiff != null && crossModelDiff > 0 && (
          <div className="rounded-xl px-4 py-2.5 text-sm mb-2.5" style={{ background: 'var(--warnBg)', color: 'var(--warn)' }}>
            ⚠ 不同模型对同一请求体的 Token 计算存在差异（可能是分词器不同所致），最大相差 {crossModelDiff} tokens
          </div>
        )}
        {!hideCharts && report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).length > 0 && (
          <div className="flex flex-col gap-4">
            {report.models.filter(m => consistency[m] && !consistency[m].consistent && consistency[m].uniq.length > 0).map(m => (
              <LlmTokenChart key={m} model={m} results={report.results} field="inputTokens" title="输入 Token 分布（不一致）" />
            ))}
          </div>
        )}
      </div>

      {!hideCharts && (
        <div>
          <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>② 输出 Token 波动</h3>
          <div className="flex flex-col gap-4">
            {report.models.map(m => (
              <LlmTokenChart key={m} model={m} results={report.results} field="outputTokens" title="输出 Token 分布" />
            ))}
          </div>
        </div>
      )}

      {/* ③ 各模型汇总统计 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>
          ③ 各模型汇总统计 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>（均值保留 1 位小数，仅统计成功请求）</span>
        </h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div data-export-scroll className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead style={{ background: 'var(--s1)' }}>
                <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                  {['模型', '总请求', '成功', '失败', '输入Token总量', '输入Token均值', '输出Token总量', '输出Token均值', '输出Token最大', '输出Token最小', '操作'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.models.map(m => {
                  const rs = report.results.filter(r => r.model === m)
                  const okIn = rs.filter(r => r.status === 'ok' && r.inputTokens != null).map(r => r.inputTokens as number)
                  const okOut = rs.filter(r => r.status === 'ok' && r.outputTokens != null).map(r => r.outputTokens as number)
                  const si = llmStatsOf(okIn)
                  const so = llmStatsOf(okOut)
                  return (
                    <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={m} color="var(--accent)" maxWidth={180} /></td>
                      <td className="px-4 py-2 tabular-nums">{rs.length}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--ok)' }}>{rs.filter(r => r.status === 'ok').length}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--err)' }}>{rs.filter(r => r.status === 'error').length}</td>
                      <td className="px-4 py-2 tabular-nums">{si ? si.sum : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{si ? si.mean.toFixed(1) : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.sum : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.mean.toFixed(1) : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.max : '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{so ? so.min : '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Btn small variant="ghost" onClick={() => setViewingModel(m)}>请求体 / cURL</Btn>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ④ 逐请求明细 */}
      <div>
        <h3 className="text-sm font-bold mb-2.5" style={{ color: 'var(--text)' }}>④ 逐请求明细</h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div data-export-scroll className="overflow-x-auto" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="w-full text-sm min-w-[920px]">
              <thead style={{ background: 'var(--s1)', position: 'sticky', top: 0 }}>
                <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                  {['序号', '模型', '状态', '返回模型', '输入Token', '输出Token', '总Token', '首字(ms)', '耗时', '错误信息', '响应'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.results.map(r => (
                  <tr key={r.seq} style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--s1)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">#{r.seq}</td>
                    <td className="px-4 py-2 font-mono text-xs"><TruncatedCell text={r.model} color="var(--accent)" maxWidth={140} /></td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.status === 'ok' ? <Badge color="ok">✓ 成功</Badge> : <Badge color="err">✗ 失败</Badge>}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: r.returnedModel && r.returnedModel !== r.model ? 'var(--err)' : 'var(--t2)' }}>
                      {r.returnedModel != null ? (
                        <span className="inline-flex items-center gap-1">
                          <TruncatedCell text={r.returnedModel} maxWidth={140} />
                          {r.returnedModel !== r.model && <span className="flex-shrink-0">≠</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{r.inputTokens ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.outputTokens ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{(r.inputTokens != null && r.outputTokens != null) ? r.inputTokens + r.outputTokens : '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.tFirst ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{r.elapsed != null ? (r.elapsed / 1000).toFixed(2) + 's' : '—'}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: r.error ? 'var(--err)' : 'var(--warn)', maxWidth: 280, wordBreak: 'break-all' }}>
                      {r.error ?? (r.tokenNote ? `⚠ ${r.tokenNote}` : '')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.responseBody != null
                        ? <Btn small variant="ghost" onClick={() => setViewingResult(r)}>响应</Btn>
                        : <span className="text-xs" style={{ color: 'var(--t3)' }}>未存储响应体</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 查看请求体 / 复制 cURL */}
      {viewingModel != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewingModel(null)}>
          <div className="floating-material rounded-2xl p-5 w-full flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', maxWidth: 640, maxHeight: '82vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <b className="text-sm" style={{ color: 'var(--text)' }}>[{viewingModel}] 请求体 / cURL</b>
              <Btn small variant="ghost" onClick={() => setViewingModel(null)}>✕</Btn>
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>请求体 JSON</Label>
                  {viewingBodyObj != null && <CopyBtn text={JSON.stringify(viewingBodyObj, null, 2)} />}
                </div>
                <div className="rounded-xl flex flex-col overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', height: '30vh' }}>
                  {viewingBodyObj != null
                    ? <ReadOnlyJsonTree text={JSON.stringify(viewingBodyObj, null, 2)} />
                    : <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--t3)' }}>（请求体解析失败）</div>}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>cURL 命令</Label>
                  {viewingBodyObj != null && <CopyBtn text={buildCurlCommand(report, viewingBodyObj, apiKey)} />}
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '30vh', wordBreak: 'break-all' }}>
                  {viewingBodyObj != null ? buildCurlCommand(report, viewingBodyObj, apiKey) : '（请求体解析失败）'}
                </pre>
                <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ cURL 命令含明文 API Key，注意妥善保管，不要粘贴到公开场合</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 查看响应头 / 响应正文 */}
      {viewingResult != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewingResult(null)}>
          <div className="floating-material rounded-2xl p-5 w-full flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadowMd)', maxWidth: 640, maxHeight: '82vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <b className="text-sm" style={{ color: 'var(--text)' }}>[#{viewingResult.seq} {viewingResult.model}] 响应</b>
              <Btn small variant="ghost" onClick={() => setViewingResult(null)}>✕</Btn>
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>响应头</Label>
                  <CopyBtn text={JSON.stringify(viewingResult.responseHeaders ?? {}, null, 2)} />
                </div>
                <pre className="rounded-xl p-3 text-xs overflow-auto" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', lineHeight: 1.7, maxHeight: '20vh' }}>
                  {JSON.stringify(viewingResult.responseHeaders ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>响应正文{viewingResult.responseBodyTruncated ? `（已截断，超过 ${LLM_RESPONSE_BODY_MAX} 字符）` : ''}</Label>
                  <CopyBtn text={viewingResult.responseBody ?? ''} />
                </div>
                <div className="rounded-xl flex flex-col overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)', height: '40vh' }}>
                  <ReadOnlyJsonTree text={viewingResult.responseBody ?? ''} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 可拖拽排序的单条提示词行。必须是模块级顶层函数组件（不能嵌套定义在 LlmPromptsPane 内部），
// 因为 useSortable 依赖跨渲染保持稳定的组件标识，嵌套定义会导致每次渲染都创建新的组件类型、拖拽状态丢失。
function SortablePromptRow({ prompt, active, onSelect, onDelete }: {
  prompt: LlmPrompt; active: boolean; onSelect: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prompt.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.6 : 1,
    background: active ? 'var(--accentSubHard)' : 'transparent',
  }
  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}
      className="flex items-center gap-2 rounded-xl px-2.5 py-2 cursor-pointer"
    >
      <div
        {...attributes} {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ color: 'var(--t3)', fontSize: 14, lineHeight: 1, padding: '2px 2px' }}
        onClick={e => e.stopPropagation()}
      >⠿</div>
      <div className="flex-1 min-w-0">
        <TruncatedCell text={prompt.title || '（未命名）'} maxWidth={160} color={active ? 'var(--accent)' : 'var(--text)'} />
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{llmFmtTime(prompt.updatedAt)}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="flex-shrink-0 rounded-lg border-0 outline-none cursor-pointer px-1.5 py-1 text-xs"
        style={{ background: 'transparent', color: 'var(--t3)' }}
      >✕</button>
    </div>
  )
}

function LlmPromptsPane({ prompts, onChange }: {
  prompts: LlmPrompt[]; onChange: (next: LlmPrompt[]) => void
}) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(prompts[0]?.id ?? null)
  const [expandedBody, setExpandedBody] = useState<string | null>(null)
  const editing = prompts.find(p => p.id === editingId) ?? null
  const editingBodyErr = editing ? validateLlmBodyJson(editing.body) : ''
  const filtered = prompts.filter(p => p.title.toLowerCase().includes(search.trim().toLowerCase()))
  const searching = search.trim() !== ''

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const updateEditing = (patch: Partial<Pick<LlmPrompt, 'title' | 'body'>>) => {
    if (!editingId) return
    onChange(prompts.map(p => p.id === editingId ? { ...p, ...patch, updatedAt: Date.now() } : p))
  }

  const formatEditingBody = () => {
    if (!editing) return
    const fmt = formatJsonWithPlaceholders(editing.body)
    if (fmt.ok) updateEditing({ body: fmt.text })
  }

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart, selectionEnd, value } = ta
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
    updateEditing({ body: next })
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = selectionStart + 2
    })
  }

  const createPrompt = () => {
    const np = makeLlmPrompt('未命名提示词', DEFAULT_LLM_BODY)
    onChange([...prompts, np])
    setEditingId(np.id)
    setSearch('')
  }

  const deletePrompt = (id: string) => {
    if (!window.confirm('确认删除该条提示词？此操作不可恢复。')) return
    const next = prompts.filter(p => p.id !== id)
    onChange(next)
    if (editingId === id) setEditingId(next[0]?.id ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const oldIdx = prompts.findIndex(p => p.id === e.active.id)
    const newIdx = prompts.findIndex(p => p.id === e.over!.id)
    if (oldIdx < 0 || newIdx < 0) return
    onChange(arrayMove(prompts, oldIdx, newIdx))
  }

  return (
    <div className="flex h-full">
      {/* 左：搜索 + 可拖拽排序的提示词列表 */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-2.5 p-4 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--t3)' }}>共 {prompts.length} 条</span>
          <Btn small variant="primary" onClick={createPrompt}>+ 新建提示词</Btn>
        </div>
        <CustomInput value={search} onChange={setSearch} placeholder="搜索提示词标题…" />
        {searching && <p className="text-[11px]" style={{ color: 'var(--t3)' }}>搜索时暂不支持拖拽排序，清空搜索后可拖拽</p>}
        {filtered.length === 0 ? (
          <p className="text-xs mt-2" style={{ color: 'var(--t3)' }}>{prompts.length === 0 ? '还没有提示词，点击上方新建' : '无匹配结果'}</p>
        ) : searching ? (
          <div className="flex flex-col gap-1">
            {filtered.map(p => (
              <SortablePromptRow key={p.id} prompt={p} active={p.id === editingId}
                onSelect={() => setEditingId(p.id)} onDelete={() => deletePrompt(p.id)} />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={prompts.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {prompts.map(p => (
                  <SortablePromptRow key={p.id} prompt={p} active={p.id === editingId}
                    onSelect={() => setEditingId(p.id)} onDelete={() => deletePrompt(p.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 右：编辑区，编辑即时保存 */}
      <div className="flex-1 flex flex-col p-4 min-h-0">
        {editing ? (
          <>
            <Label className="block mb-1.5">标题</Label>
            <CustomInput value={editing.title} onChange={v => updateEditing({ title: v })} className="mb-3" />
            <div className="flex items-center justify-between mb-1.5">
              <Label>请求体 JSON（占位符：{'{{model}}'} 或 {'${[model]}'}）</Label>
              <div className="flex items-center gap-1">
                <button onClick={formatEditingBody}
                  className="rounded-lg px-2 py-1 border-0 cursor-pointer outline-none text-xs"
                  style={{ background: 'transparent', color: 'var(--t2)' }}
                  onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                  onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)' }}>格式化</button>
                {editing && <button onClick={() => setExpandedBody(editing.body)}
                  className="rounded-lg p-1 border-0 cursor-pointer outline-none flex items-center gap-1 text-xs"
                  style={{ background: 'transparent', color: 'var(--t2)' }}
                  onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                  onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)' }}><IconExpand /> 展开查看</button>}
              </div>
            </div>
            <CustomTextarea value={editing.body} onChange={v => updateEditing({ body: v })} onKeyDown={handleBodyKeyDown} mono stretch className="flex-1"
              style={{ minHeight: 0, ...(editingBodyErr ? { border: '1px solid var(--err)', boxShadow: '0 0 0 3px var(--errBg)' } : {}) }} />
            {editingBodyErr && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{editingBodyErr}</p>}
            <div className="flex gap-2 mt-3 flex-shrink-0">
              <Btn small variant="danger" onClick={() => deletePrompt(editing.id)}>删除该提示词</Btn>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--t3)' }}>
            <p className="text-sm">选择或新建一个提示词开始编辑</p>
          </div>
        )}
      </div>
      {expandedBody != null && editing && (
        <LlmPromptEditorModal
          title="编辑请求体 JSON"
          initial={expandedBody}
          onSave={body => { updateEditing({ body }); setExpandedBody(null) }}
          onClose={() => setExpandedBody(null)}
        />
      )}
    </div>
  )
}

function LlmBatchTool() {
  // ── 配置（持久化）──
  const [apiType, setApiType] = useState<ApiType>(() => loadLlmCfg().apiType ?? 'anthropic')
  // 渠道（连接目标）：baseUrl/apiKey/超时都收在渠道对象里，可保存多个、选一个当前使用
  const [channels, setChannels] = useState<LlmChannel[]>(() => loadOrMigrateLlmChannels().channels)
  const [activeChId, setActiveChId] = useState<string | null>(() => loadOrMigrateLlmChannels().activeId)
  const [chForm, setChForm] = useState({ name: '', baseUrl: '', timeoutSec: '120', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [chNotice, setChNotice] = useState('')
  const [modelListText, setModelListText] = useState(() => loadLlmCfg().models ?? 'claude-3-5-sonnet-20241022')
  const [nReq, setNReq] = useState(() => loadLlmCfg().n ?? '5')
  const [concurrency, setConcurrency] = useState(() => loadLlmCfg().c ?? '3')
  // 提示词库：请求体来源。prompts 是单一数据源，selectedPromptId 是本次批量测试实际使用的那条。
  const [prompts, setPrompts] = useState<LlmPrompt[]>(() => loadOrMigrateLlmPrompts())
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(() => loadLlmCfg().promptId ?? null)
  const [storeResponseBody, setStoreResponseBody] = useState(() => loadLlmCfg().storeResponseBody ?? true)
  const [testTitle, setTestTitle] = useState(() => loadLlmCfg().testTitle ?? '')
  const [reuseNotice, setReuseNotice] = useState('')

  // 选中项失效（首次加载时持久化的 id 已不存在 / 当前选中的提示词被删除 / prompts 变空）时自动回退到第一条
  useEffect(() => {
    if (selectedPromptId != null && prompts.some(p => p.id === selectedPromptId)) return
    setSelectedPromptId(prompts[0]?.id ?? null)
  }, [prompts, selectedPromptId])

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId) ?? null
  const promptBodyErr = selectedPrompt ? validateLlmBodyJson(selectedPrompt.body) : ''
  const activeChannel = channels.find(c => c.id === activeChId) ?? null

  // 根据当前 API 类型自动识别提示词请求体协议并按需转换：级联在 promptBodyErr 之后
  // （语法都不对就不跑识别，交给 promptBodyErr 展示），只在运行时生效，绝不写回提示词库。
  const convertedBody = useMemo(() => {
    if (!selectedPrompt) return null
    if (promptBodyErr) return null
    return convertPromptBodyForApiType(selectedPrompt.body, apiType)
  }, [selectedPrompt?.body, apiType, promptBodyErr])

  useEffect(() => {
    saveLlmCfg({ apiType, models: modelListText, n: nReq, c: concurrency, promptId: selectedPromptId ?? undefined, storeResponseBody, testTitle })
  }, [apiType, modelListText, nReq, concurrency, selectedPromptId, storeResponseBody])

  useEffect(() => { saveLlmPrompts(prompts) }, [prompts])

  useEffect(() => { saveLlmChannels(channels) }, [channels])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (activeChId) localStorage.setItem(LLM_ACTIVE_CH_KEY, activeChId)
      else localStorage.removeItem(LLM_ACTIVE_CH_KEY)
    } catch { /* ignore */ }
  }, [activeChId])

  // 当前激活渠道的明文 apiKey：只用于「测试报告」里生成可复制的 curl 命令展示，实际发请求时在 runBatch 里现场解密
  const [activeApiKey, setActiveApiKey] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!activeChannel || !activeChannel.apiKeyEnc) { setActiveApiKey(''); return }
    decryptLlmApiKey(activeChannel.apiKeyEnc).then(v => { if (!cancelled) setActiveApiKey(v) })
    return () => { cancelled = true }
  }, [activeChannel?.id, activeChannel?.apiKeyEnc])

  const chToast = (m: string) => { setChNotice(m); setTimeout(() => setChNotice(''), 2200) }

  const saveChannel = async () => {
    const name = chForm.name.trim()
    const base = chForm.baseUrl.trim().replace(/\/+$/, '')
    const timeoutSecVal = chForm.timeoutSec.trim() || '120'
    const key = chForm.apiKey.trim()
    if (!name || !base) { chToast('请填写渠道名称与 baseUrl'); return }
    let apiKeyEnc = ''
    let keyMask = ''
    if (key) {
      const enc = await encryptLlmApiKey(key)
      if (!enc) { chToast('加密失败，请重试'); return }
      apiKeyEnc = enc
      keyMask = key.slice(0, 8) + '••••' + key.slice(-4)
    }
    if (editingChId) {
      const target = channels.find(c => c.id === editingChId)
      if (!target) return
      const nc: LlmChannel = { ...target, name, baseUrl: base, timeoutSec: timeoutSecVal }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(c => c.id === editingChId ? nc : c))
    } else {
      if (!apiKeyEnc) { chToast('请填写 apiKey'); return }
      const nc: LlmChannel = { id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, baseUrl: base, timeoutSec: timeoutSecVal, apiKeyEnc, keyMask }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm({ name: '', baseUrl: '', timeoutSec: '120', apiKey: '' })
    setEditingChId(null)
    chToast('已保存')
  }

  const editChannel = (c: LlmChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, timeoutSec: c.timeoutSec, apiKey: '' })
    setEditingChId(c.id)
  }

  const delChannel = (id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(channels.filter(c => c.id !== id))
    if (activeChId === id) setActiveChId(null)
  }

  // ── 运行状态 ──
  const [pane, setPane] = useState<'live' | 'report' | 'history' | 'prompts' | 'compare' | 'channels'>('live')
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [startErr, setStartErr] = useState('')
  const [results, setResults] = useState<BatchResult[]>([])
  const [liveLog, setLiveLog] = useState<BatchResult[]>([])
  const [liveModels, setLiveModels] = useState<string[]>([])
  const [liveN, setLiveN] = useState(0)
  const stopRef = useRef(false)

  // ── 报告 / 历史 ──
  const [report, setReport] = useState<BatchReport | null>(null)
  const [history, setHistory] = useState<BatchReport[]>(() => loadLlmHistory())
  const [lastRunReportId, setLastRunReportId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [histNotice, setHistNotice] = useState('')
  const [jsonViewerBody, setJsonViewerBody] = useState<{ body: string; model: string } | null>(null)

  const toggleCompare = (id: string) => setCompareIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 2 ? prev : [...prev, id]))

  const viewHistoryReport = (rep: BatchReport) => {
    setReport(rep)
    setLastRunReportId(rep.id)
    setPane('report')
  }

  const runBatch = async () => {
    setStartErr('')
    const errs: string[] = []
    let finalBodyText: string | null = null
    if (!selectedPrompt) {
      errs.push('请先选择一个提示词作为请求体来源。')
    } else if (promptBodyErr) {
      errs.push('提示词请求体不是合法 JSON：' + promptBodyErr)
    } else if (!convertedBody || !convertedBody.ok) {
      errs.push(convertedBody ? convertedBody.error : '请求体协议识别失败，请检查请求体内容。')
    } else {
      finalBodyText = convertedBody.body
    }
    const models = parseModelList(modelListText)
    if (models.length === 0) errs.push('模型列表不能为空。')
    const ch = activeChannel
    if (!ch) errs.push('请先在「渠道管理」添加并选择一个渠道。')
    const N = Math.max(1, parseInt(nReq, 10) || 1)
    const C = Math.max(1, parseInt(concurrency, 10) || 1)
    const timeoutNum = ch ? Math.max(1, parseFloat(ch.timeoutSec) || 120) : 120
    if (errs.length) { setStartErr(errs.join('\n')); return }

    const apiKeyPlain = await decryptLlmApiKey(ch!.apiKeyEnc)
    if (!apiKeyPlain) { setStartErr('渠道 API Key 解密失败，请重新编辑渠道并保存。'); return }

    const cfg: LlmBatchCfg = { apiType, endpoint: llmEndpointOf(apiType, ch!.baseUrl), apiKey: apiKeyPlain, timeout: timeoutNum, bodyText: finalBodyText!, storeResponseBody }

    const queue: BatchTask[] = []
    let seqCounter = 0
    for (const m of models) {
      for (let i = 1; i <= N; i++) queue.push({ seq: ++seqCounter, model: m, localIdx: i })
    }
    const initial: BatchResult[] = queue.map(t => ({
      seq: t.seq, model: t.model, localIdx: t.localIdx, status: 'pending',
      httpStatus: null, tFirst: null, elapsed: null, returnedModel: null,
      inputTokens: null, outputTokens: null, error: null,
    }))

    stopRef.current = false
    setStopping(false)
    setRunning(true)
    setPane('live')
    setReport(null)
    setResults(initial)
    setLiveLog([])
    setLiveModels(models)
    setLiveN(N)

    // 用一个普通局部数组同步维护最新结果，作为报告数据的唯一真源；
    // setResults 只负责触发渲染 —— React 的 setState 是异步/批处理的，
    // Promise.all(workers) resolve 后不能保证最后一次 setResults 的 updater 已经跑完，
    // 若报告直接从 state（或镜像 state 的 ref）读取，最后完成的那条请求可能还来不及写入。
    const resultsArr = initial
    const startTime = Date.now()
    let cursor = 0
    const worker = async () => {
      while (!stopRef.current && cursor < queue.length) {
        const task = queue[cursor++]
        const idx = task.seq - 1
        resultsArr[idx] = { ...resultsArr[idx], status: 'running' }
        setResults([...resultsArr])
        const rec = await doLlmRequest(cfg, task)
        resultsArr[idx] = rec
        setResults([...resultsArr])
        setLiveLog(prev => [rec, ...prev])
      }
    }
    const workerCount = Math.min(C, queue.length)
    await Promise.all(Array.from({ length: workerCount }, worker))

    const endTime = Date.now()
    const wasStopped = stopRef.current
    stopRef.current = false
    setStopping(false)
    setRunning(false)

    const finalResults = [...resultsArr].sort((a, b) => a.seq - b.seq)
    const rep: BatchReport = {
      id: 'r' + endTime + '_' + Math.random().toString(36).slice(2, 7),
      title: testTitle.trim() || undefined,
      startTime, endTime, durationMs: endTime - startTime,
      apiType, endpoint: cfg.endpoint, baseUrl: ch!.baseUrl, timeout: timeoutNum, channelName: ch!.name,
      bodyText: cfg.bodyText, promptId: selectedPromptId ?? null, models, n: N, c: C, stopped: wasStopped,
      total: finalResults.length,
      success: finalResults.filter(r => r.status === 'ok').length,
      fail: finalResults.filter(r => r.status === 'error').length,
      results: finalResults,
    }
    const { list, dropped } = saveLlmHistory(rep)
    setHistory(list)
    setHistNotice(dropped ? '存储空间有限，已自动删除最早的历史报告为新报告腾出空间。' : '')
    setReport(rep)
    setLastRunReportId(rep.id)
    setPane('report')
  }

  const stopBatch = () => {
    stopRef.current = true
    setStopping(true)
  }

  // 历史「复用」：把某条历史报告的配置回填。API Key 从不回填（历史本来就不存）。
  // baseUrl/超时已归入渠道，不再是可直接写回的扁平字段：优先匹配一个 baseUrl 相同的已存渠道并切过去；
  // 匹配不到就把 baseUrl/超时带入「渠道管理」的新增表单，跳转过去待用户补充 apiKey 后保存。
  const reuseHistoryReport = (rep: BatchReport) => {
    setApiType(rep.apiType)
    const derivedBase = rep.baseUrl ?? llmBaseUrlFromEndpoint(rep.apiType, rep.endpoint)
    const matched = derivedBase ? channels.find(c => c.baseUrl === derivedBase) : null
    setModelListText(rep.models.join('\n'))
    setNReq(String(rep.n))
    setConcurrency(String(rep.c))
    setTestTitle(rep.title ?? '')

    let targetId = rep.promptId && prompts.some(p => p.id === rep.promptId) ? rep.promptId : null
    if (!targetId) {
      const np = makeLlmPrompt(`复用于 ${llmFmtTime(rep.startTime)}`, rep.bodyText)
      setPrompts(prev => [...prev, np])
      targetId = np.id
    }
    setSelectedPromptId(targetId)

    // 让「实时」面板真正回到空状态，而不是残留上一次运行的日志/报告
    setResults([])
    setLiveLog([])
    setReport(null)

    if (matched) {
      setActiveChId(matched.id)
      setPane('live')
      setReuseNotice(`已从「${llmFmtTime(rep.startTime)}」的历史报告回填配置，并切换到渠道「${matched.name}」。`)
    } else if (derivedBase) {
      setChForm({ name: '', baseUrl: derivedBase, timeoutSec: rep.timeout != null ? String(rep.timeout) : '120', apiKey: '' })
      setEditingChId(null)
      setPane('channels')
      setReuseNotice(`已从「${llmFmtTime(rep.startTime)}」的历史报告带入 Base URL 到「渠道管理」新增表单，请补充 API Key 后保存。`)
    } else {
      setPane('live')
      setReuseNotice(`已从「${llmFmtTime(rep.startTime)}」的历史报告回填配置到左侧面板。`)
    }
    setTimeout(() => setReuseNotice(''), 4000)
  }

  const completed = results.filter(r => r.status === 'ok' || r.status === 'error').length
  const total = results.length
  const pct = total ? Math.round(completed / total * 100) : 0
  const okCount = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length
  const statusCodes = Array.from(new Set(results.map(r => r.httpStatus).filter((v): v is number => v != null))).sort((a, b) => a - b)

  return (
    <div className="flex flex-col h-full">
      <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle>LLM 批量测试 & 验真</SectionTitle>
        <div className="ml-auto flex gap-2">
          {running
            ? <Btn variant="danger" onClick={stopBatch} disabled={stopping}>{stopping ? '正在停止…' : '⏹ 停止'}</Btn>
            : <Btn variant="primary" onClick={runBatch} disabled={!activeChannel || prompts.length === 0 || (convertedBody !== null && !convertedBody.ok)}>▶ 开始批量请求</Btn>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧配置栏 */}
        <div className="w-72 flex-shrink-0 flex flex-col p-4 gap-3.5 overflow-y-auto" style={{ borderRight: '1px solid var(--border)', background: 'var(--s1)' }}>
          <div>
            <Label className="block mb-1.5">测试标题（可选）</Label>
            <CustomInput value={testTitle} onChange={setTestTitle} placeholder="例如：claude-3.5 vs haiku 计费核查" />
          </div>
          <div>
            <Label className="block mb-1.5">API 类型</Label>
            <CustomSelect value={apiType} onChange={v => setApiType(v as ApiType)} options={[
              { value: 'anthropic', label: 'Anthropic Messages API' },
              { value: 'openai_chat', label: 'OpenAI Chat Completions API' },
              { value: 'openai_responses', label: 'OpenAI Responses API' },
            ]} />
          </div>
          <div>
            <Label className="block mb-1.5">使用渠道</Label>
            <CustomSelect value={activeChId ?? ''} onChange={v => setActiveChId(v)}
              options={channels.map(c => ({ value: c.id, label: c.name }))} />
            {channels.length === 0 && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请先到「渠道管理」添加渠道。</p>}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">模型列表（每行一个，或逗号分隔）</Label>
            <CustomTextarea value={modelListText} onChange={setModelListText} mono rows={3}
              placeholder={'claude-3-5-sonnet-20241022\nclaude-3-haiku-20240307'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="block mb-1.5">每模型次数 N</Label><CustomInput value={nReq} onChange={setNReq} type="number" placeholder="5" /></div>
            <div><Label className="block mb-1.5">全局并发数 C</Label><CustomInput value={concurrency} onChange={setConcurrency} type="number" placeholder="3" /></div>
          </div>
          <div>
            <Toggle value={storeResponseBody} onChange={setStoreResponseBody} label="存储响应体" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Label className="block mb-1.5">提示词（请求体来源）</Label>
            {prompts.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--err)' }}>⚠ 还没有任何提示词，请切换到右侧「提示词」标签页新建一条。</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect value={selectedPromptId} onChange={setSelectedPromptId}
                      options={prompts.map(p => ({ value: p.id, label: p.title || '（未命名）' }))}
                      placeholder="选择一个提示词…" />
                  </div>
                  {selectedPrompt && (
                    <button onClick={() => {
                      const firstModel = parseModelList(modelListText)[0] || ''
                      const body = firstModel && bodyHasModelPlaceholder(selectedPrompt.body)
                        ? fillModelPlaceholder(selectedPrompt.body, JSON.stringify(firstModel))
                        : selectedPrompt.body
                      setJsonViewerBody({ body, model: firstModel })
                    }}
                      className="rounded-lg p-1.5 border-0 outline-none cursor-pointer flex-shrink-0"
                      style={{ background: 'transparent', color: 'var(--t2)' }}
                      onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--accentSub)' }}
                      onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                      title="查看完整请求体"><IconExpand /></button>
                  )}
                </div>
                {!selectedPromptId && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请选择一个提示词作为请求体来源。</p>}
                {promptBodyErr && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{promptBodyErr}</p>}
                {convertedBody && !convertedBody.ok && <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{convertedBody.error}</p>}
              </>
            )}
          </div>
          {startErr && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{startErr}</p>}
        </div>

        {/* 右侧结果区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <SegmentedControl value={pane === 'compare' ? 'history' : pane} onChange={v => setPane(v as 'live' | 'report' | 'history' | 'prompts' | 'channels')} options={[
              { value: 'live', label: '实时' },
              { value: 'report', label: '报告' },
              { value: 'history', label: `历史 (${history.length})` },
              { value: 'prompts', label: `提示词 (${prompts.length})` },
              { value: 'channels', label: `渠道管理 (${channels.length})` },
            ]} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {pane === 'live' && (
              <div className="flex flex-col">
                {reuseNotice && <p className="px-6 pt-3 text-xs" style={{ color: 'var(--accent)' }}>{reuseNotice}</p>}
                {total > 0 && (
                  <div className="px-6 py-3 flex flex-col gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--t2)' }}>总进度</span>
                      <span className="tabular-nums" style={{ color: 'var(--t2)' }}>{completed} / {total}（{pct}%）</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: pct + '%' }} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs pt-0.5">
                      <span style={{ color: 'var(--t2)' }}>成功 <strong className="tabular-nums" style={{ color: 'var(--ok)' }}>{okCount}</strong></span>
                      <span style={{ color: 'var(--t2)' }}>失败 <strong className="tabular-nums" style={{ color: errCount ? 'var(--err)' : 'var(--t2)' }}>{errCount}</strong></span>
                      {statusCodes.length > 0 && (
                        <span style={{ color: 'var(--t2)' }}>状态码 <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{statusCodes.join(', ')}</strong></span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2.5 pt-1">
                      {liveModels.map(m => {
                        const rs = results.filter(r => r.model === m)
                        const doneM = rs.filter(r => r.status === 'ok' || r.status === 'error').length
                        const okM = rs.filter(r => r.status === 'ok').length
                        const failM = rs.filter(r => r.status === 'error').length
                        const pctM = liveN ? Math.round(doneM / liveN * 100) : 0
                        return (
                          <div key={m}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono" style={{ color: 'var(--text)' }}>{m}</span>
                              <span style={{ color: 'var(--t3)' }}>
                                <span style={{ color: 'var(--ok)' }}>成功 {okM}</span> / <span style={{ color: 'var(--err)' }}>失败 {failM}</span> · {doneM}/{liveN}
                              </span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
                              <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: pctM + '%' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="p-4 flex flex-col gap-2">
                  {liveLog.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                      <div className="text-4xl mb-3 opacity-60">⊞</div>
                      <p className="text-sm">配置参数后点击「开始批量请求」</p>
                    </div>
                  ) : liveLog.map(r => (
                    <div key={r.seq} className="surface-card flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3.5 py-2.5 text-xs"
                      style={{ background: 'var(--bg)', border: `1px solid ${r.status === 'error' ? 'var(--err)' : 'var(--border)'}`, boxShadow: 'var(--shadow)' }}>
                      <span className="font-bold" style={{ color: 'var(--t2)' }}>#{r.seq}</span>
                      <span className="font-mono" style={{ color: 'var(--accent)' }}>{r.model}</span>
                      <Badge color={r.status === 'ok' ? 'ok' : 'err'}>{r.status === 'ok' ? '✓ 成功' : '✗ 失败'}</Badge>
                      {r.httpStatus != null && <Badge>{r.httpStatus}</Badge>}
                      {r.returnedModel != null && (
                        <Badge color={r.returnedModel === r.model ? 'ok' : 'err'}>
                          返回模型 {r.returnedModel}{r.returnedModel !== r.model ? ' ≠' : ''}
                        </Badge>
                      )}
                      {r.tFirst != null && <span style={{ color: 'var(--t2)' }}>首字 {r.tFirst}ms</span>}
                      {r.elapsed != null && <span style={{ color: 'var(--t3)' }}>总 {(r.elapsed / 1000).toFixed(2)}s</span>}
                      {r.inputTokens != null && <span style={{ color: 'var(--t3)' }}>in: {r.inputTokens}</span>}
                      {r.outputTokens != null && <span style={{ color: 'var(--t3)' }}>out: {r.outputTokens}</span>}
                      {r.error && <span style={{ color: 'var(--err)' }}>{r.error.slice(0, 160)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pane === 'report' && (
              <div className="p-5">
                {report ? (
                  <>
                    {history.length > 0 && report.id !== lastRunReportId && (
                      <div className="mb-3 flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
                        正在查看历史报告{report.title?.trim() ? `「${report.title.trim()}」` : ''}。
                        {lastRunReportId && <button className="underline cursor-pointer border-0 bg-transparent" style={{ color: 'var(--accent)' }} onClick={() => setReport(history.find(h => h.id === lastRunReportId) ?? null)}>返回最近一次运行结果</button>}
                      </div>
                    )}
                    <LlmBatchReportView report={report} apiKey={activeApiKey} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">还没有已完成的测试报告。</p>
                  </div>
                )}
              </div>
            )}

            {pane === 'compare' && compareIds.length === 2 && (
              <div className="p-5 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <Btn small variant="ghost" onClick={() => setPane('history')}>← 返回历史列表</Btn>
                  <b style={{ color: 'var(--text)' }}>历史报告对比</b>
                </div>
                {(() => {
                  const a = history.find(h => h.id === compareIds[0])
                  const b = history.find(h => h.id === compareIds[1])
                  if (!a || !b) return null
                  const metrics: { key: string; label: string; get: (r: BatchReport) => number; fmt: (v: number) => string; better?: 'higher' | 'lower' }[] = [
                    { key: 'total', label: '总请求数', get: r => r.total, fmt: v => String(v) },
                    { key: 'successRate', label: '成功率', get: r => r.total ? (r.success / r.total * 100) : 0, fmt: v => v.toFixed(1) + '%', better: 'higher' },
                    { key: 'fail', label: '失败数', get: r => r.fail, fmt: v => String(v), better: 'lower' },
                    { key: 'duration', label: '总耗时', get: r => r.durationMs, fmt: v => llmFmtDur(v), better: 'lower' },
                    { key: 'avgElapsed', label: '平均单请求耗时', get: r => { const v = r.results.map(x => x.elapsed).filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => (v / 1000).toFixed(2) + 's', better: 'lower' },
                    { key: 'avgInput', label: '输入 Token 均值', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.inputTokens != null).map(x => x.inputTokens as number); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => v.toFixed(0) },
                    { key: 'avgOutput', label: '输出 Token 均值', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.outputTokens != null).map(x => x.outputTokens as number); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 }, fmt: v => v.toFixed(0) },
                    { key: 'outputRange', label: '输出 Token 波动', get: r => { const v = r.results.filter(x => x.status === 'ok' && x.outputTokens != null).map(x => x.outputTokens as number); return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0 }, fmt: v => String(v), better: 'lower' },
                  ]
                  return (
                    <>
                      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        <table className="w-full text-sm">
                          <thead style={{ background: 'var(--s1)' }}>
                            <tr className="text-xs" style={{ color: 'var(--t2)' }}>
                              <th className="text-left px-4 py-2.5 font-semibold">指标</th>
                              <th className="text-left px-4 py-2.5 font-semibold">{a.title?.trim() || llmFmtTime(a.startTime)}</th>
                              <th className="text-left px-4 py-2.5 font-semibold">{b.title?.trim() || llmFmtTime(b.startTime)}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.map(m => {
                              const va = m.get(a), vb = m.get(b)
                              let aBetter = false, bBetter = false
                              if (m.better && va !== vb) {
                                if (m.better === 'higher') { aBetter = va > vb; bBetter = vb > va }
                                else { aBetter = va < vb; bBetter = vb < va }
                              }
                              return (
                                <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{m.label}</td>
                                  <td className="px-4 py-2 tabular-nums text-xs" style={{ color: aBetter ? 'var(--ok)' : 'var(--text)', fontWeight: aBetter ? 700 : 400 }}>{m.fmt(va)}</td>
                                  <td className="px-4 py-2 tabular-nums text-xs" style={{ color: bBetter ? 'var(--ok)' : 'var(--text)', fontWeight: bBetter ? 700 : 400 }}>{m.fmt(vb)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 组合图表（对比双方的输入/输出放到同一图表） */}
                      {(() => {
                        const modelsInBoth = a.models.filter(m => b.models.includes(m))
                        if (modelsInBoth.length === 0) return null
                        return (
                          <div className="flex flex-col gap-5">
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Token 对比图表</h3>
                            {modelsInBoth.map(m => (
                              <div key={m} className="flex flex-col gap-4">
                                <LlmCompareChart reportA={a} reportB={b} model={m} field="inputTokens" title="输入 Token 对比" />
                                <LlmCompareChart reportA={a} reportB={b} model={m} field="outputTokens" title="输出 Token 对比" />
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* 个体报告摘要（不含图表） */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="min-w-0"><LlmBatchReportView report={a} apiKey={activeApiKey} hideCharts /></div>
                        <div className="min-w-0"><LlmBatchReportView report={b} apiKey={activeApiKey} hideCharts /></div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            {pane === 'history' && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--t3)' }}>已存 {history.length} / {LLM_HIST_MAX} 条历史报告</span>
                  {history.length > 0 && (
                    <Btn small variant="danger" onClick={() => {
                      if (window.confirm('确认清空全部历史报告？此操作不可恢复。')) {
                        clearLlmHistory(); setHistory([]); setCompareIds([])
                      }
                    }}>清空全部</Btn>
                  )}
                </div>
                {histNotice && <p className="text-xs" style={{ color: 'var(--warn)' }}>⚠ {histNotice}</p>}
                {compareIds.length === 2 && (
                  <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: 'var(--accentSub)' }}>
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>已选择 2 条历史报告</span>
                    <div className="flex gap-2">
                      <Btn small variant="ghost" onClick={() => setCompareIds([])}>取消选择</Btn>
                      <Btn small variant="accent" onClick={() => setPane('compare')}>对比所选 →</Btn>
                    </div>
                  </div>
                )}
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--t3)' }}>
                    <p className="text-sm">暂无历史报告。</p>
                  </div>
                ) : history.map(rep => (
                  <div key={rep.id} className="surface-card rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input type="checkbox" checked={compareIds.includes(rep.id)}
                          disabled={!compareIds.includes(rep.id) && compareIds.length >= 2}
                          onChange={() => toggleCompare(rep.id)}
                          style={{ accentColor: 'var(--accent)' }} className="w-3.5 h-3.5" />
                        <div className="min-w-0">
                          <InlineEditableTitle
                            value={rep.title ?? ''}
                            placeholder={llmFmtTime(rep.startTime)}
                            onSave={title => { setHistory(renameLlmHistoryItem(rep.id, title)) }}
                          />
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                            {llmFmtTime(rep.startTime)} · 模型 {rep.models.join(', ')} · 成功 <span style={{ color: 'var(--ok)' }}>{rep.success}</span>/{rep.total} · {llmFmtDur(rep.durationMs)}
                            {rep.stopped && <span style={{ color: 'var(--warn)' }}> · 已手动停止</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <IconBtn icon={<IconEye />} tooltip="查看报告" onClick={() => viewHistoryReport(rep)} />
                        <IconBtn icon={<IconRepeat />} tooltip="复用此配置" onClick={() => reuseHistoryReport(rep)} />
                        <IconBtn icon={<IconTrash />} tooltip="删除该历史报告" danger onClick={() => {
                          if (window.confirm('确认删除该条历史报告？此操作不可恢复。')) {
                            const list = deleteLlmHistoryItem(rep.id)
                            setHistory(list)
                            setCompareIds(ids => ids.filter(id => id !== rep.id))
                          }
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pane === 'prompts' && (
              <div className="h-full">
                <LlmPromptsPane prompts={prompts} onChange={setPrompts} />
              </div>
            )}

            {pane === 'channels' && (
              <div className="p-5 flex flex-col gap-4">
                {reuseNotice && <p className="text-xs" style={{ color: 'var(--accent)' }}>{reuseNotice}</p>}
                {chNotice && <p className="text-xs" style={{ color: 'var(--accent)' }}>{chNotice}</p>}
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
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>超时 {c.timeoutSec}s</div>
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
                      <CustomInput value={chForm.name} onChange={v => setChForm(f => ({ ...f, name: v }))} placeholder="例如：主线-Anthropic" />
                    </div>
                    <div>
                      <Label className="block mb-1.5">Base URL</Label>
                      <CustomInput value={chForm.baseUrl} onChange={v => setChForm(f => ({ ...f, baseUrl: v }))} placeholder="https://api.anthropic.com" mono />
                    </div>
                    <div>
                      <Label className="block mb-1.5">请求超时（秒）</Label>
                      <CustomInput value={chForm.timeoutSec} onChange={v => setChForm(f => ({ ...f, timeoutSec: v }))} type="number" placeholder="120" />
                    </div>
                    <div>
                      <Label className="block mb-1.5">apiKey {editingChId ? '（留空保持不变，本地加密存储）' : ''}</Label>
                      <CustomInput value={chForm.apiKey} onChange={v => setChForm(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" mono />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 flex-wrap">
                    <Btn variant="primary" onClick={saveChannel}>保存渠道</Btn>
                    <Btn variant="soft" onClick={() => { setChForm({ name: '', baseUrl: '', timeoutSec: '120', apiKey: '' }); setEditingChId(null) }}>清空表单</Btn>
                    <span className="text-[11px]" style={{ color: 'var(--t3)' }}>渠道信息保存在本浏览器 localStorage 中（apiKey 经 AES-GCM 加密）。</span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
      {jsonViewerBody != null && (
        <LlmJsonViewerModal
  title="请求体预览"
  subtitle={jsonViewerBody.model ? `模型：${jsonViewerBody.model}` : undefined}
  text={jsonViewerBody.body}
  onClose={() => setJsonViewerBody(null)}
/>
      )}
    </div>
  )
}

export default LlmBatchTool
