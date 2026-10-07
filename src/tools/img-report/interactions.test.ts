import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  imgInteractionChecks,
  imgInteractionTokenCheck,
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
