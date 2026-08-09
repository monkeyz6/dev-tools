import { test, expect } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test.describe('全局导航与主题', () => {
  test('侧栏 14 个工具可逐个切换且渲染对应内容', async ({ page }) => {
    const tools: [RegExp, string][] = [
      [/Seedance 计费/, 'Seedance 计费计算器'],
      [/JSON 可视化/, 'JSON 可视化 & Diff'],
      [/时间戳转换/, '时间戳转换'],
      [/AI 格式转换/, 'AI 请求体格式转换'],
      [/LLM 批量测试/, 'LLM 批量测试 & 验真'],
      [/模型探测/, '模型探测'],
      [/提示词优化/, '提示词优化'],
      [/图片信息识别/, '图片信息识别器'],
      [/视频信息检测/, '视频信息检测'],
      [/ID 生成器/, 'ID 生成器'],
      [/Base64 编解码/, 'Base64 编解码'],
      [/Unicode 转换/, 'Unicode 转换'],
      [/GraphQL 格式化/, 'GraphQL 格式化'],
    ]
    for (const [nav, title] of tools) {
      await goto(page, nav)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }

    await goto(page, /图片接口测试/)
    await expect(page.getByRole('button', { name: '批量测试', exact: true })).toBeVisible()
  })

  test('四套主题可切换并持久化，材质令牌完整', async ({ page }) => {
    await goto(page, /Seedance 计费/)
    const themes = [
      { label: '深色', key: 'dark' },
      { label: '暖陶', key: 'claude' },
      { label: '山野绿', key: 'green' },
      { label: '浅色', key: 'light' },
    ] as const

    for (const theme of themes) {
      await page.getByRole('button', { name: '切换主题' }).click()
      await page.getByRole('button', { name: theme.label, exact: true }).click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme.key)
      expect(await page.evaluate(() => localStorage.getItem('dev-toolkit-theme'))).toBe(theme.key)
      const tokens = await page.locator('.app-shell').evaluate(el => {
        const styles = getComputedStyle(el)
        return [styles.getPropertyValue('--surface'), styles.getPropertyValue('--sceneA'), styles.getPropertyValue('--gridLine')]
      })
      expect(tokens.every(Boolean)).toBe(true)
    }
  })

  test('减少动态效果时停用环境漂移并保留淡入反馈', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await goto(page, /Seedance 计费/)

    await expect(page.locator('.ambient-scene')).toHaveCount(1)
    const motion = await page.evaluate(() => {
      const orb = getComputedStyle(document.querySelector('.ambient-orb')!)
      const stage = getComputedStyle(document.querySelector('.tool-stage')!)
      return { orbAnimation: orb.animationName, stageAnimation: stage.animationName, stageTransform: stage.transform }
    })
    expect(motion.orbAnimation).toBe('none')
    expect(motion.stageAnimation).toBe('reduced-fade')
    expect(motion.stageTransform).toBe('none')
  })
})
