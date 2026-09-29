import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBuiltinTool,
  matchBuiltinToolCases,
  matchBuiltinVendor,
  normalizeProbeModel,
  oracleNativeToolEvidence,
  oracleUnsupportedNativeTool,
} from './builtin-tools.ts'

describe('normalizeProbeModel', () => {
  it('去空白、小写、去掉 vendor/ 前缀', () => {
    assert.equal(normalizeProbeModel('  OpenAI/GPT-4o  '), 'gpt-4o')
    assert.equal(normalizeProbeModel('anthropic/claude-sonnet-4'), 'claude-sonnet-4')
  })
})

describe('matchBuiltinVendor', () => {
  it('精确名先于前缀', () => {
    assert.equal(matchBuiltinVendor('gpt-5-search-api'), 'openai')
  })
  it('最长前缀命中', () => {
    assert.equal(matchBuiltinVendor('gpt-4o-mini'), 'openai')
    assert.equal(matchBuiltinVendor('grok-4.6'), 'xai')
    assert.equal(matchBuiltinVendor('claude-sonnet-4'), 'anthropic')
    assert.equal(matchBuiltinVendor('qwen-plus'), 'qwen')
    assert.equal(matchBuiltinVendor('qwen3.8-max'), 'qwen')
    assert.equal(matchBuiltinVendor('kimi-k2'), 'kimi')
    assert.equal(matchBuiltinVendor('glm-5'), 'glm')
    assert.equal(matchBuiltinVendor('MiniMax-M3'), 'minimax')
    assert.equal(matchBuiltinVendor('gemini-2.5-flash'), 'gemini')
    assert.equal(matchBuiltinVendor('doubao-1.5-pro'), 'doubao')
    assert.equal(matchBuiltinVendor('ep-20241201123456'), 'doubao')
  })
  it('排除非对话后缀，未命中返回 null', () => {
    assert.equal(matchBuiltinVendor('gpt-4o-mini-tts'), null)
    assert.equal(matchBuiltinVendor('text-embedding-3-small'), null)
    assert.equal(matchBuiltinVendor('whisper-1'), null)
    assert.equal(matchBuiltinVendor('deepseek-v3'), null)
    assert.equal(matchBuiltinVendor('probe-model'), null)
  })
})

describe('matchBuiltinToolCases', () => {
  it('gpt-4o 追加 OpenAI Responses 内置工具，不含 Chat 搜索模型', () => {
    const ids = matchBuiltinToolCases('gpt-4o').map(c => c.id)
    assert.ok(ids.includes('native-openai-web_search'))
    assert.ok(ids.includes('native-openai-code_interpreter'))
    assert.ok(ids.includes('native-openai-image_generation'))
    assert.ok(!ids.includes('native-openai-search-api'))
    assert.ok(ids.every(id => id.startsWith('native-openai-')))
  })
  it('openai/gpt-4o 去掉厂商前缀后同样命中', () => {
    assert.deepEqual(
      matchBuiltinToolCases('openai/gpt-4o').map(c => c.id),
      matchBuiltinToolCases('gpt-4o').map(c => c.id),
    )
  })
  it('gpt-5-search-api 只出 Chat 搜索模型用例', () => {
    const ids = matchBuiltinToolCases('gpt-5-search-api').map(c => c.id)
    assert.deepEqual(ids, ['native-openai-search-api'])
  })
  it('kimi-k2 只出 $web_search', () => {
    const ids = matchBuiltinToolCases('kimi-k2').map(c => c.id)
    assert.deepEqual(ids, ['native-kimi-web_search'])
  })
  it('embedding 模型不追加', () => {
    assert.deepEqual(matchBuiltinToolCases('text-embedding-3-small'), [])
  })
})

