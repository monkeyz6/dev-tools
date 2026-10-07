import { test, expect } from '@playwright/test'
import { readHistoryStore, goto, channelCard, readKv } from './helpers'

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
  await expect(page.getByText('✓ 通过 4/4')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '返回载体' })).toContainText('b64_json')
  await expect.poll(() => readHistoryStore(page, 'imgtest').then(list => list[0]?.images?.[0]?.carrier)).toBe('b64_json')
  expect(sentBodies[0]).toMatchObject({ model: 'gpt-image-2', size: '1024x1024', n: 1, prompt: expect.any(String) })
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByRole('cell', { name: '测试渠道' })).toBeVisible()
  await expect(page.getByText('方形 1024×1024').first()).toBeVisible()
  await page.getByRole('button', { name: '详情' }).click()
  await expect(page.getByText('测试记录详情')).toBeVisible()
  await expect(page.getByText('req-test-123', { exact: true })).toBeVisible()
})

test('GPT Image 返回 https 地址时载体不通过', async ({ page }) => {
  const imageUrl = 'https://cdn.example/gpt-image-url.png'
  await page.goto('/')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff3344'
    context.fillRect(0, 0, 1024, 1024)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.route(imageUrl, route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: Buffer.from(png, 'base64'),
  }))
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify({ data: [{ url: imageUrl }] }),
  }))

  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('GPT URL 渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()

  await expect(page.getByText('✕ 3/4 通过')).toBeVisible()
  await expect(page.getByText('! 请求失败')).toHaveCount(0)
  const carrier = page.getByRole('row').filter({ hasText: '返回载体' })
  await expect(carrier).toContainText('b64_json')
  await expect(carrier).toContainText('http(s) url')
  await expect(carrier).toContainText('未通过')
  await expect(page.getByText('1024×1024').first()).toBeVisible()
  await expect.poll(() => readHistoryStore(page, 'imgtest').then(list => list[0]?.images?.[0]?.carrier)).toBe('http-url')
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
  const urlA = 'https://cdn.example/grok-2k-a.png'
  const urlB = 'https://cdn.example/grok-2k-b.png'
  const png = (url: string) => page.route(url, route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: Buffer.from(b64, 'base64'),
  }))
  await png(urlA)
  await png(urlB)
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify({ data: [{ url: urlA }, { url: urlB }] }),
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
  const lowUrl = 'https://cdn.example/grok-low.png'
  const invertedUrl = 'https://cdn.example/grok-inverted.png'
  await page.route(lowUrl, route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: Buffer.from(lowB64, 'base64'),
  }))
  await page.route(invertedUrl, route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: Buffer.from(invertedB64, 'base64'),
  }))
  let call = 0
  await page.route('**/v1/images/generations', route => {
    call++
    const data = call === 1
      ? [{ url: lowUrl }]
      : [{ url: invertedUrl }, { url: invertedUrl }]
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
    validationVersion: 3,
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

test('data[] 里没有成图字段时记请求失败，不判成 b64_json 通过', async ({ page }) => {
  await page.route('**/v1/images/generations', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ data: [{ revised_prompt: 'x' }] }),
  }))
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('空图渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('! 请求失败')).toBeVisible()
  await expect(page.getByText('响应中未找到图片数据').first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '返回载体' })).toHaveCount(0)
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
    page.getByRole('button', { name: '导出 HTML' }).click(),
  ])
  const { readFileSync } = await import('node:fs')
  const content = readFileSync(await download.path(), 'utf8')
  expect(content).toContain('图片接口测试报告')
  expect(content).toContain('req-hideprice')
  expect(content).not.toContain('参考价格')
  expect(content).not.toContain('¥')
  expect(content).not.toContain('$0.')

  // 历史记录的价格列同样被隐藏（两级视图去掉勾选列后，价格是第 11 列）
  await page.getByRole('button', { name: /^历史记录/ }).click()
  const row = page.getByRole('row').filter({ hasText: '隐藏价格渠道' })
  await expect(row.getByRole('cell').nth(10)).toHaveText('—')
  await page.getByRole('switch').click()
  await expect(row.getByRole('cell').nth(10)).toContainText('$')
})

