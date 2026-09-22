import React, { useMemo } from 'react'
import type { VideoRecord } from './types'
import { VIDEO_API_TYPE_LABEL, videoApiTypeOf, videoFmtTime } from './types'
import { videoBuildReportSummary } from './summary'
import type { VideoSupportLevel } from './summary'

const VIDEO_REPORT_MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Consolas, "Courier New", monospace'
const VIDEO_REPORT_MAX_WIDTH = 1120

function toneOf(level: VideoSupportLevel | 'error') {
  if (level === 'ok') return { background: 'var(--okBg)', color: 'var(--ok)' }
  if (level === 'partial') return { background: 'var(--warnBg)', color: 'var(--warn)' }
  return { background: 'var(--errBg)', color: 'var(--err)' }
}

function Pill({ level, children }: { level: VideoSupportLevel | 'error'; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap" style={toneOf(level)}>
      {children}
    </span>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
      <div className="text-[11px] font-medium" style={{ color: 'var(--t3)', letterSpacing: '0.03em' }}>{label}</div>
      <div className="font-mono text-[22px] font-bold tabular-nums mt-1.5" style={{ color: color ?? 'var(--text)', fontFamily: VIDEO_REPORT_MONO, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {sub && <div className="text-[11px] mt-1.5 leading-[1.45]" style={{ color: 'var(--t3)' }}>{sub}</div>}
    </div>
  )
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <h4 className="text-[17px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.012em' }}>{title}</h4>
      {hint && <p className="text-[12.5px] mt-1.5 leading-[1.55]" style={{ color: 'var(--t3)' }}>{hint}</p>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

function Th({ children, numeric, shrink }: { children: React.ReactNode; numeric?: boolean; shrink?: boolean }) {
  return (
    <th className="px-4 py-2.5 font-semibold whitespace-nowrap"
      style={{ color: 'var(--t2)', textAlign: numeric ? 'right' : 'left', fontSize: 11, letterSpacing: '0.05em', width: shrink ? '1%' : undefined, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--inputBg)' }}>
      {children}
    </th>
  )
}

const VIDEO_STATUS_TEXT: Record<'pass' | 'fail' | 'error', string> = { pass: '通过', fail: '未通过', error: '请求失败' }
/** 拒绝 / 不支持类用例的判定文案：通过 = 已按预期拒绝 */
const VIDEO_NEGATIVE_STATUS_TEXT: Record<'pass' | 'fail' | 'error', string> = { pass: '已拒绝', fail: '未通过', error: '未被拒绝' }
function statusTextOf(row: { expect: string; status: 'pass' | 'fail' | 'error'; negativeProduced?: boolean }) {
  if (row.expect === 'success') return VIDEO_STATUS_TEXT[row.status]
  if (row.status === 'error' && !row.negativeProduced) return '请求异常'
  return VIDEO_NEGATIVE_STATUS_TEXT[row.status]
}
function ExpectTag({ expect }: { expect: string }) {
  if (expect === 'success') return null
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap" style={{ background: 'var(--s2)', color: 'var(--t2)', letterSpacing: '0.03em' }}>
      {expect === 'reject' ? '预期拒绝' : '预期不支持'}
    </span>
  )
}
const VIDEO_SUPPORT_TEXT: Record<VideoSupportLevel, string> = { ok: '支持', partial: '部分支持', fail: '不支持' }
const VIDEO_REACHABLE_TEXT: Record<VideoSupportLevel, string> = { ok: '正常', partial: '部分失败', fail: '全部失败' }

function VideoReportView({ records, renderDetail, rootRef }: {
  records: VideoRecord[]
  renderDetail: (r: VideoRecord) => React.ReactNode
  rootRef?: React.Ref<HTMLDivElement>
}) {
  const s = useMemo(() => videoBuildReportSummary(records), [records])
  const { overall, capabilities, rows, meta } = s
  const unsupported = capabilities.filter(c => c.level !== 'ok')
  const timeRange = meta.firstAt && meta.lastAt && meta.lastAt - meta.firstAt >= 1000
    ? `${videoFmtTime(meta.firstAt).slice(11)} — ${videoFmtTime(meta.lastAt).slice(11)}`
    : undefined
  const urlOnly = records.some(r => r.videoUrl && !r.probe)

  return (
    <div ref={rootRef} data-video-export-root className="w-full mx-auto flex flex-col gap-6"
      style={{ maxWidth: VIDEO_REPORT_MAX_WIDTH, color: 'var(--text)', background: 'var(--bg)', padding: 28, borderRadius: 16 }}>

      <div className="rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}>视频接口测试报告</div>
            <div className="flex items-center gap-2.5 flex-wrap mt-2.5">
              <h3 className="text-[26px] font-bold break-words" style={{ color: 'var(--text)', letterSpacing: '-0.021em', lineHeight: 1.15 }}>
                {VIDEO_API_TYPE_LABEL[videoApiTypeOf(records[0]?.apiType)]}能力核查
              </h3>
              <Pill level={overall.level}>{overall.verdictText}</Pill>
            </div>
            <p className="text-sm mt-3 leading-[1.55] break-all" style={{ color: 'var(--t2)' }}>{overall.headline}</p>
            <p className="text-[11px] mt-2 font-mono" style={{ color: 'var(--t3)', fontFamily: VIDEO_REPORT_MONO, letterSpacing: '0.01em' }}>
              {[meta.channels.join(' / '), meta.models.join(' / ')].filter(Boolean).join(' · ')}
            </p>
            {urlOnly && (
              <p className="text-[11px] mt-2 leading-[1.55]" style={{ color: 'var(--t3)' }}>
                成片链接约 24 小时过期。本报告只保留 URL / 封面，不含整段视频。
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-[30px] font-bold tabular-nums" style={{ color: toneOf(overall.level).color, fontFamily: VIDEO_REPORT_MONO, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              {overall.passed}/{overall.total}
            </div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>用例通过</div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>{videoFmtTime(Date.now())}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <Stat label="用例总数" value={String(overall.total)} />
          <Stat label="通过" value={String(overall.passed)} color={overall.passed ? 'var(--ok)' : undefined} />
          <Stat label="未通过" value={String(overall.failed)} color={overall.failed ? 'var(--warn)' : undefined} />
          <Stat label="请求失败" value={String(overall.errored)} color={overall.errored ? 'var(--err)' : undefined} />
          <Stat label="平均耗时" value={`${overall.avgDurationMs} ms`} sub={timeRange} />
        </div>
      </div>

      {capabilities.length > 0 && (
        <SectionCard title="能力支持一览"
          hint={unsupported.length
            ? `以下项未完整通过：${unsupported.map(c => c.label).join('、')}`
            : '所测参数全部按请求生效'}>
          <table className="w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <Th shrink>能力</Th>
                <Th shrink>判定</Th>
                <Th numeric shrink>用例通过</Th>
                <Th>失败样例</Th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((c, idx) => {
                const line = idx === capabilities.length - 1 ? 'none' : '1px solid var(--border)'
                return (
                  <tr key={c.key}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text)', borderBottom: line }}>{c.label}</td>
                    <td className="px-4 py-3" style={{ borderBottom: line }}>
                      <Pill level={c.level}>{(c.key === 'request' ? VIDEO_REACHABLE_TEXT : VIDEO_SUPPORT_TEXT)[c.level]}</Pill>
                    </td>
                    <td className="px-4 py-3 font-mono text-right tabular-nums whitespace-nowrap"
                      style={{ color: c.level === 'ok' ? 'var(--t2)' : 'var(--text)', fontFamily: VIDEO_REPORT_MONO, borderBottom: line }}>
                      {c.passedCases}/{c.totalCases}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] break-all"
                      style={{ color: c.sample ? 'var(--t2)' : 'var(--t3)', fontFamily: VIDEO_REPORT_MONO, borderBottom: line }}>
                      {c.sample || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title="用例结果">
        <table className="w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <Th numeric shrink>#</Th>
              <Th shrink>用例</Th>
              <Th shrink>判定</Th>
              <Th numeric shrink>HTTP</Th>
              <Th shrink>成片尺寸</Th>
              <Th numeric shrink>耗时</Th>
              <Th>问题</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const line = idx === rows.length - 1 ? 'none' : '1px solid var(--border)'
              const num = { fontFamily: VIDEO_REPORT_MONO, borderBottom: line }
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--t3)', ...num }}>{row.index}</td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text)', borderBottom: line }}>
                    <span className="inline-flex items-center gap-2">{row.caseName}<ExpectTag expect={row.expect} /></span>
                  </td>
                  <td className="px-4 py-3" style={{ borderBottom: line }}>
                    <Pill level={row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'partial' : 'error'}>
                      {statusTextOf(row)}
                      {row.totalChecks > 0 && row.status !== 'error' && row.expect === 'success' ? ` ${row.passedChecks}/${row.totalChecks}` : ''}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: (row.httpStatus >= 200 && row.httpStatus < 300) || (row.expect !== 'success' && row.status === 'pass') ? 'var(--t2)' : 'var(--err)', ...num }}>{row.httpStatus || 'ERR'}</td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: 'var(--t2)', ...num }}>{row.sizeText}</td>
                  <td className="px-4 py-3 font-mono text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--t2)', ...num }}>{row.durationMs} ms</td>
                  <td className="px-4 py-3 text-[11.5px] break-all" style={{ color: row.issue ? 'var(--err)' : 'var(--t3)', borderBottom: line }}>{row.issue || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </SectionCard>

      <div className="flex flex-col gap-6">
        <h4 className="text-[17px] font-semibold px-1" style={{ color: 'var(--text)', letterSpacing: '-0.012em' }}>逐条明细</h4>
        {records.map((r, i) => {
          const row = rows[i]
          return (
            <div key={r.id} className="rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-[12px]" style={{ color: 'var(--t3)', fontFamily: VIDEO_REPORT_MONO }}>#{row.index}</span>
                <h5 className="text-[15px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.008em' }}>{row.caseName}</h5>
                <ExpectTag expect={row.expect} />
                <Pill level={row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'partial' : 'error'}>{statusTextOf(row)}</Pill>
              </div>
              <p className="text-[11px] mt-2 font-mono break-all" style={{ color: 'var(--t3)', fontFamily: VIDEO_REPORT_MONO }}>
                {[r.model, r.channelName, videoFmtTime(r.time)].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-5 video-report-detail">{renderDetail(r)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default VideoReportView
