import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})

test('浅色工作台视觉基线', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('dev-toolkit-theme', 'light')
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Seedance 计费计算器' })).toBeVisible()
  await expect(page).toHaveScreenshot('workspace-light.png', { animations: 'disabled' })
})

test('深色密集编辑器视觉基线', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('dev-toolkit-theme', 'dark')
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'JSON 可视化' }).click()
  await expect(page.getByRole('heading', { name: 'JSON 可视化 & Diff' })).toBeVisible()
  await expect(page).toHaveScreenshot('workspace-dark-json.png', { animations: 'disabled' })
})
