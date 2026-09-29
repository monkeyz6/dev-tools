export type ProbeFormat = 'chat' | 'responses' | 'anthropic'

export interface ProbeSseEvent { index: number; event: string; id: string; data: string; json: any }

export interface ProbeUsage { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null }

export type ProbeStopKind = 'stop' | 'length' | 'tool' | 'other'

export interface ProbeStop { kind: ProbeStopKind; raw: string | null }

export interface ProbeToolCall { name: string; args: unknown }

export type ProbeToolChoice = 'auto' | { name: string }

export interface ProbeToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export const PROBE_ENDPOINTS: Record<ProbeFormat, string> = {
  chat: '/v1/chat/completions',
  responses: '/v1/responses',
  anthropic: '/v1/messages',
}

export const PROBE_JSON_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
} as const

export const PROBE_WEATHER_PARAMS = {
  type: 'object',
  properties: {
    city: { type: 'string', description: '城市名' },
    date: { type: 'string', description: '日期 YYYY-MM-DD' },
  },
  required: ['city'],
}

export const PROBE_ORDER_PARAMS = {
  type: 'object',
  properties: {
    order_id: { type: 'string' },
  },
  required: ['order_id'],
}

export const PROBE_WEATHER_TOOL: ProbeToolDef = {
  name: 'get_weather',
  description: '查询指定城市某天的天气',
  parameters: PROBE_WEATHER_PARAMS,
}

export const PROBE_ORDER_TOOL: ProbeToolDef = {
  name: 'query_order',
  description: '根据订单号查询物流状态',
  parameters: PROBE_ORDER_PARAMS,
}

export const PROBE_PARAM_COMBO_PROMPT = 'Return a JSON object with ok=true. If a tool is available, call it with value="ok".'
export const PROBE_TOOL_CALL_PROMPT = '帮我看看明天上海的天气怎么样，另外查下订单 SN20260705888 到哪了'
export const PROBE_TRUNCATION_PROMPT = 'Count from 1 to 200, writing each integer on its own line. Do not stop until you reach 200.'
export const PROBE_TRUNCATION_CAP = 16
/** 短可见回复的默认输出额度。思考模型会先吃思考链，32 经常写不出 SYSTEM_OK / 口令 / tool_use。截断语义仍用 PROBE_TRUNCATION_CAP。 */
export const PROBE_DEFAULT_CAP = 120
export const PROBE_SCHEMA_PROMPT = 'Return a JSON object with ok=true.'
export const PROBE_SCHEMA_CAP = 256
export const PROBE_TOOL_FORCE_PROMPT = 'What is the weather in Shanghai tomorrow? You must call the get_weather tool.'
export const PROBE_SYSTEM_INSTRUCTION = 'Always reply exactly SYSTEM_OK'
export const PROBE_SYSTEM_USER = 'Respond now'
export const PROBE_SYSTEM_TOKEN = 'SYSTEM_OK'
export const PROBE_MULTITURN_CODE = 'ORBIT'
export const PROBE_MULTITURN_TURN1 = 'Remember the codeword ORBIT. Reply with a short ack, do not mention the codeword.'
export const PROBE_MULTITURN_TURN2 = 'Reply with only the codeword.'
export const PROBE_IMAGE_PROMPT = 'What is the dominant color of this image? Reply with one English word.'
/** 32×32 纯红 PNG（#DC2626，1024 px）。Grok 拒绝总像素低于 512 的图。不依赖外网图 */
export const PROBE_RED_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mO4o6ZGU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAIjyoD2JhwFtAAAAAElFTkSuQmCC'

export const probeEmptyUsage = (): ProbeUsage => ({ input: null, output: null, cacheRead: null, cacheWrite: null })
export const probeNum = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

