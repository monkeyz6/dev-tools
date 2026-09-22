import { inflateSync } from 'node:zlib'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PROBE_RED_PNG_B64 } from './protocol.ts'

const readU32 = (buf: Buffer, offset: number) => buf.readUInt32BE(offset)

describe('PROBE_RED_PNG_B64', () => {
  it('是 32×32 纯红 PNG，总像素不低于 Grok 的 512 下限', () => {
    const png = Buffer.from(PROBE_RED_PNG_B64, 'base64')
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.subarray(12, 16).toString(), 'IHDR')
    const width = readU32(png, 16)
    const height = readU32(png, 20)
    assert.equal(width, 32)
    assert.equal(height, 32)
    assert.ok(width * height >= 512)
    assert.equal(png[24], 8)
    assert.equal(png[25], 2)

    const idatLen = readU32(png, 33)
    assert.equal(png.subarray(37, 41).toString(), 'IDAT')
    const raw = inflateSync(png.subarray(41, 41 + idatLen))
    const stride = 1 + width * 3
    assert.equal(raw.length, height * stride)
    for (let y = 0; y < height; y++) {
      const row = raw.subarray(y * stride, (y + 1) * stride)
      assert.equal(row[0], 0)
      for (let x = 0; x < width; x++) {
        assert.equal(row.subarray(1 + x * 3, 4 + x * 3).toString('hex'), 'dc2626')
      }
    }
  })
})
