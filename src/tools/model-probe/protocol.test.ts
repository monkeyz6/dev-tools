import { inflateSync } from 'node:zlib'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROBE_RED_PNG_B64, PROBE_THINKING_BUDGET_CAP, PROBE_THINKING_BUDGET_TOKENS,
  probeComboPendingAndSolos, probeParamComboBody, probeParamMatched, probeProtocolOf,
  probeSoleParamMatch,
} from './protocol.ts'

const readU32 = (buf: Buffer, offset: number) => buf.readUInt32BE(offset)

describe('PROBE_RED_PNG_B64', () => {
  it('是 32×32 纯红 PNG，总像素不低于 Grok 的 512 下限', () => {
    const png = Buffer.from(PROBE_RED_PNG_B64, 'base64')
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.subarray(12, 16).toString(), 'IHDR')
    const width = readU32(png, 16)
    const height = readU32(png, 20)
    assert.equal(width, 32)
    assert.equal(height, 32)
    assert.ok(width * height >= 512)
    assert.equal(png[24], 8)
    assert.equal(png[25], 2)

    const idatLen = readU32(png, 33)
    assert.equal(png.subarray(37, 41).toString(), 'IDAT')
    const raw = inflateSync(png.subarray(41, 41 + idatLen))
    const stride = 1 + width * 3
    assert.equal(raw.length, height * stride)
    for (let y = 0; y < height; y++) {
      const row = raw.subarray(y * stride, (y + 1) * stride)
      assert.equal(row[0], 0)
      for (let x = 0; x < width; x++) {
        assert.equal(row.subarray(1 + x * 3, 4 + x * 3).toString('hex'), 'dc2626')
      }
    }
  })
})

describe('Claude 分代参数片段', () => {
  const proto = probeProtocolOf('anthropic')

  it('effort 与 thinking 片段写入官方字段', () => {
    assert.deepEqual(proto.paramFragment('effort'), { output_config: { effort: 'low' } })
    assert.deepEqual(proto.paramFragment('thinking-adaptive'), { thinking: { type: 'adaptive' } })
    assert.deepEqual(proto.paramFragment('thinking-budget'), {
      thinking: { type: 'enabled', budget_tokens: PROBE_THINKING_BUDGET_TOKENS },
    })
  })

  it('combo 合并 output_config.effort 与 format，thinking-budget 抬高 cap', () => {
    const body = probeParamComboBody('claude-sonnet-4-5-20250929', 'anthropic', ['effort', 'structured_output', 'thinking-budget'])
    assert.equal(body.output_config.effort, 'low')
    assert.equal(body.output_config.format?.type, 'json_schema')
    assert.deepEqual(body.thinking, { type: 'enabled', budget_tokens: PROBE_THINKING_BUDGET_TOKENS })
    assert.equal(body.max_tokens, PROBE_THINKING_BUDGET_CAP)
  })

  it('effort 错误不误归给 structured_output', () => {
    const err = 'output_config.effort is not supported for this model'
    assert.equal(probeParamMatched('effort', err, 'anthropic'), true)
    assert.equal(probeParamMatched('structured_output', err, 'anthropic'), false)
    assert.equal(probeParamMatched('reasoning_effort', err, 'anthropic'), false)
  })

  it('两种 thinking 同时勾选时从 combo 拿掉、各自单发', () => {
    const one = probeComboPendingAndSolos(['effort', 'thinking-adaptive', 'structured_output'])
    assert.deepEqual(one.combo, ['effort', 'thinking-adaptive', 'structured_output'])
    assert.deepEqual(one.solos, [])
    const both = probeComboPendingAndSolos(['effort', 'thinking-adaptive', 'thinking-budget', 'structured_output'])
    assert.deepEqual(both.combo, ['effort', 'structured_output'])
    assert.deepEqual(both.solos, ['thinking-adaptive', 'thinking-budget'])
  })

  it('thinking.enabled 错误不能独吞给 adaptive 或 budget', () => {
    const err = 'thinking.type.enabled is not supported for this model'
    assert.equal(probeSoleParamMatch(['thinking-adaptive', 'thinking-budget'], err, 'anthropic'), null)
  })
})
