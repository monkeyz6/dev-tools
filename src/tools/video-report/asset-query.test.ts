import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoAssetRfc3339, videoMaterialAssetsFromRecords, videoNamedAssets, videoScoreGetAsset, videoScoreListAssets, type VideoAssetQueryExpect } from './asset-query.ts'

const expectOne: VideoAssetQueryExpect = {
  id: 'asset-1',
  name: 'first_frame',
  assetType: 'Image',
  groupId: 'group-1',
}

function item(over: Record<string, unknown> = {}) {
  return {
    Id: 'asset-1',
    Name: 'first_frame',
    AssetType: 'Image',
    GroupId: 'group-1',
    Status: 'Active',
    URL: 'https://ark-media-asset.example/a.jpg?X-Tos-Signature=1',
    CreateTime: '2024-05-14T21:27:50Z',
    UpdateTime: '2024-05-14T21:30:00Z',
    ...over,
  }
}

function getJson(result: unknown, metaOver: Record<string, unknown> = {}) {
  return {
    ResponseMetadata: { Action: 'GetAsset', Version: '2024-01-01', RequestId: 'req-q', ...metaOver },
    Result: result,
  }
}

function listJson(items: unknown[], total = items.length) {
  return {
    ResponseMetadata: { Action: 'ListAssets', Version: '2024-01-01', RequestId: 'req-l' },
    Result: { Items: items, TotalCount: total, PageNumber: 1, PageSize: 100 },
  }
}

function byName(checks: { name: string; pass: boolean; actual: string | number }[], name: string) {
  const found = checks.find(c => c.name === name)
  if (!found) throw new Error(`缺少校验项 ${name}`)
  return found
}

describe('videoAssetRfc3339', () => {
  it('认带 Z 或数字时区的时间，不认空格分隔', () => {
    assert.equal(videoAssetRfc3339('2024-05-14T21:27:50Z'), true)
    assert.equal(videoAssetRfc3339('2024-05-14T21:27:50.123+08:00'), true)
    assert.equal(videoAssetRfc3339('2026-08-24 15:55:51'), false)
    assert.equal(videoAssetRfc3339(''), false)
  })
})

describe('videoScoreGetAsset', () => {
  it('Active 且字段齐全时通过，状态写成成功', () => {
    const scored = videoScoreGetAsset(getJson(item()), expectOne)
    assert.equal(scored.verdict, 'ready')
    assert.equal(byName(scored.checks, '素材状态 · first_frame').actual, '成功（Active）')
    assert.ok(scored.checks.every(c => c.pass))
  })

  it('Processing 还要再查', () => {
    const scored = videoScoreGetAsset(getJson(item({ Status: 'Processing', URL: '' })), expectOne)
    assert.equal(scored.verdict, 'wait')
    assert.equal(byName(scored.checks, '素材状态 · first_frame').pass, false)
  })

  it('Failed 不再等', () => {
    const scored = videoScoreGetAsset(getJson(item({ Status: 'Failed' })), expectOne)
    assert.equal(scored.verdict, 'fail')
  })

  it('没有状态，或官方错误体，不再隔 30 秒空等', () => {
    assert.equal(videoScoreGetAsset(getJson({}), expectOne).verdict, 'fail')
    const erred = getJson(item({ Status: 'Processing' }), { Error: { Code: 'InvalidParameter', Message: 'bad id' } })
    assert.equal(videoScoreGetAsset(erred, expectOne).verdict, 'fail')
  })

  it('时间不是 RFC3339、链接不是 https 时未通过', () => {
    const scored = videoScoreGetAsset(getJson(item({
      CreateTime: '2026-08-24 15:55:51',
      URL: 'http://ark-media-asset.example/a.jpg',
    })), expectOne)
    assert.equal(scored.verdict, 'fail')
    assert.equal(byName(scored.checks, '素材创建时间 · first_frame').pass, false)
    assert.equal(byName(scored.checks, '素材 URL · first_frame').pass, false)
  })
})

describe('videoScoreListAssets', () => {
  it('多一条别的素材不影响，本轮这条在就通过', () => {
    const scored = videoScoreListAssets(listJson([item(), item({ Id: 'asset-other', Name: 'other' })]), [expectOne])
    assert.equal(scored.verdict, 'ready')
  })

  it('本页没有、总数也不更大时继续等', () => {
    const scored = videoScoreListAssets(listJson([]), [expectOne])
    assert.equal(scored.verdict, 'wait')
    assert.equal(byName(scored.checks, '素材 Id · first_frame').actual, '列表中没有')
  })

  it('总数大于本页却找不到时不再等', () => {
    const scored = videoScoreListAssets(listJson([item({ Id: 'asset-other', Name: 'other' })], 3), [expectOne])
    assert.equal(scored.verdict, 'fail')
    assert.equal(byName(scored.checks, '素材列表').pass, false)
  })
})

describe('videoNamedAssets', () => {
  it('只收集登记过的带名字素材', () => {
    const named = videoNamedAssets({ groupId: 'group-1', firstFrame: 'asset-1', refAudio: 'asset-a' })
    assert.deepEqual(named.map(a => a.name), ['first_frame', 'reference_audio'])
    assert.equal(videoNamedAssets({ groupId: null, firstFrame: 'asset-1' }).length, 0)
  })
})

describe('videoMaterialAssetsFromRecords', () => {
  it('从素材组和素材登记的 taskId 记回 id，失败记录里的裸 id 不算', () => {
    const assets = videoMaterialAssetsFromRecords([
      { caseId: 'material-group', ok: true, taskId: 'group-1' },
      { caseId: 'material-assets', ok: true, taskId: 'first_frame=asset-1, reference_audio=asset-a' },
      { caseId: 'material-assets', ok: false, taskId: 'asset-bare' },
    ])
    assert.equal(assets.groupId, 'group-1')
    assert.equal(assets.firstFrame, 'asset-1')
    assert.equal(assets.refAudio, 'asset-a')
    assert.equal(assets.refVideo, undefined)
  })

  it('没有成功的素材组时不留下半截 id', () => {
    const assets = videoMaterialAssetsFromRecords([
      { caseId: 'material-assets', ok: true, taskId: 'first_frame=asset-1' },
    ])
    assert.equal(assets.groupId, null)
    assert.equal(assets.firstFrame, undefined)
  })
})
