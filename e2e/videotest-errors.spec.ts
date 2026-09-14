import { test, expect, type Page } from '@playwright/test'
import { readHistoryStore, inputByLabel } from './helpers'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

const DEFAULT_PROMPT = '海浪拍打礁石，慢动作，电影感'

function isSubmit(url: string) {
  return url.includes('/byteplus/api/v3/contents/generations/tasks') && !/\/tasks\/[^/]+$/.test(url)
}

function isPoll(url: string, taskId: string) {
  return new RegExp(`/byteplus/api/v3/contents/generations/tasks/${taskId}$`).test(url)
}

async function fulfillCors(route: { request: () => { method: () => string }; fulfill: (r: object) => Promise<void> }, rest: { status: number; body: string; requestId?: string }) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS })
    return
  }
  await route.fulfill({
    status: rest.status,
    contentType: 'application/json',
    headers: { ...CORS, ...(rest.requestId ? { 'x-oneapi-request-id': rest.requestId } : {}) },
    body: rest.body,
  })
}

async function setupChannel(page: Page, name: string) {
  await page.goto('/tools/videotest')
  await page.getByRole('button', { name: '渠道管理', exact: true }).click()
  await page.getByPlaceholder('例如：主线-oinone').fill(name)
  await page.getByPlaceholder('https://api.oinone.top').fill('https://mock.example')
  await page.getByPlaceholder('sk-xxxxxxxx').fill('sk-test-1234567890')
  await page.getByRole('button', { name: '保存渠道' }).click()
  await page.getByRole('button', { name: '批量测试', exact: true }).click()
}

async function runCase(page: Page, name: string) {
  await page.getByText(name, { exact: true }).click()
  await page.locator(`[data-case-name="${name}"]`).getByRole('button', { name: '▶ 运行此用例' }).click()
}

function checkRow(page: Page, caseName: string, check: string) {
  return page.locator(`[data-case-name="${caseName}"] tr`).filter({ hasText: check })
}

async function expectCheckPass(page: Page, caseName: string, check: string) {
  const row = checkRow(page, caseName, check)
  await expect(row).not.toContainText('未通过')
  await expect(row).toContainText('通过')
}

async function installQueryFail(page: Page, opts: {
  taskId: string
  pollStatus: number
  pollBody: Record<string, unknown>
  requestId: string
  polls: unknown[]
  sent: unknown[]
}) {
  await page.route(url => isSubmit(String(url)), async route => {
    await fulfillCors(route, {
      status: 200,
      requestId: `${opts.requestId}-submit`,
      body: JSON.stringify({ id: opts.taskId, status: 'queued' }),
    })
    if (route.request().method() !== 'OPTIONS') opts.sent.push(route.request().postDataJSON())
  })
  await page.route(url => isPoll(String(url), opts.taskId), async route => {
    if (route.request().method() !== 'OPTIONS') opts.polls.push(opts.pollBody)
    await fulfillCors(route, {
      status: opts.pollStatus,
      requestId: opts.requestId,
      body: JSON.stringify(opts.pollBody),
    })
  })
}

