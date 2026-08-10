import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Label, Card, Badge, CustomTextarea, CustomInput, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import {
  parseJsonText, parseExcelBuffer, buildReport, SAMPLE_JSON, DEFAULT_REPORT_TITLE,
  type Report,
} from '../shared/llm-report'
import {
  TtftHistChart, TimelineStackedChart, TokensTimelineChart, ErrorPieChart,
} from './LlmReportCharts'
const OPT_KEY = 'llmreport-opts'

const pad2 = (v: number) => String(v).padStart(2, '0')
const fmtTime = (u: number) => {
  const d = new Date(u * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}
const fmtPct = (v: number | null) => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const fmtMs = (v: number | null) => (v == null ? '—' : Math.round(v) + 'ms')
const fmtSec = (v: number | null) => (v == null ? '—' : Math.round(v * 10) / 10 + 's')
const fmtK = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(v))

// 支持的日志字段（与 shared/llm-report.ts 的 KEY_ALIASES 对应，字段名大小写/下划线容错）
const FIELD_ROWS: { field: string; alias: string; desc: string }[] = [
  { field: 'created_at', alias: 'time / ts', desc: 'Unix 秒时间戳（必填）' },
  { field: 'model_name', alias: 'model', desc: '模型名称' },
  { field: 'username', alias: 'user / token_name', desc: '用户标识' },
  { field: 'prompt_tokens', alias: 'prompt', desc: '输入 token 数' },
  { field: 'completion_tokens', alias: 'completion / output_tokens', desc: '输出 token 数' },
  { field: 'use_time', alias: 'duration', desc: '总耗时（秒）' },
  { field: 'is_stream', alias: '—', desc: '是否流式请求' },
  { field: 'group', alias: 'user_group', desc: '分组名称' },
  { field: 'other', alias: 'extra_info / metadata', desc: 'JSON 字符串，含 frt（首响应 ms）与 stream_status（成败标记）' },
]

// ─── 汇总卡 ───────────────────────────────────────────────────────────────────

function StatCard({ k, v, acc, n }: { k: string; v: string; acc?: boolean; n?: string }) {
  return (
    <div className="surface-card rounded-2xl px-4 py-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="text-[11px] font-semibold" style={{ color: 'var(--t3)', letterSpacing: '0.04em' }}>{k}</div>
      <div className="mt-1 font-bold tabular-nums" style={{ color: acc ? 'var(--accent)' : 'var(--text)', fontSize: 21, letterSpacing: '-0.02em' }}>{v}</div>
      <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{n}</div>
    </div>
  )
}

function StatGrid({ report }: { report: Report }) {
  const spanH = Math.round(report.durationH * 10) / 10
  const cards: { k: string; v: string; acc?: boolean; n: string }[] = [
    { k: '成功率', v: fmtPct(report.successRate), acc: true, n: `${report.ok} / ${report.total}` },
    { k: 'TTFT P50', v: fmtMs(report.ttftStream?.p50 ?? null), n: '流式首 token' },
    { k: 'TTFT P99', v: fmtMs(report.ttftStream?.p99 ?? null), n: '长尾' },
    { k: '总请求数', v: String(report.total), n: `流式 ${report.stream} / 非流式 ${report.nonStream}` },
    { k: '总 tokens', v: fmtK(report.totalTokens), n: `in ${fmtK(report.promptTokens)} / out ${fmtK(report.completionTokens)}` },
    { k: '平均总耗时', v: fmtSec(report.useTime?.avg ?? null), n: `P50 ${fmtSec(report.useTime?.p50 ?? null)} · 跨度 ${spanH} 小时` },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(c => <StatCard key={c.k} {...c} />)}
    </div>
  )
}

// ─── 分位数表 ─────────────────────────────────────────────────────────────────

