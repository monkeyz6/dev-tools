import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decideOrigin, probeRefreshedOrigin, probeShownSource, signalsFromProbeLogs, type ProbeOriginLog } from './origin.ts'
import { probeProtocolOf, setProbeAnthropicCapField } from './protocol.ts'
import {
  aggregateProbeStatus, anthropicBaseBlocked, anthropicCapAction, anthropicMaxTokensConclusion,
  basicProtocolGate, decideFamily, profileFromName, reclassifyExpected, scoreProtocolGate,
} from './profiles.ts'
import { probeEmptyUsage, probeMergeUsage, probeSoleParamMatch } from './protocol.ts'

const shortOk = (format: 'chat' | 'responses', extra: Record<string, unknown> = {}): ProbeOriginLog => ({
  url: format === 'chat' ? 'https://www.amutes.com/v1/chat/completions' : 'https://www.amutes.com/v1/responses',
  status: 200,
  resultKey: format === 'chat' ? 'chat-basic' : 'responses-basic',
  format,
  requestBody: format === 'chat'
    ? { model: 'gpt-6-sol', messages: [{ role: 'user', content: 'Reply with exactly: OK' }] }
    : { model: 'gpt-6-sol', input: 'Reply with exactly: OK' },
  responseHeaders: { 'content-type': 'application/json', 'content-length': '120' },
  responseBody: extra,
  usage: { input: 11 },
})

