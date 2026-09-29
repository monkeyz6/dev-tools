import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProbeMatrixHtml,
  buildProbeReportHtml,
  probeMatrixColumnLabels,
  probeMatrixColumnText,
  probeMatrixHasProblems,
  probeMatrixHtmlFileName,
  type ProbeHtmlReport,
  type ProbeHtmlResult,
  type ProbeHtmlTestMeta,
} from './ModelProbeExport.ts'

const tests: ProbeHtmlTestMeta[] = [
  { id: 'chat-basic', group: '协议基础', name: 'OpenAI Chat Completions', explain: '基础' },
  { id: 'temperature', group: '参数与特性', name: 'temperature', explain: '采样' },
  { id: 'image-input', group: '补充场景', name: '图片输入', explain: '识图' },
  { id: 'structured_output', group: '参数与特性', name: '结构化输出', explain: 'schema' },
  { id: 'concurrency', group: '补充场景', name: '并发请求稳定性', explain: '并发' },
]

const labels = { chat: 'Chat Completions', anthropic: 'Anthropic Messages' }

function cell(status: ProbeHtmlResult['status'], detail: string, responseBody?: unknown): ProbeHtmlResult {
  return {
    status,
    detail,
    duration: 12,
    format: 'chat',
    usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null },
    repro: {
      url: 'https://example/v1/chat/completions',
      headers: { Authorization: 'Bearer secret' },
      body: { model: 'x' },
      status: status === 'failed' ? 400 : 200,
      requestId: 'req-1',
      ...(responseBody !== undefined ? { responseBody } : {}),
    },
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
    assert.deepEqual(mixed, [
      { model: 'gpt-4o', source: '渠道甲' },
      { model: 'deepseek-chat', source: '渠道乙' },
    ])
    assert.equal(probeMatrixColumnText(mixed[0]), 'gpt-4o · 渠道甲')

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
    assert.deepEqual(same, [
      { model: 'gpt-4o', source: '' },
      { model: 'deepseek-chat', source: '' },
    ])

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
    assert.equal(clash[0].model, 'gpt-4o')
    assert.equal(clash[1].model, 'gpt-4o')
    assert.match(clash[0].source, /^2026-/)
    assert.match(clash[1].source, /^2026-/)
    assert.notEqual(clash[0].source, clash[1].source)
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
    assert.deepEqual(labelsOf, [
      { model: 'gpt-4o', source: 'https://a.example' },
      { model: 'gpt-4o', source: 'https://b.example' },
    ])
  })
})

