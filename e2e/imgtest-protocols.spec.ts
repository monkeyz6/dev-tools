import { test, expect } from '@playwright/test'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function addChannel(page: any, name: string) {
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill(name)
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

test('Gemini 原生 generateContent：x-goog-api-key 头 + imageConfig 透传', async ({ page }) => {
  let seenReq: { url: string; headers: any; body: any } | null = null
  await page.route('**/v1/models/gemini-3-pro-image:generateContent', async route => {
    const headers = await route.request().allHeaders()
    seenReq = { url: route.request().url(), headers, body: route.request().postDataJSON() }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const ctx = c.getContext('2d')!; ctx.fillStyle = '#22cc66'; ctx.fillRect(0, 0, 1024, 1024); return c.toDataURL('image/png').split(',')[1] }) } }] } }]
    }) })
  })
  await page.goto('/')
  await addChannel(page, 'Gemini渠道')
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('Gemini generateContent').click()
  await page.getByText('1K + 1:1').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('✓ 通过 4/4')).toBeVisible()
  expect(seenReq).not.toBeNull()
  expect(seenReq!.headers['x-goog-api-key']).toBe('sk-test-1234567890')
  expect(seenReq!.body.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '1K' })
  expect(seenReq!.url).toContain('/v1/models/gemini-3-pro-image:generateContent')
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByRole('cell', { name: 'Gemini' }).first()).toBeVisible()
})

test('OpenAI edits multipart：上传参考图 + image[] 字段透传', async ({ page }) => {
  let seenBody: string | null = null
  let seenUrl = ''
  await page.route('**/v1/images/edits', async route => {
    seenBody = await route.request().postData()
    seenUrl = route.request().url()
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = 1024
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#3366ff'
      ctx.fillRect(0, 0, 1024, 1024)
      return c.toDataURL('image/png').split(',')[1]
    })
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ data: [{ b64_json: b64 }] }) })
  })
  await page.goto('/')
  await addChannel(page, 'Edits渠道')
  await page.locator('input[type=file]').setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: Buffer.from(PNG.split(',')[1], 'base64') })
  await page.getByText('参考图编辑 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('✓ 通过 3/3')).toBeVisible()
  expect(seenUrl).toContain('/v1/images/edits')
  expect(seenBody).toContain('name="model"')
  expect(seenBody).toContain('gpt-image-2')
  expect(seenBody).toContain('name="prompt"')
  expect(seenBody).toContain('把这张图改成水彩画风格')
  expect(seenBody).toContain('name="size"')
  expect(seenBody).toContain('1024x1024')
  expect(seenBody).toContain('name="image[]"')
  expect(seenBody).toContain('ref1.png')
})
