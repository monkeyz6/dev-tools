import { test, expect } from '@playwright/test'
import { readHistoryStore, readKv, writeHistoryStore, inputByLabel, selectOption } from './helpers'
import { readFileSync } from 'node:fs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
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

test('视频接口测试工具冒烟：三 Tab 与最少用例', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/')
  await page.getByText('视频接口测试').click()
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await expect(page.getByText('测试用例')).toBeVisible()
  for (const name of ['文生 · 仅必填', '480p · 9:16 · 4s', '720p · 21:9 · 5s', '1080p · 1:1 · 5s', '4K · 16:9 · 4s', '首尾帧', '多模态参考', '拒绝 · 500p', '拒绝 · 名人首帧']) {
    await expect(page.locator(`[data-case-name="${name}"]`)).toBeVisible()
    await expect(page.locator(`[data-case-name="${name}"] input[type="checkbox"]`)).toBeChecked()
  }
  await expect(page.getByText('素材组', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-case-name="拒绝 · 500p"]').getByText('预期拒绝')).toBeVisible()
  await expect(page.locator('[data-case-name="1080p · 1:1 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)

  await page.getByText('480p · 9:16 · 4s').click()
  const p480 = page.locator('[data-case-name="480p · 9:16 · 4s"] textarea')
  await expect(p480).toContainText('"resolution": "480p"')
  await expect(p480).toContainText('"ratio": "9:16"')
  await expect(p480).toContainText('"generate_audio": false')
  await expect(p480).toContainText('"seed": 42')
  await expect(p480).not.toContainText('camera_fixed')
  await page.getByText('拒绝 · 名人首帧', { exact: true }).click()
  const pFace = page.locator('[data-case-name="拒绝 · 名人首帧"] textarea')
  await expect(pFace).toContainText('Zhao_Liying')
  await expect(pFace).toContainText('"role": "first_frame"')

  await expect(inputByLabel(page, '模型编码')).toHaveValue('doubao-seedance-2-0')
  await selectOption(page, '模型编码', 'dreamina-seedance-2-0-fast')
  await expect(inputByLabel(page, '模型编码')).toHaveValue('dreamina-seedance-2-0-fast')
  await expect(page.locator('[data-case-name="1080p · 1:1 · 5s"]').getByText('预期不支持', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="4K · 16:9 · 4s"]').getByText('预期不支持', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="720p · 21:9 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)

  await selectOption(page, '模型编码', 'dreamina-seedance-2-5')
  await expect(inputByLabel(page, '模型编码')).toHaveValue('dreamina-seedance-2-5')
  await expect(page.locator('[data-case-name="1080p · 1:1 · 5s"]').getByText('预期不支持', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-case-name="4K · 16:9 · 4s"]').getByText('预期不支持', { exact: true })).toBeVisible()

  await page.getByText('文生 · 仅必填').click()
  await expect(page.locator('[data-case-name="文生 · 仅必填"] textarea')).toContainText('dreamina-seedance-2-5')

  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await expect(page.getByText('已保存的渠道')).toBeVisible()
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByText('历史测试记录')).toBeVisible()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  expect(errors).toEqual([])
})

test('改 URL 后用例预览重写；素材开关改写成 asset://', async ({ page }) => {
  await page.goto('/tools/videotest')
  await expect(page.getByText('本次测试配置')).toBeVisible()

  await page.getByText('首尾帧', { exact: true }).click()
  await expect(page.getByText('请求预览（可编辑）')).toBeVisible()
  const framesPreview = page.locator('[data-case-name="首尾帧"] textarea')
  await expect(framesPreview).toContainText('ark-project.tos-cn-beijing.volces.com/doc_image/seepro_first_frame.jpeg')

  await inputByLabel(page, '首帧').fill('https://example.com/custom-first.png')
  await expect(framesPreview).toContainText('https://example.com/custom-first.png')

  await page.getByRole('switch').click()
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('素材组', { exact: true })).toBeVisible()
  await expect(page.getByText('素材登记')).toBeVisible()
  if (!await framesPreview.isVisible()) await page.getByText('首尾帧', { exact: true }).click()
  await expect(framesPreview).toContainText('asset://{{first_frame}}')
  await expect(framesPreview).not.toContainText('https://example.com/custom-first.png')
})

test('渠道保存、运行文生必填、历史还原、HTML 可滚动', async ({ page }) => {
  await installVideoMetaStub(page)
  const sent: any[] = []
  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks') && !String(url).match(/tasks\/.+/), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    sent.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'x-oneapi-request-id': 'vid-req-1' },
      body: JSON.stringify({
        id: 'task_1',
        status: 'success',
        content: { video_url: 'https://cdn.example/result.mp4' },
        ratio: '16:9',
        duration: 5,
        resolution: '720p',
      }),
    })
  })
  await page.route('**/cdn.example/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'fake' }))

  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('视频测试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await expect(page.getByText('视频测试渠道').first()).toBeVisible()

  const rawCh = await readKv(page, 'videotest-channels')
  expect(rawCh).toBeTruthy()
  expect(rawCh).toContain('视频测试渠道')
  expect(rawCh).not.toContain('sk-test-1234567890')

  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('文生 · 仅必填').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('vid-req-1').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/✓ 通过/).first()).toBeVisible()
  expect(sent[0]).toMatchObject({
    model: 'doubao-seedance-2-0',
    content: [{ type: 'text', text: expect.any(String) }],
  })
  expect(sent[0].resolution).toBeUndefined()
  expect(sent[0].camera_fixed).toBeUndefined()

  const hist = await readHistoryStore(page, 'videotest')
  expect(hist.length).toBeGreaterThan(0)
  expect(hist[0].caseName).toBe('文生 · 仅必填')
  expect(hist[0].videoUrl).toBe('https://cdn.example/result.mp4')

  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByTestId('videotest-batch')).toBeVisible()
  await expect(page.getByRole('cell', { name: '文生 · 仅必填' })).toBeVisible()
  await page.getByRole('button', { name: '详情' }).click()
  await expect(page.getByText('测试记录详情')).toBeVisible()
  await page.locator('button', { hasText: '×' }).first().click()

  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '↺ 还原到工作台' }).click()
  await expect(page.getByTestId('videotest-restored-note')).toBeVisible()
  await expect(page.getByText('TOS 可能过期')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 HTML' }).click(),
  ])
  const htmlPath = '/tmp/videotest-export-test.html'
  await download.saveAs(htmlPath)
  const html = readFileSync(htmlPath, 'utf-8')
  expect(html).toContain('视频接口测试报告')
  expect(html).toContain('data-video-export-root')
  expect(html).toContain('max-width:1120px;margin:0 auto')
  expect(html).toMatch(/html,body\{[^}]*overflow:auto/)
  expect(html).toContain('24')

  await page.goto('file://' + htmlPath)
  await expect(page.getByText('视频接口测试报告').first()).toBeVisible({ timeout: 15000 })
  const scroll = await page.evaluate(() => ({
    overflow: getComputedStyle(document.body).overflow,
    height: getComputedStyle(document.body).height,
  }))
  expect(scroll.overflow === 'auto' || scroll.overflow === 'scroll' || scroll.overflow === 'visible').toBeTruthy()
  expect(scroll.height).not.toBe('100%')
})

