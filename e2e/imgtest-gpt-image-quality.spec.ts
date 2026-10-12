import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }
const QUALITY_ENUM = ['low', 'medium', 'high', 'auto', 'xhigh', 'max']

/** 官方形态的 images/generations mock；各开关用来模拟「与官方不一致」的渠道 */
interface Behavior {
  /** 官方会拒绝的 quality 也照样出图 */
  acceptAll?: boolean
  /** 回显的 quality：undefined = 原样回显请求的，字符串 = 固定值（模拟悄悄降档） */
  echoQuality?: string
  /** 不带 usage */
  noUsage?: boolean
  /** 请求透明背景时仍返回整张不透明的 png */
  opaque?: boolean
}

async function addChannel(page: Page) {
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('GPT渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

async function mockImages(page: Page, behavior: Behavior = {}) {
  const seen: any[] = []
  await page.route('**/v1/images/generations', async route => {
    const body = route.request().postDataJSON()
    seen.push(body)
    const q = body.quality == null ? null : String(body.quality)
    const v2 = /^gpt-image-2(?:-\d[\d-]*)?$/.test(body.model)
    const rejected = q != null && (!QUALITY_ENUM.includes(q) || (v2 && (q === 'xhigh' || q === 'max')))
    if (rejected && !behavior.acceptAll) {
      await route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { message: `Invalid value: '${q}'. Supported values are: 'low', 'medium', 'high', and 'auto'.`, type: 'invalid_request_error', param: 'quality', code: 'invalid_value' } }) })
      return
    }
    const [w, h] = String(body.size || '1024x1024').split('x').map(Number)
    const transparent = body.background === 'transparent' && !behavior.opaque
    const b64 = await page.evaluate(({ w, h, transparent }) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#e23b3b'
      if (transparent) {
        // 贴纸：只画中间一个圆，四周保持透明
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(0, 0, w, h)
      }
      return c.toDataURL('image/png').split(',')[1]
    }, { w, h, transparent })
    const res: any = {
      created: 1760000000,
      data: [{ b64_json: b64 }],
      quality: behavior.echoQuality ?? q ?? 'high',
      size: body.size || '1024x1024',
      output_format: body.output_format || 'png',
      background: body.background || 'opaque',
    }
    if (!behavior.noUsage) res.usage = { input_tokens: 20, output_tokens: 4160, total_tokens: 4180 }
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

async function useModel(page: Page, name: string, count: number) {
  const input = page.getByPlaceholder('gpt-image-2')
  await input.fill(name)
  await input.blur()
  await expect(page.locator('[data-case-name]')).toHaveCount(count)
}

const V2_REJECT = ['quality=xhigh（预期不支持）', 'quality=max（预期不支持）']
const V25_ONLY = ['quality=xhigh', 'quality=max', 'background=transparent · png']
const ULTRA = 'quality=ultra（非法值）'

