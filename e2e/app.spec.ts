import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('全局导航与主题', () => {
  test('侧栏 5 个工具可逐个切换且渲染对应标题', async ({ page }) => {
    const tools: [RegExp, string][] = [
      [/Seedance 计费/, 'Seedance 计费计算器'],
      [/JSON 可视化/, 'JSON 可视化 & Diff'],
      [/时间戳转换/, '时间戳转换'],
      [/AI 格式转换/, 'AI 请求体格式转换'],
      [/LLM 批量测试/, 'LLM 批量测试 & 验真'],
    ]
    for (const [nav, title] of tools) {
      await goto(page, nav)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
  })

  test('主题切换：选深色后持久化到 localStorage 且背景变化', async ({ page }) => {
    await goto(page, /Seedance 计费/)
    const bgBefore = await page.evaluate(
      () => getComputedStyle(document.getElementById('root')!.firstElementChild!).backgroundColor,
    )

    await page.getByRole('button', { name: '切换主题' }).click()
    await page.getByRole('button', { name: /深色/ }).click()
    // 等待 260ms 主题过渡结束
    await page.waitForTimeout(400)

    const stored = await page.evaluate(() => localStorage.getItem('dev-toolkit-theme'))
    expect(stored).toBe('dark')
    const bgAfter = await page.evaluate(
      () => getComputedStyle(document.getElementById('root')!.firstElementChild!).backgroundColor,
    )
    expect(bgAfter).not.toBe(bgBefore)
    expect(bgAfter).toBe('rgb(17, 17, 19)') // dark 主题 --bg #111113
  })
})
