import { test, expect } from '@playwright/test'
import { goto, inputByLabel, readKv, channelCard, readHistoryStore, writeHistoryStore } from './helpers'
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

async function openFinishedReport(page: import('@playwright/test').Page, name: string) {
  const row = page.locator('[data-testid="probe-history-row"]').filter({ hasText: name })
  await expect(row).toBeVisible({ timeout: 30000 })
  await row.getByRole('button', { name: '查看' }).click()
}

/** 新增渠道 + 填模型 + 开始测试（弹窗确认）。调用前应先完成测试项勾选（勾选控件在「实时进度」面板里）。跑完停在历史，这里再打开那一份报告。 */
async function setupRun(page: import('@playwright/test').Page, name: string, opts: { apiKey?: string } = {}) {
  await addChannel(page, { apiKey: opts.apiKey ?? 'sk-test-probe' })
  await inputByLabel(page, '模型名称').fill('probe-model')
  await page.getByRole('button', { name: '▶ 开始测试' }).click()
  await page.getByRole('dialog').locator('input').fill(name)
  await page.getByRole('button', { name: '确认并开始' }).click()
  await openFinishedReport(page, name)
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /OpenAI Chat Completions/ })).toContainText('↑12 ↓5')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /OpenAI Responses/ })).toContainText('↑10 ↓4')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /Anthropic Messages/ })).toContainText('↑8 ↓3')

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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /temperature/ })).toBeVisible({ timeout: 10000 })
    await main.locator('[data-probe-tile]').filter({ hasText: /temperature/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('unknown parameter: temperature')
    await expect(dialog).toContainText('响应体')
    // 请求头、请求体、响应体三个代码块右上角各有一个复制图标
    await expect(dialog.getByRole('button', { name: '复制' })).toHaveCount(3)
    await dialog.getByRole('button', { name: '关闭' }).click()
    await main.locator('[data-probe-tile]').filter({ hasText: /top_p(?! 越界)/ }).click()
    await expect(page.getByRole('dialog')).toContainText('组合请求通过')
  })

  test('预期拒绝默认关闭：推理模型拒绝 temperature 仍是不支持', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.temperature !== undefined) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(11) })
    })

    await goto(page, /模型探测/)
    await expect(page.locator('input[data-id="expect-reject"]')).not.toBeChecked()
    await inputByLabel(page, '模型名称').fill('gpt-6-sol')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'temperature')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-预期拒绝关闭')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-预期拒绝关闭')

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /temperature/ })
    await expect(tile).toContainText('不支持', { timeout: 10000 })
    await expect(tile).not.toContainText('符合预期')
    await expect(tile).not.toContainText('异常')
  })

  test('勾选预期拒绝：该拒的 temperature 记符合预期，接受了记异常', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.temperature !== undefined) {
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(11) })
    })

    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-6-sol')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'temperature')
    await check(page, 'expect-reject')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-预期拒绝开启')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-预期拒绝开启')

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /temperature/ })
    await expect(tile).toContainText('符合预期', { timeout: 10000 })
    await expect(tile).toContainText('不接受该 temperature')

    await page.unroute('**/v1/chat/completions')
    await page.route('**/v1/chat/completions', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(11) })
    })
    await page.getByRole('button', { name: '实时进度' }).click()
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-预期拒绝却成功')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-预期拒绝却成功')
    const again = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /temperature/ })
    await expect(again).toContainText('异常', { timeout: 10000 })
    await expect(again).toContainText('不应接受 temperature')
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /工具调用/ })).toHaveCount(3, { timeout: 10000 })
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

    const tiles = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /工具调用/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /工具调用/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /工具调用/ })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /Token 计算稳定性/ })).toBeVisible({ timeout: 10000 })
    await main.locator('[data-probe-tile]').filter({ hasText: /Token 计算稳定性/ }).click()
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
    await page.getByRole('button', { name: '查看', exact: true }).click()
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /OpenAI Chat Completions/ })).toContainText('↑— ↓—')
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toBeVisible({ timeout: 10000 })
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toContainText('↑9 ↓40')
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toBeVisible({ timeout: 10000 })
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toContainText('失败')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toContainText('↑— ↓—')
    const sseTiles = main.locator('[data-probe-tile]').filter({ hasText: /SSE 流式响应/ })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /SSE 流式响应/ })).toContainText('失败', { timeout: 10000 })
    await expect(main).toContainText('计费无法落地')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /SSE 流式响应/ })).toContainText('↑— ↓8')
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

    await expect(page.locator('main').locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toBeVisible({ timeout: 10000 })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /错误码规范性/ })).toContainText('通过', { timeout: 10000 })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /纯流式/ })).toHaveCount(0)
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /SSE 流式响应/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /SSE 流式响应/ })
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
    const soTiles = main.locator('[data-probe-tile]').filter({ hasText: /结构化输出/ })
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
    await expect(main).toContainText('通过 1 · 失败 0 · 不支持 0 · 符合预期 0 · 未测 0')
    await main.getByRole('button', { name: '查看', exact: true }).click()
    await expect(main).toContainText('通过 1')
    await expect(main).not.toContainText('不支持 1')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /结构化输出/ })).toHaveCount(0)
    await expect(main).not.toContainText('无原生 response_format')
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /Anthropic Messages/ })).toBeVisible()
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /并发请求稳定性/ })).toContainText('0/3', { timeout: 10000 })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /错误码规范性/ })).toContainText('全程限流', { timeout: 25000 })
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
    const tiles = main.locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /System 提示词/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /多轮对话/ })
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
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /System 提示词/ })).toHaveCount(2, { timeout: 10000 })
    await expect(main.locator('[data-probe-tile]').filter({ hasText: /多轮对话/ })).toHaveCount(2)

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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /图片输入/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /图片输入/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /图片输入/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /图片输入/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /结构化输出/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /System 提示词/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /Token 上限参数/ })
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

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /工具调用/ })
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

    const tiles = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /图片输入/ })
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

  test('原生工具：gpt-4o 追加用例且默认不勾；embedding 不出现', async ({ page }) => {
    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-4o')
    const nativeGroup = page.locator('div.uppercase.tracking-wide', { hasText: '原生工具调用' })
    await expect(page.locator('input[data-id="native-openai-web_search"]')).toBeVisible()
    await expect(page.locator('input[data-id="native-openai-web_search"]')).not.toBeChecked()
    await expect(nativeGroup).toBeVisible()
    await inputByLabel(page, '模型名称').fill('text-embedding-3-small')
    await expect(page.locator('input[data-id="native-openai-web_search"]')).toHaveCount(0)
    await expect(nativeGroup).toHaveCount(0)
  })

  test('原生工具：kimi-k2 只出现 $web_search', async ({ page }) => {
    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('kimi-k2')
    await expect(page.locator('input[data-id="native-kimi-web_search"]')).toBeVisible()
    await expect(page.locator('input[data-id="native-openai-web_search"]')).toHaveCount(0)
    await expect(page.locator('main')).toContainText('Kimi 内置 $web_search')
  })

  test('原生工具：独立请求强制 web_search，不并入参数 combo', async ({ page }) => {
    const chatBodies: any[] = []
    const responsesBodies: any[] = []
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      chatBodies.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartChat(body) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      responsesBodies.push(body)
      const native = extractPrompt(body).includes('hosted web search tool')
      const payload = native
        ? JSON.stringify({
          id: 'resp-probe',
          status: 'completed',
          output: [
            { type: 'web_search_call', id: 'ws_1', status: 'completed' },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] },
          ],
          usage: { input_tokens: 10, output_tokens: 4 },
        })
        : smartResponses(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: payload })
    })

    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-4o')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'responses-basic')
    await check(page, 'temperature')
    await check(page, 'native-openai-web_search')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-原生联网')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-原生联网')

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /OpenAI 联网搜索/ })
    await expect(tile).toContainText('已调用 web_search', { timeout: 10000 })

    const nativeReq = responsesBodies.find(b => extractPrompt(b).includes('hosted web search tool'))
    expect(nativeReq).toBeTruthy()
    expect(nativeReq.tools).toEqual([{ type: 'web_search' }])
    expect(nativeReq.tool_choice).toEqual({ type: 'web_search' })
    expect(nativeReq.temperature).toBeUndefined()

    const combo = responsesBodies.find(b => b.temperature !== undefined)
    expect(combo).toBeTruthy()
    expect(JSON.stringify(combo.tools || [])).not.toContain('"web_search"')
    expect(chatBodies.some(b => JSON.stringify(b.tools || []).includes('"type":"web_search"'))).toBe(false)
  })

  test('原生工具：明确不支持仍记不支持', async ({ page }) => {
    await page.route('**/v1/responses', async route => {
      await route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'unknown tool: web_search is not supported' } }),
      })
    })

    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-4o')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'responses-basic')
    await check(page, 'native-openai-web_search')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-原生明确不支持')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-原生明确不支持')

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /OpenAI 联网搜索/ })
    await expect(tile).toContainText('不支持', { timeout: 10000 })
    await expect(tile).not.toContainText('异常')
  })

  test('原生工具：2xx 无调用证据判异常', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })
    await page.route('**/v1/responses', async route => {
      const body = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: smartResponses(body) })
    })

    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-4o')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'responses-basic')
    await check(page, 'native-openai-web_search')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-原生无证据')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-原生无证据')

    const tile = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /OpenAI 联网搜索/ })
    await expect(tile).toContainText('异常', { timeout: 10000 })
    await expect(tile).toContainText('没有 web_search 的调用或结果证据')
  })

  test('多个模型的原生工具取并集', async ({ page }) => {
    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-4o, deepseek-chat')
    await expect(page.locator('input[data-id="native-openai-web_search"]')).toBeVisible()
    await inputByLabel(page, '模型名称').fill('deepseek-chat')
    await expect(page.locator('input[data-id="native-openai-web_search"]')).toHaveCount(0)
  })

  test('多个模型各写一条历史，没写占位符时补上模型名', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) }))

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await inputByLabel(page, '模型名称').fill('alpha-one, beta-two')
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('{model}')
    await expect(dialog).toContainText('名称 · 模型名')
    await dialog.locator('input').fill('批量回归')
    await dialog.getByRole('button', { name: '确认并开始' }).click()

    const main = page.locator('main')
    await expect(main).toContainText('批量回归 · alpha-one', { timeout: 20000 })
    await expect(main).toContainText('批量回归 · beta-two')
    await expect(page.getByRole('checkbox', { name: '选择 批量回归 · alpha-one' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '选择 批量回归 · beta-two' })).toBeChecked()
  })

  test('历史多选：先查看详情，再导出卡片或矩阵', async ({ page }) => {
    test.setTimeout(60_000)
    await goto(page, /模型探测/)
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('dev-toolkit-history')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('modelprobe')) db.createObjectStore('modelprobe', { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('modelprobe', 'readwrite')
        const os = tx.objectStore('modelprobe')
        const base = {
          startedAt: '2026-09-29T01:00:00.000Z',
          durationMs: 1000,
          summary: { passed: 0, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0 },
          logs: [],
        }
        os.put({
          ...base,
          id: 'p-matrix-a',
          name: 'e2e-卡片甲',
          completedAt: '2026-09-29T01:00:01.000Z',
          target: { baseUrl: 'https://a.example', model: 'gpt-4o', channelName: '渠道甲', overrides: { chat: null, responses: null, anthropic: null } },
          verdict: {
            family: { label: 'GPT 经典', reasons: ['名字命中 GPT 经典'] },
            access: { label: '网关', reasons: ['主机不像官方'] },
            upstream: { label: 'OpenAI 官方', reasons: ['响应头 openai-organization'] },
          },
          results: {
            'chat-basic': { status: 'passed', detail: '基础请求返回成功', duration: 10, format: 'chat', usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null }, repro: { url: 'https://a.example/v1/chat/completions', headers: { Authorization: 'Bearer secret' }, body: { model: 'gpt-4o' }, status: 200, requestId: 'req-e2e-pass' } },
            'temperature@chat': { status: 'skipped', detail: '用户未勾选', duration: null, format: 'chat', repro: null },
            'image-input@chat': { status: 'untested', detail: '未测', duration: null, format: 'chat', repro: null },
            'concurrency@chat': { status: 'passed', detail: '3/3 个并发请求成功', duration: 12, format: 'chat', usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null }, repro: null },
          },
        })
        os.put({
          ...base,
          id: 'p-matrix-b',
          name: 'e2e-卡片乙',
          completedAt: '2026-09-29T02:00:01.000Z',
          target: { baseUrl: 'https://b.example', model: 'deepseek-chat', channelName: '渠道乙', overrides: { chat: null, responses: null, anthropic: null } },
          results: {
            'chat-basic': { status: 'failed', detail: '失败', duration: 10, format: 'chat', usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null }, repro: null },
            'concurrency@chat': { status: 'skipped', detail: '用户未勾选', duration: null, format: 'chat', repro: null },
          },
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    }))
    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    const viewBtn = page.getByRole('button', { name: '查看所选' })
    await expect(viewBtn).toBeDisabled()
    await expect(page.getByRole('button', { name: '导出 HTML' })).toHaveCount(0)

    await page.getByRole('checkbox', { name: '选择 e2e-卡片甲' }).check()
    await viewBtn.click()
    await expect(page.getByRole('heading', { name: 'e2e-卡片甲' })).toBeVisible()
    await expect(page.locator('main')).toContainText('渠道判断')
    await expect(page.locator('main')).toContainText('OpenAI 官方')
    await expect(page.locator('main')).toContainText('响应头 openai-organization')
    await expect(page.locator('main')).not.toContainText('接入层')
    await expect(page.locator('main')).not.toContainText('家族')
    await expect(page.locator('[data-probe-tile]').filter({ hasText: /OpenAI Chat Completions/ })).toBeVisible()
    const [one] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 HTML' }).click(),
    ])
    expect(one.suggestedFilename()).toBe('e2e-卡片甲.html')
    const oneHtml = readFileSync(await one.path(), 'utf8')
    expect(oneHtml).toContain('class="tile"')
    expect(oneHtml).toContain('渠道判断')
    expect(oneHtml).toContain('OpenAI 官方')
    expect(oneHtml).not.toContain('接入层')
    expect(oneHtml).not.toContain('家族')

    await page.getByRole('button', { name: /历史/ }).click()
    await page.getByRole('checkbox', { name: '选择 e2e-卡片乙' }).check()
    await viewBtn.click()
    const matrix = page.getByTestId('probe-matrix-view')
    await expect(matrix).toBeVisible()
    await expect(matrix).toContainText('gpt-4o')
    await expect(matrix).toContainText('渠道甲')
    await expect(matrix).toContainText('deepseek-chat')
    await expect(matrix).toContainText('渠道乙')
    await expect(matrix).toContainText('OpenAI 官方')
    await expect(matrix).toContainText('并发请求稳定性')
    await expect(matrix).toContainText('—')
    await expect(matrix).not.toContainText('已跳过')
    await expect(matrix).not.toContainText('未测')
    await expect(matrix).not.toContainText('temperature')
    await expect(matrix).not.toContainText('图片输入')
    await expect(matrix.locator('.probe-matrix-gap')).toBeVisible()
    await expect(matrix.locator('.probe-tile')).toHaveCount(0)
    await expect(matrix.locator('[data-probe-retry]')).toHaveCount(0)
    await matrix.getByRole('button', { name: '渠道判断 gpt-4o · 渠道甲' }).click()
    await expect(page.getByRole('dialog')).toContainText('OpenAI 官方')
    await expect(page.getByRole('dialog')).toContainText('响应头 openai-organization')
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
    await matrix.getByRole('button', { name: 'OpenAI Chat Completions 通过' }).click()
    const passed = page.getByRole('dialog')
    await expect(passed).toContainText('OpenAI Chat Completions')
    await expect(passed).toContainText('通过')
    await expect(passed).toContainText('req-e2e-pass')
    await expect(passed).toContainText('请求体')
    await expect(passed).toContainText('https://a.example/v1/chat/completions')
    await expect(passed).toContainText('↑1')
    await expect(passed).not.toContainText('基础请求返回成功')
    await expect(passed).not.toContainText('OpenAI 系兼容')
    await expect(passed).not.toContainText('缓存读')
    await expect(passed.locator('[data-probe-retry]')).toHaveCount(0)
    await passed.getByRole('button', { name: '关闭' }).click()
    const [many] = await Promise.all([
      page.waitForEvent('download'),
      matrix.getByRole('button', { name: '导出 HTML' }).click(),
    ])
    expect(many.suggestedFilename()).toBe('模型探测_2.html')
    const manyPath = await many.path()
    const manyHtml = readFileSync(manyPath, 'utf8')
    expect(manyHtml).toContain('class="matrix-cell dot-st passed"')
    expect(manyHtml).toContain('aria-label="OpenAI Chat Completions 通过"')
    expect(manyHtml).toContain('3/3 个并发请求成功')
    expect(manyHtml).not.toContain('<span class="dot-st passed">')
    expect(manyHtml).toContain('class="matrix-cell')
    expect(manyHtml).toContain('gpt-4o · 渠道甲')
    expect(manyHtml).toContain('>deepseek-chat<')
    expect(manyHtml).toContain('>渠道乙<')
    expect(manyHtml).toContain('data-origin="1"')
    expect(manyHtml).toContain('渠道判断 gpt-4o · 渠道甲')
    expect(manyHtml).toContain('OpenAI 官方')
    expect(manyHtml).toContain('响应头 openai-organization')
    expect(manyHtml).not.toContain('data-origin="0"')
    expect(manyHtml).not.toContain('>已跳过<')
    expect(manyHtml).not.toContain('>未测<')
    expect(manyHtml).not.toContain('temperature')
    expect(manyHtml).not.toContain('图片输入')
    expect(manyHtml).toContain('并发请求稳定性')
    expect(manyHtml).toContain('class="gap"')
    expect(manyHtml).not.toContain('.tile')
    expect(manyHtml).not.toContain('class="tile"')
    expect(manyHtml).not.toContain('基础请求返回成功')
    expect(manyHtml).not.toContain('模型对比')
    expect(manyHtml).not.toContain('份报告')
    expect(manyHtml).toContain('req-e2e-pass')
    expect(manyHtml).toContain('"body"')
    expect(manyHtml).toContain('https://a.example/v1/chat/completions')
    expect(manyHtml).not.toContain('Bearer secret')
    const [bad] = await Promise.all([
      page.waitForEvent('download'),
      matrix.getByRole('button', { name: '异常导出' }).click(),
    ])
    expect(bad.suggestedFilename()).toBe('模型探测_异常_2.html')
    const badPath = await bad.path()
    const badHtml = readFileSync(badPath, 'utf8')
    expect(badHtml).toContain('<span class="dot-st passed">')
    expect(badHtml).toContain('失败')
    expect(badHtml).toContain('并发请求稳定性')
    expect(badHtml).not.toContain('基础请求返回成功')
    expect(badHtml).not.toContain('req-e2e-pass')
    expect(badHtml).not.toContain('"body"')

    const preview = await page.context().newPage()
    await preview.setContent(manyHtml, { waitUntil: 'domcontentloaded' })
    await preview.getByRole('button', { name: 'OpenAI Chat Completions 通过' }).click()
    const sheet = preview.getByRole('dialog')
    await expect(sheet).toContainText('通过')
    await expect(sheet).toContainText('OpenAI Chat Completions')
    await expect(sheet).toContainText('10 ms')
    await expect(sheet).toContainText('↑1')
    await expect(sheet).toContainText('Request ID')
    await expect(sheet).toContainText('req-e2e-pass')
    await expect(sheet).toContainText('请求体')
    await expect(sheet).toContainText('https://a.example/v1/chat/completions')
    await expect(preview.locator('#sheetBodyWrap')).toBeVisible()
    await expect(preview.locator('#sheetRespWrap')).toBeHidden()
    await expect(sheet).not.toContainText('基础请求返回成功')
    await sheet.getByRole('button', { name: '关闭' }).click()
    await expect(sheet).toBeHidden()
    await preview.getByRole('button', { name: '并发请求稳定性 Chat Completions 通过' }).click()
    await expect(preview.getByRole('dialog')).toContainText('3/3 个并发请求成功')
    await preview.close()

    const abnormal = await page.context().newPage()
    await abnormal.setContent(badHtml, { waitUntil: 'domcontentloaded' })
    await expect(abnormal.getByRole('button', { name: 'OpenAI Chat Completions 通过' })).toHaveCount(0)
    await expect(abnormal.locator('.dot-st.passed').first()).toHaveText('通过')
    await abnormal.getByRole('button', { name: 'OpenAI Chat Completions 失败' }).click()
    const badSheet = abnormal.getByRole('dialog')
    await expect(badSheet).toContainText('失败')
    await expect(abnormal.locator('#sheetBodyWrap')).toBeHidden()
    await expect(abnormal.locator('#sheetRespWrap')).toBeHidden()
    await abnormal.close()
  })

  test('删除历史后，打开的矩阵或卡片跟着更新', async ({ page }) => {
    const base = {
      startedAt: '2026-09-29T01:00:00.000Z',
      durationMs: 1000,
      summary: { passed: 1, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0 },
      logs: [],
      results: {
        'chat-basic': { status: 'passed', detail: '基础请求返回成功', duration: 10, format: 'chat', usage: { input: 1, output: 2, cacheRead: null, cacheWrite: null }, repro: null },
      },
    }
    const reports = [
      { id: 'p-del-a', name: 'e2e-删除甲', model: 'model-甲', completedAt: '2026-09-29T01:00:01.000Z' },
      { id: 'p-del-b', name: 'e2e-删除乙', model: 'model-乙', completedAt: '2026-09-29T01:00:02.000Z' },
      { id: 'p-del-c', name: 'e2e-删除丙', model: 'model-丙', completedAt: '2026-09-29T01:00:03.000Z' },
    ]
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    await expect(page.locator('main')).toContainText('暂无历史报告')
    for (const item of reports) {
      await writeHistoryStore(page, 'modelprobe', {
        ...base,
        id: item.id,
        name: item.name,
        completedAt: item.completedAt,
        target: { baseUrl: 'https://a.example', model: item.model, channelName: '渠道', overrides: { chat: null, responses: null, anthropic: null } },
      })
    }
    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    for (const item of reports) await page.getByRole('checkbox', { name: `选择 ${item.name}` }).check()
    await page.getByRole('button', { name: '查看所选' }).click()
    const matrix = page.getByTestId('probe-matrix-view')
    await expect(matrix).toContainText('model-甲')
    await expect(matrix).toContainText('model-乙')
    await expect(matrix).toContainText('model-丙')

    await page.getByRole('button', { name: /历史/ }).click()
    await page.locator('[data-testid="probe-history-row"]').filter({ hasText: 'e2e-删除甲' }).getByRole('button', { name: '删除', exact: true }).click()
    await page.getByRole('button', { name: '测试报告' }).click()
    await expect(matrix).toContainText('model-乙')
    await expect(matrix).not.toContainText('model-甲')
    await expect(matrix).toContainText('model-丙')

    await page.getByRole('button', { name: /历史/ }).click()
    await page.getByRole('checkbox', { name: '选择 e2e-删除丙' }).uncheck()
    await page.getByRole('button', { name: /删除所选/ }).click()
    await page.getByRole('button', { name: '测试报告' }).click()
    await expect(page.getByTestId('probe-matrix-view')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'e2e-删除丙' })).toBeVisible()

    await page.getByRole('button', { name: /历史/ }).click()
    await page.getByRole('button', { name: '清空历史' }).click()
    await page.getByRole('button', { name: '测试报告' }).click()
    await expect(page.locator('main')).toContainText('完成一轮测试后，报告将显示在这里')
    await page.getByRole('button', { name: /历史/ }).click()
    await expect(page.locator('main')).toContainText('暂无历史报告')
  })

  test('测试进行中不能清空日志', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/v1/chat/completions', async route => {
      await gate
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })
    try {
      await goto(page, /模型探测/)
      await page.getByRole('button', { name: '全不选' }).click()
      await check(page, 'chat-basic')
      await addChannel(page, { apiKey: 'sk-test-probe' })
      await inputByLabel(page, '模型名称').fill('probe-model')
      await page.getByRole('button', { name: '▶ 开始测试' }).click()
      await page.getByRole('dialog').locator('input').fill('e2e-日志锁定')
      await page.getByRole('button', { name: '确认并开始' }).click()
      await page.getByRole('button', { name: /请求日志/ }).click()
      await expect(page.getByRole('button', { name: '清空日志' })).toBeDisabled()
    } finally {
      release()
    }
    await expect(page.getByRole('button', { name: '历史 (1)', exact: true })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /请求日志/ }).click()
    await expect(page.getByRole('button', { name: '清空日志' })).toBeEnabled()
  })

  test('一批超过 20 个模型时保留较新的并提示', async ({ page }) => {
    test.setTimeout(45_000)
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(10) }))
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    const models = Array.from({ length: 21 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`)
    await inputByLabel(page, '模型名称').fill(models.join(','))
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('上限')
    await page.getByRole('button', { name: '确认并开始' }).click()

    const note = page.getByTestId('probe-history-note')
    await expect(note).toContainText('本批 21 个模型里，较早的 1 份超出历史上限 20 条', { timeout: 30000 })
    await expect(page.getByTestId('probe-history-row')).toHaveCount(20)
    const stored = await readHistoryStore(page, 'modelprobe')
    expect(stored).toHaveLength(20)
    const missing = models.filter(model => !stored.some(item => item.name === `上限 · ${model}`))
    expect(missing).toHaveLength(1)
  })

  test('top_p 越界默认勾选', async ({ page }) => {
    await goto(page, /模型探测/)
    await expect(page.locator('input[data-id="top_p_range"]')).toBeChecked()
    await expect(page.locator('input[data-id="image-input"]')).not.toBeChecked()
    await expect(page.locator('input[data-id="expect-reject"]')).not.toBeChecked()
  })

  test('top_p 越界只看状态码，非 2xx 正文和 Request ID 留在详情与导出', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.top_p === 2) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: {
            'x-log-id': 'log-range-9',
            'x-openai-request-id': 'oai-should-lose',
            'access-control-expose-headers': '*',
          },
          body: JSON.stringify({ error: { message: 'top_p out of range', tail: 'FULL-RANGE' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'top_p_range')
    await setupRun(page, 'e2e-越界通过')

    const tile = page.locator('[data-probe-tile][data-probe-key="top_p_range@chat"]')
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('非法 top_p 返回 HTTP 400')
    await tile.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('响应体')
    await expect(dialog).toContainText('FULL-RANGE')
    await expect(dialog).toContainText('log-range-9')
    await expect(dialog).not.toContainText('oai-should-lose')
    await expect(dialog.getByRole('button', { name: '复制' })).toHaveCount(3)
    await dialog.getByRole('button', { name: '关闭' }).click()

    const stored = await readHistoryStore(page, 'modelprobe')
    expect(stored).toHaveLength(1)
    const cell = stored[0].results['top_p_range@chat']
    expect(cell.status).toBe('passed')
    expect(cell.repro.requestId).toBe('log-range-9')
    expect(cell.repro.responseBody.error.tail).toBe('FULL-RANGE')
    expect(stored[0].results['chat-basic'].repro.responseBody.choices[0].message.content).toBe('OK')

    const [md] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 Markdown' }).click(),
    ])
    const markdown = readFileSync(await md.path(), 'utf8')
    expect(markdown).toContain('响应体')
    expect(markdown).toContain('FULL-RANGE')
    expect(markdown).toContain('Request ID: log-range-9')

    const [htmlFile] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 HTML' }).click(),
    ])
    const html = readFileSync(await htmlFile.path(), 'utf8')
    expect(html).toContain('FULL-RANGE')
    expect(html).toContain('log-range-9')
    expect(html).toContain('响应体')
  })

  test('预期拒绝不改判 top_p 越界', async ({ page }) => {
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.top_p === 2) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'top_p is not supported' } }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(11) })
    })

    await goto(page, /模型探测/)
    await inputByLabel(page, '模型名称').fill('gpt-6-sol')
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'top_p_range')
    await check(page, 'expect-reject')
    await addChannel(page, { apiKey: 'sk-test-probe' })
    await page.getByRole('button', { name: '▶ 开始测试' }).click()
    await page.getByRole('dialog').locator('input').fill('e2e-越界不改判')
    await page.getByRole('button', { name: '确认并开始' }).click()
    await openFinishedReport(page, 'e2e-越界不改判')

    const tile = page.locator('[data-probe-tile][data-probe-key="top_p_range@chat"]')
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('HTTP 400')
    await expect(tile).not.toContainText('符合预期')
  })

  test('单格重试覆盖原结论，邻居不变，仍打到报告里的地址', async ({ page }) => {
    const urls: string[] = []
    let mode: '400' | '200' | '500' | '401' = '400'
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.top_p === 2) {
        urls.push(route.request().url())
        const status = mode === '400' ? 400 : mode === '200' ? 200 : mode === '500' ? 500 : 401
        const payload = status === 200
          ? JSON.parse(CHAT_OK(9))
          : { error: { message: `mode-${mode}`, tail: 'RETRY-BODY' } }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(12) })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'chat-basic')
    await check(page, 'temperature')
    await check(page, 'top_p_range')
    await setupRun(page, 'e2e-单格重试')

    const tile = page.locator('[data-probe-tile][data-probe-key="top_p_range@chat"]')
    const temperature = page.locator('main').locator('[data-probe-tile]').filter({ hasText: /temperature/ })
    const basic = page.locator('[data-probe-tile][data-probe-key="chat-basic"]')
    await expect(tile).toContainText('通过', { timeout: 10000 })
    const before = await readHistoryStore(page, 'modelprobe')
    expect(before).toHaveLength(1)
    const temperatureDetail = before[0].results['temperature@chat'].detail

    mode = '200'
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await channelCard(page, '测试渠道').getByRole('button', { name: '编辑' }).click()
    await inputByLabel(page, 'Base URL').fill('https://moved.example')
    await page.getByRole('button', { name: '保存渠道' }).click()
    await expect(channelCard(page, '测试渠道')).toContainText('https://moved.example')
    await page.getByRole('button', { name: '测试报告' }).click()
    await page.locator('[data-probe-retry][aria-label="重试 top_p 越界 Chat Completions"]').click()
    await expect(tile).toContainText('失败', { timeout: 10000 })
    await expect(tile).toContainText('top_p=2 被接受（HTTP 200）')
    await expect(temperature).toContainText('通过')
    await expect(basic).toContainText('通过')
    expect(urls.at(-1)).toBe('https://api.openai.com/v1/chat/completions')

    const after = await readHistoryStore(page, 'modelprobe')
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(before[0].id)
    expect(after[0].name).toBe(before[0].name)
    expect(after[0].startedAt).toBe(before[0].startedAt)
    expect(after[0].completedAt).not.toBe(before[0].completedAt)
    expect(after[0].durationMs).toBeGreaterThanOrEqual(before[0].durationMs)
    expect(after[0].logs).toEqual([])
    expect(after[0].results['temperature@chat'].detail).toBe(temperatureDetail)
    expect(after[0].results['chat-basic'].status).toBe('passed')
    expect(after[0].results['top_p_range@chat'].status).toBe('failed')
    expect(after[0].results['top_p_range@chat'].repro.responseBody.id).toBe('chatcmpl-probe')

    mode = '500'
    await page.locator('[data-probe-retry][aria-label="重试 top_p 越界 Chat Completions"]').click()
    await expect(tile).toContainText('异常：HTTP 500', { timeout: 10000 })
    mode = '401'
    await page.locator('[data-probe-retry][aria-label="重试 top_p 越界 Chat Completions"]').click()
    await expect(tile).toContainText('异常：鉴权失败（HTTP 401）', { timeout: 10000 })
    const finalRows = await readHistoryStore(page, 'modelprobe')
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0].id).toBe(before[0].id)
    expect(finalRows[0].results['top_p_range@chat'].repro.responseBody.error.tail).toBe('RETRY-BODY')
    expect(finalRows[0].results['temperature@chat'].detail).toBe(temperatureDetail)
  })

  test('重试被停止时保留原结论，并禁用同一批控件', async ({ page }) => {
    let hold = false
    let release: () => void = () => {}
    await page.route('**/v1/chat/completions', async route => {
      const body = route.request().postDataJSON()
      if (body?.top_p === 2 && hold) {
        await new Promise<void>(resolve => { release = resolve })
        try {
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'late' } }) })
        } catch { /* 页面已经中止这次请求 */ }
        return
      }
      if (body?.top_p === 2) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'range' } }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(8) })
    })

    try {
      await goto(page, /模型探测/)
      await page.getByRole('button', { name: '全不选' }).click()
      await check(page, 'chat-basic')
      await check(page, 'top_p_range')
      await setupRun(page, 'e2e-重试停止')
      const tile = page.locator('[data-probe-tile][data-probe-key="top_p_range@chat"]')
      await expect(tile).toContainText('通过', { timeout: 10000 })
      const before = await readHistoryStore(page, 'modelprobe')

      hold = true
      await page.locator('[data-probe-retry][aria-label="重试 top_p 越界 Chat Completions"]').click()
      await expect(page.getByRole('button', { name: '⏹ 停止' })).toBeVisible()
      await expect(page.getByRole('button', { name: '测试连接' })).toBeDisabled()
      await inputByLabel(page, '模型名称').fill('still-editable')
      await expect(inputByLabel(page, '模型名称')).toHaveValue('still-editable')
      await page.getByRole('button', { name: '实时进度' }).click()
      await expect(page.getByRole('button', { name: '全不选' })).toBeDisabled()
      await page.getByRole('button', { name: /请求日志/ }).click()
      await expect(page.getByRole('button', { name: '清空日志' })).toBeDisabled()
      await page.getByRole('button', { name: '⏹ 停止' }).click()
      await expect(page.getByRole('button', { name: '▶ 开始测试' })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: '测试报告' }).click()
      await expect(tile).toContainText('通过')
      await expect(tile).not.toContainText('失败')

      const after = await readHistoryStore(page, 'modelprobe')
      expect(after).toHaveLength(1)
      expect(after[0].completedAt).toBe(before[0].completedAt)
      expect(after[0].durationMs).toBe(before[0].durationMs)
      expect(after[0].results['top_p_range@chat'].status).toBe('passed')
    } finally {
      release()
    }
  })

  test('找不到渠道时在报告页提示', async ({ page }) => {
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    await writeHistoryStore(page, 'modelprobe', {
      id: 'p-retry-missing',
      name: 'e2e-缺渠道',
      startedAt: '2026-09-29T01:00:00.000Z',
      completedAt: '2026-09-29T01:00:01.000Z',
      durationMs: 1000,
      summary: { passed: 1, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0 },
      logs: [],
      target: { baseUrl: 'https://missing.example', model: 'probe-model', channelName: '不存在的渠道', overrides: { chat: null, responses: null, anthropic: null } },
      results: {
        'top_p_range@chat': { status: 'passed', detail: '通过：非法 top_p 返回 HTTP 400', duration: 10, format: 'chat', repro: { url: 'https://missing.example/v1/chat/completions', headers: {}, body: { top_p: 2 }, status: 400, requestId: null } },
      },
    })
    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /历史/ }).click()
    await page.getByRole('button', { name: '查看', exact: true }).click()
    await page.locator('[data-probe-retry][aria-label="重试 top_p 越界 Chat Completions"]').click()
    await expect(page.getByTestId('probe-retry-notice')).toContainText('没有找到渠道「不存在的渠道」，不能重试。')
    const stored = await readHistoryStore(page, 'modelprobe')
    expect(stored[0].results['top_p_range@chat'].status).toBe('passed')
    expect(stored[0].completedAt).toBe('2026-09-29T01:00:01.000Z')
  })

  test('Anthropic 的 top_p 越界固定 max_tokens，400 仍通过', async ({ page }) => {
    const seen: any[] = []
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON()
      seen.push(body)
      if (body?.top_p === 2) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'bad top_p' } }) })
        return
      }
      if (body?.max_completion_tokens != null) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK() })
        return
      }
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'max_tokens is not supported; use max_completion_tokens' } }),
      })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    await check(page, 'anthropic-basic')
    await check(page, 'top_p_range')
    await setupRun(page, 'e2e-越界-anthropic')

    const ranged = seen.filter(body => body?.top_p === 2)
    expect(ranged).toHaveLength(1)
    expect(ranged[0].max_tokens).toBe(120)
    expect(ranged[0].max_completion_tokens).toBeUndefined()
    const tile = page.locator('[data-probe-tile][data-probe-key="top_p_range@anthropic"]')
    await expect(tile).toContainText('通过', { timeout: 10000 })
    await expect(tile).toContainText('HTTP 400')
  })
})
