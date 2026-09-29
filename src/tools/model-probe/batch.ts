import { type BuiltinProbeCase, matchBuiltinToolCases } from './builtin-tools'

/** 英文逗号、中文逗号、换行拆开，去空白，按出现顺序去重。 */
export function probeSplitModels(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(raw ?? '').split(/[,，\n\r]+/)) {
    const model = part.trim()
    if (!model || seen.has(model)) continue
    seen.add(model)
    out.push(model)
  }
  return out
}

/**
 * `{model}` 换成这一份的模型名。
 * 只有一次跑多个模型、且模板里没有占位符时，才补成「名称 · 模型名」。
 * 单个模型没有占位符时原样保留。
 */
export function probeNameForModel(template: string, model: string, count: number): string {
  const source = String(template ?? '')
  const hasPlaceholder = source.includes('{model}')
  const replaced = source.split('{model}').join(model).trim()
  if (count > 1 && !hasPlaceholder) {
    const base = replaced || model
    return `${base} · ${model}`
  }
  return replaced || model
}

/** 多个模型各自命中的原生工具取并集，同一 id 只保留第一次出现的。 */
export function probeUnionBuiltinCases(models: string[]): BuiltinProbeCase[] {
  const seen = new Set<string>()
  const out: BuiltinProbeCase[] = []
  for (const model of models) {
    for (const item of matchBuiltinToolCases(model)) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

/** 完成时间从新到旧。同一时间用 id 定先后，裁剪结果不随对象顺序抖动。 */
export function probeHistoryNewestFirst<T extends { id: string; completedAt: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id))
}

/** 超出 max 的旧记录。max 不是正数时全部视为超出。 */
export function probeHistoryOverflow<T extends { id: string; completedAt: string }>(list: readonly T[], max: number): T[] {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0
  return probeHistoryNewestFirst(list).slice(cap)
}

/**
 * 删除后报告页该留下什么。
 * 矩阵多于一列就继续矩阵；只剩一列时改开那一份卡片；列被删光则清空。
 * 没有矩阵时，只在当前卡片被删掉才清空。
 */
export function probeViewAfterDelete<T extends { id: string }>(
  report: T | null,
  matrix: readonly T[] | null,
  removed: ReadonlySet<string>,
): { report: T | null; matrix: T[] | null } {
  if (matrix && matrix.length > 0) {
    const left = matrix.filter(item => !removed.has(item.id))
    if (left.length > 1) {
      return { report: report && !removed.has(report.id) ? report : null, matrix: left }
    }
    if (left.length === 1) return { report: left[0], matrix: null }
    return { report: null, matrix: null }
  }
  if (report && removed.has(report.id)) return { report: null, matrix: null }
  return { report, matrix: null }
}

/**
 * 一个模型的日志是缓冲里的一段。
 * 缓冲被换掉（epoch 变化，或长度退回起点之前）时，绝对下标失效，改为取当前缓冲里还在的全部。
 */
export function probeLogsSince<T>(logs: readonly T[], start: number, currentEpoch: number, startEpoch: number): T[] {
  if (currentEpoch !== startEpoch || !Number.isFinite(start) || start < 0 || start > logs.length) return logs.slice()
  return logs.slice(start)
}
