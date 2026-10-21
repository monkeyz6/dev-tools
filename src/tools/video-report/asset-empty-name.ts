import type { VideoCheck } from './types.ts'

/** CreateAsset 不传 Name 时，拿官方响应形状做对照的输入 */
export interface VideoAssetEmptyNameInput {
  requestBody: unknown
  createJson: unknown
  /** 未发 GetAsset 时为 null */
  getJson: unknown | null
  groupId: string
  assetType: string
  /** 创建没有 Id，或创建响应已是错误，因而没有轮询 */
  queried: boolean
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function resultOf(json: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(json)?.Result)
}

function metaOf(json: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(json)?.ResponseMetadata)
}

function check(name: string, target: string, actual: string, pass: boolean): VideoCheck {
  return { name, target, actual, pass }
}

function shown(v: unknown): string {
  if (v == null || v === '') return '无'
  return String(v)
}

/** Result.Id，兼容网关写成 id。空字符串不算有 Id */
function readAssetId(result: Record<string, unknown> | null): string {
  if (!result) return ''
  const id = result.Id ?? result.id
  return typeof id === 'string' && id !== '' ? id : ''
}

/** 请求里出现了非空 Name（含纯空格）。缺字段、null、"" 都不算 */
export function videoAssetEmptyNameRequestHasName(body: unknown): boolean {
  const rec = asRecord(body)
  if (!rec || !Object.prototype.hasOwnProperty.call(rec, 'Name')) return false
  const name = rec.Name
  if (name == null) return false
  if (typeof name === 'string') return name !== ''
  return true
}

/**
 * 只服务「素材登记 · 不传 Name」。
 * CreateAsset 核对 ResponseMetadata 与 Result.Id。
 * 轮询过 GetAsset 时再核对 Id / AssetType / GroupId / Status / URL，以及 Name 可以缺失或为空。
 * 创建没有 Id 时不判 Get 侧。
 */
export function videoAssetEmptyNameChecks(input: VideoAssetEmptyNameInput): VideoCheck[] {
  const checks: VideoCheck[] = []
  if (videoAssetEmptyNameRequestHasName(input.requestBody)) {
    checks.push(check('素材请求 Name', '不传 Name', shown(asRecord(input.requestBody)?.Name), false))
  }

  const meta = metaOf(input.createJson)
  const action = meta?.Action
  checks.push(check('素材 Action', 'CreateAsset', shown(action), action === 'CreateAsset'))
  const version = meta?.Version
  checks.push(check('素材 Version', '2024-01-01', shown(version), version === '2024-01-01'))
  const requestId = meta?.RequestId
  const requestIdOk = typeof requestId === 'string' && requestId.trim() !== ''
  checks.push(check('素材 RequestId', '非空', requestIdOk ? requestId : shown(requestId), requestIdOk))

  const createId = readAssetId(resultOf(input.createJson))
  if (!createId || !input.queried) {
    checks.push(check('素材 Id', 'Result.Id 非空', createId || '无', !!createId))
    return checks
  }

  const got = resultOf(input.getJson)
  const getId = readAssetId(got)
  checks.push(check('素材 Id', `非空，且 GetAsset.Id 为 ${createId}`, getId || '无', getId === createId))

  const assetType = got?.AssetType
  checks.push(check('素材 AssetType', input.assetType, shown(assetType), assetType === input.assetType))
  const groupId = got?.GroupId
  checks.push(check('素材 GroupId', input.groupId, shown(groupId), groupId === input.groupId))
  const status = got?.Status
  checks.push(check('素材状态', 'Active', shown(status), status === 'Active'))

  const url = got?.URL
  const urlOk = typeof url === 'string' && /^https?:\/\//i.test(url)
  checks.push(check('素材 URL', 'http(s) 非空', urlOk ? url : shown(url), urlOk))

  const hasName = !!got && Object.prototype.hasOwnProperty.call(got, 'Name')
  const name = got?.Name
  let nameActual = '（无此字段）'
  let namePass = true
  if (!got) {
    nameActual = '无'
    namePass = false
  } else if (!hasName || name == null) {
    nameActual = hasName ? 'null' : '（无此字段）'
    namePass = true
  } else {
    nameActual = name === '' ? '""' : String(name)
    namePass = name === ''
  }
  checks.push(check('素材 Name', '缺失或空字符串', nameActual, namePass))
  return checks
}
