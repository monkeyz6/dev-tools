import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  imgCarrierCheck,
  imgClassifyGeminiPart,
  imgClassifyOpenAiImage,
  imgExpectedCarrier,
  imgIsGptImageModel,
} from './carrier.ts'

describe('imgIsGptImageModel', () => {
  it('去掉路径前缀后认 gpt-image / chatgpt-image，后面必须是结尾、- 或 .', () => {
    assert.equal(imgIsGptImageModel('gpt-image-2'), true)
    assert.equal(imgIsGptImageModel('openai/gpt-image-2'), true)
    assert.equal(imgIsGptImageModel('Org/GPT-Image-2.5'), true)
    assert.equal(imgIsGptImageModel('chatgpt-image'), true)
    assert.equal(imgIsGptImageModel('chatgpt-image-latest'), true)
    assert.equal(imgIsGptImageModel('gpt-image.2026'), true)
    assert.equal(imgIsGptImageModel('gpt-image-batch'), true)
    assert.equal(imgIsGptImageModel('gpt-imagefoo'), false)
    assert.equal(imgIsGptImageModel('chatgpt-imagefoo'), false)
    assert.equal(imgIsGptImageModel('my-gpt-image-2'), false)
    assert.equal(imgIsGptImageModel('dall-e-3'), false)
    assert.equal(imgIsGptImageModel(''), false)
  })
})

describe('imgExpectedCarrier', () => {
  it('GPT Image 始终要 b64_json，手写的 response_format 不改期望', () => {
    assert.equal(imgExpectedCarrier('openai', 'gpt-image-2', undefined), 'b64_json')
    assert.equal(imgExpectedCarrier('openai', 'openai/gpt-image-2', 'url'), 'b64_json')
    assert.equal(imgExpectedCarrier('openai', 'gpt-image-2', 'b64_json'), 'b64_json')
  })

  it('认不出的 OpenAI 模型只在请求写了 response_format 时才判', () => {
    assert.equal(imgExpectedCarrier('openai', 'dall-e-3', undefined), null)
    assert.equal(imgExpectedCarrier('openai', 'dall-e-3', ''), null)
    assert.equal(imgExpectedCarrier('openai', 'dall-e-3', 'url'), 'http-url')
    assert.equal(imgExpectedCarrier('openai', 'dall-e-3', 'b64_json'), 'b64_json')
    assert.equal(imgExpectedCarrier('openai', 'custom-gateway-model', 'weird'), null)
  })

  it('Gemini 始终要 inline，Grok / Seedream / 火山跟随请求，缺省是 url', () => {
    assert.equal(imgExpectedCarrier('gemini', 'gemini-3-pro-image', 'url'), 'inline')
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', undefined), 'http-url')
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', ''), 'http-url')
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', 'url'), 'http-url')
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', 'b64_json'), 'b64_json')
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', 'weird'), null)
    assert.equal(imgExpectedCarrier('seedream', 'doubao-seedream-5-0-pro', undefined), 'http-url')
    assert.equal(imgExpectedCarrier('volcanoArk', 'doubao-seedream-5-0-pro', 'b64_json'), 'b64_json')
  })
})

describe('imgClassifyOpenAiImage', () => {
  it('http(s) 优先于旁边的 b64_json；data: 写在 url 里单独成一档', () => {
    assert.deepEqual(imgClassifyOpenAiImage({ b64_json: 'abc' }), { carrier: 'b64_json', url: null, b64: 'abc' })
    assert.deepEqual(imgClassifyOpenAiImage({ b64_json: 'data:image/png;base64,abc' }), {
      carrier: 'b64_prefixed', url: null, b64: 'data:image/png;base64,abc',
    })
    assert.equal(imgClassifyOpenAiImage({ url: 'https://cdn.example/a.png', b64_json: 'abc' })?.carrier, 'http-url')
    assert.equal(imgClassifyOpenAiImage({ url: ' HTTP://cdn.example/a.png ' })?.carrier, 'http-url')
    assert.equal(imgClassifyOpenAiImage({ url: 'data:image/png;base64,xx', b64_json: 'abc' })?.carrier, 'data-url')
    assert.equal(imgClassifyOpenAiImage({ url: 'ftp://cdn.example/a.png' })?.carrier, 'other-url')
    assert.equal(imgClassifyOpenAiImage({}), null)
    assert.equal(imgClassifyOpenAiImage({ url: ' ', b64_json: '' }), null)
  })
})