describe('oracleNativeToolEvidence', () => {
  const spec = matchBuiltinToolCases('gpt-4o').find(c => c.id === 'native-openai-web_search')!
  it('有 web_search_call 通过', () => {
    const check = oracleNativeToolEvidence({ output: [{ type: 'web_search_call' }] }, spec)
    assert.equal(check.passed, true)
  })
  it('仅文本 2xx 没有调用证据', () => {
    const check = oracleNativeToolEvidence({ output: [{ type: 'message', content: [{ text: 'hi' }] }] }, spec)
    assert.equal(check.passed, false)
  })
  it('xAI 只有 citations / url_citation 也算搜过', () => {
    const web = matchBuiltinToolCases('grok-4.7').find(c => c.id === 'native-xai-web_search')!
    assert.equal(oracleNativeToolEvidence({ citations: ['https://example.com/a'] }, web).passed, true)
    assert.equal(oracleNativeToolEvidence({
      output: [{ type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', url: 'https://example.com' }] }] }],
    }, web).passed, true)
  })
  it('正文提到工具名不算通过', () => {
    const check = oracleNativeToolEvidence({
      output: [{ type: 'message', content: [{ text: 'I used web_search_call / url_citation' }] }],
    }, spec)
    assert.equal(check.passed, false)
  })
})

describe('oracleNativeToolEvidence kimi', () => {
  const spec = matchBuiltinToolCases('kimi-k2').find(c => c.id === 'native-kimi-web_search')!
  it('正文回声 $web_search 不算通过', () => {
    const check = oracleNativeToolEvidence({
      choices: [{ message: { role: 'assistant', content: 'You must call the $web_search tool.' } }],
    }, spec)
    assert.equal(check.passed, false)
  })
  it('tool_calls 含 $web_search 通过', () => {
    const check = oracleNativeToolEvidence({
      choices: [{ message: { tool_calls: [{ type: 'function', function: { name: '$web_search' } }] } }],
    }, spec)
    assert.equal(check.passed, true)
  })
})

describe('oracleUnsupportedNativeTool', () => {
  it('明确不支持该工具记 unsupported', () => {
    assert.equal(oracleUnsupportedNativeTool('unknown tool: web_search is not supported'), true)
  })
  it('普通 4xx 不误判', () => {
    assert.equal(oracleUnsupportedNativeTool('invalid api key'), false)
  })
})

describe('applyBuiltinTool', () => {
  it('写入 tools / tool_choice，不改无关字段', () => {
    const spec = matchBuiltinToolCases('gpt-4o').find(c => c.id === 'native-openai-web_search')!
    const body: Record<string, unknown> = { model: 'gpt-4o', input: spec.prompt }
    applyBuiltinTool(body, spec)
    assert.deepEqual(body.tools, [{ type: 'web_search' }])
    assert.deepEqual(body.tool_choice, { type: 'web_search' })
    assert.equal(body.input, spec.prompt)
    assert.equal(body.temperature, undefined)
  })
  it('Grok 联网搜索用字符串 required 和 role/content input', () => {
    const spec = matchBuiltinToolCases('grok-4.7').find(c => c.id === 'native-xai-web_search')!
    const body: Record<string, unknown> = { model: 'grok-4.7', input: spec.prompt }
    applyBuiltinTool(body, spec)
    assert.deepEqual(body, {
      model: 'grok-4.7',
      input: [{ role: 'user', content: 'What is a major news headline from today?' }],
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
    })
  })
  it('Grok X 搜索同样不发对象 tool_choice', () => {
    const spec = matchBuiltinToolCases('grok-4.7').find(c => c.id === 'native-xai-x_search')!
    const body: Record<string, unknown> = { model: 'grok-4.7', input: spec.prompt }
    applyBuiltinTool(body, spec)
    assert.deepEqual(body.tools, [{ type: 'x_search' }])
    assert.equal(body.tool_choice, 'required')
    assert.deepEqual(body.input, [{ role: 'user', content: 'What are people saying about xAI on X?' }])
  })
  it('通义 Chat 把 enable_search 写到顶层', () => {
    const spec = matchBuiltinToolCases('qwen-plus').find(c => c.id === 'native-qwen-enable_search')!
    const body: Record<string, unknown> = { model: 'qwen-plus' }
    applyBuiltinTool(body, spec)
    assert.equal(body.enable_search, true)
    assert.deepEqual(body.search_options, { forced_search: true })
  })
})
