import { test, expect } from '@playwright/test'
import { goto, inputByLabel } from './helpers'

test.beforeEach(async ({ page }) => {
  // 仅在标签页首次加载时清空 localStorage；reload 不再清，便于测试持久化
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

test.describe('图片视频计费', () => {
  test('默认 Seedance 面板可计算人民币与美元费用', async ({ page }) => {
    await goto(page, /图片视频计费/)
    await expect(page.getByRole('heading', { name: '图片视频计费计算器' })).toBeVisible()
    await inputByLabel(page, 'Token 数量').fill('200000')
    await expect(page.getByText(/^¥/).first()).toBeVisible()
    await expect(page.getByText(/^\$/).first()).toBeVisible()
    await expect(page.getByText(/单价/).first()).toBeVisible()
  })

  test('切换到 Grok Image 按张计算并展示单价', async ({ page }) => {
    await goto(page, /图片视频计费/)
    await page.getByRole('button', { name: 'Grok Image', exact: true }).click()
    await inputByLabel(page, '生成张数 (n)').fill('2')
    await expect(page.getByText(/^¥/).first()).toBeVisible()
    await expect(page.getByText(/^\$/).first()).toBeVisible()
    await expect(page.getByText(/\$0\.02/).first()).toBeVisible()
  })

  test('粘贴 JSON 识别自动切换产品并填充表单', async ({ page }) => {
    await goto(page, /图片视频计费/)
    await page.getByRole('button', { name: /粘贴 JSON 自动识别/ }).click()
    await page.locator('textarea').fill(JSON.stringify({ model: 'grok-imagine-image', n: 2, resolution: '1k' }))
    await page.getByRole('button', { name: '解析并填充', exact: true }).click()
    await expect(page.getByText('请求体解析').first()).toBeVisible()
    await expect(inputByLabel(page, '生成张数 (n)')).toHaveValue('2')
    await expect(page.getByText(/^¥/).first()).toBeVisible()
  })

  test('侧栏菜单名后显示 Beta 徽章', async ({ page }) => {
    await goto(page, /图片视频计费/)
    await expect(page.locator('.beta-badge')).toHaveText('Beta')
  })
})
