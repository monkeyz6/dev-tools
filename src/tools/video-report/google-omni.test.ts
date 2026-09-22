import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  OMNI_CASE_DEFS,
  omniBuildPlan,
  omniExtractVideo,
  omniMaterializeRequest,
  omniNeedsPrevious,
  omniLooksLikeFileUrl,
  omniParseSubmit,
  omniPollUrl,
  omniResolveFileUrl,
  omniIs720OnlyModel,
  omniPreviewBody,
  omniScrubBody,
  omniScrubValue,
  omniSupportsResolution,
  omniTransport,
} from './google-omni.ts'
import { videoModelMaxResolution } from './types.ts'

const urls = {
  firstFrame: 'https://example.com/first.jpg',
  lastFrame: 'https://example.com/last.jpg',
  refImage: 'https://example.com/ref.jpg',
  refVideo: 'https://example.com/ref.mp4',
  sensitiveFace: 'https://example.com/face.jpg',
}

function def(id: string) {
  const hit = OMNI_CASE_DEFS.find(d => d.id === id)
  assert.ok(hit, id)
  return hit
}

describe('omni resolution capability', () => {
  it('flash-preview 仅 720p，360p/1080p 都不支持；1.1 四档都支持', () => {
    assert.equal(omniIs720OnlyModel('gemini-omni-flash-preview'), true)
    assert.equal(omniIs720OnlyModel('gemini-omni-1.1-flash'), false)
    assert.equal(omniIs720OnlyModel('gemini-omni-1.1-flash-preview'), false)
    assert.equal(omniSupportsResolution('gemini-omni-flash-preview'), true)
    assert.equal(omniSupportsResolution('gemini-omni-flash-preview', '720p'), true)
    assert.equal(omniSupportsResolution('gemini-omni-flash-preview', '360p'), false)
    assert.equal(omniSupportsResolution('gemini-omni-flash-preview', '1080p'), false)
    assert.equal(omniSupportsResolution('gemini-omni-1.1-flash', '360p'), true)
    assert.equal(omniSupportsResolution('gemini-omni-1.1-flash', '1080p'), true)
    assert.equal(omniSupportsResolution('gemini-omni-1.1-flash', '4k'), true)
    assert.equal(videoModelMaxResolution('gemini-omni-flash-preview'), 720)
    assert.equal(videoModelMaxResolution('gemini-omni-1.1-flash'), 2160)
  })
})

