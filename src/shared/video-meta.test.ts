import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseMp4Meta, vidCheckResolution, videoLooksLikeSignedTosUrl } from './video-meta.ts'

describe('videoLooksLikeSignedTosUrl', () => {
  it('认火山 TOS 签名成片，其它 https 不算', () => {
    assert.equal(videoLooksLikeSignedTosUrl('https://ark-acg-cn-beijjng.tos-cn-beijing.volces.com/doubao-seedance-2-0/a.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256'), true)
    assert.equal(videoLooksLikeSignedTosUrl('https://cdn.example/v.mp4'), false)
  })
})

describe('parseMp4Meta', () => {
  it('读普通 faststart 小片的 stsd 宽高与时长', () => {
    const buf = readFileSync('e2e/fixtures/probe-red.mp4')
    const meta = parseMp4Meta(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    assert.ok(meta)
    assert.equal(meta!.width, 64)
    assert.equal(meta!.height, 36)
    assert.ok(Math.abs(meta!.duration - 1) < 0.05)
    assert.equal(meta!.hasAudio, false)
  })

  it('Seedance TOS 成片 tkhd 宽度为 0 时仍用 stsd 的 480×836', () => {
    const buf = readFileSync('e2e/fixtures/tos-seedance-moov.mp4')
    const meta = parseMp4Meta(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    assert.ok(meta)
    assert.equal(meta!.width, 480)
    assert.equal(meta!.height, 836)
    assert.ok(Math.abs(meta!.duration - 4.041667) < 0.02)
    assert.equal(meta!.hasAudio, false)
  })

  it('空缓冲返回 null', () => {
    assert.equal(parseMp4Meta(new ArrayBuffer(0)), null)
  })
})

describe('vidCheckResolution', () => {
  it('1080p 1:1 的 1080×1080 走短边档通过，不被面积档判成 720p', () => {
    const hit = vidCheckResolution('1080p', 1080, 1080)
    assert.ok(hit)
    assert.equal(hit!.pass, true)
    assert.equal(hit!.via, 'short')
    assert.equal(hit!.nearest, '1080p')
  })

  it('720p 1:1 的 960×960 仍走面积档通过', () => {
    const hit = vidCheckResolution('720p', 960, 960)
    assert.ok(hit)
    assert.equal(hit!.pass, true)
    assert.equal(hit!.via, 'area')
  })

  it('960×960 不能当成 1080p（短边离 1080 超过 5%）', () => {
    const hit = vidCheckResolution('1080p', 960, 960)
    assert.ok(hit)
    assert.equal(hit!.pass, false)
  })

  it('1080p 16:9 的 1920×1080 面积档通过', () => {
    const hit = vidCheckResolution('1080p', 1920, 1080)
    assert.ok(hit)
    assert.equal(hit!.pass, true)
    assert.equal(hit!.via, 'area')
  })

  it('文档里的 1080p 1:1 面积等价 1440×1440 也通过', () => {
    const hit = vidCheckResolution('1080p', 1440, 1440)
    assert.ok(hit)
    assert.equal(hit!.pass, true)
    assert.equal(hit!.via, 'area')
  })
})
