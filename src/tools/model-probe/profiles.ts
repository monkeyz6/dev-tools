import type { OriginDecision, ProbeSignals } from './origin'
import { probeErrorMessage } from './protocol'

export type ProbeFamilyId = 'gpt' | 'claude' | 'unknown'
export type GptVariant = 'reasoning' | 'classic' | null
export type ProbeProfileId = 'classic' | 'reasoning' | 'codex' | 'claude' | 'unknown'

export interface FamilyDecision {
  family: ProbeFamilyId
  variant: GptVariant
  /** 只来自请求里的模型名。行为信号可以写进依据，但不能把经典档或未知名字升成推理档。 */
  profile: ProbeProfileId
  label: string
  conflict: boolean
  reasons: string[]
}

export type ProbeRunStatus = 'passed' | 'failed' | 'abnormal' | 'unsupported' | 'skipped' | 'expected' | 'untested'

const GPT_REASONING_RE = /^(?:gpt-5(?:[.-]|$)|gpt-6(?:[.-]|$)|o1(?:[.-]|$)|o3(?:[.-]|$)|o4(?:[.-]|$))/i
const GPT_CLASSIC_RE = /^(?:gpt-4o|gpt-4\.1)(?:-\d{4}-\d{2}-\d{2})?$/i
const GPT_WEAK_RE = /^gpt-/i
const CLAUDE_RE = /^claude-/i

export const normalizeProbeFamilyName = (model: string): string => {
  let s = String(model || '').trim().toLowerCase()
  const slash = s.lastIndexOf('/')
  if (slash >= 0) s = s.slice(slash + 1)
  return s
}

/** 名单归类。带日期的快照与主 id 同一档；不在名单里的名字是 unknown，不套预期拒绝。 */
export const profileFromName = (model: string): ProbeProfileId => {
  const name = normalizeProbeFamilyName(model)
  if (!name) return 'unknown'
  if (CLAUDE_RE.test(name)) return 'claude'
  if (name.includes('codex')) return 'codex'
  if (GPT_CLASSIC_RE.test(name)) return 'classic'
  if (GPT_REASONING_RE.test(name)) return 'reasoning'
  return 'unknown'
}

export const nameSuggestsGpt = (model: string): boolean => {
  const name = normalizeProbeFamilyName(model)
  const profile = profileFromName(name)
  return profile === 'classic' || profile === 'reasoning' || profile === 'codex' || GPT_WEAK_RE.test(name)
}

export type GptReasoningErrorKind = 'max_completion' | 'temperature' | 'top_p' | 'tool_effort'

export const gptReasoningErrorKind = (message: string): GptReasoningErrorKind | null => {
  const e = probeErrorMessage(message).toLowerCase()
  if (/max[_-]?tokens/.test(e) && /max[_-]?completion[_-]?tokens/.test(e)) return 'max_completion'
  if (/temperature/.test(e) && /only the default|does not support|is not supported/.test(e)) return 'temperature'
  if (/top[_-]p/.test(e) && /not supported|unsupported|is not supported/.test(e)) return 'top_p'
  if (/reasoning_effort/.test(e) && /tool|function/.test(e)) return 'tool_effort'
  return null
}

/** Anthropic 基础体带的 max_tokens 被上游要求改成 max_completion_tokens。 */
export const anthropicBaseBlocked = (errorText: string): boolean =>
  gptReasoningErrorKind(errorText) === 'max_completion'

const uniq = (items: string[]): string[] => [...new Set(items.filter(Boolean))]

type NameKind = 'codex' | 'reasoning' | 'classic' | 'weak' | 'claude'

const nameKind = (name: string): NameKind | null => {
  const profile = profileFromName(name)
  if (profile === 'claude') return 'claude'
  if (profile === 'codex') return 'codex'
  if (profile === 'classic') return 'classic'
  if (profile === 'reasoning') return 'reasoning'
  if (GPT_WEAK_RE.test(name)) return 'weak'
  return null
}

const nameReason = (name: string, kind: NameKind): string => {
  if (kind === 'claude') return `强名称 ${name} 属于 Claude`
  if (kind === 'codex') return `强名称 ${name} 属于 Codex 产品线`
  if (kind === 'reasoning') return `强名称 ${name} 属于 GPT 推理系列`
  if (kind === 'classic') return `强名称 ${name} 属于 GPT 经典系列`
  return `弱名称 ${name} 以 gpt- 开头`
}

