import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { probeChatMaxTokenBlame } from './protocol.ts'
import {
  PROBE_OUTPUT_LIMIT_DETAIL,
  probeOutputLimitReached,
  probeRescoreOutputLimitResults,
} from './oracles.ts'

const LIMIT_MESSAGE = 'Could not finish the message because max_tokens or model output limit was reached. Please try again with higher max_tokens.'
const LIMIT_BODY = {
  error: {
    message: LIMIT_MESSAGE,
    type: 'invalid_request_error',
    param: '',
    code: null,
  },
}

describe('输出额度用尽', () => {
  it('只认额度耗尽这一句', () => {
    assert.equal(probeOutputLimitReached(LIMIT_MESSAGE), true)
    assert.equal(probeOutputLimitReached(LIMIT_MESSAGE.toUpperCase()), true)
    assert.equal(probeOutputLimitReached(JSON.stringify(LIMIT_BODY)), true)
    assert.equal(probeOutputLimitReached(LIMIT_BODY), true)
    assert.equal(probeOutputLimitReached(JSON.stringify(LIMIT_BODY.error, null, 2)), true)
    assert.equal(probeOutputLimitReached(LIMIT_MESSAGE.slice(0, 80)), false)
    assert.equal(probeOutputLimitReached("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."), false)
    assert.equal(probeOutputLimitReached('Cannot specify both max_tokens and max_completion_tokens'), false)
    assert.equal(probeOutputLimitReached('upstream error: do request failed (request id: 202609291715298694339828268d9d6XtKpv4iB)'), false)
    assert.equal(probeOutputLimitReached('Please try again with higher max_tokens.'), false)
  })

  it('字段归因仍把这句看成 max_tokens，语义请求要先拦住', () => {
    assert.equal(probeChatMaxTokenBlame(LIMIT_MESSAGE), 'max_tokens')
    assert.equal(probeChatMaxTokenBlame("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."), 'max_tokens')
  })

  it('历史里的 Token 上限失败改成通过，其它格不动', () => {
    const accepted = '独立降级请求通过；接受 max_completion_tokens（已排除 max_tokens） 组合互斥符合预期，已拆开重测。'
    const chat = {
      status: 'failed',
      detail: `${accepted}，但${JSON.stringify(LIMIT_BODY, null, 2)}`,
      checks: [
        { id: 'accepted', passed: true, detail: accepted },
        { id: 'truncation', passed: false, detail: LIMIT_MESSAGE.slice(0, 80) },
      ],
      repro: {
        responseBody: LIMIT_BODY,
        body: { model: 'gpt-5.6-terra', max_completion_tokens: 16 },
        status: 400,
      },
    }
    const responses = {
      status: 'failed',
      detail: 'upstream error: do request failed',
      checks: [
        { id: 'accepted', passed: true, detail: '组合请求通过' },
        { id: 'truncation', passed: false, detail: 'upstream error: do request failed' },
      ],
      repro: { responseBody: { error: { message: 'upstream error: do request failed' } }, status: 500 },
    }
    const hidden = { status: 'unsupported', detail: '无原生 response_format', checks: [], repro: null }
    const rejected = {
      status: 'failed',
      detail: `${LIMIT_MESSAGE} Token 上限字段均被拒绝`,
      checks: [{ id: 'accepted', passed: false, detail: 'Token 上限字段均被拒绝' }],
      repro: { responseBody: LIMIT_BODY },
    }
    const input = {
      'max_tokens@chat': chat,
      'max_tokens@responses': responses,
      'structured_output@anthropic': hidden,
      'max_tokens@anthropic': rejected,
    }
    const next = probeRescoreOutputLimitResults(input)
    assert.ok(next)
    assert.equal(next['max_tokens@chat'].status, 'passed')
    assert.equal(next['max_tokens@chat'].detail, `${accepted}；${PROBE_OUTPUT_LIMIT_DETAIL}`)
    assert.equal(next['max_tokens@chat'].checks?.find(check => check.id === 'truncation')?.passed, true)
    assert.equal(next['max_tokens@chat'].checks?.find(check => check.id === 'accepted')?.detail, accepted)
    assert.equal(next['max_tokens@chat'].repro?.status, 400)
    assert.equal(next['max_tokens@chat'].repro?.body.max_completion_tokens, 16)
    assert.equal(next['max_tokens@responses'], responses)
    assert.equal(next['structured_output@anthropic'], hidden)
    assert.equal(next['max_tokens@anthropic'], rejected)
    assert.equal(chat.status, 'failed')
    assert.equal(chat.checks[1].passed, false)
    assert.equal(probeRescoreOutputLimitResults({ 'tool_calling@chat': responses }), null)
    assert.equal(probeRescoreOutputLimitResults(null), null)
  })

  it('有数字状态时只有 400 改判，5xx 和 2xx 保持失败', () => {
    const failed = (status: number) => ({
      status: 'failed',
      detail: LIMIT_MESSAGE,
      checks: [{ id: 'truncation', passed: false, detail: LIMIT_MESSAGE }],
      repro: { responseBody: LIMIT_BODY, status },
    })
    assert.equal(probeRescoreOutputLimitResults({ 'max_tokens@chat': failed(500) }), null)
    assert.equal(probeRescoreOutputLimitResults({ 'max_tokens@chat': failed(401) }), null)
    assert.equal(probeRescoreOutputLimitResults({ 'max_tokens@chat': failed(200) }), null)
    const missing = {
      status: 'failed',
      detail: LIMIT_MESSAGE,
      checks: [
        { id: 'accepted', passed: true, detail: '组合请求通过' },
        { id: 'truncation', passed: false, detail: LIMIT_MESSAGE },
      ],
      repro: { responseBody: LIMIT_BODY },
    }
    const next = probeRescoreOutputLimitResults({ 'max_tokens@chat': missing })
    assert.equal(next?.['max_tokens@chat'].status, 'passed')
  })
})
