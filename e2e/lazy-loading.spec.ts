import { test, expect } from '@playwright/test'

const jsonModule = /\/src\/tools\/JsonTool\.tsx(?:\?|$)/
const timestampModule = /\/src\/tools\/TimestampTool\.tsx(?:\?|$)/

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('工具懒加载与预加载', () => {
  test('直接访问异步工具只加载目标模块', async ({ page }) => {
    const requests: string[] = []
    page.on('request', request => {
      if (jsonModule.test(request.url()) || timestampModule.test(request.url())) requests.push(request.url())
    })

    await page.goto('/tools/json')
    await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
    expect(requests.filter(url => jsonModule.test(url))).toHaveLength(1)
    expect(requests.filter(url => timestampModule.test(url))).toHaveLength(0)
  })

  test('首屏不请求非默认工具，hover 后预加载且点击不重复请求', async ({ page }) => {
    const requests: string[] = []
    page.on('request', request => {
      if (jsonModule.test(request.url())) requests.push(request.url())
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: /工具集合/ })).toBeVisible()
    expect(requests).toHaveLength(0)

    const jsonNav = page.locator('[data-tool-key="json"]')
    await jsonNav.hover()
    await expect.poll(() => requests.length).toBe(1)
    await expect(page.getByRole('heading', { name: /工具集合/ })).toBeVisible()

    await jsonNav.click()
    await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
    expect(requests).toHaveLength(1)

    await page.locator('[data-tool-key="seedance"]').click()
    await jsonNav.click()
    await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
    expect(requests).toHaveLength(1)
  })

  test('键盘 focus 立即预加载目标工具', async ({ page }) => {
    const requestPromise = page.waitForRequest(request => jsonModule.test(request.url()))
    await page.goto('/')
    await page.locator('[data-tool-key="json"]').focus()
    await requestPromise
    await expect(page.getByRole('heading', { name: /工具集合/ })).toBeVisible()
  })

  test('节省流量模式下 hover 不做推测加载，点击仍会加载', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'connection', {
        configurable: true,
        get: () => ({ saveData: true, effectiveType: '4g' }),
      })
    })
    const requests: string[] = []
    page.on('request', request => {
      if (jsonModule.test(request.url())) requests.push(request.url())
    })

    await page.goto('/')
    const jsonNav = page.locator('[data-tool-key="json"]')
    await jsonNav.hover()
    await page.waitForTimeout(180)
    expect(requests).toHaveLength(0)

    await jsonNav.click()
    await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
    expect(requests).toHaveLength(1)
  })

  test('模块延迟时保留应用外壳并显示可访问 loading 状态', async ({ page }) => {
    await page.route('**/src/tools/JsonTool.tsx', async route => {
      await new Promise(resolve => setTimeout(resolve, 350))
      await route.continue()
    })
    await page.goto('/')
    await page.locator('[data-tool-key="json"]').click()

    await expect(page.locator('.tool-loading[aria-busy="true"]')).toBeVisible()
    await expect(page.getByRole('button', { name: '切换主题' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
  })
})
