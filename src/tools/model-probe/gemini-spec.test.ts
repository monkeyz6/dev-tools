import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GEMINI_BASIC_ID, GEMINI_CACHE_CHARS, GEMINI_PROBE_CASES, GEMINI_PURE_PROMPT,
  fillProbeSelection, geminiAppendVersion, geminiBasicBody, geminiCachePrompt, geminiImageBody,
  geminiListedId, geminiMaxFirstBody, geminiMaxSecondBody, geminiMinimalPolicy, geminiBasicsMixed,
  geminiSearchBody, geminiStructuredBody, geminiSystemBody, geminiTemperatureBody, geminiThinkingBody,
  geminiToolBody, geminiTopPBody, geminiTurn1Body, geminiTurn2Body, geminiWithVersionNote, runGeminiProbe,
  scoreGeminiCacheHit, scoreGeminiMustReject, toggleProbeBasic, GEMINI_CACHE_ATTEMPTS,
  type GeminiRound,
} from './gemini-spec.ts'
import {
  PROBE_RED_PNG_B64, geminiGenerateContentUrl, geminiModelVersion, geminiReadUsage, geminiRootFromGenerateUrl,
  geminiStreamUrl, geminiThoughtsTokenCount, probeEmptyUsage, probeParamComboBody, probeProtocolOf,
  type ProbeSseEvent,
} from './protocol.ts'

const usage = (input: number, output: number, extra: Record<string, number> = {}) => ({
  candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: input, candidatesTokenCount: output, ...extra },
})

function http(status: number, data: unknown, extra: Partial<GeminiRound> = {}): GeminiRound {
  return {
    transport: 'http', status, data, text: '', usage: probeEmptyUsage(), events: [], duration: 12, errorText: '',
    ...extra,
  }
}

function sse(json: unknown, index = 1): ProbeSseEvent {
  return { index, event: 'message', id: '', data: '', json }
}

describe('Gemini 模型名', () => {
  it('只认四个精确 id，快照和大小写前缀按段处理', () => {
    assert.equal(geminiListedId('vendor/gemini-3.6-flash'), 'gemini-3.6-flash')
    assert.equal(geminiListedId('Gemini-4-Argon'), 'gemini-4-argon')
    assert.equal(geminiListedId('models/gemini-3.7-flash'), 'gemini-3.7-flash')
    assert.equal(geminiListedId('gemini-3.8-flash'), 'gemini-3.8-flash')
    assert.equal(geminiListedId('gemini-3.8-flash-2026-09-02'), null)
    assert.equal(geminiListedId('gemini-2.5-flash'), null)
  })

  it('minimal 只有 3.6 接受，argon / 3.8 / 3.7 必须拒绝', () => {
    assert.equal(geminiMinimalPolicy('gemini-3.6-flash'), 'accept')
    assert.equal(geminiMinimalPolicy('foo/gemini-4-argon'), 'reject')
    assert.equal(geminiMinimalPolicy('gemini-3.8-flash'), 'reject')
    assert.equal(geminiMinimalPolicy('GEMINI-3.7-FLASH'), 'reject')
    assert.equal(geminiMinimalPolicy('gemini-2.0-flash'), 'plain')
    assert.equal(geminiMinimalPolicy('gemini-3.6-flash-001'), 'plain')
  })
})

describe('Gemini 互斥勾选', () => {
  const other = ['chat-basic', 'responses-basic', 'anthropic-basic', 'temperature', 'image-input']

  it('打开 Gemini 清掉其它协议，并套上默认勾选', () => {
    const next = toggleProbeBasic({
      'chat-basic': true, temperature: true, 'image-input': true, 'gemini-basic': false,
    }, GEMINI_BASIC_ID, other)
    assert.equal(next['chat-basic'], false)
    assert.equal(next.temperature, false)
    assert.equal(next['image-input'], false)
    assert.equal(next[GEMINI_BASIC_ID], true)
    assert.equal(next['gemini-temperature'], true)
    assert.equal(next['gemini-thinking-high'], false)
    assert.equal(next['gemini-image'], false)
    assert.equal(next['gemini-search'], false)
  })

  it('打开其它协议只清 Gemini，不把用户改过的勾选恢复成默认', () => {
    const next = toggleProbeBasic({
      'chat-basic': false, temperature: false, 'responses-basic': true,
      'gemini-basic': true, 'gemini-temperature': true,
    }, 'chat-basic', other)
    assert.equal(next['chat-basic'], true)
    assert.equal(next.temperature, false)
    assert.equal(next['responses-basic'], true)
    assert.equal(next['gemini-basic'], false)
    assert.equal(next['gemini-temperature'], false)
  })

  it('关掉基础项只翻自己', () => {
    const next = toggleProbeBasic({ 'gemini-basic': true, 'gemini-temperature': true }, GEMINI_BASIC_ID, other)
    assert.equal(next['gemini-basic'], false)
    assert.equal(next['gemini-temperature'], true)
  })

  it('全选在三协议模式下不勾 Gemini', () => {
    const next = fillProbeSelection(
      { 'chat-basic': false, 'gemini-basic': false, 'gemini-temperature': true },
      ['chat-basic', 'temperature', 'gemini-basic', 'image-input'],
      true,
      false,
    )
    assert.equal(next['chat-basic'], true)
    assert.equal(next.temperature, true)
    assert.equal(next['image-input'], true)
    assert.equal(next['gemini-basic'], false)
    assert.equal(next['gemini-temperature'], false)
  })

  it('Gemini 模式下全选会勾上默认关闭的项', () => {
    const next = fillProbeSelection({ 'gemini-basic': true }, ['gemini-basic', 'gemini-thinking-high', 'gemini-image', 'gemini-search'], true, true)
    assert.equal(next['gemini-thinking-high'], true)
    assert.equal(next['gemini-image'], true)
    assert.equal(next['gemini-search'], true)
  })

  it('基础项同时为真时拒绝开跑', () => {
    assert.equal(geminiBasicsMixed({ 'gemini-basic': true, 'chat-basic': true }), true)
    assert.equal(geminiBasicsMixed({ 'gemini-basic': true, 'chat-basic': false, 'responses-basic': false, 'anthropic-basic': false }), false)
  })

  it('默认关闭的只有高档、图片和搜索', () => {
    assert.deepEqual(GEMINI_PROBE_CASES.filter(c => !c.defaultOn).map(c => c.id), [
      'gemini-thinking-high', 'gemini-image', 'gemini-search',
    ])
  })
})

