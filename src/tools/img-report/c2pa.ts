// 把 c2pa-web 读出的 manifest store 收成一条可落库的结论。
// 不 import WASM：单测和界面都只依赖这份纯函数。通过率不读这里。

import type { Settings } from '@contentauth/c2pa-web'
import type { ImgC2paResult, ImgC2paSource, ImgC2paTrust } from './types'

export interface ImgC2paSummarizeOptions {
  /** 本次是否成功载入了签名信任列表。没载入时不核信任，结论是「未核对」。 */
  trustChecked: boolean
}

/**
 * 签名证书允许的 EKU，与 c2pa-rs 内置的 store.cfg 一致。
 * 必须随 Context 传下去：只要 settings 里带了 trust 段，c2pa-rs 就不再用内置白名单，
 * 白名单为空时合法证书会被报成 signingCredential.invalid「certificate missing required EKU」，信任链也跟着验不过。
 */
export const IMG_C2PA_EKU_CONFIG = [
  '1.3.6.1.5.5.7.3.4',
  '1.3.6.1.5.5.7.3.36',
  '1.3.6.1.5.5.7.3.8',
  '1.3.6.1.5.5.7.3.9',
  '1.3.6.1.4.1.311.76.59.1.9',
  '1.3.6.1.4.1.62558.2.1',
].join('\n') + '\n'

/** 读清单用的 settings。签名列表没拉到时只验签与哈希，不核信任。 */
export function imgC2paSettings(signerPem: string | null): Settings {
  const trustChecked = !!signerPem
  return {
    verify: {
      verifyTrust: trustChecked,
      verifyTimestampTrust: trustChecked,
      verifyAfterReading: true,
      ocspFetch: false,
      remoteManifestFetch: false,
    },
    trust: {
      trustConfig: IMG_C2PA_EKU_CONFIG,
      ...(signerPem ? { trustAnchors: signerPem } : {}),
    },
  }
}

const EMPTY: ImgC2paResult = {
  status: 'none',
  trust: 'na',
  source: 'unknown',
  sourceLabel: '',
  issuer: null,
  softwareAgent: null,
  claimGenerator: null,
  actionLabel: null,
  generatedAt: null,
  codes: [],
  note: null,
}

/** 不影响「签名是否完整」的状态码：未入列表是信任结论，不是内容被改过。 */
const UNTRUSTED_CODES = new Set(['signingCredential.untrusted', 'timeStamp.untrusted'])

const CODE_TEXT: Record<string, string> = {
  'signingCredential.untrusted': '签名证书没有链到信任列表',
  'signingCredential.invalid': '签名证书不符合 C2PA 要求',
  'signingCredential.expired': '签名证书已过期',
  'signingCredential.revoked': '签名证书已吊销',
  'signingCredential.ocsp.revoked': '签名证书已吊销',
  'claimSignature.mismatch': '声明签名与内容不符',
  'claimSignature.missing': '缺少声明签名',
  'claimSignature.outsideValidity': '签名时证书不在有效期内',
  'assertion.dataHash.mismatch': '图像数据与签名时不一致',
  'assertion.bmffHash.mismatch': '媒体数据与签名时不一致',
  'assertion.boxesHash.mismatch': '图像数据与签名时不一致',
  'assertion.hashedURI.mismatch': '断言内容被改动',
  'assertion.missing': '缺少声明引用的断言',
  'assertion.undeclared': '存在未声明的断言',
  'assertion.multipleHardBindings': '存在多个硬绑定',
  'claim.missing': '缺少声明',
  'claim.malformed': '声明格式错误',
  'manifest.inaccessible': '清单无法访问',
  'manifest.multipleParents': '清单有多个父素材',
  'timeStamp.untrusted': '时间戳证书没有链到信任列表',
  'timeStamp.mismatch': '时间戳与签名不匹配',
  'timeStamp.malformed': '时间戳格式错误',
  'timeStamp.outsideValidity': '时间戳证书不在有效期内',
  'general.error': '验证出错',
}

export function imgC2paCodeText(code: string): string {
  return CODE_TEXT[code] || code
}

export function imgC2paPending(): ImgC2paResult {
  return { ...EMPTY, status: 'pending' }
}

