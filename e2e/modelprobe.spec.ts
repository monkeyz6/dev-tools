import { test, expect } from '@playwright/test'
import { goto, inputByLabel } from './helpers'
import { readFileSync } from 'fs'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

const CHAT_OK = (promptTokens: number, cached = 0) => JSON.stringify({
  id: 'chatcmpl-probe',
  choices: [{ message: { role: 'assistant', content: 'OK' } }],
  usage: { prompt_tokens: promptTokens, completion_tokens: 5, prompt_tokens_details: { cached_tokens: cached } },
})
const RESPONSES_OK = JSON.stringify({
  id: 'resp-probe',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
  usage: { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } },
})
const ANTHROPIC_OK = JSON.stringify({
  id: 'msg-probe',
  content: [{ type: 'text', text: 'OK' }],
  usage: { input_tokens: 8, output_tokens: 3, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
})

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
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-request-id': 'req-resp-0002', 'access-control-expose-headers': '*' }, body: RESPONSES_OK }))
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-oneapi-request-id': 'req-anth-0003', 'access-control-expose-headers': '*' }, body: ANTHROPIC_OK }))

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
    await expect(main).toContainText('chat:不支持', { timeout: 10000 })
    await expect(main).toContainText('chat:通过')
    // 展开 temperature / top_p 行查看错误信息与结论
    await main.getByText('temperature', { exact: true }).click()
    await expect(main).toContainText('unknown parameter: temperature')
    await main.getByText('top_p', { exact: true }).click()
    await expect(main).toContainText('组合请求通过')
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
    await expect(main).toContainText('chat:通过', { timeout: 10000 })
    await main.getByText('Token 计算稳定性', { exact: true }).click()
    await expect(main).toContainText('3 次输入 Token 均为 10')
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
  })

  test('勾选状态持久化：reload 后仍保持', async ({ page }) => {
    await goto(page, /模型探测/)
    await uncheck(page, 'multi-turn')
    await page.getByRole('button', { name: '全选' }).click()
    await uncheck(page, 'multi-turn')

    const stored = await page.evaluate(() => localStorage.getItem('modelprobe-config'))
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!).selected['multi-turn']).toBe(false)

    await page.reload()
    await goto(page, /模型探测/)
    await expect(page.locator('input[data-id="multi-turn"]')).not.toBeChecked()
    await expect(page.locator('input[data-id="chat-basic"]')).toBeChecked()
  })

  test('渠道 API Key 加密持久化：reload 后仍在，localStorage 无明文', async ({ page }) => {
    await goto(page, /模型探测/)
    await addChannel(page, { name: '测试渠道', apiKey: 'sk-enc-secret-abc123' })
    await expect(page.getByText('测试渠道', { exact: true })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()

    const stored = await page.evaluate(() => localStorage.getItem('modelprobe-channels'))
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('sk-enc-secret-abc123')

    await page.reload()
    await goto(page, /模型探测/)
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await expect(page.getByText('测试渠道', { exact: true })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()
    await inputByLabel(page, '模型名称').fill('probe-model')
    await expect(page.getByRole('button', { name: /开始测试/ })).toBeEnabled()
  })

  test('测试连接：三格式端点可达性与鉴权即时反馈', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_OK(5) }))
    await page.route('**/v1/responses', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK }))
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_OK })
    })

    await goto(page, /模型探测/)
    await page.getByRole('button', { name: '全不选' }).click()
    for (const id of ['responses-basic', 'stream-false', 'stream-true', 'system-prompt', 'multi-turn', 'error-shape', 'concurrency']) await check(page, id)
    await setupRun(page, 'e2e-仅Responses格式')

    await expect(page.locator('main')).toContainText('通过 7', { timeout: 10000 })
    expect(chatCalls).toBe(0)
    expect(responsesCalls).toBe(9) // basic 1 + stream-false 1 + stream-true 1 + system 1 + multi-turn 1 + error-shape 1 + concurrency 3
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

    await expect(page.locator('main')).toContainText('对应协议格式未启用（未勾选 Anthropic Messages 基础测试）', { timeout: 10000 })
    expect(anthropicCalls).toBe(0)
  })
})
