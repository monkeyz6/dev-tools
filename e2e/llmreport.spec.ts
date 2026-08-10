import { test, expect } from '@playwright/test'
import { goto } from './helpers'

// 与 shared/llm-report.ts 的 SAMPLE_JSON 结构一致（取前 6 条真实样例，第 7 条失败样本单独验证）
const SAMPLE = `[
  { "id": 46200553, "user_id": 64, "created_at": 1785318047, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 519, "prompt_tokens": 33, "completion_tokens": 191, "use_time": 6, "is_stream": 1, "channel_id": 62, "group": "PRO", "request_id": "r1", "other": "{\\"request_path\\":\\"/v1/chat/completions\\",\\"frt\\":2659,\\"stream_status\\":{\\"end_reason\\":\\"done\\",\\"status\\":\\"ok\\"}}" },
  { "id": 46200554, "user_id": 64, "created_at": 1785318048, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1858, "prompt_tokens": 68, "completion_tokens": 700, "use_time": 21, "is_stream": 1, "channel_id": 62, "group": "PRO", "request_id": "r2", "other": "{\\"request_path\\":\\"/v1/responses\\",\\"frt\\":3505,\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"}}" },
  { "id": 46200555, "user_id": 64, "created_at": 1785318053, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1393, "prompt_tokens": 68, "completion_tokens": 519, "use_time": 16, "is_stream": 1, "channel_id": 62, "group": "PRO", "request_id": "r3", "other": "{\\"request_path\\":\\"/v1/responses\\",\\"frt\\":2197,\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"}}" },
  { "id": 46200556, "user_id": 64, "created_at": 1785318054, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 414, "prompt_tokens": 33, "completion_tokens": 150, "use_time": 6, "is_stream": 0, "channel_id": 62, "group": "PRO", "request_id": "r4", "other": "{\\"request_path\\":\\"/v1/chat/completions\\",\\"frt\\":-1000}" },
  { "id": 46200557, "user_id": 64, "created_at": 1785318060, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 247, "prompt_tokens": 33, "completion_tokens": 85, "use_time": 3, "is_stream": 1, "channel_id": 62, "group": "PRO", "request_id": "r5", "other": "{\\"request_path\\":\\"/v1/chat/completions\\",\\"frt\\":1793,\\"stream_status\\":{\\"end_reason\\":\\"done\\",\\"status\\":\\"ok\\"}}" },
  { "id": 46200558, "user_id": 64, "created_at": 1785318078, "type": 2, "content": "", "username": "yeshenyue", "token_name": "yeshenyue", "model_name": "qwen3.7-max", "quota": 1761, "prompt_tokens": 378, "completion_tokens": 559, "use_time": 16, "is_stream": 1, "channel_id": 62, "group": "PRO", "request_id": "r6", "other": "{\\"request_path\\":\\"/v1/messages\\",\\"frt\\":1543,\\"stream_status\\":{\\"end_reason\\":\\"eof\\",\\"status\\":\\"ok\\"}}" }
]`

// 模拟失败样本：status=fail → 应计入失败
const SAMPLE_FAIL = `[
  { "id": 46200559, "created_at": 1785318120, "model_name": "qwen3.7-max", "username": "yeshenyue", "prompt_tokens": 12, "completion_tokens": 0, "use_time": 60, "is_stream": 1, "group": "PRO", "request_id": "r7", "other": "{\\"request_path\\":\\"/v1/chat/completions\\",\\"frt\\":12000,\\"stream_status\\":{\\"end_reason\\":\\"timeout\\",\\"status\\":\\"fail\\"}}" }
]`

async function generateFromJson(page: import('@playwright/test').Page, text: string) {
  await page.goto('/tools/llmreport')
  await page.locator('textarea').fill(text)
  await page.getByRole('button', { name: '生成报告' }).click()
}

test('JSON 导入生成报告：统计卡与图表', async ({ page }) => {
  await generateFromJson(page, SAMPLE)
  // 汇总卡：成功率 100%、总请求 6、总 tokens in 613 / out 2.2K
  await expect(page.getByText('6 / 6', { exact: true })).toBeVisible()
  await expect(page.getByText('613').first()).toBeVisible()
  await expect(page.getByText('2.2K').first()).toBeVisible()
  await expect(page.getByText('100.0%').first()).toBeVisible()
  // 报告标题 + 来源徽章
  await expect(page.getByText('LLM 日志性能分析报告')).toBeVisible()
  await expect(page.getByText('JSON', { exact: true })).toBeVisible()
  // 图表卡存在
  await expect(page.getByText('TTFT 分布直方图')).toBeVisible()
  await expect(page.getByText('请求量时序（成功 / 失败）')).toBeVisible()
  await expect(page.getByText('Token 吞吐时序')).toBeVisible()
  // 已移除的分组/流式内容不应出现
  await expect(page.getByText('流式 vs 非流式')).toHaveCount(0)
  await expect(page.getByText('按模型', { exact: true })).toHaveCount(0)
  await expect(page.getByText('数据快照')).toHaveCount(0)
  // 导出按钮
  await expect(page.getByRole('button', { name: /导出 HTML/ })).toBeVisible()
})

test('失败样本：成功率与失败明细', async ({ page }) => {
  // 拼接合法 JSON：去掉 SAMPLE 的尾括号后接失败行
  const combined = SAMPLE.trim().slice(0, -1) + ',' + SAMPLE_FAIL.trim().slice(1)
  await generateFromJson(page, combined)
  await expect(page.getByText('失败 1').first()).toBeVisible()
  await expect(page.getByText('失败请求明细（前 1 条）')).toBeVisible()
  // 错误类别构成：优先按 end_reason 分类（更具体），本例应显示 timeout 而非笼统的 status=fail
  await expect(page.getByText('timeout', { exact: true }).first()).toBeVisible()
  // 明细中的结束原因（timeout）：先展开折叠面板
  await page.getByText('失败请求明细（前 1 条）').click()
  await expect(page.getByText('timeout', { exact: true }).first()).toBeVisible()
})

test('载入示例按钮可用', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await page.getByRole('button', { name: '载入示例' }).click()
  await expect(page.locator('textarea')).not.toBeEmpty()
})

test('空输入提示错误', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await page.getByRole('button', { name: '生成报告' }).click()
  await expect(page.getByText('请粘贴日志 JSON')).toBeVisible()
})

test('非法 JSON 提示错误', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await page.locator('textarea').fill('{ not json')
  await page.getByRole('button', { name: '生成报告' }).click()
  await expect(page.getByText('JSON 解析失败')).toBeVisible()
})

test('状态栏常驻显示：空闲时也可见', async ({ page }) => {
  await page.goto('/tools/llmreport')
  await expect(page.getByText('等待导入日志数据')).toBeVisible()
})

test('自定义标题生成并可在报告内重命名', async ({ page }) => {
  await page.goto('/tools/llmreport')
  const titleInput = page.locator('label:has-text("报告标题")').locator('..').locator('input')
  await titleInput.fill('7月性能报告')
  await page.getByRole('button', { name: '载入示例' }).click()
  await page.getByRole('button', { name: '生成报告' }).click()
  await expect(page.getByRole('heading', { name: /7月性能报告/ })).toBeVisible()
  // 重命名
  await page.getByRole('button', { name: /重命名/ }).click()
  await page.locator('input').last().fill('改名后的标题')
  await page.getByRole('button', { name: '✓ 保存' }).click()
  await expect(page.getByRole('heading', { name: /改名后的标题/ })).toBeVisible()
})
