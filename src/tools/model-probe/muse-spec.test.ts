import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MUSE_SPEC_CASES, MUSE_SPEC_GROUPS, matchMuseSpecCases, museBeepCount, museSpecCaseById, museSpecContext,
  museAdaptComboBody, oracleMuseBeeps, oracleMuseBlue, oracleMuseCode, oracleMuseUsageFields, probeUnionMuseSpecCases, scoreMuseSpecReject,
  scoreMuseSpecReply,
} from './muse-spec.ts'
import { MUSE_BEEP_MS, MUSE_BLUE_MP4_B64, MUSE_GAP_MS, MUSE_WAV_SAMPLE_RATE, museBeepWavBytes, musePdfBase64 } from './muse-media.ts'
import { signalsFromProbeLogs, type ProbeOriginLog } from './origin.ts'
import {
  PROBE_CLAUDE5_CAP, claudeProbeCap, decideFamily, claudeSchemaCap, isMuseWonderModel, museForcedToolChoiceBlocked, probeToolChoiceFallbackNote,
} from './profiles.ts'
import { PROBE_DEFAULT_CAP, probeNestReasoningEffort, probeParamComboBody, probeParamMatched, probeSoleParamMatch, setProbeAnthropicCapField } from './protocol.ts'
import { scoreExpectedReject, scoreTopPRange } from './negative.ts'
import { applyBuiltinTool, builtinCaseById, matchBuiltinToolCases, oracleNativeToolEvidence } from './builtin-tools.ts'

const ctx = { code: 'MW-ABC234', beeps: 3 }

/** 每 10ms 一个窗口，峰值超过阈值记为有声；数上升沿。 */
const countBeeps = (buf: Buffer): number => {
  const win = MUSE_WAV_SAMPLE_RATE / 100
  const samples = (buf.length - 44) / 2
  let segments = 0
  let loud = false
  for (let s = 0; s < samples; s += win) {
    let peak = 0
    for (let k = s; k < Math.min(samples, s + win); k++) peak = Math.max(peak, Math.abs(buf.readInt16LE(44 + k * 2)))
    const now = peak > 3000
    if (now && !loud) segments++
    loud = now
  }
  return segments
}
const fromDataUrl = (url: string): Buffer => Buffer.from(String(url).split(',')[1], 'base64')

describe('isMuseWonderModel', () => {
  it('官方 id、带日期快照、OpenRouter 名都算', () => {
    assert.equal(isMuseWonderModel('muse-wonder-1.0'), true)
    assert.equal(isMuseWonderModel('MUSE-WONDER-1.0'), true)
    assert.equal(isMuseWonderModel(' muse-wonder-1.0-2026-10-12 '), true)
    assert.equal(isMuseWonderModel('meta/muse-wonder'), true)
    assert.equal(isMuseWonderModel('meta/muse-wonder-1.0'), true)
  })

  it('Spark、Full、相近名字不算', () => {
    assert.equal(isMuseWonderModel('muse-spark-1.3'), false)
    assert.equal(isMuseWonderModel('muse-wonder-full'), false)
    // Wonder Full 若沿用 1.0 前缀，也不能被 muse-wonder-1.0- / 1.0. 盖住
    for (const full of ['muse-wonder-1.0-full', 'muse-wonder-1.0.full', 'meta/muse-wonder-1.0-full-2026-10-12', 'MUSE-WONDER-1.0-FULL']) {
      assert.equal(isMuseWonderModel(full), false, full)
      assert.equal(matchMuseSpecCases(full).length, 0, full)
      assert.equal(matchBuiltinToolCases(full).length, 0, full)
    }
    // 只认独立的 full 段，日期快照等照常命中
    assert.equal(isMuseWonderModel('muse-wonder-1.0-2026-10-12'), true)
    assert.equal(isMuseWonderModel('muse-wonder-1.01'), false)
    assert.equal(isMuseWonderModel('muse-wonder-2.0'), false)
    assert.equal(isMuseWonderModel(''), false)
  })
})

