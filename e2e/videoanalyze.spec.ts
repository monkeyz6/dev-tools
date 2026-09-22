import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tinyMp4 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/probe-red.mp4'))

const TOS_LIKE = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/stub/probe-red.mp4?X-Tos-SignedHeaders=host'

const TOS_HEADERS = {
  'Content-Type': 'video/mp4',
  'Content-Disposition': 'attachment',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, HEAD',
  'Accept-Ranges': 'bytes',
}

async function openAnalyzer(page: Page) {
  await page.goto('/')
  await page.getByText('视频信息检测').click()
  await expect(page.getByText('视频 URL 链接')).toBeVisible()
}

test('TOS 直链即使 <video> 全失败也能从 moov 读到宽高', async ({ page }) => {
  await page.route('https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/**', async route => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 403, headers: TOS_HEADERS, body: '' })
      return
    }
    await route.fulfill({ status: 200, headers: TOS_HEADERS, body: tinyMp4 })
  })
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'src')
    if (!desc?.set || !desc.get) return
    Object.defineProperty(HTMLVideoElement.prototype, 'src', {
      configurable: true,
      get() { return desc.get!.call(this) },
      set(v: string) {
        desc.set!.call(this, v)
        queueMicrotask(() => this.dispatchEvent(new Event('error')))
      },
    })
  })

  await openAnalyzer(page)
  await page.getByPlaceholder(/example.com/).fill(TOS_LIKE)
  await page.getByRole('button', { name: '开始检测' }).click()
  await expect(page.getByText('64 × 36')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('table').getByText('成功', { exact: true })).toBeVisible()
})
