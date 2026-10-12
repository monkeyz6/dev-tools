import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_DRAFT_ID_PLACEHOLDER, VIDEO_KIND_ROLES,
  videoApplyFeatureEcho, videoAutoDurationChecks, videoAutoDurationRange, videoDraftFinalContent, videoExtractEcho, videoExtractFeatureEcho, videoFeatureChecks,
} from './seedance-features.ts'
import { VIDEO_CASE_DEFS, videoIsSeedance25, videoModelMaxResolution, videoModelMeetsRequirement } from './types.ts'
import { videoCanRequery } from './retry.ts'

const def = (id: string) => {
  const d = VIDEO_CASE_DEFS.find(x => x.id === id)
  assert.ok(d, `缺少用例 ${id}`)
  return d!
}

const probe = (w: number, h: number, duration: number) => ({ w, h, duration })

describe('Seedance 2.5 能力门控', () => {
  it('只认 2-5 / 2.5，2.0 / fast / mini 都不算', () => {
    assert.equal(videoIsSeedance25('doubao-seedance-2-5'), true)
    assert.equal(videoIsSeedance25('dreamina-seedance-2-5-260628'), true)
    assert.equal(videoIsSeedance25('doubao-seedance-2-0'), false)
    assert.equal(videoIsSeedance25('doubao-seedance-2-0-fast-260128'), false)
    assert.equal(videoIsSeedance25('dreamina-seedance-2-0-mini-260615'), false)
  })

  it('样片 / 仅音频 / mov 要求 2.5，其余用例不设门槛', () => {
    for (const id of ['draft-480p', 'draft-final', 'ref-audio-only', 'output-mov']) {
      assert.equal(def(id).requires, 'seedance-2.5', id)
      assert.equal(videoModelMeetsRequirement('doubao-seedance-2-0', def(id).requires), false, id)
      assert.equal(videoModelMeetsRequirement('doubao-seedance-2-5', def(id).requires), true, id)
    }
    for (const id of ['i2v-first', 'ref-video-edit', 'ref-video-extend', 't2v-auto-duration', 'ref-image-audio']) {
      assert.equal(def(id).requires, undefined, id)
    }
  })

  it('2.5 能力表仍是最高 1080p，样片转正式的 1080p 不会被分辨率门控误判', () => {
    assert.equal(videoModelMaxResolution('doubao-seedance-2-5'), 1080)
    assert.equal(def('draft-final').params.resolution, '1080p')
  })
})

describe('用例参数表', () => {
  it('只用 2.x 官方字段：不再带 seed / camera_fixed / frames', () => {
    for (const d of VIDEO_CASE_DEFS) {
      assert.equal('seed' in d.params, false, d.id)
      assert.equal('camera_fixed' in d.params, false, d.id)
      assert.equal('frames' in d.params, false, d.id)
    }
  })

  it('480p 搭载调度参数，720p 搭载返回尾帧', () => {
    const p480 = def('res-480p').params
    assert.equal(p480.priority, 5)
    assert.equal(typeof p480.safety_identifier, 'string')
    assert.ok(p480.safety_identifier!.length <= 64)
    assert.equal(p480.execution_expires_after, 3600)
    assert.equal(def('res-720p').params.return_last_frame, true)
  })

  it('样片只能 480p，正式视频只放 resolution，其余参数由模型复用', () => {
    assert.equal(def('draft-480p').params.draft, true)
    assert.equal(def('draft-480p').params.resolution, '480p')
    assert.deepEqual(Object.keys(def('draft-final').params), ['resolution'])
    assert.equal(def('draft-final').prompt, undefined)
  })

  it('编辑 / 延长只用两版都认的参数，自带含关键词的提示词', () => {
    const edit = def('ref-video-edit')
    assert.equal(edit.params.ratio, 'adaptive')
    assert.equal(edit.params.duration, -1)
    assert.equal('omni_reference_task_type' in edit.params, false)
    assert.match(edit.prompt || '', /编辑视频/)
    const extend = def('ref-video-extend')
    assert.equal(extend.params.ratio, 'adaptive')
    assert.match(extend.prompt || '', /向后延长/)
    assert.deepEqual(VIDEO_KIND_ROLES['ref-video-edit']!.map(r => r.role), ['reference_video'])
    assert.deepEqual(VIDEO_KIND_ROLES['ref-audio-only']!.map(r => r.role), ['reference_audio'])
    assert.deepEqual(VIDEO_KIND_ROLES['i2v']!.map(r => r.role), ['first_frame'])
  })

  it('拒绝类仍排在最后', () => {
    const lastTwo = VIDEO_CASE_DEFS.slice(-2).map(d => d.expect)
    assert.deepEqual(lastTwo, ['reject', 'reject'])
    assert.ok(VIDEO_CASE_DEFS.slice(0, -2).every(d => d.expect === 'success'))
  })
})