export const probeMergeUsage = (u: ProbeUsage, src: any) => {
  if (!src || typeof src !== 'object') return
  u.input = probeNum(src.prompt_tokens ?? src.input_tokens) ?? u.input
  u.output = probeNum(src.completion_tokens ?? src.output_tokens) ?? u.output
  u.cacheRead = probeNum(src.prompt_tokens_details?.cached_tokens ?? src.input_tokens_details?.cached_tokens ?? src.cache_read_input_tokens) ?? u.cacheRead
  u.cacheWrite = probeNum(
    src.cache_creation_input_tokens
    ?? src.prompt_tokens_details?.cache_write_tokens
    ?? src.input_tokens_details?.cache_write_tokens,
  ) ?? u.cacheWrite
}

export const probeParseSseBlock = (block: string, index: number): ProbeSseEvent => {
  let event = 'message', id = ''
  const data: string[] = []
  block.split(/\r?\n/).forEach(line => {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('id:')) id = line.slice(3).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trim())
  })
  const raw = data.join('\n')
  let json: any = null
  try { json = JSON.parse(raw) } catch { /* ignore */ }
  return { index, event, id, data: raw, json }
}

const asObj = (v: unknown): Record<string, any> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null

/** 部分网关把 Responses 对象再包一层 { response: {...} } */
const unwrapResponse = (data: unknown): Record<string, any> | null => {
  const o = asObj(data)
  if (!o) return null
  const inner = asObj(o.response)
  if (inner && (inner.output != null || inner.status != null) && o.output == null && o.status == null) return inner
  return o
}

const textFromParts = (parts: unknown, textKeys: string[]): string => {
  if (typeof parts === 'string') return parts
  if (!Array.isArray(parts)) return ''
  const chunks: string[] = []
  for (const p of parts) {
    if (typeof p === 'string') { chunks.push(p); continue }
    const o = asObj(p)
    if (!o) continue
    for (const k of textKeys) {
      if (typeof o[k] === 'string') { chunks.push(o[k]); break }
    }
  }
  return chunks.join('')
}

