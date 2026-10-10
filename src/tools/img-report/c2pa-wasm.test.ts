// 用 OpenAI 验证页判为「可信 C2PA 清单」的真实 gpt-image 原图跑 c2pa-rs WASM。
// 伪造的 manifest store 管不到 Context 配置写错（比如漏传 trustConfig），这份测试就是守这一类问题的。
// 签名证书 2027-03-24 到期，签名时间由 OpenAI 的 RFC 3161 时间戳背书；若到期后结论变了，先看 claimSignature.insideValidity。
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initSync, WasmReader } from '@contentauth/c2pa-wasm'
import { resolveSettings } from '@contentauth/c2pa-utilities'
import { imgC2paHeadline, imgC2paSettings, imgSummarizeC2pa } from './c2pa.ts'

const root = process.cwd()
const fixtures = join(root, 'src/tools/img-report/__fixtures__')
const image = new Uint8Array(readFileSync(join(fixtures, 'openai-gpt-image.png')))
const trufoRoot = readFileSync(join(fixtures, 'trufo-c2pa-root.pem'), 'utf8')
const unrelatedRoot = readFileSync(join(fixtures, 'unrelated-root.pem'), 'utf8')

async function verify(bytes: Uint8Array, pem: string | null) {
  // 与 c2pa-read.ts 同一份 settings，走 c2pa-web Context.toJson 同一条序列化路径
  const json = await resolveSettings(imgC2paSettings(pem))
  const reader = await WasmReader.fromBytes('image/png', bytes, json)
  try {
    return imgSummarizeC2pa(reader.manifestStore(), { trustChecked: !!pem }, JSON.parse(reader.crJson()))
  } finally {
    reader.free()
  }
}

describe('真实 OpenAI 原图的 C2PA 结论', () => {
  before(() => {
    initSync({ module: readFileSync(join(root, 'node_modules/@contentauth/c2pa-wasm/pkg/c2pa_bg.wasm')) })
  })

  it('信任锚含 Trufo 根时判 OpenAI 官方 · 可信', async () => {
    const result = await verify(image, trufoRoot)
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'trusted')
    assert.equal(result.source, 'openai')
    assert.equal(imgC2paHeadline(result), 'OpenAI 官方 · 可信')
    assert.equal(result.issuer, 'OpenAI OpCo, LLC')
    assert.equal(result.signerName, 'OpenAI Media Service')
    assert.match(result.issuerCa || '', /Trufo/)
    assert.equal(result.integrity, 'match')
    assert.equal(result.tsaName, 'OpenAI TSA Leaf')
    assert.equal(result.tsaTrusted, false)
    assert.equal(result.softwareAgent, 'API gpt-image')
    assert.equal(result.actionLabel, 'AI 生成')
    // 漏传 trustConfig 时这里会出现 certificate missing required EKU
    assert.deepEqual(result.codes, [])
  })

  it('信任列表没拉到时不核信任，判未验证但签名完整', async () => {
    const result = await verify(image, null)
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'unchecked')
    assert.equal(imgC2paHeadline(result), '未验证 · 证书自称 OpenAI')
    assert.equal(result.tsaTrusted, null)
    assert.ok(!result.codes.includes('signingCredential.invalid'))
  })

  it('信任锚里没有对应根时判未入列表', async () => {
    const result = await verify(image, unrelatedRoot)
    assert.equal(result.status, 'valid')
    assert.equal(result.trust, 'untrusted')
    assert.equal(imgC2paHeadline(result), '未验证 · 证书自称 OpenAI')
    assert.deepEqual(result.codes, ['signingCredential.untrusted'])
  })

  it('改动一个像素字节后签名无效', async () => {
    const tampered = new Uint8Array(image)
    tampered[tampered.length - 5000] ^= 0xff
    const result = await verify(tampered, trufoRoot)
    assert.equal(result.status, 'invalid')
    assert.equal(imgC2paHeadline(result), '签名无效')
    assert.equal(result.integrity, 'mismatch')
    assert.ok(result.codes.includes('assertion.dataHash.mismatch'))
  })
})