test('素材库用例走 OpenAPI，媒体用例改写 asset://', async ({ page }) => {
  await installVideoMetaStub(page)
  const actions: string[] = []
  const taskBodies: any[] = []
  await page.route(url => String(url).includes('/byteplus/?') || String(url).includes('/byteplus?'), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const u = route.request().url()
    const action = new URL(u).searchParams.get('Action') || ''
    actions.push(action)
    const body = route.request().postDataJSON()
    if (action === 'CreateAssetGroup') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ Result: { Id: 'grp_1' } }) })
      return
    }
    if (action === 'CreateAsset') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ Result: { Id: `ast_${body.Name}` } }) })
      return
    }
    if (action === 'GetAsset') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ Result: { Status: 'Active' } }) })
      return
    }
    await route.fulfill({ status: 404, body: 'no' })
  })
  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks'), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (route.request().method() === 'POST') taskBodies.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'x-oneapi-request-id': 'vid-mat-1' },
      body: JSON.stringify({ id: 'task_m', status: 'succeeded', content: { video_url: 'https://cdn.example/m.mp4' }, ratio: '16:9', duration: 5 }),
    })
  })
  await page.route('**/cdn.example/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'fake' }))

  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('素材渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByRole('switch').click()
  await expect(page.getByText('素材组', { exact: true })).toBeVisible()
  const selectAll = page.locator('label:has-text("全选") input[type="checkbox"]')
  if (!await selectAll.isChecked()) await selectAll.check()
  await selectAll.uncheck()
  for (const name of ['素材组', '素材登记', '文生 · 仅必填', '首尾帧']) {
    await page.locator(`[data-case-name="${name}"] input[type="checkbox"]`).check()
  }
  await page.getByRole('button', { name: '▶ 运行选中' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 20000 })
  expect(actions.filter(a => a === 'CreateAssetGroup').length).toBe(1)
  expect(actions.filter(a => a === 'CreateAsset').length).toBeGreaterThan(0)
  expect(taskBodies.some((b: any) => JSON.stringify(b).includes('asset://'))).toBeTruthy()
})

