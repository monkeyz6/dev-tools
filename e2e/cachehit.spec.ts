import { test, expect } from '@playwright/test'
import { goto, inputByLabel, readKv, readHistoryStore } from './helpers'
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
    expect(rec.target.model).toBe('cache-model')
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
    expect(scroll.bodyOverflow).toBe('visible')
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
})
