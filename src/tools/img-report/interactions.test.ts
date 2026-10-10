import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  imgInteractionChecks,
  imgInteractionTokenCheck,
  imgNanoFingerprint,
  imgNanoTierFromSize,
  imgNormalizeModelId,
  imgParseInteraction,
} from './interactions.ts'

const png = (extra: Record<string, unknown> = {}) => ({ type: 'image', mime_type: 'image/png', data: 'AAAA', ...extra })

describe('imgParseInteraction', () => {
  it('取 model_output 里的成图，排除 user_input 回显与 thought 图，并读出 usage / 搜索步骤', () => {
    const r = imgParseInteraction({
      id: 'i1', status: 'completed', model: 'gemini-nano-banana-2.1',
      usage: { output_tokens_by_modality: [{ modality: 'text', tokens: 9 }, { modality: 'IMAGE', tokens: 1120 }] },
      steps: [
        { type: 'user_input', content: [png()] },
        { type: 'google_search_call' },
        { type: 'thought' },
        { type: 'model_output', content: [{ type: 'text', text: 'ok' }, png({ thought: true }), png()] },
      ],
    })
    assert.equal(r?.images.length, 1)
    assert.equal(r?.images[0].carrier, 'inline')
    assert.deepEqual(r?.meta, { id: 'i1', status: 'completed', model: 'gemini-nano-banana-2.1', imageTokens: 1120, thoughtSteps: 2, searchSteps: 1 })
  })

  it('只给 uri 的成图也收进来，载体按 url 判；没有 steps / outputs 或带 candidates 无图时返回 null', () => {
    const r = imgParseInteraction({ steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', uri: 'https://x/a.png' }] }] })
    assert.equal(r?.images[0].carrier, 'http-url')
    assert.equal(r?.images[0].url, 'https://x/a.png')
    assert.equal(imgParseInteraction({ candidates: [] }), null)
    assert.equal(imgParseInteraction({ steps: [], candidates: [{}] }), null)
  })

  it('缺 usage 时 imageTokens 为 null，旧版 outputs[] 兼容', () => {
    const r = imgParseInteraction({ outputs: [png()] })
    assert.equal(r?.images.length, 1)
    assert.equal(r?.meta.imageTokens, null)
  })
})

describe('imgInteractionTokenCheck', () => {
  it('没有思考图时必须严格相等', () => {
    assert.equal(imgInteractionTokenCheck(1680, 1, 1680, 0).pass, true)
    assert.equal(imgInteractionTokenCheck(1680, 1, 1120, 0).pass, false)
    assert.equal(imgInteractionTokenCheck(1120, 2, 2240, 0).pass, true)
  })
  it('有思考图时放宽到 [期望, 期望 + 2×档位]', () => {
    assert.equal(imgInteractionTokenCheck(1120, 1, 3360, 2).pass, true)
    assert.equal(imgInteractionTokenCheck(1120, 1, 3361, 2).pass, false)
    assert.equal(imgInteractionTokenCheck(1120, 1, 1119, 2).pass, false)
  })
  it('缺 usage 判未通过；推不出档位只记 info', () => {
    assert.equal(imgInteractionTokenCheck(1120, 1, null, 0).pass, false)
    const info = imgInteractionTokenCheck(null, 1, 999, 0)
    assert.equal(info.pass, true)
    assert.equal(info.info, true)
  })
})

describe('imgNanoTierFromSize / imgNormalizeModelId', () => {
  it('按等效边长取最近档位', () => {
    assert.equal(imgNanoTierFromSize(1024, 1024)?.label, '1K')
    assert.equal(imgNanoTierFromSize(2816, 1584)?.label, '2K')
    assert.equal(imgNanoTierFromSize(6336, 2688)?.label, '4K')
    assert.equal(imgNanoTierFromSize(0, 0), null)
  })
  it('模型回显去前缀转小写', () => {
    assert.equal(imgNormalizeModelId('google/Gemini-Nano-Banana-2.1'), 'gemini-nano-banana-2.1')
    assert.equal(imgNormalizeModelId('models/gemini-nano-banana-2.1'), 'gemini-nano-banana-2.1')
  })
})

describe('imgInteractionChecks', () => {
  const meta = { id: 'i1', status: 'completed', model: 'gemini-nano-banana-2.1', imageTokens: 1680, thoughtSteps: 0, searchSteps: 0 }
  const base = { targets: { interactions: true, modelReq: 'gemini-nano-banana-2.1', imageTokensPer: 1680 }, imageCount: 1 }
  const failed = (checks: { name: string; pass: boolean }[]) => checks.filter(x => !x.pass).map(x => x.name)

  it('官方形态全部通过', () => {
    assert.deepEqual(failed(imgInteractionChecks({ ...base, meta })), [])
  })
  it('换成别的模型、token 对不上：模型回显与图片输出 token 同时未通过', () => {
    const bad = { ...meta, model: 'gemini-3.1-flash-image', imageTokens: 1120 }
    assert.deepEqual(failed(imgInteractionChecks({ ...base, meta: bad })), ['模型回显', '图片输出 token'])
  })
  it('status 不是 completed、没有 id 都判响应结构未通过；非 Interactions 响应直接未通过', () => {
    assert.deepEqual(failed(imgInteractionChecks({ ...base, meta: { ...meta, status: 'in_progress' } })), ['响应结构'])
    assert.deepEqual(failed(imgInteractionChecks({ ...base, meta: { ...meta, id: null } })), ['响应结构'])
    assert.deepEqual(failed(imgInteractionChecks({ ...base, meta: undefined })), ['响应结构'])
  })
  it('联网搜索与多轮编辑按请求触发', () => {
    const t = { ...base.targets, searchReq: true, multiTurn: true }
    assert.deepEqual(failed(imgInteractionChecks({ ...base, targets: t, meta: { ...meta, prevId: 'p1', searchSteps: 1 } })), [])
    assert.deepEqual(failed(imgInteractionChecks({ ...base, targets: t, meta })), ['联网搜索', '多轮编辑'])
  })
  it('默认参数用例按实际出图尺寸推算档位', () => {
    const t = { interactions: true, modelReq: 'gemini-nano-banana-2.1', imageTokensPer: null }
    assert.deepEqual(failed(imgInteractionChecks({ targets: t, meta, imageCount: 1, firstSize: { w: 2048, h: 2048 } })), [])
    assert.deepEqual(failed(imgInteractionChecks({ targets: t, meta: { ...meta, imageTokens: 1120 }, imageCount: 1, firstSize: { w: 2048, h: 2048 } })), ['图片输出 token'])
  })
})

describe('imgNanoFingerprint', () => {
  const meta = { id: 'i1', status: 'completed', model: 'gemini-nano-banana-2.1', imageTokens: 3780, thoughtSteps: 0, searchSteps: 0 }
  const t4k = { interactions: true, resolutionTierBaseReq: 4096 }

  it('4K：3780 符合 2.1，2520 符合 3.1 Flash Image；没写档位时按出图尺寸认 4K', () => {
    assert.equal(imgNanoFingerprint({ targets: t4k, meta, imageCount: 1 })?.pass, true)
    const fp = imgNanoFingerprint({ targets: t4k, meta: { ...meta, imageTokens: 2520 }, imageCount: 1 })
    assert.equal(fp?.pass, false)
    assert.match(String(fp?.actual), /3\.1 Flash Image/)
    assert.equal(imgNanoFingerprint({ targets: {}, meta: { ...meta, imageTokens: 2520 }, imageCount: 1, firstSize: { w: 4096, h: 4096 } })?.pass, false)
  })
  it('0.5K / 1K / 2K 不判：两代分不出，2.1 的 512 计费也没公布', () => {
    for (const [base, tokens] of [[512, 747], [512, 1120], [1024, 1120], [2048, 1680]]) {
      assert.equal(imgNanoFingerprint({ targets: { resolutionTierBaseReq: base }, meta: { ...meta, imageTokens: tokens }, imageCount: 1 }), null, `${base}/${tokens}`)
    }
  })
  it('4K 但 token 两边都不等、缺 usage、带思考图时不出结论', () => {
    assert.equal(imgNanoFingerprint({ targets: t4k, meta: { ...meta, imageTokens: 3000 }, imageCount: 1 }), null)
    assert.equal(imgNanoFingerprint({ targets: t4k, meta: { ...meta, imageTokens: null }, imageCount: 1 }), null)
    // 2K 成图 + 1K 思考图 = 2800，落在 3.1 放宽区间低端；3780 / 2520 带思考图同样不判
    for (const tokens of [2800, 3780, 2520]) {
      assert.equal(imgNanoFingerprint({ targets: t4k, meta: { ...meta, thoughtSteps: 1, imageTokens: tokens }, imageCount: 1 }), null, String(tokens))
    }
  })
  it('进 imgInteractionChecks：4K 被换成 3.1 时 token 与指纹同时未通过', () => {
    const targets = { ...t4k, modelReq: 'gemini-nano-banana-2.1', imageTokensPer: 3780 }
    const checks = imgInteractionChecks({ targets, meta: { ...meta, imageTokens: 2520 }, imageCount: 1 })
    assert.deepEqual(checks.filter(x => !x.pass).map(x => x.name), ['图片输出 token', '模型指纹'])
  })
  it('请求 512 没有官方 token 数：图片输出 token 只记 info，不拿出图尺寸套 1K', () => {
    const targets = { interactions: true, modelReq: 'gemini-nano-banana-2.1', resolutionTierBaseReq: 512, imageTokensPer: null }
    const checks = imgInteractionChecks({ targets, meta: { ...meta, imageTokens: 747 }, imageCount: 1, firstSize: { w: 512, h: 512 } })
    const tok = checks.find(x => x.name === '图片输出 token')
    assert.equal(tok?.pass, true)
    assert.equal(tok?.info, true)
    assert.equal(checks.some(x => x.name === '模型指纹'), false)
  })
})
