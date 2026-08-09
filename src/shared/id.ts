// ─── ID / 编码 纯函数 ──────────────────────────────────────────────────────────

// 随机字节源：crypto.getRandomValues（密码学安全，禁止 Math.random）。单次上限 65536，超限自动分块。
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let filled = 0; filled < n; filled += 65536) {
    crypto.getRandomValues(out.subarray(filled, Math.min(filled + 65536, n)))
  }
  return out
}

// 256 项 hex 查表：避免 toString(16).padStart 在批量生成下的开销
const HEX_LUT: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export type UuidFmt = 'standard' | 'compact' | 'braced' | 'urn'

// 生成 count 条 UUID 的原始字节（每条 16 字节、扁平排布），并打好版本位/variant 位
export function uuidBytes(count: number, version: 'v4' | 'v7'): Uint8Array {
  const n = Math.max(1, Math.floor(count))
  const raw = randomBytes(n * 16)
  let v7Ms = 0
  let v7Counter = -1
  for (let i = 0; i < n; i++) {
    const b = i * 16
    if (version === 'v4') {
      raw[b + 6] = (raw[b + 6] & 0x0f) | 0x40 // version 4
      raw[b + 8] = (raw[b + 8] & 0x3f) | 0x80 // variant 10xx
    } else {
      // v7（RFC 9562）：前 48 bit 为大端毫秒时间戳；同一毫秒内用 12 bit 计数器保证批内单调递增
      const now = Date.now()
      if (now !== v7Ms) { v7Ms = now; v7Counter = ((raw[b + 6] & 0x0f) << 8) | raw[b + 7] }
      else { v7Counter = (v7Counter + 1) & 0x0fff }
      raw[b + 0] = (v7Ms / 2 ** 40) & 0xff
      raw[b + 1] = (v7Ms / 2 ** 32) & 0xff
      raw[b + 2] = (v7Ms / 2 ** 24) & 0xff
      raw[b + 3] = (v7Ms / 2 ** 16) & 0xff
      raw[b + 4] = (v7Ms / 2 ** 8) & 0xff
      raw[b + 5] = v7Ms & 0xff
      raw[b + 6] = 0x70 | ((v7Counter >> 8) & 0x0f) // version 7 + 12 bit rand_a 高 4 位
      raw[b + 7] = v7Counter & 0xff
      raw[b + 8] = (raw[b + 8] & 0x3f) | 0x80 // variant 10xx
    }
  }
  return raw
}

// 将原始字节按格式排版为 UUID 字符串（大小写在最后一次性处理）
export function formatUuids(raw: Uint8Array, fmt: UuidFmt, upper: boolean): string[] {
  const out: string[] = new Array(raw.length / 16)
  for (let i = 0; i < raw.length; i += 16) {
    let s = ''
    for (let j = 0; j < 16; j++) s += HEX_LUT[raw[i + j]]
    if (fmt !== 'compact') {
      s = s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20)
    }
    if (fmt === 'braced') s = '{' + s + '}'
    else if (fmt === 'urn') s = 'urn:uuid:' + s
    out[i / 16] = upper ? s.toUpperCase() : s
  }
  return out
}

export interface RandOpts {
  len: number
  upper: boolean
  lower: boolean
  digit: boolean
  symbol: boolean
  custom: string
  excludeAmbiguous: boolean
  requireEach: boolean
}

const RAND_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const RAND_LOWER = 'abcdefghijklmnopqrstuvwxyz'
const RAND_DIGIT = '0123456789'
const RAND_SYMBOL = '!@#$%^&*()_+-=[]{}|;:,.<>?'
const RAND_AMBIGUOUS = '0O1lI'

export function randActiveClasses(o: RandOpts): number {
  let n = 0
  if (o.upper) n++
  if (o.lower) n++
  if (o.digit) n++
  if (o.symbol) n++
  if (o.custom) n++
  return n
}

// 生成 count 条随机字符串：无模偏采样 + 每类至少 1 个（Fisher-Yates 洗牌打散占位字符）
export function genRandomStrings(opts: RandOpts, count: number): string[] {
  const n = Math.max(1, Math.floor(count))
  const len = Math.max(1, Math.floor(opts.len))

  const classes: string[] = []
  if (opts.upper) classes.push(RAND_UPPER)
  if (opts.lower) classes.push(RAND_LOWER)
  if (opts.digit) classes.push(RAND_DIGIT)
  if (opts.symbol) classes.push(RAND_SYMBOL)
  const custom = [...new Set(opts.custom.split(''))].join('')
  if (custom) classes.push(custom)

  // 剔除易混淆字符（对池与各字符集同时生效）
  const clean = (s: string) =>
    opts.excludeAmbiguous ? [...s].filter(ch => !RAND_AMBIGUOUS.includes(ch)).join('') : s
  let pool = [...new Set(classes.map(clean).join('').split(''))]
  if (pool.length === 0) pool = [...RAND_UPPER] // 全被剔除时的兜底
  const effectiveClasses = classes.map(clean).filter(s => s.length > 0)
  const requireEach = opts.requireEach && len >= effectiveClasses.length && effectiveClasses.length > 0

  let bytes = randomBytes(65536)
  let pos = 0
  // 无模偏采样：丢弃 ≥ max 的字节，避免 % 引入偏差；耗尽自动换一块
  const randByte = (divisor: number): number => {
    const max = Math.floor(256 / divisor) * divisor
    while (true) {
      if (pos >= bytes.length) { bytes = randomBytes(65536); pos = 0 }
      const b = bytes[pos++]
      if (b < max) return b
    }
  }

  const out: string[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const arr: string[] = new Array(len)
    let idx = 0
    if (requireEach) {
      for (const s of effectiveClasses) arr[idx++] = s[randByte(s.length) % s.length]
    }
    while (idx < len) arr[idx++] = pool[randByte(pool.length) % pool.length]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randByte(i + 1) % (i + 1)
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
    }
    out[k] = arr.join('')
  }
  return out
}
