import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('Base64 编解码', () => {
  test('中文 + emoji 双向互转', async ({ page }) => {
    await goto(page, /Base64 编解码/)
    const left = page.locator('textarea').first()
    const right = page.locator('textarea').nth(1)
    await left.fill('中文 abc 🎉')
    await expect(right).toHaveValue('5Lit5paHIGFiYyDwn46J')
    // 反向：编辑右侧 → 左侧解出原文
    await right.fill('5Lit5paHIGFiYyDwn46J')
    await expect(left).toHaveValue('中文 abc 🎉')
  })

  test('URL-safe：+/ 换成 -_ 并去掉尾部 =，宽容解码可还原', async ({ page }) => {
    await goto(page, /Base64 编解码/)
    const left = page.locator('textarea').first()
    const right = page.locator('textarea').nth(1)
    // 601 字节 → 标准 Base64 带 = 填充
    await left.fill('a'.repeat(601))
    const std = (await right.inputValue())!
    await page.getByRole('switch').first().click()
    const safe = (await right.inputValue())!
    expect(safe).toBe(std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    // 宽容解码把去填充的 URL-safe 串还原
    await right.fill(safe)
    await expect(left).toHaveValue('a'.repeat(601))
  })

  test('非法输入显示错误提示', async ({ page }) => {
    await goto(page, /Base64 编解码/)
    await page.locator('textarea').nth(1).fill('!!!not base64!!!')
    await expect(page.getByText('错误', { exact: true })).toBeVisible()
  })
})
