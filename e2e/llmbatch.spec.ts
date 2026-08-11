import { test, expect } from '@playwright/test'
import { goto, inputByLabel, fieldOf, readHistoryStore } from './helpers'

test.beforeEach(async ({ page }) => {
  // 仅在标签页首次加载时清空 localStorage；reload 不再清，便于测试历史报告持久化
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

// 默认 API 类型是 Anthropic Messages API，默认模型是 claude-3-5-sonnet-20241022，
// 默认请求体含 "model": "{{model}}" 占位符（见 App.tsx 的 DEFAULT_LLM_BODY）。
// 跑完一批请求后，右侧面板会自动从「实时」切到「报告」，所以断言一律针对报告面板的
// 稳定内容（而非转瞬即逝的实时日志），避免 mock 响应过快导致实时面板还没被断言到就已切走。
const ANTHROPIC_OK_BODY = (model: string, inputTokens: number, outputTokens: number) => JSON.stringify({
  model, usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  content: [{ type: 'text', text: '这是一段测试回复。' }],
})

// 渠道管理已取代左侧栏直填 baseUrl/apiKey（见「渠道管理」Tab）：新增一个渠道并保存，
// 首个渠道会自动设为当前使用。点「开始批量请求」时会自动把右侧面板切回「实时」，
// 所以这里不需要手动切回去。
async function addChannel(page: import('@playwright/test').Page, opts: { apiKey: string; baseUrl?: string; name?: string }) {
  await page.getByRole('button', { name: /渠道管理/ }).click()
  await inputByLabel(page, '渠道名称').fill(opts.name ?? '测试渠道')
  await inputByLabel(page, 'Base URL').fill(opts.baseUrl ?? 'https://api.anthropic.com')
  await inputByLabel(page, 'apiKey').fill(opts.apiKey)
  await page.getByRole('button', { name: '保存渠道' }).click()
}

test.describe('LLM 批量测试', () => {
  test('mock 200：报告统计成功数、一致性校验与输出 Token 均值', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 10, 5) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('3')
    const run = page.getByRole('button', { name: /开始批量请求/ })
    await expect(run).toBeEnabled()
    await run.click()

    const main = page.locator('main')
    await expect(main).toContainText('总请求 3')
    await expect(main).toContainText('成功 3')
    await expect(main).toContainText('恒定，均为 10') // 输入 Token 一致性校验
    await expect(main).toContainText('均值 5.0') // 输出 Token 波动图的统计行
    await expect(main).not.toContainText('≠') // 返回模型与请求模型一致，无验真告警
    await expect(page.getByRole('cell', { name: '#1' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '#3' })).toBeVisible()
  })

  test('mock 500：报告展示失败计数与 HTTP 状态码', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'boom' } }) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('2')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    const main = page.locator('main')
    await expect(main).toContainText('失败 2')
    await expect(main).toContainText('HTTP 500')
    await expect(main).toContainText('boom')
    await expect(main).toContainText('无可用的成功请求输入 Token 数据')
  })

  test('多模型批量：全局并发下报告按模型分别汇总', async ({ page }) => {
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON() as { model: string }
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY(body.model, 20, 8) })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '模型列表').locator('textarea').fill('claude-3-5-sonnet-20241022\nclaude-3-haiku-20240307')
    await fieldOf(page, '每模型次数 N').locator('input').fill('2')
    await fieldOf(page, '全局并发数 C').locator('input').fill('2')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    const main = page.locator('main')
    await expect(main).toContainText('总请求 4')
    await expect(main).toContainText('成功 4')
    await expect(main).toContainText('claude-3-5-sonnet-20241022')
    await expect(main).toContainText('claude-3-haiku-20240307')
  })

  test('{{model}} 占位符按请求任务正确替换为对应模型名', async ({ page }) => {
    const seenModels: string[] = []
    await page.route('**/v1/messages', async route => {
      const body = route.request().postDataJSON() as { model: string }
      seenModels.push(body.model)
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY(body.model, 5, 3) })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '模型列表').locator('textarea').fill('model-a\nmodel-b')
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await fieldOf(page, '全局并发数 C').locator('input').fill('2')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    await expect(page.locator('main')).toContainText('总请求 2')
    expect(seenModels.sort()).toEqual(['model-a', 'model-b'])
  })

  test('输入 Token 不一致时，报告的一致性校验区标红提示', async ({ page }) => {
    let call = 0
    await page.route('**/v1/messages', async route => {
      call++
      const body = route.request().postDataJSON() as { model: string }
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY(body.model, call === 1 ? 100 : 120, 5) })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('2')
    await fieldOf(page, '全局并发数 C').locator('input').fill('1') // 串行保证 call 顺序稳定
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    const main = page.locator('main')
    await expect(main).toContainText('输入 Token 一致性校验')
    await expect(main).toContainText('不一致')
    // 输入 Token 不一致时才展示对应分布图（一致就没必要画图）
    await expect(main).toContainText('输入 Token 分布（不一致）')
  })

  test('模型名过长时单行省略号截断，且可通过 title 悬浮查看完整内容', async ({ page }) => {
    const longModel = 'deepseek-v4-flash-super-long-model-name-for-truncation-test'
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY(longModel, 12, 6) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '模型列表').locator('textarea').fill(longModel)
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    await expect(page.locator('main')).toContainText('总请求 1')
    // 单行截断的模型名单元格用 title 属性承载完整文本
    const truncated = page.locator(`[title="${longModel}"]`).first()
    await expect(truncated).toBeVisible()
    await expect(truncated).toHaveCSS('white-space', 'nowrap')
    await expect(truncated).toHaveCSS('text-overflow', 'ellipsis')
  })

  test('返回模型与请求模型不一致时，报告明细标记 ≠（验真）', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('some-other-model', 10, 5) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    const main = page.locator('main')
    await expect(main).toContainText('总请求 1')
    await expect(main).toContainText('some-other-model')
    await expect(main).toContainText('≠')
  })

  test('实时进度：请求进行中可见「停止」按钮与总进度', async ({ page }) => {
    await page.route('**/v1/messages', async route => {
      await new Promise(r => setTimeout(r, 400))
      await route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 10, 5) })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('2')
    await fieldOf(page, '全局并发数 C').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()

    // 请求仍在进行中（串行 + 每请求 400ms 延迟）：可见「停止」按钮与总进度
    await expect(page.getByRole('button', { name: /停止/ })).toBeVisible()
    await expect(page.locator('main')).toContainText('总进度')

    // 跑完后自动切到报告面板
    await expect(page.locator('main')).toContainText('总请求 2', { timeout: 10000 })
  })

  test('历史报告：跑完自动入库，reload 后仍在', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 7, 3) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求')

    const stored = await readHistoryStore(page, 'llmbatch')
    expect(stored).toHaveLength(1)

    await page.reload()
    await page.getByRole('link', { name: /LLM 批量测试/ }).first().click()
    await page.getByRole('button', { name: /历史/ }).click()
    await expect(page.locator('main')).toContainText('已存 1 / 20 条历史报告')
  })

  test('报告支持导出 CSV', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 9, 4) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求')

    await page.getByRole('button', { name: /^导出/ }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^report_\d{8}_\d{6}\.csv$/)
  })

  // 回归用例：html2canvas 1.x 无法解析 color-mix()/color() 等现代 CSS 颜色函数（Tailwind v4
  // 主题大量使用），导出图片/HTML/PDF 曾经全部静默失败且完全没有测试覆盖到；已换成兼容新
  // CSS 颜色函数的 html2canvas-pro，这里锁定三种格式都能正常触发下载、不再弹失败提示。
  test('报告支持导出图片 / HTML / PDF（html2canvas-pro）', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss() })

    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 9, 4) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求')

    for (const [label, ext] of [['导出图片', 'png'], ['导出 HTML', 'html'], ['导出 PDF', 'pdf']] as const) {
      await page.getByRole('button', { name: /^导出/ }).click()
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: label }).click(),
      ])
      expect(download.suggestedFilename().endsWith('.' + ext)).toBe(true)
    }
    expect(dialogs).toEqual([]) // 三种格式都没有触发失败提示的 alert
  })

  test('渠道 API Key 加密后持久化：reload 后仍在，localStorage 中不含明文', async ({ page }) => {
    await goto(page, /LLM 批量测试/)
    await addChannel(page, { name: '测试渠道', apiKey: 'sk-test-secret-abc123' })
    await expect(page.locator('div.pr-16', { hasText: '测试渠道' })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()

    const stored = await page.evaluate(() => localStorage.getItem('llmbatch-channels'))
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('sk-test-secret-abc123') // 落盘的是密文，不是明文

    await page.reload()
    await page.getByRole('link', { name: /LLM 批量测试/ }).first().click()
    await page.getByRole('button', { name: /渠道管理/ }).click()
    // reload 后渠道列表与「当前使用」状态仍从 localStorage 正确恢复
    await expect(page.locator('div.pr-16', { hasText: '测试渠道' })).toBeVisible()
    await expect(page.getByText('✓ 当前使用')).toBeVisible()
    await expect(page.getByRole('button', { name: /开始批量请求/ })).toBeEnabled()
  })

  test('删除渠道后本地加密存储一并清除', async ({ page }) => {
    await goto(page, /LLM 批量测试/)
    await addChannel(page, { name: '待删除渠道', apiKey: 'sk-test-to-clear' })
    await expect.poll(() => page.evaluate(() => localStorage.getItem('llmbatch-channels'))).toContain('待删除渠道')

    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: '删除', exact: true }).click()

    await expect(page.getByText('还没有渠道，请在下方添加。')).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('llmbatch-channels'))
    expect(stored).not.toContain('待删除渠道')
    await expect(page.getByRole('button', { name: /开始批量请求/ })).toBeDisabled()
  })

  test('报告支持查看请求体与复制 cURL', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 8, 4) }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test-curl' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求 1')

    await page.getByRole('button', { name: '请求体 / cURL' }).click()
    const main = page.locator('main')
    await expect(main).toContainText('"model": "claude-3-5-sonnet-20241022"')
    await expect(main).toContainText('curl -X POST')
    await expect(main).toContainText('https://api.anthropic.com/v1/messages')
    await expect(main).toContainText('x-api-key: sk-test-curl')
    await expect(main).toContainText('cURL 命令含明文 API Key')

    await page.getByRole('button', { name: '✕' }).click()
    await expect(page.getByText('cURL 命令含明文 API Key')).not.toBeVisible()
  })

  // 通过 localStorage 直接种一条 OpenAI Chat 协议的流式提示词，绕开提示词编辑弹窗操作，
  // 专注验证 doLlmRequest 里 stream_options 注入与 SSE usage 提取的行为。
  // baseUrl 已归入渠道，不再通过 llmbatch-config 预置，而是各用例里用 addChannel 显式创建，
  // 避免与「旧配置自动迁移为默认渠道」的逻辑产生冲突。
  function seedOpenaiChatStreamPrompt(page: import('@playwright/test').Page, bodyObj: Record<string, unknown>) {
    return page.addInitScript(([cfg, prompt]) => {
      localStorage.setItem('llmbatch-config', cfg as string)
      localStorage.setItem('llmbatch-prompts', prompt as string)
    }, [
      JSON.stringify({ apiType: 'openai_chat' }),
      JSON.stringify([{ id: 'p1', title: 'stream-test', body: JSON.stringify(bodyObj), createdAt: 1, updatedAt: 1 }]),
    ])
  }

  test('流式（OpenAI Chat）：请求体未带 stream_options 时自动注入 include_usage 并正确识别 token', async ({ page }) => {
    await seedOpenaiChatStreamPrompt(page, { model: '{{model}}', stream: true, messages: [{ role: 'user', content: 'hi' }] })

    const sse = [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', model: 'gpt-4o-mini', choices: [{ delta: { content: 'Hi' } }] })}`,
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', choices: [{ delta: { content: ' there' } }] })}`,
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 15, completion_tokens: 7, total_tokens: 22 } })}`,
      'data: [DONE]',
    ].join('\n\n') + '\n\n'

    let seenBody: any = null
    await page.route('**/v1/chat/completions', async route => {
      seenBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test', baseUrl: 'https://api.example.com' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求 1')

    expect(seenBody.stream_options).toEqual({ include_usage: true })

    const stored = await readHistoryStore(page, 'llmbatch')
    const result = stored[0].results[0]
    expect(result.status).toBe('ok')
    expect(result.inputTokens).toBe(15)
    expect(result.outputTokens).toBe(7)
    expect(result.tokenNote ?? null).toBeNull()
  })

  test('流式（OpenAI Chat）：请求体已自带 stream_options 时仍会合并注入 include_usage（回归用例）', async ({ page }) => {
    // 请求体自带 stream_options.include_usage: false —— 修复前的旧逻辑遇到这种情况会整体跳过注入，
    // 导致网关不下发 usage、token 无法识别。
    await seedOpenaiChatStreamPrompt(page, {
      model: '{{model}}', stream: true, stream_options: { include_usage: false },
      messages: [{ role: 'user', content: 'hi' }],
    })

    const sse = [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', model: 'gpt-4o-mini', choices: [{ delta: { content: 'Hi' } }] })}`,
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } })}`,
      'data: [DONE]',
    ].join('\n\n') + '\n\n'

    let seenBody: any = null
    await page.route('**/v1/chat/completions', async route => {
      seenBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
    })

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test', baseUrl: 'https://api.example.com' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求 1')

    // include_usage 被强制合并为 true，且未破坏 stream_options 里其它已存在的子字段结构
    expect(seenBody.stream_options.include_usage).toBe(true)

    const stored = await readHistoryStore(page, 'llmbatch')
    const result = stored[0].results[0]
    expect(result.inputTokens).toBe(12)
    expect(result.outputTokens).toBe(4)
  })

  test('流式（OpenAI Chat）：网关未返回 usage 时明细表格给出非阻断提示而非静默空白', async ({ page }) => {
    await seedOpenaiChatStreamPrompt(page, { model: '{{model}}', stream: true, messages: [{ role: 'user', content: 'hi' }] })

    // 只有内容增量，没有任何带 usage 字段的 chunk
    const sse = [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', model: 'gpt-4o-mini', choices: [{ delta: { content: 'Hi there' } }] })}`,
      'data: [DONE]',
    ].join('\n\n') + '\n\n'

    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse }))

    await goto(page, /LLM 批量测试/)
    await addChannel(page, { apiKey: 'sk-test', baseUrl: 'https://api.example.com' })
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求 1')

    const main = page.locator('main')
    await expect(main).toContainText('成功 1') // 请求本身仍算成功，不因缺 usage 而判失败
    await expect(main).toContainText('⚠ 流式响应未包含 usage 数据')

    const stored = await readHistoryStore(page, 'llmbatch')
    const result = stored[0].results[0]
    expect(result.status).toBe('ok')
    expect(result.inputTokens).toBeNull()
    expect(result.outputTokens).toBeNull()
    expect(result.tokenNote).toContain('流式响应未包含 usage 数据')
  })
})
