export type UniFmt = 'js' | 'es6' | 'htmlHex' | 'htmlDec' | 'codePoint' | 'percent'

export const UNI_FORMATS: { value: UniFmt; label: string; hint: string }[] = [
  { value: 'js', label: '\\uXXXX（JS / JSON）', hint: 'UTF-16 单元，非 BMP 字符拆为代理对' },
  { value: 'es6', label: '\\u{XXXXX}（ES6）', hint: '按码点输出，直接支持 emoji' },
  { value: 'htmlHex', label: '&#x4E2D;（HTML 十六进制）', hint: 'HTML 实体，十六进制码点' },
  { value: 'htmlDec', label: '&#20013;（HTML 十进制）', hint: 'HTML 实体，十进制码点' },
  { value: 'codePoint', label: 'U+4E2D（标准记法）', hint: 'Unicode 标准码点记法' },
  { value: 'percent', label: '%u4E2D（旧 escape）', hint: 'UTF-16 单元，%u 旧式 URL 编码' },
]

const uniHex = (n: number, lower: boolean) => (lower ? n.toString(16) : n.toString(16).toUpperCase())
const uniHex4 = (n: number, lower: boolean) => uniHex(n, lower).padStart(4, '0')

// 编码：按码点迭代，正确处理代理对；结果 push 进数组，避免字符串 += 累加
export function encodeUnicode(s: string, fmt: UniFmt, onlyNonAscii: boolean, lowerHex: boolean): string {
  const parts: string[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (onlyNonAscii && cp < 0x80) { parts.push(ch); continue }
    if (fmt === 'js' || fmt === 'percent') {
      const hi = ch.charCodeAt(0)
      const escaped = fmt === 'js' ? '\\u' : '%u'
      if (hi >= 0xd800 && hi <= 0xdbff && ch.length === 2) {
        parts.push(escaped + uniHex4(hi, lowerHex) + escaped + uniHex4(ch.charCodeAt(1), lowerHex))
      } else {
        parts.push(escaped + uniHex4(hi, lowerHex))
      }
    } else if (fmt === 'es6') {
      parts.push('\\u{' + uniHex(cp, lowerHex) + '}')
    } else if (fmt === 'htmlHex') {
      parts.push('&#x' + uniHex(cp, lowerHex) + ';')
    } else if (fmt === 'htmlDec') {
      parts.push('&#' + cp + ';')
    } else {
      parts.push('U+' + uniHex(cp, lowerHex) + ' ')
    }
  }
  return parts.join('')
}

// 解码：单趟正则混合识别 6 种写法，可混在同一段文本
const UNI_DECODE_RE = /\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|%u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]{1,6});|&#(\d{1,7});|U\+([0-9a-fA-F]{4,6})\s?/g

export function decodeUnicode(s: string): string {
  const parts: string[] = []
  let last = 0
  UNI_DECODE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = UNI_DECODE_RE.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1] !== undefined) parts.push(String.fromCodePoint(parseInt(m[1], 16)))
    else if (m[2] !== undefined || m[3] !== undefined) parts.push(String.fromCharCode(parseInt((m[2] ?? m[3])!, 16)))
    else if (m[4] !== undefined) parts.push(String.fromCodePoint(parseInt(m[4], 16)))
    else if (m[5] !== undefined) parts.push(String.fromCodePoint(parseInt(m[5], 10)))
    else if (m[6] !== undefined) parts.push(String.fromCodePoint(parseInt(m[6], 16)))
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts.join('')
}
