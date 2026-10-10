import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { IMG_C2PA_EKU_CONFIG, imgC2paCodeText, imgC2paHeadline, imgC2paIncomplete, imgC2paSettings, imgSummarizeC2pa } from './c2pa.ts'

function store(manifest: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { active_manifest: 'urn:c2pa:active', manifests: { 'urn:c2pa:active': manifest }, ...extra }
}

const openai = store({
  claim_generator_info: [{ name: 'OpenAI Media Service API' }],
  signature_info: { issuer: 'OpenAI OpCo, LLC', time: '2026-08-22T13:47:29Z' },
  assertions: [{
    label: 'c2pa.actions.v2',
    data: { actions: [{ action: 'c2pa.created', softwareAgent: { name: 'gpt-image', version: 'pre-2.0' }, digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' }] },
  }],
})

describe('imgSummarizeC2pa 来源', () => {
  it('未登记的主体即使可信也显示原始组织名：Microsoft Corporation', () => {
    const result = imgSummarizeC2pa({
      ...store({
        claim_generator: 'Azure OpenAI ImageGen',
        signature_info: { issuer: 'Microsoft Corporation' },
        assertions: [{ label: 'c2pa.actions', data: { actions: [{ softwareAgent: 'Azure OpenAI ImageGen' }] } }],
      }),
      validation_state: 'Trusted',
    }, { trustChecked: true })
    assert.equal(result.source, 'other')
    assert.equal(result.softwareAgent, 'Azure OpenAI ImageGen')
    assert.equal(imgC2paHeadline(result), 'Microsoft Corporation · 可信')
  })

  it('自报 OpenAI 但证书主体是别家，不认成 OpenAI', () => {
    const result = imgSummarizeC2pa({
      ...store({
        claim_generator_info: [{ name: 'OpenAI Media Service API' }],
        signature_info: { issuer: 'Foo Relay Ltd', common_name: 'Foo Signer' },
        assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', softwareAgent: { name: 'gpt-image' } }] } }],
      }),
      validation_state: 'Valid',
      validation_results: { activeManifest: { success: [], informational: [], failure: [{ code: 'signingCredential.untrusted' }] } },
    }, { trustChecked: true })
    assert.equal(result.source, 'other')
    assert.equal(result.claimGenerator, 'OpenAI Media Service API')
    assert.equal(imgC2paHeadline(result), '未验证 · 证书自称 Foo Relay Ltd')
  })

  it('证书主体是 OpenAI 且链可信，标 OpenAI 官方 · 可信', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_state: 'Trusted',
      validation_results: { activeManifest: { success: [{ code: 'signingCredential.trusted' }], informational: [], failure: [] } },
    }, { trustChecked: true })
    assert.equal(result.source, 'openai')
    assert.equal(result.issuer, 'OpenAI OpCo, LLC')
    assert.equal(result.actionLabel, 'AI 生成')
    assert.equal(result.generatedAt, '2026-08-22T13:47:29Z')
    assert.equal(imgC2paHeadline(result), 'OpenAI 官方 · 可信')
  })

  it('证书主体是 OpenAI 但链不可信，只写证书自称', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_state: 'Valid',
      validation_results: { activeManifest: { success: [], informational: [], failure: [{ code: 'signingCredential.untrusted' }] } },
    }, { trustChecked: true })
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'untrusted')
    assert.equal(imgC2paHeadline(result), '未验证 · 证书自称 OpenAI')
  })

  it('未登记的主体即使可信也显示原始组织名：Google LLC', () => {
    const result = imgSummarizeC2pa({
      ...store({ signature_info: { issuer: 'Google LLC' }, claim_generator_info: [{ name: 'Google C2PA generator library' }] }),
      validation_state: 'Trusted',
    }, { trustChecked: true })
    assert.equal(result.source, 'other')
    assert.equal(imgC2paHeadline(result), 'Google LLC · 可信')
  })

  it('主体只是含 OpenAI 字样，链可信也不标官方', () => {
    const trusted = imgSummarizeC2pa({
      ...store({ signature_info: { issuer: 'OpenAI Proxy Services Ltd', common_name: 'OpenAI Media Service' } }),
      validation_state: 'Trusted',
    }, { trustChecked: true })
    assert.equal(trusted.source, 'other')
    assert.equal(imgC2paHeadline(trusted), 'OpenAI Proxy Services Ltd · 可信')

    const untrusted = imgSummarizeC2pa({
      ...store({ signature_info: { issuer: 'OpenAI Proxy Services Ltd' } }),
      validation_state: 'Valid',
    }, { trustChecked: true })
    assert.equal(imgC2paHeadline(untrusted), '未验证 · 证书自称 OpenAI Proxy Services Ltd')
  })

  it('CN 叫 OpenAI 而 O 是别家，不认成 OpenAI', () => {
    const result = imgSummarizeC2pa({
      ...store({ signature_info: { issuer: 'Foo Relay Ltd', common_name: 'OpenAI OpCo, LLC' } }),
      validation_state: 'Trusted',
    }, { trustChecked: true })
    assert.equal(result.source, 'other')
    assert.equal(imgC2paHeadline(result), 'Foo Relay Ltd · 可信')
  })

  it('没有清单是无凭证', () => {
    const result = imgSummarizeC2pa(null, { trustChecked: true })
    assert.equal(result.status, 'none')
    assert.equal(result.trust, 'na')
    assert.equal(result.source, 'unknown')
    assert.equal(imgC2paHeadline(result), '无凭证')
  })

  it('页面中断留下的验真中改为验真未完成', () => {
    assert.equal(imgC2paHeadline(imgC2paIncomplete()), '验真未完成')
  })
})