/** 落库时还是「验真中」、页面却在出结论前被刷新或关闭。原图已不在，无法补验。 */
export function imgC2paIncomplete(): ImgC2paResult {
  return { ...EMPTY, status: 'incomplete', note: '页面在验真完成前被刷新或关闭' }
}

export function imgC2paUnavailable(note: string): ImgC2paResult {
  return { ...EMPTY, status: 'unavailable', note: clip(note) }
}

export function imgC2paUnreadable(note: string): ImgC2paResult {
  return { ...EMPTY, status: 'unreadable', note: clip(note) }
}

/**
 * @param store reader.manifestStore()
 * @param cr reader.crJson()，只用来补证书细节（签发 CA、有效期、时间戳证书），缺了不影响结论
 */
export function imgSummarizeC2pa(store: unknown, opts: ImgC2paSummarizeOptions, cr?: unknown): ImgC2paResult {
  const manifest = activeManifest(store)
  if (!manifest) return { ...EMPTY }

  const issuer = issuerOf(manifest)
  const signerName = signerNameOf(manifest)
  const { success, informational, failure } = codesOf(store)
  const state = text(field(store, 'validation_state', 'validationState'))
  // 只要 trustConfig 配对了，c2pa-rs 的 validation_state 就是可靠的三态：
  // Trusted / Valid（仅未入列表或未核信任）/ Invalid。缺这个字段的旧结构才自己数失败码。
  const invalid = state === 'Invalid' || state === 'Valid' || state === 'Trusted'
    ? state === 'Invalid'
    : failure.some(code => !UNTRUSTED_CODES.has(code))
  const trust: ImgC2paTrust = state === 'Trusted' || (!state && success.includes('signingCredential.trusted'))
    ? 'trusted'
    : opts.trustChecked ? 'untrusted' : 'unchecked'
  const { source, sourceLabel } = sourceOf(issuer, signerName)
  const crSig = crSignature(cr, text(field(store, 'active_manifest', 'activeManifest')))

  return {
    status: invalid ? 'invalid' : 'valid',
    trust,
    source,
    sourceLabel,
    issuer,
    signerName,
    issuerCa: crSig.issuerCa,
    certValidTo: crSig.validTo,
    tsaName: crSig.tsaName,
    tsaTrusted: crSig.tsaName && opts.trustChecked ? tsaTrustedOf(success, informational, failure) : null,
    integrity: integrityOf(success, failure),
    softwareAgent: softwareAgentOf(manifest),
    claimGenerator: claimGeneratorOf(manifest),
    actionLabel: actionLabelOf(manifest),
    generatedAt: generatedAtOf(manifest),
    codes: failure.slice(0, 8),
    note: null,
  }
}

export function imgC2paHeadline(result: ImgC2paResult): string {
  switch (result.status) {
    case 'pending': return '验真中'
    case 'incomplete': return '验真未完成'
    case 'none': return '无凭证'
    case 'unavailable': return '无法读取原图'
    case 'unreadable': return '读清单失败'
    case 'invalid': return '签名无效'
    case 'valid': {
      // 「官方」只给链到信任列表的证书。组织名是 CA 背书过的，自报的生成器文案不参与。
      if (result.trust === 'trusted') return `${trustedName(result)} · 可信`
      return `未验证 · 证书自称 ${claimedName(result)}`
    }
  }
}

export function imgC2paTone(result: ImgC2paResult): 'ok' | 'warn' | 'err' | 'muted' {
  if (result.status === 'invalid') return 'err'
  if (result.status === 'valid' && result.trust === 'trusted') return 'ok'
  if (result.status === 'valid' || result.status === 'unavailable' || result.status === 'unreadable') return 'warn'
  return 'muted'
}

function trustedName(result: ImgC2paResult): string {
  switch (result.source) {
    case 'openai': return 'OpenAI 官方'
    case 'azure': return 'Azure'
    case 'google': return 'Google'
    default: return result.issuer || result.signerName || '其他'
  }
}

function claimedName(result: ImgC2paResult): string {
  switch (result.source) {
    case 'openai': return 'OpenAI'
    case 'azure': return 'Microsoft'
    case 'google': return 'Google'
    default: return result.issuer || result.signerName || '未知签名者'
  }
}

/**
 * 签名证书 O 与官方主体的对应，必须全等。子串匹配会把「OpenAI Proxy Ltd」这类可信证书也认成官方。
 * 只登记拿到过真实样本的主体；Azure / Google 的旧记录仍按存下的 source 渲染。
 */
