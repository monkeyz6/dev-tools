const PROBE_CELL_FORMATS = new Set(['chat', 'responses', 'anthropic'])

export function probeLogBelongsToCell(
  log: { resultKey: string; format?: string | null },
  cellKey: string,
): boolean {
  const at = cellKey.lastIndexOf('@')
  const bare = at > 0 ? cellKey.slice(0, at) : cellKey
  const format = at > 0 ? cellKey.slice(at + 1) : ''
  if (PROBE_CELL_FORMATS.has(format) && (log.format || '') !== format) return false
  if (cellKey === 'multi-turn@responses' && log.resultKey === 'origin-sticky@responses') return true
  return log.resultKey === cellKey || log.resultKey === bare
}

export function probeReplaceCellLogs<T extends { id: string; resultKey: string; format?: string | null }>(
  session: T[],
  reportLogs: T[],
  cellKey: string,
  fresh: T[],
): { session: T[]; reportLogs: T[] } {
  const reportIds = new Set(reportLogs.map(log => log.id))
  return {
    session: session.filter(log => !(reportIds.has(log.id) && probeLogBelongsToCell(log, cellKey))),
    reportLogs: [...reportLogs.filter(log => !probeLogBelongsToCell(log, cellKey)), ...fresh],
  }
}

export function probeMatchRetryChannel<T extends { id: string; name: string; baseUrl: string }>(
  target: { channelName?: string; baseUrl: string },
  channels: T[],
  activeId: string | null,
): { channel: T } | { error: string } {
  const name = (target.channelName || '').trim()
  if (name) {
    const named = channels.filter(channel => channel.name === name)
    if (!named.length) return { error: `没有找到渠道「${name}」，不能重试。` }
    const active = named.find(channel => channel.id === activeId)
    if (active) return { channel: active }
    if (named.length === 1) return { channel: named[0] }
    return { error: `有多个名为「${name}」的渠道，请先把要用来重试的那一个设为当前使用。` }
  }
  const byUrl = channels.filter(channel => channel.baseUrl === target.baseUrl)
  if (byUrl.length === 1) return { channel: byUrl[0] }
  if (!byUrl.length) return { error: '这份报告没有渠道名，也没有 Base URL 相同的渠道，不能重试。' }
  return { error: '这份报告没有渠道名，且有多个渠道使用同一 Base URL，不能重试。' }
}
