import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MUSE_AUDIO_PROMPT, MUSE_FINGERPRINTS, MUSE_PDF_PROMPT, MUSE_SPEC_CASES, MUSE_SPEC_GROUPS, MUSE_VIDEO_PROMPT,
  matchMuseSpecCases, museBeepCount, museEncryptedBlobs, museSaidNone, museSearchEvidence, museSpecCaseById, museSpecContext,
  museAdaptComboBody, oracleMuseBeeps, oracleMuseBlue, oracleMuseCode, oracleMuseUsageFields, probeUnionMuseSpecCases,
  runMuseSpecCase, scoreMuseEncryptedPrefix, scoreMuseSpecReply, scoreMuseTokenDelta,
  type MuseSpecDeps, type MuseSpecReply, type MuseSpecRequest,
} from './muse-spec.ts'
import {
  MUSE_BEEP_MS, MUSE_BLUE_MP4_B64, MUSE_CONTINUE_PNG_B64, MUSE_GAP_MS, MUSE_TOKEN_FINGERPRINT_TEXT, MUSE_WAV_SAMPLE_RATE,
  museBeepWavBytes, musePdfBase64,
} from './muse-media.ts'
import { signalsFromProbeLogs, type ProbeOriginLog } from './origin.ts'
import {
  PROBE_CLAUDE5_CAP, claudeProbeCap, decideFamily, claudeSchemaCap, isMuseWonderModel, museForcedToolChoiceBlocked, probeToolChoiceFallbackNote,
} from './profiles.ts'
import { PROBE_DEFAULT_CAP, probeEmptyUsage, probeErrorMessage, probeNestReasoningEffort, probeParamComboBody, probeParamMatched, probeProtocolOf, probeSoleParamMatch, setProbeAnthropicCapField } from './protocol.ts'
import { scoreExpectedReject, scoreTopPRange } from './negative.ts'
import { applyBuiltinTool, builtinCaseById, matchBuiltinToolCases, nativeToolProxyName, oracleNativeToolEvidence } from './builtin-tools.ts'

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
    // Meta 官方原句：auto 外面包着反引号加双引号；经 OpenRouter 时藏在 metadata.raw 里
    const official = 'only `"auto"` is supported for `tool_choice`. `"none"`, `"required"`, and named function choices are not currently supported'
    assert.equal(museForcedToolChoiceBlocked(JSON.stringify({ type: 'invalid_request_error', message: official }), 'muse-wonder-1.0'), true)
    const wrapped = JSON.stringify({ message: 'Provider returned error', code: 400, metadata: { raw: JSON.stringify({ error: { code: null, message: official } }), provider_name: 'Meta' } })
    assert.equal(probeErrorMessage(wrapped), official)
    assert.equal(museForcedToolChoiceBlocked(wrapped, 'meta/muse-wonder'), true)
    // raw 不是 JSON 时取原文；没有 raw 时仍取外层 message
    assert.equal(probeErrorMessage(JSON.stringify({ message: 'Provider returned error', metadata: { raw: 'upstream exploded' } })), 'upstream exploded')
    assert.equal(probeErrorMessage(JSON.stringify({ message: 'plain' })), 'plain')
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

type Step = { status: number; data?: unknown } | { transport: 'timeout' | 'network' | 'stopped' }

/** 模拟执行器：按顺序回放应答，文本与用量按协议从 data 里读，和真实 runner 一致。 */
const harness = (steps: Step[], model = 'muse-wonder-1.0') => {
  const sent: MuseSpecRequest[] = []
  const slept: number[] = []
  const deps: MuseSpecDeps = {
    model,
    ctx,
    stopped: () => false,
    sleep: async ms => { slept.push(ms) },
    send: async req => {
      sent.push(req)
      const step = steps[sent.length - 1]
      if (!step) throw new Error(`unexpected send #${sent.length}`)
      if ('transport' in step) return { transport: step.transport, status: null, ok: false, data: null, text: '', usage: probeEmptyUsage() }
      const ok = step.status >= 200 && step.status < 300
      const proto = probeProtocolOf(req.format)
      return {
        transport: 'http', status: step.status, ok, data: step.data ?? null,
        text: ok ? proto.textOf(step.data) : '',
        errorText: ok ? undefined : JSON.stringify(asError(step.data)),
        usage: proto.usageOf(step.data),
      }
    },
  }
  return { deps, sent, slept, run: (id: string) => runMuseSpecCase(museSpecCaseById(id)!, deps) }
}
const asError = (d: unknown) => (d && typeof d === 'object' && 'error' in (d as any) ? (d as any).error : d)
const err = (message: string, extra: Record<string, unknown> = {}) => ({ error: { message, type: 'invalid_request_error', ...extra } })
const LIMIT = 'Could not finish the message because max_tokens or model output limit was reached.'

const chatOk = (text: string, extra: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) => ({
  object: 'chat.completion',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text, ...extra } }],
  usage: { prompt_tokens: 12, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 9 }, prompt_tokens_details: { cached_tokens: 0 }, ...usage },
})
const respOk = (text: string, extra: Record<string, unknown> = {}, output: unknown[] = []) => ({
  id: 'resp_6ad0c901a175184c0647496d', object: 'response', status: 'completed',
  output: [...output, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, logprobs: [] }] }],
  usage: { input_tokens: 12, output_tokens: 16, output_tokens_details: { reasoning_tokens: 5 }, input_tokens_details: { cached_tokens: 0 } },
  ...extra,
})
const msgOk = (content: unknown[], extra: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) => ({
  type: 'message', role: 'assistant', stop_reason: 'end_turn', content,
  usage: { input_tokens: 12, output_tokens: 23, cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 12 }, ...usage },
  ...extra,
})
const BLOB = 'Q-PaDgFZITnNU3P0nXaBgmPJJg24xjrHw4hNmUlfF6huZdPBg8i8JtMwCDE1'

