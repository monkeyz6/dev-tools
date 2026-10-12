import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { inputByLabel } from './helpers'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

const OFFICIAL_CN_HOST = 'ark-acg-cn-beijing.tos-cn-beijing.volces.com'
const officialCn = (name: string) => `https://${OFFICIAL_CN_HOST}/${name}`

/**
 * 成片尺寸按文件名分配，没登记的走 1280×720 · 5s。
 * 官方桶链接会先被拉成 blob 再探测，src 里已看不到文件名：每个文件返回长度不同的正文，再按 blob 大小认回来。
 */
async function installSizedVideoStub(page: Page, sizes: Record<string, [number, number, number]>) {
  const table = Object.entries(sizes).map(([key, [w, h, d]], i) => ({ key, w, h, d, len: 64 + i }))
  await page.route(`https://${OFFICIAL_CN_HOST}/**`, route => {
    const hit = table.find(t => route.request().url().includes(t.key))
    return route.fulfill({ status: 200, contentType: 'video/mp4', body: hit ? 'x'.repeat(hit.len) : 'fake' })
  })
  await page.addInitScript((entries: Array<{ key: string; w: number; h: number; d: number; len: number }>) => {
    const blobSizes = new Map<string, number>()
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = create(obj)
      if (obj instanceof Blob) blobSizes.set(url, obj.size)
      return url
    }
    const proto = HTMLMediaElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'src')
    if (!desc?.set || !desc.get) return
    const pick = (el: HTMLVideoElement): [number, number, number] => {
      const s = String(desc.get!.call(el) || '')
      const size = blobSizes.get(s)
      const hit = entries.find(t => (size != null ? size === t.len : s.includes(t.key)))
      return hit ? [hit.w, hit.h, hit.d] : [1280, 720, 5]
    }
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get() { return pick(this)[0] } })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get() { return pick(this)[1] } })
    Object.defineProperty(HTMLVideoElement.prototype, 'duration', { configurable: true, get() { return pick(this)[2] } })
    Object.defineProperty(HTMLVideoElement.prototype, 'src', {
      configurable: true,
      get() { return desc.get!.call(this) },
      set(v: string) {
        desc.set!.call(this, v)
        queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')))
      },
    })
  }, table)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** 纯黑 PNG：尾帧 mock 需要浏览器真能解码出 naturalWidth / naturalHeight */
function blackPng(w: number, h: number) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const isSubmit = (url: string) => url.includes('/api/v3/contents/generations/tasks') && !/\/tasks\/[^/?]+$/.test(new URL(url).pathname)

async function setupChannel(page: Page, model?: string) {
  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('功能渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  if (model) {
    await inputByLabel(page, '模型编码').fill(model)
    await inputByLabel(page, '模型编码').blur()
  }
}

async function selectOnly(page: Page, names: string[]) {
  const selectAll = page.locator('label:has-text("全选") input[type="checkbox"]')
  if (!await selectAll.isChecked()) await selectAll.check()
  await selectAll.uncheck()
  for (const name of names) await page.locator(`[data-case-name="${name}"] input[type="checkbox"]`).check()
}

const caseBox = (page: Page, name: string) => page.locator(`[data-case-name="${name}"]`)
const row = (page: Page, caseName: string, check: string) => page.locator(`[data-case-name="${caseName}"] tr`).filter({ hasText: check })

