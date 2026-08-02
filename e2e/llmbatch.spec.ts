import { test, expect } from '@playwright/test'
import { goto, inputByLabel } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

const OK_BODY = JSON.stringify({
  model: 'gpt-4o-mini',
  choices: [{ message: { role: 'assistant', content: '这是一段测试回复。' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
})

test.describe('LLM 批量测试', () => {
  test('mock 200：并发请求出结果卡与统计', async ({ page }) => {
    await page.route('**/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY }))

    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test')
    const run = page.getByRole('button', { name: /开始批量请求/ })
    await expect(run).toBeEnabled()
    await run.click()

    // 3 张结果卡
    await expect(page.getByText('#1')).toBeVisible()
    await expect(page.getByText('#3')).toBeVisible()
    // 每卡含首字/总耗时、返回模型、in/out tokens
    await expect(page.getByText(/首字/).first()).toBeVisible()
    await expect(page.getByText('返回模型 gpt-4o-mini').first()).toBeVisible()
    await expect(page.getByText('in: 10').first()).toBeVisible()
    await expect(page.getByText('out: 5').first()).toBeVisible()
    // 统计条
    const main = page.locator('main')
    await expect(main).toContainText('成功')
    await expect(main).toContainText('状态码 200')
    await expect(main).toContainText('1/3 种')
  })

  test('mock 500：展示失败计数与状态码', async ({ page }) => {
    await page.route('**/chat/completions', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'boom' } }),
      }))

    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    await expect(page.getByText('boom').first()).toBeVisible()
    const main = page.locator('main')
    await expect(main).toContainText('失败')
    await expect(main).toContainText('状态码 500')
  })
})
