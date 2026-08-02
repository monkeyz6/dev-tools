import { test, expect } from '@playwright/test'
import { goto, selectOption, selectByLabel } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('AI 请求体格式转换', () => {
  test('OpenAI Chat → Anthropic 输出含 model/messages/max_tokens', async ({ page }) => {
    await goto(page, /AI 格式转换/)
    await expect(selectByLabel(page, '源格式')).toHaveText('OpenAI Chat Completions')
    await expect(selectByLabel(page, '目标格式')).toHaveText('Anthropic Messages')
    const main = page.locator('main')
    await expect(main).toContainText('max_tokens')
    await expect(main).toContainText('"messages"')
    // 转换保留输入模型 gpt-4o；且 Anthropic 输出含 system 字段（输入只有 role:system）
    await expect(main).toContainText('gpt-4o')
    await expect(main).toContainText('"system":')
  })

  test('注入 cache_control 后输出含 cache_control', async ({ page }) => {
    await goto(page, /AI 格式转换/)
    await page.getByRole('switch').click()
    await expect(page.locator('main')).toContainText('cache_control')
  })

  test('Anthropic → OpenAI Responses 转换字段正确', async ({ page }) => {
    await goto(page, /AI 格式转换/)
    await selectOption(page, '源格式', 'Anthropic Messages')
    await selectOption(page, '目标格式', 'OpenAI Responses')
    const main = page.locator('main')
    await expect(main).toContainText('"input"')
    await expect(main).toContainText('"instructions"')
    await expect(main).toContainText('max_output_tokens')
  })
})
