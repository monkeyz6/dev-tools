import { test, expect } from '@playwright/test'
import { goto, inputByLabel, readKv, readHistoryStore, writeHistoryStore, channelCard } from './helpers'
import { readFileSync } from 'fs'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

// 首个请求（预热）返回未命中/写入，后续请求返回命中
const CHAT_BODY = (cached: number) => JSON.stringify({
  id: 'chatcmpl-cache',
  choices: [{ message: { role: 'assistant', content: 'OK' } }],
  usage: { prompt_tokens: 2100, completion_tokens: 3, prompt_tokens_details: { cached_tokens: cached } },
})
const RESPONSES_BODY = (cached: number) => JSON.stringify({
  id: 'resp-cache',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
  usage: { input_tokens: 2100, output_tokens: 3, input_tokens_details: { cached_tokens: cached } },
})
const ANTHROPIC_BODY = (read: number, write: number) => JSON.stringify({
  id: 'msg-cache',
  content: [{ type: 'text', text: 'OK' }],
  usage: { input_tokens: 60, output_tokens: 3, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

async function addChannel(page: import('@playwright/test').Page, opts: { apiKey?: string; name?: string } = {}) {
  await page.getByRole('button', { name: /渠道管理/ }).click()
  await inputByLabel(page, '渠道名称').fill(opts.name ?? '测试渠道')
  await inputByLabel(page, 'Base URL').fill('https://api.openai.com')
  await inputByLabel(page, 'apiKey').fill(opts.apiKey ?? 'sk-cachehit-secret-123456')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: /实时进度/ }).click()
}

async function startRun(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: '▶ 开始测试' }).click()
  await page.getByRole('dialog').locator('input').fill(name)
  await page.getByRole('button', { name: '确认并开始' }).click()
}

/** 跑完停在历史并勾上新报告。长报告要再点「查看所选」。 */
async function openCheckedReport(page: import('@playwright/test').Page) {
  const view = page.getByRole('button', { name: '查看所选' })
  await expect(view).toBeEnabled({ timeout: 20000 })
  await view.click()
}

async function selectCases(page: import('@playwright/test').Page, ids: Array<'repeat' | 'multiturn' | 'suffix'>) {
  for (const id of ['repeat', 'multiturn', 'suffix'] as const) {
    const box = page.locator(`input[data-case="${id}"]`)
    if (ids.includes(id)) await box.check()
    else await box.uncheck()
  }
}