describe('scoreMuseSpecReply：四种方向', () => {
  const reject = museSpecCaseById('spec-muse-chat-n2')!
  const accept = { expect: 'accept', name: '接受类', oracles: (r: MuseSpecReply) => [oracleMuseUsageFields('chat', r.data)] } as const
  const reply = (status: number, data: unknown): MuseSpecReply => ({
    transport: 'http', status, ok: status < 300, data, text: status < 300 ? probeProtocolOf('chat').textOf(data) : '',
    errorText: status < 300 ? undefined : JSON.stringify(asError(data)), usage: probeEmptyUsage(),
  })

  it('reject：4xx 通过；额度用尽的 400 失败；鉴权、限流、5xx、超时异常', () => {
    const ok = scoreMuseSpecReply(reject, reply(400, err("Unsupported parameter: 'n'")), ctx)
    assert.equal(ok.status, 'passed')
    assert.match(ok.detail, /n=2 返回 HTTP 400：Unsupported parameter: 'n'/)
    assert.equal(scoreMuseSpecReply(reject, reply(400, err(LIMIT)), ctx).status, 'failed')
    for (const s of [401, 403, 408, 429, 500, 503]) assert.equal(scoreMuseSpecReply(reject, reply(s, err('x')), ctx).status, 'abnormal', String(s))
    assert.equal(scoreMuseSpecReply(reject, { ...reply(200, null), transport: 'timeout', status: null, ok: false }, ctx).status, 'abnormal')
  })

  it('reject 2xx：被丢弃记失败，真的生效记异常，看不出来记失败「无法判断」', () => {
    const dropped = scoreMuseSpecReply(reject, reply(200, chatOk('OK')), ctx)
    assert.equal(dropped.status, 'failed')
    assert.match(dropped.detail, /静默丢弃（只返回 1 个 choice）/)
    const two = chatOk('OK')
    two.choices.push({ ...two.choices[0], index: 1 })
    const took = scoreMuseSpecReply(reject, reply(200, two), ctx)
    assert.equal(took.status, 'abnormal')
    assert.match(took.detail, /n=2 生效了（返回了 2 个 choices）.*背后可能不是 muse-wonder-1\.0/)
    const unknown = scoreMuseSpecReply(museSpecCaseById('spec-muse-chat-modalities')!, reply(200, chatOk('OK')), ctx)
    assert.equal(unknown.status, 'failed')
    assert.match(unknown.detail, /无法判断是否生效/)
  })

  it('accept：非 2xx 失败，2xx 看 oracle', () => {
    assert.equal(scoreMuseSpecReply(accept, reply(400, err('bad')), ctx).status, 'failed')
    assert.match(scoreMuseSpecReply(accept, reply(422, err('bad')), ctx).detail, /官方支持，但请求被拒（HTTP 422）：bad/)
    assert.equal(scoreMuseSpecReply(accept, reply(200, chatOk('OK')), ctx).status, 'passed')
    assert.equal(scoreMuseSpecReply(accept, reply(200, { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), ctx).status, 'failed')
    assert.equal(scoreMuseSpecReply(accept, reply(503, err('x')), ctx).status, 'abnormal')
  })

  it('conflict 一律依据不足；inferred 成功通过，其余依据不足', () => {
    const conflict = { expect: 'conflict', name: '冲突', note: '两页说法相反' } as const
    for (const r of [reply(200, chatOk('OK')), reply(400, err('no'))]) {
      const out = scoreMuseSpecReply(conflict, r, ctx)
      assert.equal(out.status, 'inconclusive')
      assert.match(out.detail, /两页说法相反/)
    }
    const inferred = { expect: 'inferred', name: '推断', note: '写法推断', oracles: (r: MuseSpecReply) => [oracleMuseCode(r.text, ctx.code)] } as const
    assert.equal(scoreMuseSpecReply(inferred, reply(200, chatOk(ctx.code)), ctx).status, 'passed')
    assert.equal(scoreMuseSpecReply(inferred, reply(200, chatOk('nothing')), ctx).status, 'inconclusive')
    assert.equal(scoreMuseSpecReply(inferred, reply(400, err('unknown block')), ctx).status, 'inconclusive')
    assert.equal(scoreMuseSpecReply(inferred, reply(429, err('slow down')), ctx).status, 'abnormal')
  })
})

describe('规格用例清单', () => {
  it('只对 muse-wonder（含 meta/muse-wonder）出现，多模型取并集', () => {
    for (const model of ['muse-wonder-1.0', 'meta/muse-wonder', 'meta/muse-wonder-1.0']) {
      assert.equal(matchMuseSpecCases(model).length, MUSE_SPEC_CASES.length, model)
    }
    assert.equal(matchMuseSpecCases('muse-spark-1.3').length, 0)
    assert.equal(matchMuseSpecCases('gpt-4o').length, 0)
    assert.equal(probeUnionMuseSpecCases(['gpt-4o', 'meta/muse-wonder']).length, MUSE_SPEC_CASES.length)
    assert.equal(probeUnionMuseSpecCases(['gpt-4o']).length, 0)
  })

  it('id 唯一、分组与方向和方案一致', () => {
    const ids = MUSE_SPEC_CASES.map(c => c.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every(id => id.startsWith('spec-muse-')))
    const count = (topic: string) => MUSE_SPEC_CASES.filter(c => c.topic === topic).length
    assert.deepEqual(
      Object.fromEntries(Object.keys(MUSE_SPEC_GROUPS).map(t => [t, count(t)])),
      { reasoning: 8, tools: 13, search: 2, multimodal: 8, state: 5, api: 8, constraint: 42, identity: 4 },
    )
    assert.equal(MUSE_SPEC_CASES.filter(c => c.expect === 'conflict').length, 0)
    assert.deepEqual(MUSE_SPEC_CASES.filter(c => c.expect === 'inferred').map(c => c.id).sort(), [
      'spec-muse-anthropic-pdf', 'spec-muse-anthropic-tool-search', 'spec-muse-anthropic-video', 'spec-muse-chat-video',
    ])
    for (const c of MUSE_SPEC_CASES) {
      assert.equal(c.group, MUSE_SPEC_GROUPS[c.topic], c.id)
      assert.ok(c.build || c.run, c.id)
      if (c.expect === 'reject') assert.ok(c.what, c.id)
      if (c.expect === 'inferred') assert.ok(c.note, c.id)
      if (c.topic !== 'identity') assert.match(c.explain, /dev\.meta\.ai|API 参考/, c.id)
    }
    // 约束组全是 reject；被拒类不带 oracle
    assert.ok(MUSE_SPEC_CASES.filter(c => c.topic === 'constraint').every(c => c.expect === 'reject'))
    assert.ok(MUSE_SPEC_CASES.filter(c => c.expect === 'reject').every(c => !c.oracles))
  })

  it('官方约束的请求体按文档逐条钉死', () => {
    setProbeAnthropicCapField('max_tokens')
    const body = (id: string) => museSpecCaseById(id)!.build!('muse-wonder-1.0', ctx)
    assert.deepEqual(body('spec-muse-chat-stop').stop, ['5'])
    assert.match(body('spec-muse-chat-stop').messages[0].content, /1 to 9/)
    assert.equal(body('spec-muse-chat-n2').n, 2)
    assert.equal(body('spec-muse-chat-logprobs').logprobs, true)
    assert.deepEqual(body('spec-muse-chat-web-search-options').web_search_options, {})
    assert.deepEqual(body('spec-muse-chat-modalities').modalities, ['text'])
    const maxOut = body('spec-muse-chat-max-output-tokens')
    assert.equal(maxOut.max_output_tokens, 16)
    assert.equal(maxOut.max_completion_tokens, undefined)
    assert.deepEqual(body('spec-muse-chat-audio-output').audio, { voice: 'alloy', format: 'wav' })
    assert.ok(body('spec-muse-chat-logit-bias').logit_bias)
    assert.equal(body('spec-muse-chat-prediction').prediction.type, 'content')
    assert.equal(body('spec-muse-chat-verbosity').verbosity, 'low')
    assert.equal(body('spec-muse-chat-text-format').text.format.type, 'json_schema')
    assert.equal(body('spec-muse-chat-top-p-zero').top_p, 0)
    assert.equal(body('spec-muse-chat-custom-tool').tools[0].type, 'custom')
    assert.equal(body('spec-muse-chat-strict-tool-violation').tools[0].function.strict, true)
    assert.equal(body('spec-muse-chat-strict-tool-violation').tools[0].function.parameters.additionalProperties, undefined)
    assert.equal(body('spec-muse-chat-strict-schema-violation').response_format.json_schema.strict, true)
    assert.ok(JSON.stringify(body('spec-muse-chat-recursive-schema').response_format).includes('#/$defs/node'))
    assert.equal(body('spec-muse-chat-too-many-images').messages[0].content.filter((p: any) => p.type === 'image_url').length, 51)
    assert.equal(body('spec-muse-chat-tool-required').tool_choice, 'required')
    assert.equal(body('spec-muse-chat-tool-none').tool_choice, 'none')
    assert.deepEqual(body('spec-muse-chat-tool-named').tool_choice, { type: 'function', function: { name: 'get_weather' } })
    // 生效判据要靠「与工具无关」的提示才看得出来
    assert.equal(body('spec-muse-chat-tool-required').messages[0].content, 'Reply with exactly: OK')
    assert.match(body('spec-muse-chat-tool-none').messages[0].content, /must call the get_weather/)
    assert.equal(body('spec-muse-responses-tool-required').tool_choice, 'required')
    assert.equal(body('spec-muse-responses-tool-none').tool_choice, 'none')
    assert.deepEqual(body('spec-muse-responses-tool-named').tool_choice, { type: 'function', name: 'get_weather' })
    assert.equal(body('spec-muse-responses-truncation').truncation, 'auto')
    assert.equal(body('spec-muse-responses-background-stream').background, true)
    assert.equal(body('spec-muse-responses-background-stream').stream, true)
    assert.deepEqual(body('spec-muse-responses-logprobs').include, ['message.output_text.logprobs'])
    assert.deepEqual(body('spec-muse-responses-include-unknown').include, ['probe.unknown_value'])
    assert.equal(body('spec-muse-responses-max-output-min').max_output_tokens, 15)
    assert.equal(body('spec-muse-responses-reserved-tool-name').tools[0].name, 'web_search')
    assert.deepEqual(body('spec-muse-anthropic-stop-sequences').stop_sequences, ['5'])
    assert.equal(body('spec-muse-anthropic-top-k').top_k, 5)
    assert.equal(body('spec-muse-anthropic-unknown-field').probe_unknown_field, true)
    assert.deepEqual(body('spec-muse-anthropic-tool-named').tool_choice, { type: 'tool', name: 'get_weather' })
    assert.deepEqual(body('spec-muse-anthropic-web-search-max-uses').tools, [{ type: 'web_search', max_uses: 1 }])
    assert.deepEqual(body('spec-muse-anthropic-web-search-allowed-domains').tools, [{ type: 'web_search', allowed_domains: ['reuters.com'] }])
    assert.deepEqual(body('spec-muse-anthropic-web-search-blocked-domains').tools, [{ type: 'web_search', blocked_domains: ['example.com'] }])
    assert.equal(body('spec-muse-anthropic-container').container, 'probe-container')
    assert.equal(body('spec-muse-anthropic-inference-geo').inference_geo, 'us')
    assert.equal(body('spec-muse-anthropic-service-tier').service_tier, 'priority')
    assert.equal(body('spec-muse-anthropic-system-image').system[0].type, 'image')
    assert.deepEqual(body('spec-muse-anthropic-thinking-budget-low').thinking, { type: 'enabled', budget_tokens: 512 })
    assert.equal(body('spec-muse-chat-effort-none').reasoning_effort, 'none')
    assert.deepEqual(body('spec-muse-responses-effort-none').reasoning, { effort: 'none' })
    assert.deepEqual(body('spec-muse-anthropic-thinking-disabled').thinking, { type: 'disabled' })
    // 额度统一 2048（Chat 用 max_completion_tokens、Responses 用 max_output_tokens、Messages 用 max_tokens）
    assert.equal(body('spec-muse-chat-n2').max_completion_tokens, PROBE_CLAUDE5_CAP)
    assert.equal(body('spec-muse-responses-truncation').max_output_tokens, PROBE_CLAUDE5_CAP)
    assert.equal(body('spec-muse-anthropic-top-k').max_tokens, PROBE_CLAUDE5_CAP)
  })

  it('官方支持项的请求体', () => {
    const body = (id: string) => museSpecCaseById(id)!.build!('meta/muse-wonder', ctx)
    assert.equal(body('spec-muse-chat-parallel-tools').tools.length, 2)
    assert.equal(body('spec-muse-chat-parallel-tools').parallel_tool_calls, undefined)
    assert.equal(body('spec-muse-chat-parallel-off').parallel_tool_calls, false)
    assert.equal(body('spec-muse-responses-parallel-off').parallel_tool_calls, false)
    const strict = body('spec-muse-chat-strict-tool').tools[0].function
    assert.equal(strict.strict, true)
    assert.equal(strict.parameters.additionalProperties, false)
    assert.deepEqual(strict.parameters.required, ['city', 'date'])
    assert.equal(body('spec-muse-responses-strict-tool').tools[0].strict, true)
    assert.deepEqual(body('spec-muse-responses-custom-tool').tools[0], { type: 'custom', name: 'echo_text', description: 'Echo the given text back verbatim. Input is free-form text.' })
    const ts = body('spec-muse-responses-tool-search').tools
    assert.equal(ts[0].defer_loading, true)
    assert.deepEqual(ts[1], { type: 'tool_search' })
    assert.deepEqual(body('spec-muse-anthropic-tool-choice-any').tool_choice, { type: 'any' })
    assert.deepEqual(body('spec-muse-anthropic-tool-choice-none').tool_choice, { type: 'none' })
    assert.deepEqual(body('spec-muse-anthropic-disable-parallel').tool_choice, { type: 'auto', disable_parallel_tool_use: true })
    const cu = body('spec-muse-responses-computer-use')
    assert.deepEqual(cu.tools, [{ type: 'computer' }])
    assert.match(cu.input[0].content[1].image_url, /^data:image\/png;base64,/)
    const ws = body('spec-muse-responses-web-search-options')
    assert.deepEqual(ws.tools[0], { type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate', country: 'US' } })
    assert.deepEqual(ws.include, ['web_search_call.results'])
    assert.deepEqual(body('spec-muse-anthropic-web-search-location').tools[0].user_location, { type: 'approximate', country: 'US' })
    assert.equal(body('spec-muse-chat-cache-retention').prompt_cache_retention, '24h')
    assert.equal(body('spec-muse-responses-cache-retention').prompt_cache_retention, '24h')
    // 请求里的模型名保持用户输入原文
    assert.equal(body('spec-muse-chat-n2').model, 'meta/muse-wonder')
  })

  it('多模态素材跟着本次 ctx 生成，写进各协议字段；提示允许回 NONE', () => {
    for (const c of [{ code: 'MW-QWERTY', beeps: 2 }, { code: 'MW-ZX9K7P', beeps: 5 }]) {
      const b = (id: string) => museSpecCaseById(id)!.build!('muse-wonder-1.0', c)
      const chatPdf = b('spec-muse-chat-pdf').messages[0].content[1].file.file_data
      const respPdf = b('spec-muse-responses-pdf').input[0].content[1].file_data
      const msgPdf = b('spec-muse-anthropic-pdf').messages[0].content[0]
      assert.deepEqual(Object.keys(msgPdf.source), ['type', 'media_type', 'data'])
      for (const pdf of [fromDataUrl(chatPdf), fromDataUrl(respPdf), Buffer.from(msgPdf.source.data, 'base64')]) {
        assert.ok(pdf.toString('latin1').includes(`(The code is ${c.code})`), c.code)
      }
      for (const wav of [b('spec-muse-chat-audio').messages[0].content[1].input_audio.data, b('spec-muse-responses-audio').input[0].content[1].input_audio.data]) {
        // 官方 input_audio.data 是裸 base64，不是 data URL
        assert.match(wav, /^[A-Za-z0-9+/]+=*$/)
        assert.equal(countBeeps(Buffer.from(wav, 'base64')), c.beeps)
      }
      assert.equal(b('spec-muse-responses-video').input[0].content[1].video_url, `data:video/mp4;base64,${MUSE_BLUE_MP4_B64}`)
      assert.deepEqual(b('spec-muse-chat-video').messages[0].content[1], { type: 'video_url', video_url: { url: `data:video/mp4;base64,${MUSE_BLUE_MP4_B64}` } })
      assert.equal(b('spec-muse-anthropic-video').messages[0].content[0].source.data, MUSE_BLUE_MP4_B64)
    }
    const b = (id: string) => museSpecCaseById(id)!.build!('muse-wonder-1.0', ctx)
    // 音频、视频额度 4096（官方提示低于 4000 可能回空）
    assert.equal(b('spec-muse-chat-audio').max_completion_tokens, 4096)
    assert.equal(b('spec-muse-responses-video').max_output_tokens, 4096)
    assert.equal(b('spec-muse-anthropic-video').max_tokens, 4096)
    for (const p of [MUSE_PDF_PROMPT, MUSE_AUDIO_PROMPT, MUSE_VIDEO_PROMPT]) assert.match(p, /reply NONE/)
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

describe('约束用例的「生效」判据', () => {
  const one = async (id: string, data: unknown, status = 200) => harness([{ status, data }]).run(id)

  it('effort=none：reasoning_tokens 为 0 是生效，大于 0 是丢弃，缺字段看不出来', async () => {
    assert.equal((await one('spec-muse-chat-effort-none', chatOk('OK', {}, { completion_tokens_details: { reasoning_tokens: 0 } }))).status, 'abnormal')
    const dropped = await one('spec-muse-chat-effort-none', chatOk('OK', {}, { completion_tokens_details: { reasoning_tokens: 5 } }))
    assert.equal(dropped.status, 'failed')
    assert.match(dropped.detail, /静默丢弃（仍在推理，reasoning_tokens=5）/)
    assert.equal((await one('spec-muse-responses-effort-none', respOk('OK'))).status, 'failed')
    const noField = await one('spec-muse-anthropic-thinking-disabled', msgOk([{ type: 'text', text: 'OK' }], {}, { output_tokens_details: undefined }))
    assert.equal(noField.status, 'failed')
    assert.match(noField.detail, /无法判断是否生效/)
    // OpenRouter 自己拦下 none 的 400 也算拒绝
    const rejected = await one('spec-muse-chat-effort-none', { error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.', code: 400 } }, 400)
    assert.equal(rejected.status, 'passed')
  })

  it('stop / stop_sequences：停在 5 之前是生效，数到 9 是丢弃', async () => {
    assert.equal((await one('spec-muse-chat-stop', chatOk('1 2 3 4 '))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-stop', chatOk('1 2 3 4 5 6 7 8 9'))).status, 'failed')
    assert.match((await one('spec-muse-chat-stop', chatOk(''))).detail, /无法判断是否生效/)
    assert.equal((await one('spec-muse-anthropic-stop-sequences', msgOk([{ type: 'text', text: '1 2 3 4 ' }], { stop_reason: 'stop_sequence' }))).status, 'abnormal')
    assert.equal((await one('spec-muse-anthropic-stop-sequences', msgOk([{ type: 'text', text: '1 2 3 4 5 6 7 8 9' }]))).status, 'failed')
  })

  it('tool_choice：required / 指定在无关提示下调用了工具是生效；none 在必须调用时没调用是生效', async () => {
    const call = { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' } }] }
    assert.equal((await one('spec-muse-chat-tool-required', chatOk('', call))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-tool-required', chatOk('OK'))).status, 'failed')
    assert.equal((await one('spec-muse-chat-tool-none', chatOk('Sunny'))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-tool-none', chatOk('', call))).status, 'failed')
    const fc = respOk('', {}, [{ type: 'function_call', name: 'get_weather', arguments: '{"city":"Shanghai"}' }])
    assert.equal((await one('spec-muse-responses-tool-named', fc)).status, 'abnormal')
    assert.equal((await one('spec-muse-anthropic-tool-named', msgOk([{ type: 'tool_use', id: 't', name: 'get_weather', input: {} }]))).status, 'abnormal')
    // Meta 原句经 OpenRouter 透传：400 记通过
    const raw = { error: { message: 'Provider returned error', code: 400, metadata: { raw: JSON.stringify({ error: { message: 'only `"auto"` is supported for `tool_choice`.' } }), provider_name: 'Meta' } } }
    const out = await one('spec-muse-chat-tool-required', raw, 400)
    assert.equal(out.status, 'passed')
    assert.match(out.detail, /only `"auto"` is supported/)
  })

  it('n、logprobs、web_search_options、max_output_tokens、audio、text.format', async () => {
    assert.equal((await one('spec-muse-chat-logprobs', chatOk('OK'))).status, 'failed')
    const lp = chatOk('OK')
    ;(lp.choices[0] as any).logprobs = { content: [{ token: 'OK', logprob: -0.01 }] }
    assert.equal((await one('spec-muse-chat-logprobs', lp)).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-web-search-options', chatOk('News', { annotations: [{ type: 'url_citation', url_citation: { url: 'https://x' } }] }))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-web-search-options', chatOk('News'))).status, 'failed')
    const cut = chatOk('1 2 3')
    cut.choices[0].finish_reason = 'length'
    assert.equal((await one('spec-muse-chat-max-output-tokens', cut)).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-audio-output', chatOk('OK', { audio: { id: 'a', data: 'UklG' } }))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-text-format', chatOk('{"ok":true}'))).status, 'abnormal')
    assert.equal((await one('spec-muse-chat-text-format', chatOk('OK'))).status, 'failed')
    const rlp = respOk('OK')
    ;(rlp.output[0] as any).content[0].logprobs = [{ token: 'OK', logprob: -0.1 }]
    assert.equal((await one('spec-muse-responses-logprobs', rlp)).status, 'abnormal')
  })
})

describe('执行引擎：多步用例', () => {
  it('对照：对照不通记依据不足且不发正式请求；对照通过后 400 记通过', async () => {
    const blocked = harness([{ status: 400, data: { error: { type: '<nil>', message: 'openai_error' } } }])
    const out = await blocked.run('spec-muse-anthropic-web-search-max-uses')
    assert.equal(out.status, 'inconclusive')
    assert.equal(blocked.sent.length, 1)
    assert.equal(blocked.sent[0].label, '对照')
    assert.deepEqual(blocked.sent[0].body!.tools, [{ type: 'web_search' }])
    const ok = harness([{ status: 200, data: msgOk([{ type: 'server_tool_use', name: 'web_search', input: {} }]) }, { status: 400, data: err('max_uses is not supported') }])
    const passed = await ok.run('spec-muse-anthropic-web-search-max-uses')
    assert.equal(passed.status, 'passed')
    assert.equal(passed.decisive, 1)
    assert.equal((await harness([{ status: 503, data: err('down') }]).run('spec-muse-anthropic-web-search-allowed-domains')).status, 'abnormal')
  })

  it('推理全档位：默认 + 6 档，每一发都要推理 token > 0 与官方用量字段', async () => {
    const h = harness(Array.from({ length: 7 }, () => ({ status: 200, data: chatOk('OK') })))
    const out = await h.run('spec-muse-chat-effort-levels')
    assert.equal(out.status, 'passed', out.detail)
    assert.deepEqual(h.sent.map(r => r.body!.reasoning_effort), [undefined, 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    assert.ok(h.sent.every(r => r.body!.max_completion_tokens === PROBE_CLAUDE5_CAP))

    const resp = harness(Array.from({ length: 7 }, () => ({ status: 200, data: respOk('OK') })))
    assert.equal((await resp.run('spec-muse-responses-effort-levels')).status, 'passed')
    assert.deepEqual(resp.sent.map(r => r.body!.reasoning?.effort), [undefined, 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    assert.ok(resp.sent.every(r => r.body!.reasoning_effort === undefined))

    setProbeAnthropicCapField('max_tokens')
    const msg = harness(Array.from({ length: 6 }, () => ({ status: 200, data: msgOk([{ type: 'text', text: 'OK' }]) })))
    assert.equal((await msg.run('spec-muse-anthropic-effort-levels')).status, 'passed')
    assert.deepEqual(msg.sent.map(r => r.body!.output_config?.effort), [undefined, 'low', 'medium', 'high', 'xhigh', 'max'])

    // 第三发（low）被拒：记失败并停下
    const stop = harness([{ status: 200, data: chatOk('OK') }, { status: 200, data: chatOk('OK') }, { status: 400, data: err('bad effort low') }])
    const failed = await stop.run('spec-muse-chat-effort-levels')
    assert.equal(failed.status, 'failed')
    assert.match(failed.detail, /官方支持的 low 被拒（HTTP 400）/)
    assert.equal(stop.sent.length, 3)
    assert.equal(failed.decisive, 2)
    // 推理 token 为 0、或缺用量字段，都记失败
    const zero = harness([{ status: 200, data: chatOk('OK', {}, { completion_tokens_details: { reasoning_tokens: 0 } }) }])
    assert.match((await zero.run('spec-muse-chat-effort-levels')).detail, /默认：.*=0，推理没有发生/)
    const noUsage = harness([{ status: 200, data: msgOk([{ type: 'text', text: 'OK' }], {}, { output_tokens_details: undefined }) }])
    assert.match((await noUsage.run('spec-muse-anthropic-effort-levels')).detail, /thinking_tokens/)
  })

  it('加密推理回放：第一跳要有 encrypted_content，第二跳原样回放并答出口令', async () => {
    const first = respOk('Got it.', {}, [{ type: 'reasoning', id: 'rs_a:rs_b', summary: [], encrypted_content: BLOB }])
    const h = harness([{ status: 200, data: first }, { status: 200, data: respOk('ORBIT') }])
    const out = await h.run('spec-muse-responses-encrypted-replay')
    assert.equal(out.status, 'passed', out.detail)
    assert.deepEqual(h.sent[0].body!.include, ['reasoning.encrypted_content'])
    assert.equal(h.sent[0].body!.store, false)
    const replay = h.sent[1].body!.input as any[]
    assert.deepEqual(replay.find(it => it.type === 'reasoning'), { type: 'reasoning', id: 'rs_a:rs_b', summary: [], encrypted_content: BLOB })
    assert.equal(replay[replay.length - 1].content[0].text, 'Reply with only the codeword.')
    const none = harness([{ status: 200, data: respOk('ok', {}, [{ type: 'reasoning', summary: [] }]) }])
    assert.match((await none.run('spec-muse-responses-encrypted-replay')).detail, /没有 encrypted_content/)
  })

  it('存储链：store → 续接 → GET → DELETE → GET 404', async () => {
    const id = 'resp_6ad0c901a175184c0647496d'
    const h = harness([
      { status: 200, data: respOk('Got it.') },
      { status: 200, data: respOk('ORBIT') },
      { status: 200, data: respOk('Got it.') },
      { status: 200, data: { id, object: 'response', deleted: true } },
      { status: 404, data: err('not found') },
    ])
    const out = await h.run('spec-muse-responses-store-chain')
    assert.equal(out.status, 'passed', out.detail)
    assert.deepEqual(h.sent.map(r => r.method ?? 'POST'), ['POST', 'POST', 'GET', 'DELETE', 'GET'])
    assert.deepEqual(h.sent.map(r => r.path ?? ''), ['', '', `/${id}`, `/${id}`, `/${id}`])
    assert.equal(h.sent[0].body!.store, true)
    assert.equal(h.sent[1].body!.previous_response_id, id)
    assert.equal(out.usageExempt, true)
    // 删除后还能取回：失败
    const stale = harness([
      { status: 200, data: respOk('Got it.') }, { status: 200, data: respOk('ORBIT') }, { status: 200, data: respOk('x') },
      { status: 200, data: { deleted: true } }, { status: 200, data: respOk('x') },
    ])
    assert.match((await stale.run('spec-muse-responses-store-chain')).detail, /删除后仍能取回/)
    // 取回接口不存在（网关不支持）：失败并停在这一步
    const noGet = harness([{ status: 200, data: respOk('Got it.') }, { status: 200, data: respOk('ORBIT') }, { status: 404, data: err('Invalid URL') }])
    const failed = await noGet.run('spec-muse-responses-store-chain')
    assert.equal(failed.status, 'failed')
    assert.equal(noGet.sent.length, 3)
  })

  it('background：创建后轮询到 completed；取消：2xx 通过，4xx 且已完成记依据不足', async () => {
    const id = 'resp_bg1'
    const bg = harness([
      { status: 200, data: { id, object: 'response', status: 'queued', output: [] } },
      { status: 200, data: { id, object: 'response', status: 'in_progress', output: [] } },
      { status: 200, data: respOk('OK', { id }) },
    ])
    const out = await bg.run('spec-muse-responses-background')
    assert.equal(out.status, 'passed', out.detail)
    assert.equal(bg.sent[0].body!.background, true)
    assert.deepEqual(bg.sent.slice(1).map(r => [r.method, r.path]), [['GET', `/${id}`], ['GET', `/${id}`]])
    assert.deepEqual(bg.slept, [2000, 2000])
    // 网关忽略 background、直接回 completed：也算通过，但这一发产生了 Token，不能免用量闸门
    const immediate = await harness([{ status: 200, data: respOk('OK') }]).run('spec-muse-responses-background')
    assert.equal(immediate.status, 'passed')
    assert.equal(immediate.usageExempt, undefined)
    // 轮询完成的那一发是 GET，免闸门
    assert.equal(out.usageExempt, true)

    const cancel = harness([{ status: 200, data: { id, status: 'in_progress', output: [] } }, { status: 200, data: { id, status: 'cancelled', output: [] } }])
    const c1 = await cancel.run('spec-muse-responses-cancel')
    assert.equal(c1.status, 'passed')
    assert.equal(cancel.sent[1].path, `/${id}/cancel`)
    assert.equal(cancel.sent[1].method ?? 'POST', 'POST')
    const late = harness([{ status: 200, data: { id, status: 'in_progress', output: [] } }, { status: 400, data: err('cannot cancel') }, { status: 200, data: respOk('essay', { id }) }])
    assert.equal((await late.run('spec-muse-responses-cancel')).status, 'inconclusive')
    const missing = harness([{ status: 200, data: { id, status: 'in_progress', output: [] } }, { status: 404, data: err('no route') }, { status: 200, data: { id, status: 'in_progress' } }])
    assert.equal((await missing.run('spec-muse-responses-cancel')).status, 'failed')
  })

  it('计数接口：与实际生成的 input_tokens 一致才通过', async () => {
    const h = harness([{ status: 200, data: { object: 'response.input_tokens', input_tokens: 12 } }, { status: 200, data: respOk('OK') }])
    const out = await h.run('spec-muse-responses-input-tokens')
    assert.equal(out.status, 'passed', out.detail)
    assert.equal(h.sent[0].path, '/input_tokens')
    assert.deepEqual(h.sent[0].body, h.sent[1].body)
    assert.equal(out.decisive, 1)
    const off = harness([{ status: 200, data: { input_tokens: 30 } }, { status: 200, data: respOk('OK') }])
    assert.match((await off.run('spec-muse-responses-input-tokens')).detail, /计数接口算出 30，实际生成 input_tokens 是 12/)
    const gone = harness([{ status: 404, data: err('Not Found') }])
    const g = await gone.run('spec-muse-anthropic-count-tokens')
    assert.equal(g.status, 'failed')
    assert.equal(gone.sent[0].path, '/count_tokens')
    assert.equal(g.usageExempt, true)
  })

  it('错误格式：404 + model_not_found 通过；网关用 503 表示模型不存在记失败；401 记异常', async () => {
    const good = { error: { message: 'The model `probe-no-such-model` does not exist or is not available', type: 'invalid_request_error', param: null, code: 'model_not_found' } }
    const h = harness([{ status: 404, data: good }])
    assert.equal((await h.run('spec-muse-responses-error-model')).status, 'passed')
    assert.equal(h.sent[0].body!.model, 'probe-no-such-model')
    const gw = await harness([{ status: 503, data: { error: { message: '分组 default 下模型无可用渠道', type: 'new_api_error' } } }]).run('spec-muse-chat-error-model')
    assert.equal(gw.status, 'failed')
    assert.match(gw.detail, /HTTP 503，官方是 404/)
    assert.equal((await harness([{ status: 401, data: err('Unauthorized') }]).run('spec-muse-chat-error-model')).status, 'abnormal')
    const param = await harness([{ status: 400, data: { error: { message: '`top_p`: The number must be `<= 1.0`.', type: 'invalid_request_error', param: 'top_p', code: null } } }]).run('spec-muse-anthropic-error-param')
    assert.equal(param.status, 'passed')
    const noParam = await harness([{ status: 400, data: err('bad top_p') }]).run('spec-muse-chat-error-param')
    assert.match(noParam.detail, /error\.param 是 null，官方是 top_p/)
  })

  it('previous_response_id + 加密推理：对照拿不到 id 记依据不足，拿到后 400 通过', async () => {
    assert.equal((await harness([{ status: 400, data: err('store not supported') }]).run('spec-muse-responses-prev-id-encrypted')).status, 'inconclusive')
    const h = harness([{ status: 200, data: respOk('OK') }, { status: 400, data: err('cannot combine') }])
    assert.equal((await h.run('spec-muse-responses-prev-id-encrypted')).status, 'passed')
    assert.deepEqual(h.sent[1].body!.include, ['reasoning.encrypted_content'])
    assert.equal(h.sent[1].body!.previous_response_id, 'resp_6ad0c901a175184c0647496d')
  })

  it('超时、停止沿用通用规则', async () => {
    assert.equal((await harness([{ transport: 'timeout' }]).run('spec-muse-chat-n2')).status, 'abnormal')
    assert.equal((await harness([{ transport: 'stopped' }]).run('spec-muse-chat-n2')).status, 'skipped')
    assert.equal((await harness([{ transport: 'network' }]).run('spec-muse-responses-store-chain')).status, 'abnormal')
  })
})

describe('官方支持项的核对', () => {
  const one = async (id: string, data: unknown, status = 200) => harness([{ status, data }]).run(id)
  const call = (name: string, i = 0) => ({ id: `c${i}`, type: 'function', function: { name, arguments: name === 'get_weather' ? '{"city":"Shanghai","date":"2026-10-20"}' : '{"order_id":"SN1"}' } })

  it('并行工具：同一轮两个调用通过；关闭并行后恰好一个', async () => {
    assert.equal((await one('spec-muse-chat-parallel-tools', chatOk('', { tool_calls: [call('get_weather'), call('query_order', 1)] }))).status, 'passed')
    assert.equal((await one('spec-muse-chat-parallel-tools', chatOk('', { tool_calls: [call('get_weather')] }))).status, 'failed')
    assert.equal((await one('spec-muse-chat-parallel-off', chatOk('', { tool_calls: [call('get_weather')] }))).status, 'passed')
    assert.equal((await one('spec-muse-chat-parallel-off', chatOk('', { tool_calls: [call('get_weather'), call('query_order', 1)] }))).status, 'failed')
    assert.equal((await one('spec-muse-anthropic-disable-parallel', msgOk([{ type: 'tool_use', id: 't', name: 'get_weather', input: {} }]))).status, 'passed')
  })

  it('strict 函数、custom 工具、tool_search、tool_choice any / none、computer use', async () => {
    assert.equal((await one('spec-muse-chat-strict-tool', chatOk('', { tool_calls: [call('get_weather')] }))).status, 'passed')
    assert.equal((await one('spec-muse-responses-custom-tool', respOk('', {}, [{ type: 'custom_tool_call', name: 'echo_text', input: 'hello muse' }]))).status, 'passed')
    assert.equal((await one('spec-muse-responses-tool-search', respOk('', {}, [{ type: 'tool_search_call', paths: ['list_open_orders'] }]))).status, 'passed')
    assert.equal((await one('spec-muse-responses-tool-search', respOk('No tools.'))).status, 'failed')
    // Messages 的 tool_search 写法是推断的：失败只记依据不足
    assert.equal((await one('spec-muse-anthropic-tool-search', msgOk([{ type: 'text', text: 'none' }]))).status, 'inconclusive')
    assert.equal((await one('spec-muse-anthropic-tool-search', msgOk([{ type: 'tool_use', id: 't', name: 'list_open_orders', input: {} }]))).status, 'passed')
    assert.equal((await one('spec-muse-anthropic-tool-choice-any', msgOk([{ type: 'tool_use', id: 't', name: 'get_weather', input: {} }]))).status, 'passed')
    assert.equal((await one('spec-muse-anthropic-tool-choice-any', msgOk([{ type: 'text', text: 'OK' }]))).status, 'failed')
    assert.equal((await one('spec-muse-anthropic-tool-choice-none', msgOk([{ type: 'text', text: 'Sunny' }]))).status, 'passed')
    assert.equal((await one('spec-muse-responses-computer-use', respOk('', {}, [{ type: 'computer_call', call_id: 'c', actions: [{ type: 'click', x: 160, y: 130 }] }]))).status, 'passed')
    assert.equal((await one('spec-muse-responses-computer-use', respOk('I would click Continue.'))).status, 'failed')
  })

  it('联网：要有原生证据；openrouter:web_search 这类中间层插件记失败', async () => {
    const ws = respOk('Headline', {}, [{ type: 'web_search_call', status: 'completed', results: [{ type: 'result', url: 'https://x', title: 't', snippet: 's' }] }])
    assert.equal((await one('spec-muse-responses-web-search-options', ws)).status, 'passed')
    const noResults = respOk('Headline', {}, [{ type: 'web_search_call', status: 'completed' }])
    assert.match((await one('spec-muse-responses-web-search-options', noResults)).detail, /没有 results/)
    const proxy = msgOk([{ type: 'server_tool_use', id: 'ws_call_01', name: 'openrouter:web_search', input: { query: 'news' } }, { type: 'text', text: 'Headline' }])
    const out = await one('spec-muse-anthropic-web-search-location', proxy)
    assert.equal(out.status, 'failed')
    assert.match(out.detail, /中间层插件 openrouter:web_search/)
    assert.equal((await one('spec-muse-anthropic-web-search-location', msgOk([{ type: 'server_tool_use', name: 'web_search', input: {} }]))).status, 'passed')
    assert.deepEqual(museSearchEvidence('anthropic', proxy), { found: false, proxy: 'openrouter:web_search', results: 0 })
  })

  it('多模态：回 NONE 说明附件没送到，接受类记失败、推断写法记依据不足', async () => {
    const none = await one('spec-muse-responses-audio', respOk('NONE'))
    assert.equal(none.status, 'failed')
    assert.match(none.detail, /没有收到音频/)
    assert.equal((await one('spec-muse-chat-audio', chatOk(String(ctx.beeps)))).status, 'passed')
    assert.equal((await one('spec-muse-chat-pdf', chatOk(ctx.code))).status, 'passed')
    assert.equal((await one('spec-muse-anthropic-pdf', msgOk([{ type: 'text', text: 'NONE' }]))).status, 'inconclusive')
    assert.equal((await one('spec-muse-anthropic-video', msgOk([{ type: 'text', text: 'Blue' }]))).status, 'passed')
    assert.equal((await one('spec-muse-chat-video', { error: { message: 'Invalid input' } }, 400)).status, 'inconclusive')
    assert.equal(museSaidNone(' none. '), true)
    assert.equal(museSaidNone('none of the frames are red'), false)
  })

  it('thinking 变体两发都要 2xx', async () => {
    const h = harness([{ status: 200, data: msgOk([{ type: 'text', text: 'OK' }]) }, { status: 200, data: msgOk([{ type: 'text', text: 'OK' }]) }])
    assert.equal((await h.run('spec-muse-anthropic-thinking-variants')).status, 'passed')
    assert.deepEqual(h.sent.map(r => r.body!.thinking), [{ type: 'adaptive', display: 'omitted' }, { type: 'enabled', budget_tokens: 1024 }])
    assert.equal((await harness([{ status: 200, data: msgOk([]) }, { status: 400, data: err('budget') }]).run('spec-muse-anthropic-thinking-variants')).status, 'failed')
  })
})

describe('身份证据：只认命中', () => {
  it('加密推理块前缀：命中通过；拿不到、前缀不同、非 2xx 只记依据不足', async () => {
    assert.equal(MUSE_FINGERPRINTS.encryptedPrefix.confirmed, true)
    const hit = await harness([{ status: 200, data: respOk('OK', {}, [{ type: 'reasoning', summary: [], encrypted_content: BLOB }]) }]).run('spec-muse-identity-encrypted')
    assert.equal(hit.status, 'passed')
    const fernet = await harness([{ status: 200, data: respOk('OK', {}, [{ type: 'reasoning', summary: [], encrypted_content: 'gAAAAABoZ9x' }]) }]).run('spec-muse-identity-encrypted')
    assert.equal(fernet.status, 'inconclusive')
    assert.match(fernet.detail, /gAAAAABo/)
    assert.equal((await harness([{ status: 200, data: respOk('OK') }]).run('spec-muse-identity-encrypted')).status, 'inconclusive')
    assert.equal((await harness([{ status: 400, data: err('include not supported') }]).run('spec-muse-identity-encrypted')).status, 'inconclusive')
    assert.equal((await harness([{ status: 500, data: err('x') }]).run('spec-muse-identity-encrypted')).status, 'abnormal')
    // Chat 适配层的 reasoning_details 也收
    assert.deepEqual(museEncryptedBlobs(chatOk('OK', { reasoning_details: [{ type: 'reasoning.encrypted', data: BLOB, format: 'meta-responses-v1' }] })), [BLOB])
    assert.equal(scoreMuseEncryptedPrefix([BLOB, 'gAAAA']).status, 'inconclusive')
  })

  it('Token 指纹：基线未确认时只报差值，记依据不足', async () => {
    assert.equal(MUSE_FINGERPRINTS.tokenDelta.confirmed, false)
    const h = harness([{ status: 200, data: chatOk('OK') }, { status: 200, data: chatOk('OK', {}, { prompt_tokens: 212 }) }])
    const out = await h.run('spec-muse-chat-identity-tokens')
    assert.equal(out.status, 'inconclusive')
    assert.match(out.detail, /差值 200/)
    assert.ok(String(h.sent[1].body!.messages[0].content).startsWith(MUSE_TOKEN_FINGERPRINT_TEXT))
    assert.equal(scoreMuseTokenDelta('chat', 12, null).status, 'inconclusive')
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

  it('computer use 截图：合法 PNG，320×200', () => {
    const png = Buffer.from(MUSE_CONTINUE_PNG_B64, 'base64')
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.toString('ascii', 12, 16), 'IHDR')
    assert.equal(png.readUInt32BE(16), 320)
    assert.equal(png.readUInt32BE(20), 200)
    assert.ok(png.length < 2048)
  })

  it('Token 指纹文本固定不变（改动要重新校准基线）', () => {
    assert.equal(MUSE_TOKEN_FINGERPRINT_TEXT.length, 439)
    assert.match(MUSE_TOKEN_FINGERPRINT_TEXT, /^Tokenizer fingerprint v1\./)
    for (const piece of ['龘靐齉爩', '東京スカイツリー', '👩🏽‍💻', '9007199254740993', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢']) assert.ok(MUSE_TOKEN_FINGERPRINT_TEXT.includes(piece), piece)
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
    // OpenRouter 用自家插件代搜：server_tool_use 名字带 openrouter: 前缀，不算 Meta 原生，单独记失败
    const proxied = { type: 'message', content: [{ type: 'server_tool_use', id: 'ws_call_01', name: 'openrouter:web_search', input: { query: 'news' } }, { type: 'text', text: 'Headline' }] }
    assert.equal(nativeToolProxyName(proxied, spec), 'openrouter:web_search')
    const proxyCheck = oracleNativeToolEvidence(proxied, spec)
    assert.equal(proxyCheck.passed, false)
    assert.equal(proxyCheck.id, 'native_tool_proxy')
    assert.match(proxyCheck.detail, /中间层插件 openrouter:web_search/)
    // 原名在场就不算代搜；Responses 那条不查
    assert.equal(nativeToolProxyName({ content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'server_tool_use', name: 'x:web_search' }] }, spec), null)
    assert.equal(nativeToolProxyName(proxied, builtinCaseById('native-meta-web_search')!), null)
    assert.equal(matchBuiltinToolCases('muse-wonder-1.0-2026-10-12').length, 2)
    assert.equal(matchBuiltinToolCases('muse-spark-1.3').length, 0)
    assert.equal(matchBuiltinToolCases('muse-wonder-full').length, 0)
  })
})
