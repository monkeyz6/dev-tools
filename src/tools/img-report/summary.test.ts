import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { imgExpectedRejected } from './summary.ts'

describe('imgExpectedRejected', () => {
  const base = { expect: 'unsupported' as const, ok: false }
  it('预期不支持的用例被 4xx 明确拒绝才算通过', () => {
    assert.equal(imgExpectedRejected({ ...base, status: 400 }), true)
    assert.equal(imgExpectedRejected({ ...base, status: 422 }), true)
  })
  it('鉴权 / 超时 / 限流 / 5xx / 网络错误仍是请求异常', () => {
    for (const status of [401, 403, 408, 429, 500, 503, 0]) assert.equal(imgExpectedRejected({ ...base, status }), false)
  })
  it('2xx（真出图）与没有 expect 的用例走正常校验', () => {
    assert.equal(imgExpectedRejected({ expect: 'unsupported', ok: true, status: 200 }), false)
    assert.equal(imgExpectedRejected({ ok: false, status: 400 }), false)
  })
})
