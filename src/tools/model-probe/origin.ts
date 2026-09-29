export type ProbeBasicState = 'ok' | 'fail' | 'absent'

export interface ProbeSignalFlags {
  promptFilterResults: boolean
  contentFilters: boolean
  servingPipereplica: boolean
  latencyCheckpoint: boolean
  reasoningEffort: boolean
  reasoningTokens: boolean
  anthropicNative: boolean
  stopReason: boolean
  cacheCreation: boolean
  cacheReadField: boolean
  systemFingerprint: string | null
}

export interface ProbeSignals {
  requestModel: string
  baseUrl: string
  responseModels: string[]
  errors: string[]
  shortPromptInput: number | null
  basic: { chat: ProbeBasicState; responses: ProbeBasicState; anthropic: ProbeBasicState }
  chatBasicStatus: number | null
  urls: string[]
  flags: ProbeSignalFlags
}

export interface ProbeOriginLog {
  url: string
  status: number | null
  resultKey: string
  format: string
  requestBody: unknown
  responseHeaders: Record<string, string>
  responseBody: unknown
  usage?: { input: number | null } | null
}

export interface OriginLayer {
  id: string
  label: string
  reasons: string[]
}

export interface OriginDecision {
  access: OriginLayer
  upstream: OriginLayer
}

const emptyFlags = (): ProbeSignalFlags => ({
  promptFilterResults: false,
  contentFilters: false,
  servingPipereplica: false,
  latencyCheckpoint: false,
  reasoningEffort: false,
  reasoningTokens: false,
  anthropicNative: false,
  stopReason: false,
  cacheCreation: false,
  cacheReadField: false,
  systemFingerprint: null,
})

const hostOf = (url: string): string => {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

const errorMessagesOf = (body: unknown): string[] => {
  if (!body || typeof body !== 'object') return []
  const o = body as Record<string, any>
  const out: string[] = []
  if (typeof o.message === 'string') out.push(o.message)
  if (typeof o.error === 'string') out.push(o.error)
  if (o.error && typeof o.error === 'object' && typeof o.error.message === 'string') out.push(o.error.message)
  return out
}

const walk = (value: unknown, flags: ProbeSignalFlags, depth: number) => {
  if (!value || typeof value !== 'object' || depth > 6) return
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) walk(item, flags, depth + 1)
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'prompt_filter_results') flags.promptFilterResults = true
    if (key === 'content_filters') flags.contentFilters = true
    if (key === 'serving_pipereplica') flags.servingPipereplica = true
    if (key === 'latency_checkpoint') flags.latencyCheckpoint = true
    if (key === 'stop_reason') flags.stopReason = true
    if (key === 'cache_creation_input_tokens') flags.cacheCreation = true
    if (key === 'cache_read_input_tokens') flags.cacheReadField = true
    if (key === 'reasoning_tokens' && typeof child === 'number' && child > 0) flags.reasoningTokens = true
    if (key === 'system_fingerprint' && typeof child === 'string' && child.trim()) flags.systemFingerprint = child.trim()
    if (key === 'reasoning' && child && typeof child === 'object' && !Array.isArray(child)) {
      const effort = (child as Record<string, unknown>).effort
      if (typeof effort === 'string' && effort) flags.reasoningEffort = true
    }
    walk(child, flags, depth + 1)
  }
}

const isShortPrompt = (body: unknown): boolean => {
  if (!body || typeof body !== 'object') return false
  const o = body as Record<string, any>
  if (o.input === 'Reply with exactly: OK') return true
  const messages = o.messages
  return Array.isArray(messages) && messages.length === 1 && messages[0]?.content === 'Reply with exactly: OK'
}

const basicState = (logs: ProbeOriginLog[], key: string): ProbeBasicState => {
  const rows = logs.filter(log => log.resultKey === key)
  if (!rows.length) return 'absent'
  if (rows.some(log => log.status != null && log.status >= 200 && log.status < 300)) return 'ok'
  return 'fail'
}

export function signalsFromProbeLogs(input: {
  requestModel: string
  baseUrl: string
  logs: ProbeOriginLog[]
}): ProbeSignals {
  const flags = emptyFlags()
  const responseModels: string[] = []
  const errors: string[] = []
  let shortPromptInput: number | null = null
  let chatBasicStatus: number | null = null

  for (const log of input.logs) {
    walk(log.responseBody, flags, 0)
    const body = log.responseBody
    if (body && typeof body === 'object' && typeof (body as Record<string, any>).model === 'string') {
      responseModels.push((body as Record<string, any>).model)
    }
    errors.push(...errorMessagesOf(body))
    if (log.resultKey === 'chat-basic' && log.status != null) chatBasicStatus = log.status
    if (isShortPrompt(log.requestBody) && log.status != null && log.status >= 200 && log.status < 300) {
      const inputTokens = log.usage?.input
      if (typeof inputTokens === 'number' && (shortPromptInput == null || inputTokens < shortPromptInput)) {
        shortPromptInput = inputTokens
      }
    }
  }

  flags.anthropicNative = flags.stopReason || flags.cacheCreation || flags.cacheReadField

  return {
    requestModel: input.requestModel,
    baseUrl: input.baseUrl,
    responseModels,
    errors,
    shortPromptInput,
    basic: {
      chat: basicState(input.logs, 'chat-basic'),
      responses: basicState(input.logs, 'responses-basic'),
      anthropic: basicState(input.logs, 'anthropic-basic'),
    },
    chatBasicStatus,
    urls: input.logs.map(log => log.url).filter(Boolean),
    flags,
  }
}