test.describe('视频接口测试：查询任务错误体校验', () => {
  test.describe.configure({ timeout: 25_000 })

  test('生成阶段·输出审核：查询 failed + OutputVideoSensitiveContentDetected', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      id: 'task_out_safety',
      status: 'failed',
      error: {
        code: 'OutputVideoSensitiveContentDetected',
        message: 'The request failed because the output video may contain sensitive information.Request ID: vid-out-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_out_safety', pollStatus: 200, pollBody, requestId: 'vid-out-1', polls, sent })
    await setupChannel(page, '错误体-输出审核')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(box.getByText('OutputVideoSensitiveContentDetected').first()).toBeVisible()
    await expectCheckPass(page, '文生 · 仅必填', '错误结构')
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('OutputVideoSensitiveContentDetected')
    await expectCheckPass(page, '文生 · 仅必填', '错误.code')
    await expectCheckPass(page, '文生 · 仅必填', '错误.message')

    expect(polls[0]).toMatchObject({ status: 'failed', error: { code: 'OutputVideoSensitiveContentDetected' } })
    expect(typeof (polls[0] as { error: { message: string } }).error.message).toBe('string')
    expect((sent[0] as { content: { text: string }[] }).content[0].text).toBe(DEFAULT_PROMPT)

    const hist = await readHistoryStore(page, 'videotest')
    const rec = hist.find((r: { caseName: string }) => r.caseName === '文生 · 仅必填')
    expect(rec.taskStatus).toBe('failed')
    expect(rec.status).toBe(200)
    expect(rec.errorDetail.code).toBe('OutputVideoSensitiveContentDetected')
    expect(rec.errorDetail.message).toMatch(/output video may contain sensitive information/i)
    expect(rec.ok).toBe(false)
  })

  test('生成阶段·输入文本审核：查询 failed + InputTextSensitiveContentDetected', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      id: 'task_in_text',
      status: 'failed',
      error: {
        code: 'InputTextSensitiveContentDetected',
        message: 'The request failed because the input text may contain sensitive information.Request ID: vid-txt-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_in_text', pollStatus: 200, pollBody, requestId: 'vid-txt-1', polls, sent })
    await setupChannel(page, '错误体-输入文本')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('InputTextSensitiveContentDetected')
    await expectCheckPass(page, '文生 · 仅必填', '错误.code')
    await expectCheckPass(page, '文生 · 仅必填', '错误.message')
    expect((sent[0] as { content: { text: string }[] }).content[0].text).toBe(DEFAULT_PROMPT)
    expect(polls[0]).toMatchObject({ status: 'failed', error: { code: expect.stringMatching(/SensitiveContentDetected/) } })

    const hist = await readHistoryStore(page, 'videotest')
    expect(hist[0].errorDetail.code).toBe('InputTextSensitiveContentDetected')
  })

  test('参数延迟报错：拒绝 · 500p 查询 failed + InvalidParameter', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      id: 'task_500p',
      status: 'failed',
      error: {
        code: 'InvalidParameter',
        message: 'One or more parameters specified in the request are not valid. Request ID: vid-param-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_500p', pollStatus: 200, pollBody, requestId: 'vid-param-1', polls, sent })
    await setupChannel(page, '错误体-参数')
    await runCase(page, '拒绝 · 500p')

    const box = page.locator('[data-case-name="拒绝 · 500p"]')
    await expect(box.getByText('✓ 已拒绝')).toBeVisible({ timeout: 20000 })
    await expectCheckPass(page, '拒绝 · 500p', '预期拒绝')
    await expectCheckPass(page, '拒绝 · 500p', '错误结构')
    await expect(checkRow(page, '拒绝 · 500p', '错误.code')).toContainText('InvalidParameter')
    await expectCheckPass(page, '拒绝 · 500p', '错误.message')
    expect((sent[0] as { resolution?: string }).resolution).toBe('500p')
    expect(polls[0]).toMatchObject({ status: 'failed', error: { code: 'InvalidParameter' } })

    const hist = await readHistoryStore(page, 'videotest')
    const rec = hist.find((r: { caseName: string }) => r.caseName === '拒绝 · 500p')
    expect(rec.expect).toBe('reject')
    expect(rec.ok).toBe(true)
    expect(rec.taskStatus).toBe('failed')
    expect(rec.errorDetail.code).toBe('InvalidParameter')
  })

  test('鉴权：查询 GET 401 + AuthenticationError', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      error: {
        type: 'Unauthorized',
        code: 'AuthenticationError',
        message: 'The API key or AK/SK in the request is missing or invalid. Request ID: vid-auth-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_auth', pollStatus: 401, pollBody, requestId: 'vid-auth-1', polls, sent })
    await setupChannel(page, '错误体-鉴权')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('AuthenticationError')
    await expectCheckPass(page, '文生 · 仅必填', '错误.code')
    await expect(checkRow(page, '文生 · 仅必填', '错误.type')).toContainText('Unauthorized')
    await expectCheckPass(page, '文生 · 仅必填', '错误.message')
    expect(polls[0]).toMatchObject({ error: { type: 'Unauthorized', code: 'AuthenticationError' } })
    expect((sent[0] as { content: { text: string }[] }).content[0].text).toBe(DEFAULT_PROMPT)

    const hist = await readHistoryStore(page, 'videotest')
    expect(hist[0].status).toBe(401)
    expect(hist[0].errorDetail.code).toBe('AuthenticationError')
    expect(hist[0].errorDetail.type).toBe('Unauthorized')
  })

  test('限流：查询 GET 429 + RateLimitExceeded.EndpointRPMExceeded', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      error: {
        type: 'TooManyRequests',
        code: 'RateLimitExceeded.EndpointRPMExceeded',
        message: 'The Requests Per Minute (RPM) limit of the associated endpoint for your account has been exceeded. Request ID: vid-rl-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_rl', pollStatus: 429, pollBody, requestId: 'vid-rl-1', polls, sent })
    await setupChannel(page, '错误体-限流')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('RateLimitExceeded.EndpointRPMExceeded')
    await expectCheckPass(page, '文生 · 仅必填', '错误.code')
    expect(polls[0]).toMatchObject({ error: { code: expect.stringMatching(/RateLimitExceeded/) } })

    const hist = await readHistoryStore(page, 'videotest')
    expect(hist[0].status).toBe(429)
    expect(hist[0].errorDetail.code).toBe('RateLimitExceeded.EndpointRPMExceeded')
  })

  test('服务端：查询 GET 500 + InternalServiceError', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      error: {
        type: 'InternalServerError',
        code: 'InternalServiceError',
        message: 'The service encountered an unexpected internal error. Please retry later. Request ID: vid-5xx-1.',
      },
    }
    await installQueryFail(page, { taskId: 'task_5xx', pollStatus: 500, pollBody, requestId: 'vid-5xx-1', polls, sent })
    await setupChannel(page, '错误体-服务端')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('InternalServiceError')
    await expectCheckPass(page, '文生 · 仅必填', '错误.code')
    expect(polls[0]).toMatchObject({ error: { code: 'InternalServiceError' } })

    const hist = await readHistoryStore(page, 'videotest')
    expect(hist[0].status).toBe(500)
    expect(hist[0].errorDetail.code).toBe('InternalServiceError')
  })

  test('负例：查询 failed 且无 error 时结构与原因未通过', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = { id: 'task_noerr', status: 'failed' }
    await installQueryFail(page, { taskId: 'task_noerr', pollStatus: 200, pollBody, requestId: 'vid-noerr-1', polls, sent })
    await setupChannel(page, '错误体-负例')
    await runCase(page, '文生 · 仅必填')

    const box = page.locator('[data-case-name="文生 · 仅必填"]')
    await expect(box.getByText('! 请求失败')).toBeVisible({ timeout: 20000 })
    await expect(checkRow(page, '文生 · 仅必填', '错误结构')).toContainText('未通过')
    await expect(checkRow(page, '文生 · 仅必填', '错误.message')).toContainText('未通过')
    await expect(checkRow(page, '文生 · 仅必填', '错误.code')).toContainText('未通过')
    expect(polls[0]).toMatchObject({ status: 'failed' })
    expect((polls[0] as { error?: unknown }).error).toBeUndefined()
    expect((sent[0] as { content: { text: string }[] }).content[0].text).toBe(DEFAULT_PROMPT)

    const hist = await readHistoryStore(page, 'videotest')
    expect(hist[0].taskStatus).toBe('failed')
    expect(hist[0].errorDetail).toBeNull()
  })

  test('查询 GET 429 对拒绝类记请求异常，不算已拒绝', async ({ page }) => {
    const polls: unknown[] = []
    const sent: unknown[] = []
    const pollBody = {
      error: {
        type: 'TooManyRequests',
        code: 'RequestBurstTooFast',
        message: 'The service is currently unable to handle additional requests due to server overload. Request ID: vid-rl-neg.',
      },
    }
    await installQueryFail(page, { taskId: 'task_rl_neg', pollStatus: 429, pollBody, requestId: 'vid-rl-neg', polls, sent })
    await setupChannel(page, '错误体-拒绝类限流')
    await runCase(page, '拒绝 · 500p')

    const box = page.locator('[data-case-name="拒绝 · 500p"]')
    await expect(box.getByText('! 请求异常')).toBeVisible({ timeout: 20000 })
    await expect(box.getByText('✓ 已拒绝')).toHaveCount(0)
    await expect(checkRow(page, '拒绝 · 500p', '预期拒绝')).toContainText('未通过')
    await expect(checkRow(page, '拒绝 · 500p', '错误.code')).toContainText('RequestBurstTooFast')
    await expectCheckPass(page, '拒绝 · 500p', '错误.code')
    expect((sent[0] as { resolution?: string }).resolution).toBe('500p')

    const hist = await readHistoryStore(page, 'videotest')
    const rec = hist.find((r: { caseName: string }) => r.caseName === '拒绝 · 500p')
    expect(rec.ok).toBe(false)
    expect(rec.taskId).toBe('task_rl_neg')
    expect(rec.status).toBe(429)
    expect(rec.errorDetail.code).toBe('RequestBurstTooFast')
  })
})
