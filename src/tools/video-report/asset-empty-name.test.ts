import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoAssetEmptyNameChecks, type VideoAssetEmptyNameInput } from './asset-empty-name.ts'
import type { VideoCheck } from './types.ts'

function createBody(id = 'asset-1') {
  return {
    ResponseMetadata: {
      RequestId: 'req-create',
      Action: 'CreateAsset',
      Version: '2024-01-01',
      Service: 'ark',
      Region: 'cn-beijing',
    },
    Result: { Id: id },
  }
}

function getBody(over: Record<string, unknown> = {}) {
  return {
    Result: {
      Id: 'asset-1',
      Name: '',
      URL: 'https://ark-media-asset.example/a.jpg?X-Tos-Signature=1',
      AssetType: 'Image',
      GroupId: 'group-1',
      Status: 'Active',
      ...over,
    },
  }
}

function input(over: Partial<VideoAssetEmptyNameInput> = {}): VideoAssetEmptyNameInput {
  return {
    requestBody: { GroupId: 'group-1', URL: 'https://example.com/a.jpg', AssetType: 'Image' },
    createJson: createBody(),
    getJson: getBody(),
    groupId: 'group-1',
    assetType: 'Image',
    queried: true,
    ...over,
  }
}

function byName(checks: VideoCheck[], name: string): VideoCheck {
  const found = checks.find(c => c.name === name)
  if (!found) throw new Error(`缺少校验项 ${name}`)
  return found
}

describe('videoAssetEmptyNameChecks', () => {
  it('官方形状且 Name 为空字符串时全部通过', () => {
    const checks = videoAssetEmptyNameChecks(input())
    assert.ok(checks.every(c => c.pass))
    assert.equal(byName(checks, '素材 Name').actual, '""')
    assert.equal(checks.some(c => c.name === '素材请求 Name'), false)
  })

  it('GetAsset 不带 Name 字段也通过', () => {
    const got = getBody()
    delete (got.Result as { Name?: string }).Name
    const checks = videoAssetEmptyNameChecks(input({ getJson: got }))
    assert.equal(byName(checks, '素材 Name').pass, true)
    assert.equal(byName(checks, '素材 Name').actual, '（无此字段）')
  })

  it('Name 为 null 通过，默认名和纯空格未通过', () => {
    assert.equal(byName(videoAssetEmptyNameChecks(input({ getJson: getBody({ Name: null }) })), '素材 Name').pass, true)
    const filled = byName(videoAssetEmptyNameChecks(input({ getJson: getBody({ Name: 'reference' }) })), '素材 Name')
    assert.equal(filled.pass, false)
    assert.equal(filled.actual, 'reference')
    assert.equal(byName(videoAssetEmptyNameChecks(input({ getJson: getBody({ Name: ' ' }) })), '素材 Name').pass, false)
  })

  it('缺少 RequestId 未通过，其余官方字段仍可过', () => {
    const created = createBody()
    delete (created.ResponseMetadata as { RequestId?: string }).RequestId
    const checks = videoAssetEmptyNameChecks(input({ createJson: created }))
    assert.equal(byName(checks, '素材 RequestId').pass, false)
    assert.equal(byName(checks, '素材 Action').pass, true)
    assert.equal(byName(checks, '素材 Id').pass, true)
  })

  it('GroupId 与请求不一致未通过', () => {
    const checks = videoAssetEmptyNameChecks(input({ getJson: getBody({ GroupId: 'group-other' }) }))
    const row = byName(checks, '素材 GroupId')
    assert.equal(row.pass, false)
    assert.equal(row.actual, 'group-other')
    assert.equal(row.target, 'group-1')
  })

  it('已有 Id 但还没查询时不判 Get', () => {
    const checks = videoAssetEmptyNameChecks(input({ getJson: null, queried: false }))
    assert.equal(byName(checks, '素材 Id').pass, true)
    assert.equal(checks.some(c => c.name === '素材 AssetType' || c.name === '素材 Name' || c.name === '素材状态'), false)
  })

  it('创建没有 Id 时不判 Get', () => {
    const checks = videoAssetEmptyNameChecks(input({
      createJson: { ResponseMetadata: { Action: 'CreateAsset', Version: '2024-01-01', RequestId: 'req-create' }, Result: {} },
      getJson: null,
      queried: false,
    }))
    assert.equal(byName(checks, '素材 Id').pass, false)
    assert.equal(checks.some(c => c.name === '素材 AssetType' || c.name === '素材 Name' || c.name === '素材状态'), false)
  })

  it('手改预览写了非空 Name 记未通过，Get 仍按空名称判', () => {
    const checks = videoAssetEmptyNameChecks(input({
      requestBody: { GroupId: 'group-1', URL: 'https://example.com/a.jpg', AssetType: 'Image', Name: 'first_frame' },
      getJson: getBody({ Name: 'first_frame' }),
    }))
    assert.equal(byName(checks, '素材请求 Name').pass, false)
    assert.equal(byName(checks, '素材请求 Name').actual, 'first_frame')
    assert.equal(byName(checks, '素材 Name').pass, false)
  })
})
