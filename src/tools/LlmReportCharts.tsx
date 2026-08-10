import { useMemo } from 'react'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { Report, BucketPoint } from '../shared/llm-report'

// 与 LlmCharts.tsx 同款数据卡外壳
function ChartCard({ title, sub, children, height = 240 }: {
  title: string; sub?: string; children: React.ReactNode; height?: number
}) {
  return (
    <div data-chart-root className="surface-card rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <b className="text-sm" style={{ color: 'var(--text)' }}>{title}</b>
        {sub && <span className="text-xs" style={{ color: 'var(--t3)' }}>{sub}</span>}
      </div>
      <div style={{ height, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const AXIS_TICK = { fill: 'var(--t2)', fontSize: 10 } as const
const GRID_STROKE = 'var(--border)'
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12,
}

// ① TTFT 直方图（P50/P99 标线）
export function TtftHistChart({ report }: { report: Report }) {
  const h = report.ttftHist
  const data = useMemo(() => {
    if (!h) return []
    return h.bins.map((b, i) => ({ label: Math.round(b) as number, count: h.counts[i] }))
  }, [report])
  if (!h || !data.length) return null
  return (
    <ChartCard title="① TTFT 分布直方图" sub="流式首响应延迟 · 单位 ms" height={230}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <RechartsTooltip
          cursor={{ fill: 'var(--s1)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'var(--t2)' }}
          formatter={(v: unknown, n: unknown) => [`${v ?? '—'} 次`, `${n}ms`]}
        />
        {h.p50 != null && <ReferenceLine x={h.p50} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: 'P50', fill: 'var(--warn)', fontSize: 10, position: 'insideTopRight' }} />}
        {h.p99 != null && <ReferenceLine x={h.p99} stroke="var(--err)" strokeDasharray="4 3" label={{ value: 'P99', fill: 'var(--err)', fontSize: 10, position: 'insideTopRight' }} />}
        <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  )
}

// ② 成功/失败 时间堆叠柱
export function TimelineStackedChart({ report, series = report.series }: { report: Report; series?: BucketPoint[] }) {
  if (!series.length) return null
  const gLabel = report.granularity === 'minute' ? '分钟' : report.granularity === 'hour' ? '小时' : '天'
  const data = series.map(s => ({ ...s, label: s.label }))
  return (
    <ChartCard title="② 请求量时序（成功 / 失败）" sub={`${gLabel}级聚合`} height={240}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <RechartsTooltip
          cursor={{ fill: 'var(--s1)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'var(--t2)' }}
          formatter={(v: unknown, n: unknown) => [`${v ?? '—'} 次`, n === 'ok' ? '成功' : '失败']}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'var(--t2)' }}>{v === 'ok' ? '成功' : '失败'}</span>} />
        <Bar dataKey="ok" stackId="r" fill="var(--ok)" maxBarSize={20} isAnimationActive={false} />
        <Bar dataKey="fail" stackId="r" fill="var(--err)" maxBarSize={20} isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  )
}

// ③ Token 吞吐时序
export function TokensTimelineChart({ report }: { report: Report }) {
  if (!report.series.length) return null
  const data = report.series.map(s => ({ label: s.label, 输入: s.prompt, 输出: s.completion }))
  return (
    <ChartCard title="③ Token 吞吐时序" sub={`${report.granularity === 'minute' ? '每分钟' : report.granularity === 'hour' ? '每小时' : '每天'} tokens`} height={230}>
      <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tokIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tokOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f7fd1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2f7fd1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={46} />
        <RechartsTooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'var(--t2)' }}
          formatter={(v: unknown, n: unknown) => [`${Number(v ?? 0).toLocaleString()} tok`, String(n)]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'var(--t2)' }}>{v}</span>} />
        <Area type="monotone" dataKey="输入" stroke="var(--accent)" strokeWidth={2} fill="url(#tokIn)" isAnimationActive={false} />
        <Area type="monotone" dataKey="输出" stroke="#2f7fd1" strokeWidth={2} fill="url(#tokOut)" isAnimationActive={false} />
      </AreaChart>
    </ChartCard>
  )
}

// ④ 错误类别构成
export function ErrorPieChart({ report }: { report: Report }) {
  if (!report.byError.length) return null
  const palette = ['var(--err)', 'var(--warn)', 'var(--accent)', 'var(--sceneA)', 'var(--sceneB)', 'var(--sceneC)', 'var(--t3)']
  const data = report.byError.map(e => ({ name: e.key, value: e.count, fill: palette[report.byError.indexOf(e) % palette.length] }))
  return (
    <ChartCard title="④ 错误类别构成" sub={`共 ${report.fail} 次失败`} height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={74} paddingAngle={2} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--t2)' }} formatter={(v: unknown, n: unknown) => [`${v} 次`, String(n)]} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'var(--t2)' }}>{v}</span>} />
      </PieChart>
    </ChartCard>
  )
}
