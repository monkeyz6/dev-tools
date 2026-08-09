import { test, expect } from '@playwright/test'
import { goto, selectOption, inputByLabel } from './helpers'

test.beforeEach(async ({ page }) => {
  // 仅首次加载清空；reload 保留，便于测试持久化
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__storage_cleared__')) {
      sessionStorage.setItem('__storage_cleared__', '1')
      localStorage.clear()
    }
  })
})

test.describe('提示词优化', () => {
  test('场景选择给出智能推荐', async ({ page }) => {
    await goto(page, /提示词优化/)
    await expect(page.getByRole('heading', { name: '提示词优化' })).toBeVisible()

    await page.getByRole('button', { name: '简单通用，快速上手' }).click()
    await expect(page.getByText('优先推荐 RTF')).toBeVisible()

    await page.getByRole('button', { name: '必须规定允许与禁止行为' }).click()
    await expect(page.getByText('优先推荐 TIDD-EC')).toBeVisible()
  })

  test('切换框架后要素表单跟随变化', async ({ page }) => {
    await goto(page, /提示词优化/)
    await page.getByRole('button', { name: '简单通用，快速上手' }).click()
    await expect(page.getByText('Role', { exact: true })).toBeVisible()
    await expect(page.getByText('Format', { exact: true })).toBeVisible()

    await selectOption(page, '换一个框架', 'BROKE · 结果评估与迭代')
    await expect(page.getByText('Key Result', { exact: true })).toBeVisible()
    await expect(page.getByText('Evolution', { exact: true })).toBeVisible()
  })

  test('渠道管理：必填校验与加密存储', async ({ page }) => {
    await goto(page, /提示词优化/)
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await expect(page.getByText('添加新渠道')).toBeVisible()

    await inputByLabel(page, '渠道名称').fill('测试渠道')
    await inputByLabel(page, 'Base URL').fill('https://api.example.com')
    await inputByLabel(page, '模型编码').fill('gpt-4o-mini')
    await page.getByRole('button', { name: '保存渠道' }).click()
    await expect(page.getByText('请填写 apiKey')).toBeVisible()

    await inputByLabel(page, 'apiKey').fill('sk-test-key-123')
    await page.getByRole('button', { name: '保存渠道' }).click()
    await expect(page.getByText('测试渠道', { exact: true })).toBeVisible()
    await expect(page.getByText('gpt-4o-mini', { exact: true })).toBeVisible()

    const stored = await page.evaluate(() => localStorage.getItem('promptopt-channels'))
    expect(stored).not.toContain('sk-test-key-123')
    expect(stored).toContain('.')
  })

  test('未配置渠道时生成给出提示', async ({ page }) => {
    await goto(page, /提示词优化/)
    await page.getByRole('button', { name: '简单通用，快速上手' }).click()
    await page.getByRole('button', { name: /生成系统提示词/ }).click()
    await expect(page.getByText('请先添加并选择一个渠道')).toBeVisible()
  })

  test('框架知识库默认折叠，可展开', async ({ page }) => {
    await goto(page, /提示词优化/)
    await expect(page.getByText('六种框架概览')).toHaveCount(0)
    await page.getByRole('button', { name: /框架知识库/ }).click()
    await expect(page.getByText('六种框架概览')).toBeVisible()
    await expect(page.getByText('万变不离其宗：四大核心要素')).toBeVisible()
  })

  test('mock 接口验证生成结果渲染与复制', async ({ page }) => {
    await page.route('**/v1/chat/completions', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '# Role\n你是资深市场分析师。\n# Task\n分析新能源市场趋势。' } }] }),
    }))

    await goto(page, /提示词优化/)
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await inputByLabel(page, '渠道名称').fill('mock')
    await inputByLabel(page, 'Base URL').fill('https://mock.example.com')
    await inputByLabel(page, '模型编码').fill('mock-model')
    await inputByLabel(page, 'apiKey').fill('sk-mock')
    await page.getByRole('button', { name: '保存渠道' }).click()
    await page.getByRole('button', { name: /渠道管理/ }).click()

    await page.getByRole('button', { name: '简单通用，快速上手' }).click()
    await page.getByPlaceholder('例如：你是一名资深市场分析师，擅长行业趋势洞察与数据解读').fill('资深市场分析师')
    await page.getByPlaceholder('例如：分析当前中国新能源汽车市场的发展趋势').fill('分析新能源市场趋势')
    await page.getByRole('button', { name: /生成系统提示词/ }).click()

    await expect(page.getByText('你是资深市场分析师。')).toBeVisible()
    await expect(page.getByRole('button', { name: '复制' })).toBeVisible()
  })

  test('mock 接口验证优化输出解析', async ({ page }) => {
    await page.route('**/v1/chat/completions', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '【优化后的提示词】\n优化后的完整提示词\n【改动说明】\n1. 补充角色定位\n2. 明确输出格式' } }] }),
    }))

    await goto(page, /提示词优化/)
    await page.getByRole('button', { name: /渠道管理/ }).click()
    await inputByLabel(page, '渠道名称').fill('mock')
    await inputByLabel(page, 'Base URL').fill('https://mock.example.com')
    await inputByLabel(page, '模型编码').fill('mock-model')
    await inputByLabel(page, 'apiKey').fill('sk-mock')
    await page.getByRole('button', { name: '保存渠道' }).click()
    await page.getByRole('button', { name: /渠道管理/ }).click()

    await page.getByRole('button', { name: '优化现有提示词' }).click()
    await page.getByPlaceholder(/在此粘贴一段现有提示词/).fill('你是客服助手，请回答用户的问题。')
    await page.getByRole('button', { name: /优化提示词/ }).click()

    await expect(page.getByText('优化后的完整提示词')).toBeVisible()
    await expect(page.getByText('1. 补充角色定位')).toBeVisible()
    await expect(page.getByText('2. 明确输出格式')).toBeVisible()
  })
})