describe('Muse 通用用例适配', () => {
  it('输出额度提到 2048，其它模型不变', () => {
    assert.equal(claudeProbeCap('muse-wonder-1.0'), PROBE_CLAUDE5_CAP)
    assert.equal(claudeSchemaCap('meta/muse-wonder'), PROBE_CLAUDE5_CAP)
    assert.equal(claudeProbeCap('gpt-5'), PROBE_DEFAULT_CAP)
    assert.equal(claudeProbeCap('muse-spark-1.3'), PROBE_DEFAULT_CAP)
  })

  it('只认官方那句 only auto 的 tool_choice 错误，且只对 muse 生效', () => {
    const err = JSON.stringify({ error: { message: 'only "auto" is supported for `tool_choice`', type: 'invalid_request_error' } })
    assert.equal(museForcedToolChoiceBlocked(err, 'muse-wonder-1.0'), true)
    assert.equal(museForcedToolChoiceBlocked(err, 'gpt-5'), false)
    assert.equal(museForcedToolChoiceBlocked('tool_choice is invalid', 'muse-wonder-1.0'), false)
    assert.equal(museForcedToolChoiceBlocked('only auto models are supported', 'muse-wonder-1.0'), false)
    // 带 tool_choice 的近义句也不认，只认 only "auto" is supported / allowed
    assert.equal(museForcedToolChoiceBlocked('tool_choice is invalid; only auto models are supported', 'muse-wonder-1.0'), false)
    assert.equal(museForcedToolChoiceBlocked('tool_choice: only automatic selection works', 'muse-wonder-1.0'), false)
    assert.equal(museForcedToolChoiceBlocked("Invalid tool_choice: only 'auto' is allowed", 'muse-wonder-1.0'), true)
    assert.match(probeToolChoiceFallbackNote('muse-wonder-1.0'), /Muse Wonder/)
    assert.match(probeToolChoiceFallbackNote('claude-opus-5-5'), /Claude 5\.x/)
    assert.match(probeToolChoiceFallbackNote('gpt-5'), /thinking 模式/)
  })

  it('Responses 的 reasoning_effort 挪进 reasoning.effort', () => {
    const body = probeParamComboBody('muse-wonder-1.0', 'responses', ['reasoning_effort', 'temperature'])
    assert.equal(body.reasoning_effort, 'low')
    const nested = probeNestReasoningEffort(body)
    assert.equal(nested.reasoning_effort, undefined)
    assert.deepEqual(nested.reasoning, { effort: 'low' })
    assert.equal(nested.temperature, 0.2)
    assert.deepEqual(probeNestReasoningEffort({ reasoning: { summary: 'auto' }, reasoning_effort: 'high' }).reasoning, { summary: 'auto', effort: 'high' })
    const plain = { model: 'x', input: 'hi' }
    assert.equal(probeNestReasoningEffort(plain), plain)
  })

  it('combo 改写只作用于 muse 的 Responses；Chat、Messages、其它模型保持顶层 reasoning_effort', () => {
    const combo = (model: string, format: 'chat' | 'responses' | 'anthropic') =>
      museAdaptComboBody(model, format, probeParamComboBody(model, format, ['reasoning_effort']))
    assert.deepEqual(combo('muse-wonder-1.0', 'responses').reasoning, { effort: 'low' })
    assert.equal(combo('muse-wonder-1.0', 'responses').reasoning_effort, undefined)
    for (const format of ['chat', 'anthropic'] as const) {
      const b = combo('muse-wonder-1.0', format)
      assert.equal(b.reasoning_effort, 'low', format)
      assert.equal(b.reasoning, undefined, format)
    }
    for (const model of ['gpt-5', 'muse-spark-1.3']) {
      const b = combo(model, 'responses')
      assert.equal(b.reasoning_effort, 'low', model)
      assert.equal(b.reasoning, undefined, model)
    }
  })

  it('reasoning.effort 的报错也归给 reasoning_effort', () => {
    const nested = "invalid value for 'reasoning.effort'"
    assert.equal(probeParamMatched('reasoning_effort', nested, 'responses'), true)
    assert.equal(probeParamMatched('reasoning_effort', 'unknown parameter reasoning_effort', 'responses'), true)
    assert.equal(probeParamMatched('reasoning_effort', 'unknown parameter reasoning_effort', 'anthropic'), true)
    assert.equal(probeParamMatched('reasoning_effort', 'output_config.effort is invalid', 'anthropic'), false)
    // Anthropic 上 reasoning.effort 的报错仍只归 effort（改动前的口径），两者不能同时命中
    assert.equal(probeParamMatched('reasoning_effort', nested, 'anthropic'), false)
    assert.equal(probeParamMatched('effort', nested, 'anthropic'), true)
    assert.equal(probeSoleParamMatch(['reasoning_effort', 'effort'], nested, 'anthropic'), 'effort')
    // Responses 的组合里没有 effort（只跑 Anthropic），reasoning.effort 归给 reasoning_effort
    assert.equal(probeSoleParamMatch(['reasoning_effort', 'temperature'], nested, 'responses'), 'reasoning_effort')
  })
})

describe('Muse 的家族判定', () => {
  const url = 'https://relay.example.com'
  const museLogs = (model: string, responseModel = model): ProbeOriginLog[] => [
    {
      url: `${url}/v1/responses`, status: 200, resultKey: 'spec-muse-responses-effort-max@responses', format: 'responses',
      requestBody: { model, reasoning: { effort: 'max' } },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        id: 'resp-max', object: 'response', model: responseModel, status: 'completed', reasoning: { effort: 'max' },
        usage: { input_tokens: 10, output_tokens: 40, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 36 } },
      },
      usage: { input: 10 },
    },
    {
      url: `${url}/v1/messages`, status: 200, resultKey: 'anthropic-basic', format: 'anthropic',
      requestBody: { model },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: { type: 'message', model: responseModel, stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 5, output_tokens: 1 } },
      usage: { input: 5 },
    },
  ]

  it('reasoning_tokens、reasoning.effort、stop_reason 都是官方规格，不把 muse 判成 GPT 推理或冲突', () => {
    const signals = signalsFromProbeLogs({ requestModel: 'muse-wonder-1.0', baseUrl: url, logs: museLogs('muse-wonder-1.0') })
    // 前提：这些信号确实被采到了
    assert.equal(signals.flags.reasoningTokens, true)
    assert.equal(signals.flags.reasoningEffort, true)
    const family = decideFamily(signals)
    assert.equal(family.label, 'Muse Wonder')
    assert.equal(family.family, 'unknown')
    assert.equal(family.profile, 'unknown')
    assert.equal(family.conflict, false)
    assert.ok(family.reasons.every(r => !r.includes('用量含 reasoning_tokens') && !r.includes('成功响应含 reasoning.effort')), family.reasons.join('|'))
    // 豁免只对 muse：同一份 Responses 响应换成没有名字特征的模型，仍按原规则判 GPT 推理（e2e「多模态与用量」就是这条路径）
    const onlyResponses = (model: string) => museLogs(model).slice(0, 1)
    assert.equal(decideFamily(signalsFromProbeLogs({ requestModel: 'some-model', baseUrl: url, logs: onlyResponses('some-model') })).label, 'GPT 推理')
    assert.equal(decideFamily(signalsFromProbeLogs({ requestModel: 'muse-wonder-1.0', baseUrl: url, logs: onlyResponses('muse-wonder-1.0') })).label, 'Muse Wonder')
  })

  it('响应里的模型名换成了 GPT / Claude：记不确定并标冲突', () => {
    for (const swapped of ['gpt-5', 'claude-sonnet-4-5']) {
      const family = decideFamily(signalsFromProbeLogs({ requestModel: 'muse-wonder-1.0', baseUrl: url, logs: museLogs('muse-wonder-1.0', swapped) }))
      assert.equal(family.label, '不确定', swapped)
      assert.equal(family.conflict, true, swapped)
      assert.ok(family.reasons.includes('响应里的模型名不是 Muse'), swapped)
    }
  })
})

