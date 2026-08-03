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
    await ta.click()
    await ta.fill('{"a":1}')
    await expect(ta).toHaveValue('{"a":1}')
    // pre 高亮层同步显示
    await expect(page.locator('pre').first()).toContainText('{"a":1}')
    // 工具栏有效徽标
    await expect(page.getByText('左 ✓')).toBeVisible()
  })

  test('格式错误的 JSON 仍可继续输入，且出现「左 格式错误」徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const ta = leftEditor(page)
    await ta.click()
    await ta.fill('{"a":')
    await expect(page.getByText('左 格式错误')).toBeVisible()
    // 仍可继续编辑修正，不崩溃、不清空
    await ta.fill('{"a":1}')
    await expect(ta).toHaveValue('{"a":1}')
    await expect(page.getByText('左 ✓')).toBeVisible()
  })

  test('格式化按钮把压缩 JSON 美化为多行缩进', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const ta = leftEditor(page)
    await ta.click()
    await ta.fill('{"a":1,"b":[1,2]}')
    await page.getByRole('button', { name: '格式化', exact: true }).click()
    // 格式化后合法 → 自动进查看态，再点「编辑」回 textarea 读格式化结果
    await expect(page.getByText('✎ 编辑').first()).toBeVisible()
    await page.getByText('✎ 编辑').first().click()
    const val = await leftEditor(page).inputValue()
    expect(val).toContain('\n  ')
    expect(JSON.parse(val)).toEqual({ a: 1, b: [1, 2] })
  })

  test('合法 JSON 失焦后进入查看态（行号 + 折叠），点编辑回 textarea', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const ta = leftEditor(page)
    await ta.click()
    await ta.fill('{"name":"Alice","age":30,"tags":[1,2]}')
    // 失焦 → 查看态
    await page.locator('h2').first().click()
    await expect(page.getByText('✎ 编辑').first()).toBeVisible()
    // 折叠按钮出现（行号 + 折叠是查看态特征）
    const fold = page.getByLabel('折叠').first()
    await expect(fold).toBeVisible()
    await fold.click()
    await expect(page.getByLabel('展开').first()).toBeVisible()
    // 点编辑回 textarea
    await page.getByText('✎ 编辑').first().click()
    await expect(leftEditor(page)).toBeVisible()
  })

  test('A/B 对比高亮差异并显示 +n/−n 徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const l = page.locator('textarea').nth(0)
    const r = page.locator('textarea').nth(1)
    // 同时填两侧，第 1 侧保持编辑态（先填右，再填左，避免左先合法进入查看态）
    await r.click()
    await r.fill('{"a":1,"b":3}')
    await l.click()
    await l.fill('{"a":1,"b":2}')
    await page.getByRole('button', { name: 'A/B 对比' }).click()
    await expect(page.getByText('+1')).toBeVisible()
    await expect(page.getByText('−1')).toBeVisible()
  })
})
