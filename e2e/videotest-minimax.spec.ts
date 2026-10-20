import { test, expect } from '@playwright/test'
import { channelCard, readHistoryStore, selectOption, inputByLabel } from './helpers'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

const TEA_PIC = 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg'

const MINIMAX_CASES = [
  '文生 · 768P · 16:9 · 5s',
  '首帧 · 768P · 5s',
  '首尾帧 · 768P · 5s',
  '参考 · 768P · 5s',
  '参考图 · 1 张 · 768P · 5s',
  '参考图 · 5 张 · 768P · 5s',
  '参考图 · 6 张 · 768P · 5s',
  '文生 · 2K · 16:9 · 5s',
  'H3-Context-IR · 5s · 16:9',
  '再生成 · 任务 id · 2K',
  '再生成 · 成片 URL · 2K',
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
  await page.getByPlaceholder('例如：主线-oinone').fill('MiniMax 渠道')
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

test('切到 MiniMax-H3：参考图 1/5/6、ainowork 前缀、参考音频、Max 换成 1/2/3/4、切回 Seedance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/tools/videotest')
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()
  await setupChannel(page, 'https://hk.ainowork.ai')

  await selectOption(page, '接口类型', 'MiniMax-H3')
  await expect(inputByLabel(page, '模型编码')).toHaveValue('MiniMax-H3')
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByTestId('videotest-ref-audio')).toBeVisible()
  await expect(page.getByTestId('videotest-sensitive-face')).toHaveCount(0)
  await expect(page.getByText('素材组', { exact: true })).toHaveCount(0)
  for (const name of MINIMAX_CASES) {
    await expect(page.locator(`[data-case-name="${name}"]`)).toBeVisible()
    await expect(page.locator(`[data-case-name="${name}"] input[type="checkbox"]`)).toBeChecked()
  }
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="文生 · 2K · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-case-name="文生 · 480P · 16:9 · 5s"]')).toHaveCount(0)

  await page.getByText('文生 · 768P · 16:9 · 5s', { exact: true }).click()
  const row = page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]')
  await expect(row).toContainText('POST /minimax/v2/video_generation')
  const preview = row.locator('textarea')
  await expect(preview).toContainText('"resolution": "768P"')
  await expect(preview).toContainText('"duration": 5')
  await expect(preview).toContainText('"ratio": "16:9"')
  await expect(preview).not.toContainText('byteplus')

  await page.getByText('首帧 · 768P · 5s', { exact: true }).click()
  await expect(page.locator('[data-case-name="首帧 · 768P · 5s"] textarea')).toContainText('"role": "first_frame"')
  await expect(page.locator('[data-case-name="首帧 · 768P · 5s"] textarea')).toContainText('"ratio": "adaptive"')

  await expect(inputByLabel(page, '参考图')).toHaveValue(TEA_PIC)
  await page.getByText('参考图 · 6 张 · 768P · 5s', { exact: true }).click()
  const sixPreview = await page.locator('[data-case-name="参考图 · 6 张 · 768P · 5s"] textarea').inputValue()
  expect(sixPreview.split(TEA_PIC).length - 1).toBe(6)
  expect(sixPreview).toContain('"role": "reference_image"')
  expect(sixPreview).not.toContain('reference_video')
  expect(sixPreview).not.toContain('reference_audio')
  expect(sixPreview).toContain('"ratio": "adaptive"')

  await page.getByText('H3-Context-IR · 5s · 16:9', { exact: true }).click()
  const ir = page.locator('[data-case-name="H3-Context-IR · 5s · 16:9"]')
  await expect(ir).toContainText('POST /minimax/v2/h3_context_ir')
  await expect(ir.getByText('待核实', { exact: true })).toHaveCount(0)
  const irPreview = await ir.locator('textarea').inputValue()
  expect(irPreview).toContain('"duration": 5')
  expect(irPreview).toContain('"ratio": "16:9"')
  expect(irPreview).not.toContain('resolution')

  await page.getByText('再生成 · 任务 id · 2K', { exact: true }).click()
  const regenTask = page.locator('[data-case-name="再生成 · 任务 id · 2K"]')
  await expect(regenTask).toContainText('POST /minimax/v2/video_regeneration')
  await expect(regenTask).toContainText('未拿到 task_id')
  const regenTaskPreview = await regenTask.locator('textarea').inputValue()
  expect(regenTaskPreview).toContain('"source_task_id": ""')
  expect(regenTaskPreview).toContain('"resolution": "2K"')
  expect(regenTaskPreview).not.toContain('content')

  await page.getByText('再生成 · 成片 URL · 2K', { exact: true }).click()
  const regenVideo = page.locator('[data-case-name="再生成 · 成片 URL · 2K"]')
  await expect(regenVideo).toContainText('尚未返回 task.content.url')
  const regenVideoPreview = await regenVideo.locator('textarea').inputValue()
  expect(regenVideoPreview).toContain('"role": "base_video"')
  expect(regenVideoPreview).not.toContain('source_task_id')

  await inputByLabel(page, '模型编码').fill('MiniMax-H3-Max')
  await inputByLabel(page, '模型编码').blur()
  await expect(page.locator('[data-case-name="文生 · 2K · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  for (const name of ['H3-Context-IR · 5s · 16:9', '再生成 · 任务 id · 2K', '再生成 · 成片 URL · 2K']) {
    const side = page.locator(`[data-case-name="${name}"]`)
    await expect(side.getByText('待核实', { exact: true })).toBeVisible()
    await expect(side.getByText('预期不支持', { exact: true })).toHaveCount(0)
  }
  const p480 = page.locator('[data-case-name="文生 · 480P · 16:9 · 5s"]')
  await expect(p480).toBeVisible()
  await expect(p480.locator('input[type="checkbox"]')).toBeChecked()
  await expect(p480.getByText('预期不支持', { exact: true })).toHaveCount(0)
  await page.getByText('文生 · 480P · 16:9 · 5s', { exact: true }).click()
  await expect(p480.locator('textarea')).toContainText('"resolution": "480P"')
  await expect(p480.locator('textarea')).toContainText('"duration": 5')
  await expect(p480.locator('textarea')).toContainText('"ratio": "16:9"')
  for (const name of ['参考图 · 1 张 · 768P · 5s', '参考图 · 2 张 · 768P · 5s', '参考图 · 3 张 · 768P · 5s', '参考图 · 4 张 · 768P · 5s']) {
    await expect(page.locator(`[data-case-name="${name}"]`)).toBeVisible()
    await expect(page.locator(`[data-case-name="${name}"] input[type="checkbox"]`)).toBeChecked()
  }
  await expect(page.locator('[data-case-name="参考图 · 5 张 · 768P · 5s"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="参考图 · 6 张 · 768P · 5s"]')).toHaveCount(0)
  await page.getByText('参考图 · 4 张 · 768P · 5s', { exact: true }).click()
  const fourPreview = await page.locator('[data-case-name="参考图 · 4 张 · 768P · 5s"] textarea').inputValue()
  expect(fourPreview.split(TEA_PIC).length - 1).toBe(4)
  expect(fourPreview).not.toContain('reference_video')
  expect(fourPreview).not.toContain('reference_audio')

  await inputByLabel(page, '模型编码').fill('MiniMax-H3')
  await inputByLabel(page, '模型编码').blur()
  await expect(page.locator('[data-case-name="文生 · 2K · 16:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  for (const name of ['H3-Context-IR · 5s · 16:9', '再生成 · 任务 id · 2K', '再生成 · 成片 URL · 2K']) {
    await expect(page.locator(`[data-case-name="${name}"]`).getByText('待核实', { exact: true })).toHaveCount(0)
  }

  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await expect(page.getByText('https://hk.ainowork.ai', { exact: true })).toBeVisible()
  await expect(page.getByText(/api\.ainowork\.ai/)).toBeVisible()
  await expect(page.getByText(/\/minimax\/v2/)).toBeVisible()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()

  await selectOption(page, '接口类型', 'Seedance 火山原生')
  await expect(page.locator('[data-case-name="文生 · 仅必填"]')).toBeVisible()
  await expect(page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]')).toHaveCount(0)
  await expect(inputByLabel(page, '模型编码')).toHaveValue('doubao-seedance-2-0')
  await expect(page.getByTestId('videotest-sensitive-face')).toBeVisible()
  await expect(page.getByRole('switch')).toBeVisible()
  expect(errors).toEqual([])
})

