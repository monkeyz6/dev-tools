import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoBuildReportSummary } from './summary.ts'
import { VIDEO_CASE_DEFS, videoApiTypeOf } from './types.ts'
import type { VideoRecord } from './types.ts'
import {
  MINIMAX_CASE_DEFS, MINIMAX_CREATE_ENDPOINT, MINIMAX_DEFAULT_MODEL,
  minimaxBuildChecks, minimaxBuildPlan, minimaxCapabilityHint, minimaxCaseDefsFor, minimaxExpect,
  minimaxExtractEcho, minimaxExtractStatus, minimaxExtractTaskId, minimaxExtractVideoUrl,
  minimaxFormatTaskError, minimaxQueryEndpoint, minimaxRefImageCounts,
  videoIsMinimaxH3, videoIsMinimaxMax, videoLooksLikeMinimaxModel, videoMinimaxPath, videoMinimaxUrl,
} from './minimax.ts'

const urls = {
  firstFrame: 'https://img.example/first.jpg',
  lastFrame: 'https://img.example/last.jpg',
  refImage: 'https://img.example/ref.jpg',
  refVideo: 'https://img.example/ref.mp4',
  refAudio: 'https://img.example/ref.mp3',
}

const def = (id: string) => {
  const d = MINIMAX_CASE_DEFS.find(x => x.id === id)
  assert.ok(d, `缺少用例 ${id}`)
  return d!
}

describe('videoMinimaxUrl', () => {
  it('oinone、hk.ainowork.ai、api.ainowork.ai 都加一次 /minimax', () => {
    assert.equal(
      videoMinimaxUrl('https://api.oinone.top', MINIMAX_CREATE_ENDPOINT),
      'https://api.oinone.top/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://hk.ainowork.ai', MINIMAX_CREATE_ENDPOINT),
      'https://hk.ainowork.ai/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://api.ainowork.ai', MINIMAX_CREATE_ENDPOINT),
      'https://api.ainowork.ai/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://HK.AINOWORK.AI/', minimaxQueryEndpoint('task a/b')),
      'https://HK.AINOWORK.AI/minimax/v2/query/video_generation/task%20a%2Fb',
    )
    assert.equal(
      videoMinimaxUrl('https://gateway.ainowork.com', MINIMAX_CREATE_ENDPOINT),
      'https://gateway.ainowork.com/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://notoinone.example', MINIMAX_CREATE_ENDPOINT),
      'https://notoinone.example/minimax/v2/video_generation',
    )
  })

  it('路径里已有 /minimax 段不再加，minimaxi 和主机名里的 minimax 不算', () => {
    assert.equal(
      videoMinimaxUrl('https://api.oinone.top/minimax', MINIMAX_CREATE_ENDPOINT),
      'https://api.oinone.top/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://api.ainowork.ai/minimax/', MINIMAX_CREATE_ENDPOINT),
      'https://api.ainowork.ai/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://hk.ainowork.ai/foo/minimax/bar', MINIMAX_CREATE_ENDPOINT),
      'https://hk.ainowork.ai/foo/minimax/bar/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://api.oinone.top/minimaxi', MINIMAX_CREATE_ENDPOINT),
      'https://api.oinone.top/minimaxi/minimax/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://api.minimax.io', MINIMAX_CREATE_ENDPOINT),
      'https://api.minimax.io/v2/video_generation',
    )
    assert.equal(
      videoMinimaxUrl('https://api.minimax.cn', minimaxQueryEndpoint('424010985738629')),
      'https://api.minimax.cn/v2/query/video_generation/424010985738629',
    )
  })

  it('不插入 /byteplus，预览路径带上实际前缀', () => {
    const full = videoMinimaxUrl('https://hk.ainowork.ai', MINIMAX_CREATE_ENDPOINT)
    assert.equal(full.includes('/byteplus'), false)
    assert.equal(videoMinimaxPath('https://hk.ainowork.ai', MINIMAX_CREATE_ENDPOINT), '/minimax/v2/video_generation')
    assert.equal(videoMinimaxPath('https://api.minimax.io', MINIMAX_CREATE_ENDPOINT), '/v2/video_generation')
    assert.equal(videoMinimaxPath('', MINIMAX_CREATE_ENDPOINT), '/v2/video_generation')
  })
})

