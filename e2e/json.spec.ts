import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

const leftEditor = (page: import('@playwright/test').Page) => page.locator('textarea').nth(0)
const rightEditor = (page: import('@playwright/test').Page) => page.locator('textarea').nth(1)

test.describe('JSON 可视化 & Diff', () => {
  test('左侧编辑器可输入（回归「完全不能输入」）且高亮同步', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const ta = leftEditor(page)
    // 点击中心应命中 textarea 而非被容器遮挡
    await ta.click()
    await expect(ta).toBeFocused()

    await ta.fill('{"a":1}')
    await expect(ta).toHaveValue('{"a":1}')
    // pre 高亮层同步显示
    const pre = page.locator('pre').first()
    await expect(pre).toContainText('{"a":1}')
    // 有效徽标
    await expect(page.getByText('✓ 有效')).toBeVisible()
  })

  test('格式错误的 JSON 仍可继续输入，且出现「格式错误」徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const ta = leftEditor(page)
    await ta.fill('{"a":')
    await expect(page.getByText('格式错误')).toBeVisible()
    // 仍可继续编辑修正，不崩溃、不清空
    await ta.fill('{"a":1}')
    await expect(ta).toHaveValue('{"a":1}')
    await expect(page.getByText('✓ 有效')).toBeVisible()
  })

  test('格式化按钮把压缩 JSON 美化为多行缩进', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    await leftEditor(page).fill('{"a":1,"b":[1,2]}')
    await page.getByRole('button', { name: '格式化', exact: true }).click()
    const val = await leftEditor(page).inputValue()
    expect(val).toContain('\n  ')
    expect(val).not.toBe('{"a":1,"b":[1,2]}')
    // 可解析回同一对象
    expect(JSON.parse(val)).toEqual({ a: 1, b: [1, 2] })
  })

  test('A/B 对比高亮差异并显示 +n/−n 徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    await leftEditor(page).fill('{"a":1,"b":2}')
    await rightEditor(page).fill('{"a":1,"b":3}')
    await page.getByRole('button', { name: 'A/B 对比' }).click()
    await expect(page.getByText('+1')).toBeVisible()
    await expect(page.getByText('−1')).toBeVisible()
  })
})
