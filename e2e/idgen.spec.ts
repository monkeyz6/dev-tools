import { test, expect } from '@playwright/test'
import { goto, selectOption, readKv } from './helpers'

test.beforeEach(async ({ page }) => {
  // 仅首次加载清空；reload 保留，便于测试持久化
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

test.describe('ID 生成器', () => {
  test('v4 默认输出：版本位 4、variant 8-9ab', async ({ page }) => {
    await goto(page, /ID 生成器/)
    const first = (await page.locator('code').first().textContent())!
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('切无横杠只改格式不改内容（熵与格式分离）', async ({ page }) => {
    await goto(page, /ID 生成器/)
    const before = (await page.locator('code').first().textContent())!
    await selectOption(page, '输出格式', '无横杠')
    const after = (await page.locator('code').first().textContent())!
    expect(after).toMatch(/^[0-9a-f]{32}$/)
    expect(after).toBe(before.replace(/-/g, ''))
  })

  test('v7：版本位 7 且批内按生成顺序单调递增', async ({ page }) => {
    await goto(page, /ID 生成器/)
    await page.getByRole('button', { name: 'v7 时间有序' }).click()
    const text = (await page.locator('.idgen-result').textContent())!
    const lines = text.split('\n').filter(l => l.length > 0)
    expect(lines).toHaveLength(10)
    expect([...lines].sort().join('\n')).toBe(lines.join('\n'))
    expect(lines.every(l => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(l))).toBe(true)
  })

  test('随机字符串：纯数字预设输出 20 位数字', async ({ page }) => {
    await goto(page, /ID 生成器/)
    await page.getByRole('button', { name: '随机字符串' }).click()
    await page.getByRole('button', { name: '纯数字 ID' }).click()
    const first = (await page.locator('code').first().textContent())!
    expect(first).toMatch(/^\d{20}$/)
  })

  test('排除易混淆字符后结果不含 0 O 1 l I', async ({ page }) => {
    await goto(page, /ID 生成器/)
    await page.getByRole('button', { name: '随机字符串' }).click()
    const text = (await page.locator('.idgen-result').textContent())!
    expect(text).not.toMatch(/[0O1lI]/)
  })

  test('配置刷新后从 IndexedDB 恢复', async ({ page }) => {
    await goto(page, /ID 生成器/)
    await page.getByRole('button', { name: '随机字符串' }).click()
    await page.getByRole('button', { name: '纯数字 ID' }).click()
    const first = (await page.locator('code').first().textContent())!
    expect(first).toMatch(/^\d{20}$/)
    // kv 写入 IndexedDB 是异步的，poll 到「纯数字」配置落盘再 reload
    await expect.poll(async () => {
      const stored = await readKv(page, 'idgen-opts')
      if (!stored) return undefined
      const rand = JSON.parse(stored).rand
      return rand && rand.len === 20 && rand.digit && !rand.lower && !rand.symbol
    }).toBe(true)
    // reload 后仍保留「随机字符串 + 纯数字」配置
    await page.reload()
    await goto(page, /ID 生成器/)
    const restored = (await page.locator('.idgen-result').textContent())!
    expect(restored.split('\n')[0]).toMatch(/^\d{20}$/)
  })
})