describe('videoDraftFinalContent', () => {
  it('只有 draft_task，没有 text / 素材', () => {
    assert.deepEqual(videoDraftFinalContent('cgt-draft-1'), [{ type: 'draft_task', draft_task: { id: 'cgt-draft-1' } }])
  })
  it('还没有样片时用占位符预览', () => {
    assert.deepEqual(videoDraftFinalContent(null), [{ type: 'draft_task', draft_task: { id: VIDEO_DRAFT_ID_PLACEHOLDER } }])
  })
})

describe('videoExtractFeatureEcho', () => {
  it('只读官方查询响应列出的字段：priority / execution_expires_after / last_frame_url / draft_task_id', () => {
    const echo = videoExtractFeatureEcho({
      id: 't', status: 'succeeded', priority: 5, execution_expires_after: 3600, draft_task_id: 'cgt-draft',
      safety_identifier: 'u', output_format: 'mov', draft: true,
      content: { video_url: 'https://x/v.mp4', last_frame_url: 'https://x/l.jpeg' },
    })
    assert.deepEqual(echo, { priority: 5, execution_expires_after: 3600, lastFrameUrl: 'https://x/l.jpeg', draftTaskId: 'cgt-draft' })
  })
  it('网关包一层 data 也能读到', () => {
    assert.equal(videoExtractFeatureEcho({ code: 0, data: { priority: '3' } }).priority, 3)
  })
  it('字段缺失时保持 undefined', () => {
    assert.deepEqual(videoExtractFeatureEcho({ id: 't' }), {
      priority: undefined, execution_expires_after: undefined, lastFrameUrl: undefined, draftTaskId: undefined,
    })
  })
})

describe('videoExtractEcho', () => {
  it('官方平铺响应', () => {
    assert.deepEqual(videoExtractEcho({ id: 't', status: 'succeeded', content: { video_url: 'u' }, resolution: '480p', ratio: '4:3', duration: 6, generate_audio: true }),
      { resolution: '480p', ratio: '4:3', duration: 6, generate_audio: true, seed: undefined })
  })
  it('new-api 一层包装 { data: { content, duration } } 也能读到回显时长', () => {
    const echo = videoExtractEcho({ code: 0, data: { status: 'succeeded', content: { video_url: 'u' }, duration: 6, ratio: '4:3' } })
    assert.equal(echo.duration, 6)
    assert.equal(echo.ratio, '4:3')
  })
  it('两层包装优先取内层；字符串数字转成数字', () => {
    const echo = videoExtractEcho({ data: { data: { content: { video_url: 'u' }, duration: '7' }, duration: 99 } })
    assert.equal(echo.duration, 7)
  })
})

function checksFor(targets: Record<string, string | number | boolean | null>, opts: { model?: string; kind?: any; probe?: ReturnType<typeof probe> | null } = {}) {
  return videoFeatureChecks({ model: opts.model ?? 'doubao-seedance-2-0', kind: opts.kind ?? 't2v', targets, probe: opts.probe === undefined ? probe(1280, 720, 5) : opts.probe })
}

