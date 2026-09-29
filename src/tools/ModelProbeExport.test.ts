import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProbeMatrixHtml,
  buildProbeReportHtml,
  probeMatrixColumnLabels,
  type ProbeHtmlReport,
  type ProbeHtmlResult,
  type ProbeHtmlTestMeta,
} from './ModelProbeExport.ts'

const tests: ProbeHtmlTestMeta[] = [
  { id: 'chat-basic', group: '协议基础', name: 'OpenAI Chat Completions', explain: '基础' },
  { id: 'temperature', group: '参数与特性', name: 'temperature', explain: '采样' },
  { id: 'image-input', group: '补充场景', name: '图片输入', explain: '识图' },
  { id: 'structured_output', group: '参数与特性', name: '结构化输出', explain: 'schema' },
]

const labels = { chat: 'Chat Completions', anthropic: 'Anthropic Messages' }

function cell(status: ProbeHtmlResult['status'], detail: string): ProbeHtmlResult {
  return {
    status,
    detail,
    duration: 12,
    format: 'chat',
    usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null },
    repro: { url: 'https://example/v1/chat/completions', headers: { Authorization: 'Bearer secret' }, body: { model: 'x' }, status: 200, requestId: 'req-1' },
  }
}

function report(over: Partial<ProbeHtmlReport> & Pick<ProbeHtmlReport, 'target' | 'results' | 'completedAt'>): ProbeHtmlReport {
  return {
    name: '报告',
    startedAt: '2026-09-29T01:00:00.000Z',
    durationMs: 1000,
    summary: { passed: 0, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0 },
    ...over,
  }
}

describe('probeMatrixColumnLabels', () => {
  it('渠道不一致时列头带渠道，一致时只写模型名，撞车再补完成时间', () => {
    const mixed = probeMatrixColumnLabels([
      report({
        completedAt: '2026-09-29T01:00:01.000Z',
        target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
        results: {},
      }),
      report({
        completedAt: '2026-09-29T02:00:01.000Z',
        target: { baseUrl: 'https://b.example', model: 'deepseek-chat', channelName: '渠道乙', overrides: {} },
        results: {},
      }),
    ])
    assert.deepEqual(mixed, ['gpt-4o · 渠道甲', 'deepseek-chat · 渠道乙'])

    const same = probeMatrixColumnLabels([
      report({
        completedAt: '2026-09-29T01:00:01.000Z',
        target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
        results: {},
      }),
      report({
        completedAt: '2026-09-29T02:00:01.000Z',
        target: { baseUrl: 'https://a.example', model: 'deepseek-chat', channelName: '渠道甲', overrides: {} },
        results: {},
      }),
    ])
    assert.deepEqual(same, ['gpt-4o', 'deepseek-chat'])

    const clash = probeMatrixColumnLabels([
      report({
        completedAt: '2026-09-29T01:00:01.000Z',
        target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
        results: {},
      }),
      report({
        completedAt: '2026-09-29T03:04:05.000Z',
        target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
        results: {},
      }),
    ])
    assert.equal(clash.length, 2)
    assert.match(clash[0], /^gpt-4o · 2026-/)
    assert.match(clash[1], /^gpt-4o · 2026-/)
    assert.notEqual(clash[0], clash[1])
  })

  it('没有渠道名时用 baseUrl 区分', () => {
    const labelsOf = probeMatrixColumnLabels([
      report({
        completedAt: '2026-09-29T01:00:01.000Z',
        target: { baseUrl: 'https://a.example', model: 'gpt-4o', overrides: {} },
        results: {},
      }),
      report({
        completedAt: '2026-09-29T02:00:01.000Z',
        target: { baseUrl: 'https://b.example', model: 'gpt-4o', overrides: {} },
        results: {},
      }),
    ])
    assert.deepEqual(labelsOf, ['gpt-4o · https://a.example', 'gpt-4o · https://b.example'])
  })
})

describe('buildProbeMatrixHtml', () => {
  const left = report({
    completedAt: '2026-09-29T01:00:01.000Z',
    target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
    results: {
      'chat-basic': cell('passed', '基础请求返回成功'),
      'temperature@chat': cell('skipped', '用户未勾选'),
      'structured_output@anthropic': {
        status: 'unsupported',
        detail: 'Anthropic Messages 无原生 response_format 参数',
        duration: null,
        format: 'anthropic',
        repro: null,
      },
    },
  })
  const right = report({
    completedAt: '2026-09-29T02:00:01.000Z',
    target: { baseUrl: 'https://b.example', model: 'deepseek-chat', channelName: '渠道乙', overrides: {} },
    results: {
      'chat-basic': cell('failed', '失败'),
      'image-input@chat': cell('untested', '未测'),
    },
  })

  it('行取并集：没跑过留空，已跳过和未测仍显示，且不是卡片', () => {
    const html = buildProbeMatrixHtml([left, right], tests, labels)
    assert.match(html, /gpt-4o · 渠道甲/)
    assert.match(html, /deepseek-chat · 渠道乙/)
    assert.match(html, /OpenAI Chat Completions/)
    assert.match(html, />通过</)
    assert.match(html, />失败</)
    assert.match(html, />已跳过</)
    assert.match(html, />未测</)
    assert.match(html, /class="gap"/)
    assert.match(html, /class="matrix-cell/)
    assert.equal(html.includes('.tile'), false)
    assert.equal(html.includes('class="tile"'), false)
    assert.equal(html.includes('无原生 response_format'), false)
    assert.equal(html.includes('Bearer secret'), false)
    assert.match(html, /"body":\{"model":"x"\}/)
  })
})

describe('buildProbeReportHtml', () => {
  it('单份报告仍是卡片', () => {
    const html = buildProbeReportHtml(report({
      completedAt: '2026-09-29T01:00:01.000Z',
      name: '单份',
      target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
      results: { 'chat-basic': cell('passed', '基础请求返回成功') },
    }), tests, labels)
    assert.match(html, /class="tile"/)
    assert.match(html, /\.tile\{/)
  })
})
