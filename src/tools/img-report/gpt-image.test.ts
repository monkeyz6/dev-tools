import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { imgGptImageChecks, imgGptImageFamily, imgGptQualityRejected, imgParseOpenAiEcho } from './gpt-image.ts'

describe('imgGptImageFamily', () => {
  it('别名、日期 snapshot、vendor/ 前缀都归入家族', () => {
    assert.equal(imgGptImageFamily('gpt-image-2'), 'v2')
    assert.equal(imgGptImageFamily('gpt-image-2-2026-04-21'), 'v2')
    assert.equal(imgGptImageFamily('openai/GPT-Image-2'), 'v2')
    assert.equal(imgGptImageFamily('gpt-image-2.5-flare'), 'v2.5')
    assert.equal(imgGptImageFamily('gpt-image-2.5-sunburst'), 'v2.5')
    assert.equal(imgGptImageFamily('gpt-image-2.5-sunburst-2026-09-30'), 'v2.5')
    assert.equal(imgGptImageFamily('vendor/gpt-image-2.5-flare-2026-09-30'), 'v2.5')
  })
  it('认不出的型号不归族', () => {
    for (const m of ['gpt-image-2.5', 'gpt-image-2-mini', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2.5-flare-mini', 'dall-e-3', '']) {
      assert.equal(imgGptImageFamily(m), null, m)
    }
  })
})

describe('imgGptQualityRejected', () => {
  it('gpt-image-2 拒绝 xhigh / max，接受其余档位', () => {
    assert.equal(imgGptQualityRejected('gpt-image-2', 'xhigh'), true)
    assert.equal(imgGptQualityRejected('gpt-image-2-2026-04-21', 'max'), true)
    for (const q of ['low', 'medium', 'high', 'auto']) assert.equal(imgGptQualityRejected('gpt-image-2', q), false, q)
  })
  it('2.5 系列全档位都接受', () => {
    for (const q of ['low', 'medium', 'high', 'auto', 'xhigh', 'max']) {
      assert.equal(imgGptQualityRejected('gpt-image-2.5-flare', q), false, q)
      assert.equal(imgGptQualityRejected('gpt-image-2.5-sunburst', q), false, q)
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
    assert.deepEqual(imgParseOpenAiEcho({ quality: 'xhigh', size: '1024x1024', usage: { input_tokens: 10, output_tokens: 4160 } }), {
      quality: 'xhigh', size: '1024x1024', output_format: null, background: null, usage: { input_tokens: 10, output_tokens: 4160 },
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
  it('透明背景按采样占比判定，多图带序号', () => {
    const t = { bgReq: 'transparent' }
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0.42 }] }), '透明背景')?.pass, true)
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0 }] }), '透明背景')?.pass, false)
    assert.equal(find(imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{}] }), '透明背景')?.actual, '未能读取像素')
    const multi = imgGptImageChecks({ targets: t, echo: undefined, model: 'gpt-image-2.5-flare', images: [{ alphaRatio: 0.5 }, { alphaRatio: 0.005 }] })
    assert.equal(find(multi, '图2 透明背景')?.pass, false)
  })
})
