import { test, expect } from '@playwright/test'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }

test('图片接口测试工具冒烟', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await expect(page.getByText('测试用例')).toBeVisible()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await expect(page.getByText('已保存的渠道')).toBeVisible()
  await page.getByRole('button', { name: '价格配置', exact: true }).click()
  await expect(page.getByText('模型价格配置')).toBeVisible()
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByText('历史测试记录')).toBeVisible()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('xAI Grok Imagine').click()
  await expect(page.getByText('2k + 16:9 + n=2')).toBeVisible()
  await page.getByText('2k + 16:9 + n=2').click()
  await expect(page.getByText('请求预览（可编辑，编辑后将作为真实发送的请求体）')).toBeVisible()
  expect(errors).toEqual([])
})

test('完整流程：渠道+用例运行+校验+历史', async ({ page }) => {
  const sentBodies: any[] = []
  await page.route('**/v1/images/generations', async route => {
    sentBodies.push(route.request().postDataJSON())
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = 1024
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ff8800'
      ctx.fillRect(0, 0, 1024, 1024)
      return c.toDataURL('image/png').split(',')[1]
    })
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'req-test-123' }, body: JSON.stringify({ data: [{ b64_json: b64 }] }) })
  })
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('测试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('req-test-123').first()).toBeVisible()
  await expect(page.getByText('✓ 通过 3/3')).toBeVisible()
  expect(sentBodies[0]).toMatchObject({ model: 'gpt-image-2', size: '1024x1024', n: 1, prompt: expect.any(String) })
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByRole('cell', { name: '测试渠道' })).toBeVisible()
  await expect(page.getByText('方形 1024×1024').first()).toBeVisible()
  await page.getByRole('button', { name: '详情' }).click()
  await expect(page.getByText('测试记录详情')).toBeVisible()
  await expect(page.getByText('req-test-123', { exact: true })).toBeVisible()
})

test('请求失败时记录错误并可查看', async ({ page }) => {
  await page.route('**/v1/images/generations', route => route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { message: 'unsupported parameter: size' } }) }))
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('错误渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('unsupported parameter: size').first()).toBeVisible()
  await expect(page.getByText('! 请求失败')).toBeVisible()
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByText('! 失败').first()).toBeVisible()
  await page.getByRole('button', { name: '详情' }).click()
  await expect(page.getByText('unsupported parameter: size').first()).toBeVisible()
})
