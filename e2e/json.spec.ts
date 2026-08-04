import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

/** 左侧面板：内容区（查看态是行 span，编辑态是 textarea） */
const leftPane = (page: import('@playwright/test').Page) => page.getByTestId('json-pane-a')
/** 右侧面板 */
const rightPane = (page: import('@playwright/test').Page) => page.getByTestId('json-pane-b')

test.describe('JSON 可视化 & Diff', () => {
  test('左侧编辑器可输入（回归「完全不能输入」）且高亮同步', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const pane = leftPane(page)
    const ta = pane.getByTestId('json-content')
    await ta.click()
    await ta.fill('{"a":1}')
    await expect(ta).toHaveValue('{"a":1}')
    // pre 高亮层同步显示
    await expect(pane.locator('pre').first()).toContainText('{"a":1}')
    // 工具栏有效徽标
    await expect(page.getByText('左 ✓')).toBeVisible()
  })

  test('格式错误的 JSON 仍可继续输入，且出现「左 格式错误」徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const pane = leftPane(page)
    const ta = pane.getByTestId('json-content')
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
    const pane = leftPane(page)
    await pane.getByTestId('json-content').first().fill('{"a":1,"b":[1,2]}')
    await page.getByRole('button', { name: '格式化', exact: true }).click()
    // 格式化后合法 → 自动进查看态（gutter 行号可见），鼠标移入内容区即编辑
    await expect(pane.getByTestId('json-gutter').first()).toBeVisible()
    await pane.getByTestId('json-content').first().hover()
    const val = await pane.getByTestId('json-content').inputValue()
    expect(val).toContain('\n  ')
    expect(JSON.parse(val)).toEqual({ a: 1, b: [1, 2] })
  })

  test('合法 JSON 失焦后进入查看态（行号 + 折叠），鼠标移入内容区回 textarea', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const pane = leftPane(page)
    // 多行 JSON：折叠区间跨行成立，查看态才有折叠箭头（压缩单行无法折叠）
    await pane.getByTestId('json-content').first().fill('{\n  "name": "Alice",\n  "age": 30,\n  "tags": [\n    1,\n    2\n  ]\n}')
    // 失焦 → 查看态
    await page.locator('h2').first().click()
    // 折叠按钮出现（行号 + 折叠是查看态特征）
    const fold = pane.getByLabel('折叠').first()
    await expect(fold).toBeVisible()
    await fold.click()
    await expect(pane.getByLabel('展开').first()).toBeVisible()
    // 鼠标移入内容区 → textarea
    await pane.getByTestId('json-content').first().hover()
    await expect(pane.locator('textarea')).toBeVisible()
  })

  test('鼠标悬停内容区进入编辑，移到行号列回到查看态（双向通道）', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const pane = leftPane(page)
    // 多行 JSON：保证查看态有折叠箭头可断言
    await pane.getByTestId('json-content').first().fill('{\n  "name": "Alice",\n  "age": 30,\n  "tags": [\n    1,\n    2\n  ]\n}')
    await page.locator('h2').first().click()
    await expect(pane.getByLabel('折叠').first()).toBeVisible()
    // 悬停内容区 → 编辑态 textarea
    await pane.getByTestId('json-content').first().hover()
    await expect(pane.locator('textarea')).toBeVisible()
    // 移到行号列 → 回到查看态，折叠箭头重新出现
    await pane.getByTestId('json-gutter').first().hover()
    await expect(pane.getByLabel('折叠').first()).toBeVisible()
  })

  test('悬停进入编辑态不改写原始文本（取消自动格式化）', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const pane = leftPane(page)
    await pane.getByTestId('json-content').first().fill('{"a":1}')
    // 失焦 → 查看态（gutter 行号可见，textarea 卸载）
    await page.locator('h2').first().click()
    await expect(pane.getByTestId('json-gutter').first()).toBeVisible()
    // 悬停进编辑，原始压缩文本保持原样，不被美化为多行
    await pane.getByTestId('json-content').first().hover()
    await expect(pane.locator('textarea')).toHaveValue('{"a":1}')
  })

  test('A/B 对比高亮差异并显示 +n/−n 徽标', async ({ page }) => {
    await goto(page, /JSON 可视化/)
    const l = leftPane(page).getByTestId('json-content')
    const r = rightPane(page).getByTestId('json-content')
    // 同时填两侧，第 1 侧保持编辑态（先填右，再填左，避免左先合法进入查看态）
    await r.fill('{"a":1,"b":3}')
    await l.fill('{"a":1,"b":2}')
    await page.getByRole('button', { name: 'A/B 对比' }).click()
    await expect(page.getByText('+1')).toBeVisible()
    await expect(page.getByText('−1')).toBeVisible()
  })
})