describe('Gemini 请求体', () => {
  it('协议头只有 x-goog-api-key，基础体没有 model', () => {
    const headers = probeProtocolOf('gemini').headers('secret-key')
    assert.equal(headers['x-goog-api-key'], 'secret-key')
    assert.equal(headers.Authorization, undefined)
    const body = probeProtocolOf('gemini').baseBody('gemini-4-argon', 'Hi')
    assert.equal(body.model, undefined)
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Hi' }] }])
    assert.deepEqual(geminiBasicBody(), { contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }] })
  })

  it('combo 不把 OpenAI 参数写进 Gemini，另外三种协议仍带 temperature', () => {
    for (const format of ['chat', 'responses', 'anthropic'] as const) {
      const body = probeParamComboBody('probe-model', format, ['temperature'])
      assert.equal(body.model, 'probe-model')
      assert.equal(body.temperature, 0.2)
    }
    const gemini = probeParamComboBody('gemini-3.6-flash', 'gemini', ['temperature'])
    assert.equal(gemini.model, undefined)
    assert.equal(gemini.temperature, undefined)
    assert.equal(gemini.generationConfig, undefined)
    assert.deepEqual(gemini.contents, [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }])
  })

  it('图片没有 data: 前缀，搜索只有 google_search，思考不带 includeThoughts', () => {
    const image = geminiImageBody()
    const part = (image.contents as { parts: { inline_data: { data: string } }[] }[])[0].parts[0]
    assert.equal(part.inline_data.data, PROBE_RED_PNG_B64)
    assert.equal(part.inline_data.data.includes('data:'), false)
    const search = geminiSearchBody()
    assert.deepEqual(search.tools, [{ google_search: {} }])
    assert.equal(JSON.stringify(search).includes('url_context'), false)
    assert.equal(JSON.stringify(search).includes('tool_choice'), false)
    assert.equal(JSON.stringify(search).includes('toolConfig'), false)
    const thinking = geminiThinkingBody('minimal')
    assert.equal(JSON.stringify(thinking).includes('includeThoughts'), false)
    assert.equal((thinking.generationConfig as { thinkingConfig: { thinkingLevel: string } }).thinkingConfig.thinkingLevel, 'minimal')
  })

  it('结构化输出用大写类型，不带 additionalProperties', () => {
    const body = geminiStructuredBody()
    const schema = (body.generationConfig as { responseSchema: { type: string; properties: { ok: { type: string } } } }).responseSchema
    assert.equal(schema.type, 'OBJECT')
    assert.equal(schema.properties.ok.type, 'BOOLEAN')
    assert.equal(JSON.stringify(schema).includes('additionalProperties'), false)
  })

  it('缓存前缀至少 16384 字符，nonce 在最前；越界 topP 是 2', () => {
    const prompt = geminiCachePrompt('ABC')
    assert.equal(prompt.startsWith('nonce:ABC\n'), true)
    assert.ok(prompt.length >= GEMINI_CACHE_CHARS + 'nonce:ABC\n'.length)
    const top = geminiTopPBody(2)
    assert.equal((top.generationConfig as { topP: number }).topP, 2)
    assert.equal((top.generationConfig as { maxOutputTokens: number }).maxOutputTokens, 2048)
  })

  it('接受类 maxOutputTokens 是 2048，基础体和纯流式不写，截断第二发是 16', () => {
    const bodies = [
      geminiTemperatureBody(),
      geminiTopPBody(),
      geminiTopPBody(2),
      geminiMaxFirstBody(),
      geminiStructuredBody(),
      geminiToolBody(),
      geminiThinkingBody('low'),
      geminiThinkingBody('minimal'),
      geminiSystemBody(),
      geminiTurn1Body(),
      geminiImageBody(),
      geminiSearchBody(),
    ]
    for (const body of bodies) {
      assert.equal((body.generationConfig as { maxOutputTokens: number }).maxOutputTokens, 2048)
    }
    assert.equal(geminiBasicBody().generationConfig, undefined)
    assert.equal(geminiBasicBody(GEMINI_PURE_PROMPT).generationConfig, undefined)
    assert.equal((geminiMaxSecondBody().generationConfig as { maxOutputTokens: number }).maxOutputTokens, 16)
  })

  it('第二跳原样放入 content，不补 role', () => {
    const body = geminiTurn2Body(geminiBasicBody('remember'), { parts: [{ text: 'ack', thought: true }] })
    const contents = body.contents as Record<string, unknown>[]
    assert.equal('role' in contents[1], false)
    assert.deepEqual(contents[1], { parts: [{ text: 'ack', thought: true }] })
  })
})

