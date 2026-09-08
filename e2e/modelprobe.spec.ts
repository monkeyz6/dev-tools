import { test, expect } from '@playwright/test'
import { goto, inputByLabel, readKv, channelCard } from './helpers'
import { readFileSync } from 'fs'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

const CHAT_OK = (promptTokens: number, cached = 0, extra: { content?: string; finishReason?: string; toolName?: string } = {}) => JSON.stringify({
  id: 'chatcmpl-probe',
  choices: [{
    message: extra.toolName
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: extra.toolName, arguments: '{"city":"Shanghai"}' } }] }
      : { role: 'assistant', content: extra.content ?? 'OK' },
    finish_reason: extra.finishReason ?? (extra.toolName ? 'tool_calls' : 'stop'),
  }],
  usage: { prompt_tokens: promptTokens, completion_tokens: 5, prompt_tokens_details: { cached_tokens: cached } },
})
const RESPONSES_OK = (extra: { text?: string; status?: string; reason?: string; toolName?: string } = {}) => JSON.stringify({
  id: 'resp-probe',
  status: extra.status ?? (extra.reason ? 'incomplete' : 'completed'),
  incomplete_details: extra.reason ? { reason: extra.reason } : undefined,
  output: extra.toolName
    ? [{ type: 'function_call', name: extra.toolName, arguments: '{"city":"Shanghai"}' }]
    : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: extra.text ?? 'OK' }] }],
  usage: { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } },
})
const ANTHROPIC_OK = (extra: { text?: string; stop?: string; toolName?: string } = {}) => JSON.stringify({
  id: 'msg-probe',
  stop_reason: extra.stop ?? (extra.toolName ? 'tool_use' : 'end_turn'),
  content: extra.toolName
    ? [{ type: 'tool_use', id: 'toolu_1', name: extra.toolName, input: { city: 'Shanghai' } }]
    : [{ type: 'text', text: extra.text ?? 'OK' }],
  usage: { input_tokens: 8, output_tokens: 3, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
})

function extractPrompt(body: any): string {
  const parts: string[] = []
  if (typeof body?.instructions === 'string') parts.push(body.instructions)
  if (typeof body?.input === 'string') parts.push(body.input)
  const msgs = body?.messages || (Array.isArray(body?.input) ? body.input : [])
  for (const m of msgs) {
    if (typeof m?.content === 'string') parts.push(m.content)
    else if (Array.isArray(m?.content)) {
      for (const c of m.content) {
        if (typeof c === 'string') parts.push(c)
        else if (c && typeof c === 'object') parts.push(c.text || c.input_text || c.output_text || '')
      }
    }
  }
  return parts.join('\n')
}
function capOf(body: any): number | undefined {
  return body?.max_completion_tokens ?? body?.max_output_tokens ?? body?.max_tokens
}
function isForcedWeather(body: any): boolean {
  const choice = body?.tool_choice
  if (!choice || choice === 'auto' || choice?.type === 'auto') return false
  const name = choice?.function?.name || choice?.name
  return name === 'get_weather' || choice?.type === 'tool'
}
function hasImage(body: any): boolean {
  return /image_url|"type":"image"|input_image/.test(JSON.stringify(body || {}))
}
function smartChat(body: any, promptTokens = 12): string {
  const text = extractPrompt(body)
  if (capOf(body) === 16 && text.includes('Count from 1 to 200')) return CHAT_OK(promptTokens, 0, { content: '1 2 3', finishReason: 'length' })
  if (isForcedWeather(body)) return CHAT_OK(promptTokens, 0, { toolName: 'get_weather' })
  if (body?.response_format || body?.text?.format || body?.output_config) return CHAT_OK(promptTokens, 0, { content: '{"ok":true}' })
  if (text.includes('SYSTEM_OK')) return CHAT_OK(promptTokens, 0, { content: 'SYSTEM_OK' })
  if (text.includes('only the codeword')) return CHAT_OK(promptTokens, 0, { content: 'ORBIT' })
  if (text.includes('Remember the codeword')) return CHAT_OK(promptTokens, 0, { content: 'Acknowledged.' })
  if (hasImage(body)) return CHAT_OK(promptTokens, 0, { content: 'red' })
  return CHAT_OK(promptTokens)
}
function smartResponses(body: any): string {
  const text = extractPrompt(body)
  if (capOf(body) === 16 && text.includes('Count from 1 to 200')) return RESPONSES_OK({ text: '1 2 3', status: 'incomplete', reason: 'max_output_tokens' })
  if (isForcedWeather(body)) return RESPONSES_OK({ toolName: 'get_weather' })
  if (body?.response_format || body?.text?.format || body?.output_config) return RESPONSES_OK({ text: '{"ok":true}' })
  if (text.includes('SYSTEM_OK')) return RESPONSES_OK({ text: 'SYSTEM_OK' })
  if (text.includes('only the codeword')) return RESPONSES_OK({ text: 'ORBIT' })
  if (text.includes('Remember the codeword')) return RESPONSES_OK({ text: 'Acknowledged.' })
  if (hasImage(body)) return RESPONSES_OK({ text: 'red' })
  return RESPONSES_OK()
}
function smartAnthropic(body: any): string {
  const text = extractPrompt(body)
  if (capOf(body) === 16 && text.includes('Count from 1 to 200')) return ANTHROPIC_OK({ text: '1 2 3', stop: 'max_tokens' })
  if (isForcedWeather(body)) return ANTHROPIC_OK({ toolName: 'get_weather' })
  if (body?.response_format || body?.text?.format || body?.output_config) return ANTHROPIC_OK({ text: '{"ok":true}' })
  if (text.includes('SYSTEM_OK')) return ANTHROPIC_OK({ text: 'SYSTEM_OK' })
  if (text.includes('only the codeword')) return ANTHROPIC_OK({ text: 'ORBIT' })
  if (text.includes('Remember the codeword')) return ANTHROPIC_OK({ text: 'Acknowledged.' })
  if (hasImage(body)) return ANTHROPIC_OK({ text: 'red' })
  return ANTHROPIC_OK()
}

const check = (page: import('@playwright/test').Page, id: string) => page.locator(`input[data-id="${id}"]`).check()
const uncheck = (page: import('@playwright/test').Page, id: string) => page.locator(`input[data-id="${id}"]`).uncheck()

// 渠道管理已取代左侧栏直填 Base URL/API Key（见「渠道管理」Tab）：新增一个渠道并保存，
// 首个渠道会自动设为当前使用。「模型名称」与「测试连接」都仍在左侧栏（不随右侧 Tab 切换），
// 所以新增渠道后不需要手动切回「实时进度」再继续操作。
async function addChannel(page: import('@playwright/test').Page, opts: { apiKey: string; baseUrl?: string; name?: string }) {
  await page.getByRole('button', { name: /渠道管理/ }).click()
  await inputByLabel(page, '渠道名称').fill(opts.name ?? '测试渠道')
  await inputByLabel(page, 'Base URL').fill(opts.baseUrl ?? 'https://api.openai.com')
  await inputByLabel(page, 'apiKey').fill(opts.apiKey)
  await page.getByRole('button', { name: '保存渠道' }).click()
}

/** 新增渠道 + 填模型 + 开始测试（弹窗确认）。调用前应先完成测试项勾选（勾选控件在「实时进度」面板里）。 */
async function setupRun(page: import('@playwright/test').Page, name: string, opts: { apiKey?: string } = {}) {
  await addChannel(page, { apiKey: opts.apiKey ?? 'sk-test-probe' })
  await inputByLabel(page, '模型名称').fill('probe-model')
  await page.getByRole('button', { name: '▶ 开始测试' }).click()
  await page.getByRole('dialog').locator('input').fill(name)
  await page.getByRole('button', { name: '确认并开始' }).click()
}

test.describe('模型探测', () => {
  test('基础三格式通过：报告统计 + 日志展示 token 用量 / 缓存读写 / request id', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-oneapi-request-id': 'req-chat-0001', 'access-control-expose-headers': '*' }, body: CHAT_OK(12, 3) }))
    await page.route('**/v1/responses', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-request-id': 'req-resp-0002', 'access-control-expose-headers': '*' }, body: RESPONSES_OK() }))
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-oneapi-request-id': 'req-anth-0003', 'access-control-expose-headers': '*' }, body: ANTHROPIC_OK() }))

    await goto(page, /模型探测/)
    // 勾选控件在「实时进度」面板（默认面板），需在切去「渠道管理」之前完成
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'responses-basic', 'anthropic-basic']) await check(page, id)
    await setupRun(page, 'e2e-基础三格式')

    const main = page.locator('main')
    await expect(main).toContainText('OpenAI Chat Completions', { timeout: 10000 })
    await expect(main).toContainText('OpenAI Responses')
    await expect(main).toContainText('Anthropic Messages')
    await expect(main).toContainText('通过 3')
    await expect(main.getByRole('button', { name: /OpenAI Chat Completions/ })).toContainText('↑12 ↓5')
    await expect(main.getByRole('button', { name: /OpenAI Responses/ })).toContainText('↑10 ↓4')
    await expect(main.getByRole('button', { name: /Anthropic Messages/ })).toContainText('↑8 ↓3')

    // 请求日志：token 用量、缓存读写、request id 一键复制
    await page.getByRole('button', { name: /请求日志/ }).click()
    await expect(main).toContainText('req-chat-0001')
    await expect(main).toContainText('req-anth-0003')
    await expect(main).toContainText('↑12 ↓5 缓存读3 写—')
    await expect(main).toContainText('↑8 ↓3 缓存读5 写0')
  })

  test('参数降级：错误信息命中参数名则标不支持，其余参数组合通过', async ({ page }) => {
    let paramCall = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.temperature !== undefined) {
        paramCall++
        if (paramCall === 1) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'unknown parameter: temperature' } }) })
          return
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(20) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    for (const id of ['temperature', 'top_p', 'reasoning_effort', 'max_tokens', 'structured_output', 'tool_calling']) await check(page, id)
    await setupRun(page, 'e2e-参数降级')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /temperature/ })).toBeVisible({ timeout: 10000 })
    await main.getByRole('button', { name: /temperature/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('unknown parameter: temperature')
    // 请求头 / 请求体两个代码块右上角各有一个复制图标
    await expect(dialog.getByRole('button', { name: '复制' })).toHaveCount(2)
    await dialog.getByRole('button', { name: '关闭' }).click()
    await main.getByRole('button', { name: /top_p/ }).click()
    await expect(page.getByRole('dialog')).toContainText('组合请求通过')
  })

  test('工具调用：combo auto 后再发强制 get_weather', async ({ page }) => {
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    const anthropicBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.tools) chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      if (body?.tools) responsesBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartResponses(body) })
    })
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      if (body?.tools) anthropicBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartAnthropic(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'responses-basic', 'anthropic-basic', 'tool_calling']) await check(page, id)
    await expect(page.locator('main')).toContainText('接受 tools，并强制调用 get_weather')
    await setupRun(page, 'e2e-工具调用形状')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /工具调用/ })).toHaveCount(3, { timeout: 10000 })
    await expect(main).toContainText('已调用 get_weather')

    await page.getByRole('button', { name: /请求日志/ }).click()
    await page.getByRole('combobox').selectOption('tool_calling')
    await main.getByText('工具调用（Chat Completions）', { exact: true }).click()
    await expect(main).toContainText('"name": "get_weather"')
    await expect(main).toContainText('"tool_choice": "auto"')
    await expect(main).toContainText('SN20260705888')
    await main.getByText('工具调用 语义（Chat Completions）', { exact: true }).click()
    await expect(main).toContainText('"function": {')

    expect(chatBodies).toHaveLength(2)
    expect(responsesBodies).toHaveLength(2)
    expect(anthropicBodies).toHaveLength(2)

    const chat = chatBodies.find(b => b.tool_choice === 'auto')
    expect(chat.tools[0].function.name).toBe('get_weather')
    expect(chat.tools[0].function.parameters.required).toEqual(['city'])
    expect(chat.tools[1].function.name).toBe('query_order')
    expect(chat.stream).toBeUndefined()
    expect(String(chat.messages?.[0]?.content)).toContain('上海')
    expect(String(chat.messages?.[0]?.content)).toContain('SN20260705888')
    const chatForced = chatBodies.find(b => b.tool_choice?.function?.name === 'get_weather')
    expect(chatForced.tools).toHaveLength(1)
    expect(chatForced.tool_choice).toEqual({ type: 'function', function: { name: 'get_weather' } })

    const responses = responsesBodies.find(b => b.tool_choice === 'auto')
    expect(responses.tools[0].name).toBe('get_weather')
    expect(responses.tools[0].type).toBe('function')
    expect(responses.tools[0].function).toBeUndefined()
    expect(responses.tools[1].name).toBe('query_order')
    expect(responses.stream).toBeUndefined()
    expect(responses.max_output_tokens).toBeUndefined()
    expect(responses.input[0].type).toBe('message')
    expect(responses.input[0].content[0].text).toContain('上海')
    const responsesForced = responsesBodies.find(b => b.tool_choice?.name === 'get_weather')
    expect(responsesForced.tool_choice).toEqual({ type: 'function', name: 'get_weather' })

    const anthropic = anthropicBodies.find(b => b.tool_choice?.type === 'auto')
    expect(anthropic.tools[0].name).toBe('get_weather')
    expect(anthropic.tools[0].input_schema.required).toEqual(['city'])
    expect(anthropic.tools[1].name).toBe('query_order')
    expect(String(anthropic.messages?.[0]?.content)).toContain('上海')
    const anthropicForced = anthropicBodies.find(b => b.tool_choice?.type === 'tool')
    expect(anthropicForced.tool_choice).toEqual({ type: 'tool', name: 'get_weather' })
  })

  test('工具调用：thinking 模式拒绝强制 tool_choice 时降级 auto', async ({ page }) => {
    const thinkingErr = JSON.stringify({
      error: {
        message: 'The tool_choice parameter does not support being set to required or object in thinking mode',
        type: 'invalid_request_error',
        code: 'invalid_parameter_error',
      },
    })
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    const anthropicBodies: any[] = []
    const fulfillTools = async (
      route: import('@playwright/test').Route,
      bag: any[],
      ok: (body: any) => string,
    ) => {
      const body = route.request().postDataJSON()
      if (body?.tools) bag.push(body)
      if (isForcedWeather(body)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: thinkingErr })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: ok(body) })
    }
    const forceTool = (body: any) => extractPrompt(body).includes('must call the get_weather')
    await page.route('**/v1/chat/completions', route => fulfillTools(route, chatBodies, b => CHAT_OK(12, 0, forceTool(b) ? { toolName: 'get_weather' } : {})))
    await page.route('**/v1/responses', route => fulfillTools(route, responsesBodies, b => forceTool(b) ? RESPONSES_OK({ toolName: 'get_weather' }) : RESPONSES_OK()))
    await page.route('**/v1/messages', route => fulfillTools(route, anthropicBodies, b => forceTool(b) ? ANTHROPIC_OK({ toolName: 'get_weather' }) : ANTHROPIC_OK()))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'responses-basic', 'anthropic-basic', 'tool_calling']) await check(page, id)
    await setupRun(page, 'e2e-thinking强制tool_choice降级')

    const tiles = page.locator('main').getByRole('button', { name: /工具调用/ })
    await expect(tiles).toHaveCount(3, { timeout: 10000 })
    await expect(tiles.filter({ hasText: 'Chat Completions' })).toContainText('通过')
    await expect(tiles.filter({ hasText: 'Responses' })).toContainText('通过')
    await expect(tiles.filter({ hasText: 'Anthropic' })).toContainText('通过')
    await expect(page.locator('main')).toContainText('已用 auto 核验')
    await expect(page.locator('main')).toContainText('已调用 get_weather')

    const chatForced = chatBodies.find(b => b.tool_choice?.function?.name === 'get_weather')
    const chatAuto = chatBodies.find(b => b.tool_choice === 'auto' && extractPrompt(b).includes('must call the get_weather'))
    expect(chatForced).toBeTruthy()
    expect(chatAuto).toBeTruthy()
    expect(chatAuto.tools).toHaveLength(1)

    const respForced = responsesBodies.find(b => b.tool_choice?.name === 'get_weather')
    const respAuto = responsesBodies.find(b => b.tool_choice === 'auto' && extractPrompt(b).includes('must call the get_weather'))
    expect(respForced).toBeTruthy()
    expect(respAuto).toBeTruthy()

    const anthForced = anthropicBodies.find(b => b.tool_choice?.type === 'tool')
    const anthAuto = anthropicBodies.find(b => b.tool_choice?.type === 'auto' && extractPrompt(b).includes('must call the get_weather'))
    expect(anthForced).toBeTruthy()
    expect(anthAuto).toBeTruthy()
    expect(anthAuto.max_tokens).toBe(120)
  })

  test('工具调用：非思考模式的 tool_choice 不支持不降级', async ({ page }) => {
    const genericErr = JSON.stringify({
      error: {
        message: 'tool_choice object is not supported, use auto',
        model: 'vendor-thinking-v1',
        type: 'invalid_request_error',
      },
    })
    const chatBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.tools) chatBodies.push(body)
      if (isForcedWeather(body)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: genericErr })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'tool_calling')
    await setupRun(page, 'e2e-tool_choice不支持不降级')

    const tile = page.locator('main').getByRole('button', { name: /工具调用/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(page.locator('main')).not.toContainText('已用 auto 核验')
    expect(chatBodies.filter(b => extractPrompt(b).includes('must call the get_weather'))).toHaveLength(1)
  })

  test('工具调用：中文思考模式拒绝强制 tool_choice 时降级 auto', async ({ page }) => {
    const thinkingErr = JSON.stringify({
      error: { message: '思考模式下不支持将 tool_choice 设为 required 或 object' },
    })
    const chatBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.tools) chatBodies.push(body)
      if (isForcedWeather(body)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: thinkingErr })
        return
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: extractPrompt(body).includes('must call the get_weather')
          ? CHAT_OK(12, 0, { toolName: 'get_weather' })
          : CHAT_OK(12),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'tool_calling')
    await setupRun(page, 'e2e-中文思考模式tool_choice降级')

    const tile = page.locator('main').getByRole('button', { name: /工具调用/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(page.locator('main')).toContainText('已用 auto 核验')
    expect(chatBodies.find(b => b.tool_choice === 'auto' && extractPrompt(b).includes('must call the get_weather'))).toBeTruthy()
  })

  test('缓存未命中：连续 3 次未报告缓存命中即停止，不再重试', async ({ page }) => {
    let cacheReqs = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      const isCache = String(body?.messages?.[0]?.content ?? '').includes('ModelProbe fixed cache prefix')
      if (isCache) cacheReqs++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: isCache ? CHAT_OK(5000, 0) : CHAT_OK(10),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'cache-chat')
    await setupRun(page, 'e2e-缓存未命中')

    await expect(page.locator('main')).toContainText('3 次请求均未报告缓存命中', { timeout: 10000 })
    expect(cacheReqs).toBe(3)
  })

  test('缓存命中：首次命中即停，只发 1 次请求', async ({ page }) => {
    let cacheReqs = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      const isCache = String(body?.messages?.[0]?.content ?? '').includes('ModelProbe fixed cache prefix')
      if (isCache) cacheReqs++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: isCache ? CHAT_OK(5000, 15) : CHAT_OK(10),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'cache-chat')
    await setupRun(page, 'e2e-缓存命中')

    await expect(page.locator('main')).toContainText('第 1 次请求命中缓存', { timeout: 10000 })
    await expect(page.locator('main')).toContainText('读取 Token: 15')
    expect(cacheReqs).toBe(1)
  })

  test('Token 稳定性：固定输入重复 3 次计数恒定', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'token-stability')
    await setupRun(page, 'e2e-token稳定性')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /Token 计算稳定性/ })).toBeVisible({ timeout: 10000 })
    await main.getByRole('button', { name: /Token 计算稳定性/ }).click()
    await expect(page.getByRole('dialog')).toContainText('3 次输入 Token 均为 10')
  })

  test('日志脱敏 + 报告导出 Markdown（含说明与复现步骤）', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-oneapi-request-id': 'req-chat-0001', 'access-control-expose-headers': '*' }, body: CHAT_OK(12) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e探针报告', { apiKey: 'sk-secret-key-12345678' })
    await expect(page.locator('main')).toContainText('通过 1', { timeout: 10000 })

    await page.getByRole('button', { name: /请求日志/ }).click()
    await expect(page.locator('main')).toContainText('req-chat-0001')
    // 展开日志查看请求头（密钥脱敏）
    await page.locator('main').getByText('POST https://api.openai.com/v1/chat/completions', { exact: true }).click()
    await expect(page.locator('main')).toContainText('sk-secr***5678')

    await page.getByRole('button', { name: /测试报告/ }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 Markdown' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('e2e探针报告.md')
    const content = readFileSync(await download.path(), 'utf8')
    expect(content).toContain('复现步骤')
    expect(content).toContain('/v1/chat/completions')
    expect(content).toContain('sk-secr***5678')
    expect(content).toContain('基础请求返回成功')
    expect(content).toContain('用量: 输入 12 · 输出 5')
  })

  test('报告导出 HTML：离线单文件、主题切换、复现折叠、密钥脱敏', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-oneapi-request-id': 'req-chat-0001', 'access-control-expose-headers': '*' }, body: CHAT_OK(12) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e探针HTML', { apiKey: 'sk-secret-key-12345678' })
    await expect(page.locator('main')).toContainText('通过 1', { timeout: 10000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 HTML' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('e2e探针HTML.html')
    const outPath = '/tmp/modelprobe-export-test.html'
    await download.saveAs(outPath)
    const html = readFileSync(outPath, 'utf8')
    expect(html).toContain('模型探测报告')
    expect(html).toContain('OpenAI Chat Completions')
    expect(html).toContain('↑12')
    expect(html).toContain('↓5')
    expect(html).toContain('请求体')
    expect(html).not.toContain('sk-secret-key-12345678')
    expect(html).not.toContain('sk-secr***5678')
    expect(html).not.toMatch(/Authorization/i)
    expect(html).not.toContain('请求头')
    expect(html).not.toContain('temperature')
    expect(html).toMatch(/html,body\{[^}]*overflow:visible/)

    await page.goto('file://' + outPath)
    await expect(page.getByRole('heading', { name: 'e2e探针HTML' })).toBeVisible()
    await expect(page.getByRole('button', { name: /OpenAI Chat Completions/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /浅色模式|深色模式/ })).toBeVisible()
    await page.getByRole('button', { name: /OpenAI Chat Completions/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('基础请求返回成功')
    await expect(dialog).toContainText('请求体')
    await expect(dialog.getByRole('button', { name: '复制' })).toBeVisible()
    await expect(dialog).not.toContainText('请求头')
    await expect(dialog).not.toContainText('Authorization')
    await dialog.getByRole('button', { name: '关闭' }).click()
    const overflow = await page.locator('html').evaluate(el => getComputedStyle(el).overflow)
    expect(overflow === 'visible' || overflow === 'auto' || overflow === 'overlay').toBeTruthy()
    await page.getByRole('button', { name: /浅色模式|深色模式/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)
    await expect(page.getByText('temperature', { exact: true })).toHaveCount(0)
  })

  test('勾选状态持久化：reload 后仍保持', async ({ page }) => {
    await goto(page, /模型探测/)
    await uncheck(page, 'multi-turn')
    await page.getByRole('button', { name: '全选' }).click()
    await uncheck(page, 'multi-turn')

    // kv 写入 IndexedDB 是异步的，poll 到最终勾选状态落盘再 reload
    await expect.poll(async () => {
      const stored = await readKv(page, 'modelprobe-config')
      return stored ? JSON.parse(stored).selected?.['multi-turn'] : undefined
    }).toBe(false)

    await page.reload()
    await goto(page, /模型探测/)
    await expect(page.locator('input[data-id="multi-turn"]')).not.toBeChecked()
    await expect(page.locator('input[data-id="chat-basic"]')).toBeChecked()
  })

  test('渠道 API Key 加密持久化：reload 后仍在，落盘无明文', async ({ page }) => {
    await goto(page, /模型探测/)
    await addChannel(page, { name: '测试渠道', apiKey: 'sk-enc-secret-abc123' })
    await expect(page.locator('div.pr-16', { hasText: '测试渠道' })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()

    await expect.poll(() => readKv(page, 'modelprobe-channels')).toBeTruthy()
    const stored = await readKv(page, 'modelprobe-channels')
    expect(stored).not.toContain('sk-enc-secret-abc123')

    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await expect(page.locator('div.pr-16', { hasText: '测试渠道' })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()
    await inputByLabel(page, '模型名称').fill('probe-model')
    await expect(page.getByRole('button', { name: /开始测试/ })).toBeEnabled()
  })

  test('渠道管理：复制渠道不切换当前使用', async ({ page }) => {
    await goto(page, /模型探测/)
    await addChannel(page, { name: '测试渠道', apiKey: 'sk-test-copy' })
    await channelCard(page, '测试渠道').getByRole('button', { name: '复制' }).click()
    await expect(channelCard(page, '测试渠道_copy')).toBeVisible()
    await expect(channelCard(page, '测试渠道').getByText('✓ 当前使用')).toBeVisible()
    await expect(channelCard(page, '测试渠道_copy').getByText('✓ 当前使用')).toHaveCount(0)
    await expect.poll(async () => {
      const raw = await readKv(page, 'modelprobe-channels')
      return raw ? JSON.parse(raw).map((c: { name: string }) => c.name) : []
    }).toEqual(['测试渠道', '测试渠道_copy'])
  })

  test('测试连接：三格式端点可达性与鉴权即时反馈', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(5) }))
    await page.route('**/v1/responses', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK() }))
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API key' } }) }))

    await goto(page, /模型探测/)
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await inputByLabel(page, '模型名称').fill('probe-model')
    await page.getByRole('button', { name: '测试连接' }).click()

    await expect(page.locator('[data-conn="chat"]')).toContainText('✓')
    await expect(page.locator('[data-conn="responses"]')).toContainText('✓')
    await expect(page.locator('[data-conn="anthropic"]')).toContainText('✗ 401')
    await expect(page.locator('[data-conn="anthropic"]')).toContainText('Invalid API key')
  })

  test('测试连接只测已勾选协议：取消勾选 responses 后不再请求该端点', async ({ page }) => {
    let chatCalls = 0
    let responsesCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      chatCalls++
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(5) })
    })
    await page.route('**/v1/responses', async route => {
      responsesCalls++
      await route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK() })
    })
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API key' } }) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'anthropic-basic')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await inputByLabel(page, '模型名称').fill('probe-model')
    await page.getByRole('button', { name: '测试连接' }).click()

    await expect(page.locator('[data-conn="chat"]')).toContainText('✓')
    await expect(page.locator('[data-conn="anthropic"]')).toContainText('✗ 401')
    await expect(page.locator('[data-conn="responses"]')).toHaveCount(0)
    expect(chatCalls).toBe(1)
    expect(responsesCalls).toBe(0)
  })

  test('测试连接：未勾选任何协议基础时提示报错且不发请求', async ({ page }) => {
    let chatCalls = 0
    let responsesCalls = 0
    let anthropicCalls = 0
    await page.route('**/v1/chat/completions', async () => { chatCalls++ })
    await page.route('**/v1/responses', async () => { responsesCalls++ })
    await page.route('**/v1/messages', async () => { anthropicCalls++ })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await inputByLabel(page, '模型名称').fill('probe-model')
    await page.getByRole('button', { name: '测试连接' }).click()

    await expect(page.locator('main')).toContainText('测试连接需要先勾选至少一个协议基础测试')
    await expect(page.locator('[data-conn]')).toHaveCount(0)
    expect(chatCalls).toBe(0)
    expect(responsesCalls).toBe(0)
    expect(anthropicCalls).toBe(0)
  })

  test('历史报告：跑完自动入库，可回看', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e-历史报告')

    await expect(page.locator('main')).toContainText('通过 1', { timeout: 10000 })
    await page.getByRole('button', { name: /历史/ }).click()
    await expect(page.locator('main')).toContainText('已存 1 / 20 条历史报告')
    await page.getByRole('button', { name: '查看' }).click()
    await expect(page.locator('main')).toContainText('e2e-历史报告')
  })

  test('只勾选 Responses 格式：流式与补充场景测试不再请求 chat 端点', async ({ page }) => {
    let chatCalls = 0
    let responsesCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      chatCalls++
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'chat format is not supported by this channel' } }) })
    })
    await page.route('**/v1/responses', async route => {
      responsesCalls++
      const body = route.request().postDataJSON()
      if (body?.model === 'modelprobe-intentionally-invalid-model') {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'invalid model' } }) })
        return
      }
      if (body?.stream) {
        const sse = [
          'event: response.completed',
          `data: ${JSON.stringify({ response: { usage: { input_tokens: 10, output_tokens: 4 } } })}`,
          '',
          '',
        ].join('\n')
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartResponses(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['responses-basic', 'stream-false', 'stream-true', 'system-prompt', 'multi-turn', 'error-shape', 'concurrency']) await check(page, id)
    await setupRun(page, 'e2e-仅Responses格式')

    await expect(page.locator('main')).toContainText('通过 7', { timeout: 10000 })
    expect(chatCalls).toBe(0)
    expect(responsesCalls).toBe(10) // basic 1 + stream-false 1 + stream-true 1 + system 1 + multi-turn 2 + error-shape 1 + concurrency 3
  })

  test('取消勾选 Anthropic 基础测试后，缓存测试自动跳过、不再发请求', async ({ page }) => {
    let anthropicCalls = 0
    await page.route('**/v1/messages', async () => { anthropicCalls++ })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    // 先勾选 anthropic-basic 让 cache-anthropic 可勾选，勾上后再取消 anthropic-basic，
    // 模拟“用户忘记同步取消缓存勾选框”的不一致状态。
    await check(page, 'anthropic-basic')
    await check(page, 'cache-anthropic')
    await uncheck(page, 'anthropic-basic')
    await expect(page.locator('input[data-id="cache-anthropic"]')).toBeDisabled()
    await setupRun(page, 'e2e-Anthropic未启用跳过缓存')

    await expect(page.locator('main')).toContainText('另有 6 项未执行', { timeout: 10000 })
    expect(anthropicCalls).toBe(0)
  })

  const chatSse = (usage?: { prompt_tokens?: number; completion_tokens?: number } | null) => {
    const lines = [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', choices: [{ delta: { content: 'ha' } }] })}`,
    ]
    if (usage) lines.push(`data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', choices: [], usage })}`)
    lines.push('data: [DONE]')
    return lines.join('\n\n') + '\n\n'
  }

  test('2xx 无 usage 判失败，报告卡片显示空 token', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'chatcmpl-probe', choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
      }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e-无usage失败')

    const main = page.locator('main')
    await expect(main).toContainText('失败 1', { timeout: 10000 })
    await expect(main).toContainText('计费无法落地')
    await expect(main.getByRole('button', { name: /OpenAI Chat Completions/ })).toContainText('↑— ↓—')
  })

  test('纯流式请求体为 Chat 最小体，且不请求其它协议', async ({ page }) => {
    const chatBodies: any[] = []
    let responsesCalls = 0
    let anthropicCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatSse({ prompt_tokens: 9, completion_tokens: 40 }) })
    })
    await page.route('**/v1/responses', async () => { responsesCalls++ })
    await page.route('**/v1/messages', async () => { anthropicCalls++ })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'stream-pure')
    await setupRun(page, 'e2e-纯流式请求体')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /纯流式/ })).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('button', { name: /纯流式/ })).toContainText('↑9 ↓40')
    expect(responsesCalls).toBe(0)
    expect(anthropicCalls).toBe(0)
    const streamBody = chatBodies.find(b => b.stream === true)
    expect(streamBody).toBeTruthy()
    expect(streamBody.model).toBe('probe-model')
    expect(streamBody.messages).toEqual([{ role: 'user', content: '讲个笑话' }])
    expect(streamBody.max_tokens).toBeUndefined()
    expect(streamBody.max_completion_tokens).toBeUndefined()
    expect(streamBody.stream_options).toBeUndefined()
  })

  test('SSE 流式带 Token 上限；无上限纯流式缺 usage 则对照失败', async ({ page }) => {
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      if (body?.stream) {
        const usage = body.max_completion_tokens != null
          ? { prompt_tokens: 11, completion_tokens: 6 }
          : null
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatSse(usage) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      responsesBodies.push(body)
      if (body?.stream) {
        const sse = [
          'event: response.completed',
          `data: ${JSON.stringify({ response: { usage: { input_tokens: 10, output_tokens: 4 } } })}`,
          '',
          '',
        ].join('\n')
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK() })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'responses-basic')
    await check(page, 'stream-true')
    await check(page, 'stream-pure')
    await setupRun(page, 'e2e-流式上限对照')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /纯流式/ })).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('button', { name: /纯流式/ })).toContainText('失败')
    await expect(main.getByRole('button', { name: /纯流式/ })).toContainText('↑— ↓—')
    const sseTiles = main.getByRole('button', { name: /SSE 流式响应/ })
    await expect(sseTiles).toHaveCount(2)
    await expect(sseTiles.filter({ hasText: 'Chat Completions' })).toContainText('通过')
    await expect(sseTiles.filter({ hasText: 'Chat Completions' })).toContainText('↑11 ↓6')

    const limited = chatBodies.find(b => b.stream === true && b.max_completion_tokens === 120)
    const pure = chatBodies.find(b => b.stream === true && b.max_completion_tokens == null)
    expect(limited).toBeTruthy()
    expect(pure).toBeTruthy()
    expect(pure.messages?.[0]?.content).toBe('讲个笑话')
    const respStream = responsesBodies.find(b => b.stream === true)
    expect(respStream?.max_output_tokens).toBe(120)
  })

  test('流式只回 output token 仍判失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.stream) {
        await route.fulfill({
          status: 200, contentType: 'text/event-stream',
          body: chatSse({ completion_tokens: 8 }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'stream-true')
    await setupRun(page, 'e2e-流式只回一端')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /SSE 流式响应/ })).toContainText('失败', { timeout: 10000 })
    await expect(main).toContainText('计费无法落地')
    await expect(main.getByRole('button', { name: /SSE 流式响应/ })).toContainText('↑— ↓8')
  })

  test('打开 include_usage 后 Chat 两套流式都注入 stream_options', async ({ page }) => {
    const streamBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.stream) streamBodies.push(body)
      if (body?.stream) {
        await route.fulfill({
          status: 200, contentType: 'text/event-stream',
          body: chatSse({ prompt_tokens: 12, completion_tokens: 7 }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('switch', { name: /include_usage/ }).click()
    await expect(page.getByRole('switch', { name: /include_usage/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'stream-true')
    await check(page, 'stream-pure')
    await setupRun(page, 'e2e-注入include_usage')

    await expect(page.locator('main').getByRole('button', { name: /纯流式/ })).toBeVisible({ timeout: 10000 })
    expect(streamBodies).toHaveLength(2)
    for (const b of streamBodies) {
      expect(b.stream_options).toEqual({ include_usage: true })
    }
  })

  test('error-shape 4xx 无 usage 仍可通过', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.model === 'modelprobe-intentionally-invalid-model') {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'invalid model' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'error-shape')
    await setupRun(page, 'e2e-错误码无usage')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /错误码规范性/ })).toContainText('通过', { timeout: 10000 })
  })

  test('未勾选 Chat 基础时纯流式跳过且不发请求', async ({ page }) => {
    let chatCalls = 0
    await page.route('**/v1/chat/completions', async () => { chatCalls++ })
    await page.route('**/v1/responses', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK() }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'stream-pure')
    await check(page, 'responses-basic')
    await uncheck(page, 'chat-basic')
    await expect(page.locator('input[data-id="stream-pure"]')).toBeDisabled()
    await setupRun(page, 'e2e-纯流式随Chat跳过')

    const main = page.locator('main')
    await expect(main).toContainText('通过 1', { timeout: 10000 })
    await expect(main.getByRole('button', { name: /纯流式/ })).toHaveCount(0)
    expect(chatCalls).toBe(0)
  })

  const anthropicSse = (opts: { input: number; startOutput?: number; deltaOutput?: number }) => {
    const lines = [
      'event: message_start',
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: opts.input, output_tokens: opts.startOutput ?? 0 } } })}`,
      '',
    ]
    if (opts.deltaOutput != null) {
      lines.push(
        'event: message_delta',
        `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: opts.deltaOutput } })}`,
        '',
      )
    }
    lines.push('event: message_stop', 'data: {"type":"message_stop"}', '', '')
    return lines.join('\n')
  }

  test('Anthropic SSE：message_start 的 output=0 不算最终用量，要等 message_delta', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      bodies.push(body)
      if (body?.stream) {
        await route.fulfill({
          status: 200, contentType: 'text/event-stream',
          body: anthropicSse({ input: 8, startOutput: 0, deltaOutput: 3 }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK() })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'anthropic-basic')
    await check(page, 'stream-true')
    await setupRun(page, 'e2e-Anthropic流式用量')

    const tile = page.locator('main').getByRole('button', { name: /SSE 流式响应/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('↑8 ↓3')
    const streamed = bodies.find(b => b.stream === true)
    expect(streamed?.max_tokens).toBe(120)
  })

  test('Anthropic SSE：只有 message_start 的 output=0 时判失败', async ({ page }) => {
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      if (body?.stream) {
        await route.fulfill({
          status: 200, contentType: 'text/event-stream',
          body: anthropicSse({ input: 8, startOutput: 0 }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK() })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'anthropic-basic')
    await check(page, 'stream-true')
    await setupRun(page, 'e2e-Anthropic流式占位0')

    const tile = page.locator('main').getByRole('button', { name: /SSE 流式响应/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('计费无法落地')
    await expect(tile).toContainText('↑8 ↓—')
  })

  test('结构化输出：Anthropic 走 output_config，并校验 JSON', async ({ page }) => {
    const anthropicBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      anthropicBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartAnthropic(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'anthropic-basic')
    await check(page, 'structured_output')
    await setupRun(page, 'e2e-结构化输出含Anthropic')

    const main = page.locator('main')
    await expect(main).toContainText('通过 4', { timeout: 10000 })
    await expect(main).not.toContainText('无原生 response_format')
    const soTiles = main.getByRole('button', { name: /结构化输出/ })
    await expect(soTiles).toHaveCount(2)
    await expect(soTiles.filter({ hasText: 'Chat Completions' })).toContainText('JSON 符合 Schema')
    await expect(soTiles.filter({ hasText: 'Anthropic' })).toContainText('JSON 符合 Schema')
    const withConfig = anthropicBodies.filter(b => b.output_config)
    expect(withConfig.length).toBeGreaterThanOrEqual(1)
    expect(withConfig[0].output_config).toEqual({ format: { type: 'json_schema', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } })
    expect(anthropicBodies.every(b => b.response_format === undefined)).toBeTruthy()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 JSON' }).click(),
    ])
    const raw = readFileSync(await download.path(), 'utf8')
    expect(raw).toContain('structured_output@anthropic')
    expect(raw).not.toContain('无原生 response_format')
  })

  test('历史报告：旧的 Anthropic 结构化输出「不支持」项不展示', async ({ page }) => {
    await goto(page, /模型探测/)
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('dev-toolkit-history')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('modelprobe')) db.createObjectStore('modelprobe', { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('modelprobe')) { resolve(); return }
        const tx = db.transaction('modelprobe', 'readwrite')
        tx.objectStore('modelprobe').put({
          id: 'p-legacy-so-anthropic',
          name: 'e2e-历史结构化Anthropic',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
          target: {
            baseUrl: 'https://api.openai.com',
            model: 'probe-model',
            overrides: { chat: null, responses: null, anthropic: null },
          },
          results: {
            'anthropic-basic': {
              status: 'passed', detail: '基础请求返回成功', duration: 10, format: 'anthropic',
              usage: { input: 8, output: 3, cacheRead: null, cacheWrite: null }, repro: null,
            },
            'structured_output@anthropic': {
              status: 'unsupported', detail: 'Anthropic Messages 无原生 response_format 参数',
              duration: null, format: 'anthropic', repro: null,
            },
          },
          summary: { passed: 1, failed: 0, unsupported: 1, skipped: 0 },
          logs: [],
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    }))
    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    const main = page.locator('main')
    await expect(main).toContainText('e2e-历史结构化Anthropic')
    await expect(main).toContainText('通过 1 · 失败 0 · 不支持 0')
    await main.getByRole('button', { name: '查看' }).click()
    await expect(main).toContainText('通过 1')
    await expect(main).not.toContainText('不支持 1')
    await expect(main.getByRole('button', { name: /结构化输出/ })).toHaveCount(0)
    await expect(main).not.toContainText('无原生 response_format')
    await expect(main.getByRole('button', { name: /Anthropic Messages/ })).toBeVisible()
  })

  test('429 后重试成功：等 6s 再发，日志只留最终一发', async ({ page }) => {
    let chatCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      chatCalls++
      if (chatCalls === 1) {
        await route.fulfill({
          status: 429, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'rate limited' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e-429重试成功')

    const main = page.locator('main')
    await expect(main).toContainText('通过 1', { timeout: 25000 })
    expect(chatCalls).toBe(2)
    await expect(page.getByRole('button', { name: /请求日志 \(1\)/ })).toBeVisible()
    await page.getByRole('button', { name: /请求日志/ }).click()
    await expect(main).toContainText('↑12')
  })

  test('429 耗尽 3 次后失败，日志只留最后一发', async ({ page }) => {
    let chatCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      chatCalls++
      await route.fulfill({
        status: 429, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'rate limited' } }),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await setupRun(page, 'e2e-429耗尽')

    const main = page.locator('main')
    await expect(main).toContainText('失败 1', { timeout: 25000 })
    expect(chatCalls).toBe(3)
    await expect(page.getByRole('button', { name: /请求日志 \(1\)/ })).toBeVisible()
    await page.getByRole('button', { name: /请求日志/ }).click()
    await expect(main.locator('span.font-mono', { hasText: /^429$/ })).toBeVisible()
  })

  test('并发请求稳定性遇 429 不重试', async ({ page }) => {
    let limited = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      const content = body?.messages?.[0]?.content
      if (typeof content === 'string' && /Reply only [123]/.test(content)) {
        limited++
        await route.fulfill({
          status: 429, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'rate limited' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'concurrency')
    await setupRun(page, 'e2e-并发不重试429')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /并发请求稳定性/ })).toContainText('0/3', { timeout: 10000 })
    expect(limited).toBe(3)
  })

  test('错误码规范性：429 耗尽后失败，不当作规范 4xx', async ({ page }) => {
    let invalidCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.model === 'modelprobe-intentionally-invalid-model') {
        invalidCalls++
        await route.fulfill({
          status: 429, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'rate limited' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'error-shape')
    await setupRun(page, 'e2e-错误码429')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /错误码规范性/ })).toContainText('全程限流', { timeout: 25000 })
    expect(invalidCalls).toBe(3)
  })

  test('测试连接遇 429 不重试', async ({ page }) => {
    let chatCalls = 0
    await page.route('**/v1/chat/completions', async route => {
      chatCalls++
      await route.fulfill({
        status: 429, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'rate limited' } }),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await inputByLabel(page, '模型名称').fill('probe-model')
    await page.getByRole('button', { name: '测试连接' }).click()

    await expect(page.locator('[data-conn="chat"]')).toContainText('✗ 429')
    expect(chatCalls).toBe(1)
  })

  test('Token 上限语义：三协议核验截断原因', async ({ page }) => {
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    const anthropicBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      responsesBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartResponses(body) })
    })
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      anthropicBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartAnthropic(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'responses-basic', 'anthropic-basic', 'max_tokens']) await check(page, id)
    await setupRun(page, 'e2e-截断原因')

    const main = page.locator('main')
    const tiles = main.getByRole('button', { name: /Token 上限参数/ })
    await expect(tiles).toHaveCount(3, { timeout: 10000 })
    await expect(tiles.filter({ hasText: 'Chat Completions' })).toContainText('length')
    await expect(tiles.filter({ hasText: 'Responses' })).toContainText('max_output_tokens')
    await expect(tiles.filter({ hasText: 'Anthropic' })).toContainText('max_tokens')
    const chatCap = chatBodies.find(b => b.max_completion_tokens === 16 || b.max_tokens === 16)
    expect(chatCap.max_completion_tokens).toBe(16)
    expect(chatCap.max_tokens).toBe(16)
    expect(chatBodies.some(b => b.max_completion_tokens === 120 && b.max_tokens === 120)).toBeTruthy()
    expect(responsesBodies.some(b => b.max_output_tokens === 16)).toBeTruthy()
    expect(anthropicBodies.some(b => b.max_tokens === 16)).toBeTruthy()
  })

  test('System 未遵循 SYSTEM_OK 则失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      const text = extractPrompt(body)
      const content = text.includes('SYSTEM_OK') ? 'hello' : 'OK'
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10, 0, { content }) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'system-prompt')
    await setupRun(page, 'e2e-system未遵循')

    const tile = page.locator('main').getByRole('button', { name: /System 提示词/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('未遵循')
  })

  test('多轮对话两跳：回传真实 assistant 后再问口令', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      bodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'multi-turn')
    await setupRun(page, 'e2e-多轮两跳')

    const tile = page.locator('main').getByRole('button', { name: /多轮对话/ })
    await expect(tile).toContainText('ORBIT', { timeout: 10000 })
    const turns = bodies.filter(b => Array.isArray(b.messages) && b.messages.length >= 2)
    expect(turns.length).toBeGreaterThanOrEqual(1)
    const second = bodies.find(b => (b.messages || []).some((m: any) => m.role === 'assistant'))
    expect(second.messages.some((m: any) => m.role === 'assistant' && m.content === 'Acknowledged.')).toBeTruthy()
    expect(JSON.stringify(second.messages)).toContain('only the codeword')
    expect(second.max_tokens).toBeUndefined()
    expect(second.max_completion_tokens).toBeUndefined()
  })

  test('Anthropic System/多轮默认 max_tokens=120；Chat 不带上限', async ({ page }) => {
    const chatBodies: any[] = []
    const anthropicBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      anthropicBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartAnthropic(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'anthropic-basic', 'system-prompt', 'multi-turn']) await check(page, id)
    await setupRun(page, 'e2e-默认cap120')

    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /System 提示词/ })).toHaveCount(2, { timeout: 10000 })
    await expect(main.getByRole('button', { name: /多轮对话/ })).toHaveCount(2)

    const anthSystem = anthropicBodies.find(b => typeof b.system === 'string' && b.system.includes('SYSTEM_OK'))
    expect(anthSystem?.max_tokens).toBe(120)
    const anthTurn2 = anthropicBodies.find(b => (b.messages || []).some((m: any) => m.role === 'assistant'))
    expect(anthTurn2?.max_tokens).toBe(120)
    expect(JSON.stringify(anthTurn2.messages)).toContain('only the codeword')

    const chatSystem = chatBodies.find(b => (b.messages || []).some((m: any) => m.role === 'system'))
    expect(chatSystem?.max_tokens).toBeUndefined()
    expect(chatSystem?.max_completion_tokens).toBeUndefined()
  })

  test('图片输入默认不勾选；全选后勾上；识别红色通过', async ({ page }) => {
    const chatBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await expect(page.locator('input[data-id="image-input"]')).not.toBeChecked()
    await page.getByRole('button', { name: '全选' }).click()
    await expect(page.locator('input[data-id="image-input"]')).toBeChecked()
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'image-input')
    await setupRun(page, 'e2e-图片输入')

    const tile = page.locator('main').getByRole('button', { name: /图片输入/ })
    await expect(tile).toContainText('识别为主色红', { timeout: 10000 })
    const img = chatBodies.find(b => hasImage(b))
    expect(img).toBeTruthy()
    expect(JSON.stringify(img)).toContain('image_url')
    expect(JSON.stringify(img)).toContain('data:image/png;base64,')
  })

  test('图片输入 4xx 且错误含 vision 记不支持', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (hasImage(body)) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'this model does not support vision / image_url' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'image-input')
    await setupRun(page, 'e2e-图片不支持')

    const tile = page.locator('main').getByRole('button', { name: /图片输入/ })
    await expect(tile).toContainText('不支持', { timeout: 10000 })
  })

  test('图片输入 4xx 仅 generic not supported 记失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (hasImage(body)) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'this model is not supported on this endpoint' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'image-input')
    await setupRun(page, 'e2e-图片泛化不支持')

    const tile = page.locator('main').getByRole('button', { name: /图片输入/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).not.toContainText('不支持')
  })

  test('图片输入 already 不含 red 单词则失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (hasImage(body)) {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: CHAT_OK(10, 0, { content: 'already processed, cannot determine' }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'image-input')
    await setupRun(page, 'e2e-图片already误判')

    const tile = page.locator('main').getByRole('button', { name: /图片输入/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('未识别出红色')
  })

  test('语义请求 4xx 且 error.type=invalid_request_error 记失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (capOf(body) === 16 && extractPrompt(body).includes('Count from 1 to 200')) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { type: 'invalid_request_error', message: 'context length exceeded' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'max_tokens')
    await setupRun(page, 'e2e-语义invalid信封')

    const tile = page.locator('main').getByRole('button', { name: /Token 上限参数/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).not.toContainText('不支持')
  })

  test('结构化输出语义：非法 JSON 判失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      const cap = capOf(body)
      if (body?.response_format && cap === 256) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12, 0, { content: 'not-json' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'structured_output')
    await setupRun(page, 'e2e-schema非法JSON')

    const tile = page.locator('main').getByRole('button', { name: /结构化输出/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('不是可解析的 JSON')
  })

  test('System 遵循 SYSTEM_OK 则通过', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'system-prompt')
    await setupRun(page, 'e2e-system遵循')

    const tile = page.locator('main').getByRole('button', { name: /System 提示词/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('SYSTEM_OK')
  })

  test('Token 上限：max_tokens 被拒后仍测 max_completion_tokens', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      bodies.push(body)
      if (body?.max_tokens != null && body?.max_completion_tokens != null) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'unknown parameter: max_tokens' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'max_tokens')
    await setupRun(page, 'e2e-max_tokens被拒')

    const tile = page.locator('main').getByRole('button', { name: /Token 上限参数/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('max_completion_tokens')
    await expect(tile).toContainText('已排除 max_tokens')
    expect(bodies.some(b => b.max_tokens != null && b.max_completion_tokens != null)).toBeTruthy()
    const retried = bodies.find(b => b.max_completion_tokens != null && b.max_tokens == null)
    expect(retried).toBeTruthy()
    const semantic = bodies.find(b => b.max_completion_tokens === 16)
    expect(semantic.max_tokens).toBeUndefined()
  })

  test('Token 上限：max_completion_tokens 被拒后仍测 max_tokens', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      bodies.push(body)
      if (body?.max_completion_tokens != null) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'unknown parameter: max_completion_tokens. use max_tokens' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'max_tokens')
    await setupRun(page, 'e2e-max_completion被拒')

    const tile = page.locator('main').getByRole('button', { name: /Token 上限参数/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('接受 max_tokens')
    await expect(tile).toContainText('已排除 max_completion_tokens')
    const retried = bodies.find(b => b.max_tokens != null && b.max_completion_tokens == null)
    expect(retried).toBeTruthy()
    const semantic = bodies.find(b => b.max_tokens === 16 && b.max_completion_tokens == null)
    expect(semantic).toBeTruthy()
  })

  test('Token 上限：两个字段互斥时拆开再测', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      bodies.push(body)
      if (body?.max_tokens != null && body?.max_completion_tokens != null) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Cannot specify both max_tokens and max_completion_tokens' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'max_tokens')
    await setupRun(page, 'e2e-max字段互斥')

    const tile = page.locator('main').getByRole('button', { name: /Token 上限参数/ })
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('max_completion_tokens')
    await expect(tile).toContainText('max_tokens')
    expect(bodies.filter(b => b.max_completion_tokens != null && b.max_tokens == null).length).toBeGreaterThan(0)
    expect(bodies.filter(b => b.max_tokens != null && b.max_completion_tokens == null).length).toBeGreaterThan(0)
  })

  test('Token 上限语义：2xx 但 finish_reason=stop 判失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (capOf(body) === 16) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12, 0, { content: '1 2 3', finishReason: 'stop' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'max_tokens')
    await setupRun(page, 'e2e-截断未生效')

    const tile = page.locator('main').getByRole('button', { name: /Token 上限参数/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('不是截断')
  })

  test('工具调用语义：2xx 但没有 tool_calls 判失败', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12, 0, { content: '明天上海晴' }) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'tool_calling')
    await setupRun(page, 'e2e-工具未真正调用')

    const tile = page.locator('main').getByRole('button', { name: /工具调用/ })
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('没有工具调用')
  })

  test('图片输入：三协议原生图片字段', async ({ page }) => {
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    const anthropicBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      responsesBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartResponses(body) })
    })
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      anthropicBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartAnthropic(body) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['chat-basic', 'responses-basic', 'anthropic-basic', 'image-input']) await check(page, id)
    await setupRun(page, 'e2e-三协议图片')

    const tiles = page.locator('main').getByRole('button', { name: /图片输入/ })
    await expect(tiles).toHaveCount(3, { timeout: 10000 })
    await expect(tiles.filter({ hasText: 'Chat Completions' })).toContainText('识别为主色红')
    await expect(tiles.filter({ hasText: 'Responses' })).toContainText('识别为主色红')
    await expect(tiles.filter({ hasText: 'Anthropic' })).toContainText('识别为主色红')

    const chatImg = chatBodies.find(b => hasImage(b))
    expect(chatImg.messages[0].content[1].type).toBe('image_url')
    expect(chatImg.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/)

    const respImg = responsesBodies.find(b => hasImage(b))
    const part = respImg.input[0].content.find((c: any) => c.type === 'input_image')
    expect(typeof part.image_url).toBe('string')
    expect(part.image_url).toMatch(/^data:image\/png;base64,/)

    const anthImg = anthropicBodies.find(b => hasImage(b))
    const block = anthImg.messages[0].content.find((c: any) => c.type === 'image')
    expect(block.source.type).toBe('base64')
    expect(block.source.media_type).toBe('image/png')
    expect(typeof block.source.data).toBe('string')
    expect(block.source.data).not.toMatch(/^data:/)
  })
})
