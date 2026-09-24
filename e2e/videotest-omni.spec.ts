import { test, expect } from '@playwright/test'
import { readHistoryStore, selectOption, inputByLabel } from './helpers'
import { readFileSync } from 'node:fs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

const OMNI_CASES = [
  'Omni · 文生仅必填',
  'Omni · 360p 9:16 4s',
  'Omni · 1080p 16:9 8s',
  'Omni · 图生首帧',
  'Omni · 首尾帧',
  'Omni · 参考图+视频',
  'Omni · 编辑上一轮',
  'Omni · 延长上一轮',
  'Omni · 拒绝 21:9',
  'Omni · 拒绝名人图',
]

function isOmniSubmit(url: string) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '')
    return p.endsWith('/v1beta/interactions')
  } catch { return false }
}

function isOmniPoll(url: string) {
  try {
    return /\/v1beta\/interactions\/[^/]+$/.test(new URL(url).pathname)
  } catch { return false }
}

function installVideoMetaStub(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get() { return 1280 } })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get() { return 720 } })
    Object.defineProperty(HTMLVideoElement.prototype, 'duration', { configurable: true, get() { return 5 } })
    const proto = HTMLMediaElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'src')
    if (!desc?.set || !desc.get) return
    Object.defineProperty(HTMLVideoElement.prototype, 'src', {
      configurable: true,
      get() { return desc.get!.call(this) },
      set(v: string) {
        desc.set!.call(this, v)
        queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')))
      },
    })
  })
}

async function fulfillCors(route: { request: () => { method: () => string }; fulfill: (r: object) => Promise<void> }, rest: { status: number; body: string; requestId?: string; contentType?: string }) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS })
    return
  }
  await route.fulfill({
    status: rest.status,
    contentType: rest.contentType || 'application/json',
    headers: { ...CORS, ...(rest.requestId ? { 'x-oneapi-request-id': rest.requestId } : {}) },
    body: rest.body,
  })
}

async function switchToOmni(page: import('@playwright/test').Page) {
  await selectOption(page, '接口类型', 'Google Omni')
  await expect(page.locator('[data-case-name="Omni · 文生仅必填"]')).toBeVisible()
}

async function setupChannel(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill(name)
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

async function runNamedCase(page: import('@playwright/test').Page, name: string) {
  const row = page.locator(`[data-case-name="${name}"]`)
  const runBtn = row.getByRole('button', { name: '▶ 运行此用例' })
  if (!await runBtn.isVisible()) await row.getByText(name, { exact: true }).click()
  await runBtn.click()
}

test('切到 Google Omni：10 条用例、预览占位、素材库与参考音频隐藏、切回 Seedance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/tools/videotest')
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()

  await switchToOmni(page)
  await expect(inputByLabel(page, '模型编码')).toHaveValue('gemini-omni-flash-preview')
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByTestId('videotest-ref-audio')).toHaveCount(0)
  await expect(page.getByText('素材组', { exact: true })).toHaveCount(0)
  for (const name of OMNI_CASES) {
    await expect(page.locator(`[data-case-name="${name}"]`)).toBeVisible()
    await expect(page.locator(`[data-case-name="${name}"] input[type="checkbox"]`)).toBeChecked()
  }
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="Omni · 拒绝 21:9"]').getByText('预期拒绝')).toBeVisible()
  await expect(page.locator('[data-case-name="Omni · 拒绝 stream"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="Omni · 360p 9:16 4s"]').getByText('预期不支持', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="Omni · 1080p 16:9 8s"]').getByText('预期不支持', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="Omni · 图生首帧"]').getByText('预期不支持', { exact: true })).toHaveCount(0)

  await page.getByText('Omni · 首尾帧', { exact: true }).click()
  const preview = page.locator('[data-case-name="Omni · 首尾帧"] textarea')
  await expect(preview).toContainText('{{first_frame}}')
  await expect(preview).toContainText('{{last_frame}}')
  await expect(page.locator('[data-case-name="Omni · 首尾帧"]')).toContainText('POST /v1beta/interactions')
  await expect(preview).toContainText('"delivery": "uri"')
  await expect(preview).not.toContainText('background')
  await expect(preview).not.toContainText('"stream"')
  await expect(preview).not.toContainText('AAAA')
  const previewText = await preview.inputValue()
  expect(previewText.length).toBeLessThan(4000)

  await page.getByText('Omni · 文生仅必填', { exact: true }).click()
  const pReq = page.locator('[data-case-name="Omni · 文生仅必填"] textarea')
  await expect(pReq).not.toContainText('background')
  await expect(pReq).not.toContainText('"stream"')
  await expect(pReq).not.toContainText('"delivery"')

  await page.getByText('Omni · 360p 9:16 4s', { exact: true }).click()
  const p360 = page.locator('[data-case-name="Omni · 360p 9:16 4s"] textarea')
  await expect(p360).toContainText('"resolution": "360p"')
  await expect(p360).toContainText('"duration": "4s"')
  await expect(p360).toContainText('text_to_video')
  await expect(p360).toContainText('"delivery": "uri"')
  await expect(p360).not.toContainText('background')
  await expect(p360).not.toContainText('"stream"')

  await page.getByText('Omni · 图生首帧', { exact: true }).click()
  const pFirst = page.locator('[data-case-name="Omni · 图生首帧"] textarea')
  await expect(pFirst).toContainText('{{first_frame}}')
  await expect(pFirst).not.toContainText('{{last_frame}}')
  await expect(pFirst).toContainText('image_to_video')
  await expect(pFirst).toContainText('"delivery": "uri"')
  await expect(pFirst).not.toContainText('background')
  await expect(pFirst).not.toContainText('"stream"')

  await selectOption(page, '接口类型', 'Seedance 火山原生')
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()
  await expect(page.locator('[data-case-name="Omni · 文生仅必填"]')).toHaveCount(0)
  await expect(inputByLabel(page, '模型编码')).toHaveValue('doubao-seedance-2-0')
  await expect(page.getByRole('switch')).toBeVisible()
  expect(errors).toEqual([])
})

