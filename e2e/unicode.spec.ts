import { test, expect } from '@playwright/test'
import { goto, selectOption } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('Unicode 转换', () => {
  test('默认 JS 转义：非 ASCII 转义，ASCII 保留', async ({ page }) => {
    await goto(page, /Unicode 转换/)
    const left = page.locator('textarea').first()
    const right = page.locator('textarea').nth(1)
    await left.fill('中文 A 🎉')
    await expect(right).toHaveValue('\\u4e2d\\u6587 A \\ud83c\\udf89')
  })

  test('6 种格式各编码一次', async ({ page }) => {
    await goto(page, /Unicode 转换/)
    const left = page.locator('textarea').first()
    const right = page.locator('textarea').nth(1)
    await left.fill('中文 🎉')
    const cases: [string, string][] = [
      ['\\uXXXX（JS / JSON）', '\\u4e2d\\u6587 \\ud83c\\udf89'],
      ['\\u{XXXXX}（ES6）', '\\u{4e2d}\\u{6587} \\u{1f389}'],
      ['&#x4E2D;（HTML 十六进制）', '&#x4e2d;&#x6587; &#x1f389;'],
      ['&#20013;（HTML 十进制）', '&#20013;&#25991; &#127881;'],
      ['U+4E2D（标准记法）', 'U+4e2d U+6587  U+1f389 '],
      ['%u4E2D（旧 escape）', '%u4e2d%u6587 %ud83c%udf89'],
    ]
    for (const [opt, expected] of cases) {
      await selectOption(page, '编码为', opt)
      await expect(right).toHaveValue(expected)
    }
  })

  test('解码自动识别混合格式', async ({ page }) => {
    await goto(page, /Unicode 转换/)
    await page.locator('textarea').nth(1).fill('\\u4e2d&#x6587;U+0041')
    await expect(page.locator('textarea').first()).toHaveValue('中文A')
  })
})