test.describe('视频接口测试：Seedance 新增功能用例', () => {
  test.describe.configure({ timeout: 40_000 })

  test('2.5：样片两步串联，正式视频只带样片 id，并核对时长与比例复用', async ({ page }) => {
    await installSizedVideoStub(page, { 'draft.mp4': [864, 496, 4], 'final.mp4': [1920, 1080, 4] })
    const sent: any[] = []
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      const body = route.request().postDataJSON()
      sent.push(body)
      const final = body.content?.[0]?.type === 'draft_task'
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify(final
          ? { id: 'task_final', status: 'succeeded', content: { video_url: officialCn('final.mp4') }, draft_task_id: 'task_draft', resolution: '1080p', ratio: '16:9', duration: 4 }
          : { id: 'task_draft', status: 'succeeded', content: { video_url: officialCn('draft.mp4') }, resolution: '480p', ratio: '16:9', duration: 4 }),
      })
    })
    await setupChannel(page, 'doubao-seedance-2-5')
    await expect(caseBox(page, '样片 · 480p').getByText('预期不支持', { exact: true })).toHaveCount(0)
    await selectOnly(page, ['样片 · 480p', '样片转正式 · 1080p'])
    await page.getByRole('button', { name: '▶ 运行选中' }).click()
    await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30_000 })

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ model: 'doubao-seedance-2-5', draft: true, resolution: '480p' })
    expect(sent[1]).toEqual({ model: 'doubao-seedance-2-5', content: [{ type: 'draft_task', draft_task: { id: 'task_draft' } }], resolution: '1080p' })

    await expect(row(page, '样片 · 480p', 'draft 回显')).toHaveCount(0)
    await expect(row(page, '样片转正式 · 1080p', '样片复用（任务 id）')).toContainText('task_draft')
    await expect(row(page, '样片转正式 · 1080p', '样片复用（任务 id）')).not.toContainText('未通过')
    await expect(row(page, '样片转正式 · 1080p', '样片复用（时长）')).not.toContainText('未通过')
    await expect(row(page, '样片转正式 · 1080p', '样片复用（宽高比）')).not.toContainText('未通过')
    await expect(caseBox(page, '样片 · 480p').getByText(/✓ 通过/)).toBeVisible()
    await expect(caseBox(page, '样片转正式 · 1080p').getByText(/✓ 通过/)).toBeVisible()
  })

  test('2.0：2.5 专属用例标预期不支持，被拒算通过，样片转正式不发请求', async ({ page }) => {
    await installSizedVideoStub(page, {})
    const sent: any[] = []
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      const body = route.request().postDataJSON()
      sent.push(body)
      await route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { code: 'InvalidParameter', message: 'not supported by this model' } }) })
    })
    await setupChannel(page)
    const gated = ['仅参考音频', '输出 mov · 480p · 4s', '样片 · 480p', '样片转正式 · 1080p']
    for (const name of gated) await expect(caseBox(page, name).getByText('预期不支持', { exact: true })).toBeVisible()
    for (const name of ['首帧', '视频编辑', '视频延长', '智能时长 · 480p · 4:3', '参考图 + 音频 · 480p']) {
      await expect(caseBox(page, name).getByText('预期不支持', { exact: true })).toHaveCount(0)
    }

    await selectOnly(page, gated)
    await page.getByRole('button', { name: '▶ 运行选中' }).click()
    await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30_000 })

    for (const name of gated) await expect(caseBox(page, name).getByText('✓ 已拒绝')).toBeVisible()
    await expect(row(page, '样片 · 480p', '预期不支持')).toContainText('仅 Seedance 2.5 支持')
    await expect(row(page, '样片转正式 · 1080p', '预期不支持')).toContainText('本条未发送')
    expect(sent).toHaveLength(3)
    expect(sent.some(b => JSON.stringify(b).includes('draft_task'))).toBe(false)
    const audioOnly = sent.find(b => b.content.some((c: any) => c.role === 'reference_audio'))
    expect(audioOnly.content.map((c: any) => c.type)).toEqual(['text', 'audio_url'])
  })

  test('720p 返回尾帧核对地址与尺寸；480p 调度参数核对回显', async ({ page }) => {
    await installSizedVideoStub(page, { 'v720.mp4': [1470, 630, 5], 'v480.mp4': [496, 864, 4] })
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      const body = route.request().postDataJSON()
      const is720 = body.resolution === '720p'
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify({
          id: is720 ? 'task_720' : 'task_480', status: 'succeeded',
          content: is720 ? { video_url: officialCn('v720.mp4'), last_frame_url: officialCn('last.jpeg') } : { video_url: officialCn('v480.mp4') },
          ratio: body.ratio, duration: body.duration,
          priority: body.priority, execution_expires_after: body.execution_expires_after,
        }),
      })
    })
    await setupChannel(page)
    await page.route(officialCn('last.jpeg'), route => route.fulfill({ status: 200, contentType: 'image/png', body: blackPng(1470, 630) }))
    await selectOnly(page, ['480p · 9:16 · 4s', '720p · 21:9 · 5s'])
    await page.getByRole('button', { name: '▶ 运行选中' }).click()
    await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30_000 })

    await expect(row(page, '720p · 21:9 · 5s', '尾帧').first()).toContainText(officialCn('last.jpeg'))
    await expect(row(page, '720p · 21:9 · 5s', '尾帧尺寸')).toContainText('1470×630')
    await expect(row(page, '720p · 21:9 · 5s', '尾帧尺寸')).not.toContainText('未通过')
    await expect(row(page, '480p · 9:16 · 4s', 'safety_identifier 回显')).toHaveCount(0)
    for (const check of ['priority 回显', 'execution_expires_after 回显']) {
      await expect(row(page, '480p · 9:16 · 4s', check)).toContainText('通过')
      await expect(row(page, '480p · 9:16 · 4s', check)).not.toContainText('未通过')
    }
  })

  test('2.5 视频编辑的 duration=-1 跟随原视频，不套智能时长范围；还原不把用例自带提示词写回左栏', async ({ page }) => {
    // 官方：2.5 编辑成片可能比原视频短约 0.4s，回显 duration = 帧数/24 向下取整。4s 原视频 → 成片 3.6s、回显 3，不在 [4,30] 内
    await installSizedVideoStub(page, { 'ref4.mp4': [854, 480, 4], 'edit.mp4': [854, 480, 3.6], 't2v.mp4': [1280, 720, 5] })
    const sent: any[] = []
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      const body = route.request().postDataJSON()
      sent.push(body)
      const edit = body.content.some((c: any) => c.role === 'reference_video')
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify(edit
          ? { id: 'task_edit', status: 'succeeded', content: { video_url: officialCn('edit.mp4') }, resolution: '480p', ratio: '16:9', duration: 3 }
          : { id: 'task_t2v', status: 'succeeded', content: { video_url: officialCn('t2v.mp4') }, ratio: '16:9', duration: 5 }),
      })
    })
    await setupChannel(page, 'doubao-seedance-2-5')
    await inputByLabel(page, '提示词').fill('左栏通用提示词')
    await page.getByTestId('videotest-ref-video').locator('input').fill(officialCn('ref4.mp4'))
    await selectOnly(page, ['文生 · 仅必填', '视频编辑'])
    await page.getByRole('button', { name: '▶ 运行选中' }).click()
    await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30_000 })

    expect(sent).toHaveLength(2)
    const editBody = sent.find(b => b.content.some((c: any) => c.role === 'reference_video'))
    expect(editBody.duration).toBe(-1)
    expect(editBody.content[0].text).toMatch(/^编辑视频：/)
    await expect(row(page, '视频编辑', '回显时长')).toHaveCount(0)
    await expect(row(page, '视频编辑', '回显 3s ±1s')).not.toContainText('未通过')
    await expect(row(page, '视频编辑', '与参考视频一致')).toHaveCount(2)
    await expect(row(page, '视频编辑', '与参考视频一致 4.00s')).toContainText('3.60s')
    await expect(row(page, '视频编辑', '与参考视频一致').filter({ hasText: '未通过' })).toHaveCount(0)
    await expect(caseBox(page, '视频编辑').getByText(/✓ 通过/)).toBeVisible()

    await inputByLabel(page, '提示词').fill('改过的提示词')
    await page.getByRole('button', { name: /^历史记录/ }).click()
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: '↺ 还原到工作台' }).click()
    await expect(page.getByTestId('videotest-restored-note')).toBeVisible()
    await expect(inputByLabel(page, '提示词')).toHaveValue('左栏通用提示词')
  })

  test('首尾帧 / 多模态参考的素材全空时不发送，不退化成文生', async ({ page }) => {
    const sent: any[] = []
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      sent.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'task_x', status: 'succeeded', content: { video_url: officialCn('x.mp4') } }) })
    })
    await setupChannel(page)
    for (const id of ['videotest-first-frame', 'videotest-last-frame', 'videotest-ref-image', 'videotest-ref-video', 'videotest-ref-audio']) {
      await page.getByTestId(id).locator('input').fill('')
    }
    await selectOnly(page, ['首尾帧', '多模态参考'])
    await page.getByRole('button', { name: '▶ 运行选中' }).click()
    await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 30_000 })

    expect(sent).toHaveLength(0)
    await expect(caseBox(page, '首尾帧')).toContainText('左栏为空')
    await expect(caseBox(page, '多模态参考')).toContainText('左栏为空')
  })

  test('预期不支持的用例被接受后 expired：记请求异常，不算已拒绝', async ({ page }) => {
    await installSizedVideoStub(page, {})
    await page.route(url => String(url).includes('/api/v3/contents/generations/tasks'), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      if (isSubmit(route.request().url())) {
        await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'task_mov' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'task_mov', status: 'expired', error: null }) })
    })
    await setupChannel(page)
    const name = '输出 mov · 480p · 4s'
    await expect(caseBox(page, name).getByText('预期不支持', { exact: true })).toBeVisible()
    await page.getByText(name, { exact: true }).click()
    await caseBox(page, name).getByRole('button', { name: '▶ 运行此用例' }).click()
    await expect(caseBox(page, name).getByText('! 请求异常')).toBeVisible({ timeout: 20_000 })
    await expect(caseBox(page, name).getByText('✓ 已拒绝')).toHaveCount(0)
    await expect(row(page, name, '预期不支持')).toContainText('调度超时')
    await expect(row(page, name, '预期不支持')).toContainText('未通过')
  })

  test('智能时长：网关包一层 data 时仍读到回显并判范围', async ({ page }) => {
    await installSizedVideoStub(page, { 'auto.mp4': [736, 552, 20] })
    await page.route(url => isSubmit(String(url)), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify({ code: 0, data: { id: 'task_auto', status: 'succeeded', content: { video_url: officialCn('auto.mp4') }, ratio: '4:3', duration: 20 } }),
      })
    })
    await setupChannel(page)
    const name = '智能时长 · 480p · 4:3'
    await page.getByText(name, { exact: true }).click()
    await caseBox(page, name).getByRole('button', { name: '▶ 运行此用例' }).click()
    await expect(row(page, name, '回显时长')).toContainText('20')
    await expect(row(page, name, '回显时长')).toContainText('未通过')
    await expect(caseBox(page, name)).not.toContainText('响应未回显 duration')
  })

  test('任务 expired 立即结束轮询并记请求失败', async ({ page }) => {
    await installSizedVideoStub(page, {})
    let polls = 0
    await page.route(url => String(url).includes('/api/v3/contents/generations/tasks'), async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return }
      if (isSubmit(route.request().url())) {
        await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'task_exp' }) })
        return
      }
      polls++
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'task_exp', status: 'expired', error: null }) })
    })
    await setupChannel(page)
    await page.getByText('文生 · 仅必填', { exact: true }).click()
    await caseBox(page, '文生 · 仅必填').getByRole('button', { name: '▶ 运行此用例' }).click()
    await expect(caseBox(page, '文生 · 仅必填').getByText('! 请求失败')).toBeVisible({ timeout: 20_000 })
    await expect(row(page, '文生 · 仅必填', '任务状态')).toContainText('expired')
    await expect(caseBox(page, '文生 · 仅必填')).not.toContainText('轮询超时')
    expect(polls).toBe(1)
  })
})
