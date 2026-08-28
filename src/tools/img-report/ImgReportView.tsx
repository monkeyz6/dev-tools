import React, { useMemo } from 'react'
import type { ImgRecord } from './types'
import { imgFmtTime } from './types'
import { imgBuildReportSummary } from './summary'
import type { ImgSupportLevel } from './summary'

// 导出报告文档本体（PNG 截图 / HTML 导出共用的那棵 DOM）。
// 排版按 .claude/skills/apple-design 与缓存命中率报告的既有约定：栏宽上限 1120px 居中、
// 卡片 px-7 py-6、区块间距 24px、字距随字号变化、语义色只给有量的数字。
// 明细区的 <details> 一律折叠：报告是「先看结论再查细节」，9 条记录全展开会被 JSON 撑爆。

const IMG_REPORT_MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Consolas, "Courier New", monospace'
const IMG_REPORT_MAX_WIDTH = 1120

function toneOf(level: ImgSupportLevel | 'error') {
  if (level === 'ok') return { background: 'var(--okBg)', color: 'var(--ok)' }
  if (level === 'partial') return { background: 'var(--warnBg)', color: 'var(--warn)' }
  return { background: 'var(--errBg)', color: 'var(--err)' }
}

function Pill({ level, children }: { level: ImgSupportLevel | 'error'; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap" style={toneOf(level)}>
      {children}
    </span>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
      {/* 小字加正向 tracking、大字收紧 tracking：字距随字号变化 */}
      <div className="text-[11px] font-medium" style={{ color: 'var(--t3)', letterSpacing: '0.03em' }}>{label}</div>
      <div className="font-mono text-[22px] font-bold tabular-nums mt-1.5" style={{ color: color ?? 'var(--text)', fontFamily: IMG_REPORT_MONO, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
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

/**
 * 表头：11px + 正向字距 + --t2 保证小字对比度；数值列右对齐便于纵向扫读。
 * shrink 列用 `width:1%` + nowrap 收到内容宽，把富余宽度留给用例名 / 问题描述这类长文本列，
 * 否则少列表格会把几个数字摊得满屏都是，扫读时眼睛要横跳。
 */
function Th({ children, numeric, shrink }: { children: React.ReactNode; numeric?: boolean; shrink?: boolean }) {
  return (
    <th className="px-4 py-2.5 font-semibold whitespace-nowrap"
      style={{ color: 'var(--t2)', textAlign: numeric ? 'right' : 'left', fontSize: 11, letterSpacing: '0.05em', width: shrink ? '1%' : undefined, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--inputBg)' }}>
      {children}
    </th>
  )
}

const IMG_STATUS_TEXT: Record<'pass' | 'fail' | 'error', string> = { pass: '通过', fail: '未通过', error: '请求失败' }
const IMG_SUPPORT_TEXT: Record<ImgSupportLevel, string> = { ok: '支持', partial: '部分支持', fail: '不支持' }
// 「接口连通」说的是请求本身通没通，套「支持 / 不支持」读着别扭
const IMG_REACHABLE_TEXT: Record<ImgSupportLevel, string> = { ok: '正常', partial: '部分失败', fail: '全部失败' }

function ImgReportView({ records, renderDetail, rootRef }: {
  records: ImgRecord[]
  renderDetail: (r: ImgRecord) => React.ReactNode
  /** 截图 / HTML 导出捕获的根节点就是报告文档本身 */
  rootRef?: React.Ref<HTMLDivElement>
}) {
  const s = useMemo(() => imgBuildReportSummary(records), [records])
  const { overall, capabilities, rows, meta } = s
  const unsupported = capabilities.filter(c => c.level !== 'ok')
  const timeRange = meta.firstAt && meta.lastAt && meta.lastAt - meta.firstAt >= 1000
    ? `${imgFmtTime(meta.firstAt).slice(11)} — ${imgFmtTime(meta.lastAt).slice(11)}`
    : undefined
  // 历史记录只存缩略图（最长边 ≤160px），从历史还原后导出的图会明显糊，得说一声
  const thumbOnly = records.some(r => (r.images || []).some(im => !im.dataUri && im.thumb))

  return (
    <div ref={rootRef} data-img-export-root className="w-full mx-auto flex flex-col gap-6"
      style={{ maxWidth: IMG_REPORT_MAX_WIDTH, color: 'var(--text)', background: 'var(--bg)', padding: 28, borderRadius: 16 }}>

      {/* 报告头：结论与标题同排，第一眼就能看到整体判定 */}
      <div className="rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}>图片接口测试报告</div>
            <div className="flex items-center gap-2.5 flex-wrap mt-2.5">
              <h3 className="text-[26px] font-bold break-words" style={{ color: 'var(--text)', letterSpacing: '-0.021em', lineHeight: 1.15 }}>
                {meta.apiLabel || '图片接口'} 能力核查
              </h3>
              <Pill level={overall.level}>{overall.verdictText}</Pill>
            </div>
            <p className="text-sm mt-3 leading-[1.55] break-all" style={{ color: 'var(--t2)' }}>{overall.headline}</p>
            {/* 只用渠道名标识来源，不含 baseUrl / apiKey */}
            <p className="text-[11px] mt-2 font-mono" style={{ color: 'var(--t3)', fontFamily: IMG_REPORT_MONO, letterSpacing: '0.01em' }}>
              {[meta.channels.join(' / '), meta.models.join(' / ')].filter(Boolean).join(' · ')}
            </p>
            {thumbOnly && (
              <p className="text-[11px] mt-2 leading-[1.55]" style={{ color: 'var(--t3)' }}>
                本报告出自历史记录，生成图为缩略图（最长边 160px），原图未保存
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-[30px] font-bold tabular-nums" style={{ color: toneOf(overall.level).color, fontFamily: IMG_REPORT_MONO, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              {overall.passed}/{overall.total}
            </div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>用例通过</div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>{imgFmtTime(Date.now())}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <Stat label="用例总数" value={String(overall.total)} />
          {/* 语义色只给有量的数字：0 保持中性，否则一片灰底上的红 0 会被读成告警 */}
          <Stat label="通过" value={String(overall.passed)} color={overall.passed ? 'var(--ok)' : undefined} />
          <Stat label="未通过" value={String(overall.failed)} color={overall.failed ? 'var(--warn)' : undefined} />
          <Stat label="请求失败" value={String(overall.errored)} color={overall.errored ? 'var(--err)' : undefined} />
          <Stat label="平均耗时" value={`${overall.avgDurationMs} ms`} sub={timeRange} />
        </div>
      </div>

      {/* 能力支持矩阵：报告的核心结论区，直接回答「哪些支持、哪些不支持」 */}
      {capabilities.length > 0 && (
        <SectionCard title="能力支持一览"
          hint={unsupported.length
            ? `以下项未完整通过：${unsupported.map(c => c.label).join('、')}`
            : '所测参数全部按请求生效'}>
          {/* 外层不能包 overflow 容器：非 visible 的祖先会让表头定位失效，也多一个嵌套滚动条 */}
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
                // 末行不画分隔线，避免与卡片圆角边框叠成双线
                const line = idx === capabilities.length - 1 ? 'none' : '1px solid var(--border)'
                return (
                  <tr key={c.key}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text)', borderBottom: line }}>{c.label}</td>
                    <td className="px-4 py-3" style={{ borderBottom: line }}>
                      <Pill level={c.level}>{(c.key === 'request' ? IMG_REACHABLE_TEXT : IMG_SUPPORT_TEXT)[c.level]}</Pill>
                    </td>
                    <td className="px-4 py-3 font-mono text-right tabular-nums whitespace-nowrap"
                      style={{ color: c.level === 'ok' ? 'var(--t2)' : 'var(--text)', fontFamily: IMG_REPORT_MONO, borderBottom: line }}>
                      {c.passedCases}/{c.totalCases}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] break-all"
                      style={{ color: c.sample ? 'var(--t2)' : 'var(--t3)', fontFamily: IMG_REPORT_MONO, borderBottom: line }}>
                      {c.sample || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </SectionCard>
      )}

      {/* 用例结果表：一行一个用例，扫一眼就知道哪条挂了、挂在哪 */}
      <SectionCard title="用例结果">
        <table className="w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <Th numeric shrink>#</Th>
              <Th shrink>用例</Th>
              <Th shrink>判定</Th>
              <Th numeric shrink>HTTP</Th>
              <Th numeric shrink>张数</Th>
              <Th shrink>实际尺寸</Th>
              <Th numeric shrink>耗时</Th>
              <Th>问题</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const line = idx === rows.length - 1 ? 'none' : '1px solid var(--border)'
              const num = { fontFamily: IMG_REPORT_MONO, borderBottom: line }
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: 'var(--t3)', ...num }}>{row.index}</td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text)', borderBottom: line }}>{row.caseName}</td>
                  <td className="px-4 py-3" style={{ borderBottom: line }}>
                    <Pill level={row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'partial' : 'error'}>
                      {IMG_STATUS_TEXT[row.status]}
                      {row.totalChecks > 0 && row.status !== 'error' ? ` ${row.passedChecks}/${row.totalChecks}` : ''}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: row.httpStatus >= 200 && row.httpStatus < 300 ? 'var(--t2)' : 'var(--err)', ...num }}>{row.httpStatus || 'ERR'}</td>
                  {/* 语义色只给有量的数字：0 走 --t3，否则会被读成告警 */}
                  <td className="px-4 py-3 font-mono text-right tabular-nums" style={{ color: row.returnedN ? 'var(--text)' : 'var(--t3)', ...num }}>{row.returnedN || '—'}</td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: 'var(--t2)', ...num }}>{row.sizeText}</td>
                  <td className="px-4 py-3 font-mono text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--t2)', ...num }}>{row.durationMs} ms</td>
                  <td className="px-4 py-3 text-[11.5px] break-all" style={{ color: row.issue ? 'var(--err)' : 'var(--t3)', borderBottom: line }}>{row.issue || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </SectionCard>

      {/* 明细：每条一张卡片，三个 <details> 保持折叠 */}
      <div className="flex flex-col gap-6">
        <h4 className="text-[17px] font-semibold px-1" style={{ color: 'var(--text)', letterSpacing: '-0.012em' }}>逐条明细</h4>
        {records.map((r, i) => {
          const row = rows[i]
          return (
            <div key={r.id} className="rounded-2xl px-7 py-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-[12px]" style={{ color: 'var(--t3)', fontFamily: IMG_REPORT_MONO }}>#{row.index}</span>
                <h5 className="text-[15px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.008em' }}>{row.caseName}</h5>
                <Pill level={row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'partial' : 'error'}>{IMG_STATUS_TEXT[row.status]}</Pill>
              </div>
              <p className="text-[11px] mt-2 font-mono break-all" style={{ color: 'var(--t3)', fontFamily: IMG_REPORT_MONO }}>
                {[r.model, r.channelName, imgFmtTime(r.time)].filter(Boolean).join(' · ')}
              </p>
              {/* img-report-detail：给明细里的生成图限高，一张 1024² 原图会自己占掉一整页 */}
              <div className="mt-5 img-report-detail">{renderDetail(r)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ImgReportView
