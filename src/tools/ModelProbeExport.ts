// 模型探测：自包含单文件 HTML 报告（网格卡片 + 弹层，请求体可复制，不含请求头 / key）

export type ProbeHtmlStatus = 'passed' | 'failed' | 'abnormal' | 'unsupported' | 'skipped' | 'expected' | 'untested'

export interface ProbeHtmlVerdictLayer { label: string; reasons: string[] }
export interface ProbeHtmlVerdict {
  family: ProbeHtmlVerdictLayer
  access: ProbeHtmlVerdictLayer
  upstream: ProbeHtmlVerdictLayer
}

export interface ProbeHtmlResult {
  status: ProbeHtmlStatus
  detail: string
  duration: number | null
  format?: string
  usage?: { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null }
  cache?: { hits: number; total: number; reads: number[] }
  tokenValues?: number[]
  checks?: { id: string; passed: boolean; detail: string }[]
  repro: {
    url: string
    headers: Record<string, string>
    body: unknown
    status: number | null
    requestId: string | null
  } | null
}

export interface ProbeHtmlReport {
  name: string
  startedAt: string
  completedAt: string
  durationMs: number
  target: {
    baseUrl: string
    model: string
    channelName?: string
    overrides: Record<string, string | null>
  }
  results: Record<string, ProbeHtmlResult>
  summary: Record<ProbeHtmlStatus, number>
  verdict?: ProbeHtmlVerdict | null
}

export interface ProbeHtmlTestMeta {
  id: string
  group: string
  name: string
  explain: string
}

export interface ProbeHtmlTheme {
  initialTheme: 'light' | 'dark'
  liveCss: string
}

interface ProbeHtmlItem {
  name: string
  explain: string
  formatLabel: string
  status: ProbeHtmlStatus
  detail: string
  duration: number | null
  usage?: ProbeHtmlResult['usage']
  cache?: ProbeHtmlResult['cache']
  tokenValues?: number[]
  checks?: { id: string; passed: boolean; detail: string }[]
  url: string
  http: number | null
  requestId: string | null
  body: unknown
}

interface ProbeHtmlGroup { title: string; items: ProbeHtmlItem[] }

const STATUS_LABEL: Record<Exclude<ProbeHtmlStatus, 'skipped'>, string> = {
  passed: '通过', failed: '失败', abnormal: '异常', unsupported: '不支持', expected: '符合预期', untested: '未测',
}
const MATRIX_STATUS: Record<ProbeHtmlStatus, string> = { ...STATUS_LABEL, skipped: '已跳过' }

const THEME_VAR_KEYS = [
  'bg', 's1', 's2', 'border', 'borderHard', 'text', 't2', 't3',
  'accent', 'accentFg', 'accentSub', 'accentSubHard',
  'ok', 'okBg', 'err', 'errBg', 'warn', 'warnBg',
  'code', 'shadow', 'shadowSm', 'shadowMd', 'shadowHover',
  'surface', 'surfaceStrong', 'surfaceMuted', 'surfaceEdge', 'surfaceGlow', 'bgGrad',
  'sceneA', 'sceneB', 'sceneC',
] as const

const REPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:auto!important;min-height:100%;margin:0;overflow:visible!important}
html{
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-size-adjust:100%;
  background:var(--bg);background-image:var(--bgGrad);background-attachment:fixed;
  color-scheme:light;transition:background-color .25s ease;
}
html[data-theme="dark"]{color-scheme:dark}
html[data-theme="light"]{
  --bg:#f5f7fb;--s1:rgba(255,255,255,0.74);--s2:rgba(238,242,249,0.78);
  --border:rgba(0,0,0,0.07);--borderHard:rgba(0,0,0,0.16);
  --text:#111827;--t2:#6b7280;--t3:#9ca3af;
  --accent:#2563eb;--accentFg:#fff;--accentSub:rgba(37,99,235,0.07);--accentSubHard:rgba(37,99,235,0.12);
  --ok:#16a34a;--okBg:rgba(22,163,74,0.08);
  --err:#dc2626;--errBg:rgba(220,38,38,0.08);
  --warn:#d97706;--warnBg:rgba(217,119,6,0.08);
  --code:#f1f4f9;
  --shadow:0 1px 2px rgba(27,39,70,0.04),0 10px 28px -18px rgba(27,39,70,0.24);
  --shadowSm:0 1px 2px rgba(27,39,70,0.05);
  --shadowMd:0 18px 48px -24px rgba(31,48,89,0.34),0 2px 8px rgba(31,48,89,0.05);
  --shadowHover:0 26px 64px -34px rgba(31,48,89,0.42),0 8px 24px -18px rgba(31,48,89,0.28);
  --surface:rgba(255,255,255,0.68);--surfaceStrong:rgba(251,252,255,0.84);--surfaceMuted:rgba(246,249,255,0.62);
  --surfaceEdge:rgba(255,255,255,0.92);--surfaceGlow:rgba(37,99,235,0.14);
  --bgGrad:linear-gradient(145deg,rgba(255,255,255,0.45),transparent 42%),radial-gradient(1200px 700px at 80% -10%,rgba(37,99,235,0.06) 0%,transparent 60%);
  --sceneA:rgba(47,128,255,0.24);--sceneB:rgba(167,96,255,0.18);--sceneC:rgba(47,200,168,0.13);
}
html[data-theme="dark"]{
  --bg:#090b12;--s1:rgba(255,255,255,0.045);--s2:rgba(255,255,255,0.07);
  --border:rgba(255,255,255,0.10);--borderHard:rgba(255,255,255,0.20);
  --text:#eceef5;--t2:#9aa3b4;--t3:#7e88a0;
  --accent:#ff7a45;--accentFg:#1a0d05;--accentSub:rgba(255,122,69,0.16);--accentSubHard:rgba(255,122,69,0.24);
  --ok:#34d399;--okBg:rgba(52,211,153,0.1);
  --err:#ff6b81;--errBg:rgba(255,107,129,0.1);
  --warn:#ffc24b;--warnBg:rgba(255,194,75,0.1);
  --code:#12141d;
  --shadow:0 1px 2px rgba(0,0,0,0.4);
  --shadowSm:0 1px 2px rgba(0,0,0,0.32);
  --shadowMd:0 4px 20px rgba(0,0,0,0.55);
  --shadowHover:0 30px 72px -34px rgba(0,0,0,0.82),0 12px 32px -24px rgba(124,108,255,0.42);
  --surface:rgba(17,20,31,0.68);--surfaceStrong:rgba(14,17,27,0.84);--surfaceMuted:rgba(22,26,39,0.62);
  --surfaceEdge:rgba(255,255,255,0.12);--surfaceGlow:rgba(255,122,69,0.16);
  --bgGrad:linear-gradient(145deg,rgba(255,255,255,0.025),transparent 40%),radial-gradient(900px 560px at 12% -8%,rgba(255,122,69,.12) 0%,transparent 58%),radial-gradient(820px 560px at 96% 8%,rgba(124,108,255,.13) 0%,transparent 56%);
  --sceneA:rgba(255,113,66,0.22);--sceneB:rgba(110,96,255,0.24);--sceneC:rgba(58,199,214,0.12);
}
body{
  background:transparent;color:var(--text);
  font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",system-ui,sans-serif;
  transition:color .25s ease;
}
/* 环境光球层：与应用内 .ambient-orb 同款（静态），给毛玻璃卡片提供可透的底色层次。
   负 z-index + body 背景透明（底色在 html 上），否则会被 body 背景盖住。 */
