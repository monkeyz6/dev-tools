import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoCanReprobe, videoCanRequery, videoReprobeSrc, videoRetryAction, videoRetrySort, videoRetryTargets } from './retry.ts'
import type { VideoRetryCase } from './retry.ts'
import type { VideoRecord } from './types.ts'

function rec(partial: Partial<Pick<VideoRecord, 'taskId' | 'taskStatus' | 'kind' | 'videoUrl'>>): Pick<VideoRecord, 'taskId' | 'taskStatus' | 'kind' | 'videoUrl'> {
  return {
    taskId: null,
    taskStatus: null,
    kind: 't2v',
    videoUrl: null,
    ...partial,
  }
}

function cse(partial: Partial<VideoRetryCase> & Pick<VideoRetryCase, 'kind' | 'status'>): VideoRetryCase {
  return {
    selected: true,
    def: { expect: 'success' },
    result: null,
    ...partial,
  }
}

describe('videoCanRequery', () => {
  it('没有 taskId 或素材类不能查', () => {
    assert.equal(videoCanRequery(rec({})), false)
    assert.equal(videoCanRequery(rec({ taskId: 'g1', kind: 'material-group' })), false)
    assert.equal(videoCanRequery(rec({ taskId: 'a1', kind: 'material-assets' })), false)
  })

  it('任务 failed 不能查，succeeded 且已有 video_url 也不能查', () => {
    assert.equal(videoCanRequery(rec({ taskId: 't1', taskStatus: 'failed' })), false)
    assert.equal(videoCanRequery(rec({ taskId: 't1', taskStatus: 'succeeded', videoUrl: 'https://cdn.example/v.mp4' })), false)
    assert.equal(videoCanRequery(rec({ taskId: 'v1_1', taskStatus: 'completed', videoUrl: 'https://cdn.example/v.mp4' })), false)
    assert.equal(videoCanRequery(rec({ taskId: 'v1_1', taskStatus: 'cancelled' })), false)
  })

  it('有 taskId 且未终态，或 succeeded 但缺 video_url，可以查', () => {
    assert.equal(videoCanRequery(rec({ taskId: 't1', taskStatus: 'queued' })), true)
    assert.equal(videoCanRequery(rec({ taskId: 't1', taskStatus: 'running' })), true)
    assert.equal(videoCanRequery(rec({ taskId: 't1', taskStatus: 'succeeded' })), true)
  })
})

describe('videoReprobeSrc', () => {
  it('优先 http outputUri，其次 http / blob videoUrl', () => {
    assert.equal(videoReprobeSrc({ videoUrl: 'blob:http://localhost/1', targets: { outputUri: 'https://cdn.example/v.mp4' } }), 'https://cdn.example/v.mp4')
    assert.equal(videoReprobeSrc({ videoUrl: 'https://cdn.example/v.mp4', targets: {} }), 'https://cdn.example/v.mp4')
    assert.equal(videoReprobeSrc({ videoUrl: 'blob:http://localhost/1', targets: {} }), 'blob:http://localhost/1')
    assert.equal(videoReprobeSrc({ videoUrl: null, targets: {} }), null)
  })
})

describe('videoCanReprobe', () => {
  const probe = { w: 1080, h: 1080, duration: 5 }
  it('没读到元数据可以再探，素材类或已通过不能', () => {
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'https://cdn.example/v.mp4', probe: null, targets: {}, ok: true, checks: [] }), true)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'blob:http://localhost/1', probe: null, targets: {}, ok: true, checks: [] }), true)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'blob:http://localhost/1', probe: null, targets: { outputUri: 'https://cdn.example/v.mp4' }, ok: true, checks: [] }), true)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'https://cdn.example/v.mp4', probe, targets: {}, ok: true, checks: [] }), false)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'https://cdn.example/v.mp4', probe, targets: {}, ok: true, checks: [{ name: '分辨率', target: '1080p', actual: '最近 720p', pass: true }] }), false)
    assert.equal(videoCanReprobe({ kind: 'material-group', videoUrl: 'https://cdn.example/v.mp4', probe: null, targets: {}, ok: true, checks: [] }), false)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: null, probe: null, targets: {}, ok: true, checks: [] }), false)
  })

  it('历史未通过（已有元数据但校验红）也可以重新识别', () => {
    assert.equal(videoCanReprobe({
      kind: 't2v', videoUrl: 'https://cdn.example/v.mp4', probe, targets: {}, ok: true,
      checks: [{ name: '分辨率', target: '1080p', actual: '最近 720p', pass: false }],
    }), true)
    assert.equal(videoCanReprobe({
      kind: 't2v', videoUrl: null, probe, targets: {}, ok: true,
      checks: [{ name: '分辨率', target: '1080p', actual: '最近 720p', pass: false }],
    }), true)
    assert.equal(videoCanReprobe({ kind: 't2v', videoUrl: 'https://cdn.example/v.mp4', probe, targets: {}, ok: false, checks: [] }), true)
  })
})

describe('videoRetryAction', () => {
  it('能查走 requery，否则 resubmit', () => {
    assert.equal(videoRetryAction(null), 'resubmit')
    assert.equal(videoRetryAction(rec({ taskId: null })), 'resubmit')
    assert.equal(videoRetryAction(rec({ taskId: 't1', taskStatus: 'failed' })), 'resubmit')
    assert.equal(videoRetryAction(rec({ taskId: 't1', taskStatus: 'queued' })), 'requery')
  })
})

describe('videoRetryTargets', () => {
  it('只收已勾选且 status=error，按素材 → 普通 → 拒绝排序', () => {
    const rejectErr = cse({ kind: 't2v', status: 'error', def: { expect: 'reject' }, result: rec({}) })
    const assetsErr = cse({ kind: 'material-assets', status: 'error' })
    const pass = cse({ kind: 't2v', status: 'pass' })
    const fail = cse({ kind: 't2v', status: 'fail' })
    const idleSel = cse({ kind: 't2v', status: 'idle' })
    const errorUnsel = cse({ kind: 't2v', status: 'error', selected: false })
    const t2vErr = cse({ kind: 't2v', status: 'error', result: rec({ taskId: 't1', taskStatus: 'queued' }) })
    const groupErr = cse({ kind: 'material-group', status: 'error' })

    const got = videoRetryTargets([rejectErr, assetsErr, pass, fail, idleSel, errorUnsel, t2vErr, groupErr])
    assert.deepEqual(got.map(c => c.kind + ':' + c.def.expect), [
      'material-group:success',
      'material-assets:success',
      't2v:success',
      't2v:reject',
    ])
    assert.equal(got[2], t2vErr)
  })
})

describe('videoRetrySort', () => {
  it('与批量运行同一套 rank', () => {
    const list = videoRetrySort([
      cse({ kind: 't2v', status: 'idle', def: { expect: 'reject' } }),
      cse({ kind: 't2v', status: 'idle' }),
      cse({ kind: 'material-group', status: 'idle' }),
      cse({ kind: 'material-assets', status: 'idle' }),
    ])
    assert.deepEqual(list.map(c => c.kind), ['material-group', 'material-assets', 't2v', 't2v'])
    assert.equal(list[3].def.expect, 'reject')
  })
})
