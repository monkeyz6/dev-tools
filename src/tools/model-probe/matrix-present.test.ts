import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matrixFormatSubtitle, matrixTokenValues, presentMatrixNote } from './matrix-present.ts'

describe('presentMatrixNote', () => {
  it('收掉和状态重复的成功句，原因句留下，JSON 单独放', () => {
    assert.deepEqual(presentMatrixNote('基础请求返回成功'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('用户未勾选'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('完整 JSON 响应正常'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('回复含 SYSTEM_OK'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('第二跳回出口令 ORBIT'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('识别为主色红'), { detail: '', errBody: '' })
    assert.deepEqual(presentMatrixNote('失败'), { detail: '', errBody: '' })
    assert.deepEqual(
      presentMatrixNote('异常：GPT 推理模型不应接受 temperature，但请求成功了。组合请求通过；同时接受 max_completion_tokens 与 max_tokens'),
      { detail: 'GPT 推理模型不应接受 temperature，但请求成功了', errBody: '' },
    )
    const expected = presentMatrixNote('符合预期：GPT 推理模型不接受该 temperature。{"message":"Unsupported parameter: \'temperature\'","type":"invalid_request_error"}')
    assert.equal(expected.detail, 'GPT 推理模型不接受该 temperature')
    assert.match(expected.errBody, /Unsupported parameter/)
    const failed = presentMatrixNote('组合请求通过，但{"message":"upstream error","code":"do_request_failed"}')
    assert.equal(failed.detail, '')
    assert.match(failed.errBody, /upstream error/)
    assert.deepEqual(
      presentMatrixNote('基础请求返回成功。max_tokens 被拒符合预期，已改用 max_completion_tokens。'),
      { detail: 'max_tokens 被拒符合预期，已改用 max_completion_tokens', errBody: '' },
    )
    assert.equal(presentMatrixNote('第 2 次请求命中缓存，读取 Token: 2887').detail, '第 2 次请求命中缓存，读取 Token: 2887')
    assert.equal(presentMatrixNote('3 次输入 Token 均为 27').detail, '3 次输入 Token 均为 27')
    assert.equal(presentMatrixNote('收到 9 个 SSE 事件，包含结束标记').detail, '收到 9 个 SSE 事件，包含结束标记')
    assert.equal(presentMatrixNote('对应协议格式未启用（未勾选 Anthropic Messages 基础测试）').detail, '对应协议格式未启用（未勾选 Anthropic Messages 基础测试）')
    assert.equal(presentMatrixNote('测试被用户中止').detail, '测试被用户中止')
    assert.equal(presentMatrixNote('响应含 web_search_call，已调用 web_search').detail, '')
  })
})

describe('matrixFormatSubtitle', () => {
  it('测试名已经包含协议名时不重复', () => {
    assert.equal(matrixFormatSubtitle('OpenAI Chat Completions', 'Chat Completions'), '')
    assert.equal(matrixFormatSubtitle('Responses 自动前缀缓存', 'Responses'), '')
    assert.equal(matrixFormatSubtitle('temperature', 'Chat Completions'), 'Chat Completions')
    assert.equal(matrixFormatSubtitle('Chat 自动前缀缓存', 'Chat Completions'), 'Chat Completions')
  })
})

describe('matrixTokenValues', () => {
  it('几次输入完全一样时不重复列出', () => {
    assert.equal(matrixTokenValues([27, 27, 27]), null)
    assert.deepEqual(matrixTokenValues([27, 28]), [27, 28])
    assert.equal(matrixTokenValues([]), null)
  })
})