describe('buildProbeMatrixHtml', () => {
  const errorBody = { error: { message: 'nope', tail: 'FULL-BODY' } }
  const left = report({
    completedAt: '2026-09-29T01:00:01.000Z',
    target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
    verdict: {
      family: { label: 'GPT 经典', reasons: ['家族依据'] },
      access: { label: '网关', reasons: ['接入依据'] },
      upstream: { label: 'OpenAI 官方', reasons: ['响应头 openai-organization'] },
    },
    results: {
      'chat-basic': cell('passed', '基础请求返回成功'),
      'temperature@chat': cell('skipped', '用户未勾选'),
      'concurrency@chat': cell('passed', '3/3'),
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
      'chat-basic': cell('failed', '失败', errorBody),
      'image-input@chat': cell('untested', '未测'),
      'concurrency@chat': cell('skipped', '用户未勾选'),
    },
  })

  it('全员未测或跳过的行不出现，行内这些格子是破折号，列头可展开渠道判断', () => {
    const html = buildProbeMatrixHtml([left, right], tests, labels)
    assert.match(html, /<span class="col-model">gpt-4o<\/span>/)
    assert.match(html, /<span class="col-src">渠道甲<\/span>/)
    assert.match(html, /<span class="col-model">deepseek-chat<\/span>/)
    assert.match(html, /<span class="col-src">渠道乙<\/span>/)
    assert.match(html, /gpt-4o · 渠道甲/)
    assert.match(html, /<title>模型探测<\/title>/)
    assert.equal(html.includes('模型对比'), false)
    assert.equal(html.includes('份报告'), false)
    assert.equal(html.includes('模型探测 · 异常'), false)
    assert.match(html, /OpenAI Chat Completions/)
    assert.match(html, /并发请求稳定性<span class="row-sub">Chat Completions<\/span>/)
    assert.equal(html.includes('OpenAI Chat Completions<span class="row-sub">'), false)
    assert.match(html, /<button type="button" class="matrix-cell dot-st passed" data-i="0" aria-label="OpenAI Chat Completions 通过">通过<\/button>/)
    assert.match(html, /"status":"passed"/)
    assert.match(html, /3\/3/)
    assert.equal(html.includes('<span class="dot-st passed">'), false)
    assert.match(html, />失败</)
    assert.match(html, /aria-label="OpenAI Chat Completions 失败"/)
    assert.equal(html.includes('>已跳过<'), false)
    assert.equal(html.includes('>未测<'), false)
    assert.equal(html.includes('temperature'), false)
    assert.equal(html.includes('图片输入'), false)
    assert.match(html, /class="gap"/)
    assert.match(html, /class="matrix-cell/)
    assert.equal(html.includes('aria-label="并发请求稳定性 Chat Completions 已跳过"'), false)
    assert.equal(html.includes('.tile'), false)
    assert.equal(html.includes('class="tile"'), false)
    assert.equal(html.includes('无原生 response_format'), false)
    assert.equal(html.includes('Bearer secret'), false)
    assert.equal(html.includes('家族依据'), false)
    assert.equal(html.includes('接入依据'), false)
    assert.equal(html.split('"body"').length - 1, 3)
    assert.match(html, /FULL-BODY/)
    assert.equal(html.split('req-1').length - 1, 3)
    assert.equal(html.split('https://example/v1/chat/completions').length - 1, 3)
    assert.equal(html.includes('基础请求返回成功'), false)
    assert.equal(html.includes('"explain"'), false)
    assert.match(html, /data-origin="0"/)
    assert.match(html, /渠道判断 gpt-4o · 渠道甲/)
    assert.match(html, /OpenAI 官方/)
    assert.match(html, /响应头 openai-organization/)
    assert.equal(html.includes('data-origin="1"'), false)
    const joinAt = html.indexOf('reasons.join(')
    assert.equal(html.slice(joinAt, joinAt + "reasons.join('\\n')".length), "reasons.join('\\n')")

    const problems = buildProbeMatrixHtml([left, right], tests, labels, undefined, 'problems')
    assert.match(problems, /<title>模型探测 · 异常<\/title>/)
    assert.match(problems, /FULL-BODY/)
    assert.match(problems, /"body":\{"model":"x"\}/)
    assert.equal(problems.split('req-1').length - 1, 1)
    assert.match(problems, /https:\/\/example\/v1\/chat\/completions/)
    assert.match(problems, /<span class="dot-st passed">通过<\/span>/)
    assert.equal(problems.includes('"status":"passed"'), false)
    assert.match(problems, /并发请求稳定性/)
    assert.match(problems, /class="gap"/)
    assert.match(problems, />失败</)
    assert.equal(problems.includes('基础请求返回成功'), false)
    assert.equal(problems.includes('3/3'), false)
    assert.equal(problems.split('"body"').length - 1, 1)
    assert.equal(problems.includes('Bearer secret'), false)
    assert.equal(probeMatrixHasProblems([left, right]), true)
    assert.equal(probeMatrixHasProblems([left]), false)
    assert.equal(probeMatrixHtmlFileName(2), '模型探测_2.html')
    assert.equal(probeMatrixHtmlFileName(2, 'problems'), '模型探测_异常_2.html')
  })

  it('弹层 Request ID 按响应头顺序取，不把响应头原文写进文件', () => {
    const one = report({
      completedAt: '2026-09-29T01:00:01.000Z',
      target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
      results: {
        'chat-basic': {
          ...cell('passed', '基础请求返回成功'),
          repro: {
            url: 'https://example/v1/chat/completions',
            headers: { Authorization: 'Bearer secret' },
            body: { model: 'x' },
            status: 200,
            requestId: 'stale-id',
            responseHeaders: {
              'X-Oneapi-Request-Id': 'one-1',
              'x-request-id': 'req-2',
              'x-log-id': 'log-1',
              'x-trace-id': 'trace-1',
              'content-type': 'application/json',
            },
          },
        },
      },
    })
    const html = buildProbeMatrixHtml([one], tests, labels)
    assert.match(html, /"requestId":"one-1"/)
    assert.match(html, /"body":\{"model":"x"\}/)
    assert.match(html, /https:\/\/example\/v1\/chat\/completions/)
    assert.equal(html.includes('stale-id'), false)
    assert.equal(html.includes('req-2'), false)
    assert.equal(html.includes('log-1'), false)
    assert.equal(html.includes('trace-1'), false)
    assert.equal(html.includes('responseHeaders'), false)
    assert.equal(html.includes('content-type'), false)
    assert.equal(html.includes('Bearer secret'), false)
  })

  it('符合预期留在整表弹层里，带原因、错误 JSON 和 Request ID', () => {
    const one = report({
      completedAt: '2026-09-29T01:00:01.000Z',
      target: { baseUrl: 'https://a.example', model: 'gpt-5', channelName: '渠道甲', overrides: {} },
      results: {
        'temperature@chat': cell('expected', '符合预期：不接受 temperature。{"message":"Unsupported parameter: \'<x>\'"}'),
      },
    })
    const html = buildProbeMatrixHtml([one], tests, labels)
    assert.match(html, /不接受 temperature/)
    assert.match(html, /Unsupported parameter/)
    assert.equal(html.includes('符合预期：'), false)
    assert.equal(html.includes('<x>'), false)
    assert.match(html, /\\u003cx>/)
    assert.match(html, /req-1/)
    assert.match(html, /https:\/\/example\/v1\/chat\/completions/)
    assert.match(html, /"body":\{"model":"x"\}/)
    assert.match(html, /class="matrix-cell/)
    assert.match(html, />符合预期</)
    const problems = buildProbeMatrixHtml([one], tests, labels, undefined, 'problems')
    assert.match(problems, /<span class="dot-st expected">符合预期<\/span>/)
    assert.equal(problems.includes('class="matrix-cell'), false)
    assert.equal(problems.includes('不接受 temperature'), false)
    assert.equal(problems.includes('req-1'), false)
    assert.equal(problems.includes('https://example/v1/chat/completions'), false)
    assert.equal(problems.includes('"body"'), false)
  })
})

describe('buildProbeReportHtml', () => {
  it('单份报告仍是卡片，只展示上游渠道判断，非 2xx 正文进弹层', () => {
    const html = buildProbeReportHtml(report({
      completedAt: '2026-09-29T01:00:01.000Z',
      name: '单份',
      target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
      verdict: {
        family: { label: 'GPT 经典', reasons: ['家族依据'] },
        access: { label: '网关', reasons: ['接入依据'] },
        upstream: { label: 'Azure OpenAI', reasons: ['成功响应含 prompt_filter_results'] },
      },
      results: {
        'chat-basic': cell('passed', '基础请求返回成功'),
        'temperature@chat': cell('failed', '失败', { error: { message: 'kept-body' } }),
      },
    }), tests, labels)
    assert.match(html, /class="tile"/)
    assert.match(html, /\.tile\{/)
    assert.match(html, /渠道判断/)
    assert.match(html, /Azure OpenAI/)
    assert.match(html, /prompt_filter_results/)
    assert.equal(html.includes('家族依据'), false)
    assert.equal(html.includes('接入依据'), false)
    assert.equal(html.includes('家族'), false)
    assert.equal(html.includes('接入层'), false)
    assert.match(html, /kept-body/)
    assert.match(html, /响应体/)
    const prettyAt = html.indexOf('function pretty(v)')
    assert.notEqual(prettyAt, -1)
    assert.match(html.slice(prettyAt, prettyAt + 160), /if \(typeof v === 'string'\) return v;/)
  })

  it('字符串响应体在卡片脚本里按原文返回', () => {
    const html = buildProbeReportHtml(report({
      completedAt: '2026-09-29T01:00:01.000Z',
      target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: {} },
      results: {
        'temperature@chat': cell('failed', '失败', 'upstream said: not json'),
      },
    }), tests, labels)
    assert.match(html, /upstream said: not json/)
    const prettyAt = html.indexOf('function pretty(v)')
    assert.match(html.slice(prettyAt, prettyAt + 160), /if \(typeof v === 'string'\) return v;/)
  })
})