describe('scoreExpectedReject', () => {
  it('其它 4xx 通过，2xx 失败，鉴权 / 限流 / 5xx / 超时异常', () => {
    assert.equal(scoreExpectedReject(400, 'http', 'stop').status, 'passed')
    assert.match(scoreExpectedReject(400, 'http', 'stop').detail, /stop 返回 HTTP 400/)
    assert.equal(scoreExpectedReject(200, 'http', 'stop').status, 'failed')
    assert.match(scoreExpectedReject(200, 'http', 'stop').detail, /stop 被接受/)
    for (const s of [401, 403, 408, 429, 500, 503, 302]) assert.equal(scoreExpectedReject(s, 'http', 'x').status, 'abnormal')
    assert.equal(scoreExpectedReject(0, 'timeout', 'x').status, 'abnormal')
    assert.equal(scoreExpectedReject(null, 'network', 'x').status, 'abnormal')
  })

  it('top_p 越界沿用原来的文案', () => {
    assert.match(scoreTopPRange(400, 'http').detail, /非法 top_p 返回 HTTP 400/)
    assert.match(scoreTopPRange(200, 'http').detail, /top_p=2 被接受/)
  })
})

describe('scoreMuseSpecReject', () => {
  const limit = { error: { message: 'Could not finish the message because max_tokens or model output limit was reached.', type: 'invalid_request_error' } }

  it('400 正文是额度用尽：参数已被接受，记失败', () => {
    const r = scoreMuseSpecReject({ status: 400, transport: 'http', data: limit, errorText: JSON.stringify(limit.error) }, 'stop')
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /stop 已被接受，HTTP 400 是输出额度用尽/)
    assert.equal(scoreMuseSpecReject({ status: 400, transport: 'http', errorText: limit.error.message }, 'stop').status, 'failed')
  })

  it('其它 400 记通过并带上错误正文；2xx、5xx、超时沿用通用规则', () => {
    const r = scoreMuseSpecReject({ status: 400, transport: 'http', data: { error: { message: "Unsupported parameter: 'stop'" } }, errorText: "Unsupported parameter: 'stop'" }, 'stop')
    assert.equal(r.status, 'passed')
    assert.match(r.detail, /stop 返回 HTTP 400：Unsupported parameter: 'stop'/)
    assert.equal(scoreMuseSpecReject({ status: 200, transport: 'http', data: { usage: {} } }, 'stop').status, 'failed')
    assert.equal(scoreMuseSpecReject({ status: 500, transport: 'http', data: limit }, 'stop').status, 'abnormal')
    assert.equal(scoreMuseSpecReject({ status: 0, transport: 'timeout' }, 'stop').status, 'abnormal')
    assert.equal(scoreMuseSpecReject({ status: 429, transport: 'http' }, 'stop').status, 'abnormal')
  })
})

describe('scoreMuseSpecReply', () => {
  const accept = museSpecCaseById('spec-muse-chat-effort-max')!
  const reject = museSpecCaseById('spec-muse-chat-effort-none')!
  const okUsage = {
    usage: { prompt_tokens: 5, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 1 }, prompt_tokens_details: { cached_tokens: 0 } },
  }

  it('接受类非 2xx 一律失败，不能交给被拒类的判定', () => {
    for (const status of [400, 404, 422]) {
      const r = scoreMuseSpecReply(accept, { status, ok: false, data: { error: { message: 'bad effort' } }, text: '', errorText: 'bad effort' }, ctx)
      assert.equal(r.status, 'failed', String(status))
      assert.match(r.detail, new RegExp(`官方支持，但请求被拒（HTTP ${status}）：bad effort`))
    }
    // 同一个 400 换到被拒类就是通过：两条分支确实不同
    const rej = scoreMuseSpecReply(reject, { status: 400, ok: false, data: { error: { message: 'bad effort' } }, text: '', errorText: 'bad effort' }, ctx)
    assert.equal(rej.status, 'passed')
  })

  it('接受类 2xx 跑 oracle：字段齐全通过，缺字段失败', () => {
    const good = scoreMuseSpecReply(accept, { status: 200, ok: true, data: okUsage, text: 'OK' }, ctx)
    assert.equal(good.status, 'passed')
    assert.equal(good.checks?.length, 1)
    const bad = scoreMuseSpecReply(accept, { status: 200, ok: true, data: { usage: { prompt_tokens: 5, completion_tokens: 3 } }, text: 'OK' }, ctx)
    assert.equal(bad.status, 'failed')
    assert.match(bad.detail, /用量缺少官方字段/)
  })

  it('被拒类 2xx 失败，额度用尽的 400 失败', () => {
    assert.equal(scoreMuseSpecReply(reject, { status: 200, ok: true, data: okUsage, text: 'OK' }, ctx).status, 'failed')
    const limit = 'Could not finish the message because max_tokens or model output limit was reached.'
    assert.equal(scoreMuseSpecReply(reject, { status: 400, ok: false, data: { error: { message: limit } }, text: '', errorText: limit }, ctx).status, 'failed')
  })
})

