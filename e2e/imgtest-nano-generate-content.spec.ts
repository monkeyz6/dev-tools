import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }
const MODEL = 'gemini-nano-banana-2.1'
const TIER_BASE: Record<string, number> = { '1K': 1024, '2K': 2048, '4K': 4096 }
const GC_NAMES = [
  '默认参数 · 仅 contents',
  '2K · 16:9 · imageConfig',
  '2K · 9:16 · imageConfig',
  '4K · 21:9 · imageConfig',
  '参考图 · 单图 JPEG · 1K 1:1 · imageConfig',
  '参考图 · 三图 PNG · 2K 5:4 · imageConfig',
  'thinkingLevel=minimal · 1K 1:1',
  'google_search · 1K 16:9',
]

async function addChannel(page: Page) {
  await page.getByText('图片接口测试').click()
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('Nano-GC渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

async function pickGemini(page: Page) {
  await page.getByRole('button', { name: /OpenAI images/ }).click()
  await page.getByText('Gemini generateContent').click()
}

function sizeFor(tier: string, ratio: string): [number, number] {
  const [rw, rh] = ratio.split(':').map(Number)
  const eq = TIER_BASE[tier] * 0.9
  return [Math.round(eq * Math.sqrt(rw / rh)), Math.round(eq / Math.sqrt(rw / rh))]
}

async function imageBase64(page: Page, w: number, h: number) {
  return page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#2266cc'
    ctx.fillRect(0, 0, w, h)
    return c.toDataURL('image/png').split(',')[1]
  }, { w, h })
}