const layer = (id: string, label: string, reasons: string[]): OriginLayer => ({ id, label, reasons })

/**
 * 不使用响应头判断来源。new-api 一类中转会剥掉或改写上游头，浏览器跨域也经常读不到；
 * `request-id: req_` 这类值官方和中转都会出现，不能区分渠道。
 * 接入层只看错误方言、请求 URL 和配置的主机；上游只看响应体。
 */
export function decideOrigin(signals: ProbeSignals): OriginDecision {
  const host = hostOf(signals.baseUrl)
  const blob = `${signals.errors.join('\n')}\n${signals.urls.join('\n')}`
  const gateway: string[] = []
  if (/分组/.test(blob)) gateway.push('错误含「分组」')
  if (/无可用渠道/.test(blob)) gateway.push('错误含「无可用渠道」')
  if (/distributor/i.test(blob)) gateway.push('错误含 distributor')
  if (/new-api|oneapi|one-api/i.test(blob)) gateway.push('错误或 URL 指向 new-api / oneapi')
  if (/request id:\s*\d{16,}/i.test(blob)) gateway.push('错误里的请求号是一长串数字')

  const codex: string[] = []
  if (signals.shortPromptInput != null && signals.shortPromptInput > 80) {
    codex.push(`短提示输入 Token 为 ${signals.shortPromptInput}，高于官方基线（约 8–20）`)
  }
  if (/chatgpt\.com|backend-api\/codex|originator/i.test(blob)) codex.push('URL 或错误指向 Codex / ChatGPT 后端')
  if (signals.basic.responses === 'ok' && signals.chatBasicStatus === 404 && codex.length) {
    codex.push('只通 Responses，Chat 返回 404')
  }

  const direct: string[] = []
  if (host === 'api.openai.com') direct.push('主机是 api.openai.com')
  if (host === 'api.anthropic.com') direct.push('主机是 api.anthropic.com')

  let access: OriginLayer
  const accessDirect = gateway.length ? [] : direct
  if (gateway.length && codex.length) access = layer('mixed', '混合', [...gateway, ...codex])
  else if (codex.length && accessDirect.length) access = layer('mixed', '混合', [...codex, ...accessDirect])
  else if (gateway.length) access = layer('gateway', '网关', gateway)
  else if (codex.length) access = layer('codex', 'Codex 反代', codex)
  else if (accessDirect.length) access = layer('direct', '官方直连', accessDirect)
  else access = layer('uncertain', '不确定', ['没有网关方言、Codex 注入或官方主机'])

  const azure: string[] = []
  if (signals.flags.promptFilterResults) azure.push('成功响应含 prompt_filter_results')
  if (signals.flags.contentFilters) azure.push('成功响应含 content_filters')
  if (signals.flags.servingPipereplica) azure.push('响应含 routing.serving_pipereplica')
  if (signals.flags.latencyCheckpoint) azure.push('用量含 latency_checkpoint')
  if (signals.errors.some(error => /azure openai resource/i.test(error))) azure.push('错误原文含 Azure OpenAI resource')

  const official: string[] = []
  if (!signals.flags.promptFilterResults && !signals.flags.contentFilters && signals.flags.systemFingerprint) {
    official.push(`system_fingerprint 为 ${signals.flags.systemFingerprint}`)
  }

  const datedClaude = signals.responseModels.find(model => /^claude-.+-\d{8}$/i.test(model))
  const anthropic: string[] = []
  if (datedClaude && (signals.flags.cacheCreation || signals.flags.cacheReadField || signals.flags.stopReason)) {
    anthropic.push(`响应模型 ${datedClaude}`)
  }

  const bedrock: string[] = []
  if (signals.responseModels.some(model => /anthropic\.claude/i.test(model)) || /anthropic\.claude/i.test(signals.requestModel)) {
    bedrock.push('模型 id 含 anthropic.claude')
  }

  const vertex: string[] = []
  if (signals.urls.some(url => /aiplatform\.googleapis\.com|publishers\/anthropic/i.test(url))) {
    vertex.push('URL 指向 Vertex AI')
  }

  const upstreamGroups = [
    { id: 'azure', label: 'Azure OpenAI', reasons: azure },
    { id: 'openai', label: 'OpenAI 官方', reasons: official },
    { id: 'anthropic', label: 'Anthropic 官方', reasons: anthropic },
    { id: 'bedrock', label: 'Bedrock', reasons: bedrock },
    { id: 'vertex', label: 'Vertex', reasons: vertex },
  ].filter(group => group.reasons.length)

  let upstream: OriginLayer
  if (upstreamGroups.length > 1) {
    upstream = layer('mixed', '混合', upstreamGroups.flatMap(group => group.reasons.map(reason => `${group.label}：${reason}`)))
  } else if (upstreamGroups.length === 1) {
    upstream = layer(upstreamGroups[0].id, upstreamGroups[0].label, upstreamGroups[0].reasons)
  } else {
    upstream = layer('uncertain', '不确定', ['这次响应里没有官方、Azure、Bedrock 或 Vertex 的稳定字段'])
  }

  return { access, upstream }
}
