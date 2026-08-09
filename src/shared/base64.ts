export type B64DecodeResult = { ok: true; text: string; valid: boolean } | { ok: false; error: string }

export function encodeB64(s: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  const CHUNK = 0x8000 // 32K 分块：避免一次 apply 超大数组导致栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  let b64 = btoa(binary)
  if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64
}

export function decodeB64(s: string, lenient: boolean): B64DecodeResult {
  let clean = s
  if (lenient) {
    clean = clean.replace(/\s+/g, '')
    clean = clean.replace(/-/g, '+').replace(/_/g, '/')
    if (clean.length % 4 === 2) clean += '=='
    else if (clean.length % 4 === 3) clean += '='
  }
  let binary: string
  try {
    binary = atob(clean)
  } catch {
    return { ok: false, error: '无效的 Base64：字符集不合法或长度错误' }
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), valid: true }
  } catch {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), valid: false }
  }
}