test('Nano Banana 2.1 可在 Interactions 与 generateContent 之间切换', async ({ page }) => {
  test.setTimeout(180_000)
  const dialogs: string[] = []
  page.on('dialog', d => { dialogs.push(d.message()); void d.accept() })

  await page.goto('/')
  await addChannel(page)
  await pickGemini(page)

  const input = page.getByPlaceholder('gemini-3-pro-image')
  await input.fill(MODEL)
  await input.blur()
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
  await expect(page.getByText('此模型按官方 Interactions 发送：POST /v1beta/interactions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Interactions', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'generateContent', exact: true })).toBeVisible()

  // 还没跑过：换成通用 Gemini 不该弹确认，开关也应消失
  await input.fill('gemini-3-pro-image')
  await input.blur()
  await expect(page.getByRole('button', { name: 'Interactions', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'generateContent', exact: true })).toHaveCount(0)
  await expect(page.getByText('512 + 1:1（仅 flash）')).toBeVisible()
  expect(dialogs).toEqual([])

  await input.fill(MODEL)
  await input.blur()
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
  await expect(page.getByText('此模型按官方 Interactions 发送：POST /v1beta/interactions')).toBeVisible()
  expect(dialogs).toEqual([])

  await page.getByRole('button', { name: 'generateContent', exact: true }).click()
  await expect(page.locator('[data-case-name]')).toHaveCount(GC_NAMES.length)
  for (const name of GC_NAMES) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(1)
  await expect(page.locator('[data-case-name="2K · 9:16"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="4K · 21:9"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="512 · 1:1"]')).toHaveCount(0)
  await expect(page.getByText(`此模型按 generateContent 发送：POST /v1/models/${MODEL}:generateContent`)).toBeVisible()
  await expect(page.locator('[data-case-name="4K · 21:9 · imageConfig"]').getByText(/\$0\.113/)).toBeVisible()
  await expect(page.locator('[data-case-name="参考图 · 三图 PNG · 2K 5:4 · imageConfig"]').getByText(/\$0\.055/)).toBeVisible()
  expect(dialogs).toEqual([])

  const needed = new Map<string, [number, number]>([
    ['1K 1:1', sizeFor('1K', '1:1')],
    ['1K 16:9', sizeFor('1K', '16:9')],
    ['2K 16:9', sizeFor('2K', '16:9')],
    ['2K 9:16', sizeFor('2K', '9:16')],
    ['2K 5:4', sizeFor('2K', '5:4')],
    ['4K 21:9', sizeFor('4K', '21:9')],
    ['thought', [8, 8]],
  ])
  const pngs = new Map<string, string>()
  for (const [key, [w, h]] of needed) pngs.set(key, await imageBase64(page, w, h))

  const seen: { url: string; headers: Record<string, string>; body: any }[] = []
  let grounded = false
  await page.route(`**/v1/models/${MODEL}:generateContent`, async route => {
    const body = route.request().postDataJSON()
    seen.push({ url: route.request().url(), headers: await route.request().allHeaders(), body })
    const ic = body.generationConfig?.imageConfig || {}
    const key = ic.imageSize && ic.aspectRatio ? `${ic.imageSize} ${ic.aspectRatio}` : '1K 1:1'
    const data = pngs.get(key) || pngs.get('1K 1:1')!
    const candidate: any = {
      content: {
        parts: [
          { thought: true, inlineData: { mimeType: 'image/png', data: pngs.get('thought') } },
          { inlineData: { mimeType: 'image/png', data } },
        ],
      },
    }
    if (grounded && Array.isArray(body.tools)) candidate.groundingMetadata = { webSearchQueries: ['san francisco weather'] }
    const res: any = { candidates: [candidate] }
    const tier = ic.imageSize
    if (tier === '4K') res.usageMetadata = { candidatesTokenCount: 9999, candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 8 }, { modality: 'IMAGE', tokenCount: 2520 }] }
    else if (body.generationConfig) res.usageMetadata = { candidatesTokenCount: 9999, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }] }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(res) })
  })

  await page.getByRole('button', { name: '▶ 全部运行' }).click()
  await expect(page.getByText('批量测试结束')).toBeVisible({ timeout: 150_000 })

  const row = (name: string) => page.locator(`[data-case-name="${name}"]`)
  await expect(row('默认参数 · 仅 contents').getByText('✓ 通过 3/3')).toBeVisible()
  await expect(row('2K · 16:9 · imageConfig').getByText('✓ 通过 5/5')).toBeVisible()
  await expect(row('2K · 9:16 · imageConfig').getByText(/✓ 通过/)).toBeVisible()
  await expect(row('4K · 21:9 · imageConfig').getByText(/✓ 通过/)).toBeVisible()
  await expect(row('参考图 · 单图 JPEG · 1K 1:1 · imageConfig').getByText(/✓ 通过/)).toBeVisible()
  await expect(row('参考图 · 三图 PNG · 2K 5:4 · imageConfig').getByText(/✓ 通过/)).toBeVisible()
  await expect(row('thinkingLevel=minimal · 1K 1:1').getByText(/✓ 通过/)).toBeVisible()
  await expect(row('google_search · 1K 16:9').getByText('✕ 5/6 通过')).toBeVisible()

  await row('默认参数 · 仅 contents').click()
  await expect(row('默认参数 · 仅 contents').getByText('无 usage')).toBeVisible()
  await expect(row('默认参数 · 仅 contents').locator('span', { hasText: '返回张数' })).toContainText('1')
  await row('4K · 21:9 · imageConfig').click()
  await expect(row('4K · 21:9 · imageConfig').getByText('2520 token')).toBeVisible()
  await expect(row('4K · 21:9 · imageConfig').getByText('模型指纹')).toHaveCount(0)
  await expect(row('google_search · 1K 16:9').getByText('联网搜索', { exact: true })).toBeVisible()
  await expect(row('google_search · 1K 16:9').getByText('未通过').first()).toBeVisible()

  expect(seen).toHaveLength(8)
  expect(seen[0].url).toContain(`/v1/models/${MODEL}:generateContent`)
  expect(seen[0].headers['x-goog-api-key']).toBe('sk-test-1234567890')
  const bodies = seen.map(s => s.body)
  const rawOf = (b: any) => JSON.stringify(b)
  for (const b of bodies) {
    expect(rawOf(b)).not.toContain('responseFormat')
    expect(rawOf(b)).not.toContain('response_format')
    expect(rawOf(b)).not.toContain('previous_interaction_id')
    expect(b.contents[0].role).toBeUndefined()
  }
  const def = bodies.find((b: any) => !b.generationConfig && !b.tools)
  expect(def.contents).toEqual([{ parts: [{ text: '一只在月球上喝咖啡的猫，电影质感' }] }])
  const wide = bodies.find((b: any) => b.generationConfig?.imageConfig?.imageSize === '2K' && b.generationConfig?.imageConfig?.aspectRatio === '16:9' && !b.tools)
  expect(wide.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE'])
  expect(wide.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' })
  const think = bodies.find((b: any) => b.generationConfig?.thinkingConfig)
  expect(think.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' })
  expect(think.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE'])
  expect(think.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '1K' })
  const searchBodies = bodies.filter((b: any) => Array.isArray(b.tools))
  expect(searchBodies).toHaveLength(1)
  expect(searchBodies[0].tools).toEqual([{ google_search: {} }])
  expect(searchBodies[0].generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '1K' })
  const single = bodies.find((b: any) => (b.contents?.[0]?.parts || []).filter((p: any) => p.inline_data?.mime_type === 'image/jpeg').length === 1)
  expect(single.contents[0].parts.find((p: any) => p.inline_data).inline_data.data.length).toBeGreaterThan(20)
  const three = bodies.find((b: any) => (b.contents?.[0]?.parts || []).filter((p: any) => p.inline_data).length === 3)
  expect(three.contents[0].parts.filter((p: any) => p.inline_data).every((p: any) => p.inline_data.mime_type === 'image/png')).toBe(true)

  grounded = true
  const searchRow = row('google_search · 1K 16:9')
  const rerun = searchRow.getByRole('button', { name: '▶ 运行此用例' })
  if (!(await rerun.isVisible())) await searchRow.locator('span', { hasText: 'google_search · 1K 16:9' }).click()
  await rerun.click()
  await expect(searchRow.getByText('✓ 通过 6/6')).toBeVisible()
  expect(seen).toHaveLength(9)

  await page.getByRole('button', { name: /^历史记录/ }).click()
  await expect(page.getByText('Gemini · generateContent')).toBeVisible()
  await expect(page.getByText('通过 8/8')).toBeVisible()
  await page.getByRole('button', { name: '↺ 还原到工作台' }).click()
  await expect(page.getByTestId('imgtest-restored-note')).toBeVisible()
  await expect(page.locator('[data-case-name]')).toHaveCount(8)
  await expect(page.getByText(`此模型按 generateContent 发送：POST /v1/models/${MODEL}:generateContent`)).toBeVisible()
  await expect(searchRow.getByText(/✓ 通过/)).toBeVisible()

  await page.getByRole('button', { name: 'Interactions', exact: true }).click()
  await expect(page.locator('[data-case-name]')).toHaveCount(12)
  await expect(page.getByText('此模型按官方 Interactions 发送：POST /v1beta/interactions')).toBeVisible()
  await expect(page.getByTestId('imgtest-restored-note')).toHaveCount(0)
  await expect(page.getByText(/✓ 通过/)).toHaveCount(0)
  expect(dialogs).toHaveLength(2)
  expect(dialogs[0]).toContain('当前批量测试页已有结果')
  expect(dialogs[1]).toContain('切换端点会更换用例列表')
})
