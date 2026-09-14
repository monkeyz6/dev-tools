import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatVideoTaskError,
  parseVideoTaskError,
  videoBuildErrorBodyChecks,
  videoErrorFamilyOf,
  videoExpectedErrorFamily,
  videoShouldCheckErrorBody,
} from './errors.ts'

describe('parseVideoTaskError', () => {
  it('解析 error 对象', () => {
    const r = parseVideoTaskError({
      status: 'failed',
      error: { code: 'InvalidParameter', message: 'One or more parameters specified in the request are not valid. Request ID: vid-1.', type: 'BadRequest' },
    })
    assert.equal(r.shape, 'object')
    assert.deepEqual(r.detail, {
      code: 'InvalidParameter',
      message: 'One or more parameters specified in the request are not valid. Request ID: vid-1.',
      type: 'BadRequest',
    })
  })

  it('解析 data.error 对象', () => {
    const r = parseVideoTaskError({
      data: { error: { code: 'OutputVideoSensitiveContentDetected', message: 'The request failed because the output video may contain sensitive information.Request ID: vid-2.' } },
    })
    assert.equal(r.shape, 'object')
    assert.equal(r.detail?.code, 'OutputVideoSensitiveContentDetected')
    assert.equal(r.detail?.type, undefined)
  })

  it('解析 error 字符串', () => {
    const r = parseVideoTaskError({ error: '任务失败' })
    assert.equal(r.shape, 'string')
    assert.deepEqual(r.detail, { message: '任务失败' })
  })

  it('缺 error 字段', () => {
    const r = parseVideoTaskError({ id: 'cgt-1', status: 'failed' })
    assert.equal(r.shape, 'missing')
    assert.equal(r.detail, null)
  })

  it('空对象 / 非对象入参', () => {
    assert.equal(parseVideoTaskError(null).shape, 'missing')
    assert.equal(parseVideoTaskError(undefined).shape, 'missing')
    assert.equal(parseVideoTaskError('nope').shape, 'missing')
  })
})

describe('formatVideoTaskError', () => {
  it('拼接 code + message', () => {
    assert.equal(formatVideoTaskError({ code: 'InvalidParameter', message: 'bad' }), 'InvalidParameter bad')
    assert.equal(formatVideoTaskError({ message: 'only' }), 'only')
    assert.equal(formatVideoTaskError(null), null)
    assert.equal(formatVideoTaskError({}), null)
  })
})

describe('videoErrorFamilyOf', () => {
  it('按官方前缀归族', () => {
    assert.equal(videoErrorFamilyOf('OutputVideoSensitiveContentDetected'), 'sensitive')
    assert.equal(videoErrorFamilyOf('InputTextSensitiveContentDetected.PolicyViolation'), 'sensitive')
    assert.equal(videoErrorFamilyOf('InvalidParameter'), 'parameter')
    assert.equal(videoErrorFamilyOf('InvalidParameter.TaskTypeConstraint'), 'parameter')
    assert.equal(videoErrorFamilyOf('MissingParameter'), 'parameter')
    assert.equal(videoErrorFamilyOf('AuthenticationError'), 'auth')
    assert.equal(videoErrorFamilyOf('RateLimitExceeded.EndpointRPMExceeded'), 'rateLimit')
    assert.equal(videoErrorFamilyOf('QuotaExceeded'), 'rateLimit')
    assert.equal(videoErrorFamilyOf('ServerOverloaded'), 'rateLimit')
    assert.equal(videoErrorFamilyOf('RequestBurstTooFast'), 'rateLimit')
    assert.equal(videoErrorFamilyOf('InternalServiceError'), 'internal')
    assert.equal(videoErrorFamilyOf('SomethingElse'), null)
    assert.equal(videoErrorFamilyOf(''), null)
    assert.equal(videoErrorFamilyOf(undefined), null)
  })
})

