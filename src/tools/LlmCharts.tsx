import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine, Legend,
} from 'recharts'
import type { BatchReport, BatchResult } from './LlmBatchTool'

function llmStatsOf(values: number[]) {
  if (!values.length) return null
  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / values.length
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length
  return { sum, mean, max: Math.max(...values), min: Math.min(...values), std: Math.sqrt(variance) }
}

function pad2(value: number) { return String(value).padStart(2, '0') }
function formatTime(value: number) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

// Token 分布柱状图（输出 Token 波动始终展示；输入 Token 仅在跨请求不一致时展示，直观呈现差异）
export function LlmTokenChart({ model, results, field, title }: {
  model: string; results: BatchResult[]; field: 'inputTokens' | 'outputTokens'; title: string
}) {
  const rs = results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx)
  const okVals = rs.filter(r => r.status === 'ok' && r[field] != null).map(r => r[field] as number)
  const st = llmStatsOf(okVals)
  const maxVal = okVals.length ? Math.max(...okVals) : 1
  const placeholder = Math.max(1, maxVal * 0.08)
  const chartData = rs.map(r => ({
    label: '#' + r.localIdx,
    value: r.status === 'ok' && r[field] != null ? (r[field] as number) : placeholder,
    ok: r.status === 'ok' && r[field] != null,
    display: r.status === 'ok' ? String(r[field] ?? '-') : '失败',
  }))
  return (
    <div data-chart-root className="surface-card rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <b className="text-sm" style={{ color: 'var(--text)' }}>[{model}] {title}</b>
      <div style={{ height: 220, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <RechartsTooltip
              cursor={{ fill: 'var(--s1)' }}
              contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: 'var(--t2)' }}
              formatter={(_value: unknown, _name: unknown, item: any) => [item?.payload?.ok ? item.payload.display + ' tok' : '请求失败', title]}
            />
            {st && <ReferenceLine y={st.mean} stroke="var(--t3)" strokeDasharray="4 3" />}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => <Cell key={i} fill={d.ok ? 'var(--accent)' : 'var(--t3)'} />)}
              <LabelList dataKey="display" position="top" style={{ fill: 'var(--text)', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--t2)' }}>
        均值 {st ? st.mean.toFixed(1) : '—'} ｜ 最大 {st ? st.max : '—'} ｜ 最小 {st ? st.min : '—'} ｜ 标准差（总体）{st ? st.std.toFixed(2) : '—'}
      </div>
    </div>
  )
}

// ── 对比模式组合图表（对比双方的输入/输出放到同一图表）──
export function LlmCompareChart({ reportA, reportB, model, field, title }: {
  reportA: BatchReport; reportB: BatchReport; model: string; field: 'inputTokens' | 'outputTokens'; title: string
}) {
  const rsA = useMemo(() => reportA.results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx), [reportA, model])
  const rsB = useMemo(() => reportB.results.filter(r => r.model === model).sort((a, b) => a.localIdx - b.localIdx), [reportB, model])
  const maxLen = Math.max(rsA.length, rsB.length)
  const [chartType, setChartType] = useState<'bar' | 'line'>(maxLen > 30 ? 'line' : 'bar')
  const labelA = reportA.title?.trim() || formatTime(reportA.startTime)
  const labelB = reportB.title?.trim() || formatTime(reportB.startTime)
  const chartData = useMemo(() => {
    const idxs = new Set<number>()
    rsA.forEach(r => idxs.add(r.localIdx))
    rsB.forEach(r => idxs.add(r.localIdx))
    const sorted = [...idxs].sort((a, b) => a - b)
    return sorted.map(idx => {
      const ra = rsA.find(r => r.localIdx === idx)
      const rb = rsB.find(r => r.localIdx === idx)
      const aOk = ra?.status === 'ok' && ra[field] != null
      const bOk = rb?.status === 'ok' && rb[field] != null
      return {
        label: '#' + idx,
        reportA: aOk ? (ra[field] as number) : 0,
        reportB: bOk ? (rb[field] as number) : 0,
        aOk,
        bOk,
        aDisplay: aOk ? String(ra[field] ?? '-') : '失败',
        bDisplay: bOk ? String(rb[field] ?? '-') : '失败',
      }
    })
  }, [rsA, rsB, field])
  return (
    <div data-chart-root className="surface-card rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{model}</span>
          <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
          <button onClick={() => setChartType('bar')}
            className="px-2 py-0.5 text-[11px] font-medium rounded-md border-0 cursor-pointer outline-none"
            style={{ background: chartType === 'bar' ? 'var(--bg)' : 'transparent', color: chartType === 'bar' ? 'var(--text)' : 'var(--t2)', boxShadow: chartType === 'bar' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>柱状图</button>
          <button onClick={() => setChartType('line')}
            className="px-2 py-0.5 text-[11px] font-medium rounded-md border-0 cursor-pointer outline-none"
            style={{ background: chartType === 'line' ? 'var(--bg)' : 'transparent', color: chartType === 'line' ? 'var(--text)' : 'var(--t2)', boxShadow: chartType === 'line' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>折线图</button>
        </div>
      </div>
      <div style={{ height: 220, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <RechartsTooltip cursor={{ fill: 'var(--s1)' }}
                contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'var(--t2)' }}
                formatter={(value: unknown, name: unknown) => [`${value ?? '—'} tok`, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value === 'reportA' ? labelA : labelB}</span>}
              />
              <Bar dataKey="reportA" name="reportA" radius={[4, 4, 0, 0]} isAnimationActive={false} fill="var(--accent)" />
              <Bar dataKey="reportB" name="reportB" radius={[4, 4, 0, 0]} isAnimationActive={false} fill="var(--ok)" />
            </BarChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <RechartsTooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'var(--t2)' }}
                formatter={(value: unknown, name: unknown) => [`${value ?? '—'} tok`, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{value === 'reportA' ? labelA : labelB}</span>}
              />
              <Line type="monotone" dataKey="reportA" name="reportA" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="reportB" name="reportB" stroke="var(--ok)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ok)', strokeWidth: 0 }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
