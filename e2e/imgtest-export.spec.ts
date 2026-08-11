import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }

// 回归用例：之前导出容器用 position:fixed + 负坐标把内容藏到屏幕外，导致 html2canvas
// 截图失败（导出图片）、且导出 HTML 时 clone 出来的节点带着同样的离屏定位打开后一片空白。
// 这里既验证「确实生成了下载」，也把导出的 HTML 用 file:// 真实打开一遍，证明不是空白页；
// 同时验证报告/图片里不再包含价格信息。
test('导出图片和 HTML 报告：成功生成、离线可渲染，且不含价格信息', async ({ page }) => {
  await page.route('**/v1/images/generations', async route => {
    // 尺寸要匹配用例的精确尺寸校验（1024×1024），否则会判「未通过」
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = 1024
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#3366ff'
      ctx.fillRect(0, 0, 1024, 1024)
      return c.toDataURL('image/png').split(',')[1]
    })
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...CORS, 'x-oneapi-request-id': 'req-export-test' }, body: JSON.stringify({ data: [{ b64_json: b64 }] }) })
  })

  const dialogs: string[] = []
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss() })

  await page.goto('/')
  await page.getByText('图片接口测试').click()

  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill('导出测试渠道')
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()

  // gpt-image-2 在内置默认价格表里有 medium 档位价格，方形 1024×1024 用例跑完会自动带出
  // 「参考价格」——不用额外配置，正好用来验证导出内容确实把价格剔除了
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
  await page.getByText('方形 1024×1024').click()
  await page.getByRole('button', { name: '▶ 运行此用例' }).click()
  await expect(page.getByText('✓ 通过 3/3')).toBeVisible()
  await expect(page.getByText('参考价格', { exact: false })).toBeVisible() // 确认这条记录本身带价格

  // 导出图片：能拿到下载即说明 html2canvas 截图成功（失败会走 catch 弹 alert，不会触发下载）
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ 导出图片' }).click(),
  ])
  const pngPath = '/tmp/imgtest-export-test.png'
  await pngDownload.saveAs(pngPath)
  const pngSize = fs.statSync(pngPath).size
  expect(pngSize).toBeGreaterThan(1500)
  // 导出遮罩用完即关
  await expect(page.getByText('导出预览')).toHaveCount(0)

  // 导出 HTML
  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ 导出 HTML' }).click(),
  ])
  const htmlPath = '/tmp/imgtest-export-test.html'
  await htmlDownload.saveAs(htmlPath)
  const htmlSource = fs.readFileSync(htmlPath, 'utf-8')
  expect(htmlSource).not.toContain('参考价格')

  // file:// 真实打开导出的 HTML，证明离线渲染出来的不是空白页
  await page.goto('file://' + htmlPath)
  await expect(page.getByText('图片接口测试报告').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('方形 1024×1024').first()).toBeVisible()
  await expect(page.getByText('req-export-test', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('参考价格', { exact: false })).toHaveCount(0)

  expect(dialogs).toEqual([]) // 没有触发失败提示的 alert
})
