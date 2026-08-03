import { test } from '@playwright/test'
import { goto } from './helpers'

test('shot', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await goto(page, /LLM 批量测试/)
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-wuwei-code-vueCode-2026-tool/36f62dda-afdf-4137-9751-e318f15a60b6/scratchpad/live.png', fullPage: false })

  // 切到报告面板看看空态与切换效果
  await page.getByRole('button', { name: '报告' }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-wuwei-code-vueCode-2026-tool/36f62dda-afdf-4137-9751-e318f15a60b6/scratchpad/report-empty.png', fullPage: false })

  await page.getByRole('button', { name: /历史/ }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-wuwei-code-vueCode-2026-tool/36f62dda-afdf-4137-9751-e318f15a60b6/scratchpad/history-empty.png', fullPage: false })

  // 跑一次带 mock 的批量请求，看报告/历史真实渲染效果
  await page.route('**/v1/messages', async route => {
    const body = route.request().postDataJSON() as { model: string }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: body.model, usage: { input_tokens: 1234, output_tokens: 88 } }) })
  })
  await page.getByRole('button', { name: '实时' }).click()
  const keyField = page.locator('label:has-text("API Key")').locator('..')
  await keyField.locator('input').fill('sk-test')
  const nField = page.locator('label:has-text("每模型次数 N")').locator('..')
  await nField.locator('input').fill('5')
  await page.getByRole('button', { name: /开始批量请求/ }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-wuwei-code-vueCode-2026-tool/36f62dda-afdf-4137-9751-e318f15a60b6/scratchpad/report-filled.png', fullPage: true })

  await page.getByRole('button', { name: /历史/ }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-wuwei-code-vueCode-2026-tool/36f62dda-afdf-4137-9751-e318f15a60b6/scratchpad/history-filled.png', fullPage: false })
})