describe('MiniMax 家族', () => {
  it('先认 Max，再认 H3；-intl 只去结尾一次', () => {
    assert.equal(videoIsMinimaxMax('MiniMax-H3'), false)
    assert.equal(videoIsMinimaxH3('MiniMax-H3'), true)
    assert.equal(videoIsMinimaxMax('MiniMax-H3-INTL'), false)
    assert.equal(videoIsMinimaxH3('MiniMax-H3-intl'), true)
    assert.equal(videoIsMinimaxMax('MiniMax-H3-Max'), true)
    assert.equal(videoIsMinimaxH3('MiniMax-H3-Max'), false)
    assert.equal(videoIsMinimaxMax('MiniMax-H3-Max-intl'), true)
    assert.equal(videoIsMinimaxH3('MiniMax-H3-Max-intl'), false)
    assert.equal(videoIsMinimaxMax('MiniMax-H3-Fast'), false)
    assert.equal(videoIsMinimaxH3('MiniMax-H3-Fast'), false)
    assert.equal(videoIsMinimaxMax('MiniMax-H3-Max-Turbo'), false)
    assert.equal(videoIsMinimaxH3('MiniMax-H3-Max-Turbo'), false)
    assert.equal(videoLooksLikeMinimaxModel('MiniMax-H3-Fast'), true)
  })

  it('只有 Max 的 2K 标预期不支持', () => {
    const twoK = def('minimax:t2v-2k')
    const p768 = def('minimax:t2v-768p')
    for (const model of ['MiniMax-H3', 'MiniMax-H3-intl', 'MiniMax-H3-INTL', 'MiniMax-H3-Fast', 'MiniMax-H3-Max-Turbo']) {
      assert.equal(minimaxExpect(twoK, model), 'success', model)
      assert.equal(minimaxCapabilityHint(model) === '无 2K', false, model)
    }
    for (const model of ['MiniMax-H3-Max', 'MiniMax-H3-Max-intl']) {
      assert.equal(minimaxExpect(twoK, model), 'unsupported', model)
      assert.equal(minimaxExpect(p768, model), 'success', model)
      assert.equal(minimaxCapabilityHint(model), '480P / 768P')
    }
  })
})