test('MiniMax mock：api.ainowork.ai 走 /minimax，2K 对 Max 记已拒绝且不做 Seedance 错误体', async ({ page }) => {
  test.setTimeout(60_000)
  await installVideoMetaStub(page)
  const posts: { url: string; body: any; auth: string }[] = []
  const queries: string[] = []
  const blocked: string[] = []

  await page.route('https://cdn.hailuoai.com/**', route => route.fulfill({
    status: 200, contentType: 'video/mp4', headers: CORS, body: 'fakevid',
  }))
  await page.route(url => /video_generation|\/api\/v3\/contents\/generations\/tasks|\/byteplus\//.test(String(url)), async route => {
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
          task: {
            id: 'task_abc',
            status: 'succeeded',
            content: { url: 'https://cdn.hailuoai.com/demo/out.mp4' },
            resolution: '768P',
            duration: 5,
            ratio: '16:9',
            usage: { total_tokens: 100 },
          },
        }),
      })
      return
    }
    const body = route.request().postDataJSON()
    posts.push({ url: u, body, auth: route.request().headers().authorization || '' })
    if (body?.resolution === '2K') {
      await fulfillCors(route, {
        status: 400,
        body: JSON.stringify({ type: 'error', error: { message: '2K is not supported', type: 'invalid_request', http_code: 400 } }),
      })
      return
    }
    await fulfillCors(route, { status: 200, body: JSON.stringify({ task_id: 'task_abc' }) })
  })

  await page.goto('/tools/videotest')
  await setupChannel(page, 'https://api.ainowork.ai')
  await selectOption(page, '接口类型', 'MiniMax-H3')

  await runNamedCase(page, '文生 · 768P · 16:9 · 5s')
  const t2v = page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]')
  await expect(t2v.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  expect(posts[0].url).toBe('https://api.ainowork.ai/minimax/v2/video_generation')
  expect(posts[0].auth).toBe('Bearer sk-test-1234567890')
  expect(posts[0].body).toMatchObject({
    model: 'MiniMax-H3',
    resolution: '768P',
    duration: 5,
    ratio: '16:9',
  })
  expect(posts[0].body.content).toEqual([{ type: 'text', text: '海浪拍打礁石，慢动作，电影感' }])
  expect(queries.some(u => u === 'https://api.ainowork.ai/minimax/v2/query/video_generation/task_abc')).toBeTruthy()
  expect(blocked).toEqual([])
  await expect(t2v.getByText('成片像素')).toBeVisible()
  await expect(t2v.getByText('官方域名')).toHaveCount(0)
  await expect(t2v.getByText('task.content.url')).toBeVisible()

  await inputByLabel(page, '模型编码').fill('MiniMax-H3-Max')
  await inputByLabel(page, '模型编码').blur()
  await runNamedCase(page, '文生 · 2K · 16:9 · 5s')
  const twoK = page.locator('[data-case-name="文生 · 2K · 16:9 · 5s"]')
  await expect(twoK.getByText('✓ 已拒绝')).toBeVisible({ timeout: 20_000 })
  await expect(twoK.getByText('错误结构')).toHaveCount(0)
  expect(posts.some(p => p.body?.resolution === '2K' && p.body?.model === 'MiniMax-H3-Max')).toBeTruthy()
  expect(posts.every(p => p.url === 'https://api.ainowork.ai/minimax/v2/video_generation')).toBeTruthy()

  const hist = await readHistoryStore(page, 'videotest')
  expect(hist.length).toBeGreaterThan(0)
  expect(hist.every((r: any) => r.apiType === 'minimax')).toBeTruthy()
  expect(hist.some((r: any) => r.videoUrl === 'https://cdn.hailuoai.com/demo/out.mp4')).toBeTruthy()
  expect(blocked).toEqual([])
})