describe('imgClassifyGeminiPart', () => {
  it('inline 通过；同一 part 上多带的文件地址只当附带信息，仍按 inline 判', () => {
    assert.equal(imgClassifyGeminiPart({ inlineData: { mimeType: 'image/png', data: 'abc' } })?.carrier, 'inline')
    assert.equal(imgClassifyGeminiPart({ inline_data: { mime_type: 'image/png', data: 'data:image/png;base64,abc' } })?.carrier, 'inline_prefixed')
    const both = imgClassifyGeminiPart({
      inlineData: { mimeType: 'image/png', data: 'abc' },
      fileData: { mimeType: 'image/png', fileUri: 'https://cdn.example/a.png' },
    })
    assert.equal(both?.carrier, 'inline')
    assert.equal(both?.inline, 'abc')
    assert.equal(both?.url, 'https://cdn.example/a.png')
    assert.equal(imgClassifyGeminiPart({
      inlineData: { data: 'abc' },
      fileData: { fileUri: 'data:image/png;base64,xx' },
    })?.carrier, 'inline')
  })

  it('只有文件地址的成图 part 记为图片；非图片和来源引用不算', () => {
    assert.equal(imgClassifyGeminiPart({ fileData: { mimeType: 'image/png', fileUri: 'https://cdn.example/a.png' } })?.carrier, 'http-url')
    assert.equal(imgClassifyGeminiPart({ fileData: { fileUri: 'https://cdn.example/a.png' } })?.carrier, 'http-url')
    assert.equal(imgClassifyGeminiPart({ fileData: { mimeType: 'image/png', fileUri: 'gs://bucket/a.png' } })?.carrier, 'other-url')
    assert.equal(imgClassifyGeminiPart({ fileData: { fileUri: 'data:image/png;base64,xx' } })?.carrier, 'data-url')
    assert.equal(imgClassifyGeminiPart({ fileData: { mimeType: 'video/mp4', fileUri: 'https://cdn.example/a.mp4' } }), null)
    assert.equal(imgClassifyGeminiPart({ inlineData: { mimeType: 'text/plain', data: 'abc' } }), null)
    assert.equal(imgClassifyGeminiPart({ thought: true, inlineData: { data: 'abc' } } as never)?.carrier, 'inline')
    assert.equal(imgClassifyGeminiPart({ uri: 'https://example.com/a.png' } as never), null)
  })
})

describe('Gemini part 的双载体与 mime 宽松', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('同一个 part 既有 inline 又有 fileUri：按 inline 判', () => {
    const hit = imgClassifyGeminiPart({
      inlineData: { mimeType: 'image/png', data: PNG },
      fileData: { mimeType: 'image/png', fileUri: 'https://cdn.example/a.png' },
    })
    assert.equal(hit?.carrier, 'inline')
    assert.equal(hit?.inline, PNG)
    assert.equal(imgCarrierCheck({
      apiType: 'gemini', model: 'gemini-3-pro-image', images: [{ carrier: hit!.carrier, url: hit!.url }],
    })?.pass, true)
  })

  it('mime 不是 image/* 但文件头是图：接受并按文件头改写 mime；非图仍丢弃', () => {
    const hit = imgClassifyGeminiPart({ inlineData: { mimeType: 'application/octet-stream', data: PNG } })
    assert.equal(hit?.carrier, 'inline')
    assert.equal(hit?.mime, 'image/png')
    assert.equal(imgClassifyGeminiPart({ inlineData: { mimeType: 'application/octet-stream', data: 'aGVsbG8gd29ybGQ=' } }), null)
    assert.equal(imgClassifyGeminiPart({ inlineData: { mimeType: 'audio/wav', data: 'UklGRgAAAABXQVZF' } }), null)
  })
})

describe('response_format 大小写', () => {
  it('URL / B64_JSON 与小写等价', () => {
    assert.equal(imgExpectedCarrier('grok', 'grok-imagine-image', 'B64_JSON'), 'b64_json')
    assert.equal(imgExpectedCarrier('openai', 'dall-e-3', ' URL '), 'http-url')
  })
})