const KNOWN_SIGNERS: Record<string, { source: ImgC2paSource; sourceLabel: string }> = {
  'OpenAI OpCo, LLC': { source: 'openai', sourceLabel: 'OpenAI' },
}

function sourceOf(issuer: string | null, signerName: string | null): { source: ImgC2paSource; sourceLabel: string } {
  // 只看签名证书主体。claim_generator / softwareAgent 是清单自报，任何重签者都能照抄。
  const known = issuer ? KNOWN_SIGNERS[issuer] : undefined
  if (known) return known
  if (issuer || signerName) return { source: 'other', sourceLabel: issuer || signerName || '' }
  return { source: 'unknown', sourceLabel: '' }
}

function tsaTrustedOf(success: string[], informational: string[], failure: string[]): boolean | null {
  if (informational.includes('timeStamp.untrusted') || failure.includes('timeStamp.untrusted')) return false
  if (success.includes('timeStamp.trusted')) return true
  return null
}

function integrityOf(success: string[], failure: string[]): 'match' | 'mismatch' | null {
  const hash = /^assertion\.(dataHash|bmffHash|boxesHash|collectionHash)\./
  if (failure.some(code => hash.test(code))) return 'mismatch'
  if (success.some(code => hash.test(code))) return 'match'
  return null
}

function crSignature(cr: unknown, activeLabel: string | null): { issuerCa: string | null; validTo: string | null; tsaName: string | null } {
  const out = { issuerCa: null as string | null, validTo: null as string | null, tsaName: null as string | null }
  const manifests = field(cr, 'manifests', 'manifests')
  if (!Array.isArray(manifests) || !manifests.length) return out
  const hit = manifests.find(m => activeLabel && text(field(m, 'label', 'label')) === activeLabel) ?? manifests[0]
  const sig = field(hit, 'signature', 'signature')
  const cert = field(sig, 'certificateInfo', 'certificate_info')
  out.issuerCa = text(field(field(cert, 'issuer', 'issuer'), 'CN', 'CN'))
  out.validTo = text(field(field(cert, 'validity', 'validity'), 'notAfter', 'not_after'))
  const tsa = field(field(sig, 'timeStampInfo', 'time_stamp_info'), 'certificateInfo', 'certificate_info')
  out.tsaName = text(field(field(tsa, 'subject', 'subject'), 'CN', 'CN'))
  return out
}

function activeManifest(store: unknown): Record<string, unknown> | null {
  if (!store || typeof store !== 'object') return null
  const manifests = field(store, 'manifests', 'manifests')
  if (manifests && typeof manifests === 'object') {
    const map = manifests as Record<string, unknown>
    const key = text(field(store, 'active_manifest', 'activeManifest'))
    const hit = key && map[key] && typeof map[key] === 'object' ? map[key] as Record<string, unknown> : null
    if (hit) return hit
    const keys = Object.keys(map)
    const last = keys.length ? map[keys[keys.length - 1]] : null
    if (last && typeof last === 'object') return last as Record<string, unknown>
  }
  if (field(store, 'signature_info', 'signatureInfo') || field(store, 'assertions', 'assertions') || field(store, 'claim_generator', 'claimGenerator')) {
    return store as Record<string, unknown>
  }
  return null
}

function issuerOf(manifest: Record<string, unknown>): string | null {
  const sig = field(manifest, 'signature_info', 'signatureInfo')
  if (!sig || typeof sig !== 'object') return null
  return text(field(sig, 'issuer', 'issuer'))
}

function signerNameOf(manifest: Record<string, unknown>): string | null {
  const sig = field(manifest, 'signature_info', 'signatureInfo')
  if (!sig || typeof sig !== 'object') return null
  return text(field(sig, 'common_name', 'commonName'))
}