const probeResponsesInput = (text: string) => ([
  { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
])

const ensureResponsesInputArray = (body: Record<string, any>) => {
  if (typeof body.input === 'string') body.input = probeResponsesInput(body.input)
  if (!Array.isArray(body.input)) body.input = []
}

const weatherAndOrder = (format: ProbeFormat): Record<string, any> => {
  const weather = { name: PROBE_WEATHER_TOOL.name, description: PROBE_WEATHER_TOOL.description }
  const order = { name: PROBE_ORDER_TOOL.name, description: PROBE_ORDER_TOOL.description }
  if (format === 'anthropic') return {
    tools: [
      { ...weather, input_schema: PROBE_WEATHER_PARAMS },
      { ...order, input_schema: PROBE_ORDER_PARAMS },
    ],
    tool_choice: { type: 'auto' },
  }
  if (format === 'responses') return {
    tools: [
      { type: 'function', ...weather, parameters: PROBE_WEATHER_PARAMS },
      { type: 'function', ...order, parameters: PROBE_ORDER_PARAMS },
    ],
    tool_choice: 'auto',
  }
  return {
    tools: [
      { type: 'function', function: { ...weather, parameters: PROBE_WEATHER_PARAMS } },
      { type: 'function', function: { ...order, parameters: PROBE_ORDER_PARAMS } },
    ],
    tool_choice: 'auto',
  }
}

export interface ProbeProtocol {
  id: ProbeFormat
  capabilities: { structuredOutput: boolean; streamPure: boolean }
  headers(apiKey: string): Record<string, string>
  baseBody(model: string, prompt: string): Record<string, any>
  applyMaxTokens(body: Record<string, any>, n: number, keys?: string[]): void
  applyTools(body: Record<string, any>, tools: ProbeToolDef[], choice: ProbeToolChoice): void
  applyStructuredOutput(body: Record<string, any>, schema?: Record<string, unknown>): void
  applySystem(body: Record<string, any>, system: string, user: string): void
  applyImage(body: Record<string, any>, pngBase64: string, prompt: string): void
  appendUser(body: Record<string, any>, text: string): void
  appendAssistantFromResponse(body: Record<string, any>, data: unknown): boolean
  paramFragment(id: string): Record<string, any>
  usageOf(data: unknown): ProbeUsage
  usageFromSse(events: ProbeSseEvent[]): ProbeUsage
  textOf(data: unknown): string
  stopOf(data: unknown): ProbeStop
  toolCallsOf(data: unknown): ProbeToolCall[]
  streamFinished(raw: string, events: ProbeSseEvent[]): boolean
}

const chatProtocol: ProbeProtocol = {
  id: 'chat',
  capabilities: { structuredOutput: true, streamPure: true },
  headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${apiKey}`,
    }
  },
  baseBody(model, prompt) {
    return { model, messages: [{ role: 'user', content: prompt }] }
  },
  applyMaxTokens(body, n, keys) {
    const list = keys?.length ? keys : ['max_completion_tokens']
    for (const k of list) body[k] = n
  },
  applyTools(body, tools, choice) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
    body.tool_choice = choice === 'auto'
      ? 'auto'
      : { type: 'function', function: { name: choice.name } }
  },
  applyStructuredOutput(body, schema = PROBE_JSON_SCHEMA) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'probe', strict: true, schema },
    }
  },
  applySystem(body, system, user) {
    body.messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]
  },
  applyImage(body, pngBase64, prompt) {
    body.messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}` } },
      ],
    }]
  },
  appendUser(body, text) {
    if (!Array.isArray(body.messages)) body.messages = []
    body.messages.push({ role: 'user', content: text })
  },
  appendAssistantFromResponse(body, data) {
    const msg = asObj(data)?.choices?.[0]?.message
    if (!msg || typeof msg !== 'object') return false
    if (!Array.isArray(body.messages)) body.messages = []
    body.messages.push({ role: 'assistant', content: msg.content ?? '' })
    return true
  },
  paramFragment(id) {
    switch (id) {
      case 'temperature': return { temperature: 0.2 }
      case 'top_p': return { top_p: 0.9 }
      case 'reasoning_effort': return { reasoning_effort: 'low' }
      case 'max_tokens': return { max_completion_tokens: PROBE_DEFAULT_CAP, max_tokens: PROBE_DEFAULT_CAP }
      case 'structured_output':
        return { response_format: { type: 'json_schema', json_schema: { name: 'probe', strict: true, schema: PROBE_JSON_SCHEMA } } }
      case 'tool_calling': return weatherAndOrder('chat')
      default: return {}
    }
  },
  usageOf(data) {
    const u = probeEmptyUsage()
    probeMergeUsage(u, asObj(data)?.usage)
    return u
  },
  usageFromSse(events) {
    const u = probeEmptyUsage()
    for (const ev of events) {
      if (ev.json && typeof ev.json === 'object') probeMergeUsage(u, ev.json.usage)
    }
    return u
  },
  textOf(data) {
    const msg = asObj(data)?.choices?.[0]?.message
    if (!msg) return ''
    return textFromParts(msg.content, ['text'])
  },
  stopOf(data) {
    const o = asObj(data)
    const raw = o?.choices?.[0]?.finish_reason ?? o?.finish_reason
    const s = typeof raw === 'string' ? raw : null
    if (s === 'length') return { kind: 'length', raw: s }
    if (s === 'tool_calls' || s === 'function_call') return { kind: 'tool', raw: s }
    if (s === 'stop') return { kind: 'stop', raw: s }
    return { kind: 'other', raw: s }
  },
  toolCallsOf(data) {
    const msg = asObj(data)?.choices?.[0]?.message
    const out: ProbeToolCall[] = []
    const calls = msg?.tool_calls
    if (Array.isArray(calls)) {
      for (const c of calls) {
        const fn = asObj(c)?.function
        if (fn && typeof fn.name === 'string') {
          let args: unknown = fn.arguments
          if (typeof args === 'string') {
            try { args = JSON.parse(args) } catch { /* keep raw */ }
          }
          out.push({ name: fn.name, args })
        }
      }
    }
    const legacy = asObj(msg)?.function_call
    if (legacy && typeof legacy.name === 'string') {
      let args: unknown = legacy.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { /* keep raw */ }
      }
      out.push({ name: legacy.name, args })
    }
    return out
  },
  streamFinished(raw) {
    return /\[DONE\]/.test(raw || '')
  },
}