describe('omniBuildPlan', () => {
  it('文生仅必填不带 task / delivery，同步 JSON，默认 data', () => {
    const { plan, missing, targets } = omniBuildPlan(def('google-omni:t2v-required'), 'gemini-omni-flash-preview', '海浪', urls, null)
    assert.equal(missing, null)
    assert.equal(plan.endpoint, '/v1beta/interactions')
    assert.equal(plan.body.model, 'gemini-omni-flash-preview')
    assert.equal(plan.body.input, '海浪')
    assert.equal(plan.body.background, undefined)
    assert.equal(plan.body.stream, undefined)
    assert.equal(plan.body.store, true)
    assert.deepEqual(plan.body.response_format, { type: 'video' })
    assert.equal(plan.body.generation_config, undefined)
    assert.equal(targets.generate_audio, true)
    assert.equal(targets.delivery, 'data')
    assert.equal(targets.omniTransport, '同步 JSON')
    assert.deepEqual(omniTransport(def('google-omni:t2v-required')), { background: false })
  })

  it('360p 用例写出字符串 duration、显式 task 与 delivery=uri，仍不传 background', () => {
    const { plan, targets } = omniBuildPlan(def('google-omni:t2v-360p'), 'gemini-omni-flash-preview', '海浪', urls, null)
    const rf = plan.body.response_format as Record<string, unknown>
    assert.equal(rf.resolution, '360p')
    assert.equal(rf.aspect_ratio, '9:16')
    assert.equal(rf.duration, '4s')
    assert.equal(rf.delivery, 'uri')
    assert.equal((plan.body.generation_config as any).video_config.task, 'text_to_video')
    assert.equal(plan.body.background, undefined)
    assert.equal(plan.body.stream, undefined)
    assert.equal(targets.duration, 4)
    assert.equal(targets.ratio, '9:16')
    assert.equal(targets.delivery, 'uri')
    assert.equal(targets.omniTransport, '同步 JSON')
  })

  it('全部同步、不传 stream；图生首帧单张；拒绝 21:9 不写 delivery', () => {
    for (const d of OMNI_CASE_DEFS) {
      const built = omniBuildPlan(d, 'm', 'x', urls, 'v1_prev')
      assert.equal(built.plan.body.background, undefined, d.id)
      assert.equal(built.plan.body.stream, undefined, d.id)
      assert.equal(built.targets.omniTransport, '同步 JSON', d.id)
    }
    const first = omniBuildPlan(def('google-omni:i2v-first'), 'm', '转场', urls, null)
    const firstInput = first.plan.body.input as Array<Record<string, unknown>>
    assert.equal(firstInput.length, 2)
    assert.equal(firstInput[0].type, 'image')
    assert.equal(firstInput[0].data, '{{first_frame}}')
    assert.equal(firstInput[1].type, 'text')
    assert.equal((first.plan.body.generation_config as any).video_config.task, 'image_to_video')
    assert.equal((first.plan.body.response_format as any).delivery, 'uri')
    const frames = omniBuildPlan(def('google-omni:i2v-frames'), 'm', '转场', urls, null)
    assert.equal((frames.plan.body.response_format as any).delivery, 'uri')
    const reject = omniBuildPlan(def('google-omni:reject-ratio'), 'm', 'x', urls, null)
    assert.equal((reject.plan.body.response_format as any).delivery, undefined)
    assert.equal(reject.targets.delivery, undefined)
    const face = omniBuildPlan(def('google-omni:reject-face'), 'm', 'x', urls, null)
    assert.equal(face.plan.body.stream, undefined)
    assert.equal(OMNI_CASE_DEFS.find(d => d.id === 'google-omni:reject-stream'), undefined)
  })

  it('首尾帧预览只用占位，不写真实字节', () => {
    const { plan } = omniBuildPlan(def('google-omni:i2v-frames'), 'm', '转场', urls, null)
    const preview = omniPreviewBody(plan.body)
    assert.match(preview, /\{\{first_frame\}\}/)
    assert.match(preview, /\{\{last_frame\}\}/)
    assert.doesNotMatch(preview, /AAAA/)
    const input = plan.body.input as Array<Record<string, unknown>>
    assert.equal(input[0].type, 'image')
    assert.equal(input[1].type, 'image')
    assert.equal(input[2].type, 'text')
  })

  it('编辑缺少 previous id 时报 missing', () => {
    assert.equal(omniNeedsPrevious(def('google-omni:edit')), true)
    const { missing } = omniBuildPlan(def('google-omni:edit'), 'm', '调亮', urls, null)
    assert.match(missing || '', /previous_interaction_id/)
    const ok = omniBuildPlan(def('google-omni:edit'), 'm', '调亮', urls, 'v1_abc')
    assert.equal(ok.missing, null)
    assert.equal(ok.plan.body.previous_interaction_id, 'v1_abc')
    assert.equal((ok.plan.body.generation_config as any).video_config.task, 'edit')
  })
})

describe('omniParseSubmit / extract', () => {
  it('completed + steps video 直接 done', () => {
    const json = {
      id: 'v1_1',
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://files.example/a.mp4' }] }],
    }
    const r = omniParseSubmit(200, json, JSON.stringify(json))
    assert.equal(r.kind, 'done')
    if (r.kind === 'done') {
      assert.equal(r.id, 'v1_1')
      assert.equal(r.video?.uri, 'https://files.example/a.mp4')
    }
  })

  it('in_progress 走 poll，不把 completed 当成 Seedance 任务', () => {
    const json = { id: 'v1_2', status: 'in_progress' }
    const r = omniParseSubmit(200, json, '{}')
    assert.equal(r.kind, 'poll')
    if (r.kind === 'poll') assert.equal(r.id, 'v1_2')
  })

  it('cancelled / failed 归一成 error，不当成 Seedance succeeded', () => {
    const cancelled = omniParseSubmit(200, { id: 'v1_x', status: 'cancelled' }, '{}')
    assert.equal(cancelled.kind, 'error')
    if (cancelled.kind === 'error') assert.equal(cancelled.status, 'cancelled')
    const failed = omniParseSubmit(200, { id: 'v1_y', status: 'failed', error: { message: 'safety' } }, '{}')
    assert.equal(failed.kind, 'error')
  })

  it('Google 4xx 读 error.message / status', () => {
    const json = { error: { message: 'Invalid aspect ratio', status: 'INVALID_ARGUMENT', code: 400 } }
    const r = omniParseSubmit(400, json, JSON.stringify(json))
    assert.equal(r.kind, 'error')
    if (r.kind === 'error') {
      assert.match(r.message, /Invalid aspect ratio/)
      assert.equal(r.detail?.type, 'INVALID_ARGUMENT')
    }
  })

  it('不依赖 SDK 的 output_video，但可作兜底', () => {
    assert.equal(omniExtractVideo({ steps: [] }), null)
    const hit = omniExtractVideo({ output_video: { data: 'AAA', mime_type: 'video/mp4' } })
    assert.equal(hit?.data, 'AAA')
  })

  it('completed 但没有 video 视为终态失败，不再 poll', () => {
    const r = omniParseSubmit(200, { id: 'v1_z', status: 'completed', steps: [] }, '{}')
    assert.equal(r.kind, 'error')
    if (r.kind === 'error') assert.match(r.message, /未返回视频/)
  })

  it('已有 video 即使缺 status 也 done，不当成还在跑', () => {
    const r = omniParseSubmit(200, {
      id: 'v1_3',
      steps: [{ content: [{ type: 'video', uri: 'https://files.example/b.mp4' }] }],
    }, '{}')
    assert.equal(r.kind, 'done')
    if (r.kind === 'done') assert.equal(r.video?.uri, 'https://files.example/b.mp4')
  })
})