describe('gpt-6-sol 样本', () => {
  const logs: ProbeOriginLog[] = [
    shortOk('chat', {
      id: 'chatcmpl-x',
      model: 'gpt-6-sol-2026-09-22',
      system_fingerprint: null,
      prompt_filter_results: [{ content_filter_results: { hate: { filtered: false } } }],
      routing: { serving_pipereplica: 'd20260922' },
      usage: { prompt_tokens: 11, completion_tokens: 4, latency_checkpoint: { engine_ttft_ms: 1 } },
    }),
    shortOk('responses', {
      id: 'resp_x',
      model: 'gpt-6-sol',
      content_filters: [{ blocked: false }],
      reasoning: { effort: 'medium' },
      usage: { input_tokens: 11, input_tokens_details: { cache_write_tokens: 2887, cached_tokens: 0 } },
    }),
    {
      url: 'https://www.amutes.com/v1/messages',
      status: 400,
      resultKey: 'anthropic-basic',
      format: 'anthropic',
      requestBody: { model: 'gpt-6-sol', max_tokens: 120 },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead. (request id: 202609290856089739609938268d9d6zaUnDTW4)",
      },
      usage: { input: null },
    },
    {
      url: 'https://www.amutes.com/v1/chat/completions',
      status: 400,
      resultKey: 'temperature@chat',
      format: 'chat',
      requestBody: { model: 'gpt-6-sol', temperature: 0.2 },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." },
      },
      usage: { input: null },
    },
    {
      url: 'https://www.amutes.com/v1/chat/completions',
      status: 400,
      resultKey: 'error-shape@chat',
      format: 'chat',
      requestBody: { model: 'modelprobe-intentionally-invalid-model' },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        error: { message: '分组 az 下模型 modelprobe-intentionally-invalid-model 无可用渠道（distributor） (request id: 202609290857345229359888268d9d6dAK1kcCp)' },
      },
      usage: { input: null },
    },
    {
      url: 'https://www.amutes.com/v1/responses',
      status: 400,
      resultKey: 'origin-sticky@responses',
      format: 'responses',
      requestBody: { model: 'gpt-6-sol', previous_response_id: 'resp_x' },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        error: { message: 'The requested item was created under a different Azure OpenAI resource. Use the same resource that created the item to access it.' },
      },
      usage: { input: null },
    },
  ]

  const signals = signalsFromProbeLogs({ requestModel: 'gpt-6-sol', baseUrl: 'https://www.amutes.com', logs })

  it('家族是 GPT 推理，依据含强名称和行为', () => {
    const family = decideFamily(signals)
    assert.equal(family.label, 'GPT 推理')
    assert.equal(family.profile, 'reasoning')
    assert.equal(family.variant, 'reasoning')
    assert.equal(family.conflict, false)
    assert.ok(family.reasons.some(r => r.includes('强名称') && r.includes('gpt-6-sol')))
    assert.ok(family.reasons.some(r => r.includes('max_completion_tokens')))
    assert.ok(family.reasons.some(r => r.includes('temperature')))
    assert.ok(family.reasons.some(r => r.includes('reasoning.effort')))
  })

  it('接入层是网关，上游是 Azure，两层各自列依据', () => {
    const origin = decideOrigin(signals)
    assert.equal(origin.access.label, '网关')
    assert.ok(origin.access.reasons.some(r => r.includes('分组')))
    assert.ok(origin.access.reasons.some(r => r.includes('distributor')))
    assert.equal(origin.upstream.label, 'Azure OpenAI')
    assert.equal(origin.upstream.reasons.some(r => r.includes('Chat Completions')), false)
    assert.ok(origin.upstream.reasons.some(r => r.includes('prompt_filter_results')))
    assert.ok(origin.upstream.reasons.some(r => r.includes('content_filters')))
    assert.ok(origin.upstream.reasons.some(r => r.includes('serving_pipereplica')))
    assert.ok(origin.upstream.reasons.some(r => r.includes('Azure OpenAI resource')))
  })

  it('temperature 被拒改写成符合预期', () => {
    const family = decideFamily(signals)
    const origin = decideOrigin(signals)
    const next = reclassifyExpected('temperature@chat', {
      status: 'unsupported',
      detail: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.",
      format: 'chat',
    }, family, origin)
    assert.equal(next?.status, 'expected')
    assert.match(next?.detail || '', /不接受该 temperature/)
  })

  it('Responses 上 temperature 整段不支持也算符合预期', () => {
    const family = decideFamily(signals)
    const origin = decideOrigin(signals)
    const next = reclassifyExpected('temperature@responses', {
      status: 'unsupported',
      detail: "Unsupported parameter: 'temperature' is not supported with this model.",
      format: 'responses',
    }, family, origin)
    assert.equal(next?.status, 'expected')
  })

  it('top_p 越界不走预期拒绝改判', () => {
    const family = decideFamily(signals)
    const origin = decideOrigin(signals)
    const rejected = reclassifyExpected('top_p_range@chat', {
      status: 'failed',
      detail: '失败：top_p=2 被接受（HTTP 200）',
      format: 'chat',
      repro: { status: 200 },
    }, family, origin)
    assert.equal(rejected, null)
    const passed = reclassifyExpected('top_p_range@chat', {
      status: 'passed',
      detail: '通过：非法 top_p 返回 HTTP 400',
      format: 'chat',
      repro: { status: 400 },
    }, family, origin)
    assert.equal(passed, null)
  })

  it('推理模型接受了 temperature 则改判异常', () => {
    const family = decideFamily(signals)
    const origin = decideOrigin(signals)
    const next = reclassifyExpected('temperature@chat', {
      status: 'passed',
      detail: '组合请求通过',
      format: 'chat',
    }, family, origin)
    assert.equal(next?.status, 'abnormal')
    assert.match(next?.detail || '', /不应接受 temperature/)
  })

  it('Chat 上工具与 reasoning_effort 互斥算符合预期，单独通过不改判', () => {
    const family = decideFamily(signals)
    const origin = decideOrigin(signals)
    const err = "Function tools with reasoning_effort are not supported for gpt-6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."
    const rejected = reclassifyExpected('tool_calling@chat', {
      status: 'unsupported', detail: err, format: 'chat',
    }, family, origin)
    assert.equal(rejected?.status, 'expected')
    const passed = reclassifyExpected('tool_calling@chat', {
      status: 'passed', detail: '独立降级请求通过。组合互斥符合预期，已拆开重测。', format: 'chat',
    }, family, origin)
    assert.equal(passed, null)
  })
})

