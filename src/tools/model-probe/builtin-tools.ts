import type { ProbeFormat } from './protocol'
import { probeCheck, type ProbeCheck } from './oracles'

/** 厂商服务端内置工具（一发可测）。自定义 Function Calling 仍走 tool_calling。 */
export type BuiltinVendor =
  | 'openai'
  | 'xai'
  | 'anthropic'
  | 'qwen'
  | 'kimi'
  | 'glm'
  | 'minimax'
  | 'gemini'
  | 'doubao'

export const NATIVE_TEST_GROUP = '原生工具调用'

export interface BuiltinApply {
  tools?: Record<string, unknown>[]
  tool_choice?: unknown
  extra?: Record<string, unknown>
}

export interface BuiltinProbeCase {
  id: string
  vendor: BuiltinVendor
  tool: string
  group: typeof NATIVE_TEST_GROUP
  name: string
  desc: string
  explain: string
  kind: 'native'
  format: ProbeFormat
  defaultSelected: false
  prompt: string
  apply: BuiltinApply
  evidence: string[]
  /** 仅这些规范化精确名出现；不设则前缀命中即可 */
  onlyExact?: string[]
}

interface BuiltinVendorProfile {
  id: BuiltinVendor
  source: string
  exact: string[]
  prefixes: string[]
  cases: BuiltinProbeCase[]
}

const PAID = '可能单独计费。单独发请求，不并入参数组合。明确拒绝记为不支持；请求成功但没有调用或结果证据时记为异常。'

const caseBase = (
  partial: Omit<BuiltinProbeCase, 'group' | 'kind' | 'defaultSelected'>,
): BuiltinProbeCase => ({
  ...partial,
  group: NATIVE_TEST_GROUP,
  kind: 'native',
  defaultSelected: false,
})

const openaiCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-openai-web_search',
    vendor: 'openai',
    tool: 'web_search',
    name: 'OpenAI 联网搜索',
    desc: 'Responses hosted web_search，强制调用',
    explain: `OpenAI Responses 声明 {type:web_search} 并由服务端执行。${PAID}`,
    format: 'responses',
    prompt: 'What is a major news headline from today? You must use the hosted web search tool before answering.',
    apply: { tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' } },
    evidence: ['web_search_call', 'url_citation', 'web_search_tool_result'],
  }),
  caseBase({
    id: 'native-openai-code_interpreter',
    vendor: 'openai',
    tool: 'code_interpreter',
    name: 'OpenAI 代码解释器',
    desc: 'Responses code_interpreter，计算 17×23',
    explain: `OpenAI Responses hosted code_interpreter（container=auto）。${PAID}`,
    format: 'responses',
    prompt: 'Use the code interpreter to compute 17*23. You must run code and report the numeric result.',
    apply: {
      tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
      tool_choice: { type: 'code_interpreter' },
    },
    evidence: ['code_interpreter_call', 'code_interpreter'],
  }),
  caseBase({
    id: 'native-openai-image_generation',
    vendor: 'openai',
    tool: 'image_generation',
    name: 'OpenAI 图像生成',
    desc: 'Responses image_generation，会出图计费',
    explain: `OpenAI Responses hosted image_generation。会出图，费用高于普通补全。${PAID}`,
    format: 'responses',
    prompt: 'Generate a tiny 64x64 solid red square. You must use the image generation tool.',
    apply: { tools: [{ type: 'image_generation' }], tool_choice: { type: 'image_generation' } },
    evidence: ['image_generation_call', 'image_generation'],
  }),
  caseBase({
    id: 'native-openai-search-api',
    vendor: 'openai',
    tool: 'search_api',
    name: 'OpenAI Chat 搜索模型',
    desc: 'gpt-5-search-api 在 Chat 上总是先搜再答',
    explain: `Chat Completions 专用搜索模型，官方不走 Responses web_search。看引用/检索痕迹。${PAID}`,
    format: 'chat',
    prompt: 'What is a major news headline from today? Search the live web before answering.',
    apply: {},
    evidence: ['url_citation', 'search_result', 'web_search_call'],
    onlyExact: ['gpt-5-search-api'],
  }),
]

const xaiCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-xai-web_search',
    vendor: 'xai',
    tool: 'web_search',
    name: 'Grok 联网搜索',
    desc: 'xAI Responses web_search，tool_choice=required',
    explain: `xAI Responses 声明 {type:web_search}，tool_choice 用字符串 "required"。对象形式 {type:web_search} 对不上 ModelToolChoice，会 400。input 用 [{role,content}]。${PAID}`,
    format: 'responses',
    prompt: 'What is a major news headline from today?',
    apply: { tools: [{ type: 'web_search' }], tool_choice: 'required' },
    evidence: ['web_search_call', 'url_citation', 'citations', 'web_search'],
  }),
  caseBase({
    id: 'native-xai-x_search',
    vendor: 'xai',
    tool: 'x_search',
    name: 'Grok X 搜索',
    desc: 'xAI Responses x_search，tool_choice=required',
    explain: `xAI Responses 声明 {type:x_search}，tool_choice 同样用字符串 "required"。可能要几十秒，渠道超时建议 ≥120s。${PAID}`,
    format: 'responses',
    prompt: 'What are people saying about xAI on X?',
    apply: { tools: [{ type: 'x_search' }], tool_choice: 'required' },
    evidence: ['x_search_call', 'url_citation', 'citations', 'x_search'],
  }),
  caseBase({
    id: 'native-xai-code_interpreter',
    vendor: 'xai',
    tool: 'code_interpreter',
    name: 'Grok 代码执行',
    desc: 'xAI Responses code_interpreter',
    explain: `xAI 服务端 Code Interpreter。tool_choice 用字符串 "required"。${PAID}`,
    format: 'responses',
    prompt: 'Use the code interpreter to compute 17*23. You must run code.',
    apply: { tools: [{ type: 'code_interpreter' }], tool_choice: 'required' },
    evidence: ['code_interpreter_call', 'code_interpreter'],
  }),
  caseBase({
    id: 'native-xai-image_generation',
    vendor: 'xai',
    tool: 'image_generation',
    name: 'Grok 图像生成',
    desc: 'xAI Responses image_generation，会出图计费',
    explain: `xAI 服务端 Image Generation。会出图计费。tool_choice 用字符串 "required"。${PAID}`,
    format: 'responses',
    prompt: 'Generate a tiny 64x64 solid red square. You must use the image generation tool.',
    apply: { tools: [{ type: 'image_generation' }], tool_choice: 'required' },
    evidence: ['image_generation_call', 'image_generation'],
  }),
]

const anthropicCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-anthropic-web_search',
    vendor: 'anthropic',
    tool: 'web_search',
    name: 'Claude 联网搜索',
    desc: 'Messages server web_search',
    explain: `Anthropic 服务端 web_search_20260318。${PAID}`,
    format: 'anthropic',
    prompt: 'What is a major news headline from today? You must use the web_search tool.',
    apply: {
      tools: [{ type: 'web_search_20260318', name: 'web_search' }],
      tool_choice: { type: 'tool', name: 'web_search' },
    },
    evidence: ['server_tool_use', 'web_search_tool_result', 'web_search'],
  }),
  caseBase({
    id: 'native-anthropic-web_fetch',
    vendor: 'anthropic',
    tool: 'web_fetch',
    name: 'Claude 抓取网页',
    desc: 'Messages server web_fetch',
    explain: `Anthropic 服务端 web_fetch_20260318。${PAID}`,
    format: 'anthropic',
    prompt: 'Fetch https://example.com and quote the page title. You must use the web_fetch tool.',
    apply: {
      tools: [{ type: 'web_fetch_20260318', name: 'web_fetch' }],
      tool_choice: { type: 'tool', name: 'web_fetch' },
    },
    evidence: ['server_tool_use', 'web_fetch_tool_result', 'web_fetch'],
  }),
  caseBase({
    id: 'native-anthropic-code_execution',
    vendor: 'anthropic',
    tool: 'code_execution',
    name: 'Claude 代码执行',
    desc: 'Messages server code_execution',
    explain: `Anthropic 服务端 code_execution_20260521。${PAID}`,
    format: 'anthropic',
    prompt: 'Use code execution to compute 17*23. You must run code.',
    apply: {
      tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
      tool_choice: { type: 'tool', name: 'code_execution' },
    },
    evidence: ['server_tool_use', 'code_execution_tool_result', 'code_execution'],
  }),
]

const qwenCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-qwen-enable_search',
    vendor: 'qwen',
    tool: 'enable_search',
    name: '通义 Chat 联网搜索',
    desc: 'Chat enable_search + forced_search',
    explain: `百炼 Chat 顶层 enable_search，forced_search 强制检索。${PAID}`,
    format: 'chat',
    prompt: '杭州明天天气如何？必须先联网搜索再回答。',
    apply: { extra: { enable_search: true, search_options: { forced_search: true } } },
    evidence: ['search_info', 'search_results', 'search_result', 'url_citation'],
  }),
  caseBase({
    id: 'native-qwen-web_search',
    vendor: 'qwen',
    tool: 'web_search',
    name: '通义 Responses 联网搜索',
    desc: 'Responses tools web_search',
    explain: `百炼 OpenAI 兼容 Responses 的 web_search。${PAID}`,
    format: 'responses',
    prompt: '杭州明天天气如何？必须先使用 web_search。',
    apply: { tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' } },
    evidence: ['web_search_call', 'x_tools', 'web_search'],
  }),
  caseBase({
    id: 'native-qwen-web_extractor',
    vendor: 'qwen',
    tool: 'web_extractor',
    name: '通义网页提取',
    desc: 'Responses web_extractor',
    explain: `百炼 Responses web_extractor。${PAID}`,
    format: 'responses',
    prompt: 'Extract the title of https://example.com using the web extractor tool.',
    apply: { tools: [{ type: 'web_extractor' }], tool_choice: { type: 'web_extractor' } },
    evidence: ['web_extractor', 'extractor_call', 'web_extractor_call'],
  }),
  caseBase({
    id: 'native-qwen-code_interpreter',
    vendor: 'qwen',
    tool: 'code_interpreter',
    name: '通义代码解释器',
    desc: 'Responses code_interpreter',
    explain: `百炼 Responses code_interpreter。${PAID}`,
    format: 'responses',
    prompt: 'Use the code interpreter to compute 17*23. You must run code.',
    apply: { tools: [{ type: 'code_interpreter' }], tool_choice: { type: 'code_interpreter' } },
    evidence: ['code_interpreter_call', 'code_interpreter', 'x_tools'],
  }),
]

const kimiCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-kimi-web_search',
    vendor: 'kimi',
    tool: '$web_search',
    name: 'Kimi 内置 $web_search',
    desc: 'Chat builtin_function，只看首包 tool_calls',
    explain: `Kimi 内置 $web_search。只发一跳，不回传、不走 Formula。通过条件：首包 tool_calls 含 $web_search。${PAID}`,
    format: 'chat',
    prompt: 'What is a major news headline from today? You must call the $web_search tool.',
    apply: { tools: [{ type: 'builtin_function', function: { name: '$web_search' } }] },
    evidence: ['$web_search'],
  }),
]

const glmCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-glm-web_search',
    vendor: 'glm',
    tool: 'web_search',
    name: '智谱联网搜索',
    desc: 'Chat tools type=web_search，跳过意图识别',
    explain: `智谱对话补全 web_search，search_intent=false 强制检索。${PAID}`,
    format: 'chat',
    prompt: '杭州明天天气如何？必须联网搜索后再回答。',
    apply: {
      tools: [{
        type: 'web_search',
        web_search: { enable: true, search_intent: 'false', search_query: '杭州明天天气' },
      }],
    },
    evidence: ['search_result', 'web_search', 'search_results'],
  }),
]

const minimaxCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-minimax-web_search',
    vendor: 'minimax',
    tool: 'web_search',
    name: 'MiniMax 联网搜索',
    desc: 'Anthropic Messages web_search_20250305',
    explain: `MiniMax 仅 Anthropic Messages 提供服务端 web_search。${PAID}`,
    format: 'anthropic',
    prompt: 'What is a major news headline from today? You must use the web_search tool.',
    apply: {
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      tool_choice: { type: 'tool', name: 'web_search' },
    },
    evidence: ['server_tool_use', 'web_search_tool_result', 'web_search'],
  }),
]

const geminiCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-gemini-google_search',
    vendor: 'gemini',
    tool: 'google_search',
    name: 'Gemini Google 搜索',
    desc: '按 OpenAI 兼容形声明 google_search（无 Interactions 协议）',
    explain: `官方主路径是 Interactions API，本工具不新开协议。按网关常见 tools:[{type:google_search}] 走 Chat；4xx 记不支持。${PAID}`,
    format: 'chat',
    prompt: 'What is a major news headline from today? You must use Google Search.',
    apply: { tools: [{ type: 'google_search' }], tool_choice: 'required' },
    evidence: ['google_search_call', 'google_search', 'grounding_metadata'],
  }),
]

const doubaoCases: BuiltinProbeCase[] = [
  caseBase({
    id: 'native-doubao-web_search',
    vendor: 'doubao',
    tool: 'web_search',
    name: '豆包联网搜索',
    desc: '方舟 Responses web_search（不要 bot_id 插件通道）',
    explain: `火山方舟 Responses 声明 {type:web_search}。要 bot_id 的插件通道不做。${PAID}`,
    format: 'responses',
    prompt: 'What is a major news headline from today? You must use the web_search tool.',
    apply: { tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' } },
    evidence: ['web_search_call', 'url_citation', 'web_search'],
  }),
]

/** 每家带官方文档。DeepSeek 官方无服务端内置搜索，不进名单。 */
export const BUILTIN_VENDOR_PROFILES: BuiltinVendorProfile[] = [
  {
    id: 'openai',
    source: 'https://developers.openai.com/api/docs/guides/tools',
    exact: ['gpt-5-search-api'],
    prefixes: ['gpt-4', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-6', 'o1', 'o3', 'o4'],
    cases: openaiCases,
  },
  {
    id: 'xai',
    source: 'https://docs.x.ai/developers/tools/overview',
    exact: [],
    prefixes: ['grok-'],
    cases: xaiCases,
  },
  {
    id: 'anthropic',
    source: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference',
    exact: [],
    prefixes: ['claude-'],
    cases: anthropicCases,
  },
  {
    id: 'qwen',
    source: 'https://help.aliyun.com/zh/model-studio/web-search',
    exact: [],
    prefixes: ['qwen-', 'qwen3', 'qwq-'],
    cases: qwenCases,
  },
  {
    id: 'kimi',
    source: 'https://platform.kimi.com/docs/guide/use-web-search',
    exact: [],
    prefixes: ['kimi-', 'moonshot-'],
    cases: kimiCases,
  },
  {
    id: 'glm',
    source: 'https://docs.bigmodel.cn/cn/guide/tools/web-search',
    exact: [],
    prefixes: ['glm-'],
    cases: glmCases,
  },
  {
    id: 'minimax',
    source: 'https://platform.minimaxi.com/docs/guides/server-tools',
    exact: [],
    prefixes: ['minimax-'],
    cases: minimaxCases,
  },
  {
    id: 'gemini',
    source: 'https://ai.google.dev/gemini-api/docs/google-search',
    exact: [],
    prefixes: ['gemini-'],
    cases: geminiCases,
  },
  {
    id: 'doubao',
    source: 'https://www.volcengine.com/docs/82379/1978533',
    exact: [],
    prefixes: ['doubao-', 'ep-'],
    cases: doubaoCases,
  },
]

const EXCLUDE_RE = /(?:^|[-_.])(?:embedding|tts|whisper|transcribe|moderation|dall-e|dalle|realtime)(?:[-_.]|$)/i

export function normalizeProbeModel(model: string): string {
  let s = String(model || '').trim().toLowerCase()
  if (!s) return ''
  const slash = s.lastIndexOf('/')
  if (slash >= 0) s = s.slice(slash + 1)
  return s
}

export function isExcludedProbeModel(normalized: string): boolean {
  return !normalized || EXCLUDE_RE.test(normalized)
}

export function matchBuiltinVendor(model: string): BuiltinVendor | null {
  const name = normalizeProbeModel(model)
  if (isExcludedProbeModel(name)) return null
  for (const p of BUILTIN_VENDOR_PROFILES) {
    if (p.exact.some(exact => exact === name)) return p.id
  }
  let best: { id: BuiltinVendor; len: number } | null = null
  for (const p of BUILTIN_VENDOR_PROFILES) {
    for (const prefix of p.prefixes) {
      if (name.startsWith(prefix) && (!best || prefix.length > best.len)) {
        best = { id: p.id, len: prefix.length }
      }
    }
  }
  return best?.id ?? null
}

function casesForMatch(model: string): BuiltinProbeCase[] {
  const name = normalizeProbeModel(model)
  if (isExcludedProbeModel(name)) return []
  const exactProfile = BUILTIN_VENDOR_PROFILES.find(p => p.exact.includes(name))
  if (exactProfile) {
    const dedicated = exactProfile.cases.filter(c => c.onlyExact?.includes(name))
    if (dedicated.length) return dedicated
  }
  const vendor = matchBuiltinVendor(model)
  if (!vendor) return []
  const profile = BUILTIN_VENDOR_PROFILES.find(p => p.id === vendor)
  if (!profile) return []
  return profile.cases.filter(c => !c.onlyExact)
}

export function matchBuiltinToolCases(model: string): BuiltinProbeCase[] {
  return casesForMatch(model)
}

export const ALL_BUILTIN_PROBE_CASES: BuiltinProbeCase[] = BUILTIN_VENDOR_PROFILES.flatMap(p => p.cases)

export function builtinCaseById(id: string): BuiltinProbeCase | undefined {
  return ALL_BUILTIN_PROBE_CASES.find(c => c.id === id)
}

export function applyBuiltinTool(body: Record<string, any>, spec: BuiltinProbeCase): void {
  // xAI Responses 的 input 示例是 [{role,content}]，不是 OpenAI 的 input_text 块
  if (spec.vendor === 'xai' && typeof body.input === 'string') {
    body.input = [{ role: 'user', content: body.input }]
  }
  if (spec.apply.tools) body.tools = spec.apply.tools
  if (spec.apply.tool_choice !== undefined) body.tool_choice = spec.apply.tool_choice
  if (spec.apply.extra) Object.assign(body, spec.apply.extra)
}

export function oracleNativeToolEvidence(data: unknown, spec: BuiltinProbeCase): ProbeCheck {
  const blob = JSON.stringify(data ?? '').toLowerCase()
  // 必须是 JSON 键/字符串值（"web_search"），避免正文或 prompt 回声里的 web_search 误判通过
  const hit = spec.evidence.find(token => blob.includes(`"${token.toLowerCase()}"`))
  if (hit) return probeCheck('native_tool', true, `响应含 ${hit}，已调用 ${spec.tool}`)
  return probeCheck('native_tool', false, `响应没有 ${spec.tool} 的调用或结果证据`)
}

export function oracleUnsupportedNativeTool(err: string): boolean {
  const e = String(err || '').toLowerCase()
  if (!/(tool|search|web_search|function|google_search|code_interpreter|image_generation|enable_search|联网|搜索)/i.test(e)) {
    return false
  }
  return /not support|unsupported|unknown tool|invalid tool|does not support|unrecognized|不支持|未支持|没有.*工具/.test(e)
}
