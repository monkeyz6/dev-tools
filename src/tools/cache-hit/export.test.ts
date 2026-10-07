import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCacheMatrixHtml, cacheMatrixHtmlFileName, type CacheMatrixHtmlReport, type CacheMatrixProtocol } from './export.ts'

function result(partial: Partial<CacheMatrixProtocol> & Pick<CacheMatrixProtocol, 'format'>): CacheMatrixProtocol {
  return {
    status: 'ok',
    measured: 1,
    fieldMissing: 0,
    hitRate: 1,
    hitCount: 1,
    coverage: 0.5,
    failedRounds: 0,
    savedTokens: 100,
    cacheWriteTokens: 0,
    hitAvgMs: 40,
    rounds: [],
    ...partial,
  }
}

function report(model: string, channel: string, protocols: CacheMatrixProtocol[]): CacheMatrixHtmlReport {
  return {
    completedAt: '2026-09-01T00:00:00.000Z',
    target: { model, channelName: channel, baseUrl: 'https://gw.example' },
    params: { nonce: 'n', rounds: 1 },
    results: protocols,
    caseResults: [{ caseId: 'suffix', nonce: 'n', rounds: 1, results: protocols }],
  }
}

describe('buildCacheMatrixHtml', () => {
  it('格子是短词，缺的协议是破折号，弹层数据带命中率，不写来源判断', () => {
    const html = buildCacheMatrixHtml([
      report('gpt-4o', '渠道甲', [result({ format: 'chat', coverage: 0.5 })]),
      report('claude', '渠道乙', [result({ format: 'responses', coverage: 0.95, savedTokens: 8 })]),
    ])
    assert.match(html, /<title>缓存命中率<\/title>/)
    assert.equal(html.includes('来源判断'), false)
    assert.match(html, /渠道甲/)
    assert.match(html, /class="gap">—/)
    assert.match(html, />命中</)
    assert.match(html, /全部命中，但 Token 覆盖率仅 50\.0%/)
    assert.match(html, /请求级命中率/)
    assert.equal(html.includes('echarts'), false)
    assert.equal(cacheMatrixHtmlFileName(2), '缓存命中率_2.html')
  })
})
