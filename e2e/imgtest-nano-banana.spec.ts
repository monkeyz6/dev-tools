import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }
const MODEL = 'gemini-nano-banana-2.1'
const TIER_TOKENS: Record<string, number> = { '1K': 1120, '2K': 1680, '4K': 3780 }
const TIER_BASE: Record<string, number> = { '1K': 1024, '2K': 2048, '4K': 4096 }

const CASE_NAMES = [
  '默认参数 · 纯文本', '1K · 1:1 · PNG', '2K · 16:9 · JPEG', '2K · 9:16 · PNG', '4K · 21:9 · PNG',
  '输出 WebP（预期不支持）', '512px（预期不支持）', '参考图 · 单图 JPEG · 1K 1:1', '参考图 · 三图 PNG · 2K 5:4',
  '多轮编辑 · 1K 1:1', 'thinking_level=minimal · 1K 1:1', 'google_search · 1K 16:9 · JPEG',
]

async function addChannel(page: Page) {
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('Nano渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

async function useNanoCases(page: Page, name = MODEL) {
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('Gemini generateContent').click()
  const input = page.getByPlaceholder('gemini-3-pro-image')
  await input.fill(name)
  await input.blur()
  await expect(page.locator('[data-case-name]')).toHaveCount(CASE_NAMES.length)
}

async function imageBase64(page: Page, mime: string, w: number, h: number) {
  return page.evaluate(({ mime, w, h }) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#2266cc'
    ctx.fillRect(0, 0, w, h)
    return c.toDataURL(mime).split(',')[1]
  }, { mime, w, h })
}

/** 官方形态的 Interactions mock；各开关用来模拟「与官方不一致」的渠道 */
interface Behavior {
  /** 响应里回显的模型，默认原样回显请求的 */
  model?: string
  /** 图片输出 token：数字 = 固定值，null = 不带 usage，undefined = 按档位 */
  tokens?: number | null
  /** 不返回 google_search_call 步骤 */
  noSearchStep?: boolean
  /** 官方不支持的 webp / 512px 也照样出图（渠道不一致） */
  acceptUnsupported?: boolean
  /** 返回的字节固定是 png，标签仍写请求的 mime_type */
  lieAboutMime?: boolean
}

async function mockInteractions(page: Page, behavior: Behavior = {}) {
  const seen: { body: any; issuedId: string }[] = []
  let seq = 0
  await page.route('**/v1beta/interactions', async route => {
    const body = route.request().postDataJSON()
    const rf = body.response_format || {}
    const wantMime: string = rf.mime_type || 'image/png'
    const unsupported = rf.image_size === '512px' || wantMime === 'image/webp'
    if (unsupported && !behavior.acceptUnsupported) {
      seen.push({ body, issuedId: '' })
      await route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { message: 'unsupported parameter' } }) })
      return
    }
    // 等效边长取档位的 0.9：满足档位下限，又不用真画 4K 大图
    const tier: string = TIER_BASE[rf.image_size] ? rf.image_size : '1K'
    const [rw, rh] = String(rf.aspect_ratio || '1:1').split(':').map(Number)
    const eq = TIER_BASE[tier] * 0.9
    const w = Math.round(eq * Math.sqrt(rw / rh))
    const h = Math.round(eq / Math.sqrt(rw / rh))
    const realMime = behavior.lieAboutMime || wantMime === 'image/webp' ? 'image/png' : wantMime
    const data = await imageBase64(page, realMime, w, h)
    const id = `int-${++seq}`
    seen.push({ body, issuedId: id })
    const steps: any[] = [{ type: 'user_input', content: [{ type: 'image', mime_type: 'image/png', data: 'cmVm' }] }]
    if (body.tools && !behavior.noSearchStep) steps.push({ type: 'google_search_call' }, { type: 'google_search_result' })
    steps.push({ type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'image', mime_type: wantMime, data }] })
    const res: any = { id, status: 'completed', model: behavior.model ?? body.model, steps }
    if (behavior.tokens !== null) {
      res.usage = { output_tokens_by_modality: [{ modality: 'image', tokens: behavior.tokens ?? TIER_TOKENS[tier] }] }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(res) })
  })
  return { seen }
}

async function runOne(page: Page, name: string) {
  const row = page.locator(`[data-case-name="${name}"]`)
  await row.click()
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  return row
}

