import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { CacheProtocolResult } from './CacheHitTool'

// 每轮输入 Token 构成：缓存读取 / 缓存写入 / 未缓存输入 三段堆叠，
// 直观呈现「预热写入 → 后续轮次大面积命中」的理想形态与实际偏差。
export function CacheRoundsChart({ result }: { result: CacheProtocolResult }) {
  const data = result.rounds.map(r => {
    const read = r.usage.cacheRead ?? 0
    const write = r.usage.cacheWrite ?? 0
    const total = r.usage.totalPrompt ?? 0
    return {
      label: r.warmup ? '预热' : `#${r.round}`,
      read,
      write,
      uncached: Math.max(0, total - read - write),
      failed: r.status !== 'ok',
    }
  })
  const nameOf: Record<string, string> = { read: '缓存读取', write: '缓存写入', uncached: '未缓存输入' }
  return (
    <div data-chart-root>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.006em' }}>每轮输入 Token 构成</div>
      <div style={{ height: 220, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
            <RechartsTooltip
              cursor={{ fill: 'var(--s1)' }}
              contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: 'var(--t2)' }}
              formatter={(value: unknown, name: unknown) => [`${value ?? 0} tok`, nameOf[String(name)] ?? String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              formatter={(value: string) => <span style={{ color: 'var(--text)' }}>{nameOf[value] ?? value}</span>}
            />
            <Bar dataKey="read" name="read" stackId="a" fill="var(--ok)" maxBarSize={44} isAnimationActive={false} />
            <Bar dataKey="write" name="write" stackId="a" fill="var(--warn)" maxBarSize={44} isAnimationActive={false} />
            <Bar dataKey="uncached" name="uncached" stackId="a" fill="var(--t3)" maxBarSize={44} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11.5px] mt-1.5 leading-[1.5]" style={{ color: 'var(--t3)' }}>
        理想形态：预热轮全部为「缓存写入 / 未缓存输入」，后续轮次绝大部分为「缓存读取」。
      </div>
    </div>
  )
}