describe('minimaxBuildPlan', () => {
  it('五条都是 5s，不进 Seedance 用例表', () => {
    assert.equal(MINIMAX_CASE_DEFS.length, 5)
    assert.ok(MINIMAX_CASE_DEFS.every(d => d.params.duration === 5 && d.expect === 'success'))
    assert.equal(MINIMAX_DEFAULT_MODEL, 'MiniMax-H3')
    assert.ok(VIDEO_CASE_DEFS.every(d => !d.id.startsWith('minimax:')))
    assert.equal(videoApiTypeOf('minimax'), 'minimax')
    assert.equal(videoApiTypeOf(undefined), 'seedance')
    assert.equal(videoApiTypeOf('google-omni'), 'google-omni')
  })

  it('768P 文生只带官方字段，模型原文保留 -intl', () => {
    const { plan, missing } = minimaxBuildPlan(def('minimax:t2v-768p'), 'MiniMax-H3-intl', '海浪', urls)
    assert.equal(missing, null)
    assert.deepEqual(plan.body, {
      model: 'MiniMax-H3-intl',
      content: [{ type: 'text', text: '海浪' }],
      resolution: '768P',
      duration: 5,
      ratio: '16:9',
    })
    assert.equal(plan.endpoint, MINIMAX_CREATE_ENDPOINT)
  })

  it('首帧带 first_frame 且 ratio=adaptive，首帧为空则不发送', () => {
    const ok = minimaxBuildPlan(def('minimax:i2v-first'), 'MiniMax-H3', '海浪', urls)
    assert.equal(ok.missing, null)
    assert.equal(ok.plan.body.ratio, 'adaptive')
    assert.deepEqual((ok.plan.body.content as any[])[1], {
      type: 'image_url', image_url: { url: urls.firstFrame }, role: 'first_frame',
    })
    const empty = minimaxBuildPlan(def('minimax:i2v-first'), 'MiniMax-H3', '海浪', { ...urls, firstFrame: '  ' })
    assert.match(empty.missing || '', /首帧/)
    assert.equal((empty.plan.body.content as any[]).some(x => x.role), false)
  })

  it('首尾帧两个角色都要有', () => {
    const ok = minimaxBuildPlan(def('minimax:i2v-frames'), 'MiniMax-H3', '海浪', urls)
    assert.deepEqual((ok.plan.body.content as any[]).map(x => x.role).filter(Boolean), ['first_frame', 'last_frame'])
    const missing = minimaxBuildPlan(def('minimax:i2v-frames'), 'MiniMax-H3', '海浪', { ...urls, lastFrame: '' })
    assert.match(missing.missing || '', /尾帧/)
  })

  it('参考三个角色，缺一个不退化成文生', () => {
    const ok = minimaxBuildPlan(def('minimax:ref'), 'MiniMax-H3', '海浪', urls)
    assert.equal(ok.missing, null)
    assert.deepEqual(
      (ok.plan.body.content as any[]).map(x => x.role).filter(Boolean),
      ['reference_image', 'reference_video', 'reference_audio'],
    )
    assert.equal(ok.plan.body.ratio, 'adaptive')
    const missing = minimaxBuildPlan(def('minimax:ref'), 'MiniMax-H3', '海浪', { ...urls, refAudio: '' })
    assert.match(missing.missing || '', /参考音频/)
    assert.equal((missing.plan.body.content as any[]).some(x => x.role === 'reference_audio'), false)
    assert.equal((missing.plan.body.content as any[]).some(x => x.role === 'reference_image'), true)
    assert.notEqual(missing.plan.body.ratio, '16:9')
  })

  it('2K 文生 resolution 保持官方大写', () => {
    const { plan } = minimaxBuildPlan(def('minimax:t2v-2k'), 'MiniMax-H3', '海浪', urls)
    assert.equal(plan.body.resolution, '2K')
    assert.equal(plan.body.duration, 5)
    assert.equal(plan.body.ratio, '16:9')
  })

  it('参考图张数跟模型走：H3 与认不出的名字是 1/5/6，Max 是 1/2/3/4', () => {
    for (const model of ['MiniMax-H3', 'MiniMax-H3-intl', 'MiniMax-H3-Fast', 'MiniMax-H3-Max-Turbo', 'MiniMax-H3-M']) {
      assert.deepEqual(minimaxRefImageCounts(model), [1, 5, 6], model)
    }
    for (const model of ['MiniMax-H3-Max', 'MiniMax-H3-Max-intl', ' MiniMax-H3-Max-INTL ']) {
      assert.deepEqual(minimaxRefImageCounts(model), [1, 2, 3, 4], model)
    }
    const h3 = minimaxCaseDefsFor('MiniMax-H3')
    assert.deepEqual(h3.map(d => d.id), [
      'minimax:t2v-768p', 'minimax:i2v-first', 'minimax:i2v-frames', 'minimax:ref',
      'minimax:ref-img-1', 'minimax:ref-img-5', 'minimax:ref-img-6', 'minimax:t2v-2k',
    ])
    assert.equal(MINIMAX_CASE_DEFS.some(d => d.kind === 'ref-images'), false)
    assert.equal(h3.filter(d => d.kind === 'ref-images').every(d => d.expect === 'success' && d.params.resolution === '768P' && d.params.duration === 5 && d.params.ratio === 'adaptive'), true)
    const max = minimaxCaseDefsFor('MiniMax-H3-Max')
    assert.deepEqual(max.filter(d => d.kind === 'ref-images').map(d => d.refImageCount), [1, 2, 3, 4])
    assert.equal(max.some(d => d.id === 'minimax:ref-img-5' || d.id === 'minimax:ref-img-6'), false)
    assert.equal(h3.some(d => d.id === 'minimax:t2v-480p'), false)
    assert.equal(minimaxCaseDefsFor('MiniMax-H3-Fast').some(d => d.id === 'minimax:t2v-480p'), false)
    const p480 = max.find(d => d.id === 'minimax:t2v-480p')
    assert.ok(p480)
    assert.equal(p480.params.resolution, '480P')
    assert.equal(p480.params.duration, 5)
    assert.equal(p480.params.ratio, '16:9')
    assert.equal(minimaxExpect(p480, 'MiniMax-H3-Max'), 'success')
    assert.equal(minimaxExpect(p480, 'MiniMax-H3-Max-intl'), 'success')
    const built = minimaxBuildPlan(p480, 'MiniMax-H3-Max-intl', '海浪', urls)
    assert.equal(built.missing, null)
    assert.deepEqual(built.plan.body, {
      model: 'MiniMax-H3-Max-intl',
      content: [{ type: 'text', text: '海浪' }],
      resolution: '480P',
      duration: 5,
      ratio: '16:9',
    })
    assert.deepEqual(
      minimaxCaseDefsFor('MiniMax-H3-Max').filter(d => d.kind === 't2v').map(d => d.id),
      ['minimax:t2v-768p', 'minimax:t2v-480p', 'minimax:t2v-2k'],
    )
  })

  it('参考图用例只重复同一 URL，不带视频和音频，空 URL 不发送', () => {
    const six = minimaxCaseDefsFor('MiniMax-H3').find(d => d.id === 'minimax:ref-img-6')
    assert.ok(six)
    const built = minimaxBuildPlan(six!, 'MiniMax-H3', '海浪', urls)
    assert.equal(built.missing, null)
    const content = built.plan.body.content as { type: string; text?: string; role?: string; image_url?: { url: string } }[]
    assert.deepEqual(content[0], { type: 'text', text: '海浪' })
    const images = content.slice(1)
    assert.equal(images.length, 6)
    assert.ok(images.every(x => x.type === 'image_url' && x.role === 'reference_image' && x.image_url?.url === urls.refImage))
    assert.equal(content.some(x => x.role === 'reference_video' || x.role === 'reference_audio' || x.role === 'first_frame'), false)
    assert.equal(built.plan.body.resolution, '768P')
    assert.equal(built.plan.body.duration, 5)
    assert.equal(built.plan.body.ratio, 'adaptive')
    assert.deepEqual(Object.keys(built.plan.body).sort(), ['content', 'duration', 'model', 'ratio', 'resolution'])
    const empty = minimaxBuildPlan(six!, 'MiniMax-H3', '海浪', { ...urls, refImage: '  ' })
    assert.match(empty.missing || '', /参考图/)
    assert.equal((empty.plan.body.content as { role?: string }[]).some(x => x.role), false)
    const four = minimaxCaseDefsFor('MiniMax-H3-Max-intl').find(d => d.id === 'minimax:ref-img-4')
    assert.ok(four)
    const fourPlan = minimaxBuildPlan(four!, 'MiniMax-H3-Max-intl', '海浪', urls)
    const fourImages = (fourPlan.plan.body.content as { role?: string; image_url?: { url: string } }[]).filter(x => x.role === 'reference_image')
    assert.equal(fourImages.length, 4)
    assert.ok(fourImages.every(x => x.image_url?.url === urls.refImage))
    assert.equal(minimaxCaseDefsFor('MiniMax-H3').some(d => d.id === 'minimax:ref-img-4'), false)
  })
})