describe('规格用例清单', () => {
  it('只对 muse-wonder 出现，多模型取并集', () => {
    assert.equal(matchMuseSpecCases('muse-wonder-1.0').length, MUSE_SPEC_CASES.length)
    assert.equal(matchMuseSpecCases('muse-spark-1.3').length, 0)
    assert.equal(matchMuseSpecCases('gpt-4o').length, 0)
    assert.equal(probeUnionMuseSpecCases(['gpt-4o', 'meta/muse-wonder']).length, MUSE_SPEC_CASES.length)
    assert.equal(probeUnionMuseSpecCases(['gpt-4o']).length, 0)
  })

  it('id 唯一，每组请求数与方案一致', () => {
    const ids = MUSE_SPEC_CASES.map(c => c.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every(id => id.startsWith('spec-muse-')))
    const count = (topic: string) => MUSE_SPEC_CASES.filter(c => c.topic === topic).length
    assert.equal(count('reasoning'), 9)
    assert.equal(count('constraint'), 16)
    assert.equal(count('multimodal'), 5)
    const of = (topic: string, expect: string) => MUSE_SPEC_CASES.filter(c => c.topic === topic && c.expect === expect).length
    assert.equal(of('reasoning', 'accept'), 6)
    assert.equal(of('reasoning', 'reject'), 3)
    assert.equal(of('constraint', 'reject'), 16)
    assert.equal(of('multimodal', 'accept'), 5)
    for (const c of MUSE_SPEC_CASES) {
      assert.equal(c.group, MUSE_SPEC_GROUPS[c.topic])
      if (c.expect === 'reject') assert.ok(c.what, c.id)
      assert.match(c.explain, /dev\.meta\.ai/, c.id)
    }
  })

  it('请求体按官方写法组装', () => {
    setProbeAnthropicCapField('max_tokens')
    const body = (id: string) => museSpecCaseById(id)!.build('muse-wonder-1.0', ctx)
    // 各协议的推理档位按官方枚举逐条钉死：Chat 顶层 reasoning_effort，Responses 嵌套 reasoning.effort，Messages 没有 minimal、关推理用 thinking.disabled
    const effortOf: Record<string, unknown> = {
      'spec-muse-chat-effort-minimal': body('spec-muse-chat-effort-minimal').reasoning_effort,
      'spec-muse-chat-effort-max': body('spec-muse-chat-effort-max').reasoning_effort,
      'spec-muse-chat-effort-none': body('spec-muse-chat-effort-none').reasoning_effort,
      'spec-muse-responses-effort-minimal': body('spec-muse-responses-effort-minimal').reasoning?.effort,
      'spec-muse-responses-effort-max': body('spec-muse-responses-effort-max').reasoning?.effort,
      'spec-muse-responses-effort-none': body('spec-muse-responses-effort-none').reasoning?.effort,
      'spec-muse-anthropic-effort-low': body('spec-muse-anthropic-effort-low').output_config?.effort,
      'spec-muse-anthropic-effort-max': body('spec-muse-anthropic-effort-max').output_config?.effort,
    }
    assert.deepEqual(effortOf, {
      'spec-muse-chat-effort-minimal': 'minimal',
      'spec-muse-chat-effort-max': 'max',
      'spec-muse-chat-effort-none': 'none',
      'spec-muse-responses-effort-minimal': 'minimal',
      'spec-muse-responses-effort-max': 'max',
      'spec-muse-responses-effort-none': 'none',
      'spec-muse-anthropic-effort-low': 'low',
      'spec-muse-anthropic-effort-max': 'max',
    })
    for (const c of MUSE_SPEC_CASES.filter(x => x.topic === 'reasoning')) {
      const b = c.build('muse-wonder-1.0', ctx)
      assert.equal(c.format === 'chat' ? b.reasoning === undefined : b.reasoning_effort === undefined, true, c.id)
      if (c.format === 'anthropic') {
        assert.equal(b.reasoning_effort, undefined, c.id)
        assert.notEqual(b.output_config?.effort, 'minimal', c.id)
      }
    }
    assert.equal(body('spec-muse-anthropic-thinking-disabled').output_config, undefined)
    assert.equal(body('spec-muse-chat-n2').n, 2)
    assert.deepEqual(body('spec-muse-chat-stop').stop, ['\n'])
    assert.equal(body('spec-muse-chat-logprobs').logprobs, true)
    assert.deepEqual(body('spec-muse-chat-web-search-options').web_search_options, {})
    assert.deepEqual(body('spec-muse-chat-modalities').modalities, ['text'])
    assert.equal(body('spec-muse-responses-truncation').truncation, 'auto')
    assert.deepEqual(body('spec-muse-responses-logprobs').include, ['message.output_text.logprobs'])
    assert.deepEqual(body('spec-muse-anthropic-stop-sequences').stop_sequences, ['\n'])
    assert.equal(body('spec-muse-anthropic-top-k').top_k, 5)
    assert.equal(body('spec-muse-chat-effort-max').max_completion_tokens, PROBE_CLAUDE5_CAP)
    assert.deepEqual(body('spec-muse-responses-effort-minimal').reasoning, { effort: 'minimal' })
    assert.equal(body('spec-muse-responses-effort-minimal').reasoning_effort, undefined)
    assert.deepEqual(body('spec-muse-anthropic-effort-max').output_config, { effort: 'max' })
    assert.equal(body('spec-muse-anthropic-effort-max').max_tokens, PROBE_CLAUDE5_CAP)
    assert.deepEqual(body('spec-muse-anthropic-thinking-disabled').thinking, { type: 'disabled' })
    assert.equal(body('spec-muse-chat-tool-required').tool_choice, 'required')
    assert.equal(body('spec-muse-chat-tool-required').tools[0].function.name, 'get_weather')
    assert.equal(body('spec-muse-responses-tool-required').tools[0].name, 'get_weather')
    assert.equal(body('spec-muse-responses-tool-required').tool_choice, 'required')
    assert.deepEqual(body('spec-muse-anthropic-tool-named').tool_choice, { type: 'tool', name: 'get_weather' })
    const maxOut = body('spec-muse-chat-max-output-tokens')
    assert.equal(maxOut.max_output_tokens, PROBE_CLAUDE5_CAP)
    assert.equal(maxOut.max_completion_tokens, undefined)
    const bg = body('spec-muse-responses-background-stream')
    assert.equal(bg.background, true)
    assert.equal(bg.stream, true)
    assert.deepEqual(body('spec-muse-anthropic-web-search-max-uses').tools, [{ type: 'web_search', max_uses: 1 }])
    assert.equal(body('spec-muse-anthropic-unknown-field').probe_unknown_field, true)
  })

  it('多模态素材跟着本次 ctx 生成：PDF 口令、哔声数都对得上，视频是内置常量', () => {
    for (const c of [{ code: 'MW-QWERTY', beeps: 2 }, { code: 'MW-ZX9K7P', beeps: 5 }]) {
      const chatPdf = museSpecCaseById('spec-muse-chat-pdf')!.build('muse-wonder-1.0', c).messages[0].content[1].file.file_data
      const respPdf = museSpecCaseById('spec-muse-responses-pdf')!.build('muse-wonder-1.0', c).input[0].content[1].file_data
      for (const url of [chatPdf, respPdf]) {
        assert.ok(fromDataUrl(url).toString('latin1').includes(`(The code is ${c.code})`), c.code)
      }
      const chatWav = museSpecCaseById('spec-muse-chat-audio')!.build('muse-wonder-1.0', c).messages[0].content[1].input_audio.data
      const respWav = museSpecCaseById('spec-muse-responses-audio')!.build('muse-wonder-1.0', c).input[0].content[1].input_audio.data
      for (const b64 of [chatWav, respWav]) {
      // 官方 input_audio.data 是裸 base64，不是 data URL
      assert.match(b64, /^[A-Za-z0-9+/]+=*$/)
      assert.ok(!b64.startsWith('data:'))
      assert.equal(Buffer.from(b64, 'base64').toString('ascii', 0, 4), 'RIFF')
      assert.equal(countBeeps(Buffer.from(b64, 'base64')), c.beeps)
    }
      const video = museSpecCaseById('spec-muse-responses-video')!.build('muse-wonder-1.0', c).input[0].content[1].video_url
      assert.equal(video, `data:video/mp4;base64,${MUSE_BLUE_MP4_B64}`)
    }
  })

  it('多模态素材写进各协议的官方字段', () => {
    const chatPdf = museSpecCaseById('spec-muse-chat-pdf')!.build('muse-wonder-1.0', ctx)
    const file = chatPdf.messages[0].content[1]
    assert.equal(file.type, 'file')
    assert.match(file.file.file_data, /^data:application\/pdf;base64,/)
    const respPdf = museSpecCaseById('spec-muse-responses-pdf')!.build('muse-wonder-1.0', ctx)
    assert.equal(respPdf.input[0].content[1].type, 'input_file')
    assert.equal(respPdf.input[0].content[1].filename, 'probe.pdf')
    const audio = museSpecCaseById('spec-muse-chat-audio')!.build('muse-wonder-1.0', ctx)
    assert.equal(audio.messages[0].content[1].type, 'input_audio')
    assert.equal(audio.messages[0].content[1].input_audio.format, 'wav')
    const respAudio = museSpecCaseById('spec-muse-responses-audio')!.build('muse-wonder-1.0', ctx)
    assert.equal(respAudio.input[0].content[1].type, 'input_audio')
    const video = museSpecCaseById('spec-muse-responses-video')!.build('muse-wonder-1.0', ctx)
    assert.equal(video.input[0].content[1].type, 'input_video')
    assert.match(video.input[0].content[1].video_url, /^data:video\/mp4;base64,/)
    assert.equal(MUSE_SPEC_CASES.some(c => c.topic === 'multimodal' && c.format === 'anthropic'), false)
  })

  it('随机上下文：口令只含安全字符，哔声 2–5', () => {
    const seq = [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.999]
    let i = 0
    const c = museSpecContext(() => seq[i++ % seq.length])
    assert.match(c.code, /^MW-[A-Z0-9]{6}$/)
    assert.ok(c.beeps >= 2 && c.beeps <= 5)
    assert.equal(museSpecContext(() => 0).beeps, 2)
    assert.equal(museSpecContext(() => 0.9999).beeps, 5)
  })
})