test('分辨率按面积档校验；拒绝与预期不支持用例反向判定；名人首帧走直链', async ({ page }) => {
  await installVideoMetaStub(page)
  const sent: any[] = []
  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks') && !String(url).match(/tasks\/.+/), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const body = route.request().postDataJSON()
    sent.push(body)
    const res = String(body.resolution || '')
    const limited = /-(fast|mini)/.test(String(body.model))
    if (res === '500p' || (limited && (res === '1080p' || res === '4k'))) {
      await route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { code: 'InvalidParameter', message: `resolution ${res} not supported` } }) })
      return
    }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'vid-res-1' },
      body: JSON.stringify({ id: 'task_r', status: 'succeeded', content: { video_url: 'https://cdn.example/r.mp4' }, ratio: body.ratio, duration: body.duration, seed: body.seed ?? 78674 }),
    })
  })
  await page.route('**/cdn.example/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'fake' }))

  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('分辨率渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await inputByLabel(page, '模型编码').fill('doubao-seedance-2-0-fast')

  const selectAll = page.locator('label:has-text("全选") input[type="checkbox"]')
  if (!await selectAll.isChecked()) await selectAll.check()
  await selectAll.uncheck()
  for (const name of ['480p · 9:16 · 4s', '720p · 21:9 · 5s', '1080p · 1:1 · 5s', '拒绝 · 500p', '拒绝 · 名人首帧']) {
    await page.locator(`[data-case-name="${name}"] input[type="checkbox"]`).check()
  }
  await page.getByRole('button', { name: '▶ 运行选中' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30000 })

  // 成片 stub 固定 1280×720：720p 面积档通过，480p 面积档不通过
  const row = (caseName: string, check: string) => page.locator(`[data-case-name="${caseName}"] tr`).filter({ hasText: check })
  await expect(row('720p · 21:9 · 5s', '分辨率')).toContainText('通过')
  await expect(row('720p · 21:9 · 5s', '分辨率')).not.toContainText('未通过')
  await expect(row('480p · 9:16 · 4s', '分辨率')).toContainText('未通过')
  await expect(row('720p · 21:9 · 5s', '音轨')).toContainText('信息')
  await expect(row('480p · 9:16 · 4s', 'seed')).toContainText('回显 42')
  await expect(row('480p · 9:16 · 4s', 'seed')).not.toContainText('未通过')
  expect(sent.find(b => b.resolution === '480p')).not.toHaveProperty('camera_fixed')

  await expect(page.locator('[data-case-name="拒绝 · 500p"]').getByText('✓ 已拒绝')).toBeVisible()
  await expect(page.locator('[data-case-name="1080p · 1:1 · 5s"]').getByText('✓ 已拒绝')).toBeVisible()
  await expect(row('1080p · 1:1 · 5s', '预期不支持')).toContainText('HTTP 400')
  // 名人首帧在 mock 里被放行出片 → 判为未被拒绝
  await expect(page.locator('[data-case-name="拒绝 · 名人首帧"]').getByText('✕ 未被拒绝')).toBeVisible()

  const face = sent.find(b => JSON.stringify(b).includes('Zhao_Liying'))
  expect(face).toBeTruthy()
  expect(JSON.stringify(face)).not.toContain('asset://')
  expect(face.content.find((c: any) => c.role === 'first_frame').image_url.url).toContain('upload.wikimedia.org')
  expect(sent.find(b => b.resolution === '500p')).toBeTruthy()

  const hist = await readHistoryStore(page, 'videotest')
  const rejectRec = hist.find((r: any) => r.caseName === '拒绝 · 500p')
  expect(rejectRec.expect).toBe('reject')
  expect(rejectRec.ok).toBe(true)
  expect(hist.find((r: any) => r.caseName === '1080p · 1:1 · 5s').expect).toBe('unsupported')

  // 导出 HTML 只包含勾选的用例：取消勾选两条有结果的用例后再导出
  await page.locator('[data-case-name="拒绝 · 名人首帧"] input[type="checkbox"]').uncheck()
  await page.locator('[data-case-name="480p · 9:16 · 4s"] input[type="checkbox"]').uncheck()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 HTML' }).click(),
  ])
  const htmlPath = '/tmp/videotest-export-selected.html'
  await download.saveAs(htmlPath)
  const html = readFileSync(htmlPath, 'utf-8')
  expect(html).toContain('720p · 21:9 · 5s')
  expect(html).toContain('拒绝 · 500p')
  expect(html).not.toContain('拒绝 · 名人首帧')
  expect(html).not.toContain('480p · 9:16 · 4s')
})

