import { test, expect, type Page } from '@playwright/test'

async function openImageAnalyzer(page: Page) {
  await page.goto('/')
  await page.getByText('图片信息识别').click()
}

async function canvasPngDataUrl(page: Page, width: number, height: number) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.fillStyle = '#2f54eb'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }, { width, height })
}

async function loadPastedText(page: Page, text: string) {
  await page.getByPlaceholder(/https:\/\/example\.com\/photo\.jpg/).fill(text)
  await page.getByRole('button', { name: '加载图片' }).click()
}

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
  await loadPastedText(page, 'https://cdn.example/tier-2k.png')

  await expect(page.getByText('2816 × 1584')).toBeVisible()
  await expect(page.getByText('✓ 2K 分辨率档位')).toBeVisible()
  await expect(page.getByText('非标准尺寸').first()).toBeVisible()
})

test('带 data:image 前缀的 Base64 可识别', async ({ page }) => {
  await openImageAnalyzer(page)
  const dataUrl = await canvasPngDataUrl(page, 32, 24)
  await loadPastedText(page, dataUrl)
  await expect(page.getByText('32 × 24')).toBeVisible()
  await expect(page.getByText('base64-image-1.png')).toBeVisible()
  await expect(page.getByText('PNG').first()).toBeVisible()
})

test('无前缀的纯 Base64 可识别', async ({ page }) => {
  await openImageAnalyzer(page)
  const dataUrl = await canvasPngDataUrl(page, 40, 18)
  const raw = dataUrl.split(',')[1]
  await loadPastedText(page, raw)
  await expect(page.getByText('40 × 18')).toBeVisible()
  await expect(page.getByText('base64-image-1.png')).toBeVisible()
  await expect(page.getByText('PNG').first()).toBeVisible()
})

test('中间带换行的 Base64 可识别', async ({ page }) => {
  await openImageAnalyzer(page)
  const dataUrl = await canvasPngDataUrl(page, 28, 16)
  const raw = dataUrl.split(',')[1]
  const wrapped = raw.match(/.{1,48}/g)!.join('\n')
  await loadPastedText(page, wrapped)
  await expect(page.getByText('28 × 16')).toBeVisible()
  await expect(page.getByText('base64-image-1.png')).toBeVisible()
})
