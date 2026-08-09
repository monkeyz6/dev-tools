import { test, expect } from '@playwright/test'

test('非固定规格的 2816×1584 归入 2K 分辨率档位', async ({ page }) => {
  await page.goto('/')
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2816
    canvas.height = 1584
    const context = canvas.getContext('2d')!
    context.fillStyle = '#2f54eb'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.route('https://cdn.example/tier-2k.png', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: Buffer.from(pngBase64, 'base64'),
  }))

  await page.getByText('图片信息识别').click()
  await page.getByPlaceholder(/https:\/\/example\.com\/photo\.jpg/).fill('https://cdn.example/tier-2k.png')
  await page.getByRole('button', { name: '加载 URL 图片' }).click()

  await expect(page.getByText('2816 × 1584')).toBeVisible()
  await expect(page.getByText('✓ 2K 分辨率档位')).toBeVisible()
  await expect(page.getByText('非标准尺寸').first()).toBeVisible()
})