test('轮询中断后可手动重试查询：工作台与历史里同一条记录原地更新', async ({ page }) => {
  await installVideoMetaStub(page)
  let pollMode: 'abort' | 'done' = 'abort'
  let polls = 0
  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks') && !String(url).match(/tasks\/.+/), async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'vid-submit-1' },
      body: JSON.stringify({ id: 'task_slow', status: 'queued' }),
    })
  })
  await page.route(url => /\/byteplus\/api\/v3\/contents\/generations\/tasks\/task_slow$/.test(String(url)), async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    polls += 1
    if (pollMode === 'abort') { await route.abort('timedout'); return }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ id: 'task_slow', status: 'succeeded', content: { video_url: 'https://cdn.example/slow.mp4' }, ratio: '16:9', duration: 5, seed: 7 }),
    })
  })
  await page.route('**/cdn.example/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'fake' }))

  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('重试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('文生 · 仅必填').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()

  // 首次轮询被网络中断 → 请求失败，但任务 id 已拿到，出现「重试查询」
  const caseBox = page.locator('[data-case-name="文生 · 仅必填"]')
  await expect(caseBox.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
  await expect(caseBox.getByText('task_slow', { exact: true })).toBeVisible()
  await expect(caseBox.getByRole('button', { name: '↻ 重试查询' })).toBeVisible()
  const histBefore = await readHistoryStore(page, 'videotest')
  expect(histBefore).toHaveLength(1)
  expect(histBefore[0].taskId).toBe('task_slow')
  expect(histBefore[0].ok).toBe(false)

  // 历史页同一条也能重试
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByRole('button', { name: '↻ 重试查询' })).toBeVisible()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()

  pollMode = 'done'
  const pollsBefore = polls
  await caseBox.getByRole('button', { name: '↻ 重试查询' }).click()
  await expect(caseBox.getByText('✓ 通过')).toBeVisible({ timeout: 20000 })
  expect(polls).toBeGreaterThan(pollsBefore)
  await expect(caseBox.getByRole('button', { name: '↻ 重试查询' })).toHaveCount(0)
  await expect(caseBox.getByRole('link', { name: 'https://cdn.example/slow.mp4' })).toBeVisible()

  // 历史里还是同一条（id 不变），状态更新为成功
  const histAfter = await readHistoryStore(page, 'videotest')
  expect(histAfter).toHaveLength(1)
  expect(histAfter[0].id).toBe(histBefore[0].id)
  expect(histAfter[0].ok).toBe(true)
  expect(histAfter[0].videoUrl).toBe('https://cdn.example/slow.mp4')
  expect(histAfter[0].pollLog.some((t: any) => String(t.status).includes('手动重试查询'))).toBe(true)
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByRole('button', { name: '↻ 重试查询' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '通过' }).first()).toBeVisible()
})

