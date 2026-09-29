import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { probeRequestIdFromHeaders, probeRequestIdFromRecord } from './request-id.ts'

describe('probeRequestIdFromRecord', () => {
  it('四个网关头优先于旧的厂商头', () => {
    assert.equal(probeRequestIdFromRecord({
      'x-openai-request-id': 'vendor',
      'x-log-id': 'log-1',
      'request-id': 'req_old',
    }), 'log-1')
    assert.equal(probeRequestIdFromRecord({
      'X-Oneapi-Request-Id': 'one-1',
      'x-request-id': 'req-2',
      'x-log-id': 'log-1',
      'x-trace-id': 'trace-1',
    }), 'one-1')
    assert.equal(probeRequestIdFromRecord({
      'x-request-id': 'req-2',
      'x-trace-id': 'trace-1',
      'x-goog-request-id': 'goog',
    }), 'req-2')
  })

  it('四个优先头都没有时按旧顺序回落', () => {
    assert.equal(probeRequestIdFromRecord({
      'x-goog-request-id': 'goog',
      'request-id': 'req_1',
      'x-openai-request-id': 'oa',
    }), 'oa')
    assert.equal(probeRequestIdFromRecord({ 'Request-Id': 'req_1' }), 'req_1')
    assert.equal(probeRequestIdFromRecord({ 'X-Goog-Request-Id': 'goog' }), 'goog')
  })

  it('空串跳过，没有命中则返回空', () => {
    assert.equal(probeRequestIdFromRecord({
      'x-oneapi-request-id': '  ',
      'x-request-id': '',
      'x-log-id': 'log-9',
    }), 'log-9')
    assert.equal(probeRequestIdFromRecord({}), null)
  })

  it('Headers.get 同样按这个顺序', () => {
    const headers = new Headers()
    headers.set('x-openai-request-id', 'oa')
    headers.set('x-trace-id', 'trace-3')
    assert.equal(probeRequestIdFromHeaders(headers), 'trace-3')
  })
})