describe('MiniMax 响应解析', () => {
  it('task_id 读根、data、data.data，数字转字符串', () => {
    assert.equal(minimaxExtractTaskId({ task_id: 'task_abc' }), 'task_abc')
    assert.equal(minimaxExtractTaskId({ data: { task_id: 'task_d' } }), 'task_d')
    assert.equal(minimaxExtractTaskId({ data: { data: { task_id: 424010985738629 } } }), '424010985738629')
    assert.equal(minimaxExtractTaskId({ task: { id: 'from-task' } }), 'from-task')
    const wrapped = {
      task_id: 'task_abc',
      data: {
        task: {
          id: 'task_abc',
          status: 'succeeded',
          content: { url: 'https://cdn.hailuoai.com/a.mp4' },
          resolution: '768P',
          duration: 5,
          ratio: '16:9',
        },
      },
    }
    assert.equal(minimaxExtractTaskId(wrapped), 'task_abc')
    assert.equal(minimaxExtractStatus(wrapped), 'succeeded')
    assert.equal(minimaxExtractVideoUrl(wrapped), 'https://cdn.hailuoai.com/a.mp4')
    assert.deepEqual(minimaxExtractEcho(wrapped), { resolution: '768P', duration: 5, ratio: '16:9' })
  })

  it('成片只认 task.content.url，回显和状态、错误在 task 上', () => {
    const query = {
      data: {
        task: {
          id: 'task_1',
          status: 'Succeeded',
          content: { url: ' https://cdn.hailuoai.com/a.mp4 ', video_url: 'https://no.example/v.mp4' },
          resolution: '768P',
          duration: 5,
          ratio: '16:9',
        },
      },
    }
    assert.equal(minimaxExtractVideoUrl(query), 'https://cdn.hailuoai.com/a.mp4')
    assert.equal(minimaxExtractVideoUrl({ content: { video_url: 'https://x' }, data: { content: { video_url: 'https://y' } } }), null)
    assert.equal(minimaxExtractStatus(query), 'succeeded')
    assert.deepEqual(minimaxExtractEcho(query), { resolution: '768P', duration: 5, ratio: '16:9' })
    assert.equal(minimaxExtractStatus({ task: { status: 'queued' } }), 'queued')
    assert.equal(minimaxExtractStatus({ task: { status: 'failed' } }), 'failed')
    assert.equal(minimaxExtractStatus({ task: { status: 'cancelled' } }), 'cancelled')
    assert.equal(minimaxExtractStatus({ task_id: 'only-create' }), '')
    assert.equal(
      minimaxFormatTaskError({ task: { status: 'failed', error: { code: 1026, message: 'video description contains sensitive content' } } }),
      '1026 video description contains sensitive content',
    )
    assert.equal(minimaxExtractEcho({ data: { task: { duration: '5', resolution: '2K', ratio: '9:16' } } }).duration, 5)
  })
})