describe('Gemini 读数与判定', () => {
  it('用量认 camel 与 snake，并拆开一层 data', () => {
    const camel = geminiReadUsage(usage(4, 0, { thoughtsTokenCount: 9 }))
    assert.equal(camel.input, 4)
    assert.equal(camel.output, 0)
    assert.equal(camel.cacheRead, null)
    const snake = geminiReadUsage({
      data: {
        candidates: [{}],
        usage_metadata: { prompt_token_count: 3, candidates_token_count: 1, total_cached_tokens: 8 },
      },
    })
    assert.equal(snake.input, 3)
    assert.equal(snake.output, 1)
    assert.equal(snake.cacheRead, 8)
  })

  it('modelVersion 和 thoughtsTokenCount 只改说明', () => {
    const cell = { status: 'failed', detail: '失败：基础请求' }
    const noted = geminiWithVersionNote(cell, { modelVersion: 'gemini-3.8-flash', usageMetadata: { thoughtsTokenCount: 12 } }, 200)
    assert.equal(noted.status, 'failed')
    assert.match(noted.detail, /modelVersion gemini-3.8-flash/)
    assert.match(noted.detail, /thoughtsTokenCount 12/)
    const missing = geminiWithVersionNote(cell, { candidates: [] }, 200)
    assert.match(missing.detail, /响应没有 modelVersion/)
    assert.equal(missing.status, 'failed')
    assert.equal(geminiAppendVersion('通过', { modelVersion: 'x' }, 400), '通过')
  })

  it('必须拒绝时，额度用尽那句 400 记失败', () => {
    const sentence = 'Could not finish the message because max_tokens or model output limit was reached'
    const scored = scoreGeminiMustReject(http(400, { error: { code: 400, message: sentence, status: 'INVALID_ARGUMENT' } }), 'thinkingLevel=minimal')
    assert.equal(scored.status, 'failed')
    assert.match(scored.detail, /被接受/)
  })

  it('缓存字段缺失、为 0、大于 0 三条路', () => {
    const roundOf = (data: unknown) => http(200, data, { usage: geminiReadUsage(data) })
    const base = { promptTokenCount: 20, candidatesTokenCount: 2 }
    const missing = roundOf(usage(20, 2))
    assert.equal(typeof missing.usage.input, 'number')
    assert.equal(typeof missing.usage.output, 'number')
    assert.equal(scoreGeminiCacheHit(missing).status, 'unsupported')
    assert.equal(scoreGeminiCacheHit(roundOf(usage(20, 2, { cachedContentTokenCount: 0 }))).status, 'expected')
    assert.equal(scoreGeminiCacheHit(roundOf({ usageMetadata: { ...base, totalCachedTokens: 6 } })).status, 'passed')
  })
})