function claimGeneratorOf(manifest: Record<string, unknown>): string | null {
  const info = field(manifest, 'claim_generator_info', 'claimGeneratorInfo')
  if (Array.isArray(info)) {
    const parts = info.map(item => {
      if (!item || typeof item !== 'object') return ''
      const name = text(field(item, 'name', 'name'))
      const version = text(field(item, 'version', 'version'))
      return [name, version].filter(Boolean).join(' ')
    }).filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  return text(field(manifest, 'claim_generator', 'claimGenerator'))
}

function softwareAgentOf(manifest: Record<string, unknown>): string | null {
  const names: string[] = []
  for (const action of actionsOf(manifest)) {
    const agent = field(action, 'softwareAgent', 'software_agent')
    const name = agentName(agent)
    if (name && !names.includes(name)) names.push(name)
  }
  return names.length ? clip(names.join('、')) : null
}

function actionLabelOf(manifest: Record<string, unknown>): string | null {
  for (const action of actionsOf(manifest)) {
    const source = [
      text(field(action, 'digitalSourceType', 'digital_source_type')),
      nestedSource(action),
    ].filter(Boolean).join(' ')
    if (/trainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic|compositeWithTrainedAlgorithmicMedia/i.test(source)) return 'AI 生成'
  }
  return null
}

function generatedAtOf(manifest: Record<string, unknown>): string | null {
  const sig = field(manifest, 'signature_info', 'signatureInfo')
  const signed = sig && typeof sig === 'object' ? text(field(sig, 'time', 'time')) : null
  if (signed) return signed
  for (const action of actionsOf(manifest)) {
    const when = text(field(action, 'when', 'when'))
    if (when) return when
  }
  return null
}

function actionsOf(manifest: Record<string, unknown>): Record<string, unknown>[] {
  const assertions = field(manifest, 'assertions', 'assertions')
  if (!Array.isArray(assertions)) return []
  const out: Record<string, unknown>[] = []
  for (const assertion of assertions) {
    if (!assertion || typeof assertion !== 'object') continue
    const label = text(field(assertion, 'label', 'label')) || ''
    if (!label.startsWith('c2pa.actions')) continue
    const data = field(assertion, 'data', 'data')
    const actions = data && typeof data === 'object' ? field(data, 'actions', 'actions') : null
    if (!Array.isArray(actions)) continue
    for (const action of actions) {
      if (action && typeof action === 'object') out.push(action as Record<string, unknown>)
    }
  }
  return out
}

/**
 * 只取当前清单自己的结果。顶层 validation_status 还混着素材（ingredient）的失败，
 * 只有拿不到 validation_results.activeManifest 的旧结构才退回去读它。
 */
function codesOf(store: unknown): { success: string[]; informational: string[]; failure: string[] } {
  const success: string[] = []
  const informational: string[] = []
  const failure: string[] = []
  if (!store || typeof store !== 'object') return { success, informational, failure }
  const results = field(store, 'validation_results', 'validationResults')
  const active = results && typeof results === 'object' ? field(results, 'activeManifest', 'active_manifest') : null
  if (active && typeof active === 'object') {
    pushCodes(field(active, 'success', 'success'), success)
    pushCodes(field(active, 'informational', 'informational'), informational)
    pushCodes(field(active, 'failure', 'failure'), failure)
  } else {
    const list = field(store, 'validation_status', 'validationStatus')
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        const code = text(field(item, 'code', 'code'))
        if (!code) continue
        if (field(item, 'success', 'success') === true) success.push(code)
        else failure.push(code)
      }
    }
  }
  return { success: unique(success), informational: unique(informational), failure: unique(failure) }
}

function pushCodes(list: unknown, into: string[]) {
  if (!Array.isArray(list)) return
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const code = text(field(item, 'code', 'code'))
    if (code) into.push(code)
  }
}

function nestedSource(action: Record<string, unknown>): string | null {
  const parameters = field(action, 'parameters', 'parameters')
  if (!parameters || typeof parameters !== 'object') return null
  return text(field(parameters, 'digitalSourceType', 'digital_source_type'))
}

function agentName(agent: unknown): string | null {
  if (typeof agent === 'string') return text(agent)
  if (!agent || typeof agent !== 'object') return null
  const name = text(field(agent, 'name', 'name'))
  const version = text(field(agent, 'version', 'version'))
  if (!name) return null
  return version ? `${name} ${version}` : name
}

function field(obj: unknown, snake: string, camel: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const rec = obj as Record<string, unknown>
  if (rec[snake] != null) return rec[snake]
  return rec[camel]
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function unique(list: string[]): string[] {
  const out: string[] = []
  for (const item of list) if (!out.includes(item)) out.push(item)
  return out
}

function clip(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 240 ? trimmed.slice(0, 240) : trimmed
}