describe('家族边界', () => {
  it('claude-opus-4-5 强名称归 Claude', () => {
    const family = decideFamily(signalsFromProbeLogs({
      requestModel: 'claude-opus-4-5',
      baseUrl: 'https://api.anthropic.com',
      logs: [],
    }))
    assert.equal(family.label, 'Claude')
    assert.equal(family.conflict, false)
  })

  it('名字像 GPT、响应却是 Anthropic 时家族不确定', () => {
    const family = decideFamily(signalsFromProbeLogs({
      requestModel: 'gpt-4o',
      baseUrl: 'https://api.anthropic.com',
      logs: [{
        url: 'https://api.anthropic.com/v1/messages',
        status: 200,
        resultKey: 'anthropic-basic',
        format: 'anthropic',
        requestBody: { model: 'gpt-4o', max_tokens: 120 },
        responseHeaders: { 'request-id': 'req_abc' },
        responseBody: { model: 'claude-opus-4-5-20251101', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } },
        usage: { input: 10 },
      }],
    }))
    assert.equal(family.label, '不确定')
    assert.equal(family.conflict, true)
    assert.ok(family.reasons.some(r => r.includes('gpt-4o')))
    assert.ok(family.reasons.some(r => r.includes('Anthropic')))
  })
})

describe('来源边界', () => {
  it('短提示 Token 很高时接入层是 Codex 反代，模型名里的 codex 不算依据', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'gpt-5-codex',
      baseUrl: 'https://proxy.example',
      logs: [{
        url: 'https://proxy.example/v1/responses',
        status: 200,
        resultKey: 'responses-basic',
        format: 'responses',
        requestBody: { model: 'gpt-5-codex', input: 'Reply with exactly: OK' },
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { model: 'gpt-5-codex', usage: { input_tokens: 640, output_tokens: 2 } },
        usage: { input: 640 },
      }],
    }))
    assert.equal(origin.access.label, 'Codex 反代')
    assert.equal(origin.access.reasons.some(r => r.includes('模型名')), false)
    assert.ok(origin.access.reasons.some(r => r.includes('640')))
  })

  it('gpt-5.3-codex 打到官方主机仍是直连，不因名字判成反代', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'gpt-5.3-codex',
      baseUrl: 'https://api.openai.com',
      logs: [{
        url: 'https://api.openai.com/v1/responses',
        status: 200,
        resultKey: 'responses-basic',
        format: 'responses',
        requestBody: { model: 'gpt-5.3-codex', input: 'Reply with exactly: OK' },
        responseHeaders: { 'content-type': 'application/json', 'openai-organization': 'org-live' },
        responseBody: { model: 'gpt-5.3-codex', usage: { input_tokens: 12, output_tokens: 2 } },
        usage: { input: 12 },
      }],
    }))
    assert.equal(origin.access.label, '官方直连')
    assert.equal(origin.access.reasons.some(r => /codex/i.test(r)), false)
  })

  it('Codex 注入和官方组织头打架时接入层混合', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'gpt-5.1',
      baseUrl: 'https://proxy.example',
      logs: [{
        url: 'https://proxy.example/v1/responses',
        status: 200,
        resultKey: 'responses-basic',
        format: 'responses',
        requestBody: { model: 'gpt-5.1', input: 'Reply with exactly: OK' },
        responseHeaders: { 'content-type': 'application/json', 'openai-organization': 'org-live' },
        responseBody: { model: 'gpt-5.1' },
        usage: { input: 900 },
      }],
    }))
    assert.equal(origin.access.label, '混合')
    assert.ok(origin.access.reasons.some(r => r.includes('900')))
    assert.ok(origin.access.reasons.some(r => r.includes('openai-organization')))
  })

  it('Azure 内容过滤和 OpenAI 组织头同时出现时上游混合', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'gpt-5',
      baseUrl: 'https://proxy.example',
      logs: [{
        url: 'https://proxy.example/v1/chat/completions',
        status: 200,
        resultKey: 'chat-basic',
        format: 'chat',
        requestBody: { model: 'gpt-5', messages: [{ role: 'user', content: 'Reply with exactly: OK' }] },
        responseHeaders: { 'openai-organization': 'org-live', 'content-type': 'application/json' },
        responseBody: { model: 'gpt-5', prompt_filter_results: [{}] },
        usage: { input: 11 },
      }],
    }))
    assert.equal(origin.upstream.label, '混合')
    assert.ok(origin.upstream.reasons.some(r => r.includes('prompt_filter_results')))
    assert.ok(origin.upstream.reasons.some(r => r.includes('openai-organization')))
  })

  it('req_ 配上 Chat Completions 形状是 OpenAI 官方，不是 Anthropic', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'gpt-5.6-terra',
      baseUrl: 'https://www.amutes.com',
      logs: [{
        url: 'https://www.amutes.com/v1/chat/completions',
        status: 200,
        resultKey: 'temperature@chat',
        format: 'chat',
        requestBody: { model: 'gpt-5.6-terra', messages: [{ role: 'user', content: 'Return a JSON object with ok=true.' }] },
        responseHeaders: { 'content-type': 'application/json', 'request-id': 'req_7c4a8fd042564ffab61635771423cfc7' },
        responseBody: {
          id: 'chatcmpl-ETe3C1QlvB033nIZjWTM8NTvCWRF6',
          object: 'chat.completion',
          model: 'gpt-5.6-terra',
          choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        },
        usage: { input: 27 },
      }],
    }))
    assert.equal(origin.upstream.label, 'OpenAI 官方')
    assert.ok(origin.upstream.reasons.some(r => r.includes('Chat Completions')))
    assert.equal(origin.upstream.reasons.some(r => /req_|Anthropic/.test(r)), false)
  })

  it('带日期的 Claude 响应仍是 Anthropic，req_ 只作补充', () => {
    const origin = decideOrigin(signalsFromProbeLogs({
      requestModel: 'claude-opus-4-5',
      baseUrl: 'https://api.anthropic.com',
      logs: [{
        url: 'https://api.anthropic.com/v1/messages',
        status: 200,
        resultKey: 'anthropic-basic',
        format: 'anthropic',
        requestBody: { model: 'claude-opus-4-5', max_tokens: 120 },
        responseHeaders: { 'request-id': 'req_abc' },
        responseBody: { model: 'claude-opus-4-5-20251101', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } },
        usage: { input: 10 },
      }],
    }))
    assert.equal(origin.upstream.label, 'Anthropic 官方')
    assert.ok(origin.upstream.reasons.some(r => r.includes('claude-opus-4-5-20251101')))
    assert.ok(origin.upstream.reasons.some(r => r.includes('req_')))
  })

  it('来源显示优先 Codex 反代，网关和混合接入仍看上游', () => {
    assert.deepEqual(probeShownSource({
      access: { label: 'Codex 反代', reasons: ['短提示输入 Token 为 640，高于官方基线（约 8–20）'] },
      upstream: { label: 'Azure OpenAI', reasons: ['成功响应含 prompt_filter_results'] },
    }), {
      label: 'Codex 反代',
      reasons: ['短提示输入 Token 为 640，高于官方基线（约 8–20）'],
    })
    assert.equal(probeShownSource({
      access: { label: '网关', reasons: ['错误含「分组」'] },
      upstream: { label: 'OpenAI 官方', reasons: ['响应头 openai-organization'] },
    })?.label, 'OpenAI 官方')
    assert.equal(probeShownSource({
      access: { label: '混合', reasons: ['两边都有'] },
      upstream: { label: 'Azure OpenAI', reasons: ['成功响应含 prompt_filter_results'] },
    })?.label, 'Azure OpenAI')
  })

  it('残留响应体能把存错的 Anthropic 重算成 OpenAI，没有请求则不动', () => {
    const fresh = probeRefreshedOrigin({
      requestModel: 'gpt-5.6-terra',
      baseUrl: 'https://www.amutes.com',
      verdict: {
        access: { label: '官方直连', reasons: ['响应头 request-id 为 req_'] },
        upstream: { label: 'Anthropic 官方', reasons: ['响应头 request-id 为 req_'] },
      },
      results: {
        'chat-basic': {
          format: 'chat',
          usage: { input: 27 },
          repro: {
            url: 'https://www.amutes.com/v1/chat/completions',
            status: 200,
            body: { model: 'gpt-5.6-terra' },
            requestId: 'req_7c4a8fd042564ffab61635771423cfc7',
            responseHeaders: { 'request-id': 'req_7c4a8fd042564ffab61635771423cfc7' },
            responseBody: { id: 'chatcmpl-ETe3', object: 'chat.completion', model: 'gpt-5.6-terra' },
          },
        },
      },
    })
    assert.equal(fresh?.upstream.label, 'OpenAI 官方')
    assert.ok(fresh?.upstream.reasons.some(r => r.includes('Chat Completions')))
    assert.equal(probeRefreshedOrigin({
      requestModel: 'gpt-4o',
      baseUrl: 'https://a.example',
      verdict: { upstream: { label: 'OpenAI 官方', reasons: ['响应头 openai-organization'] } },
      results: { 'chat-basic': { format: 'chat', repro: null } },
    }), null)
  })

  it('残留没有机构头时不把混合接入改成 Codex，裸 req_ 也不变成官方直连', () => {
    const mixed = probeRefreshedOrigin({
      requestModel: 'gpt-5.4',
      baseUrl: 'https://gw.example',
      verdict: {
        access: {
          label: '混合',
          reasons: ['短提示输入 Token 为 640，高于官方基线（约 8–20）', '响应头 openai-organization'],
        },
        upstream: { label: 'Azure OpenAI', reasons: ['成功响应含 prompt_filter_results'] },
      },
      results: {
        'chat-basic': {
          format: 'chat',
          usage: { input: 640 },
          repro: {
            url: 'https://gw.example/v1/chat/completions',
            status: 200,
            body: { model: 'gpt-5.4', messages: [{ role: 'user', content: 'Reply with exactly: OK' }] },
            requestId: 'req_not_a_header',
            responseBody: { id: 'chatcmpl-az', object: 'chat.completion', prompt_filter_results: [{}] },
          },
        },
      },
    })
    assert.equal(mixed, null)

    const gateway = probeRefreshedOrigin({
      requestModel: 'gpt-4o',
      baseUrl: 'https://gw.example',
      verdict: {
        access: { label: '网关', reasons: ['错误或响应头指向 new-api / oneapi'] },
        upstream: { label: '不确定', reasons: ['这次响应里没有官方、Azure、Bedrock 或 Vertex 的稳定字段'] },
      },
      results: {
        'chat-basic': {
          format: 'chat',
          usage: { input: 12 },
          repro: {
            url: 'https://gw.example/v1/chat/completions',
            status: 200,
            body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Reply with exactly: OK' }] },
            requestId: 'req_gateway_only',
            responseBody: { id: 'chatcmpl-gw', object: 'chat.completion', model: 'gpt-4o' },
          },
        },
      },
    })
    assert.equal(gateway?.access.label, '网关')
    assert.deepEqual(gateway?.access.reasons, ['错误或响应头指向 new-api / oneapi'])
    assert.equal(gateway?.upstream.label, 'OpenAI 官方')
  })

  it('没有 x-amzn-requestid 时不把 Bedrock 改成 Anthropic，正文里的 Azure 仍能补上上游', () => {
    assert.equal(probeRefreshedOrigin({
      requestModel: 'claude-opus-4-5',
      baseUrl: 'https://gw.example',
      verdict: {
        access: { label: '网关', reasons: ['错误含「分组」'] },
        upstream: { label: 'Bedrock', reasons: ['响应头 x-amzn-requestid'] },
      },
      results: {
        'anthropic-basic': {
          format: 'anthropic',
          repro: {
            url: 'https://gw.example/v1/messages',
            status: 200,
            body: { model: 'claude-opus-4-5' },
            responseBody: { model: 'claude-opus-4-5-20251101', stop_reason: 'end_turn' },
          },
        },
      },
    }), null)

    const azure = probeRefreshedOrigin({
      requestModel: 'gpt-4o',
      baseUrl: 'https://gw.example',
      verdict: {
        access: { label: '网关', reasons: ['错误含「分组」'] },
        upstream: { label: '不确定', reasons: ['这次响应里没有官方、Azure、Bedrock 或 Vertex 的稳定字段'] },
      },
      results: {
        'chat-basic': {
          format: 'chat',
          usage: { input: 12 },
          repro: {
            url: 'https://gw.example/v1/chat/completions',
            status: 200,
            body: { messages: [{ role: 'user', content: 'hi' }] },
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: { id: 'chatcmpl-x', object: 'chat.completion', prompt_filter_results: [{}] },
          },
        },
      },
    })
    assert.equal(azure?.access.label, '网关')
    assert.equal(azure?.upstream.label, 'Azure OpenAI')
  })
})

