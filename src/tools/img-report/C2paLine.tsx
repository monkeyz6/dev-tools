import type { ReactNode } from 'react'
import type { ImgC2paResult } from './types'
import { imgFmtTime } from './types'
import { imgC2paCodeText, imgC2paHeadline, imgC2paTone } from './c2pa'

const TONE_COLOR = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  muted: 'var(--t3)',
} as const

const TONE_ICON = { ok: '✓', warn: '!', err: '✕', muted: '·' } as const

type Row = { label: string; value: ReactNode; title?: string }

function fmtIso(value: string | null | undefined): string | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? imgFmtTime(ts) : value
}

function Mark({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span style={{ color: ok ? 'var(--ok)' : 'var(--warn)' }}>{children}</span>
}

function trustRow(result: ImgC2paResult): ReactNode {
  if (result.trust === 'trusted') return <Mark ok>链到 C2PA 官方列表 ✓</Mark>
  if (result.trust === 'untrusted') return <Mark ok={false}>未入 C2PA 官方列表</Mark>
  if (result.trust === 'unchecked') return <Mark ok={false}>信任列表未加载，未核对</Mark>
  return null
}

function signRows(result: ImgC2paResult): Row[] {
  const signer = [...new Set([result.issuer, result.signerName].filter(Boolean))]
  const tsa = result.tsaName
    ? <>{result.tsaName}{result.tsaTrusted === true ? '（可信）' : result.tsaTrusted === false ? '（未入列表）' : ''}</>
    : null
  const rows: (Row | null)[] = [
    signer.length ? { label: '签名者', value: signer.map(s => <div key={s}>{s}</div>) } : null,
    result.issuerCa ? { label: '签发 CA', value: result.issuerCa } : null,
    result.status === 'valid' || result.status === 'invalid' ? { label: '信任', value: trustRow(result) } : null,
    result.generatedAt ? { label: '签名时间', value: fmtIso(result.generatedAt) } : null,
    result.certValidTo ? { label: '证书到期', value: fmtIso(result.certValidTo) } : null,
    tsa ? { label: '时间戳', value: tsa } : null,
  ]
  return rows.filter((row): row is Row => !!row && row.value != null)
}

function contentRows(result: ImgC2paResult): Row[] {
  const rows: (Row | null)[] = [
    result.softwareAgent ? { label: '模型', value: result.softwareAgent } : null,
    result.actionLabel ? { label: '动作', value: result.actionLabel } : null,
    result.claimGenerator && result.claimGenerator !== result.softwareAgent ? { label: '生成器', value: result.claimGenerator } : null,
    result.integrity === 'match' ? { label: '完整性', value: <Mark ok>像素哈希一致 ✓</Mark> } : null,
    result.integrity === 'mismatch' ? { label: '完整性', value: <span style={{ color: 'var(--err)' }}>与签名时不一致 ✕</span> } : null,
  ]
  return rows.filter((row): row is Row => !!row)
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return null
  return (
    <section className="pt-1.5 pb-1.5 first:pt-0 last:pb-0" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-[10px] font-medium uppercase" style={{ color: 'var(--t3)', letterSpacing: '0.04em' }}>{title}</div>
      <dl className="mt-1 grid gap-x-2 gap-y-0.5" style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
        {rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="contents">
            <dt className="text-[10px] leading-snug" style={{ color: 'var(--t3)' }}>{row.label}</dt>
            <dd className="text-[10px] leading-snug break-words" style={{ color: 'var(--t2)' }} title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function ImgC2paLine({ result }: { result: ImgC2paResult }) {
  const tone = imgC2paTone(result)
  const sign = signRows(result)
  const content = contentRows(result)
  const problems: Row[] = result.codes.map(code => ({ label: '·', value: imgC2paCodeText(code), title: code }))
  const note: Row[] = result.note ? [{ label: '说明', value: result.note }] : []
  const hasDetail = sign.length + content.length + problems.length + note.length > 0

  return (
    <div className="mt-1" data-testid="img-c2pa-line">
      <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: TONE_COLOR[tone] }}>
        <span aria-hidden="true" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] leading-none shrink-0"
          style={{ background: `color-mix(in srgb, ${TONE_COLOR[tone]} 16%, transparent)` }}>{TONE_ICON[tone]}</span>
        <span>{imgC2paHeadline(result)}</span>
      </div>
      {hasDetail && (
        <details className="mt-0.5">
          <summary className="text-[10px] cursor-pointer select-none" style={{ color: 'var(--t3)' }}>凭证详情</summary>
          <div className="mt-1 flex flex-col [&>section:last-child]:border-b-0!">
            <Group title="签名" rows={sign} />
            <Group title="内容" rows={content} />
            <Group title="问题" rows={problems} />
            <Group title="备注" rows={note} />
          </div>
        </details>
      )}
    </div>
  )
}