test('一键重试错误：同批只重跑勾选的请求失败，能查只查', async ({ page }) => {
  await installVideoMetaStub(page)
  const posts: Record<string, number> = {}
  let polls = 0
  let allowPoll = false

  function caseKey(body: { resolution?: string; content?: { role?: string }[] }) {
    if (Array.isArray(body.content) && body.content.some(c => c.role === 'first_frame')) return 'frames'
    if (body.resolution === '480p') return '480p'
    if (body.resolution === '720p') return '720p'
    return 't2v'
  }

  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks') && !String(url).match(/tasks\/.+/), async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    const body = route.request().postDataJSON()
    const key = caseKey(body)
    posts[key] = (posts[key] || 0) + 1
    if (key === '720p' && posts[key] === 1) {
      await route.fulfill({
        status: 400, contentType: 'application/json', headers: CORS,
        body: JSON.stringify({ error: { code: 'QuotaExceeded', message: 'account balance insufficient' } }),
      })
      return
    }
    if (key === 'frames') {
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'vid-retry-frames' },
        body: JSON.stringify({ id: 'task_retry', status: 'queued' }),
      })
      return
    }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': `vid-retry-${key}` },
      body: JSON.stringify({
        id: `task_${key}`, status: 'succeeded',
        content: { video_url: `https://cdn.example/${key}.mp4` },
        ratio: body.ratio, duration: body.duration, seed: body.seed,
      }),
    })
  })
  await page.route(url => /\/byteplus\/api\/v3\/contents\/generations\/tasks\/task_retry$/.test(String(url)), async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    polls += 1
    if (!allowPoll) { await route.abort('timedout'); return }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ id: 'task_retry', status: 'succeeded', content: { video_url: 'https://cdn.example/frames.mp4' }, ratio: '16:9', duration: 5 }),
    })
  })
  await page.route('**/cdn.example/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'fake' }))

  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('一键重试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()

  const selectAll = page.locator('label:has-text("全选") input[type="checkbox"]')
  if (!await selectAll.isChecked()) await selectAll.check()
  await selectAll.uncheck()
  for (const name of ['文生 · 仅必填', '480p · 9:16 · 4s', '720p · 21:9 · 5s', '首尾帧']) {
    await page.locator(`[data-case-name="${name}"] input[type="checkbox"]`).check()
  }
  await page.getByRole('button', { name: '▶ 运行选中' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30000 })

  await expect(page.locator('[data-case-name="文生 · 仅必填"]').getByText(/✓ 通过/)).toBeVisible()
  await expect(page.locator('[data-case-name="480p · 9:16 · 4s"]').getByText(/✕ .*通过/)).toBeVisible()
  await expect(page.locator('[data-case-name="720p · 21:9 · 5s"]').getByText('! 请求失败')).toBeVisible()
  const framesBox = page.locator('[data-case-name="首尾帧"]')
  await expect(framesBox.getByText('! 请求失败')).toBeVisible()
  await expect(framesBox.getByRole('button', { name: '↻ 重试查询' })).toBeVisible()

  const histBefore = await readHistoryStore(page, 'videotest')
  expect(histBefore).toHaveLength(4)
  const runIds = new Set(histBefore.map((r: { runId: string }) => r.runId))
  expect(runIds.size).toBe(1)
  const idOf = (name: string) => histBefore.find((r: { caseName: string }) => r.caseName === name).id
  const passId = idOf('文生 · 仅必填')
  const failId = idOf('480p · 9:16 · 4s')
  const quotaId = idOf('720p · 21:9 · 5s')
  const pollId = idOf('首尾帧')
  const runId = histBefore[0].runId
  const postsBefore = { ...posts }
  const pollsBefore = polls

  allowPoll = true
  await page.getByRole('button', { name: '↻ 重试错误' }).click()
  await expect(page.getByText('错误重试结束')).toBeVisible({ timeout: 30000 })

  await expect(page.locator('[data-case-name="文生 · 仅必填"]').getByText(/✓ 通过/)).toBeVisible()
  await expect(page.locator('[data-case-name="480p · 9:16 · 4s"]').getByText(/✕ .*通过/)).toBeVisible()
  await expect(page.locator('[data-case-name="720p · 21:9 · 5s"]').getByText('! 请求失败')).toHaveCount(0)
  await expect(framesBox.getByText(/✓ 通过/)).toBeVisible()
  await expect(framesBox.getByRole('button', { name: '↻ 重试查询' })).toHaveCount(0)

  expect(posts.t2v).toBe(postsBefore.t2v)
  expect(posts['480p']).toBe(postsBefore['480p'])
  expect(posts['720p']).toBe(postsBefore['720p'] + 1)
  expect(posts.frames).toBe(postsBefore.frames)
  expect(polls).toBeGreaterThan(pollsBefore)

  const histAfter = await readHistoryStore(page, 'videotest')
  expect(histAfter).toHaveLength(4)
  expect(new Set(histAfter.map((r: { runId: string }) => r.runId))).toEqual(new Set([runId]))
  expect(histAfter.find((r: { caseName: string }) => r.caseName === '文生 · 仅必填').id).toBe(passId)
  expect(histAfter.find((r: { caseName: string }) => r.caseName === '480p · 9:16 · 4s').id).toBe(failId)
  expect(histAfter.find((r: { caseName: string }) => r.caseName === '720p · 21:9 · 5s').id).not.toBe(quotaId)
  expect(histAfter.find((r: { caseName: string }) => r.caseName === '首尾帧').id).toBe(pollId)
  expect(histAfter.find((r: { caseName: string }) => r.caseName === '首尾帧').pollLog.some((t: { status: string }) => String(t.status).includes('手动重试查询'))).toBe(true)
})