const responsesProtocol: ProbeProtocol = {
  id: 'responses',
  capabilities: { structuredOutput: true, streamPure: false },
  headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${apiKey}`,
    }
  },
  baseBody(model, prompt) {
    return { model, input: prompt }
  },
  applyMaxTokens(body, n) {
    body.max_output_tokens = n
  },
  applyTools(body, tools, choice) {
    if (typeof body.input === 'string') body.input = probeResponsesInput(body.input)
    body.tools = tools.map(t => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
    body.tool_choice = choice === 'auto'
      ? 'auto'
      : { type: 'function', name: choice.name }
  },
  applyStructuredOutput(body, schema = PROBE_JSON_SCHEMA) {
    body.text = { format: { type: 'json_schema', name: 'probe', strict: true, schema } }
  },
  applySystem(body, system, user) {
    body.instructions = system
    body.input = user
  },
  applyImage(body, pngBase64, prompt) {
    body.input = [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: `data:image/png;base64,${pngBase64}` },
      ],
    }]
  },
  appendUser(body, text) {
    ensureResponsesInputArray(body)
    body.input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] })
  },
  appendAssistantFromResponse(body, data) {
    const o = unwrapResponse(data)
    const items = Array.isArray(o?.output) ? o.output : []
    const msg = items.find((it: any) => asObj(it)?.type === 'message' || asObj(it)?.role === 'assistant')
    ensureResponsesInputArray(body)
    if (msg && typeof msg === 'object') {
      const content = Array.isArray(asObj(msg)?.content) ? JSON.parse(JSON.stringify(asObj(msg)!.content)) : null
      const text = responsesProtocol.textOf(data)
      if (!content && !text) return false
      body.input.push({
        type: 'message',
        role: 'assistant',
        content: content || [{ type: 'output_text', text }],
      })
      return true
    }
    const text = responsesProtocol.textOf(data)
    if (!text) return false
    body.input.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    })
    return true
  },
  paramFragment(id) {
    switch (id) {
      case 'temperature': return { temperature: 0.2 }
      case 'top_p': return { top_p: 0.9 }
      case 'reasoning_effort': return { reasoning_effort: 'low' }
      case 'max_tokens': return { max_output_tokens: PROBE_DEFAULT_CAP }
      case 'structured_output':
        return { text: { format: { type: 'json_schema', name: 'probe', strict: true, schema: PROBE_JSON_SCHEMA } } }
      case 'tool_calling': return weatherAndOrder('responses')
      default: return {}
    }
  },
  usageOf(data) {
    const u = probeEmptyUsage()
    const o = unwrapResponse(data)
    probeMergeUsage(u, o?.usage)
    probeMergeUsage(u, asObj(data)?.usage)
    return u
  },
  usageFromSse(events) {
    const u = probeEmptyUsage()
    for (const ev of events) {
      if (ev.event !== 'response.completed' && ev.event !== 'response.incomplete') continue
      const j = ev.json
      if (!j || typeof j !== 'object') continue
      probeMergeUsage(u, j.response?.usage)
      probeMergeUsage(u, j.usage)
    }
    return u
  },
  textOf(data) {
    const o = unwrapResponse(data)
    if (typeof o?.output_text === 'string') return o.output_text
    if (typeof asObj(data)?.output_text === 'string') return asObj(data)!.output_text
    const items = Array.isArray(o?.output) ? o.output : []
    const chunks: string[] = []
    for (const it of items) {
      const obj = asObj(it)
      if (!obj) continue
      chunks.push(textFromParts(obj.content, ['text', 'output_text']))
      if (typeof obj.text === 'string') chunks.push(obj.text)
    }
    return chunks.join('')
  },
  stopOf(data) {
    const o = unwrapResponse(data)
    const status = typeof o?.status === 'string' ? o.status : null
    const reason = typeof o?.incomplete_details?.reason === 'string' ? o.incomplete_details.reason : null
    if (status === 'incomplete' && (reason === 'max_output_tokens' || reason === 'max_tokens')) {
      return { kind: 'length', raw: reason }
    }
    const calls = responsesProtocol.toolCallsOf(data)
    if (calls.length) return { kind: 'tool', raw: status }
    if (status === 'completed') return { kind: 'stop', raw: status }
    if (status === 'incomplete') return { kind: 'other', raw: reason || status }
    return { kind: 'other', raw: status }
  },
  toolCallsOf(data) {
    const o = unwrapResponse(data)
    const items = Array.isArray(o?.output) ? o.output : []
    const out: ProbeToolCall[] = []
    for (const it of items) {
      const item = asObj(it)
      if (!item) continue
      if ((item.type === 'function_call' || item.type === 'tool_call') && typeof item.name === 'string') {
        let args: unknown = item.arguments
        if (typeof args === 'string') {
          try { args = JSON.parse(args) } catch { /* keep raw */ }
        }
        out.push({ name: item.name, args })
      }
    }
    return out
  },
  streamFinished(_raw, events) {
    return events.some(e => e.event === 'response.completed' || e.event === 'response.incomplete')
  },
}

export type AnthropicCapField = 'max_tokens' | 'max_completion_tokens'

let anthropicCapField: AnthropicCapField = 'max_tokens'

/** 本轮 Anthropic 体用哪个上限字段。推理模型在 max_tokens 被拒后切到 max_completion_tokens。 */
export const setProbeAnthropicCapField = (field: AnthropicCapField) => {
  anthropicCapField = field
}

export const probeAnthropicCapField = (): AnthropicCapField => anthropicCapField

const anthropicProtocol: ProbeProtocol = {
  id: 'anthropic',
  capabilities: { structuredOutput: true, streamPure: false },
  headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  },
  baseBody(model, prompt) {
    return { model, [anthropicCapField]: PROBE_DEFAULT_CAP, messages: [{ role: 'user', content: prompt }] }
  },
  applyMaxTokens(body, n) {
    delete body.max_tokens
    delete body.max_completion_tokens
    body[anthropicCapField] = n
  },
  applyTools(body, tools, choice) {
    body.tools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
    body.tool_choice = choice === 'auto'
      ? { type: 'auto' }
      : { type: 'tool', name: choice.name }
  },
  applyStructuredOutput(body, schema = PROBE_JSON_SCHEMA) {
    body.output_config = { format: { type: 'json_schema', schema } }
  },
  applySystem(body, system, user) {
    body.system = system
    body.messages = [{ role: 'user', content: user }]
  },
  applyImage(body, pngBase64, prompt) {
    body.messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
        { type: 'text', text: prompt },
      ],
    }]
  },
  appendUser(body, text) {
    if (!Array.isArray(body.messages)) body.messages = []
    body.messages.push({ role: 'user', content: text })
  },
  appendAssistantFromResponse(body, data) {
    const content = asObj(data)?.content
    if (!Array.isArray(content) || !content.length) return false
    if (!Array.isArray(body.messages)) body.messages = []
    body.messages.push({ role: 'assistant', content })
    return true
  },
  paramFragment(id) {
    switch (id) {
      case 'temperature': return { temperature: 0.2 }
      case 'top_p': return { top_p: 0.9 }
      case 'reasoning_effort': return { reasoning_effort: 'low' }
      case 'max_tokens': return { [anthropicCapField]: PROBE_DEFAULT_CAP }
      case 'structured_output':
        return { output_config: { format: { type: 'json_schema', schema: PROBE_JSON_SCHEMA } } }
      case 'tool_calling': return weatherAndOrder('anthropic')
      default: return {}
    }
  },
  usageOf(data) {
    const u = probeEmptyUsage()
    const src = asObj(data)?.usage
    probeMergeUsage(u, src)
    if (src && typeof src === 'object') {
      u.input = probeNum(src.input_tokens) ?? u.input
      u.output = probeNum(src.output_tokens) ?? u.output
      u.cacheRead = probeNum(src.cache_read_input_tokens) ?? u.cacheRead
      u.cacheWrite = probeNum(src.cache_creation_input_tokens) ?? u.cacheWrite
    }
    return u
  },
  usageFromSse(events) {
    const u = probeEmptyUsage()
    for (const ev of events) {
      const j = ev.json
      if (!j || typeof j !== 'object') continue
      if (ev.event === 'message_start' && j.message?.usage) {
        const src = j.message.usage
        u.input = probeNum(src.input_tokens) ?? u.input
        u.cacheRead = probeNum(src.cache_read_input_tokens) ?? u.cacheRead
        u.cacheWrite = probeNum(src.cache_creation_input_tokens) ?? u.cacheWrite
      } else if (ev.event === 'message_delta' && j.usage) {
        probeMergeUsage(u, j.usage)
      }
    }
    return u
  },
  textOf(data) {
    return textFromParts(asObj(data)?.content, ['text'])
  },
  stopOf(data) {
    const raw = asObj(data)?.stop_reason
    const s = typeof raw === 'string' ? raw : null
    if (s === 'max_tokens') return { kind: 'length', raw: s }
    if (s === 'tool_use') return { kind: 'tool', raw: s }
    if (s === 'end_turn' || s === 'stop_sequence') return { kind: 'stop', raw: s }
    return { kind: 'other', raw: s }
  },
  toolCallsOf(data) {
    const content = asObj(data)?.content
    const out: ProbeToolCall[] = []
    if (!Array.isArray(content)) return out
    for (const block of content) {
      const o = asObj(block)
      if (o?.type === 'tool_use' && typeof o.name === 'string') out.push({ name: o.name, args: o.input })
    }
    return out
  },
  streamFinished(_raw, events) {
    return events.some(e => e.event === 'message_stop')
  },
}

const PROTOCOLS: Record<ProbeFormat, ProbeProtocol> = {
  chat: chatProtocol,
  responses: responsesProtocol,
  anthropic: anthropicProtocol,
}

export const probeProtocolOf = (format: ProbeFormat): ProbeProtocol => PROTOCOLS[format]

export const probeBaseBody = (model: string, format: ProbeFormat, prompt = 'Reply with exactly: OK') =>
  probeProtocolOf(format).baseBody(model, prompt)

export const probeParamSpec = (id: string, format: ProbeFormat): Record<string, any> =>
  probeProtocolOf(format).paramFragment(id)

export const CHAT_MAX_TOKEN_KEYS = ['max_completion_tokens', 'max_tokens'] as const
export type ChatMaxTokenKey = typeof CHAT_MAX_TOKEN_KEYS[number]

/** Chat 的 max_tokens / max_completion_tokens 是同一能力的两个字段名。返回应从表里拿掉的那个，或 conflict（互斥需拆开试）。 */
export const probeChatMaxTokenBlame = (err: string): ChatMaxTokenKey | 'conflict' | null => {
  const e = err.toLowerCase()
  const hasCompletion = /max[_-]?completion[_-]?tokens/.test(e)
  const hasPlain = /max[_-]?tokens/.test(e)
  if (hasCompletion && hasPlain) {
    if (/both|mutually exclusive|cannot specify|can't specify|not allowed to (set|use|specify) both/.test(e)) return 'conflict'
    if (/use ['"`]?max[_-]?completion/.test(e)) return 'max_tokens'
    if (/use ['"`]?max[_-]?tokens/.test(e)) return 'max_completion_tokens'
    return 'conflict'
  }
  if (hasCompletion) return 'max_completion_tokens'
  if (hasPlain) return 'max_tokens'
  return null
}