describe('用例收口', () => {
  it('互斥错误不会同时归给工具和 reasoning_effort', () => {
    const err = "Function tools with reasoning_effort are not supported for gpt-6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."
    assert.equal(probeSoleParamMatch(['tool_calling', 'reasoning_effort', 'temperature'], err, 'chat'), null)
  })

  it('只点名 temperature 时仍归给它', () => {
    const err = "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported."
    assert.equal(probeSoleParamMatch(['temperature', 'top_p', 'tool_calling'], err.toLowerCase(), 'chat'), 'temperature')
  })

  it('Anthropic max_tokens 改口是基础根因', () => {
    assert.equal(anthropicBaseBlocked("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."), true)
    assert.equal(anthropicBaseBlocked('max_tokens: field required'), false)
  })

  it('cache_write_tokens 写入 cacheWrite', () => {
    const usage = probeEmptyUsage()
    probeMergeUsage(usage, { input_tokens: 2890, input_tokens_details: { cache_write_tokens: 2887, cached_tokens: 0 }, output_tokens: 6 })
    assert.equal(usage.cacheRead, 0)
    assert.equal(usage.cacheWrite, 2887)
  })

  it('聚合不把符合预期和未测打成失败，异常盖过通过', () => {
    assert.equal(aggregateProbeStatus(['passed', 'expected']), 'passed')
    assert.equal(aggregateProbeStatus(['expected', 'expected']), 'expected')
    assert.equal(aggregateProbeStatus(['untested', 'passed']), 'passed')
    assert.equal(aggregateProbeStatus(['untested']), 'untested')
    assert.equal(aggregateProbeStatus(['failed', 'expected']), 'failed')
    assert.equal(aggregateProbeStatus(['abnormal', 'passed']), 'abnormal')
    assert.equal(aggregateProbeStatus(['failed', 'abnormal']), 'failed')
    assert.equal(aggregateProbeStatus(['abnormal']), 'abnormal')
  })
})