test('gpt-image-2：追加 xhigh / max 负向，官方 4xx 拒绝记通过，渠道接受出图记未通过', async ({ page }) => {
  const behavior: Behavior = {}
  const mock = await mockImages(page, behavior)
  await page.goto('/')
  await addChannel(page)

  // 模型框留空按占位 gpt-image-2 出用例：通用 10 条（含 ultra）+ 2 条负向
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
  for (const name of [...V2_REJECT, ULTRA]) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(1)
  for (const name of V25_ONLY) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(0)
  await expect(page.locator('[data-case-name]').getByText('预期不支持', { exact: true })).toHaveCount(3)

  // xhigh / max 没有内置价格、ultra 是非法值：都不按 medium 估价；low 照常估价
  await expect(page.locator('[data-case-name="quality=low"]').getByText(/\$0\.006/)).toBeVisible()
  for (const name of [...V2_REJECT, ULTRA]) await expect(page.locator(`[data-case-name="${name}"]`).getByText(/\$0\.0/), name).toHaveCount(0)

  for (const name of [...V2_REJECT, ULTRA]) {
    const row = await runOne(page, name)
    await expect(row.getByText('✓ 通过 1/1'), name).toBeVisible()
    await expect(row.getByRole('cell', { name: 'HTTP 400 已拒绝' }), name).toBeVisible()
  }
  expect(mock.seen.map(b => b.quality)).toEqual(['xhigh', 'max', 'ultra'])

  // 渠道不校验参数、照样出图：一律未通过
  behavior.acceptAll = true
  const row = page.locator(`[data-case-name="${V2_REJECT[0]}"]`)
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(row.getByText(/✕/).first()).toBeVisible()
  await expect(row.getByRole('cell', { name: /HTTP 200 已出图（渠道接受了官方不支持的参数）/ })).toBeVisible()

  // 已有的 quality=low 也核对回显与 usage
  const low = await runOne(page, 'quality=low')
  await expect(low.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(low.getByRole('row').filter({ hasText: 'quality 回显' })).toContainText('low')
  await expect(low.getByRole('row').filter({ hasText: '用量字段' })).toContainText('in 20 / out 4160')
})

test('gpt-image-2.5：xhigh / max 出图且回显一致才通过，悄悄降档判未通过；snapshot 归同一家族', async ({ page }) => {
  const behavior: Behavior = {}
  const mock = await mockImages(page, behavior)
  const dialogs: string[] = []
  page.on('dialog', d => { dialogs.push(d.message()); void d.accept() })
  await page.goto('/')
  await addChannel(page)
  await useModel(page, 'gpt-image-2.5-sunburst', 13)
  for (const name of V25_ONLY) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(1)
  for (const name of V2_REJECT) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(0)
  // 只有 ultra 是预期不支持
  await expect(page.locator('[data-case-name]').getByText('预期不支持', { exact: true })).toHaveCount(1)

  for (const q of ['xhigh', 'max']) {
    const row = await runOne(page, `quality=${q}`)
    await expect(row.getByText(/✓ 通过/).first(), q).toBeVisible()
    await expect(row.getByRole('row').filter({ hasText: 'quality 回显' }), q).toContainText(q)
  }
  expect(mock.seen.map(b => [b.model, b.quality])).toEqual([['gpt-image-2.5-sunburst', 'xhigh'], ['gpt-image-2.5-sunburst', 'max']])

  // 渠道收了 xhigh 却按 high 出图：回显露馅
  behavior.echoQuality = 'high'
  const row = page.locator('[data-case-name="quality=xhigh"]')
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(row.getByText(/✕/).first()).toBeVisible()
  const echo = row.getByRole('row').filter({ hasText: 'quality 回显' })
  await expect(echo).toContainText('high')
  await expect(echo).toContainText('未通过')

  // 带前缀的 flare snapshot 与 sunburst 同属 2.5：不重建、不弹窗
  await useModel(page, 'openai/gpt-image-2.5-flare-2026-09-30', 13)
  expect(dialogs).toEqual([])
  await expect(page.locator('[data-case-name="quality=xhigh"]').getByText(/✕/).first()).toBeVisible()

  // 跨到 gpt-image-2：已有结果时失焦弹窗确认，确认后换成 v2 的用例
  await useModel(page, 'gpt-image-2', 12)
  expect(dialogs).toHaveLength(1)
  await expect(page.locator(`[data-case-name="${V2_REJECT[0]}"]`)).toHaveCount(1)
})

test('gpt-image-2.5 透明背景：采样到透明像素才算通过，整张不透明判未通过', async ({ page }) => {
  const behavior: Behavior = {}
  const mock = await mockImages(page, behavior)
  await page.goto('/')
  await addChannel(page)
  await useModel(page, 'gpt-image-2.5-flare', 13)

  const name = 'background=transparent · png'
  const row = await runOne(page, name)
  await expect(row.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(row.getByRole('row').filter({ hasText: '透明背景' }).first()).toContainText('通过')
  expect(mock.seen[0]).toMatchObject({ model: 'gpt-image-2.5-flare', background: 'transparent', output_format: 'png' })

  behavior.opaque = true
  await row.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(row.getByText(/✕/).first()).toBeVisible()
  const alpha = row.getByRole('row').filter({ hasText: /^透明背景/ })
  await expect(alpha).toContainText('0%')
  await expect(alpha).toContainText('未通过')
})

test('gpt-image 响应缺 usage 判未通过', async ({ page }) => {
  await mockImages(page, { noUsage: true })
  await page.goto('/')
  await addChannel(page)
  const row = await runOne(page, '方形 1024×1024')
  await expect(row.getByText(/✕/).first()).toBeVisible()
  const usage = row.getByRole('row').filter({ hasText: '用量字段' })
  await expect(usage).toContainText('无 usage')
  await expect(usage).toContainText('未通过')
})