test('Omni mock：同步 data / uri、占位不进历史、拒绝 21:9、CORS 记请求异常', async ({ page }) => {
  test.setTimeout(60_000)
  await installVideoMetaStub(page)
  const posts: any[] = []
  const polls: string[] = []
  const fileGets: string[] = []
  const fileAuths: string[] = []
  const fileUri = 'https://mock.example/v1beta/files/xxxx:download?alt=media&model=gemini-omni-flash-preview'
  const fat = 'A'.repeat(5000)

  await page.route(url => /picsum\.photos|interactive-examples\.mdn/.test(String(url)), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const isVid = route.request().url().includes('.mp4')
    await route.fulfill({
      status: 200,
      contentType: isVid ? 'video/mp4' : 'image/jpeg',
      headers: CORS,
      body: isVid ? 'fakevid' : 'fakeimg',
    })
  })
  await page.route(/upload\.wikimedia\.org/, route => route.abort('failed'))
  await page.route(url => /\/v1beta\/files\//.test(String(url)), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const auth = route.request().headers().authorization || ''
    fileGets.push(route.request().url())
    fileAuths.push(auth)
    if (!auth.startsWith('Bearer ')) {
      await route.fulfill({ status: 401, headers: CORS, body: 'unauthorized' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'video/mp4', headers: CORS, body: 'fake' })
  })

  await page.route(u => isOmniSubmit(String(u)) || isOmniPoll(String(u)), async route => {
    const u = route.request().url()
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (isOmniPoll(u)) {
      polls.push(u)
      await fulfillCors(route, {
        status: 200,
        requestId: 'omni-poll-1',
        body: JSON.stringify({
          id: 'v1_1',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: fat }] }],
        }),
      })
      return
    }
    const body = route.request().postDataJSON()
    posts.push(body)
    if (body?.response_format?.aspect_ratio === '21:9') {
      await fulfillCors(route, {
        status: 400,
        requestId: 'omni-rej-1',
        body: JSON.stringify({ error: { message: 'Invalid aspect ratio', status: 'INVALID_ARGUMENT', code: 400 } }),
      })
      return
    }
    const video = body?.response_format?.delivery === 'uri'
      ? { type: 'video', mime_type: 'video/mp4', uri: fileUri }
      : { type: 'video', mime_type: 'video/mp4', data: fat }
    await fulfillCors(route, {
      status: 200,
      requestId: 'omni-req-1',
      body: JSON.stringify({
        id: 'v1_1',
        status: 'completed',
        steps: [{ type: 'model_output', content: [video] }],
      }),
    })
  })
  await page.route(url => String(url).includes('/api/v3/contents/generations/tasks') || String(url).includes('/byteplus/'), route => route.fulfill({ status: 599, body: 'seedance-should-not-run' }))

  await page.goto('/tools/videotest')
  await setupChannel(page, 'Omni 测试渠道')
  await switchToOmni(page)

  await runNamedCase(page, 'Omni · 编辑上一轮')
  await expect(page.locator('[data-case-name="Omni · 编辑上一轮"]')).toContainText('请先跑一条成功的文生', { timeout: 15000 })

  await runNamedCase(page, 'Omni · 文生仅必填')
  await expect(page.locator('[data-case-name="Omni · 文生仅必填"]').getByText(/✓ 通过/)).toBeVisible({ timeout: 20000 })
  expect(posts[0]).toMatchObject({
    model: 'gemini-omni-flash-preview',
    store: true,
    response_format: { type: 'video' },
  })
  expect(posts[0].response_format.delivery).toBeUndefined()
  expect(posts[0].background).toBeUndefined()
  expect(posts[0].stream).toBeUndefined()
  expect(posts[0].input).toEqual(expect.any(String))
  expect(JSON.stringify(posts[0])).not.toMatch(/A{20,}/)
  expect(fileGets).toEqual([])
  expect(polls).toEqual([])

  const sentPreview = page.locator('[data-case-name="Omni · 文生仅必填"]').locator('details', { hasText: '已发送的请求体' })
  await sentPreview.locator('summary').click()
  await expect(sentPreview.locator('pre')).not.toContainText('A'.repeat(40))

  await runNamedCase(page, 'Omni · 图生首帧')
  await expect(page.locator('[data-case-name="Omni · 图生首帧"]').getByText(/✓ 通过/)).toBeVisible({ timeout: 20000 })
  expect(fileGets.some(u => u.includes('/v1beta/files/xxxx:download') && u.includes('alt=media'))).toBeTruthy()
  expect(fileAuths.some(h => h === 'Bearer sk-test-1234567890')).toBeTruthy()
  expect(polls).toEqual([])
  const firstPost = posts.find((b: any) => Array.isArray(b.input) && b.generation_config?.video_config?.task === 'image_to_video' && b.input.length === 2)
  expect(firstPost).toBeTruthy()
  expect(firstPost.response_format.delivery).toBe('uri')
  expect(typeof firstPost.input[0].data).toBe('string')
  expect(firstPost.input[0].data.length).toBeGreaterThan(8)
  expect(firstPost.input[0].data).not.toMatch(/^\{\{/)

  const framesRow = page.locator('[data-case-name="Omni · 首尾帧"]')
  if (!await framesRow.locator('textarea').first().isVisible()) await framesRow.getByText('Omni · 首尾帧', { exact: true }).click()
  const framesPreview = framesRow.locator('textarea').first()
  await expect(framesPreview).toContainText('{{first_frame}}')
  await runNamedCase(page, 'Omni · 首尾帧')
  await expect(framesRow.getByText(/✓ 通过/)).toBeVisible({ timeout: 20000 })
  expect(polls).toEqual([])
  const framePost = posts.find((b: any) => Array.isArray(b.input) && b.input.length === 3)
  expect(framePost).toBeTruthy()
  expect(framePost.response_format.delivery).toBe('uri')
  expect(typeof framePost.input[0].data).toBe('string')
  expect(framePost.input[0].data.length).toBeGreaterThan(8)
  expect(framePost.input[0].data).not.toMatch(/^\{\{/)

  await runNamedCase(page, 'Omni · 编辑上一轮')
  await expect(page.locator('[data-case-name="Omni · 编辑上一轮"]').getByText(/✓ 通过/)).toBeVisible({ timeout: 20000 })
  expect(posts.some((b: any) => b.previous_interaction_id === 'v1_1' && b.generation_config?.video_config?.task === 'edit')).toBeTruthy()

  await runNamedCase(page, 'Omni · 拒绝 21:9')
  await expect(page.locator('[data-case-name="Omni · 拒绝 21:9"]').getByText('✓ 已拒绝')).toBeVisible({ timeout: 15000 })

  await runNamedCase(page, 'Omni · 拒绝名人图')
  await expect(page.locator('[data-case-name="Omni · 拒绝名人图"]').getByText('! 请求异常')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-case-name="Omni · 拒绝名人图"]')).toContainText('素材跨域读失败')

  const hist = await readHistoryStore(page, 'videotest')
  expect(hist.length).toBeGreaterThan(0)
  expect(hist.every((r: any) => r.apiType === 'google-omni')).toBeTruthy()
  const blob = JSON.stringify(hist)
  expect(blob).not.toMatch(/A{40,}/)
  expect(blob).not.toContain('data:video')
  expect(hist.some((r: any) => r.sentPreview && r.sentPreview.includes('{{first_frame}}'))).toBeTruthy()
  expect(hist.some((r: any) => /base64 omitted/.test(r.rawSnippet || ''))).toBeTruthy()
  expect(hist.filter((r: any) => r.videoUrl && String(r.videoUrl).startsWith('blob:'))).toHaveLength(0)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 HTML' }).click(),
  ])
  const htmlPath = '/tmp/videotest-omni-export.html'
  await download.saveAs(htmlPath)
  const html = readFileSync(htmlPath, 'utf-8')
  expect(html).toContain('Google Omni能力核查')
  expect(html).not.toMatch(/A{40,}/)
  expect(html).toMatch(/html,body\{[^}]*overflow:auto/)
})
