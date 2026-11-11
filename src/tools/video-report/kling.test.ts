import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoApiTypeOf } from './types.ts'
import type { VideoRecord } from './types.ts'
import {
  KLING_CASE_DEFS, KLING_DEFAULT_MODEL,
  klingBuildChecks, klingBuildPlan, klingBusinessCode, klingBusinessRejected, klingCapabilityHint, klingCreateEndpoint, klingExpect,
  klingExtractRequestId, klingExtractStatus, klingExtractTaskId, klingExtractUsage, klingExtractVideoUrl,
  klingFormatTaskError, klingIsFlash, klingQueryEndpoint,
  videoIsKlingPreset, videoKlingPath, videoKlingUrl, videoLooksLikeKlingModel,
} from './kling.ts'

const urls = {
  firstFrame: 'https://img.example/first.jpg',
  lastFrame: 'https://img.example/last.jpg',
}

const def = (id: string) => {
  const found = KLING_CASE_DEFS.find(item => item.id === id)
  assert.ok(found, `缺少用例 ${id}`)
  return found!
}

function rec(partial: Partial<VideoRecord>): VideoRecord {
  return {
    id: 'r', time: 0, caseName: 'n', caseDesc: '', channelName: 'c', model: 'kling-4.0', prompt: '海浪',
    apiType: 'kling', kind: 't2v', caseId: 'kling:t2v-720p', expect: 'success', testMaterials: false,
    targets: { resolution: '720p', ratio: '16:9', duration: 5 }, skippedRoles: [],
    status: 200, respHeaders: {}, reqId: '', sentPreview: '', ok: true, error: null, rawSnippet: '',
    taskId: '1', taskStatus: 'succeeded', pollCount: 1, videoUrl: 'https://cdn.example/a.mp4',
    probe: { w: 1280, h: 720, duration: 5.2 }, usage: null, durationMs: 1, checks: [], pollLog: [],
    ...partial,
  }
}

describe('videoKlingUrl', () => {
  it('oinone 和 ainowork 加一次 /kling，官方主机不加', () => {
    const ep = klingCreateEndpoint('t2v', 'kling-4.0')
    assert.equal(videoKlingUrl('https://api.oinone.top', ep), 'https://api.oinone.top/kling/text-to-video/kling-4.0')
    assert.equal(videoKlingUrl('https://hk.ainowork.ai/', ep), 'https://hk.ainowork.ai/kling/text-to-video/kling-4.0')
    assert.equal(videoKlingUrl('https://api.ainowork.ai', ep), 'https://api.ainowork.ai/kling/text-to-video/kling-4.0')
    assert.equal(
      videoKlingUrl('https://api-singapore.klingai.com', ep),
      'https://api-singapore.klingai.com/text-to-video/kling-4.0',
    )
    assert.equal(videoKlingUrl('https://api-singapore.klingai.com', ep).includes('/kling/'), false)
  })

  it('已有 /kling 段不再加，klingai 主机名和 /klingai 路径不算', () => {
    const ep = klingCreateEndpoint('i2v', 'kling-4.0-flash')
    assert.equal(
      videoKlingUrl('https://api.oinone.top/kling', ep),
      'https://api.oinone.top/kling/image-to-video/kling-4.0-flash',
    )
    assert.equal(
      videoKlingUrl('https://api.ainowork.ai/kling/', ep),
      'https://api.ainowork.ai/kling/image-to-video/kling-4.0-flash',
    )
    assert.equal(
      videoKlingUrl('https://gateway.ainowork.com/foo/kling/bar', klingQueryEndpoint('task a/b')),
      'https://gateway.ainowork.com/foo/kling/bar/tasks?task_ids=task%20a%2Fb',
    )
    assert.equal(
      videoKlingUrl('https://api.oinone.top/klingai', klingCreateEndpoint('t2v', 'kling-4.0')),
      'https://api.oinone.top/klingai/kling/text-to-video/kling-4.0',
    )
  })

  it('不插入 /byteplus，预览路径带上实际前缀', () => {
    const ep = klingCreateEndpoint('t2v', 'Kling-4.0')
    const full = videoKlingUrl('https://hk.ainowork.ai', ep)
    assert.equal(full.includes('/byteplus'), false)
    assert.equal(full.endsWith('/text-to-video/Kling-4.0'), true)
    assert.equal(videoKlingPath('https://hk.ainowork.ai', ep), '/kling/text-to-video/Kling-4.0')
    assert.equal(videoKlingPath('https://api-singapore.klingai.com', ep), '/text-to-video/Kling-4.0')
  })
})