export function decideFamily(signals: ProbeSignals): FamilyDecision {
  const requestProfile = profileFromName(signals.requestModel)
  const names = uniq([signals.requestModel, ...signals.responseModels].map(normalizeProbeFamilyName))
  const named = names
    .map(name => ({ name, kind: nameKind(name) }))
    .filter((x): x is { name: string; kind: NameKind } => !!x.kind)

  const reasons = named.map(x => nameReason(x.name, x.kind))
  const kinds = new Set(named.map(x => x.kind))
  const errorKinds = new Set(signals.errors.map(gptReasoningErrorKind).filter((x): x is GptReasoningErrorKind => !!x))

  if (errorKinds.has('max_completion')) reasons.push('错误要求改用 max_completion_tokens')
  if (errorKinds.has('temperature')) reasons.push('temperature 只允许默认值 1')
  if (errorKinds.has('top_p')) reasons.push('拒绝 top_p')
  if (errorKinds.has('tool_effort')) reasons.push('Chat 上工具与 reasoning_effort 互斥')
  if (signals.flags.reasoningEffort) reasons.push('成功响应含 reasoning.effort')
  if (signals.flags.reasoningTokens) reasons.push('用量含 reasoning_tokens')

  const gptBehavior = errorKinds.size > 0 || signals.flags.reasoningEffort || signals.flags.reasoningTokens
  const claudeBehavior = signals.basic.anthropic === 'ok' && signals.flags.anthropicNative && !errorKinds.has('max_completion')
  if (claudeBehavior) reasons.push('Anthropic 基础请求成功，响应含 stop_reason 或 input_tokens')
  if (requestProfile === 'classic' && gptBehavior) reasons.push('名字属于 GPT 经典系列，但响应表现像推理模型')

  const claudeName = kinds.has('claude')
  const gptName = kinds.has('reasoning') || kinds.has('classic') || kinds.has('codex') || kinds.has('weak')
  const conflict = (claudeName && gptBehavior) || (gptName && claudeBehavior && !gptBehavior) || (claudeBehavior && gptBehavior)

  const done = (
    family: ProbeFamilyId,
    variant: GptVariant,
    profile: ProbeProfileId,
    label: string,
    conflictFlag: boolean,
  ): FamilyDecision => ({ family, variant, profile, label, conflict: conflictFlag, reasons: uniq(reasons) })

  if (conflict) return done('unknown', null, 'unknown', '不确定', true)

  if (requestProfile === 'codex') return done('gpt', 'reasoning', 'codex', 'Codex 产品线', false)
  if (requestProfile === 'classic') return done('gpt', 'classic', 'classic', 'GPT 经典', false)
  if (requestProfile === 'reasoning') return done('gpt', 'reasoning', 'reasoning', 'GPT 推理', false)

  if (gptBehavior || gptName) {
    const variant: GptVariant = (gptBehavior || kinds.has('reasoning')) ? 'reasoning' : kinds.has('classic') ? 'classic' : null
    return done('gpt', variant, 'unknown', variant === 'reasoning' ? 'GPT 推理' : 'GPT', false)
  }

  if (requestProfile === 'claude' || claudeName || claudeBehavior) {
    return done('claude', null, requestProfile === 'claude' ? 'claude' : 'unknown', 'Claude', false)
  }

  if (!reasons.length) reasons.push('模型名和响应里都没有 GPT / Claude 的稳定特征')
  return done('unknown', null, 'unknown', '不确定', false)
}

export type ExpectedRewrite = { status: 'expected' | 'abnormal'; detail: string }

const reasoningLike = (profile: ProbeProfileId): boolean => profile === 'reasoning' || profile === 'codex'

/** 协议本身不存在：404，或错误明确说该端点/模型不支持。只用于基础协议请求。 */
export const protocolLooksAbsent = (status: number | null, message: string): boolean => {
  if (status === 404) return true
  const e = probeErrorMessage(message).toLowerCase()
  return /not supported|unsupported|does not support|unknown endpoint|no such endpoint/.test(e)
}

/**
 * 基础协议这一发怎么收。
 * block：协议不存在，同协议后面的用例不再发。
 * reject-success：这个产品线不该接受该协议，但返回了 2xx。
 * 记成符合预期还是异常，由 scoreProtocolGate 看「预期拒绝」是否勾选。
 */
export function basicProtocolGate(
  profile: ProbeProfileId,
  format: string,
  ok: boolean,
  status: number | null,
  message: string,
  officialAnthropic: boolean,
): 'block' | 'reject-success' | null {
  if (profile === 'codex' && format === 'chat') {
    if (ok) return 'reject-success'
    if (protocolLooksAbsent(status, message)) return 'block'
    return null
  }
  if (profile === 'claude' && officialAnthropic && (format === 'chat' || format === 'responses') && !ok && protocolLooksAbsent(status, message)) {
    return 'block'
  }
  return null
}

/** 勾选「预期拒绝」时，block 记符合预期，不该成功的 2xx 记异常。未勾选时 block 只记不支持。 */
export function scoreProtocolGate(
  gate: 'block' | 'reject-success' | null,
  scoreExpected: boolean,
): 'expected' | 'abnormal' | 'unsupported' | null {
  if (gate === 'block') return scoreExpected ? 'expected' : 'unsupported'
  if (gate === 'reject-success') return scoreExpected ? 'abnormal' : null
  return null
}