function writeKv(page: import('@playwright/test').Page, key: string, value: string) {
  return page.evaluate(([key, value]) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('dev-toolkit-history')
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  }), [key, value])
}

test('旧版默认素材链接自动迁到官方示例；素材拉取失败不算「已拒绝」', async ({ page }) => {
  // 先让 App 建库，再把旧版默认链接（Wikimedia 320px / MDN）与一条用户手改过的链接写进 videotest-ui
  await page.goto('/tools/videotest')
  await expect(inputByLabel(page, '首帧')).toHaveValue(/ark-project\.tos-cn-beijing\.volces\.com/)
  await writeKv(page, 'videotest-ui', JSON.stringify({
    firstFrame: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png',
    lastFrame: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/960px-Fronalpstock_big.jpg',
    refImage: 'https://my.cdn.example/custom-ref.png',
    refVideo: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    refAudio: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    sensitiveFace: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg/640px-Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg',
  }))
  await page.reload()
  await expect(inputByLabel(page, '首帧')).toHaveValue('https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_first_frame.jpeg')
  await expect(inputByLabel(page, '尾帧')).toHaveValue('https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_last_frame.jpeg')
  await expect(inputByLabel(page, '参考图')).toHaveValue('https://my.cdn.example/custom-ref.png')
  await expect(inputByLabel(page, '参考视频')).toHaveValue('https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4')
  await expect(inputByLabel(page, '参考音频')).toHaveValue('https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3')
  await expect(inputByLabel(page, '敏感人像')).toHaveValue(/960px-Zhao_Liying/)

  // 网关拉不到名人图 → 火山返回 400「素材转换失败」：这不是模型拒绝，应记「请求异常」
  const sent: any[] = []
  await page.route(url => String(url).includes('/byteplus/api/v3/contents/generations/tasks') && !String(url).match(/tasks\/.+/), async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
    sent.push(route.request().postDataJSON())
    await route.fulfill({
      status: 400, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ error: { code: '400', message: '素材转换失败: [Failed to download media from the provided URL. Please check if the link is accessible.] tos: request error:  Message=fetch object return status code: 429', type: 'api_error' } }),
    })
  })
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('素材渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  const selectAll = page.locator('label:has-text("全选") input[type="checkbox"]')
  if (!await selectAll.isChecked()) await selectAll.check()
  await selectAll.uncheck()
  await page.locator('[data-case-name="拒绝 · 名人首帧"] input[type="checkbox"]').check()
  await page.getByRole('button', { name: '▶ 运行选中' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30000 })
  expect(sent).toHaveLength(1)
  const faceCase = page.locator('[data-case-name="拒绝 · 名人首帧"]')
  await expect(faceCase.getByText('! 请求异常')).toBeVisible()
  await expect(faceCase.getByText('✓ 已拒绝')).toHaveCount(0)
  await expect(faceCase.locator('tr').filter({ hasText: '预期拒绝' })).toContainText('素材拉取失败')
})

