import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_OFFICIAL_HOST_DOUBAO,
  VIDEO_OFFICIAL_HOST_DREAMINA,
  VIDEO_OFFICIAL_REGION_TARGET,
  videoOfficialLink,
  videoOfficialUrlVerdict,
} from './official-url.ts'
import { videoBuildReportSummary, videoClassify } from './summary.ts'
import type { VideoRecord } from './types.ts'

const CN = `https://${VIDEO_OFFICIAL_HOST_DOUBAO}`
const SG = `https://${VIDEO_OFFICIAL_HOST_DREAMINA}`

describe('videoOfficialUrlVerdict', () => {
  it('国内 doubao 认北京桶，路径和签名忽略，host 大小写不敏感', () => {
    const signed = videoOfficialUrlVerdict(
      'doubao-seedance-2-0',
      `${CN}/doubao-seedance-2-0/a.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Signature=abc`,
    )
    assert.equal(signed.pass, true)
    assert.equal(signed.target, VIDEO_OFFICIAL_HOST_DOUBAO)
    assert.equal(signed.actual, VIDEO_OFFICIAL_HOST_DOUBAO)

    const otherPath = videoOfficialUrlVerdict('doubao-seedance-2-5', `${CN}/other/b.mp4`)
    assert.equal(otherPath.pass, true)

    const cased = videoOfficialUrlVerdict('Doubao-Seedance-2-0', `https://${VIDEO_OFFICIAL_HOST_DOUBAO.toUpperCase()}/a.mp4`)
    assert.equal(cased.pass, true)

    const dated = videoOfficialUrlVerdict('doubao-seedance-2-0-260128', `${CN}/x.mp4`)
    assert.equal(dated.pass, true)
  })

  it('海外 dreamina 只认新加坡这一个桶', () => {
    const ok = videoOfficialUrlVerdict('dreamina-seedance-2-0-fast', `${SG}/seedance/a.mp4?X-Tos-Algorithm=TOS4`)
    assert.equal(ok.pass, true)
    assert.equal(ok.target, VIDEO_OFFICIAL_HOST_DREAMINA)
    assert.equal(ok.actual, VIDEO_OFFICIAL_HOST_DREAMINA)

    const dated = videoOfficialUrlVerdict('dreamina-seedance-2-0-260128', `${SG}/a.mp4`)
    assert.equal(dated.pass, true)
  })

  it('用错桶、网关 CDN、http、非 443 端口都未通过', () => {
    const cross = videoOfficialUrlVerdict('doubao-seedance-2-0', `${SG}/a.mp4`)
    assert.equal(cross.pass, false)
    assert.equal(cross.target, VIDEO_OFFICIAL_HOST_DOUBAO)
    assert.equal(cross.actual, VIDEO_OFFICIAL_HOST_DREAMINA)

    const crossBack = videoOfficialUrlVerdict('dreamina-seedance-2-0', `${CN}/a.mp4`)
    assert.equal(crossBack.pass, false)
    assert.equal(crossBack.actual, VIDEO_OFFICIAL_HOST_DOUBAO)

    const cdn = videoOfficialUrlVerdict('doubao-seedance-2-0', 'https://cdn.example/a.mp4')
    assert.equal(cdn.pass, false)
    assert.equal(cdn.actual, 'cdn.example')

    const http = videoOfficialUrlVerdict('doubao-seedance-2-0', `http://${VIDEO_OFFICIAL_HOST_DOUBAO}/a.mp4`)
    assert.equal(http.pass, false)
    assert.equal(http.actual, `非 https · ${VIDEO_OFFICIAL_HOST_DOUBAO}`)

    const port = videoOfficialUrlVerdict('dreamina-seedance-2-0', `https://${VIDEO_OFFICIAL_HOST_DREAMINA}:8443/a.mp4`)
    assert.equal(port.pass, false)
    assert.equal(port.actual, `带端口 · ${VIDEO_OFFICIAL_HOST_DREAMINA}:8443`)

    const defaultPort = videoOfficialUrlVerdict('doubao-seedance-2-0', `${CN}:443/a.mp4`)
    assert.equal(defaultPort.pass, true)
  })

  it('解析不了，或模型名对不上地域，未通过', () => {
    const bad = videoOfficialUrlVerdict('doubao-seedance-2-0', 'not a url')
    assert.equal(bad.pass, false)
    assert.equal(bad.target, VIDEO_OFFICIAL_HOST_DOUBAO)
    assert.equal(bad.actual, '无法解析')

    for (const model of ['seedance-2-0', 'doubao-dreamina-mix', '', 'gemini-omni-flash-preview']) {
      const v = videoOfficialUrlVerdict(model, `${CN}/a.mp4`)
      assert.equal(v.pass, false, model)
      assert.equal(v.target, VIDEO_OFFICIAL_REGION_TARGET)
      assert.equal(v.actual, '无法按模型判断地域')
    }
  })
})

describe('videoOfficialLink', () => {
  it('探测把 videoUrl 换成 blob 后，仍核对 outputUri 里的远程地址', () => {
    const link = videoOfficialLink({
      videoUrl: 'blob:http://localhost:5174/11111111-2222-3333-4444-555555555555',
      targets: { outputUri: `${CN}/a.mp4?X-Tos-Algorithm=TOS4` },
    })
    assert.equal(link, `${CN}/a.mp4?X-Tos-Algorithm=TOS4`)
    assert.equal(videoOfficialUrlVerdict('doubao-seedance-2-0', link!).pass, true)
  })

  it('还没改写成 blob 时直接用 https videoUrl；只剩 blob 则原样返回', () => {
    assert.equal(videoOfficialLink({ videoUrl: `${SG}/a.mp4`, targets: {} }), `${SG}/a.mp4`)
    assert.equal(videoOfficialLink({ videoUrl: 'blob:http://localhost/1', targets: {} }), 'blob:http://localhost/1')
    assert.equal(videoOfficialLink({ videoUrl: null, targets: {} }), null)
    const blobOnly = videoOfficialUrlVerdict('doubao-seedance-2-0', 'blob:http://localhost/1')
    assert.equal(blobOnly.pass, false)
    assert.equal(blobOnly.actual, '非 https')
  })
})

describe('官方域名进入报告', () => {
  it('对不上的官方域名让用例未通过，并出现在能力表', () => {
    const rec = {
      id: '1',
      time: 1,
      caseName: '文生 · 仅必填',
      ok: true,
      error: null,
      status: 200,
      durationMs: 10,
      expect: 'success',
      videoUrl: 'https://cdn.example/a.mp4',
      checks: [
        { name: '视频地址', target: 'content.video_url', actual: 'https://cdn.example/a.mp4', pass: true },
        { name: '官方域名', target: VIDEO_OFFICIAL_HOST_DOUBAO, actual: 'cdn.example', pass: false },
      ],
    } as VideoRecord
    assert.equal(videoClassify(rec), 'fail')
    const summary = videoBuildReportSummary([rec])
    const cap = summary.capabilities.find(c => c.key === 'officialHost')
    assert.ok(cap)
    assert.equal(cap.label, '官方成片域名')
    assert.equal(cap.level, 'fail')
    assert.equal(summary.rows[0].status, 'fail')
    const order = summary.capabilities.map(c => c.key)
    assert.ok(order.indexOf('videoUrl') < order.indexOf('officialHost'))
  })
})
