import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { museEncryptedBlobs, museSpecCaseById, scoreMuseEncryptedPrefix, scoreMuseSpecReply, type MuseSpecReply } from './muse-spec.ts'
import { decideOrigin, probeOriginLogsFromResults, signalsFromProbeLogs } from './origin.ts'
import { museForcedToolChoiceBlocked } from './profiles.ts'
import { probeErrorMessage, probeParseSseBlock, probeProtocolOf, probeUsageFromSse, type ProbeFormat } from './protocol.ts'
import { builtinCaseById, oracleNativeToolEvidence } from './builtin-tools.ts'

// 两份真 muse-wonder-1.0 的探测结果（2026-10-15 / 16）裁出来的回放素材：
// ainowork 经 Vercel 式聚合网关到 Meta；OpenRouter 经本地代理到 OpenRouter 再到 Meta。
// 只留下回放要用的格子，长字符串截断，加密推理块留前 16 个字符。

interface FixtureCell {
  status: string
  detail: string
  format?: ProbeFormat
  usage?: { input: number | null } | null
  repro?: { url?: string; status?: number | null; body?: unknown; responseBody?: unknown } | null
}
interface Fixture { name: string; target: { model: string; baseUrl: string }; results: Record<string, FixtureCell> }

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/tools/model-probe/__fixtures__', `${name}.json`), 'utf8'))

const ainowork = load('muse-ainowork')
const openrouter = load('muse-openrouter')
const ctx = { code: 'MW-ABC234', beeps: 3 }

/** 用历史里留下的状态码与响应体，按新口径重新判一格。请求体是旧版的，只看响应。 */
const rescore = (fx: Fixture, key: string, id = key.slice(0, key.indexOf('@'))) => {
  const cell = fx.results[key]
  assert.ok(cell?.repro, `${fx.name} 缺 ${key}`)
  const format = (cell.format ?? key.slice(key.indexOf('@') + 1)) as ProbeFormat
  const status = cell.repro!.status as number
  const ok = status >= 200 && status < 300
  const data = cell.repro!.responseBody
  const reply: MuseSpecReply = {
    transport: 'http', status, ok, data,
    text: ok ? probeProtocolOf(format).textOf(data) : '',
    errorText: ok ? undefined : JSON.stringify((data as any)?.error ?? data),
    usage: probeProtocolOf(format).usageOf(data),
  }
  return scoreMuseSpecReply(museSpecCaseById(id)!, reply, ctx)
}

describe('回放：渠道判断', () => {
  for (const fx of [ainowork, openrouter]) {
    it(`${fx.name}：不再判成 OpenAI 官方，加密推理块命中后是 Meta 官方`, () => {
      // 旧结论确实是 OpenAI 官方（这正是要修的误判）
      assert.equal((fx as any).verdict.upstream.label, 'OpenAI 官方')
      const origin = decideOrigin(signalsFromProbeLogs({
        requestModel: fx.target.model,
        baseUrl: fx.target.baseUrl,
        logs: probeOriginLogsFromResults(fx.results as any),
      }))
      assert.equal(origin.upstream.label, 'Meta 官方', origin.upstream.reasons.join('|'))
      assert.match(origin.upstream.reasons[0], /加密推理块都以 Q-PaDg 开头/)
      assert.ok(origin.upstream.reasons.every(r => !/system_fingerprint|chatcmpl/.test(r)), origin.upstream.reasons.join('|'))
    })
  }

  it('ainowork 的 system_fingerprint 是网关随机生成的 base36，不算 OpenAI 证据', () => {
    const signals = signalsFromProbeLogs({ requestModel: 'muse-wonder-1.0', baseUrl: ainowork.target.baseUrl, logs: probeOriginLogsFromResults(ainowork.results as any) })
    assert.equal(signals.flags.systemFingerprint, null)
    // 同样的响应若请求的是 gpt-5，形状仍算 OpenAI 证据（规则只对 muse 放开）
    const gpt = decideOrigin(signalsFromProbeLogs({ requestModel: 'gpt-5', baseUrl: ainowork.target.baseUrl, logs: probeOriginLogsFromResults(ainowork.results as any) }))
    assert.ok(gpt.upstream.reasons.some(r => /Chat Completions/.test(r)))
  })
})

