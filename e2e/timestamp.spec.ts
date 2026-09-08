import { test, expect, Page } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

const tsInput = (page: Page) => page.getByPlaceholder('输入时间戳，如 1705289400000 或 2026-09-04T05:35:00Z')
const dateInput = (page: Page) => page.getByPlaceholder('如 2024-01-15 14:30:00 或 2026-09-04T05:35:00Z')

test.describe('时间戳转换', () => {
  test('10 位秒戳自动识别为 S', async ({ page }) => {
    await goto(page, /时间戳转换/)
    await tsInput(page).fill('1705289400')
    await expect(page.getByText('自动识别为 S')).toBeVisible()
    await expect(page.getByText('1705289400', { exact: true }).first()).toBeVisible()
  })

  test('13 位毫秒戳自动识别为 MS', async ({ page }) => {
    await goto(page, /时间戳转换/)
    await tsInput(page).fill('1705289400000')
    await expect(page.getByText('自动识别为 MS')).toBeVisible()
    await expect(page.getByText('1705289400000', { exact: true }).first()).toBeVisible()
  })

  test('19 位纳秒戳自动识别为 NS 且日期正确', async ({ page }) => {
    await goto(page, /时间戳转换/)
    await tsInput(page).fill('1705289400123456789')
    await expect(page.getByText('自动识别为 NS')).toBeVisible()
    await expect(page.getByText('纳秒时间戳')).toBeVisible()
  })

  test('日期时间 → 毫秒/秒时间戳', async ({ page }) => {
    await goto(page, /时间戳转换/)
    const expected = Date.parse('2024-01-15T06:10:00Z')
    await dateInput(page).fill('2024-01-15T06:10:00Z')
    await expect(page.getByText(String(expected), { exact: true }).first()).toBeVisible()
    await expect(page.getByText(String(Math.floor(expected / 1000)), { exact: true }).first()).toBeVisible()
  })

  test('时间戳栏识别 ISO 8601 Z 而不剥成数字', async ({ page }) => {
    await goto(page, /时间戳转换/)
    const iso = '2026-09-04T05:35:00Z'
    const expected = Date.parse(iso)
    await tsInput(page).fill(iso)
    await expect(page.getByText('自动识别为 ISO 8601')).toBeVisible()
    await expect(page.getByText(String(expected), { exact: true }).first()).toBeVisible()
    await expect(page.getByText(String(Math.floor(expected / 1000)), { exact: true }).first()).toBeVisible()
    await expect(page.getByText('自动识别为 MS')).toHaveCount(0)
  })

  test('日期时间栏解析 2026-09-04T05:35:00Z', async ({ page }) => {
    await goto(page, /时间戳转换/)
    const iso = '2026-09-04T05:35:00Z'
    const expected = Date.parse(iso)
    await dateInput(page).fill(iso)
    await expect(page.getByText(String(expected), { exact: true }).first()).toBeVisible()
    await expect(page.getByText(String(Math.floor(expected / 1000)), { exact: true }).first()).toBeVisible()
  })

  test('无时区空格日期按本地时间解析', async ({ page }) => {
    await goto(page, /时间戳转换/)
    const expected = new Date(2024, 0, 15, 14, 30, 0).getTime()
    await dateInput(page).fill('2024-01-15 14:30:00')
    await expect(page.getByText(String(expected), { exact: true }).first()).toBeVisible()
  })

  test('「使用当前」按钮填充当前毫秒时间戳', async ({ page }) => {
    await goto(page, /时间戳转换/)
    await page.getByRole('button', { name: '使用当前' }).click()
    const val = await tsInput(page).inputValue()
    expect(val).toMatch(/^\d{13}$/)
  })
})