describe('规格 oracle', () => {
  it('接受类都带 oracle，被拒类不带；每组核对的是方案里的那一项', () => {
    const empty = { data: null, text: '' }
    const expectIds: Record<string, string[]> = {
      'spec-muse-chat-pdf': ['pdf_code'],
      'spec-muse-responses-pdf': ['pdf_code'],
      'spec-muse-chat-audio': ['audio_beeps'],
      'spec-muse-responses-audio': ['audio_beeps'],
      'spec-muse-responses-video': ['video_color'],
    }
    for (const c of MUSE_SPEC_CASES) {
      if (c.expect === 'reject') {
        assert.equal(c.oracles, undefined, c.id)
        continue
      }
      assert.equal(typeof c.oracles, 'function', c.id)
      const ids = c.oracles!(empty, ctx).map(x => x.id)
      assert.deepEqual(ids, c.topic === 'reasoning' ? ['usage_fields'] : expectIds[c.id], c.id)
      // 空回复不能被当成通过
      assert.ok(c.oracles!(empty, ctx).every(x => !x.passed), c.id)
    }
  })

  it('哔声计数不被素材参数（440Hz、16kHz、200ms、16-bit）带偏', () => {
    assert.equal(museBeepCount('16kHz audio with 3 beeps'), 3)
    assert.equal(museBeepCount('440Hz tones, there are 3'), 3)
    assert.equal(museBeepCount('440 Hz beeps: 4'), 4)
    // 前面先出现孤立个位数，后面才点名哔声：要取点名的那个
    assert.equal(museBeepCount('2 tones, beeps: 4'), 4)
    assert.equal(museBeepCount('I heard 2 tones. Beep count = 5'), 5)
    assert.equal(museBeepCount('Over 3 parts of the clip, the number of beeps is 4.'), 4)
    assert.equal(museBeepCount('After 2 pauses there are three beeps'), 3)
    assert.equal(oracleMuseBeeps('2 tones, beeps: 4', 4).passed, true)
    assert.equal(museBeepCount('The clip is 2 seconds long and has 5 beeps.'), 5)
    assert.equal(museBeepCount('Each beep lasts 200ms; 3 in total'), 3)
    assert.equal(museBeepCount('16-bit PCM, two beeps'), 2)
    assert.equal(museBeepCount('3 beeps of 0.2 seconds each'), 3)
    assert.equal(museBeepCount('Answer: 1.5'), null)
    assert.equal(oracleMuseBeeps('This 16kHz recording contains 3 beeps at 440Hz.', 3).passed, true)
    assert.equal(oracleMuseBeeps('440', 3).passed, false)
  })

  it('没有点名时，孤立个位数必须全部相同才采用', () => {
    assert.equal(museBeepCount('3'), 3)
    assert.equal(museBeepCount('three (3)'), 3)
    assert.equal(museBeepCount('I count 3. Yes, 3.'), 3)
    // 不止一个数、又没点名哪个是哔声：判不出，不能随手取第一个
    for (const vague of ['2 then 4', 'There are 2 tones and the answer is 4', '4, or maybe 2']) {
      assert.equal(museBeepCount(vague), null, vague)
      assert.equal(oracleMuseBeeps(vague, 2).passed, false, vague)
      assert.equal(oracleMuseBeeps(vague, 4).passed, false, vague)
    }
    assert.match(oracleMuseBeeps('2 then 4', 2).detail, /无法确定的数字/)
    // 点名仍然优先，不受其它数字干扰
    assert.equal(museBeepCount('2 tones, then 4 beeps'), 4)
  })

  it('用量字段按协议逐个要求是数字', () => {
    assert.equal(oracleMuseUsageFields('chat', {
      usage: { prompt_tokens: 5, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 0 }, prompt_tokens_details: { cached_tokens: 0 } },
    }).passed, true)
    const miss = oracleMuseUsageFields('chat', { usage: { prompt_tokens: 5, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 2 } } })
    assert.equal(miss.passed, false)
    assert.match(miss.detail, /prompt_tokens_details\.cached_tokens/)
    // 官方 Responses 的 usage 在顶层；网关包一层 response 也要认
    assert.equal(oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4, output_tokens_details: { reasoning_tokens: 4 }, input_tokens_details: { cached_tokens: 0 } },
    }).passed, true)
    assert.equal(oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 0 } },
    }).passed, false)
    // 对称反例：有 reasoning_tokens、缺 cached_tokens 同样失败，并点名缺的字段
    const noCached = oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4, output_tokens_details: { reasoning_tokens: 4 } },
    })
    assert.equal(noCached.passed, false)
    assert.match(noCached.detail, /input_tokens_details\.cached_tokens/)
    assert.doesNotMatch(noCached.detail, /reasoning_tokens/)
    const noCachedWrapped = oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4 },
      response: { usage: { output_tokens_details: { reasoning_tokens: 4 } } },
    })
    assert.equal(noCachedWrapped.passed, false)
    assert.match(noCachedWrapped.detail, /input_tokens_details\.cached_tokens/)
    // 两层并存：顶层只抄 input/output，官方明细在 response.usage，仍应算齐全
    const both = oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4 },
      response: { usage: { input_tokens: 10, output_tokens: 4, output_tokens_details: { reasoning_tokens: 4 }, input_tokens_details: { cached_tokens: 0 } } },
    })
    assert.equal(both.passed, true, both.detail)
    assert.match(both.detail, /reasoning_tokens=4/)
    // 两层各缺一个，合起来齐全也算；两层都缺同一个仍失败
    assert.equal(oracleMuseUsageFields('responses', {
      usage: { output_tokens_details: { reasoning_tokens: 1 } },
      response: { usage: { input_tokens_details: { cached_tokens: 0 } } },
    }).passed, true)
    assert.equal(oracleMuseUsageFields('responses', {
      usage: { input_tokens: 10, output_tokens: 4 },
      response: { usage: { input_tokens_details: { cached_tokens: 0 } } },
    }).passed, false)
    // Chat 没有 response 包装这一说，内层不算
    assert.equal(oracleMuseUsageFields('chat', {
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      response: { usage: { completion_tokens_details: { reasoning_tokens: 0 }, prompt_tokens_details: { cached_tokens: 0 } } },
    }).passed, false)
    assert.equal(oracleMuseUsageFields('responses', {
      response: { usage: { output_tokens_details: { reasoning_tokens: 4 }, input_tokens_details: { cached_tokens: 0 } } },
    }).passed, true)
    assert.equal(oracleMuseUsageFields('anthropic', {
      usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 9 } },
    }).passed, true)
    assert.equal(oracleMuseUsageFields('anthropic', { usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: null } }).passed, false)
    assert.equal(oracleMuseUsageFields('responses', null).passed, false)
  })

  it('口令、哔声、颜色', () => {
    assert.equal(oracleMuseCode('The code is mw-abc234.', 'MW-ABC234').passed, true)
    assert.equal(oracleMuseCode('I cannot read the file', 'MW-ABC234').passed, false)
    assert.equal(museBeepCount('There are 3 beeps'), 3)
    assert.equal(museBeepCount('Four.'), 4)
    assert.equal(museBeepCount('none'), null)
    assert.equal(oracleMuseBeeps('3', 3).passed, true)
    assert.equal(oracleMuseBeeps('two', 3).passed, false)
    assert.equal(oracleMuseBlue('Blue').passed, true)
    assert.equal(oracleMuseBlue('bluish').passed, false)
    assert.equal(oracleMuseBlue('Red').passed, false)
    assert.equal(oracleMuseBlue('The video is blue.').passed, true)
    assert.equal(oracleMuseBlue('Dark blue').passed, true)
    for (const bad of [
      'The video is not blue', 'blue is missing', "It isn't blue, it's red", 'No blue at all', 'Red and blue', 'blue or green',
      'I cannot see blue', 'I cannot tell if it is blue', "I can't tell, maybe blue", 'Unable to confirm it is blue',
    ]) {
      assert.equal(oracleMuseBlue(bad).passed, false, bad)
    }
  })
})