.ambient{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.ambient i{position:absolute;border-radius:50%;filter:blur(82px);opacity:.82}
.orb-a{width:min(58vw,860px);height:min(58vw,860px);top:-34%;left:12%;background:radial-gradient(circle at 42% 42%,var(--sceneA),transparent 68%)}
.orb-b{width:min(52vw,760px);height:min(52vw,760px);top:-8%;right:-18%;background:radial-gradient(circle at 50% 45%,var(--sceneB),transparent 70%)}
.orb-c{width:min(46vw,680px);height:min(46vw,680px);bottom:-30%;left:38%;background:radial-gradient(circle at 50% 50%,var(--sceneC),transparent 70%)}
.mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
.top{
  position:sticky;top:0;z-index:20;
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:12px clamp(16px,4vw,36px);
  background:color-mix(in srgb,var(--bg) 72%,transparent);
  backdrop-filter:saturate(160%) blur(18px);-webkit-backdrop-filter:saturate(160%) blur(18px);
  border-bottom:1px solid var(--border);
}
.brand{font-size:13px;font-weight:600;letter-spacing:.04em;color:var(--t2)}
.theme-btn{
  font:inherit;font-size:12px;font-weight:600;
  padding:7px 12px;border-radius:999px;border:1px solid var(--border);
  background:var(--surface);color:var(--t2);cursor:pointer;
  box-shadow:var(--shadowSm);
}
.theme-btn:hover{background:var(--accentSub)}
.theme-btn:active{transform:scale(.97)}
.wrap{
  width:100%;max-width:1120px;margin:0 auto;
  padding:clamp(24px,4vw,48px) clamp(16px,4vw,36px) clamp(56px,8vw,96px);
  display:flex;flex-direction:column;gap:22px;
}
.hero,.stat,.tile,.sheet{
  position:relative;
  background:var(--surface);
  border:1px solid color-mix(in srgb,var(--surfaceEdge) 76%,var(--border));
  box-shadow:var(--shadow),inset 0 1px 0 color-mix(in srgb,var(--surfaceEdge) 82%,transparent);
  -webkit-backdrop-filter:blur(22px) saturate(165%);
  backdrop-filter:blur(22px) saturate(165%);
}
.hero::before,.stat::before,.tile::before{
  content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(460px circle at 12% -12%,var(--surfaceGlow),transparent 64%);
  opacity:.22;
  transition:opacity .32s ease-out;
}
.hero{padding:26px 28px 24px;border-radius:22px}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{margin:10px 0 0;font-size:26px;font-weight:700;letter-spacing:-.021em;line-height:1.15}
.sub{margin:10px 0 0;font-size:14px;color:var(--t2);line-height:1.55}
.meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:16px}
.meta span{font-size:12px;color:var(--t3)}
.meta b{font-weight:600;color:var(--t2);margin-right:6px}
.hero-time{text-align:right}
.hero-time .t{font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.1}
.hero-time .d{margin-top:6px;font-size:11px;color:var(--t3);letter-spacing:.03em}
.hero-row{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}
.overrides{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{
  display:inline-flex;align-items:center;border-radius:999px;
  padding:3px 9px;font-size:11px;letter-spacing:.02em;
  background:var(--s2);color:var(--t2);border:1px solid var(--border);
}
.origin{margin-top:16px;display:grid;gap:8px}
.origin-row{display:grid;grid-template-columns:4.5rem minmax(0,1fr);column-gap:12px;align-items:baseline}
.origin-k{font-size:12px;font-weight:600;line-height:1.45;color:var(--t3)}
.origin-v{font-size:14px;font-weight:600;line-height:1.45;color:var(--text)}
.origin-r{margin:2px 0 0;padding:0;list-style:none}
.origin-r li{font-size:12px;line-height:1.5;color:var(--t2);overflow-wrap:anywhere}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (min-width:720px){.stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (min-width:1040px){.stats{grid-template-columns:repeat(7,minmax(0,1fr))}}
.stat{padding:14px 12px;border-radius:18px}
.stat .k{font-size:11px;font-weight:600;color:var(--t3);letter-spacing:.04em;white-space:nowrap}
.stat .v{margin-top:6px;font-size:28px;font-weight:700;letter-spacing:-.025em;line-height:1.1;color:var(--text)}
.stat .v.zero{color:var(--t3)}
.stat .v.ok{color:var(--ok)}
.stat .v.err{color:var(--err)}
.stat .v.abn{color:color-mix(in srgb, var(--err) 55%, var(--warn))}
.stat .v.warn{color:var(--warn)}
.stat .v.info{color:var(--accent)}
.bar{display:flex;height:6px;border-radius:999px;overflow:hidden;background:var(--s2)}
.bar i{display:block;height:100%}
.bar .ok{background:var(--ok)}
.bar .info{background:var(--accent)}
.bar .err{background:var(--err)}
.bar .abn{background:color-mix(in srgb, var(--err) 55%, var(--warn))}
.bar .warn{background:var(--warn)}
.bar .mute{background:var(--t3);opacity:.45}
.section-title{
  margin:6px 2px 10px;font-size:12px;font-weight:700;color:var(--t3);
  letter-spacing:.08em;text-transform:uppercase;
}
.tiles{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width:720px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1040px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
.tile{
  appearance:none;display:flex;flex-direction:column;align-items:flex-start;gap:8px;
  width:100%;padding:18px 18px 16px;border-radius:18px;text-align:left;cursor:pointer;
  color:inherit;font:inherit;
  transition:transform .4s cubic-bezier(.34,1.3,.5,1),box-shadow .3s cubic-bezier(.22,1,.36,1);
  animation:tile-in .46s cubic-bezier(.22,1,.36,1) calc(var(--i,0)*35ms) backwards;
}
.tile:hover{
  transform:translateY(-3px) scale(1.004);
  box-shadow:var(--shadowHover),inset 0 1px 0 var(--surfaceEdge);
}
.tile:hover::before{opacity:.52}
.tile:active{transform:scale(.97);transition-duration:.12s}
.tile-top{display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px}
.tile h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.011em;color:var(--text)}
.tile .clip{margin:0;width:100%;font-size:12px;color:var(--t2);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tile .ms{font-size:11px;color:var(--t3)}
.tile .usage{margin-top:2px;font-size:11px;letter-spacing:.02em;color:var(--t2)}
.tile .usage .empty{color:var(--t3)}
@keyframes tile-in{from{opacity:0;transform:translateY(10px) scale(.992)}to{opacity:1;transform:none}}
.dot-st{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;white-space:nowrap}
.dot-st::before{content:"";width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 8px currentColor;flex-shrink:0}
.dot-st.passed{color:var(--ok)}
.dot-st.failed{color:var(--err)}
.dot-st.abnormal{color:color-mix(in srgb, var(--err) 55%, var(--warn))}
.dot-st.unsupported{color:var(--warn)}
.dot-st.expected{color:var(--accent)}
.dot-st.untested{color:var(--t3)}
.pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;flex-shrink:0}
.pill.passed{background:var(--okBg);color:var(--ok)}
.pill.failed{background:var(--errBg);color:var(--err)}
.pill.abnormal{background:color-mix(in srgb, var(--err) 14%, transparent);color:color-mix(in srgb, var(--err) 55%, var(--warn))}
.pill.unsupported{background:var(--warnBg);color:var(--warn)}
.pill.expected{background:var(--accentSub);color:var(--accent)}
.pill.untested{background:var(--s2);color:var(--t3)}
.footer{font-size:12px;color:var(--t3);line-height:1.7;padding:4px 4px 0}
.overlay{
  position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;
  padding:24px 16px;background:color-mix(in srgb,var(--bg) 72%,transparent);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
}
.overlay.is-on{display:flex}
.sheet{
  width:min(760px,100%);max-height:min(86vh,880px);overflow:auto;
  border-radius:22px;padding:24px 24px 22px;background:var(--surfaceStrong);
  box-shadow:var(--shadowMd);
  animation:sheet-in .4s cubic-bezier(.34,1.2,.64,1);
}
.sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.sheet-head h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.014em}
.close{
  appearance:none;border:1px solid var(--border);background:var(--s2);color:var(--t2);
  border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;
}
.explain{margin:8px 0 0;font-size:12px;color:var(--t3);line-height:1.55}
.detail{margin:12px 0 0;font-size:14px;color:var(--text);line-height:1.55}
.checks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.check{font-size:11px;padding:3px 8px;border-radius:999px}
.check.ok{background:var(--okBg);color:var(--ok)}
.check.err{background:var(--errBg);color:var(--err)}
.facts{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:14px;font-size:12px;color:var(--t2)}
.facts em{font-style:normal;color:var(--t3);margin-right:4px}
.repro-line{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 12px}
.tag{font-size:11px;padding:4px 8px;border-radius:8px;background:var(--s2);color:var(--text);border:1px solid var(--border)}
.block .lbl{font-size:11px;font-weight:600;color:var(--t3);letter-spacing:.04em;margin-bottom:6px}
.codewrap{position:relative;min-width:0}
.copy{
  position:absolute;top:8px;right:8px;z-index:2;
  display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;padding:0;border-radius:8px;
  appearance:none;border:1px solid var(--border);
  background:color-mix(in srgb,var(--code) 72%,transparent);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  color:var(--t3);cursor:pointer;
  transition:transform .4s cubic-bezier(.34,1.3,.5,1),color .2s ease,background .2s ease,border-color .2s ease;
}
.copy:hover{color:var(--accent);background:color-mix(in srgb,var(--accentSub) 80%,var(--code));border-color:color-mix(in srgb,var(--accent) 32%,var(--border))}
.copy:active{transform:scale(.9);transition-duration:.12s}
.copy.is-ok{color:var(--ok);background:var(--okBg);border-color:color-mix(in srgb,var(--ok) 36%,var(--border))}
.copy svg{width:14px;height:14px;display:block}
pre{
  margin:0;max-height:360px;overflow:auto;padding:12px 38px 12px 14px;border-radius:12px;
  background:var(--code);border:1px solid var(--border);color:var(--text);
  font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;
}
@keyframes sheet-in{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
@media (max-width:720px){
  h1{font-size:22px}
  .hero-time{text-align:left}
  .stat{padding:12px 10px}
  .stat .v{font-size:22px}
}
@media (prefers-reduced-transparency:reduce){
  .top,.overlay{background:var(--bg);backdrop-filter:none;-webkit-backdrop-filter:none}
  .hero,.stat,.tile,.sheet{background:var(--bg);backdrop-filter:none;-webkit-backdrop-filter:none}
  .ambient{opacity:.08}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none!important;animation:none!important}
  .tile:hover,.tile:active,.theme-btn:active,.copy:active{transform:none}
}
@media (prefers-reduced-transparency:reduce){
  .copy{background:var(--code);backdrop-filter:none;-webkit-backdrop-filter:none}
}
@media print{
  .top,.overlay,.ambient{display:none!important}
  html,body{background:#fff;color:#111}
  .tile,.hero,.stat{box-shadow:none;break-inside:avoid;backdrop-filter:none;-webkit-backdrop-filter:none}
}
`

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function pretty(v: unknown): string {
  try { return JSON.stringify(v, null, 2) ?? '' } catch { return String(v) }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtNum(v: number | null | undefined): string {
  return typeof v === 'number' && isFinite(v) ? String(v) : '—'
}

function formatOfKey(key: string): string | null {
  const at = key.indexOf('@')
  return at > 0 ? key.slice(at + 1) : null
}

function isHiddenResult(key: string, r?: ProbeHtmlResult): boolean {
  return key === 'structured_output@anthropic' && !!r?.detail?.includes('无原生 response_format')
}

function resultKeysOf(id: string, results: Record<string, ProbeHtmlResult>): string[] {
  const prefix = id + '@'
  return Object.keys(results).filter(k => (k === id || k.startsWith(prefix)) && !isHiddenResult(k, results[k])).sort((a, b) => a.localeCompare(b))
}

function sanitizeHtmlReport(report: ProbeHtmlReport): ProbeHtmlReport {
  const results: Record<string, ProbeHtmlResult> = {}
  for (const [k, v] of Object.entries(report.results || {})) {
    if (!isHiddenResult(k, v)) results[k] = v
  }
  const summary: Record<ProbeHtmlStatus, number> = {
    passed: 0, failed: 0, abnormal: 0, unsupported: 0, skipped: 0, expected: 0, untested: 0,
  }
  for (const r of Object.values(results)) {
    if (summary[r.status] != null) summary[r.status]++
  }
  return { ...report, results, summary }
}

function buildGroups(report: ProbeHtmlReport, tests: ProbeHtmlTestMeta[], formatLabels: Record<string, string>): ProbeHtmlGroup[] {
  const groups: ProbeHtmlGroup[] = []
  for (const t of tests) {
    const executed = resultKeysOf(t.id, report.results)
      .map(key => ({ key, r: report.results[key] }))
      .filter((x): x is { key: string; r: ProbeHtmlResult & { status: Exclude<ProbeHtmlStatus, 'skipped'> } } => !!x.r && x.r.status !== 'skipped')
    if (!executed.length) continue
    let g = groups.find(x => x.title === t.group)
    if (!g) {
      g = { title: t.group, items: [] }
      groups.push(g)
    }
    for (const { key, r } of executed) {
      const fmt = r.format || formatOfKey(key)
      g.items.push({
        name: t.name,
        explain: t.explain,
        formatLabel: fmt ? (formatLabels[fmt] || fmt) : '',
        status: r.status,
        detail: r.detail,
        duration: r.duration,
        usage: r.usage,
        cache: r.cache,
        tokenValues: r.tokenValues,
        checks: r.checks,
        url: r.repro?.url || '',
        http: r.repro?.status ?? null,
        requestId: r.repro?.requestId ?? null,
        body: r.repro ? r.repro.body : null,
      })
    }
  }
  return groups
}

function statClass(kind: 'ok' | 'err' | 'abn' | 'warn' | 'info', n: number): string {
  return n > 0 ? kind : 'zero'
}

function renderOrigin(verdict?: ProbeHtmlVerdict | null): string {
  if (!verdict) return ''
  const row = (label: string, layer: ProbeHtmlVerdictLayer) => `<div class="origin-row"><div class="origin-k">${esc(label)}</div><div><div class="origin-v">${esc(layer.label)}</div>${layer.reasons.length ? `<ul class="origin-r">${layer.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}</div></div>`
  return `<div class="origin">${row('家族', verdict.family)}${row('接入层', verdict.access)}${row('上游', verdict.upstream)}</div>`
}

function ioParts(usage?: ProbeHtmlResult['usage']): { inn: string; out: string; innEmpty: boolean; outEmpty: boolean } {
  return {
    inn: usage?.input == null ? '—' : String(usage.input),
    out: usage?.output == null ? '—' : String(usage.output),
    innEmpty: usage?.input == null,
    outEmpty: usage?.output == null,
  }
}

function renderTile(item: ProbeHtmlItem, index: number): string {
  const io = ioParts(item.usage)
  return `<button type="button" class="tile" data-i="${index}" style="--i:${Math.min(index, 12)}" aria-label="${esc(item.name)} ${esc(item.formatLabel)} ${MATRIX_STATUS[item.status]}">
    <div class="tile-top">
      <span class="dot-st ${item.status}">${MATRIX_STATUS[item.status]}</span>
      ${item.duration != null ? `<span class="ms mono">${esc(item.duration)} ms</span>` : ''}
    </div>
    <h2>${esc(item.name)}</h2>
    ${item.formatLabel ? `<span class="chip">${esc(item.formatLabel)}</span>` : ''}
    <p class="clip">${esc(item.detail)}</p>
    ${item.checks?.length ? `<div class="checks">${item.checks.map(c => `<span class="check ${c.passed ? 'ok' : 'err'}">${c.passed ? '✓' : '✗'} ${esc(c.id)}</span>`).join('')}</div>` : ''}
    <div class="usage mono"><span class="${io.innEmpty ? 'empty' : ''}">↑${esc(io.inn)}</span> <span class="${io.outEmpty ? 'empty' : ''}">↓${esc(io.out)}</span></div>
  </button>`
}

export function captureProbeExportTheme(): ProbeHtmlTheme {
  if (typeof document === 'undefined') return { initialTheme: 'light', liveCss: '' }
  const shell = document.querySelector('.app-shell') as HTMLElement | null
  const key = shell?.getAttribute('data-theme') || 'light'
  const initialTheme = key === 'dark' ? 'dark' : 'light'
  if (!shell) return { initialTheme, liveCss: '' }
  const cs = getComputedStyle(shell)
  const liveCss = THEME_VAR_KEYS
    .map(name => {
      const v = cs.getPropertyValue('--' + name).trim()
      return v ? `--${name}:${v}` : ''
    })
    .filter(Boolean)
    .join(';')
  return { initialTheme, liveCss }
}

export function buildProbeReportHtml(
  report: ProbeHtmlReport,
  tests: ProbeHtmlTestMeta[],
  formatLabels: Record<string, string>,
  theme?: ProbeHtmlTheme,
): string {
  report = sanitizeHtmlReport(report)
  const groups = buildGroups(report, tests, formatLabels)
  const flat: ProbeHtmlItem[] = []
  const groupHtml = groups.map(g => {
    const tiles = g.items.map(item => {
      const i = flat.length
      flat.push(item)
      return renderTile(item, i)
    }).join('')
    return `<section><h3 class="section-title">${esc(g.title)}</h3><div class="tiles">${tiles}</div></section>`
  }).join('')

  const s = report.summary
  const scored = s.passed + s.failed + s.abnormal + s.unsupported + s.expected + s.untested
  const totalSeg = Math.max(1, scored)
  const overrides = Object.entries(report.target.overrides || {}).filter(([, v]) => !!v)
  const overrideHtml = overrides.length
    ? `<div class="overrides">${overrides.map(([k, v]) => `<span class="chip">${esc(k)} · ${esc(v)}</span>`).join('')}</div>`
    : ''
  const targetLine = [report.target.channelName, report.target.baseUrl, report.target.model].filter(Boolean).join(' · ')
  const skippedNote = s.skipped > 0 ? `另有 ${s.skipped} 项未执行。` : ''
  const initial = theme?.initialTheme === 'dark' ? 'dark' : 'light'
  const liveStyle = theme?.liveCss ? ` style="${esc(theme.liveCss)}"` : ''
  const payload = JSON.stringify(flat.map(item => ({
    name: item.name,
    explain: item.explain,
    formatLabel: item.formatLabel,
    status: item.status,
    statusLabel: MATRIX_STATUS[item.status],
    detail: item.detail,
    duration: item.duration,
    usage: item.usage || null,
    cache: item.cache || null,
    tokenValues: item.tokenValues || null,
    checks: item.checks || null,
    url: item.url,
    http: item.http,
    requestId: item.requestId,
    body: item.body,
  }))).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="zh-CN" data-theme="${initial}"${liveStyle}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.name)}</title>
<script>
(function () {
  try {
    var t = localStorage.getItem('modelprobe-report-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.removeAttribute('style');
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
</script>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="ambient" aria-hidden="true"><i class="orb-a"></i><i class="orb-b"></i><i class="orb-c"></i></div>
<header class="top">
  <div class="brand">模型探测</div>
  <button type="button" class="theme-btn" id="themeBtn">深色模式</button>
</header>
<main class="wrap">
  <section class="hero">
    <div class="hero-row">
      <div>
        <div class="eyebrow">模型探测报告</div>
        <h1>${esc(report.name)}</h1>
        <p class="sub">${esc(targetLine)}</p>
        ${overrideHtml}
        ${renderOrigin(report.verdict)}
        <div class="meta">
          <span><b>开始</b>${esc(fmtTime(report.startedAt))}</span>
          <span><b>完成</b>${esc(fmtTime(report.completedAt))}</span>
        </div>
      </div>
      <div class="hero-time">
        <div class="t mono">${esc((report.durationMs / 1000).toFixed(1))}s</div>
        <div class="d">总耗时</div>
      </div>
    </div>
  </section>
  <section class="stats" aria-label="结果统计">
    <div class="stat"><div class="k">通过</div><div class="v ${statClass('ok', s.passed)}">${s.passed}</div></div>
    <div class="stat"><div class="k">失败</div><div class="v ${statClass('err', s.failed)}">${s.failed}</div></div>
    <div class="stat"><div class="k">异常</div><div class="v ${statClass('abn', s.abnormal)}">${s.abnormal}</div></div>
    <div class="stat"><div class="k">不支持</div><div class="v ${statClass('warn', s.unsupported)}">${s.unsupported}</div></div>
    <div class="stat"><div class="k">符合预期</div><div class="v ${statClass('info', s.expected)}">${s.expected}</div></div>
    <div class="stat"><div class="k">未测</div><div class="v ${s.untested > 0 ? '' : 'zero'}">${s.untested}</div></div>
    <div class="stat"><div class="k">已跳过</div><div class="v ${s.skipped > 0 ? '' : 'zero'}">${s.skipped}</div></div>
  </section>
  <div class="bar" aria-hidden="true">
    <i class="ok" style="width:${(s.passed / totalSeg) * 100}%"></i>
    <i class="info" style="width:${(s.expected / totalSeg) * 100}%"></i>
    <i class="err" style="width:${(s.failed / totalSeg) * 100}%"></i>
    <i class="abn" style="width:${(s.abnormal / totalSeg) * 100}%"></i>
    <i class="warn" style="width:${(s.unsupported / totalSeg) * 100}%"></i>
    <i class="mute" style="width:${(s.untested / totalSeg) * 100}%"></i>
  </div>
  ${skippedNote ? `<p class="footer">${esc(skippedNote)}</p>` : ''}
  ${groupHtml}
</main>
${probeSheetDocument(payload, '.tile')}
</body>
</html>`
}

function probeSheetDocument(payload: string, clickSelector: string): string {
  return `<div class="overlay" id="overlay" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-head">
      <div>
        <div class="tile-top" style="width:auto;gap:8px">
          <span class="pill" id="sheetPill"></span>
          <span class="chip" id="sheetFmt" hidden></span>
        </div>
        <h2 id="sheetTitle"></h2>
        <p class="explain" id="sheetExplain"></p>
      </div>
      <button type="button" class="close" id="sheetClose">关闭</button>
    </div>
    <p class="detail" id="sheetDetail"></p>
    <div class="checks" id="sheetChecks"></div>
    <div class="facts" id="sheetFacts"></div>
    <div class="repro-line" id="sheetMeta"></div>
    <div class="block" id="sheetBodyWrap" hidden>
      <div class="lbl">请求体</div>
      <div class="codewrap">
        <button type="button" class="copy" id="copyBtn" aria-label="复制" title="复制"></button>
        <pre class="mono" id="sheetBody"></pre>
      </div>
    </div>
  </div>
</div>
<script>window.__PROBE_ITEMS = ${payload}</script>
<script>
(function () {
  var items = window.__PROBE_ITEMS || [];
  var overlay = document.getElementById('overlay');
  var btn = document.getElementById('themeBtn');
  var copyBtn = document.getElementById('copyBtn');
  var openIndex = -1;
  var COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
  var CHECK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
  function resetCopyBtn() {
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.classList.remove('is-ok');
    copyBtn.setAttribute('aria-label', '复制');
  }
  resetCopyBtn();
  function pretty(v) {
    try { return JSON.stringify(v, null, 2); } catch (e) { return String(v == null ? '' : v); }
  }
  function labelTheme() {
    btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '浅色模式' : '深色模式';
  }
  labelTheme();
  btn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.removeAttribute('style');
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('modelprobe-report-theme', next); } catch (e) {}
    labelTheme();
  });
  function closeSheet() {
    overlay.classList.remove('is-on');
    overlay.hidden = true;
    document.body.style.overflow = '';
    openIndex = -1;
  }
  function openSheet(i) {
    var item = items[i];
    if (!item) return;
    openIndex = i;
    document.getElementById('sheetTitle').textContent = item.name;
    document.getElementById('sheetExplain').textContent = item.explain || '';
    document.getElementById('sheetDetail').textContent = item.detail || '';
    var checksEl = document.getElementById('sheetChecks');
    checksEl.textContent = '';
    (item.checks || []).forEach(function (c) {
      var s = document.createElement('span');
      s.className = 'check ' + (c.passed ? 'ok' : 'err');
      s.textContent = (c.passed ? '✓ ' : '✗ ') + c.detail;
      checksEl.appendChild(s);
    });
    var pill = document.getElementById('sheetPill');
    pill.className = 'pill ' + item.status;
    pill.textContent = item.statusLabel;
    var fmt = document.getElementById('sheetFmt');
    if (item.formatLabel) { fmt.hidden = false; fmt.textContent = item.formatLabel; }
    else fmt.hidden = true;
    var facts = document.getElementById('sheetFacts');
    facts.textContent = '';
    function addFact(label, text) {
      var s = document.createElement('span');
      var em = document.createElement('em');
      em.textContent = label;
      s.appendChild(em);
      s.appendChild(document.createTextNode(text));
      facts.appendChild(s);
    }
    if (item.duration != null) addFact('耗时', item.duration + ' ms');
    addFact('用量', '↑' + (item.usage && item.usage.input != null ? item.usage.input : '—') + ' ↓' + (item.usage && item.usage.output != null ? item.usage.output : '—') + ' 缓存读' + (item.usage && item.usage.cacheRead != null ? item.usage.cacheRead : '—') + ' 写' + (item.usage && item.usage.cacheWrite != null ? item.usage.cacheWrite : '—'));
    if (item.cache) addFact('缓存', item.cache.hits + '/' + item.cache.total + ' 次命中');
    if (item.tokenValues && item.tokenValues.length) addFact('输入 Token', item.tokenValues.join(', '));
    var meta = document.getElementById('sheetMeta');
    meta.textContent = '';
    function addTag(text) {
      var s = document.createElement('span');
      s.className = 'tag mono';
      s.textContent = text;
      meta.appendChild(s);
    }
    if (item.url) addTag('POST ' + item.url);
    if (item.http != null) addTag('HTTP ' + item.http);
    if (item.requestId) addTag('Request ID ' + item.requestId);
    var wrap = document.getElementById('sheetBodyWrap');
    if (item.body == null) wrap.hidden = true;
    else {
      wrap.hidden = false;
      document.getElementById('sheetBody').textContent = pretty(item.body);
      resetCopyBtn();
    }
    overlay.hidden = false;
    overlay.classList.add('is-on');
    document.body.style.overflow = 'hidden';
  }
  document.querySelectorAll(${JSON.stringify(clickSelector)}).forEach(function (el) {
    el.addEventListener('click', function () { openSheet(Number(el.getAttribute('data-i'))); });
  });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  copyBtn.addEventListener('click', function () {
    var item = items[openIndex];
    if (!item || item.body == null) return;
    var text = pretty(item.body);
    var done = function () {
      copyBtn.innerHTML = CHECK_ICON;
      copyBtn.classList.add('is-ok');
      copyBtn.setAttribute('aria-label', '已复制');
      setTimeout(resetCopyBtn, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(done);
    else done();
  });
})();
</script>`
}

const MATRIX_CSS = `
.matrix-bleed{width:max-content;min-width:100%;padding:0 clamp(16px,4vw,36px) clamp(56px,8vw,96px)}
table.matrix{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
.matrix th,.matrix td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle;background:var(--bg);white-space:nowrap}
.matrix thead th{position:sticky;top:48px;z-index:2;font-size:12px;font-weight:600;color:var(--text);text-align:left;box-shadow:inset 0 -1px 0 var(--border)}
.matrix .rowh{position:sticky;left:0;z-index:1;min-width:14rem;text-align:left;font-size:13px;font-weight:600;color:var(--text)}
.matrix thead .rowh{z-index:3}
.matrix .mx-group td{position:static;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);background:var(--s1);text-align:left}
.matrix-cell{appearance:none;border:0;background:transparent;padding:0;font:inherit;font-size:12px;font-weight:600;cursor:pointer;color:inherit}
.matrix td.gap{color:var(--t3);text-align:center}
.matrix .row-sub{display:block;margin-top:4px}
.dot-st.skipped{color:var(--t3)}
.pill.skipped{background:var(--s2);color:var(--t3)}
@media print{
  .matrix thead th,.matrix .rowh{position:static}
}
`

function matrixChannelOf(report: ProbeHtmlReport): string {
  return (report.target.channelName || '').trim() || report.target.baseUrl || ''
}

export function probeMatrixColumnLabels(reports: ProbeHtmlReport[]): string[] {
  const mixed = new Set(reports.map(matrixChannelOf)).size > 1
  const base = reports.map(report => {
    const model = report.target.model || '未命名模型'
    const channel = matrixChannelOf(report)
    return mixed && channel ? `${model} · ${channel}` : model
  })
  const counts = new Map<string, number>()
  for (const label of base) counts.set(label, (counts.get(label) ?? 0) + 1)
  return reports.map((report, index) => {
    const label = base[index]
    if ((counts.get(label) ?? 0) < 2) return label
    return `${label} · ${fmtTime(report.completedAt)}`
  })
}

function unionResultKeys(id: string, reports: ProbeHtmlReport[]): string[] {
  const keys = new Set<string>()
  for (const report of reports) {
    for (const key of resultKeysOf(id, report.results)) keys.add(key)
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

function formatLabelOfKey(key: string, reports: ProbeHtmlReport[], formatLabels: Record<string, string>): string {
  for (const report of reports) {
    const result = report.results[key]
    if (!result) continue
    const fmt = result.format || formatOfKey(key)
    if (fmt) return formatLabels[fmt] || fmt
  }
  const fmt = formatOfKey(key)
  return fmt ? (formatLabels[fmt] || fmt) : ''
}

function matrixItemPayload(item: ProbeHtmlItem) {
  return {
    name: item.name,
    explain: item.explain,
    formatLabel: item.formatLabel,
    status: item.status,
    statusLabel: MATRIX_STATUS[item.status],
    detail: item.detail,
    duration: item.duration,
    usage: item.usage || null,
    cache: item.cache || null,
    tokenValues: item.tokenValues || null,
    checks: item.checks || null,
    url: item.url,
    http: item.http,
    requestId: item.requestId,
    body: item.body,
  }
}

export function buildProbeMatrixHtml(
  reports: ProbeHtmlReport[],
  tests: ProbeHtmlTestMeta[],
  formatLabels: Record<string, string>,
  theme?: ProbeHtmlTheme,
): string {
  const list = reports.map(sanitizeHtmlReport)
  const labels = probeMatrixColumnLabels(list)
  const flat: ProbeHtmlItem[] = []
  let rows = ''
  let lastGroup = ''
  const colspan = list.length + 1
  for (const test of tests) {
    const keys = unionResultKeys(test.id, list)
    if (!keys.length) continue
    if (test.group !== lastGroup) {
      lastGroup = test.group
      rows += `<tr class="mx-group"><td colspan="${colspan}">${esc(test.group)}</td></tr>`
    }
    for (const key of keys) {
      const formatLabel = formatLabelOfKey(key, list, formatLabels)
      const cells = list.map(report => {
        const result = report.results[key]
        if (!result) return '<td class="gap">—</td>'
        const fmt = result.format || formatOfKey(key)
        const item: ProbeHtmlItem = {
          name: test.name,
          explain: test.explain,
          formatLabel: fmt ? (formatLabels[fmt] || fmt) : formatLabel,
          status: result.status,
          detail: result.detail,
          duration: result.duration,
          usage: result.usage,
          cache: result.cache,
          tokenValues: result.tokenValues,
          checks: result.checks,
          url: result.repro?.url || '',
          http: result.repro?.status ?? null,
          requestId: result.repro?.requestId ?? null,
          body: result.repro ? result.repro.body : null,
        }
        const index = flat.length
        flat.push(item)
        const statusLabel = MATRIX_STATUS[result.status]
        return `<td><button type="button" class="matrix-cell dot-st ${esc(result.status)}" data-i="${index}" aria-label="${esc(`${test.name} ${formatLabel} ${statusLabel}`)}">${esc(statusLabel)}</button></td>`
      }).join('')
      rows += `<tr><th class="rowh" scope="row">${esc(test.name)}${formatLabel ? `<span class="chip row-sub">${esc(formatLabel)}</span>` : ''}</th>${cells}</tr>`
    }
  }
  const head = labels.map(label => `<th scope="col">${esc(label)}</th>`).join('')
  const payload = JSON.stringify(flat.map(matrixItemPayload)).replace(/</g, '\\u003c')
  const initial = theme?.initialTheme === 'dark' ? 'dark' : 'light'
  const liveStyle = theme?.liveCss ? ` style="${esc(theme.liveCss)}"` : ''
  const css = REPORT_CSS.split('.tile').join('.x-card') + MATRIX_CSS
  return `<!doctype html>
<html lang="zh-CN" data-theme="${initial}"${liveStyle}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>模型对比</title>
<script>
(function () {
  try {
    var t = localStorage.getItem('modelprobe-report-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.removeAttribute('style');
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
</script>
<style>${css}</style>
</head>
<body>
<div class="ambient" aria-hidden="true"><i class="orb-a"></i><i class="orb-b"></i><i class="orb-c"></i></div>
<header class="top">
  <div class="brand">模型探测</div>
  <button type="button" class="theme-btn" id="themeBtn">深色模式</button>
</header>
<main>
  <div class="wrap">
    <section class="hero">
      <div class="eyebrow">模型对比</div>
      <h1>模型对比</h1>
      <p class="sub">${list.length} 份报告</p>
    </section>
  </div>
  <div class="matrix-bleed">
    <table class="matrix">
      <thead><tr><th class="rowh" scope="col">测试项</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</main>
${probeSheetDocument(payload, '.matrix-cell')}
</body>
</html>`
}

export function probeReportHtmlFileName(name: string): string {
  const base = String(name || 'modelprobe-report')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60) || 'modelprobe-report'
  return `${base}.html`
}

export function downloadProbeReportHtml(
  report: ProbeHtmlReport,
  tests: ProbeHtmlTestMeta[],
  formatLabels: Record<string, string>,
): void {
  const html = buildProbeReportHtml(report, tests, formatLabels, captureProbeExportTheme())
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = probeReportHtmlFileName(report.name)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function probeMatrixHtmlFileName(count: number): string {
  return probeReportHtmlFileName(`模型对比_${count}`)
}

export function downloadProbeMatrixHtml(
  reports: ProbeHtmlReport[],
  tests: ProbeHtmlTestMeta[],
  formatLabels: Record<string, string>,
): void {
  const html = buildProbeMatrixHtml(reports, tests, formatLabels, captureProbeExportTheme())
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = probeMatrixHtmlFileName(reports.length)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