test('Nano Banana 2.1：价格含输入图，换模型名按失焦切换专属用例', async ({ page }) => {
  await page.goto('/')
  await addChannel(page)

  await page.getByRole('button', { name: '价格配置' }).click()
  await expect(page.getByRole('cell', { name: MODEL, exact: true })).toHaveCount(4)
  for (const v of ['0.0336', '0.0504', '0.113', '0.00168']) await expect(page.locator(`input[value="${v}"]`)).toHaveCount(1)
  await page.getByRole('button', { name: '批量测试', exact: true }).click()

  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('Gemini generateContent').click()
  await expect(page.getByText('512 + 1:1（仅 flash）')).toBeVisible()

  // 逐字输入不弹窗也不重建；带前缀、大小写不同的名字照样走 Interactions
  const dialogs: string[] = []
  page.on('dialog', d => { dialogs.push(d.message()); void d.dismiss() })
  const input = page.getByPlaceholder('gemini-3-pro-image')
  await input.click()
  await input.pressSequentially('google/Gemini-Nano-Banana-2.1', { delay: 5 })
  await expect(page.getByText('512 + 1:1（仅 flash）')).toBeVisible()
  expect(dialogs).toEqual([])
  await input.blur()
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
  await expect(page.getByText('此模型按官方 Interactions 发送：POST /v1beta/interactions')).toBeVisible()
  // nano 只用专属用例：通用 gemini 用例不再出现，参考图只有 2 条，预期不支持 2 条
  await expect(page.getByText('512 + 1:1（仅 flash）')).toHaveCount(0)
  for (const name of CASE_NAMES) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(1)
  await expect(page.locator('[data-case-name]').getByText('参考图', { exact: true })).toHaveCount(2)
  await expect(page.locator('[data-case-name]').getByText('预期不支持', { exact: true })).toHaveCount(2)

  // 估价：三图 = 2K 输出 0.0504 + 3 张输入图 × 0.00168；多轮 = 2 张 1K 输出 0.0672
  await expect(page.locator('[data-case-name="参考图 · 三图 PNG · 2K 5:4"]').getByText(/\$0\.055/)).toBeVisible()
  await expect(page.locator('[data-case-name="多轮编辑 · 1K 1:1"]').getByText(/\$0\.067/)).toBeVisible()

  // 已有结果时跨 nano 边界：失焦才弹窗，取消后模型名恢复、用例不动
  const mock = await mockInteractions(page)
  const first = await runOne(page, '1K · 1:1 · PNG')
  await expect(first.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen).toHaveLength(1)
  await input.fill('gemini-3-pro-image-preview')
  await input.blur()
  await expect.poll(() => dialogs.length).toBe(1)
  await expect(input).toHaveValue('google/Gemini-Nano-Banana-2.1')
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
})