const MAX_TOKENS_ERR = "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."

describe('名单归类', () => {
  const classic = ['gpt-4.1', 'gpt-4o', 'gpt-4o-2024-08-06', 'openai/gpt-4.1']
  const reasoning = [
    'gpt-5', 'gpt-5-mini', 'gpt-5-pro', 'gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5',
    'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6-sol-2026-09-22',
  ]
  const claude = [
    'claude-fable-5', 'claude-fable-5-1', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001',
    'claude-opus-4-5-20251101', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8',
    'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-6',
    'claude-sonnet-5', 'claude-sonnet-5-5',
  ]

  it('经典、推理、Codex 产品线、Claude 各归其档', () => {
    for (const name of classic) assert.equal(profileFromName(name), 'classic', name)
    for (const name of reasoning) assert.equal(profileFromName(name), 'reasoning', name)
    assert.equal(profileFromName('gpt-5.3-codex'), 'codex')
    for (const name of claude) assert.equal(profileFromName(name), 'claude', name)
    assert.equal(profileFromName('probe-model'), 'unknown')
    assert.equal(profileFromName('gpt-4o-mini'), 'unknown')
  })

  it('gpt-4o 即使拒绝 temperature 也保持经典档，不改判符合预期', () => {
    const family = decideFamily(signalsFromProbeLogs({
      requestModel: 'gpt-4o',
      baseUrl: 'https://proxy.example',
      logs: [{
        url: 'https://proxy.example/v1/chat/completions',
        status: 400,
        resultKey: 'temperature@chat',
        format: 'chat',
        requestBody: { model: 'gpt-4o', temperature: 0.2 },
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." } },
        usage: { input: null },
      }],
    }))
    assert.equal(family.profile, 'classic')
    assert.equal(family.label, 'GPT 经典')
    assert.ok(family.reasons.some(r => r.includes('经典系列，但响应表现像推理模型')))
    const next = reclassifyExpected('temperature@chat', {
      status: 'unsupported',
      detail: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.",
      format: 'chat',
    }, family, { access: { id: 'gateway', label: '网关', reasons: [] } })
    assert.equal(next, null)
  })
})