test('MiniMax mock：Context-IR 只核提示词，两条再生成吃本轮 768P', async ({ page }) => {
  test.setTimeout(90_000)
  await installVideoMetaStub(page)
  const posts: { url: string; body: any }[] = []
  await page.route('https://cdn.hailuoai.com/**', route => route.fulfill({
    status: 200, contentType: 'video/mp4', headers: CORS, body: 'fakevid',
  }))
  await page.route(url => /h3_context_ir|video_regeneration|video_generation/.test(String(url)), async route => {
    const u = route.request().url()
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (route.request().method() === 'GET') {
      const id = u.split('/').filter(Boolean).pop()
      const task = id === 'task_ir'
        ? { id, status: 'succeeded', content: { prompt: 'expanded scene with a longer shot' }, duration: 5, ratio: '16:9', task_type: 'h3_context_ir' }
        : id === 'task_re_id' || id === 'task_re_url'
          ? { id, status: 'succeeded', content: { url: 'https://cdn.hailuoai.com/demo/regen.mp4' }, resolution: '2K', duration: 5, task_type: 'regeneration', usage: { total_tokens: 20 } }
          : { id, status: 'succeeded', content: { url: 'https://cdn.hailuoai.com/demo/768.mp4' }, resolution: '768P', duration: 5, ratio: '16:9', usage: { total_tokens: 10 } }
      await fulfillCors(route, { status: 200, body: JSON.stringify({ task }) })
      return
    }
    const body = route.request().postDataJSON()
    posts.push({ url: u, body })
    const taskId = u.includes('h3_context_ir') ? 'task_ir' : u.includes('video_regeneration') ? (body?.source_task_id ? 'task_re_id' : 'task_re_url') : 'task_768'
    await fulfillCors(route, { status: 200, body: JSON.stringify({ task_id: taskId }) })
  })

  await page.goto('/tools/videotest')
  await setupChannel(page, 'https://api.ainowork.ai')
  await selectOption(page, '接口类型', 'MiniMax-H3')
  await runNamedCase(page, '文生 · 768P · 16:9 · 5s')
  await expect(page.locator('[data-case-name="文生 · 768P · 16:9 · 5s"]').getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })

  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('另一渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://other.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-other-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await channelCard(page, '另一渠道').getByRole('button', { name: '设为当前' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('再生成 · 任务 id · 2K', { exact: true }).click()
  const blocked = page.locator('[data-case-name="再生成 · 任务 id · 2K"]')
  await expect(blocked).toContainText('当前渠道对不上')
  expect(await blocked.locator('textarea').inputValue()).toContain('"source_task_id": ""')
  await blocked.locator('textarea').fill('{"model":"MiniMax-H3","source_task_id":"task_768","resolution":"2K"}')
  await blocked.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(blocked.getByText(/请求失败/)).toBeVisible()
  expect(posts.filter(p => p.url.includes('video_regeneration'))).toEqual([])
  await selectOption(page, '使用渠道', 'MiniMax 渠道')
  await blocked.getByRole('button', { name: '重置为默认' }).click()
  await expect(blocked.locator('textarea')).toContainText('"source_task_id": "task_768"')
  await inputByLabel(page, '模型编码').fill('MiniMax-H3-Max')
  await inputByLabel(page, '模型编码').blur()
  await expect(blocked.locator('textarea')).toContainText('"model": "MiniMax-H3-Max"')
  await expect(blocked.locator('textarea')).toContainText('"source_task_id": "task_768"')
  await inputByLabel(page, '模型编码').fill('MiniMax-H3')
  await inputByLabel(page, '模型编码').blur()

  await runNamedCase(page, 'H3-Context-IR · 5s · 16:9')
  const ir = page.locator('[data-case-name="H3-Context-IR · 5s · 16:9"]')
  await expect(ir.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  await expect(ir.getByRole('cell', { name: '增强提示词', exact: true })).toBeVisible()
  await expect(ir.locator('pre').filter({ hasText: /^expanded scene with a longer shot$/ })).toBeVisible()
  await expect(ir.getByText('视频地址', { exact: true })).toHaveCount(0)
  const irPost = posts.find(p => p.url.includes('/h3_context_ir'))
  expect(irPost?.url).toBe('https://api.ainowork.ai/minimax/v2/h3_context_ir')
  expect(irPost?.body).toEqual({
    model: 'MiniMax-H3',
    content: [{ type: 'text', text: '海浪拍打礁石，慢动作，电影感' }],
    duration: 5,
    ratio: '16:9',
  })

  await runNamedCase(page, '再生成 · 任务 id · 2K')
  const byId = page.locator('[data-case-name="再生成 · 任务 id · 2K"]')
  await expect(byId.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  const idPost = posts.find(p => p.body?.source_task_id)
  expect(idPost?.url).toBe('https://api.ainowork.ai/minimax/v2/video_regeneration')
  expect(idPost?.body).toEqual({ model: 'MiniMax-H3', source_task_id: 'task_768', resolution: '2K' })

  await runNamedCase(page, '再生成 · 成片 URL · 2K')
  const byUrl = page.locator('[data-case-name="再生成 · 成片 URL · 2K"]')
  await expect(byUrl.getByText(/✓ 通过/)).toBeVisible({ timeout: 25_000 })
  const urlPost = posts.find(p => Array.isArray(p.body?.content) && p.body.content.some((item: { role?: string }) => item.role === 'base_video'))
  expect(urlPost?.url).toBe('https://api.ainowork.ai/minimax/v2/video_regeneration')
  expect(urlPost?.body).toEqual({
    model: 'MiniMax-H3',
    content: [
      { type: 'text', text: '海浪拍打礁石，慢动作，电影感' },
      { type: 'video_url', video_url: { url: 'https://cdn.hailuoai.com/demo/768.mp4' }, role: 'base_video' },
    ],
    resolution: '2K',
  })

  const tally = page.locator('span.whitespace-nowrap', { hasText: '已完成' })
  const before = await tally.innerText()
  await inputByLabel(page, '模型编码').fill('MiniMax-H3-Fast')
  await inputByLabel(page, '模型编码').blur()
  for (const name of ['H3-Context-IR · 5s · 16:9', '再生成 · 任务 id · 2K', '再生成 · 成片 URL · 2K']) {
    await expect(page.locator(`[data-case-name="${name}"]`).getByText('待核实', { exact: true })).toHaveCount(0)
  }
  await expect(tally).toHaveText(before)
})
