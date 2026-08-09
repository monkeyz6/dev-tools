// API Key 用 AES-GCM 加密后再落盘，避免明文直接出现在 localStorage。
// 纯前端环境中的 passphrase 只能防止随手查看，不能抵御可执行页面 JS 的攻击者。
const KEY_PASSPHRASE = 'dev-toolkit-llmbatch-v1'

let keyPromise: Promise<CryptoKey> | null = null

function cryptoAvailable(): boolean {
  return typeof window !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle
}

function deriveKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(KEY_PASSPHRASE))
      .then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']))
  }
  return keyPromise
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  new Uint8Array(buffer).forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

export async function encryptLlmApiKey(plain: string): Promise<string> {
  if (!plain || !cryptoAvailable()) return ''
  const key = await deriveKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return bufferToBase64(iv.buffer) + '.' + bufferToBase64(cipher)
}

export async function decryptLlmApiKey(stored: string): Promise<string> {
  if (!stored || !cryptoAvailable()) return ''
  try {
    const [ivBase64, cipherBase64] = stored.split('.')
    if (!ivBase64 || !cipherBase64) return ''
    const key = await deriveKey()
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(ivBase64)) },
      key,
      base64ToBuffer(cipherBase64),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return ''
  }
}