/** pretty JSON 只取 message。sibling 字段（如 model=xxx-thinking）不能当判定。 */
export const probeErrorMessage = (err: string): string => {
  const t = String(err || '').trim()
  if (!t.startsWith('{')) return err
  try {
    const o = JSON.parse(t)
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      if (typeof o.message === 'string' && o.message) return o.message
      const inner = o.error
      if (inner && typeof inner === 'object' && typeof inner.message === 'string' && inner.message) return inner.message
    }
  } catch { /* 保持原文 */ }
  return err
}

/** thinking / 思考模式拒绝 required、object 等强制 tool_choice 时才降级。须同时命中 tool_choice 与思考相关词，避免「not support」单独误触发。 */
export const probeToolChoiceForcedBlocked = (err: string): boolean => {
  const e = probeErrorMessage(err).toLowerCase()
  if (!/tool[_ -]?choice/.test(e)) return false
  return /thinking|reasoning|思考|推理/.test(e)
}

export const probeChatMaxAcceptLabel = (accepted: Iterable<string>, rejected: Iterable<string> = []): string => {
  const acc = [...accepted]
  const rej = [...rejected]
  if (!acc.length) return 'Token 上限字段均被拒绝'
  if (!rej.length) return acc.length > 1 ? `同时接受 ${acc.join(' 与 ')}` : `接受 ${acc[0]}`
  return `接受 ${acc.join(' 与 ')}（已排除 ${rej.join('、')}）`
}

