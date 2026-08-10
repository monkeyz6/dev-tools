import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test('Excel 上传生成报告', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await page.getByRole('button', { name: 'Excel / CSV' }).click()
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/logs_archive_202607.xlsx')
  await page.getByRole('button', { name: '生成报告' }).click()
  await expect(page.getByText('LLM 日志性能分析报告')).toBeVisible()
  await expect(page.getByText('EXCEL', { exact: true })).toBeVisible()
  await expect(page.getByText('6 / 6', { exact: true })).toBeVisible()
  await expect(page.getByText('613').first()).toBeVisible()
})

test('导出 HTML 单文件可离线打开渲染', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await page.locator('textarea').fill(JSON.stringify([
    { id: 1, created_at: 1785318047, model_name: 'm1', username: 'u1', prompt_tokens: 33, completion_tokens: 191, use_time: 6, is_stream: 1, group: 'PRO', other: JSON.stringify({ request_path: '/v1/chat/completions', frt: 2659, stream_status: { end_reason: 'done', status: 'ok' } }) },
    { id: 2, created_at: 1785318048, model_name: 'm1', username: 'u1', prompt_tokens: 68, completion_tokens: 700, use_time: 21, is_stream: 1, group: 'PRO', other: JSON.stringify({ request_path: '/v1/responses', frt: 3505, stream_status: { end_reason: 'eof', status: 'ok' } }) },
    { id: 3, created_at: 1785318054, model_name: 'm1', username: 'u1', prompt_tokens: 33, completion_tokens: 150, use_time: 6, is_stream: 0, group: 'PRO', other: JSON.stringify({ request_path: '/v1/chat/completions', frt: -1000 }) },
    { id: 4, created_at: 1785318120, model_name: 'm1', username: 'u1', prompt_tokens: 12, completion_tokens: 0, use_time: 60, is_stream: 1, group: 'PRO', other: JSON.stringify({ request_path: '/v1/chat/completions', frt: 12000, stream_status: { end_reason: 'timeout', status: 'fail' } }) },
  ]))
  await page.getByRole('button', { name: '生成报告' }).click()
  await expect(page.getByText('LLM 日志性能分析报告')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出 HTML/ }).click(),
  ])
  const path = '/tmp/llmreport-export-test.html'
  await download.saveAs(path)
  // 离线打开导出的 HTML（file:// 无服务器），验证图表渲染
  const { readFileSync } = await import('node:fs')
  const out = readFileSync(path, 'utf8')
  expect(out).toContain('__REPORT_DATA')
  await page.goto('file://' + path)
  await expect(page.getByText('LLM 日志性能分析报告').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('TTFT 分布直方图').first()).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
  // 主题切换按钮存在
  await expect(page.getByRole('button', { name: /浅色模式|深色模式/ })).toBeVisible()
})