describe('omni file download url', () => {
  it('认 Files :download 链，同 origin 原样、https→渠道 http、相对路径拼根', () => {
    const full = 'https://192.168.1.149:3000/v1beta/files/abc:download?alt=media&model=gemini-omni-flash-preview'
    assert.equal(omniLooksLikeFileUrl(full), true)
    assert.equal(omniLooksLikeFileUrl('https://cdn.example/v.mp4'), false)
    assert.equal(omniResolveFileUrl(full, 'https://192.168.1.149:3000'), full)
    assert.equal(
      omniResolveFileUrl(full, 'http://192.168.1.149:3000'),
      'http://192.168.1.149:3000/v1beta/files/abc:download?alt=media&model=gemini-omni-flash-preview',
    )
    assert.equal(
      omniResolveFileUrl('/v1beta/files/abc:download?alt=media&model=gemini-omni-flash-preview', 'https://gateway.example/'),
      'https://gateway.example/v1beta/files/abc:download?alt=media&model=gemini-omni-flash-preview',
    )
  })
})

describe('omniPollUrl', () => {
  it('手动重试查询带 ?model=', () => {
    assert.equal(
      omniPollUrl('https://mock.example', 'v1_abc', 'gemini-omni-flash-preview'),
      'https://mock.example/v1beta/interactions/v1_abc?model=gemini-omni-flash-preview',
    )
    assert.equal(
      omniPollUrl('https://mock.example/', 'v1_abc', 'gemini-omni-flash-preview'),
      'https://mock.example/v1beta/interactions/v1_abc?model=gemini-omni-flash-preview',
    )
  })
})

describe('omniScrub / materialize', () => {
  it('超长 data 不会出现在 scrub 结果里', () => {
    const fat = 'A'.repeat(5000)
    const raw = JSON.stringify({ steps: [{ content: [{ type: 'video', data: fat }] }] })
    const scrubbed = omniScrubBody(raw)
    assert.doesNotMatch(scrubbed, /AAAAAA/)
    assert.match(scrubbed, /base64 omitted 5000 chars/)
    assert.equal((omniScrubValue({ data: '{{first_frame}}' }) as any).data, '{{first_frame}}')
  })

  it('materialize 只在发送时把占位换成 base64', async () => {
    const { plan } = omniBuildPlan(def('google-omni:i2v-frames'), 'm', '转场', urls, null)
    const cache = new Map<string, { mime: string; b64: string }>()
    const fetched: string[] = []
    const body = await omniMaterializeRequest(plan.body, urls, cache, async (url) => {
      fetched.push(url)
      return { mime: 'image/png', b64: `B64_${url.split('/').pop()}` }
    })
    const input = body.input as Array<Record<string, unknown>>
    assert.equal(input[0].data, 'B64_first.jpg')
    assert.equal(input[0].mime_type, 'image/png')
    assert.equal(input[1].data, 'B64_last.jpg')
    assert.deepEqual(fetched, [urls.firstFrame, urls.lastFrame])
    const again = await omniMaterializeRequest(plan.body, urls, cache, async () => {
      throw new Error('should use cache')
    })
    assert.equal((again.input as Array<Record<string, unknown>>)[0].data, 'B64_first.jpg')
  })
})
