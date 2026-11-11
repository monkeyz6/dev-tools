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
  /** 固定回显的 complexity。null 表示响应里不带这个字段 */
  echoComplexity?: string | null
  /** SVG 请求返回普通文本，而不是 SVG 文档 */
  svgPlainText?: boolean
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
    const frameCount = Number(body.frame_count)
    const frames = Number.isInteger(frameCount) && frameCount > 0 ? frameCount : 1
    const b64 = body.output_format === 'gif'
      ? Buffer.from(solidGif(w, h, 226, 59, 59, frames)).toString('base64')
      : body.output_format === 'svg'
        ? Buffer.from(behavior.svgPlainText ? 'not an svg' : `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="40" fill="#e23b3b"/></svg>`).toString('base64')
        : await page.evaluate(({ w, h, transparent }) => {
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
    if (behavior.echoComplexity === null) { /* 响应不带回显 */ }
    else if (behavior.echoComplexity !== undefined) res.complexity = behavior.echoComplexity
    else if (typeof body.complexity === 'string' && body.complexity) res.complexity = body.complexity
    else res.complexity = 'high'
    if (!behavior.noUsage) res.usage = { input_tokens: 20, output_tokens: 4160, total_tokens: 4180 }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(res) })
  })
  await page.route('**/v1/images/edits', async route => {
    const raw = route.request().postData() || ''
    const buf = route.request().postDataBuffer()
    const pngSize = (name: string) => {
      const at = buf.indexOf(Buffer.from(`name="${name}"`))
      if (at < 0) return null
      const sig = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]), at)
      if (sig < 0 || sig + 24 > buf.length) return null
      return { w: buf.readUInt32BE(sig + 16), h: buf.readUInt32BE(sig + 20) }
    }
    const size = /name="size"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] || '1024x1024'
    const model = /name="model"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1]
    seen.push({
      _multipart: true,
      model,
      size,
      prompt: /name="prompt"\r?\n\r?\n([^\r\n]*)/.exec(raw)?.[1],
      markup: raw.includes('name="markup"'),
      mask: /name="mask"/.test(raw),
      image: raw.includes('name="image[]"'),
      imageSize: pngSize('image[]'),
      markupSize: pngSize('markup'),
      hasSize: /name="size"/.test(raw),
    })
    const [w, h] = size.split('x').map(Number)
    const b64 = await page.evaluate(({ w, h }) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#e23b3b'
      ctx.fillRect(0, 0, w, h)
      return c.toDataURL('image/png').split(',')[1]
    }, { w, h })
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({
        created: 1760000000,
        data: [{ b64_json: b64 }],
        size,
        usage: { input_tokens: 20, output_tokens: 4160, total_tokens: 4180 },
      }),
    })
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

function u16(n: number) {
  return [n & 255, (n >> 8) & 255]
}

/** 纯色 GIF89a。2 色全局表，像素全是 0 号色。frames 帧各带图形控制扩展，前面有 Netscape 循环扩展。 */
function solidGif(width: number, height: number, r: number, g: number, b: number, frames = 1) {
  const minCodeSize = 2
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const dict = new Map<string, number>()
  const bytes: number[] = []
  let bitBuf = 0
  let bitCount = 0
  const write = (code: number) => {
    bitBuf |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      bytes.push(bitBuf & 255)
      bitBuf >>= 8
      bitCount -= 8
    }
  }
  const reset = () => {
    dict.clear()
    codeSize = minCodeSize + 1
    nextCode = eoiCode + 1
    write(clearCode)
  }
  reset()
  const n = width * height
  let prefix = 0
  for (let i = 1; i < n; i++) {
    const key = prefix + ':0'
    const found = dict.get(key)
    if (found !== undefined) { prefix = found; continue }
    write(prefix)
    if (nextCode < 4096) {
      dict.set(key, nextCode)
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++
      nextCode++
    } else reset()
    prefix = 0
  }
  if (n > 0) write(prefix)
  write(eoiCode)
  if (bitCount) bytes.push(bitBuf & 255)
  const blocks = [minCodeSize]
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255)
    blocks.push(chunk.length, ...chunk)
  }
  blocks.push(0)
  const count = frames > 0 ? frames : 1
  const parts: number[][] = [[
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    ...u16(width), ...u16(height),
    0x80, 0x00, 0x00,
    r, g, b, 0, 0, 0,
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00,
  ]]
  const gce = [0x21, 0xf9, 0x04, 0x00, 20, 0x00, 0x00, 0x00]
  const descriptor = [0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0x00]
  for (let i = 0; i < count; i++) parts.push(gce, descriptor, blocks)
  parts.push([0x3b])
  return Uint8Array.from(parts.flat())
}