describe('内嵌素材', () => {
  it('PDF 结构完整、正文含口令、xref 偏移对得上', () => {
    const pdf = Buffer.from(musePdfBase64('MW-ABC234'), 'base64').toString('latin1')
    assert.ok(pdf.startsWith('%PDF-1.4'))
    assert.ok(pdf.trimEnd().endsWith('%%EOF'))
    assert.ok(pdf.includes('(The code is MW-ABC234)'))
    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1])
    assert.ok(pdf.slice(startxref).startsWith('xref'))
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]))
    assert.equal(offsets.length, 5)
    offsets.forEach((off, i) => assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj`)))
    assert.ok(Buffer.from(musePdfBase64('A(B)\\C'), 'base64').toString('latin1').includes('(The code is ABC)'))
  })

  it('wav 头合法，哔声段数等于 n', () => {
    for (const n of [2, 3, 5]) {
      const buf = Buffer.from(museBeepWavBytes(n))
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF')
      assert.equal(buf.toString('ascii', 8, 12), 'WAVE')
      assert.equal(buf.readUInt16LE(22), 1)
      assert.equal(buf.readUInt32LE(24), MUSE_WAV_SAMPLE_RATE)
      assert.equal(buf.readUInt16LE(34), 16)
      assert.equal(buf.readUInt32LE(40), buf.length - 44)
      assert.equal(countBeeps(buf), n)
      const samples = (buf.length - 44) / 2
      const seconds = samples / MUSE_WAV_SAMPLE_RATE
      assert.ok(Math.abs(seconds - (0.3 + n * (MUSE_BEEP_MS + MUSE_GAP_MS) / 1000)) < 0.01)
    }
  })

  it('mp4 容器：ftyp 开头，时长 2 秒，画面 128×128', () => {
    const buf = Buffer.from(MUSE_BLUE_MP4_B64, 'base64')
    assert.equal(buf.toString('ascii', 4, 8), 'ftyp')
    // 遍历 ISO BMFF box：moov/mvhd 给时长，moov/trak/tkhd 给宽高（16.16 定点）
    const boxes = (start: number, end: number): { type: string; at: number; end: number }[] => {
      const out: { type: string; at: number; end: number }[] = []
      for (let at = start; at + 8 <= end;) {
        const size = buf.readUInt32BE(at)
        if (size < 8) break
        out.push({ type: buf.toString('ascii', at + 4, at + 8), at, end: at + size })
        at += size
      }
      return out
    }
    const moov = boxes(0, buf.length).find(b => b.type === 'moov')!
    const mvhd = boxes(moov.at + 8, moov.end).find(b => b.type === 'mvhd')!
    const v0 = buf[mvhd.at + 8] === 0
    const timescale = buf.readUInt32BE(mvhd.at + (v0 ? 20 : 28))
    const duration = v0 ? buf.readUInt32BE(mvhd.at + 24) : Number(buf.readBigUInt64BE(mvhd.at + 32))
    assert.ok(Math.abs(duration / timescale - 2) < 0.05, `时长 ${duration / timescale}`)
    const traks = boxes(moov.at + 8, moov.end).filter(b => b.type === 'trak')
    assert.equal(traks.length, 1, '只有一条视频轨，没有音轨')
    const tkhd = boxes(traks[0].at + 8, traks[0].end).find(b => b.type === 'tkhd')!
    const tv0 = buf[tkhd.at + 8] === 0
    const wAt = tkhd.at + (tv0 ? 84 : 96)
    assert.equal(buf.readUInt32BE(wAt) / 65536, 128)
    assert.equal(buf.readUInt32BE(wAt + 4) / 65536, 128)
  })

  it('mp4 画面是纯蓝（本机有 ffmpeg 时解码首帧核对，没有则跳过）', t => {
    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    if (probe.error || probe.status !== 0) { t.skip('本机没有 ffmpeg'); return }
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {
      input: Buffer.from(MUSE_BLUE_MP4_B64, 'base64'),
      maxBuffer: 1 << 20,
    })
    assert.equal(r.status, 0, String(r.stderr))
    const px = r.stdout
    assert.equal(px.length, 128 * 128 * 3)
    for (let i = 0; i < px.length; i += 3 * 97) {
      const [red, green, blue] = [px[i], px[i + 1], px[i + 2]]
      assert.ok(blue > 180 && red < 60 && green < 110, `像素 ${red},${green},${blue}`)
    }
  })
})

describe('Meta 原生 web_search', () => {
  it('只对 muse-wonder 追加，tool_choice 只用 auto', () => {
    const cases = matchBuiltinToolCases('muse-wonder-1.0')
    assert.deepEqual(cases.map(c => c.id), ['native-meta-web_search', 'native-meta-web_search-messages'])
    assert.equal(cases[0].format, 'responses')
    assert.equal(cases[0].apply.tool_choice, 'auto')
    assert.deepEqual(cases[0].apply.extra, { include: ['web_search_call.results'] })
    assert.deepEqual(cases[1].apply.tool_choice, { type: 'auto' })
    // 锁进实际请求体：applyBuiltinTool 之后整份断言
    const resp: Record<string, unknown> = { model: 'muse-wonder-1.0', input: cases[0].prompt }
    applyBuiltinTool(resp, cases[0])
    assert.deepEqual(resp, {
      model: 'muse-wonder-1.0',
      input: cases[0].prompt,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      include: ['web_search_call.results'],
    })
    const msg: Record<string, unknown> = { model: 'muse-wonder-1.0', max_tokens: 2048, messages: [{ role: 'user', content: cases[1].prompt }] }
    applyBuiltinTool(msg, cases[1])
    assert.deepEqual(msg, {
      model: 'muse-wonder-1.0',
      max_tokens: 2048,
      messages: [{ role: 'user', content: cases[1].prompt }],
      tools: [{ type: 'web_search' }],
      tool_choice: { type: 'auto' },
    })
    assert.equal(matchBuiltinToolCases('meta/muse-wonder').length, 2)
  })

  it('Messages 联网：Anthropic 形状的 server_tool_use / web_search_tool_result 算证据，只有正文不算', () => {
    const spec = builtinCaseById('native-meta-web_search-messages')!
    assert.equal(spec.format, 'anthropic')
    assert.deepEqual(spec.apply.tools, [{ type: 'web_search' }])
    const used = oracleNativeToolEvidence({
      type: 'message', role: 'assistant', stop_reason: 'end_turn',
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'news today' } },
        { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://example.com', title: 't' }] },
        { type: 'text', text: 'Headline' },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    }, spec)
    assert.equal(used.passed, true)
    assert.match(used.detail, /server_tool_use/)
    // 只有结果块、没有 server_tool_use 也算（网关可能只透传结果）
    assert.equal(oracleNativeToolEvidence({ content: [{ type: 'web_search_tool_result', content: [] }] }, spec).passed, true)
    // 正文里提到 web search、server_tool_use 不算：只认 JSON 键 / 字符串值
    const prose = oracleNativeToolEvidence({
      type: 'message', content: [{ type: 'text', text: 'I would use web search (server_tool_use) but cannot.' }], usage: { input_tokens: 10, output_tokens: 4 },
    }, spec)
    assert.equal(prose.passed, false)
    assert.match(prose.detail, /没有 web_search 的调用或结果证据/)
    assert.equal(matchBuiltinToolCases('muse-wonder-1.0-2026-10-12').length, 2)
    assert.equal(matchBuiltinToolCases('muse-spark-1.3').length, 0)
    assert.equal(matchBuiltinToolCases('muse-wonder-full').length, 0)
  })
})