export const probeParamComboBody = (model: string, format: ProbeFormat, pending: Iterable<string>, chatMaxKeys?: string[]): Record<string, any> => {
  const proto = probeProtocolOf(format)
  const ids = pending instanceof Set ? pending : new Set(pending)
  const toolCalling = ids.has('tool_calling')
  const prompt = toolCalling ? PROBE_TOOL_CALL_PROMPT : PROBE_PARAM_COMBO_PROMPT
  const body: Record<string, any> = proto.baseBody(model, prompt)
  if (toolCalling && format === 'responses') body.input = probeResponsesInput(prompt)
  for (const id of ids) Object.assign(body, proto.paramFragment(id))
  if (format === 'chat' && ids.has('max_tokens')) {
    delete body.max_tokens
    delete body.max_completion_tokens
    const keys = chatMaxKeys?.length ? chatMaxKeys : [...CHAT_MAX_TOKEN_KEYS]
    for (const k of keys) body[k] = PROBE_DEFAULT_CAP
  }
  return body
}

export const probeParamMatched = (id: string, err: string, format?: ProbeFormat): boolean => {
  if (id === 'max_tokens') {
    if (format === 'chat') return false
    return /max[_ ]?(completion|output)?[_ ]?tokens/.test(err)
  }
  if (id === 'structured_output') return /response_format|json\s?schema|text\.format|output_config|output_format/.test(err)
  if (id === 'tool_calling') return /tool|function/.test(err)
  return err.includes(id)
}

/** 一条错误只点名一个待测参数时才归给它。同时点名多个（例如工具 + reasoning_effort）则拆开重测。 */
export const probeSoleParamMatch = (ids: Iterable<string>, err: string, format?: ProbeFormat): string | null => {
  const hit = [...ids].filter(id => probeParamMatched(id, err, format))
  return hit.length === 1 ? hit[0] : null
}

export const probeResponsesResourceId = (data: unknown): string | null => {
  const id = asObj(data)?.id
  return typeof id === 'string' && id.startsWith('resp_') ? id : null
}

export const probeUsageOf = (format: ProbeFormat, data: any): ProbeUsage =>
  probeProtocolOf(format).usageOf(data)

export const probeUsageFromSse = (format: ProbeFormat, events: ProbeSseEvent[]): ProbeUsage =>
  probeProtocolOf(format).usageFromSse(events)