function rec(partial: Partial<VideoRecord> & { targets?: VideoRecord['targets'] }): VideoRecord {
  return {
    id: '1', time: 1, caseName: '文生 · 768P · 16:9 · 5s', caseDesc: '', channelName: 'c',
    model: 'MiniMax-H3', prompt: '海浪', apiType: 'minimax', kind: 't2v', expect: 'success',
    testMaterials: false, skippedRoles: [], status: 200, respHeaders: {}, reqId: '', sentPreview: '',
    ok: true, error: null, rawSnippet: '', taskId: 'task_1', taskStatus: 'succeeded', pollCount: 1,
    videoUrl: 'https://cdn.hailuoai.com/a.mp4', probe: { w: 1280, h: 720, duration: 5 },
    usage: null, durationMs: 1, checks: [], pollLog: [],
    ...partial,
    targets: {
      resolution: '768P', duration: 5, ratio: '16:9',
      echoResolution: '768P', echoDuration: 5, echoRatio: '16:9',
      ...partial.targets,
    },
  }
}

describe('minimaxBuildChecks', () => {
  it('回显一致、成片时长和比例贴合时通过；像素只记 info，奇数尺寸也不失败', () => {
    const checks = minimaxBuildChecks(rec({}))
    const by = (name: string) => checks.find(c => c.name === name)
    assert.equal(by('分辨率回显')?.pass, true)
    assert.equal(by('时长回显')?.pass, true)
    assert.equal(by('比例回显')?.pass, true)
    assert.equal(by('时长')?.pass, true)
    assert.equal(by('宽高比')?.pass, true)
    assert.equal(checks.some(c => c.name === '官方域名'), false)
    assert.equal(checks.some(c => c.name === '分辨率'), false)
    const odd = minimaxBuildChecks(rec({ probe: { w: 13, h: 17, duration: 5.4 } }))
    assert.equal(odd.find(c => c.name === '成片像素')?.pass, true)
    assert.equal(odd.find(c => c.name === '成片像素')?.info, true)
    assert.equal(odd.find(c => c.name === '成片像素')?.actual, '13×17')
    assert.equal(odd.find(c => c.name === '时长')?.pass, true)
  })

  it('回显不一致失败，成功但缺回显也失败', () => {
    const mismatch = minimaxBuildChecks(rec({ targets: { echoResolution: '2K', echoDuration: 6, echoRatio: '9:16' } }))
    assert.equal(mismatch.find(c => c.name === '分辨率回显')?.pass, false)
    assert.equal(mismatch.find(c => c.name === '时长回显')?.pass, false)
    assert.equal(mismatch.find(c => c.name === '比例回显')?.pass, false)
    const missing = minimaxBuildChecks(rec({
      targets: { resolution: '768P', duration: 5, ratio: '16:9', echoResolution: null, echoDuration: null, echoRatio: null },
      probe: { w: 1280, h: 720, duration: 5 },
    }))
    assert.equal(missing.find(c => c.name === '分辨率回显')?.pass, false)
    assert.equal(missing.find(c => c.name === '时长回显')?.actual, '无回显')
    assert.equal(missing.find(c => c.name === '比例回显')?.pass, false)
    assert.equal(missing.some(c => c.name === '时长' && !c.info), false)
  })

  it('adaptive 回显具体比例时成片按该比例 ±5%；官方原样回 adaptive 也通过', () => {
    const checks = minimaxBuildChecks(rec({
      kind: 'i2v',
      targets: { resolution: '768P', duration: 5, ratio: 'adaptive', echoResolution: '768P', echoDuration: 5, echoRatio: '16:9' },
      probe: { w: 1280, h: 720, duration: 5 },
    }))
    assert.equal(checks.find(c => c.name === '比例回显')?.pass, true)
    assert.equal(checks.find(c => c.name === '宽高比')?.pass, true)
    const official = minimaxBuildChecks(rec({
      kind: 'i2v',
      targets: { resolution: '768P', duration: 5, ratio: 'adaptive', echoResolution: '768P', echoDuration: 5, echoRatio: 'adaptive' },
      probe: { w: 768, h: 768, duration: 5.18 },
    }))
    assert.equal(official.find(c => c.name === '比例回显')?.pass, true)
    assert.equal(official.find(c => c.name === '比例回显')?.target, 'adaptive')
    assert.equal(official.find(c => c.name === '比例回显')?.actual, 'adaptive')
    assert.equal(official.some(c => c.name === '宽高比'), false)
    const junk = minimaxBuildChecks(rec({
      targets: { resolution: '768P', duration: 5, ratio: 'adaptive', echoResolution: '768P', echoDuration: 5, echoRatio: '2:1' },
    }))
    assert.equal(junk.find(c => c.name === '比例回显')?.pass, false)
  })

  it('成片时长偏离回显超过 1s 失败', () => {
    const checks = minimaxBuildChecks(rec({ probe: { w: 1280, h: 720, duration: 7.2 } }))
    assert.equal(checks.find(c => c.name === '时长')?.pass, false)
  })

  it('普通 4xx 不追加回显失败', () => {
    const checks = minimaxBuildChecks(rec({
      status: 400, taskStatus: null, taskId: null, videoUrl: null, probe: null, ok: false,
      targets: { resolution: '2K', duration: 5, ratio: '16:9' },
    }))
    assert.equal(checks.find(c => c.name === '请求成功')?.pass, false)
    assert.equal(checks.find(c => c.name === '视频地址')?.pass, false)
    assert.equal(checks.some(c => c.name === '分辨率回显' || c.name === '时长回显' || c.name === '比例回显' || c.name === '成片像素'), false)
    assert.equal(checks.some(c => c.name === '官方域名'), false)
  })

  it('分辨率、时长、比例回显计入报告的参数回显', () => {
    const bad = rec({ targets: { echoResolution: '2K', echoDuration: 6, echoRatio: '9:16' } })
    bad.checks = minimaxBuildChecks(bad)
    const echo = videoBuildReportSummary([bad]).capabilities.find(c => c.key === 'echo')
    assert.equal(echo?.label, '参数回显')
    assert.equal(echo?.passedCases, 0)
    assert.equal(echo?.totalCases, 1)
  })
})
