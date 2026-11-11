import { test, expect } from '@playwright/test'
import { readHistoryStore, selectOption, inputByLabel } from './helpers'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

const KLING_CASES = [
  '文生 · 720p · 16:9 · 5s',
  '首帧 · 720p · 5s',
  '文生 · 1080p · 16:9 · 5s',
  '首尾帧 · 720p · 5s',
  '文生 · 720p · 16:9 · 21s',
]

const FLASH_UNSUPPORTED = [
  '文生 · 1080p · 16:9 · 5s',
  '首尾帧 · 720p · 5s',
  '文生 · 720p · 16:9 · 21s',
]

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

async function fulfillCors(route: { request: () => { method: () => string }; fulfill: (r: object) => Promise<void> }, rest: { status: number; body: string }) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS })
    return
  }
  await route.fulfill({
    status: rest.status,
    contentType: 'application/json',
    headers: CORS,
    body: rest.body,
  })
}

async function setupChannel(page: import('@playwright/test').Page, baseUrl: string) {
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('Kling 渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill(baseUrl)
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

test('切到 Kling：五条短片、ainowork 前缀、Flash 三条预期不支持、再切回另外三种接口', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/tools/videotest')
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()
  await setupChannel(page, 'https://api.ainowork.ai')

  await selectOption(page, '接口类型', 'Kling 4.0')
  await expect(inputByLabel(page, '模型编码')).toHaveValue('kling-4.0')
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByTestId('videotest-first-frame')).toBeVisible()
  await expect(page.getByTestId('videotest-last-frame')).toBeVisible()
  await expect(page.getByTestId('videotest-ref-image')).toHaveCount(0)
  await expect(page.getByTestId('videotest-ref-video')).toHaveCount(0)
  await expect(page.getByTestId('videotest-ref-audio')).toHaveCount(0)
  await expect(page.getByTestId('videotest-sensitive-face')).toHaveCount(0)
  for (const name of KLING_CASES) {
    await expect(page.locator(`[data-case-name="${name}"]`)).toBeVisible()
    await expect(page.locator(`[data-case-name="${name}"] input[type="checkbox"]`)).toBeChecked()
    await expect(page.locator(`[data-case-name="${name}"]`).getByText('预期不支持', { exact: true })).toHaveCount(0)
  }
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toHaveCount(0)

  await page.getByText('文生 · 720p · 16:9 · 5s', { exact: true }).click()
  const t2v = page.locator('[data-case-name="文生 · 720p · 16:9 · 5s"]')
  await expect(t2v).toContainText('POST /kling/text-to-video/kling-4.0')
  const preview = t2v.locator('textarea')
  await expect(preview).toContainText('"aspect_ratio": "16:9"')
  await expect(preview).toContainText('"resolution": "720p"')
  await expect(preview).toContainText('"duration": 5')
  await expect(preview).not.toContainText('byteplus')
  await expect(preview).not.toContainText('model_name')

  await page.getByText('首帧 · 720p · 5s', { exact: true }).click()
  const first = page.locator('[data-case-name="首帧 · 720p · 5s"]')
  await expect(first).toContainText('POST /kling/image-to-video/kling-4.0')
  const firstPreview = first.locator('textarea')
  await expect(firstPreview).toContainText('"type": "first_frame"')
  await expect(firstPreview).not.toContainText('aspect_ratio')

  await inputByLabel(page, '首帧').fill('')
  await expect(first).toContainText('不发送')

  await inputByLabel(page, '模型编码').fill('kling-4.0-flash')
  await inputByLabel(page, '模型编码').blur()
  for (const name of FLASH_UNSUPPORTED) {
    await expect(page.locator(`[data-case-name="${name}"]`).getByText('预期不支持', { exact: true })).toBeVisible()
  }
  await expect(page.locator('[data-case-name="文生 · 720p · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-case-name="首帧 · 720p · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  await page.getByText('文生 · 1080p · 16:9 · 5s', { exact: true }).click()
  await expect(page.locator('[data-case-name="文生 · 1080p · 16:9 · 5s"]')).toContainText('POST /kling/text-to-video/kling-4.0-flash')

  await inputByLabel(page, '模型编码').fill('kling-4.0-flash-preview')
  await inputByLabel(page, '模型编码').blur()
  await expect(page.locator('[data-case-name="文生 · 1080p · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await expect(page.getByText(/\/kling\/text-to-video/)).toBeVisible()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()

  await selectOption(page, '接口类型', 'MiniMax-H3')
  await expect(page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]')).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 720p · 16:9 · 5s"]')).toHaveCount(0)
  await selectOption(page, '接口类型', 'Google Omni')
  await expect(page.locator('[data-case-name="Omni · 文生仅必填"]')).toBeVisible()
  await selectOption(page, '接口类型', 'Seedance 火山原生')
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()
  await expect(inputByLabel(page, '模型编码')).toHaveValue('doubao-seedance-2-0')
  await expect(page.getByTestId('videotest-sensitive-face')).toBeVisible()
  await expect(page.getByTestId('videotest-ref-image')).toBeVisible()
  expect(errors).toEqual([])
})

test('Kling mock：api.ainowork.ai 走 /kling，Flash 的 1080p 记已拒绝且不做 Seedance 错误体', async ({ page }) => {
  test.setTimeout(60_000)
  await installVideoMetaStub(page)
  const posts: { url: string; body: any; auth: string }[] = []
  const queries: string[] = []
  const blocked: string[] = []

  await page.route('https://cdn.example/**', route => route.fulfill({
    status: 200, contentType: 'video/mp4', headers: CORS, body: 'fakevid',
  }))
  await page.route(url => /text-to-video|image-to-video|\/tasks|\/api\/v3\/contents\/generations\/tasks|\/byteplus\//.test(String(url)), async route => {
    const u = route.request().url()
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (u.includes('/api/v3/contents/generations/tasks') || u.includes('/byteplus/')) {
      blocked.push(u)
      await route.fulfill({ status: 599, body: 'seedance-should-not-run' })
      return
    }
    if (route.request().method() === 'GET') {
      queries.push(u)
      await fulfillCors(route, {
        status: 200,
        body: JSON.stringify({
          code: 0,
          request_id: 'req-kling',
          data: [{
            id: 'task_kling',
            status: 'succeeded',
            outputs: [{ type: 'video', url: 'https://cdn.example/out.mp4', duration: '5.1' }],
            usage: { output_duration: '5' },
          }],
        }),
      })
      return
    }
    const body = route.request().postDataJSON()
    posts.push({ url: u, body, auth: route.request().headers().authorization || '' })
    if (String(u).includes('kling-4.0-flash') && body?.settings?.duration === 21) {
      await fulfillCors(route, {
        status: 200,
        body: JSON.stringify({ code: 1201, message: 'duration out of range', request_id: 'req-code' }),
      })
      return
    }
    if (String(u).includes('kling-4.0-flash') && body?.settings?.resolution === '1080p') {
      await fulfillCors(route, {
        status: 400,
        body: JSON.stringify({ code: 1201, message: 'resolution not supported', request_id: 'req-reject' }),
      })
      return
    }
    await fulfillCors(route, {
      status: 200,
      body: JSON.stringify({ code: 0, message: 'SUCCEED', request_id: 'req-create', data: { id: 'task_kling', status: 'submitted' } }),
    })
  })

  await page.goto('/tools/videotest')
  await setupChannel(page, 'https://api.ainowork.ai')
  await selectOption(page, '接口类型', 'Kling 4.0')
  await inputByLabel(page, '首帧').fill('https://img.example/first.jpg')

  await runNamedCase(page, '文生 · 720p · 16:9 · 5s')
  const t2v = page.locator('[data-case-name="文生 · 720p · 16:9 · 5s"]')
  await expect(t2v.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  expect(posts[0].url).toBe('https://api.ainowork.ai/kling/text-to-video/kling-4.0')
  expect(posts[0].auth).toBe('Bearer sk-test-1234567890')
  expect(posts[0].body).toEqual({
    prompt: '海浪拍打礁石，慢动作，电影感',
    settings: { duration: 5, resolution: '720p', aspect_ratio: '16:9' },
  })
  expect(queries.some(u => u === 'https://api.ainowork.ai/kling/tasks?task_ids=task_kling')).toBeTruthy()
  await expect(t2v.getByText('分辨率', { exact: true })).toBeVisible()
  await expect(t2v.getByText('官方域名')).toHaveCount(0)
  await expect(t2v.getByText('错误结构')).toHaveCount(0)
  await expect(t2v.getByText('req-create')).toBeVisible()
  expect(blocked).toEqual([])

  await runNamedCase(page, '首帧 · 720p · 5s')
  const first = page.locator('[data-case-name="首帧 · 720p · 5s"]')
  await expect(first.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  const i2v = posts.find(item => item.url.includes('/image-to-video/'))
  expect(i2v?.url).toBe('https://api.ainowork.ai/kling/image-to-video/kling-4.0')
  expect(i2v?.body).toEqual({
    contents: [
      { type: 'prompt', text: '海浪拍打礁石，慢动作，电影感' },
      { type: 'first_frame', url: 'https://img.example/first.jpg', id: 'image_1' },
    ],
    settings: { duration: 5, resolution: '720p' },
  })

  await inputByLabel(page, '模型编码').fill('kling-4.0-flash')
  await inputByLabel(page, '模型编码').blur()
  await runNamedCase(page, '文生 · 1080p · 16:9 · 5s')
  const hd = page.locator('[data-case-name="文生 · 1080p · 16:9 · 5s"]')
  await expect(hd.getByText('✓ 已拒绝')).toBeVisible({ timeout: 20_000 })
  await expect(hd.getByText('错误结构')).toHaveCount(0)
  expect(posts.some(item => item.url === 'https://api.ainowork.ai/kling/text-to-video/kling-4.0-flash' && item.body?.settings?.resolution === '1080p')).toBeTruthy()

  await runNamedCase(page, '文生 · 720p · 16:9 · 21s')
  const long = page.locator('[data-case-name="文生 · 720p · 16:9 · 21s"]')
  await expect(long.getByText('✓ 已拒绝')).toBeVisible({ timeout: 20_000 })
  await expect(long.getByText('code 1201')).toBeVisible()
  await expect(long.getByText('错误结构')).toHaveCount(0)

  const hist = await readHistoryStore(page, 'videotest')
  expect(hist.length).toBeGreaterThan(0)
  expect(hist.every((row: { apiType?: string }) => row.apiType === 'kling')).toBeTruthy()
  expect(hist.some((row: { videoUrl?: string }) => row.videoUrl === 'https://cdn.example/out.mp4')).toBeTruthy()
  expect(blocked).toEqual([])
})
