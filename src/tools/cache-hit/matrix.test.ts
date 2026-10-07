import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheMatrixCell, cacheMatrixColumns, cacheMatrixGroups, cacheVerdictOf,
  type CacheCaseId, type CacheFormat, type CacheMatrixReport, type CacheVerdictInput,
} from './matrix.ts'

function verdict(partial: Partial<CacheVerdictInput> & { format?: CacheFormat }): CacheVerdictInput {
  return {
    format: 'chat',
    status: 'ok',
    measured: 5,
    fieldMissing: 0,
    hitRate: 1,
    hitCount: 5,
    coverage: 0.9,
    ...partial,
  }
}

function report(partial: {
  id?: string
  model?: string
  channel?: string
  baseUrl?: string
  at?: string
  caseResults?: { caseId: CacheCaseId; formats: CacheFormat[] }[]
  legacyFormats?: CacheFormat[]
}): CacheMatrixReport<{ format: CacheFormat }> {
  const results = (partial.legacyFormats ?? []).map(format => ({ format }))
  return {
    completedAt: partial.at ?? '2026-09-01T00:00:00.000Z',
    target: { model: partial.model ?? 'gpt-4o', channelName: partial.channel, baseUrl: partial.baseUrl ?? 'https://gw.example' },
    params: { nonce: 'n', rounds: 5 },
    results,
    caseResults: partial.caseResults?.map(item => ({
      caseId: item.caseId,
      nonce: item.caseId,
      rounds: 5,
      results: item.formats.map(format => ({ format })),
    })),
  }
}

describe('cacheVerdictOf', () => {
  it('全中且覆盖率够是绿色命中，覆盖率不够仍写命中但为黄', () => {
    const full = cacheVerdictOf(verdict({ coverage: 0.8 }))
    assert.equal(full.word, '命中')
    assert.equal(full.tone, 'ok')
    assert.match(full.text, /全部命中 · 覆盖率 80\.0%/)
    const thin = cacheVerdictOf(verdict({ coverage: 0.79 }))
    assert.equal(thin.word, '命中')
    assert.equal(thin.tone, 'warn')
    assert.match(thin.text, /覆盖率仅 79\.0%/)
  })

  it('多轮全中写命中且为绿，原句仍是前缀仍命中', () => {
    const out = cacheVerdictOf(verdict({ coverage: 0.1, hitCount: 4, measured: 4 }), 'multiturn')
    assert.equal(out.word, '命中')
    assert.equal(out.tone, 'ok')
    assert.equal(out.text, '前缀仍命中 · 4/4 轮')
  })

  it('部分命中、未命中、无字段、失败、已停止各用自己的词', () => {
    assert.deepEqual(
      cacheVerdictOf(verdict({ hitRate: 0.4, hitCount: 2, coverage: 0.2 })).word === '部分命中' && cacheVerdictOf(verdict({ hitRate: 0.4, hitCount: 2 })).tone,
      'warn',
    )
    const partial = cacheVerdictOf(verdict({ hitRate: 0.4, hitCount: 2, coverage: 0.2 }))
    assert.equal(partial.word, '部分命中')
    assert.equal(partial.text, '部分命中（2/5 轮）')
    const none = cacheVerdictOf(verdict({ hitRate: 0, hitCount: 0, coverage: 0 }))
    assert.equal(none.word, '未命中')
    assert.equal(none.tone, 'err')
    const missing = cacheVerdictOf(verdict({ fieldMissing: 5, hitRate: 0, hitCount: 0 }))
    assert.equal(missing.word, '无字段')
    assert.equal(missing.tone, 'warn')
    assert.match(missing.text, /prompt_tokens_details\.cached_tokens/)
    const failed = cacheVerdictOf(verdict({ status: 'error', error: '预热超时', measured: 2, hitRate: 0.5 }))
    assert.equal(failed.word, '失败')
    assert.equal(failed.text, '测试未完成：预热超时')
    const empty = cacheVerdictOf(verdict({ measured: 0, hitRate: null, hitCount: 0, coverage: null }))
    assert.equal(empty.word, '失败')
    assert.match(empty.text, /没有成功的测量轮次/)
    const stopped = cacheVerdictOf(verdict({ status: 'stopped', measured: 2, hitRate: 1 }))
    assert.equal(stopped.word, '已停止')
    assert.equal(stopped.tone, 'warn')
  })

  it('只有全部成功轮都缺字段才是无字段，缺一部分仍按命中率', () => {
    const mixed = cacheVerdictOf(verdict({ fieldMissing: 2, measured: 5, hitRate: 1, coverage: 0.9 }))
    assert.equal(mixed.word, '命中')
    assert.equal(mixed.tone, 'ok')
  })
})

describe('cacheMatrixGroups', () => {
  it('没人跑过的场景不出现，保留行里缺的协议由格子自己表示', () => {
    const rows = [
      report({ caseResults: [{ caseId: 'suffix', formats: ['chat'] }] }),
      report({ legacyFormats: ['responses'] }),
      report({ caseResults: [{ caseId: 'repeat', formats: ['anthropic'] }, { caseId: 'suffix', formats: ['chat'] }] }),
    ]
    const groups = cacheMatrixGroups(rows)
    assert.deepEqual(groups.map(group => group.caseId), ['repeat', 'suffix'])
    assert.deepEqual(groups[0].rows.map(row => row.format), ['anthropic'])
    assert.deepEqual(groups[1].rows.map(row => row.format), ['chat', 'responses'])
    assert.equal(cacheMatrixCell(rows[0], 'suffix', 'chat')?.format, 'chat')
    assert.equal(cacheMatrixCell(rows[0], 'suffix', 'responses'), null)
    assert.equal(cacheMatrixCell(rows[1], 'repeat', 'responses'), null)
    assert.equal(cacheMatrixCell(rows[1], 'suffix', 'responses')?.format, 'responses')
  })
})

describe('cacheMatrixColumns', () => {
  it('渠道一致时不写第二行，不一致时用渠道名或 Base URL', () => {
    const same = cacheMatrixColumns([
      report({ model: 'gpt-4o', channel: '甲' }),
      report({ model: 'claude', channel: '甲' }),
    ])
    assert.deepEqual(same.map(column => column.source), ['', ''])
    const mixed = cacheMatrixColumns([
      report({ model: 'gpt-4o', channel: '甲' }),
      report({ model: 'claude', baseUrl: 'https://other.example' }),
    ])
    assert.equal(mixed[0].source, '甲')
    assert.equal(mixed[1].source, 'https://other.example')
  })

  it('同一模型同一渠道撞车时，第二行补完成时间', () => {
    const columns = cacheMatrixColumns([
      report({ model: 'gpt-4o', channel: '甲', at: '2026-09-01T01:02:03.000Z' }),
      report({ model: 'gpt-4o', channel: '甲', at: '2026-09-02T04:05:06.000Z' }),
    ])
    assert.equal(columns[0].model, 'gpt-4o')
    assert.notEqual(columns[0].source, columns[1].source)
    assert.match(columns[0].source, /\d{4}-\d{2}-\d{2}/)
  })
})