describe('Anthropic 上限字段', () => {
  it('推理档和未知名字重试，经典档和 Claude 停住', () => {
    assert.equal(anthropicCapAction('reasoning', MAX_TOKENS_ERR), 'retry')
    assert.equal(anthropicCapAction('codex', MAX_TOKENS_ERR), 'retry')
    assert.equal(anthropicCapAction('unknown', MAX_TOKENS_ERR), 'retry')
    assert.equal(anthropicCapAction('classic', MAX_TOKENS_ERR), 'stop')
    assert.equal(anthropicCapAction('claude', MAX_TOKENS_ERR), 'stop')
    assert.equal(anthropicCapAction('reasoning', 'max_tokens: field required'), 'none')
  })

  it('重试成功后 max_tokens 行在勾选预期拒绝时记符合预期，未勾选记不支持', () => {
    const row = anthropicMaxTokensConclusion('reasoning', MAX_TOKENS_ERR, true)
    assert.equal(row?.status, 'expected')
    assert.equal(anthropicMaxTokensConclusion('reasoning', MAX_TOKENS_ERR, false)?.status, 'unsupported')
    assert.equal(anthropicMaxTokensConclusion('unknown', MAX_TOKENS_ERR)?.status, 'unsupported')
    assert.equal(anthropicMaxTokensConclusion('classic', MAX_TOKENS_ERR), null)
    assert.equal(anthropicCapAction('reasoning', MAX_TOKENS_ERR), 'retry')
  })

  it('切换后 Anthropic 基础体使用 max_completion_tokens', () => {
    setProbeAnthropicCapField('max_completion_tokens')
    try {
      const body = probeProtocolOf('anthropic').baseBody('gpt-6-sol', 'hi')
      assert.equal(body.max_completion_tokens, 120)
      assert.equal(body.max_tokens, undefined)
    } finally {
      setProbeAnthropicCapField('max_tokens')
    }
  })
})