describe('imgSummarizeC2pa 验签', () => {
  it('validation_state 为 Invalid 一律签名无效，不再按声明签名豁免证书问题', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_state: 'Invalid',
      validation_results: {
        activeManifest: {
          success: [{ code: 'claimSignature.validated' }, { code: 'assertion.dataHash.match' }],
          informational: [],
          failure: [{ code: 'signingCredential.invalid', explanation: 'certificate missing required EKU' }],
        },
      },
    }, { trustChecked: true })
    assert.equal(result.status, 'invalid')
    assert.equal(imgC2paHeadline(result), '签名无效')
    assert.ok(result.codes.includes('signingCredential.invalid'))
  })

  it('时间戳与签名不匹配时，即使没核信任也算签名无效', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_state: 'Invalid',
      validation_results: { activeManifest: { success: [], informational: [], failure: [{ code: 'timeStamp.mismatch' }] } },
    }, { trustChecked: false })
    assert.equal(result.status, 'invalid')
  })

  it('素材的失败只出现在顶层 validation_status 时，不算到当前清单头上', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_state: 'Valid',
      validation_status: [{ code: 'assertion.hashedURI.mismatch', success: false }],
      validation_results: {
        activeManifest: { success: [{ code: 'claimSignature.validated' }], informational: [], failure: [] },
        ingredientDeltas: [{ validationDeltas: { failure: [{ code: 'assertion.hashedURI.mismatch' }] } }],
      },
    }, { trustChecked: false })
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'unchecked')
    assert.deepEqual(result.codes, [])
  })

  it('旧结构没有 validation_state 时，哈希不符仍算签名无效', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_status: [
        { code: 'signingCredential.trusted', success: true },
        { code: 'assertion.hashedURI.mismatch', success: false },
      ],
    }, { trustChecked: true })
    assert.equal(result.status, 'invalid')
    assert.equal(result.trust, 'trusted')
    assert.ok(result.codes.includes('assertion.hashedURI.mismatch'))
  })

  it('旧结构没有 validation_state 时，只有未入列表仍算签名完整', () => {
    const result = imgSummarizeC2pa({
      ...openai,
      validation_status: [{ code: 'signingCredential.untrusted', success: false }],
    }, { trustChecked: true })
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'untrusted')
  })

  it('状态码翻成中文，认不出的原样返回', () => {
    assert.equal(imgC2paCodeText('assertion.dataHash.mismatch'), '图像数据与签名时不一致')
    assert.equal(imgC2paCodeText('foo.bar'), 'foo.bar')
  })
})

describe('imgC2paSettings', () => {
  it('总是带 EKU 白名单，签名列表在时才核信任', () => {
    const off = imgC2paSettings(null)
    assert.equal(off.verify?.verifyTrust, false)
    assert.equal(off.trust?.trustConfig, IMG_C2PA_EKU_CONFIG)
    assert.equal(off.trust?.trustAnchors, undefined)
    const on = imgC2paSettings('-----BEGIN CERTIFICATE-----')
    assert.equal(on.verify?.verifyTrust, true)
    assert.equal(on.trust?.trustConfig, IMG_C2PA_EKU_CONFIG)
    assert.ok(IMG_C2PA_EKU_CONFIG.includes('1.3.6.1.4.1.62558.2.1'))
  })
})