describe('kling 用例与期望', () => {
  it('固定五条，路径和 body 按文生 / 图生分开', () => {
    assert.deepEqual(KLING_CASE_DEFS.map(item => item.id), [
      'kling:t2v-720p', 'kling:i2v-first', 'kling:t2v-1080p', 'kling:i2v-frames', 'kling:t2v-21s',
    ])
    const t2v = klingBuildPlan(def('kling:t2v-720p'), 'kling-4.0', '海浪', urls)
    assert.equal(t2v.missing, null)
    assert.equal(t2v.plan.endpoint, '/text-to-video/kling-4.0')
    assert.deepEqual(t2v.plan.body, {
      prompt: '海浪',
      settings: { duration: 5, resolution: '720p', aspect_ratio: '16:9' },
    })
    assert.equal(t2v.plan.body.settings && 'contents' in (t2v.plan.body as object), false)

    const first = klingBuildPlan(def('kling:i2v-first'), 'kling-4.0', '海浪', urls)
    assert.equal(first.plan.endpoint, '/image-to-video/kling-4.0')
    assert.deepEqual(first.plan.body, {
      contents: [
        { type: 'prompt', text: '海浪' },
        { type: 'first_frame', url: urls.firstFrame, id: 'image_1' },
      ],
      settings: { duration: 5, resolution: '720p' },
    })
    assert.equal(JSON.stringify(first.plan.body).includes('aspect_ratio'), false)
    assert.equal(first.targets.ratio, undefined)

    const frames = klingBuildPlan(def('kling:i2v-frames'), 'kling-4.0', '海浪', urls)
    assert.deepEqual((frames.plan.body.contents as unknown[]).map((item: any) => item.type), ['prompt', 'first_frame', 'last_frame'])

    const long = klingBuildPlan(def('kling:t2v-21s'), 'kling-4.0', '海浪', urls)
    assert.equal((long.plan.body.settings as { duration: number }).duration, 21)
    assert.equal((long.plan.body.settings as { resolution: string }).resolution, '720p')
  })

  it('缺帧不发送，首尾帧缺一也不退化', () => {
    const noFirst = klingBuildPlan(def('kling:i2v-first'), 'kling-4.0', '海浪', { firstFrame: '  ', lastFrame: urls.lastFrame })
    assert.match(noFirst.missing || '', /首帧/)
    const onlyFirst = klingBuildPlan(def('kling:i2v-frames'), 'kling-4.0', '海浪', { firstFrame: urls.firstFrame, lastFrame: '' })
    assert.match(onlyFirst.missing || '', /尾帧/)
    assert.equal((onlyFirst.plan.body.contents as any[]).some(item => item.type === 'last_frame'), false)
    const neither = klingBuildPlan(def('kling:i2v-frames'), 'kling-4.0', '海浪', { firstFrame: '', lastFrame: '' })
    assert.match(neither.missing || '', /首帧/)
    assert.match(neither.missing || '', /尾帧/)
  })

  it('只有精确 flash 把 1080p、首尾帧、21 秒标成预期不支持', () => {
    for (const id of ['kling:t2v-1080p', 'kling:i2v-frames', 'kling:t2v-21s']) {
      assert.equal(klingExpect(def(id), 'kling-4.0'), 'success')
      assert.equal(klingExpect(def(id), '  Kling-4.0-Flash '), 'unsupported')
      assert.equal(klingExpect(def(id), 'kling-4.0-flash-preview'), 'success')
      assert.equal(klingExpect(def(id), 'vendor/kling-4.0-flash'), 'success')
    }
    assert.equal(klingExpect(def('kling:t2v-720p'), 'Kling-4.0-Flash'), 'success')
    assert.equal(klingExpect(def('kling:i2v-first'), 'kling-4.0-flash'), 'success')
    assert.equal(klingIsFlash('kling-4.0'), false)
    assert.equal(klingCapabilityHint('kling-4.0-flash', 'kling:t2v-1080p'), '仅 720p')
    assert.equal(klingCapabilityHint('kling-4.0-flash', 'kling:i2v-frames'), '图生只要首帧')
    assert.equal(klingCapabilityHint('kling-4.0-flash', 'kling:t2v-21s'), '时长 3–20s')
    assert.equal(videoIsKlingPreset(' Kling-4.0 '), true)
    assert.equal(videoIsKlingPreset('kling-4.0-flash-preview'), false)
    assert.equal(videoLooksLikeKlingModel('kling-4.0-preview'), true)
    assert.equal(videoLooksLikeKlingModel('kling-v4'), false)
    assert.equal(KLING_DEFAULT_MODEL, 'kling-4.0')
    assert.equal(videoApiTypeOf('kling'), 'kling')
    assert.equal(videoApiTypeOf(undefined), 'seedance')
  })
})

