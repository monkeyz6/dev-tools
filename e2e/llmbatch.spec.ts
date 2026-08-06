import { test, expect } from '@playwright/test'
import { goto, inputByLabel, fieldOf } from './helpers'

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

test.describe('LLM 批量测试', () => {
  test('mock 200：报告统计成功数、一致性校验与输出 Token 均值', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 10, 5) }))

    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
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
    await inputByLabel(page, 'API Key').fill('sk-test')
    await fieldOf(page, '每模型次数 N').locator('input').fill('1')
    await page.getByRole('button', { name: /开始批量请求/ }).click()
    await expect(page.locator('main')).toContainText('总请求')

    const stored = await page.evaluate(() => localStorage.getItem('llmbatch-history'))
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!)).toHaveLength(1)

    await page.reload()
    await page.getByRole('button', { name: /LLM 批量测试/ }).first().click()
    await page.getByRole('button', { name: /历史/ }).click()
    await expect(page.locator('main')).toContainText('已存 1 / 20 条历史报告')
  })

  test('报告支持导出 CSV', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 9, 4) }))

    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test')
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

  test('API Key 加密后持久化：reload 后自动回填，localStorage 中不含明文', async ({ page }) => {
    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test-secret-abc123')
    // 等待加密写入完成（异步 Web Crypto），轮询直到 llmbatch-key 出现
    await expect.poll(() => page.evaluate(() => localStorage.getItem('llmbatch-key'))).toBeTruthy()

    const stored = await page.evaluate(() => localStorage.getItem('llmbatch-key'))
    expect(stored).not.toContain('sk-test-secret-abc123') // 落盘的是密文，不是明文

    await page.reload()
    await page.getByRole('button', { name: /LLM 批量测试/ }).first().click()
    // 解密回填后，开始按钮应因 apiKey/baseUrl 均非空而可用
    await expect(page.getByRole('button', { name: /开始批量请求/ })).toBeEnabled()
    await expect(inputByLabel(page, 'API Key')).toHaveValue('sk-test-secret-abc123')
  })

  test('清空 API Key 会清除本地加密存储', async ({ page }) => {
    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test-to-clear')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('llmbatch-key'))).toBeTruthy()

    await inputByLabel(page, 'API Key').fill('')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('llmbatch-key'))).toBeNull()
  })

  test('报告支持查看请求体与复制 cURL', async ({ page }) => {
    await page.route('**/v1/messages', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ANTHROPIC_OK_BODY('claude-3-5-sonnet-20241022', 8, 4) }))

    await goto(page, /LLM 批量测试/)
    await inputByLabel(page, 'API Key').fill('sk-test-curl')
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

    await page.getByRole('button', { name: '✕ 关闭' }).click()
    await expect(page.getByText('cURL 命令含明文 API Key')).not.toBeVisible()
  })
})
