import { test, expect } from '@playwright/test'

const tools = [
  // AI 模型工具
  { key: 'seedance', label: 'Seedance 计费', heading: 'Seedance 计费计算器' },
  { key: 'multicost', label: '图片视频计费', heading: '图片视频计费计算器' },
  { key: 'modelprobe', label: '模型探测', heading: '模型探测' },
  { key: 'llmbatch', label: 'LLM 批量测试', heading: 'LLM 批量测试 & 验真' },
  { key: 'llmreport', label: 'LLM 报告生成', heading: 'LLM 报告生成' },
  { key: 'imgtest', label: '图片接口测试', text: '本次测试配置' },
  { key: 'imganalyze', label: '图片信息识别', heading: '图片信息识别器' },
  { key: 'videoanalyze', label: '视频信息检测', heading: '视频信息检测' },
  // 数据格式工具
  { key: 'json', label: 'JSON 可视化', heading: 'JSON 可视化 & Diff' },
  { key: 'graphql', label: 'GraphQL 格式化', heading: 'GraphQL 格式化' },
  { key: 'aiconvert', label: 'AI 格式转换', heading: 'AI 请求体格式转换' },
  // 编码与辅助工具
  { key: 'base64', label: 'Base64 编解码', heading: 'Base64 编解码' },
  { key: 'unicode', label: 'Unicode 转换', heading: 'Unicode 转换' },
  { key: 'timestamp', label: '时间戳转换', heading: '时间戳转换' },
  { key: 'promptopt', label: '提示词优化', heading: '提示词优化' },
  { key: 'idgen', label: 'ID 生成器', heading: 'ID 生成器' },
] as const

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('根路径渲染首页且不重定向', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as Window & { historyLengthBeforeApp?: number }).historyLengthBeforeApp = window.history.length
  })
  await page.goto('/?from=legacy#old-route')

  await expect(page).toHaveURL('/?from=legacy#old-route')
  await expect(page).toHaveTitle('Dev Toolkit · 前端工具箱')
  await expect(page.getByRole('heading', { name: /工具集合/ })).toBeVisible()
  await expect(page.locator('.home-card')).toHaveCount(16)
  await expect(page.locator('aside')).toHaveCount(0)
  const lengths = await page.evaluate(() => ({
    before: (window as Window & { historyLengthBeforeApp?: number }).historyLengthBeforeApp,
    after: window.history.length,
  }))
  expect(lengths.after).toBe(lengths.before)
})

test('16 个工具路径均可直接进入并同步标题与侧栏状态', async ({ page }) => {
  for (const tool of tools) {
    await page.goto(`/tools/${tool.key}`)
    await expect(page).toHaveURL(`/tools/${tool.key}`)
    await expect(page).toHaveTitle(`${tool.label} · Dev Toolkit`)
    await expect(page.locator(`[data-tool-key="${tool.key}"]`)).toHaveAttribute('aria-current', 'page')
    if ('heading' in tool) {
      await expect(page.getByRole('heading', { name: tool.heading })).toBeVisible()
    } else {
      await expect(page.getByText(tool.text).first()).toBeVisible()
    }
  }
})

test('侧栏使用真实链接，并支持历史前进后退且不重复入栈', async ({ page }) => {
  await page.goto('/tools/seedance')
  const jsonLink = page.locator('[data-tool-key="json"]')
  const timestampLink = page.locator('[data-tool-key="timestamp"]')
  await expect(jsonLink).toHaveAttribute('href', '/tools/json')
  expect(await jsonLink.evaluate(element => element.tagName)).toBe('A')

  await jsonLink.click()
  await expect(page).toHaveURL('/tools/json')
  await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
  await timestampLink.click()
  await expect(page).toHaveURL('/tools/timestamp')

  await page.goBack()
  await expect(page).toHaveURL('/tools/json')
  await expect(jsonLink).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(page).toHaveURL('/tools/timestamp')

  const historyLength = await page.evaluate(() => window.history.length)
  await timestampLink.click()
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
})

test('有效尾斜杠被规范化，无效路径显示可恢复 404', async ({ page }) => {
  await page.goto('/tools/json/?stale=1#editor')
  await expect(page).toHaveURL('/tools/json')
  await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()

  await page.goto('/tools/not-exists')
  await expect(page).toHaveURL('/tools/not-exists')
  await expect(page).toHaveTitle('工具不存在 · Dev Toolkit')
  await expect(page.getByRole('heading', { name: '工具不存在' })).toBeVisible()
  await expect(page.locator('[data-tool-key][aria-current="page"]')).toHaveCount(0)
  await page.getByRole('link', { name: '返回首页' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: /工具集合/ })).toBeVisible()
})