describe('kling 响应解析', () => {
  it('创建认 data.id，查询认 data 数组和 data.result', () => {
    const created = { code: 0, message: 'SUCCEED', request_id: 'req-1', data: { id: '943', status: 'submitted' } }
    assert.equal(klingExtractTaskId(created), '943')
    assert.equal(klingExtractStatus(created), 'submitted')
    assert.equal(klingExtractRequestId(created), 'req-1')
    assert.equal(klingFormatTaskError(created), null)
    assert.equal(klingExtractVideoUrl(created), null)

    const listed = {
      code: 0,
      data: [{
        id: '943',
        status: 'succeeded',
        outputs: [{ type: 'video', url: ' https://cdn.example/a.mp4 ' }, { type: 'image', url: 'https://cdn.example/b.png' }],
        usage: { output_duration: '5', input_duration: '0' },
      }],
    }
    assert.equal(klingExtractVideoUrl(listed, '943'), 'https://cdn.example/a.mp4')
    assert.deepEqual(klingExtractUsage(listed, '943'), { output_duration: 5, input_duration: 0 })

    const wrapped = { data: { result: [{ id: '7', status: 'failed', message: 'duration out of range' }] } }
    assert.equal(klingExtractStatus(wrapped, '7'), 'failed')
    assert.equal(klingFormatTaskError(wrapped, '7'), 'duration out of range')
    assert.equal(klingFormatTaskError({
      data: [{ id: '9', status: 'succeeded', message: 'SUCCEED' }],
    }, '9'), null)

    const nested = { data: { data: [{ id: '8', status: 'processing' }] } }
    assert.equal(klingExtractStatus(nested, '8'), 'processing')
    assert.equal(klingExtractTaskId({ code: 1201, message: 'bad duration', request_id: 'req-2' }), null)
    assert.equal(klingExtractTaskId({
      id: 'gateway', status: 'success', data: { id: '943', status: 'submitted' },
    }), '943')
    assert.equal(klingExtractTaskId({
      id: 'gateway', status: 'success', data: { code: 1201, message: 'duration out of range' },
    }), null)
    assert.equal(klingExtractTaskId({
      id: 'gateway', status: 'success', code: 1201, message: 'duration out of range',
    }), null)
    assert.equal(klingBusinessCode({ code: 0, data: { code: 1201, message: 'duration out of range' } }), 1201)
    assert.equal(klingFormatTaskError({ code: 0, data: { code: 1201, message: 'duration out of range' } }), 'duration out of range')
    assert.equal(klingExtractStatus({ data: [{ id: 'other', status: 'succeeded' }] }, '943'), '')
    assert.equal(klingExtractVideoUrl({ data: [{ id: 'other', status: 'succeeded', outputs: [{ type: 'video', url: 'https://cdn.example/x.mp4' }] }] }, '943'), null)
    assert.equal(klingFormatTaskError({ code: 1201, message: 'bad duration' }), 'bad duration')
    assert.equal(klingFormatTaskError({ data: { code: 1201, message: 'resolution not supported' } }), 'resolution not supported')
    assert.equal(klingBusinessCode({ code: 0, data: { id: '1', status: 'submitted' } }), 0)
    assert.equal(klingBusinessCode({ data: { code: '1201', message: 'resolution not supported' } }), 1201)
    assert.equal(klingBusinessRejected(200, null, 1201), true)
    assert.equal(klingBusinessRejected(200, 'task_kling', 1201), false)
    assert.equal(klingBusinessRejected(400, null, 1201), false)
    assert.equal(klingBusinessRejected(200, null, 0), false)
    assert.equal(klingExtractRequestId({ data: { request_id: 'inner' } }), 'inner')
  })
})

describe('klingBuildChecks', () => {
  it('720p 16:9 过档，1080p 像素和超时差都未通过', () => {
    const ok = klingBuildChecks(rec({}))
    assert.equal(ok.find(item => item.name === '分辨率')?.pass, true)
    assert.equal(ok.find(item => item.name === '时长')?.pass, true)
    assert.equal(ok.find(item => item.name === '宽高比')?.pass, true)
    assert.equal(ok.some(item => item.name === 'usage'), false)
    assert.equal(ok.some(item => item.name === '官方域名'), false)

    const square = klingBuildChecks(rec({
      kind: 'i2v', caseId: 'kling:i2v-first', targets: { resolution: '720p', duration: 5 },
      probe: { w: 720, h: 720, duration: 5 },
    }))
    assert.equal(square.find(item => item.name === '分辨率')?.pass, true)
    assert.equal(square.some(item => item.name === '宽高比'), false)

    const wrong = klingBuildChecks(rec({ probe: { w: 1920, h: 1080, duration: 7 } }))
    assert.equal(wrong.find(item => item.name === '分辨率')?.pass, false)
    assert.equal(wrong.find(item => item.name === '时长')?.pass, false)
  })

  it('usage 只记 info，缺失不影响其它项', () => {
    const withUsage = klingBuildChecks(rec({ usage: { output_duration: 99 } }))
    const usage = withUsage.find(item => item.name === 'usage')
    assert.equal(usage?.info, true)
    assert.equal(usage?.pass, true)
    assert.equal(usage?.actual, 99)
    assert.equal(withUsage.filter(item => !item.info).every(item => item.pass), true)

    const business = klingBuildChecks(rec({
      status: 200, taskStatus: null, taskId: null, videoUrl: null, probe: null, ok: false,
      targets: { klingCode: 1201 },
    }))
    assert.equal(business.find(item => item.name === '请求成功')?.pass, false)
    const failed = klingBuildChecks(rec({ status: 400, taskStatus: null, taskId: null, videoUrl: null, probe: null, ok: false }))
    assert.equal(failed.find(item => item.name === '请求成功')?.pass, false)
    assert.equal(failed.some(item => item.name === '成片元数据'), false)
  })
})