describe('videoExpectedErrorFamily / videoShouldCheckErrorBody', () => {
  it('由 HTTP 状态推断族', () => {
    assert.equal(videoExpectedErrorFamily(401), 'auth')
    assert.equal(videoExpectedErrorFamily(429), 'rateLimit')
    assert.equal(videoExpectedErrorFamily(500), 'internal')
    assert.equal(videoExpectedErrorFamily(200), null)
    assert.equal(videoExpectedErrorFamily(400), null)
  })

  it('failed 或 HTTP ≥400 才校验错误体', () => {
    assert.equal(videoShouldCheckErrorBody({ status: 200, taskStatus: 'failed' }), true)
    assert.equal(videoShouldCheckErrorBody({ status: 401, taskStatus: 'queued' }), true)
    assert.equal(videoShouldCheckErrorBody({ status: 200, taskStatus: 'queued' }), false)
    assert.equal(videoShouldCheckErrorBody({ status: 200, taskStatus: 'succeeded' }), false)
    assert.equal(videoShouldCheckErrorBody({ status: 400, taskStatus: '', kind: 'material-group' }), false)
    assert.equal(videoShouldCheckErrorBody({ status: 400, taskStatus: '', kind: 'material-assets' }), false)
    assert.equal(videoShouldCheckErrorBody({ status: 400, taskStatus: '', kind: 't2v' }), true)
  })
})

describe('videoBuildErrorBodyChecks', () => {
  it('对象错误体：结构 / code / message 通过，请求ID 从 message 取出', () => {
    const checks = videoBuildErrorBodyChecks({
      status: 200,
      taskStatus: 'failed',
      reqId: '',
      respHeaders: {},
      error: null,
      errorDetail: { code: 'InputTextSensitiveContentDetected', message: 'The request failed because the input text may contain sensitive information.Request ID: vid-txt.' },
      rawSnippet: JSON.stringify({
        id: 'task_1',
        status: 'failed',
        error: { code: 'InputTextSensitiveContentDetected', message: 'The request failed because the input text may contain sensitive information.Request ID: vid-txt.' },
      }),
    })
    const byName = Object.fromEntries(checks.map(c => [c.name, c]))
    assert.equal(byName['错误结构'].pass, true)
    assert.equal(byName['错误.code'].pass, true)
    assert.match(String(byName['错误.code'].actual), /内容安全/)
    assert.equal(byName['错误.message'].pass, true)
    assert.equal(byName['请求ID'].actual, 'vid-txt')
    assert.equal(byName['请求ID'].info, false)
  })

  it('HTTP 429 接受 RequestBurstTooFast', () => {
    const checks = videoBuildErrorBodyChecks({
      status: 429,
      taskStatus: 'queued',
      reqId: '',
      respHeaders: {},
      error: null,
      errorDetail: { code: 'RequestBurstTooFast', message: 'slow down. Request ID: vid-burst.' },
      rawSnippet: JSON.stringify({ error: { code: 'RequestBurstTooFast', message: 'slow down. Request ID: vid-burst.' } }),
    })
    const byName = Object.fromEntries(checks.map(c => [c.name, c]))
    assert.equal(byName['错误.code'].pass, true)
    assert.match(String(byName['错误.code'].actual), /限流/)
  })

  it('HTTP 401 要求鉴权族', () => {
    const body = {
      error: { type: 'Unauthorized', code: 'AuthenticationError', message: 'The API key or AK/SK in the request is missing or invalid. Request ID: vid-auth.' },
    }
    const checks = videoBuildErrorBodyChecks({
      status: 401,
      taskStatus: 'queued',
      reqId: 'hdr-1',
      respHeaders: { 'x-oneapi-request-id': 'hdr-1' },
      error: 'AuthenticationError The API key',
      errorDetail: { type: 'Unauthorized', code: 'AuthenticationError', message: body.error.message },
      rawSnippet: JSON.stringify(body),
    })
    const byName = Object.fromEntries(checks.map(c => [c.name, c]))
    assert.equal(byName['错误结构'].pass, true)
    assert.equal(byName['错误.code'].pass, true)
    assert.match(String(byName['错误.code'].target), /鉴权/)
    assert.equal(byName['错误.type'].pass, true)
    assert.equal(byName['请求ID'].actual, 'hdr-1')
  })

  it('缺 error 字段：结构与 message 未通过', () => {
    const checks = videoBuildErrorBodyChecks({
      status: 200,
      taskStatus: 'failed',
      reqId: '',
      respHeaders: {},
      error: '任务失败',
      errorDetail: null,
      rawSnippet: JSON.stringify({ id: 'task_1', status: 'failed' }),
    })
    const byName = Object.fromEntries(checks.map(c => [c.name, c]))
    assert.equal(byName['错误结构'].pass, false)
    assert.equal(byName['错误.code'].pass, false)
    assert.equal(byName['错误.message'].pass, false)
    assert.equal(byName['请求ID'].info, true)
  })
})
