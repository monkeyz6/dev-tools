import { test, expect } from '@playwright/test'
import { goto, selectOption, selectByLabel, inputByLabel } from './helpers'

test.beforeEach(async ({ page }) => {
  // 仅在标签页首次加载时清空 localStorage；reload 不再清，便于测试持久化
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

test.describe('Seedance 计费', () => {
  test('分辨率选项随模型联动，区域切换重置模型', async ({ page }) => {
    await goto(page, /Seedance 计费/)
    // 默认 2.0：分辨率含 4 档
    await selectByLabel(page, '输出分辨率').click()
    await expect(page.getByRole('button', { name: '1080p', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '4K', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    // 切 2.0-fast：分辨率只剩 480p/720p
    await selectOption(page, '模型变体', 'doubao-seedance-2.0-fast')
    await selectByLabel(page, '输出分辨率').click()
    await expect(page.getByRole('button', { name: '1080p', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: '720p', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    // 切海外：模型重置为 dreamina-2-0、分辨率重置为 480p
    await page.getByRole('button', { name: '海外', exact: true }).click()
    await expect(selectByLabel(page, '模型变体')).toHaveText('dreamina-seedance-2-0-260128')
    await expect(selectByLabel(page, '输出分辨率')).toHaveText('480p')
  })

  test('输入 Token 后同时显示人民币与美元费用及单价', async ({ page }) => {
    await goto(page, /Seedance 计费/)
    await inputByLabel(page, 'Token 数量').fill('200000')
    await expect(page.getByText(/^¥/).first()).toBeVisible()
    await expect(page.getByText(/^\$/).first()).toBeVisible()
    await expect(page.getByText(/单价/).first()).toBeVisible()
  })

  test('海外 2.5 未填价时警告，填写后计算并持久化', async ({ page }) => {
    await goto(page, /Seedance 计费/)
    await page.getByRole('button', { name: '海外', exact: true }).click()
    await selectOption(page, '模型变体', 'dreamina-seedance-2-5')

    // 未填价 → 无法计算
    await expect(page.getByText('无法计算')).toBeVisible()

    // 展开默认收起的价目表，再填单价 → 出结果
    await page.getByRole('button', { name: /价目表/ }).click()
    await page.getByPlaceholder('不含视频', { exact: true }).fill('10')
    await page.getByPlaceholder('含视频', { exact: true }).fill('6')
    await expect(page.getByText(/^¥/).first()).toBeVisible()

    // 持久化到 localStorage
    const stored = await page.evaluate(() => localStorage.getItem('seedance-intl-25-prices'))
    expect(JSON.parse(stored!)).toEqual({ no: 10, yes: 6 })

    // reload 后仍保留
    await page.reload()
    await page.getByRole('button', { name: '海外', exact: true }).click()
    await selectOption(page, '模型变体', 'dreamina-seedance-2-5')
    await page.getByRole('button', { name: /价目表/ }).click()
    await expect(page.getByPlaceholder('不含视频', { exact: true })).toHaveValue('10')
    await expect(page.getByPlaceholder('含视频', { exact: true })).toHaveValue('6')
  })
})
