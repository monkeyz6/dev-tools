import type { VideoCheck } from './types.ts'

/** 素材查询 / 素材列表：先立即查，Processing 时隔这么久再查 */
export const VIDEO_ASSET_QUERY_WAIT_MS = 30_000
/** 含第一次，最多查这么多次 */
export const VIDEO_ASSET_QUERY_MAX = 5

export interface VideoAssetQueryExpect {
  id: string
  name: string
  assetType: string
  groupId: string
}

export type VideoAssetQueryVerdict = 'ready' | 'wait' | 'fail'

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function videoAssetRfc3339(value: unknown): boolean {
  if (typeof value !== 'string' || !RFC3339.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

export function videoAssetListBody(groupId: string): Record<string, unknown> {
  return {
    Filter: { GroupIds: [groupId] },
    PageNumber: 1,
    PageSize: 100,
    SortBy: 'CreateTime',
    SortOrder: 'Desc',
  }
}

/** 本轮「素材登记」写下的带名字素材。不传 Name 的那条不在这里。 */
export function videoNamedAssets(assets: {
  groupId?: string | null
  firstFrame?: string
  lastFrame?: string
  refImage?: string
  refVideo?: string
  refAudio?: string
} | null | undefined): VideoAssetQueryExpect[] {
  if (!assets?.groupId) return []
  const roles: { key: 'firstFrame' | 'lastFrame' | 'refImage' | 'refVideo' | 'refAudio'; name: string; assetType: string }[] = [
    { key: 'firstFrame', name: 'first_frame', assetType: 'Image' },
    { key: 'lastFrame', name: 'last_frame', assetType: 'Image' },
    { key: 'refImage', name: 'reference_image', assetType: 'Image' },
    { key: 'refVideo', name: 'reference_video', assetType: 'Video' },
    { key: 'refAudio', name: 'reference_audio', assetType: 'Audio' },
  ]
  const out: VideoAssetQueryExpect[] = []
  for (const role of roles) {
    const id = assets[role.key]
    if (typeof id === 'string' && id) out.push({ id, name: role.name, assetType: role.assetType, groupId: assets.groupId })
  }
  return out
}

const NAMED_ASSET_KEY: Record<string, 'firstFrame' | 'lastFrame' | 'refImage' | 'refVideo' | 'refAudio'> = {
  first_frame: 'firstFrame',
  last_frame: 'lastFrame',
  reference_image: 'refImage',
  reference_video: 'refVideo',
  reference_audio: 'refAudio',
}

/** 从一批历史里的「素材组 / 素材登记」记回本轮素材 id。认不出的 taskId 丢掉，避免用别的轮次残留。 */
export function videoMaterialAssetsFromRecords(records: { caseId?: string; ok?: boolean; taskId?: string | null }[]): {
  groupId: string | null
  firstFrame?: string
  lastFrame?: string
  refImage?: string
  refVideo?: string
  refAudio?: string
} {
  const assets: {
    groupId: string | null
    firstFrame?: string
    lastFrame?: string
    refImage?: string
    refVideo?: string
    refAudio?: string
  } = { groupId: null }
  const group = [...records].reverse().find(r => r.caseId === 'material-group' && r.ok && r.taskId && !r.taskId.includes('='))
  if (group?.taskId) assets.groupId = group.taskId
  const registered = [...records].reverse().find(r => r.caseId === 'material-assets' && r.ok && r.taskId)
  if (!assets.groupId || !registered?.taskId) return assets
  for (const part of registered.taskId.split(', ')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = NAMED_ASSET_KEY[part.slice(0, eq)]
    const id = part.slice(eq + 1)
    if (key && id) assets[key] = id
  }
  return assets
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function resultOf(json: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(json)?.Result)
}

function check(name: string, target: string, actual: string, pass: boolean): VideoCheck {
  return { name, target, actual, pass }
}

function shown(v: unknown): string {
  if (v == null || v === '') return '无'
  return String(v)
}

function readId(item: Record<string, unknown> | null): string {
  if (!item) return ''
  const id = item.Id ?? item.id
  return typeof id === 'string' && id !== '' ? id : ''
}

function openApiError(json: unknown): boolean {
  const err = asRecord(asRecord(json)?.ResponseMetadata)?.Error
  const rec = asRecord(err)
  return !!(rec && (rec.Message || rec.Code))
}

function envelopeChecks(json: unknown, action: 'GetAsset' | 'ListAssets', suffix: string): VideoCheck[] {
  const meta = asRecord(asRecord(json)?.ResponseMetadata)
  const gotAction = meta?.Action
  const version = meta?.Version
  const requestId = meta?.RequestId
  const requestIdOk = typeof requestId === 'string' && requestId.trim() !== ''
  return [
    check(`素材 Action${suffix}`, action, shown(gotAction), gotAction === action),
    check(`素材 Version${suffix}`, '2024-01-01', shown(version), version === '2024-01-01'),
    check(`素材 RequestId${suffix}`, '非空', requestIdOk ? requestId : shown(requestId), requestIdOk),
  ]
}

function statusText(status: string): string {
  if (status === 'Active') return '成功（Active）'
  return status || '无'
}

/** 单条素材字段。Processing 继续等；Failed，或 Active 但字段对不上，不再等。 */
export function videoScoreAssetItem(item: unknown, expect: VideoAssetQueryExpect): { checks: VideoCheck[]; verdict: VideoAssetQueryVerdict } {
  const rec = asRecord(item)
  const suffix = ` · ${expect.name}`
  const id = readId(rec)
  const name = rec?.Name
  const assetType = rec?.AssetType
  const groupId = rec?.GroupId
  const status = typeof rec?.Status === 'string' ? rec.Status : ''
  const url = rec?.URL
  const urlOk = typeof url === 'string' && /^https:\/\//i.test(url)
  const created = rec?.CreateTime
  const updated = rec?.UpdateTime
  const checks: VideoCheck[] = [
    check(`素材 Id${suffix}`, expect.id, id || '无', id === expect.id),
    check(`素材 Name${suffix}`, expect.name, shown(name), name === expect.name),
    check(`素材 AssetType${suffix}`, expect.assetType, shown(assetType), assetType === expect.assetType),
    check(`素材 GroupId${suffix}`, expect.groupId, shown(groupId), groupId === expect.groupId),
    check(`素材状态${suffix}`, 'Active', statusText(status), status === 'Active'),
    check(`素材 URL${suffix}`, 'https', urlOk ? String(url) : shown(url), urlOk),
    check(`素材创建时间${suffix}`, 'RFC3339', shown(created), videoAssetRfc3339(created)),
    check(`素材更新时间${suffix}`, 'RFC3339', shown(updated), videoAssetRfc3339(updated)),
  ]
  let verdict: VideoAssetQueryVerdict = 'fail'
  if (status === 'Processing') verdict = 'wait'
  else if (status === 'Failed') verdict = 'fail'
  else if (status === 'Active') verdict = checks.every(c => c.pass) ? 'ready' : 'fail'
  return { checks, verdict }
}

export function videoScoreGetAsset(json: unknown, expect: VideoAssetQueryExpect): { checks: VideoCheck[]; verdict: VideoAssetQueryVerdict } {
  const suffix = ` · ${expect.name}`
  const head = envelopeChecks(json, 'GetAsset', suffix)
  const item = videoScoreAssetItem(resultOf(json), expect)
  const checks = [...head, ...item.checks]
  if (openApiError(json) || head.some(c => !c.pass)) return { checks, verdict: 'fail' }
  return { checks, verdict: item.verdict }
}

function listItems(json: unknown): Record<string, unknown>[] {
  const result = resultOf(json)
  const items = result?.Items ?? result?.items
  if (!Array.isArray(items)) return []
  return items.map(asRecord).filter((x): x is Record<string, unknown> => !!x)
}

export function videoScoreListAssets(json: unknown, expected: VideoAssetQueryExpect[]): { checks: VideoCheck[]; verdict: VideoAssetQueryVerdict } {
  const checks = envelopeChecks(json, 'ListAssets', '')
  const items = listItems(json)
  const totalRaw = resultOf(json)?.TotalCount
  const total = typeof totalRaw === 'number' ? totalRaw : null
  const overflow = total != null && total > items.length
  let verdict: VideoAssetQueryVerdict = 'ready'
  const missing: string[] = []
  for (const expect of expected) {
    const item = items.find(row => readId(row) === expect.id)
    if (!item) {
      missing.push(expect.name)
      checks.push(check(`素材 Id · ${expect.name}`, expect.id, '列表中没有', false))
      if (verdict !== 'fail') verdict = 'wait'
      continue
    }
    const scored = videoScoreAssetItem(item, expect)
    checks.push(...scored.checks)
    if (scored.verdict === 'fail') verdict = 'fail'
    else if (scored.verdict === 'wait' && verdict !== 'fail') verdict = 'wait'
  }
  if (missing.length && overflow) {
    checks.push(check('素材列表', '本页包含本轮素材', `TotalCount ${total} 大于本页 ${items.length}，未找到 ${missing.join('、')}`, false))
    verdict = 'fail'
  }
  if (openApiError(json) || checks.slice(0, 3).some(c => !c.pass)) verdict = 'fail'
  if (verdict === 'ready' && checks.some(c => !c.pass)) verdict = 'fail'
  return { checks, verdict }
}

export function videoAssetQueryChecks(evidence: {
  action: 'GetAsset' | 'ListAssets'
  responses: unknown[]
  expected: VideoAssetQueryExpect[]
}): VideoCheck[] {
  if (evidence.action === 'ListAssets') return videoScoreListAssets(evidence.responses[0], evidence.expected).checks
  const checks: VideoCheck[] = []
  evidence.expected.forEach((expect, i) => {
    if (i >= evidence.responses.length) return
    checks.push(...videoScoreGetAsset(evidence.responses[i], expect).checks)
  })
  return checks
}
