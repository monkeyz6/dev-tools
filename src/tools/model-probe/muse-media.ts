// Muse Wonder 多模态用例的内嵌素材。全部前端生成或内置，不依赖公网。

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

/** 一页 Helvetica 文本 PDF，正文是口令。口令只允许字母数字和连字符，免得转义 PDF 字符串。 */
export function musePdfBase64(code: string): string {
  const safe = String(code).replace(/[^A-Za-z0-9-]/g, '')
  const stream = `BT /F1 32 Tf 72 700 Td (The code is ${safe}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return btoa(pdf)
}

export const MUSE_WAV_SAMPLE_RATE = 16000
export const MUSE_BEEP_HZ = 440
export const MUSE_BEEP_MS = 200
export const MUSE_GAP_MS = 400
const LEAD_MS = 300
const FADE_MS = 10

/** 16kHz 单声道 16-bit PCM wav：开头 300ms 静音，之后 n 声 440Hz 哔声，每声 200ms、间隔 400ms。 */
export function museBeepWavBytes(n: number): Uint8Array {
  const count = Math.max(1, Math.floor(n))
  const rate = MUSE_WAV_SAMPLE_RATE
  const ms = (v: number) => Math.round((rate * v) / 1000)
  const total = ms(LEAD_MS) + count * (ms(MUSE_BEEP_MS) + ms(MUSE_GAP_MS))
  const dataBytes = total * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buf)
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  const beep = ms(MUSE_BEEP_MS)
  const fade = ms(FADE_MS)
  let pos = ms(LEAD_MS)
  for (let b = 0; b < count; b++) {
    for (let i = 0; i < beep; i++) {
      const env = Math.min(1, i / fade, (beep - 1 - i) / fade)
      const v = Math.round(Math.sin((2 * Math.PI * MUSE_BEEP_HZ * i) / rate) * env * 0.6 * 32767)
      view.setInt16(44 + (pos + i) * 2, v, true)
    }
    pos += beep + ms(MUSE_GAP_MS)
  }
  return new Uint8Array(buf)
}

export const museBeepWavBase64 = (n: number): string => bytesToBase64(museBeepWavBytes(n))

/** ffmpeg 生成：2 秒、128×128、8fps、纯色 #1D4ED8（蓝）、H.264 baseline、无音轨。 */
export const MUSE_BLUE_MP4_B64 = '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'

/**
 * Computer use 截图：320×200 浅灰底，上方一行「Setup complete」，下方蓝色按钮「Continue」。
 * 开发时用标准库手写 5×7 点阵字体生成，不依赖字体文件。
 */
export const MUSE_CONTINUE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAADO0lEQVR42u3cO04DMRRA0WyBjg0gFsbyKUG00FAgkYme/Z5/0olOgciHGWtu5Ikn3D4+v4BD3QwBCBgQMCBgEDAgYEDAgIBBwICAAQGDgAEBAwIGBAwCBgQMCBgQMAgYEDAgYBAwIGBAwICAQcCAgAEBAwIGAQMCBgQMAgYEDAgYEDAIGBAwIOBWT8+vd/W9jqMnMs751zGeAhawgAV8/iG156sZc+MsYAELWMAOpnvT7Pi9j//W399XTeZbtyqyX1d70brNkXsz49z6SAELWMACFvBOH2K1hhc/NCMB5yeNkce3bk/k575xmz/OAhawgAUs4BOm1ldTxHEBz1nQqg04P4WuHefakxEBC1jAAhbwuoD7sol//FM7zauarmceM26K2zrOlpEELGABC/jkiyj7FjAi9447+KqWkWrf4OaPs2UkAQtYwAIGBAwIGAQMCBgQMCBgEDAgYEDAIGBAwICAAQGDgAEBAwIGARsFEDAgYEDAIGBAwICAAQGDgAEBAwIGAQMCBgQMCBgEDAgYEDAgYBAwIGBAwCBgQMCAgAEBg4ABAQMCBgQMAgYEDAgYBAwIGBAwIGAQMCBgQMC/Xt7eoYmABYyABSxgBCxgELCAEbCABYyABSxgBCxgELCAEbCABYyABTw84O/r2ybHX3J7dtsdAQtYwAIWsIAFLGABHxpw5LDe5NBXoIAFLGABC1jAAhawgE8JuOrM+f9dTc/qOzlvelZyC/vGedqnDwIWsIAFLGABC1jAAl4Y8JIYJiwjJd+G+kZj2mm/gAUsYAELWMACFrCAzw04ea64dsGsPODITcACFrCABSxgAQtYwKdfibVbwOPiTO7XgxTnX1gmYAELWMACFrCABSzgHb4PnLwSa9xiz5It7MvVlVgCFrCABSxgAQtYwP4rJb4PLGABI2ABg4AFjIAFLGAELGABI2ABI2ABCxgBC1jACFjAIGABI2ABAwIGBAwCBgQMCBgEDAgYEDAgYBAwIGBAwICAQcCAgAEBg4ABAQMCBgQMAgYEDAgYBGwUQMCAgAEBg4ABAQMCBgQMAgYEDAgYBAwIGBAwIGAQMCBgQMCAgEHAgIABAYOAAQEDM/wAIWkfSFXIeTwAAAAASUVORK5CYII='

/**
 * Token 指纹文本（v1）。中英日韩混排、emoji、代码、长数字和罕见 Unicode，不同分词器算出来差得远。
 * 基线按这段原文实测，改动任何一个字符都要重新校准 MUSE_FINGERPRINTS 里的差值。
 */
export const MUSE_TOKEN_FINGERPRINT_TEXT = [
  'Tokenizer fingerprint v1. Do not answer this block.',
  '中文段落：模型探测用固定文本校准分词器，请勿修改本段内容。龘靐齉爩，饕餮耄耋。',
  '日本語：東京スカイツリーの高さは634メートルです。한국어 문장도 함께 넣었습니다.',
  'Emoji: 🧪🚀👩🏽‍💻🇯🇵✅🔥 — “smart quotes”, ellipsis… and a tab\there.',
  'Code: const xs = [3.14159, 2.71828, 1.41421].map((n) => n ** 2); // ok',
  'Numbers: 9007199254740993 0x1F4A9 1e-308 3,141,592,653 ½ ¾ ⅞ 0.000000123',
  'Rare: ꙮ 𓂀 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 Ⅻ ∮∯∰ ﷽ Ꭿ ǅ',
  'URL: https://example.com/a_b-c?d=1&e=%E4%BD%A0#frag',
].join('\n')
