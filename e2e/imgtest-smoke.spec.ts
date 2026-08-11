import { test, expect } from '@playwright/test'
import { readHistoryStore } from './helpers'

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

test('1K 横版按等效分辨率档位通过，并完整格式化响应 JSON', async ({ page }) => {
  await page.goto('/')
  const jpegBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const context = canvas.getContext('2d')!
    context.fillStyle = '#0a84ff'
    context.fillRect(0, 0, 1280, 720)
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
  })
  const imageUrl = 'https://cdn.example/generated.jpeg'
  const responseBody = {
    data: [{ url: imageUrl, mime_type: 'image/jpeg' }],
    meta: { padding: 'x'.repeat(4500), tail: 'RESPONSE-END' },
  }

  await page.route(imageUrl, route => {
    const accept = route.request().headers().accept || ''
    return route.fulfill(accept.includes('image/')
      ? { status: 200, contentType: 'image/jpeg', body: Buffer.from(jpegBase64, 'base64') }
      : { status: 200, contentType: 'text/plain', body: 'not an image' })
  })
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...CORS, 'x-oneapi-request-id': 'req-url-dimension' },
    body: JSON.stringify(responseBody),
  }))

  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('URL 图片渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('xAI Grok Imagine').click()
  await page.getByText('1k + 16:9', { exact: true }).click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()

  await expect(page.getByText('✓ 通过 5/5')).toBeVisible()
  await expect(page.getByText('1280×720（等效 960px，偏差-6.3%）')).toBeVisible()
  await page.getByText('响应体', { exact: true }).click()
  const response = page.locator('pre[data-response-body="true"]').first()
  await expect(response).toContainText('RESPONSE-END')
  await expect(response).toHaveText(JSON.stringify(responseBody, null, 2))
})

test('2K 横版多图按分辨率档位通过', async ({ page }) => {
  await page.goto('/')
  const b64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2816
    canvas.height = 1584
    const context = canvas.getContext('2d')!
    context.fillStyle = '#40a9ff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify({ data: [{ url: `data:image/png;base64,${b64}` }, { url: `data:image/png;base64,${b64}` }] }),
  }))

  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('2K 档位渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('xAI Grok Imagine').click()
  await page.getByText('2k + 16:9 + n=2', { exact: true }).click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).last().click()

  await expect(page.getByText('✓ 通过 7/7')).toBeVisible()
  await expect(page.getByText('2816×1584（等效 2112px，偏差+3.1%）').first()).toBeVisible()
})

test('分辨率不足或横竖颠倒都会失败', async ({ page }) => {
  await page.goto('/')
  const lowB64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 1280
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fa8c16'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const invertedB64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1584
    canvas.height = 2816
    const context = canvas.getContext('2d')!
    context.fillStyle = '#eb2f96'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  let call = 0
  await page.route('**/v1/images/generations', route => {
    call++
    const data = call === 1
      ? [{ url: `data:image/png;base64,${lowB64}` }]
      : [{ url: `data:image/png;base64,${invertedB64}` }, { url: `data:image/png;base64,${invertedB64}` }]
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ data }) })
  })

  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('失败校验渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('xAI Grok Imagine').click()

  await page.getByText('2k + 9:16 竖版', { exact: true }).click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('✕ 4/5 通过')).toBeVisible()
  await expect(page.getByText('720×1280（等效 960px，偏差-53.1%）')).toBeVisible()

  await page.getByText('2k + 9:16 竖版', { exact: true }).click()
  await page.getByText('2k + 16:9 + n=2', { exact: true }).click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('✕ 5/7 通过')).toBeVisible()
  await expect(page.getByText('0.563 (偏差68.4%)').first()).toBeVisible()
})

test('旧历史记录加载后自动迁移并重新判定', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('imgtest-history', JSON.stringify([{
      id: 'legacy-tier-check', time: Date.now(), caseName: '2k + 16:9 + n=2', caseDesc: '旧版长边校验',
      channelName: '旧渠道', apiType: 'grok', model: 'grok-imagine-image-quality', prompt: 'test',
      targets: { longEdgeReq: 2048, ratioReq: '16:9', nReq: 2, _rf: 'url' }, useRef: false, refThumbs: [], price: null,
      status: 200, respHeaders: {}, reqId: '', sentPreview: '{}', ok: true, error: null, rawSnippet: '{}',
      images: [
        { dataUri: null, thumb: null, url: 'https://cdn.example/legacy-1.png', w: 2816, h: 1584, format: 'png' },
        { dataUri: null, thumb: null, url: 'https://cdn.example/legacy-2.png', w: 2816, h: 1584, format: 'png' },
      ],
      returnedN: 2, durationMs: 100, checks: [{ name: '长边达标', target: '≈2048px', actual: '2816×1584', pass: false }],
    }]))
  })
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: /^历史记录/ }).click()

  await expect(page.getByText('✓ 通过 7/7')).toBeVisible()
  await expect(page.getByText('2K 档 16:9 ×2')).toBeVisible()
  await expect.poll(() => readHistoryStore(page, 'imgtest').then(list => list[0])).toMatchObject({
    validationVersion: 2,
    targets: { resolutionTierBaseReq: 2048, resolutionTierLabelReq: '2K' },
  })
  // 迁移成功后旧版 localStorage key 应被清空
  await expect.poll(() => page.evaluate(() => localStorage.getItem('imgtest-history'))).toBeNull()
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

test('隐藏价格开关生效，且导出的 HTML 报告不含任何价格信息', async ({ page }) => {
  await page.goto('/')
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 1024
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ff8800'
    ctx.fillRect(0, 0, 1024, 1024)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'req-hideprice' },
    body: JSON.stringify({ data: [{ b64_json: b64 }] }),
  }))
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('隐藏价格渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('req-hideprice').first()).toBeVisible()

  // 默认显示价格：用例行徽标 + 摘要预估 + 结果里的参考价格
  await expect(page.getByText(/^\$0\.\d{3} \/ ¥/).first()).toBeVisible()
  await expect(page.getByText(/预估/)).toBeVisible()
  await expect(page.getByText(/参考价格/)).toBeVisible()

  // 打开「隐藏价格」开关：以上全部消失
  await page.getByRole('switch').click()
  await expect(page.getByText(/^\$0\.\d{3} \/ ¥/)).toHaveCount(0)
  await expect(page.getByText(/预估/)).toHaveCount(0)
  await expect(page.getByText(/参考价格/)).toHaveCount(0)

  // 导出的 HTML 报告也不得包含任何价格信息（与开关状态无关，恒不含）
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ 导出 HTML' }).click(),
  ])
  const { readFileSync } = await import('node:fs')
  const content = readFileSync(await download.path(), 'utf8')
  expect(content).toContain('图片接口测试报告')
  expect(content).toContain('req-hideprice')
  expect(content).not.toContain('参考价格')
  expect(content).not.toContain('¥')
  expect(content).not.toContain('$0.')

  // 历史记录的价格列同样被隐藏
  await page.getByRole('button', { name: /^历史记录/ }).click()
  const row = page.getByRole('row').filter({ hasText: '隐藏价格渠道' })
  await expect(row.getByRole('cell').nth(11)).toHaveText('—')
  await page.getByRole('switch').click()
  await expect(row.getByRole('cell').nth(11)).toContainText('$')
})
