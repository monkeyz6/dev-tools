import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setProbeAnthropicCapField } from './protocol.ts'
import { probeKeptResponseBody, probeNon2xxResponseBody, probeTopPRangeBody, scoreTopPRange } from './negative.ts'

describe('scoreTopPRange', () => {
  it('其它 4xx 通过，2xx 失败', () => {
    assert.equal(scoreTopPRange(400, 'http').status, 'passed')
    assert.equal(scoreTopPRange(422, 'http').status, 'passed')
    assert.match(scoreTopPRange(400, 'http').detail, /HTTP 400/)
    assert.equal(scoreTopPRange(200, 'http').status, 'failed')
    assert.equal(scoreTopPRange(201, 'http').status, 'failed')
    assert.match(scoreTopPRange(200, 'http').detail, /被接受/)
  })

  it('鉴权、408、429、5xx 和其它状态记异常', () => {
    assert.equal(scoreTopPRange(401, 'http').status, 'abnormal')
    assert.equal(scoreTopPRange(403, 'http').status, 'abnormal')
    assert.match(scoreTopPRange(401, 'http').detail, /鉴权/)
    assert.equal(scoreTopPRange(408, 'http').status, 'abnormal')
    assert.equal(scoreTopPRange(429, 'http').status, 'abnormal')
    assert.equal(scoreTopPRange(500, 'http').status, 'abnormal')
    assert.equal(scoreTopPRange(302, 'http').status, 'abnormal')
    assert.match(scoreTopPRange(500, 'http').detail, /HTTP 500/)
  })

  it('超时和网络错误记异常，不看成 4xx', () => {
    assert.equal(scoreTopPRange(0, 'timeout').status, 'abnormal')
    assert.match(scoreTopPRange(0, 'timeout').detail, /超时/)
    assert.equal(scoreTopPRange(null, 'network').status, 'abnormal')
    assert.match(scoreTopPRange(null, 'network').detail, /网络/)
  })
})

describe('probeTopPRangeBody', () => {
  it('Anthropic 固定 max_tokens，即使本轮已经改用 max_completion_tokens', () => {
    setProbeAnthropicCapField('max_completion_tokens')
    try {
      const body = probeTopPRangeBody('anthropic', 'gpt-5')
      assert.equal(body.top_p, 2)
      assert.equal(body.max_tokens, 120)
      assert.equal(body.max_completion_tokens, undefined)
      assert.equal(body.model, 'gpt-5')
    } finally {
      setProbeAnthropicCapField('max_tokens')
    }
  })

  it('Chat 和 Responses 只在基础体上加 top_p', () => {
    const chat = probeTopPRangeBody('chat', 'probe-model')
    assert.equal(chat.top_p, 2)
    assert.equal(chat.max_tokens, undefined)
    assert.deepEqual(chat.messages, [{ role: 'user', content: 'Reply with exactly: OK' }])
    const responses = probeTopPRangeBody('responses', 'probe-model')
    assert.equal(responses.top_p, 2)
    assert.equal(responses.input, 'Reply with exactly: OK')
  })
})

describe('probeNon2xxResponseBody', () => {
  it('非 2xx 原样留下，2xx 和状态 0 不留', () => {
    const body = { error: { message: 'nope' }, extra: 'x'.repeat(40) }
    assert.equal(probeNon2xxResponseBody(400, body), body)
    assert.equal(probeNon2xxResponseBody(500, 'raw text'), 'raw text')
    assert.equal(probeNon2xxResponseBody(401, null), null)
    assert.equal(probeNon2xxResponseBody(200, body), undefined)
    assert.equal(probeNon2xxResponseBody(204, body), undefined)
    assert.equal(probeNon2xxResponseBody(0, body), undefined)
    assert.equal(probeNon2xxResponseBody(null, body), undefined)
  })
})

describe('probeKeptResponseBody', () => {
  it('2xx 正文留下，非 2xx 的空正文也留下，未发出的 null 不写', () => {
    const body = { choices: [{ message: { content: 'OK' } }] }
    assert.equal(probeKeptResponseBody(200, body), body)
    assert.equal(probeKeptResponseBody(204, 'raw'), 'raw')
    assert.equal(probeKeptResponseBody(401, null), null)
    assert.equal(probeKeptResponseBody(200, null), undefined)
    assert.deepEqual(probeKeptResponseBody(0, { error: '请求超时或已中止' }), { error: '请求超时或已中止' })
    assert.equal(probeKeptResponseBody(0, null), undefined)
    assert.equal(probeKeptResponseBody(null, null), undefined)
  })
})