describe('协议预期拒绝', () => {
  it('Codex 产品线的 Chat 404 挡住后续，2xx 记为不该成功', () => {
    assert.equal(basicProtocolGate('codex', 'chat', false, 404, 'not found', false), 'block')
    assert.equal(basicProtocolGate('codex', 'chat', true, 200, '', false), 'reject-success')
    assert.equal(basicProtocolGate('codex', 'responses', false, 404, 'not found', false), null)
  })

  it('官方 Claude 的 Chat / Responses 404 挡住后续，网关上的 404 不挡', () => {
    assert.equal(basicProtocolGate('claude', 'chat', false, 404, '', true), 'block')
    assert.equal(basicProtocolGate('claude', 'responses', false, 404, '', true), 'block')
    assert.equal(basicProtocolGate('claude', 'chat', false, 404, '', false), null)
    assert.equal(basicProtocolGate('claude', 'chat', true, 200, '', false), null)
  })

  it('预期拒绝未勾选时，协议缺失记不支持，不该成功的 2xx 不改判', () => {
    assert.equal(scoreProtocolGate('block', false), 'unsupported')
    assert.equal(scoreProtocolGate('reject-success', false), null)
    assert.equal(scoreProtocolGate('block', true), 'expected')
    assert.equal(scoreProtocolGate('reject-success', true), 'abnormal')
    assert.equal(scoreProtocolGate(null, true), null)
  })
})