test('历史批次：两轮两批、补跑只留最新、一键还原到工作台', async ({ page }) => {
  await page.route('**/v1/images/generations', async route => {
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = 1024
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(0, 0, 1024, 1024)
      return c.toDataURL('image/png').split(',')[1]
    })
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ data: [{ b64_json: b64 }] }) })
  })
  page.on('dialog', d => d.accept())

  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('批次渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  const modelInput = page.getByPlaceholder('gpt-image-2')
  await modelInput.fill('gpt-image-batch')

  // 只留一个用例，跑两轮「运行选中」——每轮各开一批
  await page.getByLabel('全选').uncheck()
  await page.locator('[data-case-name="方形 1024×1024"] input[type="checkbox"]').check()
  const runSelected = page.getByRole('button', { name: '▶ 运行选中' })
  const snapshot = async () => {
    const list = await readHistoryStore(page, 'imgtest')
    return { ids: list.map(r => r.id as string), runIds: new Set(list.map(r => r.runId as string)).size }
  }

  await runSelected.click()
  await expect.poll(() => snapshot().then(s => s.runIds)).toBe(1)
  await runSelected.click()
  await expect.poll(() => snapshot().then(s => s.runIds)).toBe(2)

  // 补跑单条：归入当前这一批，并顶掉同名用例的旧记录（总数仍是 2，其中 1 条是新写的）
  const before = new Set((await snapshot()).ids)
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect.poll(async () => {
    const { ids, runIds } = await snapshot()
    return `${ids.length}/${ids.filter(id => !before.has(id)).length}/${runIds}`
  }).toBe('2/1/2')

  // 历史页：两批，每批一条
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByTestId('imgtest-batch')).toHaveCount(2)
  const older = page.getByTestId('imgtest-batch').nth(1)
  await expect(older.getByText('1 个用例')).toBeVisible()

  // 改掉模型，验证还原确实把配置切了回去
  await modelInput.fill('模型被改过了')
  await older.getByRole('button', { name: '↺ 还原到工作台' }).click()
  await expect(page.getByTestId('imgtest-restored-note')).toBeVisible()
  await expect(page.getByTestId('imgtest-restored-note')).toContainText('缩略图')
  await expect(page.getByText('✓ 通过 4/4')).toBeVisible()
  await expect(modelInput).toHaveValue('gpt-image-batch')
  await expect(page.getByRole('button', { name: '导出 HTML' })).toBeEnabled()

  // 「清除」把结果与批次一起清掉
  await page.getByTestId('imgtest-restored-note').getByRole('button', { name: '清除' }).click()
  await expect(page.getByTestId('imgtest-restored-note')).toHaveCount(0)
  await expect(page.getByText('✓ 通过 4/4')).toHaveCount(0)
})

test('渠道管理：复制渠道不切换当前使用', async ({ page }) => {
  await goto(page, /图片接口测试/)
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('测试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()

  await channelCard(page, '测试渠道').getByRole('button', { name: '复制' }).click()
  await expect(channelCard(page, '测试渠道_copy')).toBeVisible()
  await expect(channelCard(page, '测试渠道').getByText('✓ 当前使用')).toBeVisible()
  await expect(channelCard(page, '测试渠道_copy').getByText('✓ 当前使用')).toHaveCount(0)
  await expect.poll(async () => {
    const raw = await readKv(page, 'imgtest-channels')
    return raw ? JSON.parse(raw).map((c: { name: string }) => c.name) : []
  }).toEqual(['测试渠道', '测试渠道_copy'])
})

test('历史批次较多时不会被压扁', async ({ page }) => {
  // 批次块带 overflow-hidden，放进限高的 flex 容器会被按比例压扁（标题行只剩一条缝、按钮被裁成半截）
  await page.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem('imgtest-history', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({
      id: `many-${i}`, runId: `run-many-${i}`, time: now - i * 3600_000, caseName: '文生图 1024×1024', caseDesc: '',
      channelName: '压测渠道', apiType: 'openai', model: 'gpt-image-many', prompt: 'test',
      targets: { wReq: 1024, hReq: 1024 }, useRef: false, refThumbs: [], price: null,
      status: 200, respHeaders: {}, reqId: '', sentPreview: '{}', ok: true, error: null, rawSnippet: '{}',
      images: [{ dataUri: null, thumb: null, url: 'https://cdn.example/many.png', w: 1024, h: 1024, format: 'png' }],
      returnedN: 1, durationMs: 100, checks: [],
    }))))
  })
  await page.goto('/')
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: /^历史记录/ }).click()

  const batches = page.getByTestId('imgtest-batch')
  await expect(batches).toHaveCount(20)
  for (let i = 0; i < 20; i++) {
    const batch = batches.nth(i)
    const restore = batch.getByRole('button', { name: '↺ 还原到工作台' })
    const [boxB, boxR] = await Promise.all([batch.boundingBox(), restore.boundingBox()])
    expect(boxB && boxR, `第 ${i + 1} 批应可测量`).toBeTruthy()
    // 按钮必须完整落在批次块里，批次块高度至少容得下按钮
    expect(boxB!.height).toBeGreaterThanOrEqual(boxR!.height)
    expect(boxR!.y).toBeGreaterThanOrEqual(boxB!.y)
    expect(boxR!.y + boxR!.height).toBeLessThanOrEqual(boxB!.y + boxB!.height + 0.5)
  }

  // 最后一批能滚到并完整可见
  const last = batches.nth(19)
  await last.scrollIntoViewIfNeeded()
  await expect(last.getByRole('button', { name: '↺ 还原到工作台' })).toBeVisible()

  // 默认展开的最新一批，记录表完整显示
  await expect(batches.first().locator('tbody tr')).toHaveCount(1)
  await expect(batches.first().locator('tbody tr').first()).toBeVisible()
})