test('历史未通过可重新识别：按已有元数据重算校验，不重提任务', async ({ page }) => {
  await page.goto('/tools/videotest')
  await expect(page.getByText('本次测试配置')).toBeVisible()
  await writeHistoryStore(page, 'videotest', {
    id: 'hist-1080-fail',
    runId: 'run-reprobe',
    time: Date.now(),
    caseName: '1080p · 1:1 · 5s',
    caseDesc: '旧面积档把 1080×1080 判成 720p',
    channelName: '历史渠道',
    model: 'doubao-seedance-2-0',
    prompt: 'x',
    apiType: 'seedance',
    kind: 't2v',
    caseId: 'res-1080p',
    expect: 'success',
    testMaterials: false,
    targets: { resolution: '1080p', ratio: '1:1', duration: 5, generate_audio: true },
    skippedRoles: [],
    status: 200,
    respHeaders: {},
    reqId: '',
    sentPreview: '',
    ok: true,
    error: null,
    rawSnippet: '',
    taskId: 'task_old_1080',
    taskStatus: 'succeeded',
    pollCount: 1,
    videoUrl: 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/expired.mp4?X-Tos-Algorithm=TOS4',
    probe: { w: 1080, h: 1080, duration: 5.04, hasAudio: true },
    usage: null,
    durationMs: 1000,
    checks: [{ name: '分辨率', target: '1080p（面积档 ±15%）', actual: '1080×1080 → 最近 720p（偏差 43.8%）', pass: false }],
    pollLog: [],
  })
  await page.reload()
  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByTestId('videotest-batch')).toBeVisible()
  const row = page.locator('tr').filter({ hasText: '1080p · 1:1 · 5s' })
  await expect(row.getByText('未通过')).toBeVisible()
  await expect(page.getByRole('button', { name: /重新识别未通过/ })).toBeVisible()
  await row.getByRole('button', { name: '↻ 重新识别', exact: true }).click()
  await expect(row.getByText('通过')).toBeVisible({ timeout: 10000 })
  await expect(row.getByRole('button', { name: '↻ 重新识别', exact: true })).toHaveCount(0)
  const hist = await readHistoryStore(page, 'videotest')
  const rec = hist.find((r: { id: string }) => r.id === 'hist-1080-fail')
  expect(rec.checks.find((c: { name: string }) => c.name === '分辨率').pass).toBe(true)
  expect(rec.pollLog.some((t: { status: string }) => String(t.status).includes('重新识别视频信息'))).toBe(true)
})