describe('runGeminiProbe', () => {
  const deps = (model: string, rounds: GeminiRound[]) => {
    const sent: { url: string; body: Record<string, unknown>; stream?: boolean; retryOn429?: boolean }[] = []
    return {
      sent,
      run: (id: string) => runGeminiProbe(id, {
        model,
        root: 'https://generativelanguage.googleapis.com',
        rounds: 3,
        nonce: 'N1',
        stopped: () => false,
        send: async req => {
          sent.push({ url: req.url, body: req.body, stream: req.stream, retryOn429: req.retryOn429 })
          const next = rounds[sent.length - 1]
          if (!next) throw new Error('unexpected send')
          return next
        },
      }),
    }
  }

  it('maxOutputTokens 被点名拒绝时不发第二发', async () => {
    const harness = deps('gemini-3.8-flash', [
      http(400, { error: { message: 'maxOutputTokens is not supported', status: 'INVALID_ARGUMENT' } }),
    ])
    const out = await harness.run('gemini-max-output')
    assert.equal(harness.sent.length, 1)
    assert.equal(out.status, 'unsupported')
  })

  it('第二发的额度用尽 400 不记通过', async () => {
    const sentence = 'Could not finish the message because max_tokens or model output limit was reached'
    const harness = deps('gemini-4-argon', [
      http(200, usage(5, 1)),
      http(400, { error: { message: sentence, status: 'INVALID_ARGUMENT', code: 400 } }),
    ])
    const out = await harness.run('gemini-max-output')
    assert.equal(harness.sent.length, 2)
    assert.equal((harness.sent[1].body.generationConfig as { maxOutputTokens: number }).maxOutputTokens, 16)
    assert.equal(out.status, 'failed')
    assert.match(out.detail, /不记通过/)
  })

  it('finishReason=MAX_TOKENS 才通过', async () => {
    const harness = deps('gemini-3.6-flash', [
      http(200, usage(5, 1)),
      http(200, {
        candidates: [{ content: { parts: [{ text: '1' }] }, finishReason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
      }),
    ])
    const out = await harness.run('gemini-max-output')
    assert.equal(out.status, 'passed')
  })

  it('结束原因不是 MAX_TOKENS 先报原因，蛇形 MAX_TOKENS 通过，缺用量不记通过', async () => {
    const stop = deps('gemini-3.6-flash', [
      http(200, usage(5, 1)),
      http(200, {
        candidates: [{ content: { parts: [{ text: '1' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
      }),
    ])
    const stopOut = await stop.run('gemini-max-output')
    assert.equal(stopOut.status, 'failed')
    assert.match(stopOut.detail, /STOP/)
    assert.doesNotMatch(stopOut.detail, /缺少输入/)

    const absent = deps('gemini-3.6-flash', [
      http(200, usage(5, 1)),
      http(200, {
        candidates: [{ content: { parts: [{ text: '1' }] } }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
      }),
    ])
    const absentOut = await absent.run('gemini-max-output')
    assert.equal(absentOut.status, 'failed')
    assert.match(absentOut.detail, /缺失/)

    const snake = deps('gemini-3.6-flash', [
      http(200, usage(5, 1)),
      http(200, {
        candidates: [{ content: { parts: [{ text: '1' }] }, finish_reason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
      }),
    ])
    assert.equal((await snake.run('gemini-max-output')).status, 'passed')

    const bare = deps('gemini-3.6-flash', [
      http(200, usage(5, 1)),
      http(200, { candidates: [{ content: { parts: [{ text: '1' }] }, finishReason: 'MAX_TOKENS' }] }),
    ])
    const bareOut = await bare.run('gemini-max-output')
    assert.equal(bareOut.status, 'failed')
    assert.match(bareOut.detail, /缺少输入/)
  })

  it('流式要求同一个事件同时带两个用量', async () => {
    const split = deps('gemini-3.8-flash', [http(200, null, {
      events: [
        sse({ usageMetadata: { promptTokenCount: 3 } }),
        sse({ usageMetadata: { candidatesTokenCount: 1 } }, 2),
      ],
    })])
    assert.equal((await split.run('gemini-stream')).status, 'failed')
    const both = deps('gemini-3.8-flash', [http(200, null, {
      events: [sse({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } })],
    })])
    const out = await both.run('gemini-stream')
    assert.equal(out.status, 'passed')
    assert.match(both.sent[0].url, /:streamGenerateContent\?alt=sse$/)
  })

  it('搜索看 grounding，函数调用看名字', async () => {
    const search = deps('gemini-3.8-flash', [http(200, {
      ...usage(4, 2),
      candidates: [{
        content: { parts: [{ text: 'news' }] },
        groundingMetadata: { webSearchQueries: ['apollo'] },
      }],
    })])
    assert.equal((await search.run('gemini-search')).status, 'passed')
    const bare = deps('gemini-3.8-flash', [http(200, usage(4, 2))])
    assert.equal((await bare.run('gemini-search')).status, 'abnormal')
    const tool = deps('gemini-3.6-flash', [http(200, {
      candidates: [{ content: { parts: [{ functionCall: { name: 'get_weather', args: { city: 'Shanghai' } } }] } }],
      usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 3 },
    })])
    assert.equal((await tool.run('gemini-tool')).status, 'passed')
  })

  it('minimal 在 argon 上 400 通过，在 3.6 上 2xx 通过', async () => {
    const rejected = deps('gemini-4-argon', [http(400, { error: { message: 'thinkingLevel is not supported', status: 'INVALID_ARGUMENT' } })])
    assert.equal((await rejected.run('gemini-thinking-minimal')).status, 'passed')
    const accepted = deps('gemini-3.6-flash', [http(200, usage(2, 1))])
    assert.equal((await accepted.run('gemini-thinking-minimal')).status, 'passed')
  })

  it('minimal 在必须拒绝的型号上 2xx 记失败', async () => {
    for (const model of ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash']) {
      const harness = deps(model, [http(200, usage(2, 1))])
      const out = await harness.run('gemini-thinking-minimal')
      assert.equal(out.status, 'failed', model)
      assert.match(out.detail, /被接受/)
    }
  })

  it('minimal 的额度用尽 400 经用例记失败', async () => {
    const sentence = 'Could not finish the message because max_tokens or model output limit was reached'
    const harness = deps('gemini-3.7-flash', [http(400, { error: { message: sentence, status: 'INVALID_ARGUMENT', code: 400 } })])
    const out = await harness.run('gemini-thinking-minimal')
    assert.equal(out.status, 'failed')
    assert.match(out.detail, /被接受/)
  })

  it('topP 越界：2xx 失败，其它 4xx 通过，5xx 异常', async () => {
    const accepted = deps('gemini-3.8-flash', [http(200, usage(2, 1))])
    const passed = await accepted.run('gemini-top-p-range')
    assert.equal(passed.status, 'failed')
    assert.match(passed.detail, /被接受/)
    const rejected = deps('gemini-3.8-flash', [http(400, { error: { message: 'whatever', status: 'INVALID_ARGUMENT' } })])
    const denied = await rejected.run('gemini-top-p-range')
    assert.equal(denied.status, 'passed')
    assert.match(denied.detail, /非法 topP/)
    const down = deps('gemini-3.8-flash', [http(500, { error: { message: 'unavailable', status: 'UNAVAILABLE' } })])
    assert.equal((await down.run('gemini-top-p-range')).status, 'abnormal')
  })

  it('接受类 2xx 缺用量记失败，功能不成立时不改成缺用量', async () => {
    const temperature = deps('gemini-3.8-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })])
    const temp = await temperature.run('gemini-temperature')
    assert.equal(temp.status, 'failed')
    assert.match(temp.detail, /缺少输入\/输出 Token/)
    const top = deps('gemini-3.8-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })])
    assert.equal((await top.run('gemini-top-p')).status, 'failed')
    const ready = deps('gemini-3.8-flash', [http(200, usage(3, 1))])
    assert.equal((await ready.run('gemini-temperature')).status, 'passed')

    const plain = deps('my-model', [http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })])
    const think = await plain.run('gemini-thinking-low')
    assert.equal(think.status, 'failed')
    assert.match(think.detail, /thinkingLevel=low/)
    const plainOk = deps('my-model', [http(200, usage(3, 1))])
    assert.equal((await plainOk.run('gemini-thinking-low')).status, 'passed')

    const schema = deps('gemini-3.6-flash', [http(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })])
    const schemaOut = await schema.run('gemini-structured')
    assert.equal(schemaOut.status, 'failed')
    assert.match(schemaOut.detail, /缺少输入\/输出 Token/)
    const badJson = deps('gemini-3.6-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'nope' }] } }] })])
    const bad = await badJson.run('gemini-structured')
    assert.equal(bad.status, 'failed')
    assert.match(bad.detail, /JSON/)
    assert.doesNotMatch(bad.detail, /缺少输入/)

    const tool = deps('gemini-3.6-flash', [http(200, { candidates: [{ content: { parts: [{ functionCall: { name: 'get_weather', args: {} } }] } }] })])
    const toolOut = await tool.run('gemini-tool')
    assert.equal(toolOut.status, 'failed')
    assert.match(toolOut.detail, /缺少输入\/输出 Token/)
    const toolMiss = deps('gemini-3.6-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'hi' }] } }] })])
    assert.doesNotMatch((await toolMiss.run('gemini-tool')).detail, /缺少输入/)

    const image = deps('gemini-3.6-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'red' }] } }] })])
    const imageOut = await image.run('gemini-image')
    assert.equal(imageOut.status, 'failed')
    assert.match(imageOut.detail, /缺少输入\/输出 Token/)

    const search = deps('gemini-3.8-flash', [http(200, {
      candidates: [{ content: { parts: [{ text: 'news' }] }, groundingMetadata: { webSearchQueries: ['apollo'] } }],
    })])
    const searchOut = await search.run('gemini-search')
    assert.equal(searchOut.status, 'failed')
    assert.match(searchOut.detail, /缺少输入\/输出 Token/)
    const bare = deps('gemini-3.8-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'news' }] } }] })])
    assert.equal((await bare.run('gemini-search')).status, 'abnormal')

    const turn = deps('gemini-3.8-flash', [
      http(200, usage(4, 1)),
      http(200, { candidates: [{ content: { parts: [{ text: 'The word is ORBIT.' }] } }] }),
    ])
    const turnOut = await turn.run('gemini-multi-turn')
    assert.equal(turn.sent.length, 2)
    assert.equal(turnOut.status, 'failed')
    assert.match(turnOut.detail, /多轮对话/)
  })

  it('Token 稳定性把传输失败记成异常并停止后续次数', async () => {
    const cases: Array<{ round: GeminiRound; detail: RegExp }> = [
      { round: http(500, { ...usage(9, 1), error: { message: 'unavailable', status: 'UNAVAILABLE' } }), detail: /HTTP 500/ },
      { round: http(401, { error: { message: 'bad key', status: 'UNAUTHENTICATED' } }), detail: /鉴权/ },
      { round: http(429, { error: { message: 'slow', status: 'RESOURCE_EXHAUSTED' } }), detail: /HTTP 429/ },
      { round: http(0, null, { transport: 'timeout', status: null }), detail: /超时/ },
    ]
    for (const item of cases) {
      const later = http(200, usage(1, 1))
      const harness = deps('gemini-3.8-flash', [item.round, later, later])
      const out = await harness.run('gemini-token')
      assert.equal(harness.sent.length, 1)
      assert.equal(out.status, 'abnormal')
      assert.match(out.detail, item.detail)
    }
  })

  it('Token 稳定性缺 promptTokenCount 记失败并停止，三次相同才通过', async () => {
    const missing = deps('gemini-3.8-flash', [
      http(200, usage(7, 1)),
      http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
      http(500, { error: { message: 'unavailable' } }),
    ])
    const missed = await missing.run('gemini-token')
    assert.equal(missing.sent.length, 2)
    assert.equal(missed.status, 'failed')
    assert.match(missed.detail, /promptTokenCount/)
    assert.deepEqual(missed.tokenValues, [7])

    const stable = deps('gemini-3.6-flash', [http(200, usage(7, 1)), http(200, usage(7, 9)), http(200, usage(7, 2))])
    const ok = await stable.run('gemini-token')
    assert.equal(stable.sent.length, 3)
    assert.equal(ok.status, 'passed')
    assert.deepEqual(ok.tokenValues, [7, 7, 7])

    const drift = deps('gemini-3.6-flash', [http(200, usage(7, 1)), http(200, usage(8, 1)), http(200, usage(7, 1))])
    const bad = await drift.run('gemini-token')
    assert.equal(drift.sent.length, 3)
    assert.equal(bad.status, 'failed')
    assert.match(bad.detail, /不一致/)
  })

  it('Token 稳定性其它非 2xx 记 HTTP 失败并停止，正文里的计数不参与比较', async () => {
    for (const status of [400, 404, 422, 302]) {
      const later = http(200, usage(7, 1))
      const harness = deps('gemini-3.8-flash', [
        http(status, {
          error: { message: 'bad request', status: 'INVALID_ARGUMENT' },
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1 },
        }),
        later,
        later,
      ])
      const out = await harness.run('gemini-token')
      assert.equal(harness.sent.length, 1, String(status))
      assert.equal(out.status, 'failed', String(status))
      assert.match(out.detail, new RegExp(`HTTP ${status}`))
      assert.doesNotMatch(out.detail, /promptTokenCount/)
      assert.deepEqual(out.tokenValues, [])
    }
  })

  it('名单内必须接受的 2xx 缺用量记失败', async () => {
    const bare = () => http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
    for (const id of ['gemini-thinking-low', 'gemini-thinking-medium', 'gemini-thinking-high']) {
      const harness = deps('gemini-3.8-flash', [bare()])
      const out = await harness.run(id)
      assert.equal(out.status, 'failed', id)
      assert.match(out.detail, /缺少输入\/输出 Token/)
    }
    const basic = deps('gemini-3.6-flash', [bare()])
    const basicOut = await basic.run('gemini-basic')
    assert.equal(basicOut.status, 'failed')
    assert.match(basicOut.detail, /缺少输入\/输出 Token/)
    const minimal = deps('gemini-3.6-flash', [bare()])
    const minOut = await minimal.run('gemini-thinking-minimal')
    assert.equal(minOut.status, 'failed')
    assert.match(minOut.detail, /缺少输入\/输出 Token/)
  })

  it('System 先看指令，缺 SYSTEM_OK 不被缺用量盖住', async () => {
    const both = deps('gemini-3.8-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'hello' }] } }] })])
    const missed = await both.run('gemini-system')
    assert.equal(missed.status, 'failed')
    assert.match(missed.detail, /SYSTEM_OK/)
    assert.doesNotMatch(missed.detail, /缺少输入/)

    const obeyed = deps('gemini-3.8-flash', [http(200, { candidates: [{ content: { parts: [{ text: 'SYSTEM_OK' }] } }] })])
    const noUsage = await obeyed.run('gemini-system')
    assert.equal(noUsage.status, 'failed')
    assert.match(noUsage.detail, /缺少输入/)

    const ready = deps('gemini-3.8-flash', [http(200, {
      candidates: [{ content: { parts: [{ text: 'SYSTEM_OK' }] } }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 },
    })])
    assert.equal((await ready.run('gemini-system')).status, 'passed')
  })

  it('带斜杠的模型名原样进路径，必须拒绝的 404 不算通过', async () => {
    const rejected = deps('google/gemini-3.8-flash', [http(400, { error: { message: 'thinkingLevel is not supported', status: 'INVALID_ARGUMENT' } })])
    const pass = await rejected.run('gemini-thinking-minimal')
    assert.equal(pass.status, 'passed')
    assert.match(rejected.sent[0].url, /\/models\/google%2Fgemini-3\.8-flash:generateContent$/)

    const missing = deps('google/gemini-3.8-flash', [http(404, { error: { code: 404, message: 'models/google/gemini-3.8-flash is not found', status: 'NOT_FOUND' } })])
    const out = await missing.run('gemini-thinking-minimal')
    assert.equal(out.status, 'failed')
    assert.match(out.detail, /404/)
    assert.doesNotMatch(out.detail, /通过/)
    assert.match(missing.sent[0].url, /google%2Fgemini-3\.8-flash/)

    const range = deps('google/gemini-3.8-flash', [http(404, { error: { message: 'not found', status: 'NOT_FOUND' } })])
    assert.equal((await range.run('gemini-top-p-range')).status, 'passed')
    assert.match(range.sent[0].url, /google%2Fgemini-3\.8-flash/)
  })

  it('隐式缓存第一次失败不再发第二次', async () => {
    const harness = deps('gemini-3.8-flash', [http(500, { error: { message: 'unavailable', status: 'UNAVAILABLE' } })])
    const out = await harness.run('gemini-cache')
    assert.equal(harness.sent.length, 1)
    assert.equal(out.status, 'abnormal')
  })

  it('纯流式不带 generationConfig，带上限的流式仍发 2048', async () => {
    const events = [sse({ usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 } })]
    const pure = deps('gemini-3.8-flash', [http(200, usage(2, 1), { events })])
    await pure.run('gemini-stream-pure')
    assert.equal(pure.sent.length, 1)
    assert.equal(pure.sent[0].stream, true)
    assert.equal(pure.sent[0].body.generationConfig, undefined)
    assert.deepEqual(pure.sent[0].body, geminiBasicBody(GEMINI_PURE_PROMPT))
    assert.match(pure.sent[0].url, /\/models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse$/)

    const capped = deps('gemini-3.8-flash', [http(200, usage(2, 1), { events })])
    await capped.run('gemini-stream')
    assert.equal((capped.sent[0].body.generationConfig as { maxOutputTokens: number }).maxOutputTokens, 2048)
    assert.match(capped.sent[0].url, /:streamGenerateContent\?alt=sse$/)
  })

  it('流式正文是 SSE 原文时，说明仍能读到后一帧的 modelVersion', async () => {
    const events = [
      sse({ modelVersion: 'gemini-3.6-flash', candidates: [{ content: { parts: [{ text: 'O' }] } }] }, 1),
      sse({
        modelVersion: 'gemini-3.8-flash',
        candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1, thoughtsTokenCount: 7 },
      }, 2),
    ]
    const harness = deps('gemini-3.8-flash', [http(200, 'data: not-json', { events })])
    const out = await harness.run('gemini-stream')
    assert.equal(out.status, 'passed')
    assert.equal(geminiModelVersion(out.data), 'gemini-3.8-flash')
    assert.equal(geminiThoughtsTokenCount(out.data), 7)
    const noted = geminiAppendVersion(out.detail, out.data, out.httpStatus)
    assert.match(noted, /modelVersion gemini-3.8-flash/)
    assert.match(noted, /thoughtsTokenCount 7/)
    assert.doesNotMatch(noted, /响应没有 modelVersion/)
  })

  it('错误码用例打到 probe-no-such-model，404 和带错误对象的 503 都通过', async () => {
    const missing = deps('google/gemini-3.8-flash', [http(404, { error: { message: 'not found', status: 'NOT_FOUND', code: 404 } })])
    const missingOut = await missing.run('gemini-error')
    assert.equal(missing.sent.length, 1)
    assert.match(missing.sent[0].url, /\/models\/probe-no-such-model:generateContent$/)
    assert.doesNotMatch(missing.sent[0].url, /gemini-3\.8-flash/)
    assert.equal(missingOut.status, 'passed')
    assert.match(missingOut.detail, /通过：HTTP 404/)

    const relay = deps('gemini-3.8-flash', [http(503, {
      error: { code: 'model_not_found', message: '分组 pro 下模型 probe-no-such-model 无可用渠道', type: 'novafare_api_error' },
    })])
    const relayOut = await relay.run('gemini-error')
    assert.equal(relayOut.status, 'passed')
    assert.match(relayOut.detail, /通过：HTTP 503/)
    assert.doesNotMatch(relayOut.detail, /异常/)

    const bare = deps('gemini-3.8-flash', [http(503, 'upstream unavailable')])
    const bareOut = await bare.run('gemini-error')
    assert.equal(bareOut.status, 'abnormal')
    assert.match(bareOut.detail, /HTTP 503/)

    const auth = deps('gemini-3.8-flash', [http(401, { error: { message: 'bad key', status: 'UNAUTHENTICATED' } })])
    assert.equal((await auth.run('gemini-error')).status, 'abnormal')
    const accepted = deps('gemini-3.8-flash', [http(200, usage(2, 1))])
    assert.equal((await accepted.run('gemini-error')).status, 'failed')
  })

  it('并发三发且遇 429 不重试', async () => {
    const ok = http(200, usage(2, 1))
    const harness = deps('gemini-3.8-flash', [ok, ok, ok])
    const out = await harness.run('gemini-concurrency')
    assert.equal(harness.sent.length, 3)
    assert.deepEqual(harness.sent.map(item => item.retryOn429), [false, false, false])
    assert.equal(out.status, 'passed')
  })

  it('并发失败时决定性响应是没成功的那一发', async () => {
    const down = http(500, { error: { message: 'down', status: 'UNAVAILABLE' } })
    const ok = http(200, usage(2, 1))
    const harness = deps('gemini-3.8-flash', [ok, down, ok])
    const out = await harness.run('gemini-concurrency')
    assert.equal(out.status, 'failed')
    assert.equal(out.httpStatus, 500)
    assert.equal((out.data as { error: { message: string } }).error.message, 'down')

    const bare = http(200, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
    const partial = deps('gemini-3.8-flash', [ok, bare, ok])
    const missing = await partial.run('gemini-concurrency')
    assert.equal(missing.status, 'failed')
    assert.equal(missing.httpStatus, 200)
    assert.equal(missing.usage?.input, null)
  })

  it('隐式缓存第二次读到缓存字段记通过', async () => {
    const harness = deps('gemini-3.8-flash', [
      http(200, usage(20, 2)),
      http(200, usage(20, 2, { cachedContentTokenCount: 12 })),
    ])
    const out = await harness.run('gemini-cache')
    assert.equal(harness.sent.length, 2)
    assert.equal(out.status, 'passed')
    assert.match(out.detail, /12/)
  })

  it('隐式缓存最多发 5 次：第四次才命中仍通过，命中即停', async () => {
    const harness = deps('gemini-3.8-flash', [
      http(200, usage(20, 2)),
      http(200, usage(20, 2)),
      http(200, usage(20, 2, { cachedContentTokenCount: 0 })),
      http(200, usage(20, 2, { cachedContentTokenCount: 9 })),
    ])
    const out = await harness.run('gemini-cache')
    assert.equal(harness.sent.length, 4)
    assert.equal(out.status, 'passed')
    assert.match(out.detail, /第四次读取缓存 9/)
    assert.deepEqual(out.cache, { hits: 1, total: 4, reads: [0, 0, 0, 9] })
  })

  it('隐式缓存 5 次都没命中：带过字段记符合预期，一次都没带记不支持', async () => {
    const zero = deps('gemini-3.8-flash', [
      http(200, usage(20, 2)),
      ...[0, 0, 0, 0].map(() => http(200, usage(20, 2, { cachedContentTokenCount: 0 }))),
    ])
    const expected = await zero.run('gemini-cache')
    assert.equal(zero.sent.length, GEMINI_CACHE_ATTEMPTS)
    assert.equal(expected.status, 'expected')

    const none = deps('gemini-3.8-flash', [1, 2, 3, 4, 5].map(() => http(200, usage(20, 2))))
    const unsupported = await none.run('gemini-cache')
    assert.equal(none.sent.length, GEMINI_CACHE_ATTEMPTS)
    assert.equal(unsupported.status, 'unsupported')
  })

  it('隐式缓存中途出错按这一轮判，不再继续', async () => {
    const harness = deps('gemini-3.8-flash', [
      http(200, usage(20, 2)),
      http(200, usage(20, 2, { cachedContentTokenCount: 0 })),
      http(500, { error: { message: 'unavailable', status: 'UNAVAILABLE' } }),
    ])
    const out = await harness.run('gemini-cache')
    assert.equal(harness.sent.length, 3)
    assert.equal(out.status, 'abnormal')
  })
})

describe('Gemini 地址只拼一次', () => {
  const model = 'google/gemini-3.8-flash'
  const once = 'https://generativelanguage.googleapis.com/v1beta/models/google%2Fgemini-3.8-flash:generateContent'

  it('根已带 /v1beta、或贴了完整地址时，剥根再拼仍是同一条', () => {
    for (const root of [
      'https://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com/v1beta',
      'https://generativelanguage.googleapis.com/v1beta/',
      'https://generativelanguage.googleapis.com/V1BETA/v1beta',
      'https://generativelanguage.googleapis.com/v1beta/models',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/v1beta/models/old:generateContent',
    ]) {
      const url = geminiGenerateContentUrl(root, model)
      assert.equal(url, once, root)
      assert.equal(geminiGenerateContentUrl(geminiRootFromGenerateUrl(url), model), url)
    }
    assert.equal(
      geminiStreamUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-3.8-flash'),
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
    )
  })

  it('以 /v1 结尾的根保留，不改成主机根', () => {
    const url = geminiGenerateContentUrl('https://gateway.example/v1', model)
    assert.equal(url, 'https://gateway.example/v1/v1beta/models/google%2Fgemini-3.8-flash:generateContent')
    assert.equal(geminiGenerateContentUrl(geminiRootFromGenerateUrl(url), model), url)
  })
})
