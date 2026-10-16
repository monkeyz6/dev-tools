// 上游身份指纹基线。只有两条独立链路实测都命中的值才 confirmed；未确认的只展示实测值，不参与判定。

export const MUSE_FINGERPRINTS = {
  /** 2026-10-16：ainowork 40/40、OpenRouter 59/59 的加密推理块都以此开头（OpenAI 是 Fernet 的 gAAAAA） */
  encryptedPrefix: { value: 'Q-PaDg', confirmed: true },
  /** 长文本 Token 差值（P1 − P0），按协议记。待两条链路实测一致后填入并置 confirmed */
  tokenDelta: {
    confirmed: false,
    values: { chat: null, responses: null, anthropic: null } as Record<'chat' | 'responses' | 'anthropic', number | null>,
  },
}

/** 加密推理块是否带 Meta 的前缀（只在基线已确认时为真）。 */
export const museEncryptedPrefixHit = (blob: string): boolean =>
  MUSE_FINGERPRINTS.encryptedPrefix.confirmed && String(blob || '').startsWith(MUSE_FINGERPRINTS.encryptedPrefix.value)