describe('imgCarrierCheck', () => {
  const image = (carrier: string, url: string | null = null) => ({ carrier: carrier as never, url })

  it('要 b64 时官方字段通过，http(s) 和写进 url 的 data:image 不通过', () => {
    const pass = imgCarrierCheck({ apiType: 'openai', model: 'gpt-image-2', images: [image('b64_json')] })
    assert.deepEqual(pass, { name: '返回载体', target: 'b64_json', actual: 'b64_json', pass: true })
    assert.equal(imgCarrierCheck({
      apiType: 'openai', model: 'gpt-image-2', responseFormat: 'url', images: [image('b64_prefixed')],
    })?.pass, true)
    assert.equal(imgCarrierCheck({
      apiType: 'seedream', model: 'doubao-seedream-5-0-pro', responseFormat: 'b64_json', images: [image('b64_prefixed')],
    })?.pass, true)
    assert.equal(imgCarrierCheck({
      apiType: 'volcanoArk', model: 'doubao-seedream-5-0-pro', responseFormat: 'b64_json', images: [image('b64_prefixed')],
    })?.pass, true)

    const url = imgCarrierCheck({ apiType: 'openai', model: 'gpt-image-2', images: [image('http-url', 'https://cdn.example/a.png')] })
    assert.equal(url?.pass, false)
    assert.equal(url?.actual, 'http(s) url')
    assert.equal(imgCarrierCheck({ apiType: 'openai', model: 'gpt-image-2', images: [image('data-url')] })?.actual, 'data:image（写在 url 字段）')
  })

  it('Grok 的 b64_json 不能带 data: 前缀；URL 模式旁带 b64 仍通过', () => {
    const prefixed = imgCarrierCheck({
      apiType: 'grok', model: 'grok-imagine-image', responseFormat: 'b64_json', images: [image('b64_prefixed')],
    })
    assert.equal(prefixed?.pass, false)
    assert.equal(prefixed?.actual, 'b64_json（带 data: 前缀）')
    assert.equal(imgCarrierCheck({
      apiType: 'grok', model: 'grok-imagine-image', responseFormat: 'url', images: [image('http-url', 'https://imgen.x.ai/a.png')],
    })?.pass, true)
    assert.equal(imgCarrierCheck({
      apiType: 'grok', model: 'grok-imagine-image', images: [image('b64_json')],
    })?.pass, false)
    assert.equal(imgCarrierCheck({
      apiType: 'seedream', model: 'doubao-seedream-5-0-pro', responseFormat: 'url', images: [image('data-url', 'data:image/png;base64,xx')],
    })?.pass, false)
  })

  it('Gemini 认 inline，多图只把失败的那张写出来', () => {
    assert.equal(imgCarrierCheck({ apiType: 'gemini', model: 'gemini-3-pro-image', images: [image('inline')] })?.target, 'inlineData')
    assert.equal(imgCarrierCheck({ apiType: 'gemini', model: 'gemini-3-pro-image', images: [image('inline_prefixed')] })?.pass, true)
    const mixed = imgCarrierCheck({
      apiType: 'gemini',
      model: 'gemini-3-pro-image',
      images: [image('inline'), image('http-url', 'https://cdn.example/a.png')],
    })
    assert.equal(mixed?.pass, false)
    assert.equal(mixed?.actual, '图2 http(s) url')
    assert.equal(imgCarrierCheck({ apiType: 'gemini', model: 'gemini-3-pro-image', images: [image('other-url', 'gs://bucket/a.png')] })?.actual, '非官方地址')
  })

  it('没有 carrier：http(s) / data: 按 url 判，没有 url 判未识别且不通过', () => {
    assert.equal(imgCarrierCheck({
      apiType: 'grok', model: 'grok-imagine-image', responseFormat: 'url',
      images: [{ url: 'https://cdn.example/a.png' }, { url: 'https://cdn.example/b.png' }],
    })?.pass, true)
    const none = imgCarrierCheck({ apiType: 'openai', model: 'gpt-image-2', images: [{ url: null }] })
    assert.equal(none?.pass, false)
    assert.equal(none?.actual, '未识别')
    assert.equal(imgCarrierCheck({
      apiType: 'gemini', model: 'gemini-3-pro-image', images: [{ url: null }],
    })?.pass, false)
    assert.equal(imgCarrierCheck({
      apiType: 'grok', model: 'grok-imagine-image', responseFormat: 'url', images: [{ url: 'data:image/png;base64,xx' }],
    })?.pass, false)
  })

  it('不该判的时候不产出校验项', () => {
    assert.equal(imgCarrierCheck({ apiType: 'openai', model: 'dall-e-3', images: [image('http-url')] }), null)
    assert.equal(imgCarrierCheck({ apiType: 'grok', model: 'grok-imagine-image', responseFormat: 'weird', images: [image('http-url')] }), null)
    assert.equal(imgCarrierCheck({ apiType: 'openai', model: 'gpt-image-2', images: [] }), null)
  })
})
