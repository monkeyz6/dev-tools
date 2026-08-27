import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = process.env.SCREENSHOT_PORT || '4174'
const BASE_URL = process.env.SCREENSHOT_BASE_URL || `http://127.0.0.1:${PORT}`
const OUTPUT_DIR = 'public/screenshots'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const only = new Set((process.env.SCREENSHOT_ONLY || '').split(',').filter(Boolean))

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function inputByLabel(page, label) {
  return page.locator(`label:has-text("${label}")`).locator('..').locator('input')
}

async function waitForServer(server) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`截图服务提前退出，退出码：${server.exitCode}`)
    try {
      const response = await fetch(BASE_URL)
      if (response.ok) return
    } catch {
      // 开发服务器尚未开始监听。
    }
    await delay(250)
  }
  throw new Error('等待截图服务超时。')
}

async function openTool(page, path, heading) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: heading, exact: true }).waitFor()
}

async function saveScreenshot(page, file) {
  await page.screenshot({ path: `${OUTPUT_DIR}/${file}`, fullPage: false, animations: 'disabled' })
  console.log(`📸 ${file}`)
}

async function captureHome(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /工具集合/ }).waitFor()
  await page.locator('.home-card').first().waitFor()
  await page.waitForTimeout(1800)
  await saveScreenshot(page, 'home.png')
}

async function captureMultiCost(page) {
  await openTool(page, '/tools/multicost', '图片视频计费计算器')
  await page.getByRole('button', { name: /粘贴 JSON 自动识别/ }).click()
  await page.locator('textarea').fill(JSON.stringify({
    model: 'grok-imagine-image-quality',
    n: 4,
    resolution: '2k',
    aspect_ratio: '1:1',
  }, null, 2))
  await page.getByRole('button', { name: '解析并填充', exact: true }).click()
  await page.getByText('请求体解析', { exact: true }).waitFor()
  await saveScreenshot(page, 'multicost.png')
}

async function captureCacheHit(page) {
  await openTool(page, '/tools/cachehit', '缓存命中率测试')
  await inputByLabel(page, '模型名称').fill('gpt-4o-mini')
  for (const caseId of ['repeat', 'multiturn', 'suffix']) {
    const checkbox = page.locator(`input[data-case="${caseId}"]`)
    if (!await checkbox.isChecked()) await checkbox.check()
    await page.locator(`[data-case-card="${caseId}"] input[type="number"]`).fill('3')
  }
  await page.locator('[data-case-card="repeat"]').scrollIntoViewIfNeeded()
  await saveScreenshot(page, 'cachehit.png')
}

async function captureLlmReport(page) {
  await openTool(page, '/tools/llmreport', 'LLM 报告生成')
  await page.getByRole('button', { name: '载入示例', exact: true }).click()
  await page.getByRole('button', { name: '生成报告', exact: true }).click()
  await page.getByText(/TTFT 分布直方图/).first().waitFor()
  await page.waitForTimeout(800)
  await page.mouse.move(12, 890)
  await saveScreenshot(page, 'llmreport.png')
}

async function captureImgTest(page) {
  await page.goto(`${BASE_URL}/tools/imgtest`, { waitUntil: 'domcontentloaded' })
  await page.getByText('本次测试配置', { exact: false }).first().waitFor()
  await inputByLabel(page, '模型编码').fill('gpt-image-1')
  const promptField = page.locator('label:has-text("提示词")').locator('..').locator('textarea')
  await promptField.fill('一座海边现代图书馆，清晨光线，建筑摄影风格')
  await saveScreenshot(page, 'imgtest.png')
}

async function captureJsonDiff(page) {
  await openTool(page, '/tools/json', 'JSON 可视化 & Diff')
  const left = page.getByTestId('json-pane-a').getByTestId('json-content')
  const right = page.getByTestId('json-pane-b').getByTestId('json-content')
  await right.fill(JSON.stringify({
    service: 'dev-toolkit',
    version: '1.0.0',
    tools: 17,
    storage: 'IndexedDB',
    features: ['cache-analysis', 'reporting', 'image-testing'],
  }, null, 2))
  await left.fill(JSON.stringify({
    service: 'dev-toolkit',
    version: '0.9.0',
    tools: 13,
    storage: 'localStorage',
    features: ['costing', 'formatting'],
  }, null, 2))
  await page.getByRole('button', { name: 'A/B 对比', exact: true }).click()
  await page.getByRole('button', { name: '✓ A/B 对比中', exact: true }).waitFor()
  await saveScreenshot(page, 'json-diff.png')
}

async function run() {
  const server = process.env.SCREENSHOT_BASE_URL
    ? null
    : spawn(npmCommand, ['run', 'dev', '--', '--port', PORT], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
  let browser
  try {
    if (server) await waitForServer(server)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    await context.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('dev-toolkit-theme', 'light')
    })
    const page = await context.newPage()

    const jobs = [
      ['home', captureHome],
      ['multicost', captureMultiCost],
      ['cachehit', captureCacheHit],
      ['llmreport', captureLlmReport],
      ['imgtest', captureImgTest],
      ['json-diff', captureJsonDiff],
    ]
    for (const [name, capture] of jobs) {
      if (only.size && !only.has(name)) continue
      await capture(page)
    }

    await context.close()
  } finally {
    await browser?.close()
    if (server?.exitCode === null) server.kill('SIGTERM')
  }
}

run().catch(error => {
  console.error('❌ 截图生成失败：', error)
  process.exitCode = 1
})
