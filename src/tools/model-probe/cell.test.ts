import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { probeLogBelongsToCell, probeMatchRetryChannel, probeReplaceCellLogs } from './cell.ts'

const log = (id: string, resultKey: string, format?: string) => ({ id, resultKey, format: format ?? null })

describe('probeLogBelongsToCell', () => {
  it('同协议的格子键或裸 id 属于这一格，拼接的 combo 键留下', () => {
    assert.equal(probeLogBelongsToCell(log('a', 'temperature@chat', 'chat'), 'temperature@chat'), true)
    assert.equal(probeLogBelongsToCell(log('b', 'temperature', 'chat'), 'temperature@chat'), true)
    assert.equal(probeLogBelongsToCell(log('c', 'temperature+top_p@chat', 'chat'), 'temperature@chat'), false)
    assert.equal(probeLogBelongsToCell(log('d', 'temperature@chat', 'chat'), 'temperature@responses'), false)
    assert.equal(probeLogBelongsToCell(log('e', 'top_p_range', 'chat'), 'top_p_range@chat'), true)
    assert.equal(probeLogBelongsToCell(log('f', 'top_p', 'chat'), 'top_p_range@chat'), false)
  })

  it('Responses 粘性探测只跟着多轮这一格走', () => {
    assert.equal(probeLogBelongsToCell(log('s', 'origin-sticky@responses', 'responses'), 'multi-turn@responses'), true)
    assert.equal(probeLogBelongsToCell(log('m', 'multi-turn', 'responses'), 'multi-turn@responses'), true)
    assert.equal(probeLogBelongsToCell(log('s', 'origin-sticky@responses', 'responses'), 'multi-turn@chat'), false)
    assert.equal(probeLogBelongsToCell(log('c', 'multi-turn', 'chat'), 'multi-turn@responses'), false)
  })

  it('没有协议后缀时不按 format 过滤', () => {
    assert.equal(probeLogBelongsToCell(log('k', 'cache-chat', 'chat'), 'cache-chat'), true)
    assert.equal(probeLogBelongsToCell(log('b', 'chat-basic', 'chat'), 'chat-basic'), true)
  })
})

describe('probeReplaceCellLogs', () => {
  it('只删报告里已经有的这一格，会话里其它模型的日志留下，新日志追加到报告', () => {
    const combo = log('combo', 'temperature+top_p@chat', 'chat')
    const oldTemp = log('old', 'temperature@chat', 'chat')
    const otherModel = log('other', 'temperature@chat', 'chat')
    const fresh = log('fresh', 'temperature@chat', 'chat')
    const session = [combo, oldTemp, otherModel, fresh]
    const reportLogs = [combo, oldTemp]
    const next = probeReplaceCellLogs(session, reportLogs, 'temperature@chat', [fresh])
    assert.deepEqual(next.session.map(item => item.id), ['combo', 'other', 'fresh'])
    assert.deepEqual(next.reportLogs.map(item => item.id), ['combo', 'fresh'])
  })

  it('历史打开时报告日志是空的，会话缓冲一条都不删', () => {
    const sitting = log('sit', 'chat-basic', 'chat')
    const fresh = log('fresh', 'top_p_range', 'chat')
    const next = probeReplaceCellLogs([sitting, fresh], [], 'top_p_range@chat', [fresh])
    assert.deepEqual(next.session.map(item => item.id), ['sit', 'fresh'])
    assert.deepEqual(next.reportLogs.map(item => item.id), ['fresh'])
  })
})

describe('probeMatchRetryChannel', () => {
  const channels = [
    { id: 'a', name: '网关甲', baseUrl: 'https://a.example' },
    { id: 'b', name: '网关甲', baseUrl: 'https://b.example' },
    { id: 'c', name: '网关乙', baseUrl: 'https://a.example' },
  ]

  it('同名时优先当前渠道，没有当前则唯一同名可用', () => {
    assert.equal(probeMatchRetryChannel({ channelName: '网关甲', baseUrl: 'https://a.example' }, channels, 'b').channel?.id, 'b')
    assert.equal(probeMatchRetryChannel({ channelName: '网关乙', baseUrl: 'https://nope.example' }, channels, null).channel?.id, 'c')
    assert.equal('error' in probeMatchRetryChannel({ channelName: '网关甲', baseUrl: 'https://a.example' }, channels, 'missing'), true)
    assert.match(probeMatchRetryChannel({ channelName: '不存在', baseUrl: 'https://a.example' }, channels, 'a').error || '', /没有找到渠道/)
  })

  it('没有渠道名时只接受唯一的 Base URL', () => {
    const one = [{ id: 'a', name: '甲', baseUrl: 'https://a.example' }]
    assert.equal(probeMatchRetryChannel({ baseUrl: 'https://a.example' }, one, null).channel?.id, 'a')
    assert.match(probeMatchRetryChannel({ channelName: '  ', baseUrl: 'https://a.example' }, channels, null).error || '', /多个渠道/)
    assert.match(probeMatchRetryChannel({ baseUrl: 'https://missing.example' }, channels, null).error || '', /没有渠道名/)
  })
})