describe('videoFeatureChecks', () => {
  it('回显一致通过、不一致未通过、未回显只记提示', () => {
    const targets: Record<string, string | number | boolean | null> = { priority: 5, safety_identifier: 'u', execution_expires_after: 3600 }
    videoApplyFeatureEcho(targets, { priority: 5 })
    let checks = checksFor(targets)
    const by = (n: string) => checks.find(c => c.name === n)!
    assert.equal(by('priority 回显').pass, true)
    assert.equal(by('execution_expires_after 回显').info, true)
    videoApplyFeatureEcho(targets, { priority: 0 })
    checks = checksFor(targets)
    assert.equal(by('priority 回显').pass, false)
  })

  it('官方不回显的 safety_identifier / output_format / draft 不出回显校验', () => {
    const names = checksFor({ safety_identifier: 'u', output_format: 'mov', draft: true }).map(c => c.name)
    assert.deepEqual(names, [])
  })

  it('请求没写的字段不出校验', () => {
    assert.deepEqual(checksFor({ resolution: '720p' }), [])
  })

  it('尾帧：缺地址未通过；尺寸与成片一致才通过；图片读不到只记提示', () => {
    assert.equal(checksFor({ return_last_frame: true }).find(c => c.name === '尾帧')!.pass, false)
    const ok = checksFor({ return_last_frame: true, lastFrameUrl: 'https://x/l.jpeg', lastFrameW: 1280, lastFrameH: 720 })
    assert.equal(ok.find(c => c.name === '尾帧')!.pass, true)
    assert.equal(ok.find(c => c.name === '尾帧尺寸')!.pass, true)
    const bad = checksFor({ return_last_frame: true, lastFrameUrl: 'https://x/l.jpeg', lastFrameW: 640, lastFrameH: 360 })
    assert.equal(bad.find(c => c.name === '尾帧尺寸')!.pass, false)
    const gone = checksFor({ return_last_frame: true, lastFrameUrl: 'https://x/l.jpeg', lastFrameProbe: 'failed' })
    assert.equal(gone.find(c => c.name === '尾帧尺寸')!.info, true)
  })

  it('样片转正式：响应的 draft_task_id 须等于样片 id，缺失只记提示', () => {
    const run = (echo?: string) => checksFor({ draftTaskId: 'cgt-draft', ...(echo ? { echoDraftTaskId: echo } : {}) }, { kind: 'draft-final', probe: null })
      .find(c => c.name === '样片复用（任务 id）')!
    assert.equal(run('cgt-draft').pass, true)
    assert.equal(run('cgt-other').pass, false)
    assert.equal(run().info, true)
  })

  it('样片转正式：时长与比例要和样片一致', () => {
    const targets = { draftDuration: 4.04, draftW: 864, draftH: 496 }
    const same = checksFor(targets, { kind: 'draft-final', probe: probe(1920, 1080, 4.04) })
    assert.ok(same.every(c => c.pass), JSON.stringify(same))
    const drift = checksFor(targets, { kind: 'draft-final', probe: probe(1080, 1920, 8) })
    assert.equal(drift.find(c => c.name === '样片复用（时长）')!.pass, false)
    assert.equal(drift.find(c => c.name === '样片复用（宽高比）')!.pass, false)
  })

  it('编辑：2.5 严格比对参考视频的比例与时长，2.0 只记提示', () => {
    const targets = { refVideoW: 1280, refVideoH: 720, refVideoDuration: 5 }
    const off = probe(960, 960, 9)
    const strict = checksFor(targets, { kind: 'ref-video-edit', model: 'doubao-seedance-2-5', probe: off })
    assert.equal(strict.filter(c => !c.pass).length, 2)
    const loose = checksFor(targets, { kind: 'ref-video-edit', model: 'doubao-seedance-2-0', probe: off })
    assert.ok(loose.every(c => c.pass && c.info))
    const extend = checksFor(targets, { kind: 'ref-video-extend', model: 'doubao-seedance-2-5', probe: probe(854, 480, 4) })
    assert.deepEqual(extend.map(c => [c.name, c.pass]), [['宽高比', true]])
  })
})

describe('duration = -1', () => {
  it('范围按模型：2.0 系列 4~15s，2.5 为 4~30s', () => {
    assert.deepEqual(videoAutoDurationRange('doubao-seedance-2-0-fast'), [4, 15])
    assert.deepEqual(videoAutoDurationRange('dreamina-seedance-2-5'), [4, 30])
  })
  it('回显在范围内且成片与回显一致才通过', () => {
    const ok = videoAutoDurationChecks('doubao-seedance-2-0', { duration: -1, echoDuration: 6 }, probe(864, 496, 6.04))
    assert.ok(ok.every(c => c.pass))
    const out = videoAutoDurationChecks('doubao-seedance-2-0', { duration: -1, echoDuration: 20 }, probe(864, 496, 20))
    assert.equal(out.find(c => c.name === '回显时长')!.pass, false)
    const drift = videoAutoDurationChecks('doubao-seedance-2-0', { duration: -1, echoDuration: 6 }, probe(864, 496, 9))
    assert.equal(drift.find(c => c.name === '时长')!.pass, false)
  })
  it('未回显 duration 只记提示，不拿 -1 去比成片', () => {
    const checks = videoAutoDurationChecks('doubao-seedance-2-0', { duration: -1 }, probe(864, 496, 6))
    assert.equal(checks.length, 1)
    assert.equal(checks[0].info, true)
  })
})

describe('expired', () => {
  it('过期任务是终态，不能再「重试查询」', () => {
    assert.equal(videoCanRequery({ taskId: 't', taskStatus: 'expired', kind: 't2v', videoUrl: null }), false)
    assert.equal(videoCanRequery({ taskId: 't', taskStatus: 'running', kind: 't2v', videoUrl: null }), true)
  })
})
