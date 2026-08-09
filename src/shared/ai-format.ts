export type AiFmt = 'openai-chat' | 'anthropic' | 'openai-responses'

export function convertFormat(raw: string, from: AiFmt, to: AiFmt, addCache = false): string {
  let obj: Record<string, unknown>
  try { obj = JSON.parse(raw) } catch { return '// JSON 解析失败，请检查输入格式' }

  let normalized: { system?: string; messages: { role: string; content: string }[]; model?: string; maxTokens?: number; temperature?: number }

  if (from === 'openai-chat') {
    const msgs: { role: string; content: string }[] = (obj.messages as { role: string; content: string }[]) || []
    const sysMsg = msgs.find(m => m.role === 'system')
    normalized = { system: sysMsg?.content, messages: msgs.filter(m => m.role !== 'system'), model: obj.model as string, maxTokens: (obj.max_tokens as number) || 1024, temperature: obj.temperature as number }
  } else if (from === 'anthropic') {
    normalized = {
      system: obj.system as string,
      messages: ((obj.messages as { role: string; content: unknown }[]) || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
      model: obj.model as string, maxTokens: (obj.max_tokens as number) || 1024, temperature: obj.temperature as number,
    }
  } else {
    const input = obj.input
    let messages: { role: string; content: string }[] = []
    if (typeof input === 'string') { messages = [{ role: 'user', content: input }] }
    else if (Array.isArray(input)) { messages = (input as { role: string; content: { text: string }[] }[]).map(m => ({ role: m.role, content: m.content?.map((c: { text: string }) => c.text).join('') || '' })) }
    normalized = { system: obj.instructions as string, messages, model: obj.model as string, maxTokens: (obj.max_output_tokens as number) || 1024 }
  }

  const wrapContent = (text: string) => addCache ? [{ type: 'text', text, cache_control: { type: 'ephemeral' } }] : text

  if (to === 'openai-chat') {
    const msgs = []
    if (normalized.system) msgs.push({ role: 'system', content: normalized.system })
    normalized.messages.forEach(m => msgs.push({ role: m.role, content: m.content }))
    const out: Record<string, unknown> = { model: normalized.model || 'gpt-4o', messages: msgs, max_tokens: normalized.maxTokens }
    if (normalized.temperature !== undefined) out.temperature = normalized.temperature
    return JSON.stringify(out, null, 2)
  }

  if (to === 'anthropic') {
    const out: Record<string, unknown> = {
      model: normalized.model || 'claude-opus-4-8', max_tokens: normalized.maxTokens,
      messages: normalized.messages.map(m => ({ role: m.role, content: addCache ? wrapContent(m.content) : m.content })),
    }
    if (normalized.system) out.system = addCache ? [{ type: 'text', text: normalized.system, cache_control: { type: 'ephemeral' } }] : normalized.system
    if (normalized.temperature !== undefined) out.temperature = normalized.temperature
    return JSON.stringify(out, null, 2)
  }

  const lastUserMsg = [...normalized.messages].reverse().find(m => m.role === 'user')
  const out: Record<string, unknown> = {
    model: normalized.model || 'gpt-4o',
    input: normalized.messages.map(m => ({ type: 'message', role: m.role, content: [{ type: 'input_text', text: m.content }] })),
    max_output_tokens: normalized.maxTokens,
  }
  if (normalized.system) out.instructions = normalized.system
  if (!lastUserMsg) out.input = normalized.system || ''
  return JSON.stringify(out, null, 2)
}