describe('回放：约束类按新口径重判', () => {
  it('ainowork：n=2、logprobs、stop 被网关丢弃，记失败「静默丢弃」，不是异常', () => {
    for (const key of ['spec-muse-chat-n2@chat', 'spec-muse-chat-logprobs@chat']) {
      const out = rescore(ainowork, key)
      assert.equal(out.status, 'failed', key)
      assert.match(out.detail, /静默丢弃/, key)
    }
    // 旧 stop 用例的提示是 OK，回复里没有数字：看不出来
    assert.match(rescore(ainowork, 'spec-muse-chat-stop@chat').detail, /无法判断是否生效/)
  })

  it('ainowork：effort=none 仍在推理（reasoning_tokens=5），thinking disabled 缺字段看不出来', () => {
    const none = rescore(ainowork, 'spec-muse-chat-effort-none@chat')
    assert.equal(none.status, 'failed')
    assert.match(none.detail, /仍在推理，reasoning_tokens=5/)
    const disabled = rescore(ainowork, 'spec-muse-anthropic-thinking-disabled@anthropic')
    assert.equal(disabled.status, 'failed')
    assert.match(disabled.detail, /无法判断是否生效/)
  })

  it('OpenRouter：none 被拒记通过；tool_choice=required 的 400 带出 Meta 原句', () => {
    assert.equal(rescore(openrouter, 'spec-muse-chat-effort-none@chat').status, 'passed')
    assert.equal(rescore(openrouter, 'spec-muse-anthropic-thinking-disabled@anthropic').status, 'passed')
    const required = rescore(openrouter, 'spec-muse-chat-tool-required@chat')
    assert.equal(required.status, 'passed')
    assert.match(required.detail, /only `"auto"` is supported/)
    // n=2 在 OpenRouter 上同样被丢弃
    assert.match(rescore(openrouter, 'spec-muse-chat-n2@chat').detail, /静默丢弃/)
  })

  it('请求语义没变的约束格，两边都没有出现「参数真的生效」：真 muse 不会被打成异常', () => {
    // 这些用例换了提示（与工具无关 / 计数 / 问头条 / 长输出），旧响应不能拿来判「生效」
    const promptChanged = /tool-(required|none|named)|stop|web-search-options|max-output-tokens/
    for (const fx of [ainowork, openrouter]) {
      for (const key of Object.keys(fx.results).filter(k => k.startsWith('spec-muse-'))) {
        const id = key.slice(0, key.indexOf('@'))
        const spec = museSpecCaseById(id)
        if (!spec || spec.expect !== 'reject' || spec.run || promptChanged.test(id)) continue
        assert.notEqual(rescore(fx, key).status, 'abnormal', `${fx.name} ${key}`)
      }
    }
  })
})

describe('回放：通用修复', () => {
  it('OpenRouter 的工具错误藏在 metadata.raw，能认出官方原句并降级', () => {
    const err = JSON.stringify((openrouter.results['tool_calling@chat'].repro!.responseBody as any).error)
    assert.match(probeErrorMessage(err), /^only `"auto"` is supported for `tool_choice`/)
    assert.equal(museForcedToolChoiceBlocked(err, 'meta/muse-wonder'), true)
    const msgErr = JSON.stringify((openrouter.results['tool_calling@anthropic'].repro!.responseBody as any).error)
    assert.equal(museForcedToolChoiceBlocked(msgErr, 'meta/muse-wonder'), true)
  })

  it('OpenRouter 的 Responses 流式没有 event: 行，也能读到 usage 与结束事件', () => {
    const raw = String(openrouter.results['stream-true@responses'].repro!.responseBody)
    const events = raw.split(/\r?\n\r?\n/).filter(b => b.trim()).map((b, i) => probeParseSseBlock(b, i + 1))
    assert.ok(events.every(e => e.event === 'message'), '前提：没有 event: 行')
    const usage = probeUsageFromSse('responses', events)
    assert.equal(usage.input, 12)
    assert.equal(usage.output, 63)
    assert.equal(probeProtocolOf('responses').streamFinished(raw, events), true)
  })

  it('OpenRouter 的 Messages 联网由 openrouter:web_search 插件执行，记中间层代搜', () => {
    const spec = builtinCaseById('native-meta-web_search-messages')!
    const check = oracleNativeToolEvidence(openrouter.results['native-meta-web_search-messages@anthropic'].repro!.responseBody, spec)
    assert.equal(check.passed, false)
    assert.equal(check.id, 'native_tool_proxy')
    // ainowork 的 Responses 联网是真的 web_search_call
    const resp = builtinCaseById('native-meta-web_search')!
    assert.equal(oracleNativeToolEvidence(ainowork.results['native-meta-web_search@responses'].repro!.responseBody, resp).passed, true)
  })

  it('两条链路的基础请求都带 Meta 的加密推理块', () => {
    for (const fx of [ainowork, openrouter]) {
      for (const key of ['chat-basic', 'responses-basic']) {
        const blobs = museEncryptedBlobs(fx.results[key].repro!.responseBody)
        assert.ok(blobs.length > 0, `${fx.name} ${key}`)
        assert.equal(scoreMuseEncryptedPrefix(blobs).status, 'passed', `${fx.name} ${key}`)
      }
    }
  })
})