function PercentileTable({ report }: { report: Report }) {
  const rows: { name: string; p: NonNullable<Report['ttftStream']>; ms: boolean }[] = []
  if (report.ttftStream) rows.push({ name: 'TTFT（流式）', p: report.ttftStream, ms: true })
  if (report.useTime) rows.push({ name: '总耗时（秒）', p: report.useTime, ms: false })
  if (!rows.length) return null
  const fmt = (v: number | null, ms: boolean) => (v == null ? '—' : ms ? Math.round(v) : Math.round(v * 10) / 10)
  return (
    <Card>
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>延迟分位数</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--t3)', fontSize: 11 }}>
              {['指标', 'min', 'avg', 'P50', 'P90', 'P95', 'P99', 'max'].map(h => (
                <th key={h} className="text-left py-2 px-2 font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text)' }}>{r.name}</td>
                {[r.p.min, r.p.avg, r.p.p50, r.p.p90, r.p.p95, r.p.p99, r.p.max].map((v, i) => (
                  <td key={i} className="py-2 px-2 tabular-nums" style={{ color: 'var(--t2)', fontFamily: 'monospace' }}>{fmt(v, r.ms)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── 失败明细 ─────────────────────────────────────────────────────────────────

function FailureDetails({ report }: { report: Report }) {
  if (!report.failures.length) return null
  return (
    <details className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--s2)' }}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none" style={{ color: 'var(--text)', listStyle: 'none' }}>
        <span style={{ color: 'var(--err)' }}>▸ </span>失败请求明细（前 {report.failures.length} 条）
      </summary>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--t3)', fontSize: 11 }}>
              {['时刻', '模型', '用户', '状态', '结束原因', '接口', '耗时 s'].map(h => (
                <th key={h} className="text-left py-2 px-2 font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.failures.map((f, i) => (
              <tr key={i}>
                <td className="py-2 px-2 tabular-nums whitespace-nowrap" style={{ color: 'var(--t2)', fontFamily: 'monospace' }}>{f.at}</td>
                <td className="py-2 px-2" style={{ color: 'var(--text)' }}>{f.model}</td>
                <td className="py-2 px-2" style={{ color: 'var(--text)' }}>{f.user}</td>
                <td className="py-2 px-2" style={{ color: 'var(--err)' }}>{f.status}</td>
                <td className="py-2 px-2" style={{ color: 'var(--warn)' }}>{f.endReason}</td>
                <td className="py-2 px-2 max-w-[200px] break-all" style={{ color: 'var(--t2)' }}>{f.path}</td>
                <td className="py-2 px-2 tabular-nums" style={{ color: 'var(--t2)', fontFamily: 'monospace' }}>{fmtSec(f.useTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// ─── 报告视图 ─────────────────────────────────────────────────────────────────

function ReportView({ report, onBack, onRenameTitle }: {
  report: Report; onBack: () => void; onRenameTitle: (t: string) => void
}) {
  const models = report.models.slice(0, 5).join(' · ')
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(report.title)
  const onExport = useCallback(() => {
    setExporting(true)
    import('./LlmReportExport').then(m => m.downloadReportHtml(report)).finally(() => setExporting(false))
  }, [report])
  const startEdit = () => { setDraft(report.title); setEditing(true) }
  const saveTitle = () => {
    const next = draft.trim() ? draft.trim() : DEFAULT_REPORT_TITLE
    onRenameTitle(next)
    setEditing(false)
  }
  const cancelEdit = () => { setDraft(report.title); setEditing(false) }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold tracking-[0.2em]" style={{ color: 'var(--accent)' }}>LLM LOG REPORT</div>
            <h3 className="mt-1 text-xl font-bold tracking-tight flex items-center gap-2 flex-wrap" style={{ color: 'var(--text)' }}>
              {editing ? (
                <>
                  <CustomInput value={draft} onChange={setDraft} className="w-72" />
                  <Btn small variant="primary" onClick={saveTitle}>✓ 保存</Btn>
                  <Btn small variant="ghost" onClick={cancelEdit}>✕ 取消</Btn>
                </>
              ) : (
                <>
                  {report.title}
                  <button
                    onClick={startEdit}
                    title="重命名报告标题"
                    className="text-[11px] px-2 py-0.5 rounded-full border-0 cursor-pointer outline-none font-medium"
                    style={{ background: 'var(--s2)', color: 'var(--t2)', fontFamily: 'inherit', border: '1px solid var(--border)' }}
                  >✎ 重命名</button>
                  <Badge color={report.source.kind === 'excel' ? 'default' : 'ok'}>{report.source.kind === 'excel' ? 'EXCEL' : 'JSON'}</Badge>
                  {report.fail > 0 && <Badge color="err">失败 {report.fail}</Badge>}
                </>
              )}
            </h3>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
              <span className="font-mono">{models}</span>
              {report.models.length > 5 && <> 等 {report.models.length} 个模型</>}
              {' · '}<span className="font-mono">{fmtTime(report.timeStart)} → {fmtTime(report.timeEnd)}</span>
              {report.source.concurrency != null && <>{' · '}并发数 {report.source.concurrency}</>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn variant="soft" small onClick={onBack}>‹ 重新导入</Btn>
            <Btn variant="primary" small disabled={exporting} onClick={onExport}>{exporting ? '生成中…' : '导出 HTML ⤓'}</Btn>
          </div>
        </div>
      </Card>

      <StatGrid report={report} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TtftHistChart report={report} />
        <TimelineStackedChart report={report} />
        <TokensTimelineChart report={report} />
        <ErrorPieChart report={report} />
      </div>

      <PercentileTable report={report} />

      <FailureDetails report={report} />
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

function LlmReportTool() {
  const [mode, setMode] = useState<'json' | 'excel'>(() => {
    try { return localStorage.getItem(OPT_KEY) === 'excel' ? 'excel' : 'json' } catch { return 'json' }
  })
  const [title, setTitle] = useState(() => {
    try { return localStorage.getItem('llmreport-title') || DEFAULT_REPORT_TITLE } catch { return DEFAULT_REPORT_TITLE }
  })
  const [jsonText, setJsonText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileBuf, setFileBuf] = useState<ArrayBuffer | null>(null)
  const [concurrency, setConcurrency] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { localStorage.setItem(OPT_KEY, mode) } catch { /* noop */ }
  }, [mode])

  useEffect(() => {
    try { localStorage.setItem('llmreport-title', title) } catch { /* noop */ }
  }, [title])

  const onFile = useCallback((f: File | undefined | null) => {
    if (!f) return
    setFileName(f.name)
    setError(null)
    f.arrayBuffer().then(buf => {
      setFileBuf(buf)
      setNote(`已载入 ${f.name}（${(buf.byteLength / 1024).toFixed(0)} KB）`)
    }).catch(() => setError('文件读取失败'))
  }, [])

  const generate = () => {
    setError(null)
    setNote(null)
    let rows: ReturnType<typeof parseJsonText>
    if (mode === 'json') {
      if (!jsonText.trim()) { setError('请粘贴日志 JSON（每条日志一个对象，顶层为数组）'); return }
      rows = parseJsonText(jsonText)
    } else {
      if (!fileBuf) { setError('请先选择 Excel/CSV 文件'); return }
      rows = parseExcelBuffer(fileBuf, fileName)
    }
    if (rows.error) { setError(rows.error); return }
    if (!rows.rows.length) { setError('没有解析到有效日志行（每行需含 created_at 时间戳）'); return }
    if (rows.skipped > 0) setNote(`已跳过 ${rows.skipped} 行无法解析的记录`)
    const cNum = Number(concurrency.trim())
    const rep = buildReport(rows.rows, {
      kind: mode,
      rows: rows.rows.length,
      skipped: rows.skipped,
      fileName: mode === 'excel' ? fileName : undefined,
      concurrency: concurrency.trim() && Number.isFinite(cNum) && cNum > 0 ? cNum : undefined,
    }, title)
    setReport(rep)
  }

  const loadSample = () => {
    setMode('json')
    setJsonText(SAMPLE_JSON)
    setError(null)
    setNote('已载入示例数据（7 条日志，含 1 条模拟失败样本）')
  }

  if (report) {
    return (
      <div className="mx-auto px-6 py-10" style={{ maxWidth: 1180 }}>
        <ReportView
          report={report}
          onBack={() => setReport(null)}
          onRenameTitle={t => { setTitle(t); setReport(prev => (prev ? { ...prev, title: t } : prev)) }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <SectionTitle>LLM 报告生成</SectionTitle>
      <p className="text-sm mt-1 mb-6" style={{ color: 'var(--t2)' }}>
        导入日志数据（JSON 粘贴或 Excel/CSV 文件），生成性能/稳定性分析报告：成功率、TTFT 延迟、时间趋势与错误分布。
      </p>

      <div className="grid gap-5">
        <Card>
          <div className="mb-4">
            <Label className="block mb-1">报告标题</Label>
            <CustomInput value={title} onChange={setTitle} placeholder={DEFAULT_REPORT_TITLE} />
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <SegmentedControl
              value={mode}
              options={[{ value: 'json', label: 'JSON 粘贴' }, { value: 'excel', label: 'Excel / CSV' }]}
              onChange={v => { setMode(v as 'json' | 'excel'); setError(null) }}
            />
            <Btn small variant="ghost" onClick={loadSample}>载入示例</Btn>
          </div>

          {mode === 'json' ? (
            <>
              <Label className="block mb-1">日志 JSON</Label>
              <CustomTextarea
                value={jsonText}
                onChange={setJsonText}
                rows={12}
                mono
                stretch
                placeholder={'[\n  { "created_at": 1785318047, "model_name": "qwen3.7-max", "prompt_tokens": 33, "completion_tokens": 191, "use_time": 6, "is_stream": 1, "other": "{...}" }\n]'}
                style={{ minHeight: 260 }}
              />
            </>
          ) : (
            <>
              <Label className="block mb-1">Excel / CSV 文件</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => onFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed py-10 text-sm font-medium cursor-pointer transition-colors"
                style={{ borderColor: 'var(--borderHard)', color: 'var(--t2)', background: 'var(--s1)', fontFamily: 'inherit' }}
              >
                {fileName ? `已选择：${fileName}` : '点击选择文件（.xlsx / .xls / .csv）'}
                <div className="text-[11px] mt-1 font-normal" style={{ color: 'var(--t3)' }}>
                  自动跳过 Query/SQL 类 sheet，按表头匹配日志列
                </div>
              </button>
            </>
          )}

          {/* 状态栏：常驻显示，错误/提示/空闲三态，避免内容变化时布局跳动 */}
          <div
            className="mt-4 rounded-xl px-4 py-3 flex items-start gap-2 text-sm transition-colors"
            style={error
              ? { background: 'var(--errBg)', border: '1px solid var(--err)' }
              : note
                ? { background: 'var(--okBg)', border: '1px solid var(--ok)' }
                : { background: 'var(--s1)', border: '1px dashed var(--border)' }}
          >
            <Badge color={error ? 'err' : note ? 'ok' : 'default'}>{error ? '错误' : note ? '提示' : '状态'}</Badge>
            <span style={{ color: error ? 'var(--err)' : 'var(--text)' }}>{error ?? note ?? '等待导入日志数据，点击「生成报告」开始分析'}</span>
          </div>

          <div className="mt-4 flex items-end gap-3 flex-wrap">
            <div style={{ width: 140 }}>
              <Label className="block mb-1">并发数（可选）</Label>
              <CustomInput value={concurrency} onChange={setConcurrency} type="number" placeholder="不填不展示" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Btn variant="primary" onClick={generate}>生成报告</Btn>
            <span className="text-xs" style={{ color: 'var(--t3)' }}>
              全部在本地浏览器计算，数据不会上传
            </span>
          </div>
        </Card>

        <Card>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>
            支持的日志字段
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--t3)', fontSize: 11 }}>
                  {['字段', '别名', '说明'].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELD_ROWS.map(r => (
                  <tr key={r.field}>
                    <td className="py-1.5 px-2 font-mono whitespace-nowrap" style={{ color: 'var(--text)' }}>{r.field}</td>
                    <td className="py-1.5 px-2 font-mono whitespace-nowrap" style={{ color: 'var(--t3)' }}>{r.alias}</td>
                    <td className="py-1.5 px-2" style={{ color: 'var(--t2)' }}>{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>报告不含任何费用字段</div>
        </Card>
      </div>
    </div>
  )
}

export default LlmReportTool
