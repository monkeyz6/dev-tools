/** 渠道复制命名：源名 + `_copy`；占用则 `_copy2`、`_copy3`…（无下划线分隔数字）。 */
export function uniqueCopyName(sourceName: string, existingNames: Iterable<string>): string {
  const taken = existingNames instanceof Set ? existingNames : new Set(existingNames)
  const base = `${sourceName}_copy`
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}