test('Nano Banana 2.1：官方形态下 12 条用例全部按预期通过，参数原样透传', async ({ page }) => {
  test.setTimeout(180_000)
  const mock = await mockInteractions(page)
  await page.goto('/')
  await addChannel(page)
  await useNanoCases(page)

  await page.getByRole('button', { name: '▶ 全部运行' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 150_000 })
  for (const name of CASE_NAMES) {
    await expect(page.locator(`[data-case-name="${name}"]`).getByText(/✓ 通过/).first(), name).toBeVisible()
  }
  // 12 条用例，其中多轮编辑发 2 次
  expect(mock.seen).toHaveLength(13)
  const rfOf = (b: any) => b.response_format
  const find = (pred: (b: any) => boolean) => mock.seen.map(s => s.body).filter(pred)

  const def = find(b => typeof b.input === 'string' && !b.response_format && !b.previous_interaction_id && !b.generation_config && !b.tools)
  expect(def).toHaveLength(1)
  expect(def[0].model).toBe(MODEL)

  expect(find(b => rfOf(b)?.image_size === '1K' && rfOf(b)?.aspect_ratio === '1:1' && rfOf(b)?.mime_type === 'image/png' && Array.isArray(b.input) && !b.generation_config && !b.store)).toHaveLength(1)
  expect(find(b => rfOf(b)?.image_size === '2K' && rfOf(b)?.aspect_ratio === '16:9' && rfOf(b)?.mime_type === 'image/jpeg')).toHaveLength(1)
  expect(find(b => rfOf(b)?.image_size === '2K' && rfOf(b)?.aspect_ratio === '9:16')).toHaveLength(1)
  expect(find(b => rfOf(b)?.image_size === '4K' && rfOf(b)?.aspect_ratio === '21:9')).toHaveLength(1)
  expect(find(b => rfOf(b)?.mime_type === 'image/webp')).toHaveLength(1)
  expect(find(b => rfOf(b)?.image_size === '512px')).toHaveLength(1)

  // 参考图：单图 jpeg、三图 png，字节非空；只有这 2 条带参考图
  const single = find(b => Array.isArray(b.input) && b.input.some((p: any) => p.type === 'image' && p.mime_type === 'image/jpeg'))
  expect(single).toHaveLength(1)
  expect(single[0].input.filter((p: any) => p.type === 'image')).toHaveLength(1)
  expect(single[0].input.find((p: any) => p.type === 'image').data.length).toBeGreaterThan(20)
  const three = find(b => Array.isArray(b.input) && b.input.filter((p: any) => p.type === 'image').length === 3)
  expect(three).toHaveLength(1)
  expect(three[0].input.every((p: any) => p.type !== 'image' || p.mime_type === 'image/png')).toBe(true)
  expect(find(b => Array.isArray(b.input) && b.input.some((p: any) => p.type === 'image'))).toHaveLength(2)

  // 多轮：第一轮 store=true，第二轮只带编辑指令和第一轮返回的 id
  const turn1 = mock.seen.find(s => s.body.store === true)!
  const turn2 = mock.seen.find(s => s.body.previous_interaction_id)!
  expect(turn1.body.previous_interaction_id).toBeUndefined()
  expect(typeof turn2.body.input).toBe('string')
  expect(turn2.body.previous_interaction_id).toBe(turn1.issuedId)
  expect(turn2.body.response_format).toEqual(turn1.body.response_format)

  expect(find(b => b.generation_config?.thinking_level === 'minimal')).toHaveLength(1)
  const search = find(b => Array.isArray(b.tools))
  expect(search).toHaveLength(1)
  expect(search[0].tools).toEqual([{ type: 'google_search' }])

  // 通过的用例都带上「响应结构 / 模型回显 / 图片输出 token」三项
  const row = page.locator('[data-case-name="2K · 16:9 · JPEG"]')
  for (const name of ['响应结构', '模型回显', '图片输出 token']) await expect(row.getByText(name, { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="google_search · 1K 16:9 · JPEG"]').getByText('联网搜索', { exact: true })).toBeVisible()
  await expect(page.locator('[data-case-name="多轮编辑 · 1K 1:1"]').getByText('多轮编辑', { exact: true })).toBeVisible()
})

test('Nano Banana 2.1：偷换模型、token 对不上、缺 usage、没有搜索步骤都会被抓住', async ({ page }) => {
  const behavior: Behavior = {}
  await mockInteractions(page, behavior)
  await page.goto('/')
  await addChannel(page)
  await useNanoCases(page)

  // 回显成更便宜的模型，且按 1K 的 token 计量：2K 请求对不上
  Object.assign(behavior, { model: 'gemini-3.1-flash-image', tokens: 1120 })
  const row = await runOne(page, '2K · 16:9 · JPEG')
  await expect(row.getByText(/✕/).first()).toBeVisible()
  await expect(row.getByText('gemini-3.1-flash-image').first()).toBeVisible()
  await expect(row.getByText('1680').first()).toBeVisible()

  // 缺 usage
  Object.assign(behavior, { model: undefined, tokens: null })
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(row.getByText('usage 缺失或没有 image 模态')).toBeVisible()
  await expect(row.getByText(/✕/).first()).toBeVisible()

  // 恢复官方形态后通过
  Object.assign(behavior, { tokens: undefined })
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(row.getByText(/✓ 通过/).first()).toBeVisible()

  // google_search 没有搜索步骤
  Object.assign(behavior, { noSearchStep: true })
  const search = await runOne(page, 'google_search · 1K 16:9 · JPEG')
  await expect(search.getByText(/✕/).first()).toBeVisible()
  await expect(search.getByText('0 个')).toBeVisible()
})

test('Nano Banana 2.1：预期不支持的参数，渠道接受并出图判未通过；字节与标签不符写出两边', async ({ page }) => {
  const behavior: Behavior = { acceptUnsupported: true }
  await mockInteractions(page, behavior)
  await page.goto('/')
  await addChannel(page)
  await useNanoCases(page)

  // 512px：官方不支持，渠道却出了图
  const p512 = await runOne(page, '512px（预期不支持）')
  await expect(p512.getByText(/✕/).first()).toBeVisible()
  await expect(p512.getByRole('cell', { name: /HTTP 200 已出图（渠道接受了官方不支持的参数）/ })).toBeVisible()

  // webp：渠道静默回成 png → 未通过
  const webp = await runOne(page, '输出 WebP（预期不支持）')
  await expect(webp.getByText(/✕/).first()).toBeVisible()
  await expect(webp.getByText('png（标签 webp）')).toBeVisible()

  // 被 4xx 拒绝才算通过
  Object.assign(behavior, { acceptUnsupported: false })
  await webp.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(webp.getByText('✓ 通过 1/1')).toBeVisible()
  await p512.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(p512.getByText('✓ 通过 1/1')).toBeVisible()

  // JPEG 标签 + png 字节
  Object.assign(behavior, { lieAboutMime: true })
  const jpeg = await runOne(page, '2K · 16:9 · JPEG')
  await expect(jpeg.getByText(/✕/).first()).toBeVisible()
  await expect(jpeg.getByText('png（标签 jpeg）')).toBeVisible()
})

test('Nano Banana 2.1：多轮编辑第一轮失败时记失败并说明原因', async ({ page }) => {
  let calls = 0
  await page.route('**/v1beta/interactions', async route => {
    calls++
    await route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { message: 'store not supported' } }) })
  })
  await page.goto('/')
  await addChannel(page)
  await useNanoCases(page)
  const row = await runOne(page, '多轮编辑 · 1K 1:1')
  await expect(row.getByText(/第一轮失败（HTTP 400）：store not supported/)).toBeVisible()
  expect(calls).toBe(1)
})