const V26_EXTRA = ['complexity=low', 'complexity=medium', 'complexity 默认不写', 'output_format=gif', 'frame_count=2', 'output_format=svg', 'markup 标注']

test('gpt-image-2.6：对齐 2.5 档位，并核对 complexity / GIF / SVG', async ({ page }) => {
  const behavior: Behavior = {}
  const mock = await mockImages(page, behavior)
  const dialogs: string[] = []
  page.on('dialog', d => { dialogs.push(d.message()); void d.accept() })
  await page.goto('/')
  await addChannel(page)
  await useModel(page, 'gpt-image-2.6-flare', 20)
  for (const name of [...V25_ONLY, ...V26_EXTRA]) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(1)
  for (const name of V2_REJECT) await expect(page.locator(`[data-case-name="${name}"]`)).toHaveCount(0)
  await expect(page.locator('[data-case-name]').getByText('预期不支持', { exact: true })).toHaveCount(1)

  // low 823 tokens ≈ $0.0247，界面显示三位小数；max 仍按 7024 tokens
  await expect(page.locator('[data-case-name="quality=low"]').getByText(/\$0\.025/)).toBeVisible()
  await expect(page.locator('[data-case-name="quality=max"]').getByText(/\$0\.211/)).toBeVisible()
  await expect(page.locator('[data-case-name="quality=ultra（非法值）"]').getByText(/\$0\./)).toHaveCount(0)

  const low = await runOne(page, 'complexity=low')
  await expect(low.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(low.getByRole('row').filter({ hasText: 'complexity 回显' })).toContainText('low')
  expect(mock.seen.at(-1)).toMatchObject({ model: 'gpt-image-2.6-flare', complexity: 'low' })

  const medium = await runOne(page, 'complexity=medium')
  await expect(medium.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(medium.getByRole('row').filter({ hasText: 'complexity 回显' })).toContainText('medium')
  expect(mock.seen.at(-1)).toMatchObject({ model: 'gpt-image-2.6-flare', complexity: 'medium' })

  const omitted = await runOne(page, 'complexity 默认不写')
  await expect(omitted.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(omitted.getByRole('row').filter({ hasText: 'complexity 回显' })).toContainText('high')
  expect(mock.seen.at(-1).complexity).toBeUndefined()
  expect(mock.seen.at(-1).complexityDefault).toBeUndefined()

  behavior.echoComplexity = 'medium'
  await omitted.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(omitted.getByText(/✕/).first()).toBeVisible()
  await expect(omitted.getByRole('row').filter({ hasText: 'complexity 回显' })).toContainText('未通过')
  behavior.echoComplexity = undefined

  const frames2 = await runOne(page, 'frame_count=2')
  await expect(frames2.getByText(/✓ 通过/).first()).toBeVisible()
  const frame2Row = frames2.getByRole('row').filter({ hasText: 'GIF 帧数' })
  await expect(frame2Row).toContainText('2')
  await expect(frame2Row).toContainText('通过')
  expect(mock.seen.at(-1)).toMatchObject({ output_format: 'gif', frame_count: 2, size: '512x512' })
  expect(mock.seen.at(-1).frame_duration_ms).toBeUndefined()

  const gif = await runOne(page, 'output_format=gif')
  await expect(gif.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(gif.getByRole('row').filter({ hasText: '输出格式' })).toContainText('gif')
  await expect(gif.getByRole('row').filter({ hasText: '精确尺寸' })).toContainText('512×512')
  const frameRow = gif.getByRole('row').filter({ hasText: 'GIF 帧数' })
  await expect(frameRow).toContainText('9')
  await expect(frameRow).toContainText('通过')
  expect(mock.seen.at(-1)).toMatchObject({
    output_format: 'gif', n: 1, size: '512x512', quality: 'high', frame_count: 9, frame_duration_ms: 200,
  })
  expect(String(mock.seen.at(-1).prompt)).toContain('paper lantern')
  expect(mock.seen.at(-1).complexity).toBeUndefined()

  const svg = await runOne(page, 'output_format=svg')
  await expect(svg.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(svg.getByRole('row').filter({ hasText: '输出格式' })).toContainText('svg')
  await expect(svg.getByRole('row').filter({ hasText: '精确尺寸' })).toHaveCount(0)
  await expect(svg.getByRole('row').filter({ hasText: '透明背景' })).toHaveCount(0)
  expect(mock.seen.at(-1)).toMatchObject({
    model: 'gpt-image-2.6-flare',
    prompt: 'A simple flat vector logo of a wheat sheaf and flour bag, clean lines, two solid colors, no text, transparent background',
    output_format: 'svg',
    n: 1,
    size: '1024x1024',
    quality: 'medium',
    background: 'transparent',
    svg: { model: 'gpt-6.1-terra' },
  })
  expect(mock.seen.at(-1).svg.reasoning).toBeUndefined()

  behavior.svgPlainText = true
  await svg.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(svg.getByText(/✕/).first()).toBeVisible()
  await expect(svg.getByRole('row').filter({ hasText: '输出格式' })).toContainText('未通过')
  behavior.svgPlainText = false

  const markup = await runOne(page, 'markup 标注')
  await expect(markup.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen.at(-1)).toMatchObject({
    _multipart: true, model: 'gpt-image-2.6-flare', size: '1024x1024', markup: true, image: true, mask: false,
    imageSize: { w: 1024, h: 1024 }, markupSize: { w: 1024, h: 1024 },
  })

  // 改预览里的提示词不能丢掉 markup 文件；删掉 _markup 则不再附
  const preview = markup.locator('textarea')
  const original = await preview.inputValue()
  expect(original).toContain('"_markup": true')
  const edited = original.replace(
    'Change only the marked region.',
    'Change only the marked region. Keep the rest.',
  )
  expect(edited).not.toBe(original)
  await preview.fill(edited)
  await markup.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(markup.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen.at(-1)).toMatchObject({
    _multipart: true, size: '1024x1024', markup: true, image: true, mask: false,
  })
  expect(String(mock.seen.at(-1).prompt)).toContain('Keep the rest.')
  const dropped = edited.replace(/,\n  "_markup": true/, '')
  expect(dropped).not.toContain('"_markup"')
  await preview.fill(dropped)
  await markup.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(markup.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen.at(-1)).toMatchObject({ _multipart: true, markup: false, image: true, mask: false })
  expect(String(mock.seen.at(-1).prompt)).toContain('Keep the rest.')

  const sized = original.replace('1024x1024', '512x512')
  expect(sized).not.toBe(original)
  await preview.fill(sized)
  await markup.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(markup.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen.at(-1)).toMatchObject({
    _multipart: true, size: '512x512', markup: true,
    imageSize: { w: 512, h: 512 }, markupSize: { w: 512, h: 512 },
  })

  const noSize = original.replace(/\n +"size": "1024x1024",/, '\n')
  expect(noSize).not.toContain('"size"')
  await preview.fill(noSize)
  await markup.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(markup.getByText(/✓ 通过/).first()).toBeVisible()
  expect(mock.seen.at(-1)).toMatchObject({
    _multipart: true, markup: true, hasSize: false,
    imageSize: { w: 1024, h: 1024 }, markupSize: { w: 1024, h: 1024 },
  })

  const xhigh = await runOne(page, 'quality=xhigh')
  await expect(xhigh.getByText(/✓ 通过/).first()).toBeVisible()
  await expect(xhigh.getByRole('row').filter({ hasText: 'quality 回显' })).toContainText('xhigh')

  // 同家族 snapshot 不重建、不弹窗
  await useModel(page, 'openai/gpt-image-2.6-sunburst-2026-11-04', 20)
  expect(dialogs).toEqual([])
  await expect(page.locator('[data-case-name="output_format=gif"]').getByText(/✓ 通过/).first()).toBeVisible()

  // 跨到 2.5：确认后换成没有 gif / svg / complexity 的列表
  await useModel(page, 'gpt-image-2.5-flare', 13)
  expect(dialogs).toHaveLength(1)
  await expect(page.locator('[data-case-name="output_format=gif"]')).toHaveCount(0)
  await expect(page.locator('[data-case-name="quality=xhigh"]')).toHaveCount(1)
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