/** 推理档和未知名字改用 max_completion_tokens 再测；经典档和 Claude 不替换。 */
export function anthropicCapAction(profile: ProbeProfileId, errorText: string): 'retry' | 'stop' | 'none' {
  if (!anthropicBaseBlocked(errorText)) return 'none'
  if (profile === 'classic' || profile === 'claude') return 'stop'
  return 'retry'
}

/** 重试成功后，max_tokens 这一行沿用第一次特地请求的结论，不再塞进参数组合。勾选「预期拒绝」才记符合预期。 */
export function anthropicMaxTokensConclusion(
  profile: ProbeProfileId,
  errorText: string,
  scoreExpected = true,
): { status: 'expected' | 'unsupported'; detail: string } | null {
  if (!anthropicBaseBlocked(errorText)) return null
  if (reasoningLike(profile)) {
    if (!scoreExpected) return { status: 'unsupported', detail: errorText }
    return { status: 'expected', detail: `符合预期：该模型不接受 Anthropic 的 max_tokens，应使用 max_completion_tokens。${errorText}` }
  }
  if (profile === 'unknown') return { status: 'unsupported', detail: errorText }
  return null
}

/** 只在勾选「预期拒绝」之后调用。对上的报错改记符合预期；本该拒绝却成功改记异常。 */
export function reclassifyExpected(
  key: string,
  result: { status: string; detail: string; format?: string; repro?: { status: number | null } | null },
  family: FamilyDecision,
  origin: Pick<OriginDecision, 'access'>,
): ExpectedRewrite | null {
  if (family.conflict) return null
  const profile = family.profile
  const at = key.indexOf('@')
  const param = at > 0 ? key.slice(0, at) : key
  const format = result.format || (at > 0 ? key.slice(at + 1) : '')
  const message = probeErrorMessage(result.detail)

  if (result.status === 'passed' && reasoningLike(profile) && (param === 'temperature' || param === 'top_p')) {
    return { status: 'abnormal', detail: `异常：GPT 推理模型不应接受 ${param}，但请求成功了。${result.detail}` }
  }
  if (result.status === 'passed' && profile === 'claude' && format === 'anthropic' && param === 'reasoning_effort') {
    return { status: 'abnormal', detail: `异常：Claude 不使用 OpenAI 的 reasoning_effort，但请求成功了。${result.detail}` }
  }

  if (result.status !== 'failed' && result.status !== 'unsupported') return null

  if (reasoningLike(profile)) {
    if (param === 'temperature' && gptReasoningErrorKind(message) === 'temperature') {
      return { status: 'expected', detail: `符合预期：GPT 推理模型不接受该 temperature。${result.detail}` }
    }
    if (param === 'top_p' && gptReasoningErrorKind(message) === 'top_p') {
      return { status: 'expected', detail: `符合预期：GPT 推理模型不接受 top_p。${result.detail}` }
    }
    if (format === 'chat' && (param === 'tool_calling' || param === 'reasoning_effort') && gptReasoningErrorKind(message) === 'tool_effort') {
      return { status: 'expected', detail: `符合预期：Chat 上工具与 reasoning_effort 不能同时使用。${result.detail}` }
    }
    if (format === 'anthropic' && param === 'max_tokens' && gptReasoningErrorKind(message) === 'max_completion') {
      return { status: 'expected', detail: `符合预期：该模型不接受 Anthropic 的 max_tokens，应使用 max_completion_tokens。${result.detail}` }
    }
  }

  if (profile === 'codex' && format === 'chat' && param === 'chat-basic' && protocolLooksAbsent(result.repro?.status ?? null, message)) {
    return { status: 'expected', detail: `符合预期：Codex 产品线不提供 Chat Completions。${result.detail}` }
  }

  if (profile === 'claude' && format === 'anthropic' && param === 'reasoning_effort') {
    if (/reasoning_effort|unknown parameter|unexpected|not supported|invalid/i.test(message) && !anthropicBaseBlocked(message)) {
      return { status: 'expected', detail: `符合预期：Claude 不使用 OpenAI 的 reasoning_effort。${result.detail}` }
    }
  }

  if (profile === 'claude' && origin.access.id === 'direct' && (format === 'chat' || format === 'responses') && result.repro?.status === 404) {
    const protocol = format === 'chat' ? 'Chat Completions' : 'Responses'
    return { status: 'expected', detail: `符合预期：Claude 官方不提供 ${protocol}。${result.detail}` }
  }

  return null
}

/** 父行：失败优先，其次异常；通过盖过符合预期和未测；未测单独不会变成失败。 */
export function aggregateProbeStatus(statuses: string[]): ProbeRunStatus {
  if (!statuses.length) return 'skipped'
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('abnormal')) return 'abnormal'
  if (statuses.includes('passed')) return 'passed'
  if (statuses.includes('expected')) return 'expected'
  if (statuses.includes('unsupported')) return 'unsupported'
  if (statuses.includes('untested')) return 'untested'
  return 'skipped'
}
