import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoAssetEndpoint, videoSeedancePath, videoSeedanceUrl, VIDEO_TASK_ENDPOINT } from './seedance-url.ts'

describe('videoSeedanceUrl', () => {
  it('整段 baseUrl 含 oinone 或 ainowork（忽略大小写）才加一次 /byteplus', () => {
    assert.equal(
      videoSeedanceUrl('https://api.oinone.top', VIDEO_TASK_ENDPOINT),
      'https://api.oinone.top/byteplus/api/v3/contents/generations/tasks',
    )
    assert.equal(
      videoSeedanceUrl('https://API.OINONE.TOP/', VIDEO_TASK_ENDPOINT),
      'https://API.OINONE.TOP/byteplus/api/v3/contents/generations/tasks',
    )
    assert.equal(
      videoSeedanceUrl('https://gateway.ainowork.com', videoAssetEndpoint('CreateAsset')),
      'https://gateway.ainowork.com/byteplus/?Action=CreateAsset&Version=2024-01-01',
    )
    assert.equal(
      videoSeedanceUrl('https://notoinone.example/docs', VIDEO_TASK_ENDPOINT),
      'https://notoinone.example/docs/byteplus/api/v3/contents/generations/tasks',
    )
    assert.equal(
      videoSeedanceUrl('https://example.com/notes/ainowork', videoAssetEndpoint('GetAsset')),
      'https://example.com/notes/ainowork/byteplus/?Action=GetAsset&Version=2024-01-01',
    )
  })

  it('根末尾已是 /byteplus 不再加第二次', () => {
    assert.equal(
      videoSeedanceUrl('https://api.oinone.top/byteplus', VIDEO_TASK_ENDPOINT),
      'https://api.oinone.top/byteplus/api/v3/contents/generations/tasks',
    )
    assert.equal(
      videoSeedanceUrl('https://api.oinone.top/BytePlus/', `${VIDEO_TASK_ENDPOINT}/task%201`),
      'https://api.oinone.top/BytePlus/api/v3/contents/generations/tasks/task%201',
    )
  })

  it('不含这两个词则不插入 /byteplus', () => {
    assert.equal(
      videoSeedanceUrl('https://ark.cn-beijing.volces.com', VIDEO_TASK_ENDPOINT),
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    )
    assert.equal(
      videoSeedanceUrl('https://mock.example', videoAssetEndpoint('CreateAssetGroup')),
      'https://mock.example/?Action=CreateAssetGroup&Version=2024-01-01',
    )
    assert.equal(videoSeedanceUrl('', VIDEO_TASK_ENDPOINT), VIDEO_TASK_ENDPOINT)
  })

  it('预览路径带上实际会请求的前缀', () => {
    assert.equal(videoSeedancePath('https://api.oinone.top', VIDEO_TASK_ENDPOINT), '/byteplus/api/v3/contents/generations/tasks')
    assert.equal(
      videoSeedancePath('https://api.oinone.top/byteplus', VIDEO_TASK_ENDPOINT),
      '/byteplus/api/v3/contents/generations/tasks',
    )
    assert.equal(videoSeedancePath('https://ark.cn-beijing.volces.com', VIDEO_TASK_ENDPOINT), '/api/v3/contents/generations/tasks')
    assert.equal(
      videoSeedancePath('https://mock.example', videoAssetEndpoint('CreateAssetGroup')),
      '/?Action=CreateAssetGroup&Version=2024-01-01',
    )
    assert.equal(videoSeedancePath('', VIDEO_TASK_ENDPOINT), '/api/v3/contents/generations/tasks')
  })
})
