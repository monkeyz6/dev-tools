import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { imgCountGifFrames, imgGptImageChecks, imgGptImageFamily, imgGptPriceModel, imgGptQualityRejected, imgParseOpenAiEcho, imgPickPriceModel } from './gpt-image.ts'

describe('imgGptImageFamily', () => {
  it('别名、日期 snapshot、vendor/ 前缀都归入家族', () => {
    assert.equal(imgGptImageFamily('gpt-image-2'), 'v2')
    assert.equal(imgGptImageFamily('gpt-image-2-2026-04-21'), 'v2')
    assert.equal(imgGptImageFamily('openai/GPT-Image-2'), 'v2')
    assert.equal(imgGptImageFamily('gpt-image-2.5-flare'), 'v2.5')
    assert.equal(imgGptImageFamily('gpt-image-2.5-sunburst'), 'v2.5')
    assert.equal(imgGptImageFamily('gpt-image-2.5-sunburst-2026-09-30'), 'v2.5')
    assert.equal(imgGptImageFamily('vendor/gpt-image-2.5-flare-2026-09-30'), 'v2.5')
    assert.equal(imgGptImageFamily('gpt-image-2.6-flare'), 'v2.6')
    assert.equal(imgGptImageFamily('gpt-image-2.6-sunburst'), 'v2.6')
    assert.equal(imgGptImageFamily('openai/gpt-image-2.6-flare-2026-11-04'), 'v2.6')
  })
  it('认不出的型号不归族', () => {
    for (const m of ['gpt-image-2.5', 'gpt-image-2.6', 'gpt-image-2-mini', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2.5-flare-mini', 'gpt-image-2.6-flare-mini', 'dall-e-3', '']) {
      assert.equal(imgGptImageFamily(m), null, m)
    }
  })
})

describe('imgGptPriceModel', () => {
  it('去掉前缀和日期，flare 与 sunburst 仍分开', () => {
    assert.equal(imgGptPriceModel('openai/gpt-image-2.6-flare-2026-11-04'), 'gpt-image-2.6-flare')
    assert.equal(imgGptPriceModel('GPT-Image-2.6-Sunburst'), 'gpt-image-2.6-sunburst')
    assert.equal(imgGptPriceModel('gpt-image-2-2026-04-21'), 'gpt-image-2')
    assert.equal(imgGptPriceModel('gpt-image-2.5-flare'), 'gpt-image-2.5-flare')
    assert.equal(imgGptPriceModel('gpt-image-2.6'), null)
    assert.equal(imgGptPriceModel('gpt-image-1.5'), null)
  })
  it('价格行先认原文，没有再落到去掉前缀和日期的 id', () => {
    assert.equal(imgPickPriceModel('openai/gpt-image-2', ['openai/gpt-image-2', 'gpt-image-2']), 'openai/gpt-image-2')
    assert.equal(imgPickPriceModel('gpt-image-2-2026-04-21', ['gpt-image-2-2026-04-21', 'gpt-image-2']), 'gpt-image-2-2026-04-21')
    assert.equal(imgPickPriceModel('openai/gpt-image-2.6-flare-2026-11-04', ['gpt-image-2.6-flare']), 'gpt-image-2.6-flare')
    assert.equal(imgPickPriceModel('gpt-image-2', ['gpt-image-2']), 'gpt-image-2')
  })
})

describe('imgGptQualityRejected', () => {
  it('gpt-image-2 拒绝 xhigh / max，接受其余档位', () => {
    assert.equal(imgGptQualityRejected('gpt-image-2', 'xhigh'), true)
    assert.equal(imgGptQualityRejected('gpt-image-2-2026-04-21', 'max'), true)
    for (const q of ['low', 'medium', 'high', 'auto']) assert.equal(imgGptQualityRejected('gpt-image-2', q), false, q)
  })
  it('2.5 与 2.6 系列全档位都接受', () => {
    for (const q of ['low', 'medium', 'high', 'auto', 'xhigh', 'max']) {
      assert.equal(imgGptQualityRejected('gpt-image-2.5-flare', q), false, q)
      assert.equal(imgGptQualityRejected('gpt-image-2.5-sunburst', q), false, q)
      assert.equal(imgGptQualityRejected('gpt-image-2.6-flare', q), false, q)
      assert.equal(imgGptQualityRejected('gpt-image-2.6-sunburst', q), false, q)
    }
  })
  it('枚举外的值对任何型号都拒绝；认不出的型号不对 xhigh 下结论', () => {
    assert.equal(imgGptQualityRejected('gpt-image-2.5-flare', 'ultra'), true)
    assert.equal(imgGptQualityRejected('gpt-image-1.5', 'ultra'), true)
    assert.equal(imgGptQualityRejected('gpt-image-1.5', 'xhigh'), false)
    assert.equal(imgGptQualityRejected('gpt-image-2', undefined), false)
  })
})

describe('imgParseOpenAiEcho', () => {
  it('取顶层回显与 usage，缺失记 null', () => {
    assert.deepEqual(imgParseOpenAiEcho({ quality: 'xhigh', size: '1024x1024', complexity: 'low', usage: { input_tokens: 10, output_tokens: 4160 } }), {
      quality: 'xhigh', size: '1024x1024', output_format: null, background: null, complexity: 'low', usage: { input_tokens: 10, output_tokens: 4160 },
    })
    assert.equal(imgParseOpenAiEcho({ data: [] }).usage, null)
    assert.deepEqual(imgParseOpenAiEcho({ usage: { input_tokens: '10' } }).usage, { input_tokens: null, output_tokens: null })
  })
})

describe('imgGptImageChecks', () => {
  const usage = { input_tokens: 10, output_tokens: 4160 }
  const echo = (o: Record<string, unknown> = {}) => ({ quality: null, size: null, output_format: null, background: null, usage, ...o })
  const find = (list: ReturnType<typeof imgGptImageChecks>, name: string) => list.find(c => c.name === name)

  it('quality 回显一致通过，被降档失败，未回显只记 info', () => {
    const t = { qualityReq: 'xhigh' }
    assert.equal(find(imgGptImageChecks({ targets: t, echo: echo({ quality: 'xhigh' }), model: 'gpt-image-2.5-flare', images: [] }), 'quality 回显')?.pass, true)
    assert.equal(find(imgGptImageChecks({ targets: t, echo: echo({ quality: 'high' }), model: 'gpt-image-2.5-flare', images: [] }), 'quality 回显')?.pass, false)
    const missing = find(imgGptImageChecks({ targets: t, echo: echo(), model: 'gpt-image-2.5-flare', images: [] }), 'quality 回显')
    assert.equal(missing?.info, true)
  })
  it('auto 与没写的参数不核对回显', () => {
    const list = imgGptImageChecks({ targets: { qualityReq: 'auto' }, echo: echo({ quality: 'high' }), model: 'gpt-image-2', images: [] })
    assert.equal(find(list, 'quality 回显'), undefined)
    assert.equal(find(list, '参数回显 · size'), undefined)
  })
  it('size / output_format / background 回显，jpg 与 jpeg 视为一致', () => {
    const list = imgGptImageChecks({
      targets: { sizeReq: '1024x1536', _of: 'jpeg', bgReq: 'opaque' },
      echo: echo({ size: '1024x1024', output_format: 'jpg', background: 'opaque' }),
      model: 'gpt-image-2', images: [],
    })
    assert.equal(find(list, '参数回显 · size')?.pass, false)
    assert.equal(find(list, '参数回显 · output_format')?.pass, true)
    assert.equal(find(list, '参数回显 · background')?.pass, true)
  })
  it('gpt-image 缺 usage 判失败，非 gpt-image 不查，旧记录整段跳过', () => {
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: echo({ usage: null }), model: 'gpt-image-2', images: [] }), '用量字段')?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: echo({ usage: { input_tokens: 1, output_tokens: null } }), model: 'gpt-image-2', images: [] }), '用量字段')?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: echo(), model: 'gpt-image-2', images: [] }), '用量字段')?.pass, true)
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: echo({ usage: null }), model: 'dall-e-3', images: [] }), '用量字段'), undefined)
    assert.deepEqual(imgGptImageChecks({ targets: { qualityReq: 'low' }, echo: undefined, model: 'gpt-image-2', images: [] }), [])
  })
  it('complexity 回显：写了就比对，没写按默认 high，没回显只记 info', () => {
    const low = find(imgGptImageChecks({ targets: { complexityReq: 'low' }, echo: echo({ complexity: 'low' }), model: 'gpt-image-2.6-flare', images: [] }), 'complexity 回显')
    assert.equal(low?.pass, true)
    assert.equal(low?.info, undefined)
    const dropped = find(imgGptImageChecks({ targets: { complexityReq: 'low' }, echo: echo({ complexity: 'high' }), model: 'gpt-image-2.6-flare', images: [] }), 'complexity 回显')
    assert.equal(dropped?.pass, false)
    const missing = find(imgGptImageChecks({ targets: { complexityReq: 'low' }, echo: echo(), model: 'gpt-image-2.6-flare', images: [] }), 'complexity 回显')
    assert.equal(missing?.info, true)
    assert.equal(missing?.pass, true)
    const omitted = find(imgGptImageChecks({ targets: { complexityDefault: true }, echo: echo({ complexity: 'high' }), model: 'gpt-image-2.6-sunburst', images: [] }), 'complexity 回显')
    assert.equal(omitted?.pass, true)
    assert.equal(omitted?.target, 'high')
    const wrongDefault = find(imgGptImageChecks({ targets: { complexityDefault: true }, echo: echo({ complexity: 'low' }), model: 'gpt-image-2.6-sunburst', images: [] }), 'complexity 回显')
    assert.equal(wrongDefault?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: echo({ complexity: 'high' }), model: 'gpt-image-2.6-flare', images: [] }), 'complexity 回显'), undefined)
  })
  it('透明背景按采样占比判定，多图带序号', () => {
    const t = { bgReq: 'transparent' }
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0.42 }] }), '透明背景')?.pass, true)
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0 }] }), '透明背景')?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{}] }), '透明背景')?.actual, '未能读取像素')
    const multi = imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0.5 }, { alphaRatio: 0.005 }] })
    assert.equal(find(multi, '图2 透明背景')?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: { bgReq: 'transparent', svg: true }, echo: undefined, model: 'gpt-image-2.6-flare', images: [{}] }), '透明背景'), undefined)
  })
  it('GIF 帧数等于 frame_count 才通过，读不出或对不上都未通过', () => {
    const ok = find(imgGptImageChecks({ targets: { frameCountReq: 9 }, echo: undefined, model: 'gpt-image-2.6-flare', images: [{ gifFrames: 9 }] }), 'GIF 帧数')
    assert.equal(ok?.pass, true)
    assert.equal(ok?.actual, 9)
    const mismatch = find(imgGptImageChecks({ targets: { frameCountReq: 9 }, echo: undefined, model: 'gpt-image-2.6-flare', images: [{ gifFrames: 1 }] }), 'GIF 帧数')
    assert.equal(mismatch?.pass, false)
    assert.equal(mismatch?.actual, 1)
    const unread = find(imgGptImageChecks({ targets: { frameCountReq: 9 }, echo: undefined, model: 'gpt-image-2.6-flare', images: [{ gifFrames: null }] }), 'GIF 帧数')
    assert.equal(unread?.pass, false)
    assert.equal(unread?.actual, '无法读取帧数')
    const empty = find(imgGptImageChecks({ targets: { frameCountReq: 9 }, echo: undefined, model: 'gpt-image-2.6-flare', images: [] }), 'GIF 帧数')
    assert.equal(empty?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: {}, echo: undefined, model: 'gpt-image-2.6-flare', images: [{ gifFrames: 9 }] }), 'GIF 帧数'), undefined)
    const tagged = imgGptImageChecks({ targets: { frameCountReq: 2 }, echo: undefined, model: 'gpt-image-2.6-flare', images: [{ gifFrames: 2 }, { gifFrames: 1 }] })
    assert.equal(find(tagged, '图1 GIF 帧数')?.pass, true)
    assert.equal(find(tagged, '图2 GIF 帧数')?.pass, false)
  })
})

