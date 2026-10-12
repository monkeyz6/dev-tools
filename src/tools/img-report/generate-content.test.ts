import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  imgGenerateContentExtraChecks,
  imgGenerateContentGrounded,
  imgGenerateContentImageTokens,
  imgIsThoughtPart,
} from './generate-content.ts'

describe('imgIsThoughtPart', () => {
  it('只把 thought === true 当成思考图', () => {
    assert.equal(imgIsThoughtPart({ thought: true }), true)
    assert.equal(imgIsThoughtPart({ thought: false }), false)
    assert.equal(imgIsThoughtPart({}), false)
    assert.equal(imgIsThoughtPart(null), false)
  })
})

describe('imgGenerateContentGrounded', () => {
  it('candidates 上的 groundingMetadata，四个证据字段任一非空即通过', () => {
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { webSearchQueries: ['sf'] } }] }), true)
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://x' } }] } }] }), true)
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { searchEntryPoint: { renderedContent: '<div>' } } }] }), true)
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { groundingSupports: [{ segment: {} }] } }] }), true)
  })

  it('认 snake_case，也认顶层字段', () => {
    assert.equal(imgGenerateContentGrounded({ candidates: [{ grounding_metadata: { web_search_queries: ['q'] } }] }), true)
    assert.equal(imgGenerateContentGrounded({ grounding_metadata: { grounding_chunks: [{}] } }), true)
  })

  it('空字段、空对象、没有 grounding 都不算证据', () => {
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { webSearchQueries: [], searchEntryPoint: {}, groundingChunks: [], groundingSupports: [] } }] }), false)
    assert.equal(imgGenerateContentGrounded({ candidates: [{ groundingMetadata: { webSearchQueries: '  ' } }] }), false)
    assert.equal(imgGenerateContentGrounded({ candidates: [{}] }), false)
    assert.equal(imgGenerateContentGrounded({}), false)
    assert.equal(imgGenerateContentGrounded(null), false)
  })
})

describe('imgGenerateContentImageTokens', () => {
  it('只取 IMAGE 明细，忽略文本，并认 snake_case', () => {
    assert.equal(imgGenerateContentImageTokens({
      usageMetadata: { candidatesTokenCount: 99, candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 12 }, { modality: 'IMAGE', tokenCount: 1680 }] },
    }), 1680)
    assert.equal(imgGenerateContentImageTokens({
      usage_metadata: { candidates_tokens_details: [{ modality: 'image', token_count: 3780 }] },
    }), 3780)
  })

  it('没有 IMAGE 明细时为 null，不回落到 candidatesTokenCount', () => {
    assert.equal(imgGenerateContentImageTokens({ usageMetadata: { candidatesTokenCount: 1120 } }), null)
    assert.equal(imgGenerateContentImageTokens({ usageMetadata: { candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 4 }] } }), null)
    assert.equal(imgGenerateContentImageTokens({}), null)
  })
})

describe('imgGenerateContentExtraChecks', () => {
  it('token 只记 info；搜索按 grounding 通过或未通过', () => {
    const both = imgGenerateContentExtraChecks({ generateContent: true, searchReq: true, imageTokens: 1120, grounded: true })
    assert.deepEqual(both, [
      { name: '图片输出 token', target: '—', actual: '1120 token', pass: true, info: true },
      { name: '联网搜索', target: 'groundingMetadata 有搜索证据', actual: '有', pass: true },
    ])
    const missing = imgGenerateContentExtraChecks({ generateContent: true, searchReq: true, imageTokens: null, grounded: false })
    assert.equal(missing[0].actual, '无 usage')
    assert.equal(missing[0].info, true)
    assert.equal(missing[1].pass, false)
    assert.deepEqual(imgGenerateContentExtraChecks({ generateContent: false, searchReq: false, imageTokens: 1, grounded: true }), [])
  })
})