test.describe('缓存命中率测试', () => {
  test('三协议闭环：预热 + 2 轮测量全命中，报告展示命中率/覆盖率并写入历史', async ({ page }) => {
    const calls = { chat: 0, responses: 0, anthropic: 0 }
    const bodies: Record<string, any[]> = { chat: [], responses: [], anthropic: [] }
    await page.route('**/v1/chat/completions', route => {
      calls.chat++
      bodies.chat.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(calls.chat === 1 ? 0 : 2048) })
    })
    await page.route('**/v1/responses', route => {
      calls.responses++
      bodies.responses.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: RESPONSES_BODY(calls.responses === 1 ? 0 : 2048) })
    })
    await page.route('**/v1/messages', route => {
      calls.anthropic++
      bodies.anthropic.push(route.request().postDataJSON())
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: calls.anthropic === 1 ? ANTHROPIC_BODY(0, 2040) : ANTHROPIC_BODY(2040, 0),
      })
    })

    await goto(page, /缓存命中率/)
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '测量轮数').fill('2')
    await startRun(page, 'e2e-三协议全命中')
    await openCheckedReport(page)

    const main = page.locator('main')
    // 报告：三个协议 section 都在，命中率 100%，结论为正常
    await expect(main).toContainText('缓存命中率测试报告', { timeout: 10000 })
    await expect(main).toContainText('e2e-三协议全命中')
    for (const f of ['chat', 'responses', 'anthropic']) {
      await expect(main.locator(`[data-format-report="${f}"]`)).toContainText('100.0%')
      await expect(main.locator(`[data-format-report="${f}"]`)).toContainText('全部命中')
    }
    // chat/responses 覆盖率 = 2048/2100 = 97.5%；anthropic 归一化后 2040/2100 = 97.1%
    await expect(main.locator('[data-format-report="chat"]')).toContainText('97.5%')
    await expect(main.locator('[data-format-report="anthropic"]')).toContainText('97.1%')
    // 每协议 1 次预热 + 2 次测量
    expect(calls).toEqual({ chat: 3, responses: 3, anthropic: 3 })

    // 请求体构造符合官方缓存语义
    expect(bodies.chat[0].prompt_cache_key).toContain('cache-hit-test')
    expect(String(bodies.chat[0].messages[0].content)).toContain('cache-hit-test')
    expect(bodies.chat[0].messages[0].content).toBe(bodies.chat[2].messages[0].content) // 前缀跨轮完全一致
    expect(bodies.chat[0].messages[1].content).not.toBe(bodies.chat[2].messages[1].content) // 后缀每轮变化
    expect(bodies.responses[0].prompt_cache_key).toContain('cache-hit-test')
    expect(bodies.anthropic[0].system[0].cache_control).toEqual({ type: 'ephemeral' })

    // 历史入库（IndexedDB cachehit store）
    await expect.poll(async () => (await readHistoryStore(page, 'cachehit')).length).toBe(1)
    const rec = (await readHistoryStore(page, 'cachehit'))[0]
    expect(rec.results).toHaveLength(3)
    expect(rec.caseResults).toHaveLength(1)
    expect(rec.caseResults[0].caseId).toBe('suffix')
    expect(rec.target.model).toBe('cache-model')
    await expect(main.locator('[data-case-report="suffix"]')).toContainText('尾部变化')
  })

  test('全部未命中：结论提示未命中并给出可能原因', async ({ page }) => {
    await page.route('**/v1/chat/completions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(0) }))

    await goto(page, /缓存命中率/)
    // 只测 chat
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '测量轮数').fill('2')
    await startRun(page, 'e2e-未命中')
    await openCheckedReport(page)

    const main = page.locator('main')
    await expect(main.locator('[data-format-report="chat"]')).toContainText('0.0%', { timeout: 10000 })
    await expect(main.locator('[data-format-report="chat"]')).toContainText('全部未命中')
  })

  test('配置与渠道持久化：kv 不含明文 key，刷新后配置保留', async ({ page }) => {
    await goto(page, /缓存命中率/)
    await addChannel(page, { apiKey: 'sk-plaintext-should-not-leak' })
    await inputByLabel(page, '模型名称').fill('persist-model')
    await inputByLabel(page, '测量轮数').fill('7')

    await expect.poll(() => readKv(page, 'cachehit-channels')).toContain('测试渠道')
    const channelsRaw = await readKv(page, 'cachehit-channels')
    expect(channelsRaw).not.toContain('sk-plaintext-should-not-leak')
    expect(channelsRaw).toContain('apiKeyEnc')
    await expect.poll(() => readKv(page, 'cachehit-config')).toContain('persist-model')

    await page.reload()
    await expect(inputByLabel(page, '模型名称')).toHaveValue('persist-model')
    await expect(inputByLabel(page, '测量轮数')).toHaveValue('7')
    await expect(page.locator('input[data-case="suffix"]')).toBeChecked()
    await expect(page.locator('input[data-case="repeat"]')).not.toBeChecked()
    await expect(page.locator('input[data-case="multiturn"]')).not.toBeChecked()
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await expect(page.locator('main')).toContainText('测试渠道')
  })

  test('HTML 导出：自包含单文件包含报告标题与统计数据', async ({ page }) => {
    let n = 0
    await page.route('**/v1/chat/completions', route => {
      n++
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(n === 1 ? 0 : 2048) })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '测量轮数').fill('2')
    await startRun(page, 'e2e-导出')
    await openCheckedReport(page)

    await expect(page.locator('main')).toContainText('缓存命中率测试报告', { timeout: 10000 })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 HTML' }).click()
    const download = await downloadPromise
    const html = readFileSync(await download.path(), 'utf-8')
    expect(html).toContain('LLM 缓存命中率测试报告')
    expect(html).toContain('e2e-导出')
    expect(html).toContain('cache-model')
    expect(html).toContain('100.0%')
    expect(html).not.toContain('测试方法说明')
    // 不泄漏明文 key（导出只带 keyMask）
    expect(html).not.toContain('sk-cachehit-secret-123456')

    // 离线打开必须能滚动：应用样式里的 body{overflow:hidden} 要被覆盖样式压掉
    await page.setContent(html)
    const scroll = await page.evaluate(() => {
      document.documentElement.scrollTop = 5000
      return {
        bodyOverflow: getComputedStyle(document.body).overflow,
        scrolledTo: document.documentElement.scrollTop || document.body.scrollTop,
        docScrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      }
    })
    expect(scroll.bodyOverflow).toBe('auto')
    expect(scroll.docScrollH).toBeGreaterThan(scroll.innerH)
    expect(scroll.scrolledTo).toBeGreaterThan(0)
  })

  test('PNG 导出：截图有实际内容（不是纯背景空白图）', async ({ page }) => {
    let n = 0
    await page.route('**/v1/chat/completions', route => {
      n++
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(n === 1 ? 0 : 2048) })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '测量轮数').fill('2')
    await startRun(page, 'e2e-图片导出')
    await openCheckedReport(page)

    await expect(page.locator('main')).toContainText('缓存命中率测试报告', { timeout: 10000 })
    await expect(page.locator('main')).toContainText('每轮输入 Token 构成', { timeout: 10000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 PNG' }).click()
    const pngPath = await (await downloadPromise).path()
    const b64 = readFileSync(pngPath).toString('base64')
    const darkRatio = await page.evaluate(async (data: string) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + data
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let dark = 0, total = 0
      for (let i = 0; i < d.length; i += 4 * 7) {
        total++
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 200) dark++
      }
      return dark / total
    }, b64)
    // 之前的实现会截出一张纯 --bg 空白图（darkRatio 恒为 0）
    expect(darkRatio).toBeGreaterThan(0.02)
  })

  test('重复请求：各轮请求体完全一致', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', route => {
      bodies.push(route.request().postDataJSON())
      const n = bodies.length
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(n === 1 ? 0 : 2048) })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await selectCases(page, ['repeat'])
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '重放轮数').fill('2')
    await startRun(page, 'e2e-重复请求')
    await openCheckedReport(page)

    const main = page.locator('main')
    await expect(main.locator('[data-case-report="repeat"]')).toContainText('重复请求', { timeout: 10000 })
    await expect(main.locator('[data-case-report="repeat"] [data-format-report="chat"]')).toContainText('100.0%')
    expect(bodies).toHaveLength(3)
    expect(bodies[0].messages[1].content).toBe(bodies[1].messages[1].content)
    expect(bodies[0].messages[1].content).toBe(bodies[2].messages[1].content)
    expect(JSON.stringify(bodies[0].messages)).toBe(JSON.stringify(bodies[2].messages))
  })

  test('多轮对话：第 2 轮含上一轮 assistant，空回复只多打 1 次', async ({ page }) => {
    const bodies: any[] = []
    await page.route('**/v1/chat/completions', route => {
      const n = bodies.length + 1
      bodies.push(route.request().postDataJSON())
      const content = n === 1 ? '' : 'OK-from-warmup'
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'chatcmpl-cache',
          choices: [{ message: { role: 'assistant', content } }],
          usage: { prompt_tokens: 2100, completion_tokens: 3, prompt_tokens_details: { cached_tokens: n === 1 ? 0 : 2048 } },
        }),
      })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await selectCases(page, ['multiturn'])
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '对话轮数').fill('2')
    await startRun(page, 'e2e-多轮对话')
    await openCheckedReport(page)

    const main = page.locator('main')
    await expect(main.locator('[data-case-report="multiturn"]')).toContainText('多轮对话', { timeout: 10000 })
    await expect(main.locator('[data-case-report="multiturn"]')).toContainText('前缀仍命中')
    // 预热空回复重试 1 次 + 预热成功 + 2 轮测量 = 4
    expect(bodies).toHaveLength(4)
    expect(bodies[0].messages).toHaveLength(2) // system + user
    expect(bodies[1].messages).toHaveLength(2) // 重试同一轮，仍未拼 assistant
    const measure1 = bodies[2].messages
    expect(measure1.some((m: any) => m.role === 'assistant' && m.content === 'OK-from-warmup')).toBe(true)
    expect(measure1.filter((m: any) => m.role === 'user').length).toBe(2)
  })

  test('三个 case 全跑：历史仍是 1 条，报告含三个标题', async ({ page }) => {
    await page.route('**/v1/chat/completions', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(2048) })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await selectCases(page, ['repeat', 'multiturn', 'suffix'])
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('cache-model')
    await inputByLabel(page, '重放轮数').fill('2')
    await inputByLabel(page, '对话轮数').fill('2')
    await inputByLabel(page, '测量轮数').fill('2')
    await startRun(page, 'e2e-三场景全跑')
    await openCheckedReport(page)

    const main = page.locator('main')
    await expect(main).toContainText('缓存命中率测试报告', { timeout: 15000 })
    await expect(main.locator('[data-case-report="repeat"]')).toContainText('重复请求')
    await expect(main.locator('[data-case-report="multiturn"]')).toContainText('多轮对话')
    await expect(main.locator('[data-case-report="suffix"]')).toContainText('尾部变化')

    await expect.poll(async () => (await readHistoryStore(page, 'cachehit')).length).toBe(1)
    const rec = (await readHistoryStore(page, 'cachehit'))[0]
    expect(rec.caseResults.map((c: { caseId: string }) => c.caseId)).toEqual(['repeat', 'multiturn', 'suffix'])
  })

  test('历史勾选：两条不同渠道的报告打开矩阵，再回到单份长报告', async ({ page }) => {
    const usage = (total: number, cacheRead: number, cacheWrite: number) => ({
      input: total, output: 3, cacheRead, cacheWrite, totalPrompt: total,
    })
    const result = (format: 'chat' | 'responses', coverage: number) => {
      const total = 2000
      const read = Math.round(total * coverage)
      return {
        format,
        status: 'ok' as const,
        measured: 2,
        failedRounds: 0,
        hitCount: 2,
        hitRate: 1,
        coverage,
        savedTokens: read * 2,
        cacheWriteTokens: 2000,
        fieldMissing: 0,
        warmupMs: 120,
        hitAvgMs: 40,
        missAvgMs: null,
        rounds: [
          { round: 0, warmup: true, status: 'ok', httpStatus: 200, durationMs: 120, hit: false, usage: usage(total, 0, 2000) },
          { round: 1, warmup: false, status: 'ok', httpStatus: 200, durationMs: 40, hit: true, usage: usage(total, read, 0) },
          { round: 2, warmup: false, status: 'ok', httpStatus: 200, durationMs: 42, hit: true, usage: usage(total, read, 0) },
        ],
      }
    }
    const report = (opts: {
      id: string
      name: string
      at: string
      model: string
      channel: string
      baseUrl: string
      format: 'chat' | 'responses'
      coverage: number
    }) => {
      const cell = result(opts.format, opts.coverage)
      return {
        id: opts.id,
        name: opts.name,
        startedAt: opts.at,
        completedAt: opts.at,
        durationMs: 1000,
        target: { baseUrl: opts.baseUrl, model: opts.model, channelName: opts.channel },
        params: { prefixTokens: 2048, rounds: 2, nonce: opts.id, cases: ['suffix'], caseRounds: { suffix: 2 } },
        results: [cell],
        caseResults: [{ caseId: 'suffix', nonce: opts.id + '-suffix', rounds: 2, results: [cell] }],
      }
    }

    await goto(page, /缓存命中率/)
    await writeHistoryStore(page, 'cachehit', report({
      id: 'c-matrix-a', name: 'e2e-矩阵甲', at: '2026-09-01T01:00:00.000Z',
      model: 'gpt-4o', channel: '渠道甲', baseUrl: 'https://a.example', format: 'chat', coverage: 0.9,
    }))
    await writeHistoryStore(page, 'cachehit', report({
      id: 'c-matrix-b', name: 'e2e-矩阵乙', at: '2026-09-01T02:00:00.000Z',
      model: 'claude-sonnet', channel: '渠道乙', baseUrl: 'https://b.example', format: 'responses', coverage: 0.5,
    }))
    await page.reload()
    await goto(page, /缓存命中率/)
    await page.getByRole('button', { name: /历史/ }).click()
    const viewBtn = page.getByRole('button', { name: '查看所选' })
    await expect(viewBtn).toBeDisabled()
    await page.getByRole('checkbox', { name: '选择 e2e-矩阵甲' }).check()
    await page.getByRole('checkbox', { name: '选择 e2e-矩阵乙' }).check()
    await viewBtn.click()

    const matrix = page.getByTestId('cache-matrix-view')
    await expect(matrix).toBeVisible()
    await expect(matrix.getByRole('heading', { name: '缓存命中率' })).toBeVisible()
    await expect(matrix).toContainText('协议')
    await expect(matrix).toContainText('gpt-4o')
    await expect(matrix).toContainText('claude-sonnet')
    await expect(matrix).toContainText('渠道甲')
    await expect(matrix).toContainText('渠道乙')
    await expect(matrix).toContainText('尾部变化')
    await expect(matrix).not.toContainText('重复请求')
    await expect(matrix).not.toContainText('多轮对话')
    await expect(matrix).not.toContainText('Anthropic')
    await expect(matrix).not.toContainText('来源判断')
    await expect(matrix.locator('thead th').nth(1).locator('button')).toHaveCount(0)
    await expect(matrix.locator('.probe-matrix-status.is-ok', { hasText: '命中' })).toHaveCount(1)
    await expect(matrix.locator('.probe-matrix-status.is-warn', { hasText: '命中' })).toHaveCount(1)
    await expect(matrix.locator('.probe-matrix-gap')).toHaveCount(2)
    await expect(matrix.locator('td.probe-matrix-gap button')).toHaveCount(0)

    await page.setViewportSize({ width: 760, height: 900 })
    const narrow = await matrix.locator('.probe-matrix-scroll').evaluate(scroll => {
      const header = scroll.querySelector('thead .probe-matrix-rowh')
      const model = scroll.querySelector('thead th:nth-child(2)')
      if (!header || !model) return null
      const s = scroll.getBoundingClientRect()
      const h = header.getBoundingClientRect()
      const m = model.getBoundingClientRect()
      return {
        scrollW: s.width,
        covered: h.right > m.left + 1,
        modelVisible: m.width > 8 && m.left < s.right && m.right > s.left,
      }
    })
    expect(narrow).not.toBeNull()
    expect(narrow!.scrollW).toBeLessThan(420)
    expect(narrow!.covered).toBe(false)
    expect(narrow!.modelVisible).toBe(true)

    await matrix.getByRole('button', { name: /尾部变化 OpenAI Responses 命中 全部命中，但 Token 覆盖率仅 50\.0%/ }).click()
    const dialog = page.getByTestId('cache-matrix-dialog')
    await expect(dialog).toContainText('请求级命中率')
    await expect(dialog).toContainText('100.0%')
    await expect(dialog).toContainText('全部命中，但 Token 覆盖率仅 50.0%')
    await expect(dialog).toContainText('每轮输入 Token 构成')
    const host = await dialog.evaluate(node => node.closest('.app-shell') != null)
    expect(host).toBe(true)
    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: /历史/ }).click()
    await page.locator('[data-testid="cache-history-row"]').filter({ hasText: 'e2e-矩阵甲' }).getByRole('button', { name: '查看' }).click()
    await expect(page.locator('main')).toContainText('缓存命中率测试报告')
    await expect(page.locator('main')).toContainText('e2e-矩阵甲')
    await expect(page.locator('[data-format-report="chat"]')).toContainText('100.0%')
    await expect(page.locator('[data-format-report="chat"]')).toContainText('全部命中 · 覆盖率 90.0%')
    await expect(page.getByTestId('cache-matrix-view')).toHaveCount(0)
  })

  test('两个模型串行跑完停在历史，并勾上这两条', async ({ page }) => {
    const models: string[] = []
    await page.route('**/v1/chat/completions', route => {
      const body = route.request().postDataJSON()
      models.push(body.model)
      return route.fulfill({ status: 200, contentType: 'application/json', body: CHAT_BODY(2048) })
    })

    await goto(page, /缓存命中率/)
    await page.locator('input[data-format="responses"]').uncheck()
    await page.locator('input[data-format="anthropic"]').uncheck()
    await addChannel(page)
    await inputByLabel(page, '模型名称').fill('alpha, beta')
    await inputByLabel(page, '测量轮数').fill('1')
    await startRun(page, 'e2e-两模型')

    await expect(page.getByRole('checkbox', { name: '选择 e2e-两模型 · alpha' })).toBeChecked({ timeout: 15000 })
    await expect(page.getByRole('checkbox', { name: '选择 e2e-两模型 · beta' })).toBeChecked()
    await expect(page.locator('main')).not.toContainText('缓存命中率测试报告')
    await expect(page.getByTestId('cache-matrix-view')).toHaveCount(0)

    const firstBeta = models.indexOf('beta')
    expect(models.filter(model => model === 'alpha')).toHaveLength(2)
    expect(models.filter(model => model === 'beta')).toHaveLength(2)
    expect(firstBeta).toBeGreaterThan(0)
    expect(models.slice(0, firstBeta).every(model => model === 'alpha')).toBe(true)

    const rows = await readHistoryStore(page, 'cachehit')
    expect(rows).toHaveLength(2)
    const nonces = rows.map((row: { params: { nonce: string } }) => row.params.nonce)
    expect(new Set(nonces).size).toBe(2)
  })

  test('渠道管理：复制渠道不切换当前使用', async ({ page }) => {
    await goto(page, /缓存命中率/)
    await addChannel(page, { name: '测试渠道' })
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await channelCard(page, '测试渠道').getByRole('button', { name: '复制' }).click()
    await expect(channelCard(page, '测试渠道_copy')).toBeVisible()
    await expect(channelCard(page, '测试渠道').getByText('✓ 当前使用')).toBeVisible()
    await expect(channelCard(page, '测试渠道_copy').getByText('✓ 当前使用')).toHaveCount(0)
    await expect.poll(async () => {
      const raw = await readKv(page, 'cachehit-channels')
      return raw ? JSON.parse(raw).map((c: { name: string }) => c.name) : []
    }).toEqual(['测试渠道', '测试渠道_copy'])
  })
})