/** 最小 GIF：全局色表 + Netscape 循环 + 每帧图形控制扩展。图像数据只是可跳过的子块，不要求能解码。 */
function gifFixture(frames: number, extra: { localColor?: boolean; junk?: boolean; truncate?: boolean; gif87?: boolean } = {}): Uint8Array {
  const bytes: number[] = [
    ...(extra.gif87
      ? [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
      : [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    0x01, 0x00, 0x01, 0x00,
    0x80, 0x00, 0x00,
    1, 2, 3, 4, 5, 6,
  ]
  if (!extra.gif87) {
    bytes.push(
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
      0x03, 0x01, 0x00, 0x00,
      0x00,
    )
  }
  for (let i = 0; i < frames; i++) {
    if (!extra.gif87) bytes.push(0x21, 0xf9, 0x04, 0x00, 0x14, 0x00, 0x00, 0x00)
    const local = !!extra.localColor && i === frames - 1
    bytes.push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, local ? 0x80 : 0x00)
    if (local) bytes.push(9, 9, 9, 8, 8, 8)
    bytes.push(0x02, 0x03, 0xaa, 0xbb, 0xcc, 0x02, 0xdd, 0xee, 0x00)
  }
  if (extra.junk) bytes.push(0x01)
  if (!extra.truncate) bytes.push(0x3b)
  const out = Uint8Array.from(bytes)
  return extra.truncate ? out.subarray(0, out.length - 4) : out
}

describe('imgCountGifFrames', () => {
  it('按图像描述块计数，循环扩展和图形控制扩展不算帧', () => {
    assert.equal(imgCountGifFrames(gifFixture(1)), 1)
    assert.equal(imgCountGifFrames(gifFixture(9, { localColor: true })), 9)
    assert.equal(imgCountGifFrames(gifFixture(0)), 0)
    assert.equal(imgCountGifFrames(gifFixture(1, { gif87: true })), 1)
  })
  it('截断、非 GIF、未知标记都返回 null，不把数到一半的帧当结果', () => {
    assert.equal(imgCountGifFrames(gifFixture(2, { truncate: true })), null)
    assert.equal(imgCountGifFrames(gifFixture(2, { junk: true })), null)
    assert.equal(imgCountGifFrames(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])), null)
    assert.equal(imgCountGifFrames(new Uint8Array()), null)
  })
})
