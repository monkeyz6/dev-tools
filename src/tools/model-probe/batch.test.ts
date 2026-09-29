import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  probeHistoryNewestFirst, probeHistoryOverflow, probeLogsSince, probeNameForModel, probeSplitModels,
  probeUnionBuiltinCases, probeViewAfterDelete,
} from './batch.ts'

describe('probeSplitModels', () => {
  it('按英文逗号、中文逗号和换行拆开，并按出现顺序去重', () => {
    assert.deepEqual(probeSplitModels('gpt-4o, deepseek-chat'), ['gpt-4o', 'deepseek-chat'])
    assert.deepEqual(probeSplitModels('gpt-4o，deepseek-chat'), ['gpt-4o', 'deepseek-chat'])
    assert.deepEqual(probeSplitModels('gpt-4o\ndeepseek-chat\r\nclaude'), ['gpt-4o', 'deepseek-chat', 'claude'])
    assert.deepEqual(probeSplitModels(' gpt-4o , , deepseek-chat , gpt-4o '), ['gpt-4o', 'deepseek-chat'])
    assert.deepEqual(probeSplitModels('a,b\nc，d'), ['a', 'b', 'c', 'd'])
    assert.deepEqual(probeSplitModels('   '), [])
  })
})

describe('probeNameForModel', () => {
  it('单个模型没有占位符时原样保留，有占位符则替换', () => {
    assert.equal(probeNameForModel('今晚回归', 'gpt-4o', 1), '今晚回归')
    assert.equal(probeNameForModel('回归 {model}', 'gpt-4o', 1), '回归 gpt-4o')
  })

  it('多个模型没有占位符时补上模型名，有占位符则只替换不追加', () => {
    assert.equal(probeNameForModel('今晚回归', 'gpt-4o', 2), '今晚回归 · gpt-4o')
    assert.equal(probeNameForModel('今晚回归', 'deepseek-chat', 2), '今晚回归 · deepseek-chat')
    assert.equal(probeNameForModel('{model}', 'gpt-4o', 2), 'gpt-4o')
    assert.equal(probeNameForModel('回归 {model} 晚', 'deepseek-chat', 2), '回归 deepseek-chat 晚')
  })
})

describe('probeUnionBuiltinCases', () => {
  it('并集包含各模型命中的原生工具，同一 id 不重复；deepseek 不增加项', () => {
    const gpt = probeUnionBuiltinCases(['gpt-4o']).map(item => item.id)
    const both = probeUnionBuiltinCases(['gpt-4o', 'deepseek-chat']).map(item => item.id)
    assert.ok(gpt.includes('native-openai-web_search'))
    assert.deepEqual(both, gpt)
    const mixed = probeUnionBuiltinCases(['gpt-4o', 'claude-sonnet-4']).map(item => item.id)
    assert.ok(mixed.includes('native-openai-web_search'))
    assert.ok(mixed.some(id => id.startsWith('native-anthropic-')))
    assert.equal(new Set(mixed).size, mixed.length)
  })
})

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString()

describe('probeHistoryOverflow', () => {
  it('同一完成时间用 id 定先后，小 id 留在前面', () => {
    const same = '2026-01-01T00:00:00.000Z'
    const list = [
      { id: 'b', completedAt: same },
      { id: 'a', completedAt: same },
      { id: 'c', completedAt: same },
    ]
    assert.deepEqual(probeHistoryNewestFirst(list).map(item => item.id), ['a', 'b', 'c'])
    assert.deepEqual(probeHistoryOverflow(list, 2).map(item => item.id), ['c'])
  })

  it('本批没超过上限时，只丢掉更早的旧记录', () => {
    const old = Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, completedAt: at(i) }))
    const batch = [0, 1, 2].map(i => ({ id: `m${i}`, completedAt: at(100 + i) }))
    assert.deepEqual(
      probeHistoryOverflow([...old, ...batch], 20).map(item => item.id),
      ['old2', 'old1', 'old0'],
    )
  })

  it('本批自己超过上限时，丢掉本批较早的，同时丢掉全部旧记录', () => {
    const old = Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, completedAt: at(i) }))
    const batch = Array.from({ length: 25 }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, completedAt: at(100 + i) }))
    const drop = new Set(probeHistoryOverflow([...old, ...batch], 20).map(item => item.id))
    for (const item of old) assert.equal(drop.has(item.id), true)
    for (let i = 0; i < 5; i++) assert.equal(drop.has(`m${String(i).padStart(2, '0')}`), true)
    for (let i = 5; i < 25; i++) assert.equal(drop.has(`m${String(i).padStart(2, '0')}`), false)
    assert.equal(drop.size, 25)
  })
})

describe('probeViewAfterDelete', () => {
  const card = (id: string) => ({ id })

  it('删掉当前卡片后报告页清空；删的是别的记录则留下', () => {
    assert.deepEqual(probeViewAfterDelete(card('a'), null, new Set(['a'])), { report: null, matrix: null })
    assert.deepEqual(probeViewAfterDelete(card('a'), null, new Set(['b'])), { report: card('a'), matrix: null })
  })

  it('矩阵删到只剩一列时改开那份卡片，删光则清空', () => {
    const rows = [card('a'), card('b'), card('c')]
    assert.deepEqual(
      probeViewAfterDelete(null, rows, new Set(['a'])),
      { report: null, matrix: [card('b'), card('c')] },
    )
    assert.deepEqual(
      probeViewAfterDelete(null, [card('b'), card('c')], new Set(['b'])),
      { report: card('c'), matrix: null },
    )
    assert.deepEqual(
      probeViewAfterDelete(card('c'), null, new Set(['c'])),
      { report: null, matrix: null },
    )
  })

  it('矩阵还在时，被删的隐藏卡片不再留下', () => {
    assert.deepEqual(
      probeViewAfterDelete(card('hidden'), [card('a'), card('b'), card('c')], new Set(['hidden'])),
      { report: null, matrix: [card('a'), card('b'), card('c')] },
    )
  })
})

describe('probeLogsSince', () => {
  const logs = ['a', 'b', 'c', 'd']

  it('epoch 没变时从起点切开', () => {
    assert.deepEqual(probeLogsSince(logs, 2, 1, 1), ['c', 'd'])
    assert.deepEqual(probeLogsSince(logs, logs.length, 1, 1), [])
  })

  it('缓冲被换掉后不再用原来的下标', () => {
    assert.deepEqual(probeLogsSince(logs, 2, 2, 1), ['a', 'b', 'c', 'd'])
    assert.deepEqual(probeLogsSince(['x'], 3, 1, 1), ['x'])
  })
})
