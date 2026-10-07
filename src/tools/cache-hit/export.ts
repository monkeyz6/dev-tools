// 矩阵的自包含 HTML。弹层带原句、五项指标和轮次表，不嵌图表。

import {
  cacheMatrixCell, cacheMatrixColumns, cacheMatrixGroups, cachePct, cacheVerdictOf,
  type CacheCaseId, type CacheFormat, type CacheMatrixReport, type CacheVerdictInput,
} from './matrix'

export interface CacheMatrixRound {
  round: number
  warmup: boolean
  status: 'ok' | 'error'
  httpStatus: number | null
  durationMs: number | null
  usage: { totalPrompt: number | null; cacheRead: number | null; cacheWrite: number | null; output: number | null }
  hit: boolean
  error?: string
}

export interface CacheMatrixProtocol extends CacheVerdictInput {
  rounds: CacheMatrixRound[]
  failedRounds: number
  savedTokens: number
  cacheWriteTokens: number
  hitAvgMs: number | null
  promptCacheKeyDropped?: boolean
}

export type CacheMatrixHtmlReport = CacheMatrixReport<CacheMatrixProtocol>

interface SheetItem {
  title: string
  model: string
  word: string
  tone: 'ok' | 'warn' | 'err'
  detail: string
  dropped: boolean
  stats: { label: string; value: string }[]
  errors: string[]
  rounds: { cells: string[] }[]
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\$\{/g, () => '$\\u007b')
}

const cellText = (v: number | null): string => (v == null ? '—' : String(v))

function sheetItem(caseId: CacheCaseId, title: string, model: string, result: CacheMatrixProtocol): SheetItem {
  const verdict = cacheVerdictOf(result, caseId)
  const hitSub = `${result.hitCount}/${result.measured} 轮${result.failedRounds ? ` · 失败 ${result.failedRounds}` : ''}`
  return {
    title,
    model,
    word: verdict.word,
    tone: verdict.tone,
    detail: verdict.text,
    dropped: !!result.promptCacheKeyDropped,
    stats: [
      { label: '请求级命中率', value: `${cachePct(result.hitRate)} · ${hitSub}` },
      { label: 'Token 覆盖率', value: cachePct(result.coverage) },
      { label: '节省 Token', value: String(result.savedTokens) },
      { label: '缓存写入', value: result.cacheWriteTokens > 0 ? String(result.cacheWriteTokens) : '—' },
      { label: '命中均延迟', value: result.hitAvgMs != null ? `${result.hitAvgMs} ms` : '—' },
    ],
    errors: result.rounds.filter(round => round.status === 'error').map(round => `${round.warmup ? '预热' : `#${round.round}`} 失败：${round.error || ''}`),
    rounds: result.rounds.map(round => {
      const uncached = round.usage.totalPrompt != null
        ? Math.max(0, round.usage.totalPrompt - (round.usage.cacheRead ?? 0) - (round.usage.cacheWrite ?? 0))
        : null
      const judge = round.status === 'error' ? '失败' : round.warmup ? (round.hit ? '预热已命中' : '预热') : (round.hit ? '命中' : '未命中')
      return {
        cells: [
          round.warmup ? '预热' : `#${round.round}`,
          judge,
          round.httpStatus == null ? 'ERR' : String(round.httpStatus),
          cellText(round.usage.totalPrompt),
          cellText(round.usage.cacheRead),
          cellText(round.usage.cacheWrite),
          cellText(uncached),
          cellText(round.usage.output),
          round.durationMs != null ? `${round.durationMs} ms` : '—',
        ],
      }
    }),
  }
}

const PAGE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:auto!important;min-height:100%;margin:0;overflow:visible!important}
html.is-locked{overflow:hidden!important}
html{
  --pad:clamp(16px,4vw,36px);--topH:52px;
  -webkit-font-smoothing:antialiased;text-size-adjust:100%;
  background:var(--bg);color-scheme:light;
}
html[data-theme="light"]{
  --bg:#f5f7fb;--text:#182033;--t2:#5b6475;--t3:#7d8598;
  --line:rgba(24,32,51,.075);--fill:rgba(24,32,51,.045);--fillHover:rgba(24,32,51,.08);
  --ok:#15803d;--okBg:rgba(21,128,61,.09);
  --err:#dc2626;--errBg:rgba(220,38,38,.08);
  --warn:#b45309;--warnBg:rgba(180,83,9,.09);
  --sheet:#fff;--scrim:rgba(20,28,48,.30);
  --shadowMd:0 24px 60px -24px rgba(20,28,48,.35),0 2px 8px rgba(20,28,48,.06);
}
html[data-theme="dark"]{
  color-scheme:dark;
  --bg:#0b0d14;--text:#e9ebf2;--t2:#9aa3b4;--t3:#7a849a;
  --line:rgba(255,255,255,.08);--fill:rgba(255,255,255,.055);--fillHover:rgba(255,255,255,.09);
  --ok:#34d399;--okBg:rgba(52,211,153,.11);
  --err:#ff6b81;--errBg:rgba(255,107,129,.11);
  --warn:#ffc24b;--warnBg:rgba(255,194,75,.11);
  --sheet:#131622;--scrim:rgba(0,0,0,.55);
  --shadowMd:0 24px 60px -20px rgba(0,0,0,.7);
}
body{background:var(--bg);color:var(--text);font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif}
.mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
.top{position:sticky;top:0;z-index:20;height:var(--topH);display:flex;align-items:center;justify-content:space-between;padding:0 var(--pad);background:var(--bg);border-bottom:1px solid var(--line)}
.brand{font-size:13px;font-weight:600;color:var(--t2)}
.icon-btn{appearance:none;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--t3);cursor:pointer}
.icon-btn svg{width:16px;height:16px;display:block;margin:auto}
html[data-theme="dark"] .i-moon,html:not([data-theme="dark"]) .i-sun{display:none}
.matrix-bleed{width:max-content;min-width:100%;padding:12px var(--pad) 64px}
table.matrix{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
.matrix th,.matrix td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left;white-space:nowrap;background:var(--bg)}
.matrix tbody tr:last-child>*{border-bottom:0}
.matrix thead th{position:sticky;top:var(--topH);z-index:2;background:var(--bg);font-weight:400;vertical-align:bottom}
.col-model{display:block;font-size:13px;font-weight:600;color:var(--text)}
.col-src{display:block;margin-top:1px;font-size:12px;color:var(--t3)}
.matrix thead .rowh{z-index:3;font-size:12px;font-weight:500;color:var(--t3)}
.matrix .rowh{position:sticky;left:0;z-index:1;min-width:14rem;font-size:13px;font-weight:500;color:var(--text);background:var(--bg)}
.matrix .mx-group td{padding:26px 16px 8px;border-bottom:0;font-size:12px;font-weight:600;color:var(--t2);background:var(--bg)}
.matrix .mx-group:first-child td{padding-top:8px}
.matrix .mx-group span{position:sticky;left:16px;background:var(--bg);padding-right:12px}
.matrix-cell{appearance:none;border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:500;color:inherit;margin:-5px -9px;padding:5px 9px;border-radius:8px;cursor:pointer}
.matrix-cell:hover{background:var(--fillHover)}
.matrix td.gap{color:var(--t3);text-align:center}
.dot-st{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.dot-st::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--c,var(--t3));flex-shrink:0}
.dot-st.ok{--c:var(--ok);color:var(--ok)}
.dot-st.warn{--c:var(--warn);color:var(--warn)}
.dot-st.err{--c:var(--err);color:var(--err)}
.overlay{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;padding:24px 16px;background:var(--scrim)}
.overlay.is-on{display:flex}
.sheet{width:min(1120px,100%);max-height:min(86vh,900px);overflow:auto;padding:22px 24px 24px;border-radius:16px;background:var(--sheet);border:1px solid var(--line);box-shadow:var(--shadowMd)}
.sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.sheet-title{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;min-width:0}
.sheet-title h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.model{font-size:12px;color:var(--t3)}
.detail{margin:14px 0 0;font-size:14px;line-height:1.6}
.dropped{display:inline-flex;margin-top:10px;padding:2px 8px;border-radius:999px;background:var(--warnBg);color:var(--warn);font-size:11px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:16px}
.stat{padding:12px 14px;border:1px solid var(--line);border-radius:12px}
.stat em{display:block;font-style:normal;font-size:11px;color:var(--t3)}
.stat b{display:block;margin-top:4px;font-size:16px;font-weight:650}
.errors{margin-top:12px;color:var(--err);font-size:12px}
.errors p{margin:4px 0}
table.rounds{width:100%;margin-top:16px;border-collapse:collapse;font-size:12.5px}
table.rounds th,table.rounds td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
table.rounds th{font-size:11px;color:var(--t2);font-weight:600}
table.rounds td.num,table.rounds th.num{text-align:right;font-variant-numeric:tabular-nums}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{.top,.overlay{display:none!important}.matrix thead th,.matrix .rowh,.matrix .mx-group span{position:static}}
`

const SHEET_SCRIPT = `
(function () {
  var items = window.__CACHE_ITEMS || [];
  var root = document.documentElement;
  var overlay = document.getElementById('overlay');
  var themeBtn = document.getElementById('themeBtn');
  var lastFocus = null;
  function labelTheme() {
    var label = root.getAttribute('data-theme') === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  }
  labelTheme();
  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('cachehit-report-theme', next); } catch (e) {}
    labelTheme();
  });
  function closeSheet() {
    overlay.classList.remove('is-on');
    overlay.hidden = true;
    root.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function fill(id, text) {
    var el = document.getElementById(id);
    el.textContent = text || '';
    return el;
  }
  function openSheet(i) {
    var item = items[i];
    if (!item) return;
    var pill = fill('sheetPill', item.word);
    pill.className = 'dot-st ' + item.tone;
    fill('sheetTitle', item.title);
    fill('sheetModel', item.model);
    var detail = fill('sheetDetail', item.detail);
    detail.hidden = !item.detail;
    var dropped = document.getElementById('sheetDropped');
    dropped.hidden = !item.dropped;
    var stats = document.getElementById('sheetStats');
    stats.textContent = '';
    (item.stats || []).forEach(function (stat) {
      var box = document.createElement('div');
      box.className = 'stat';
      var em = document.createElement('em');
      em.textContent = stat.label;
      var b = document.createElement('b');
      b.textContent = stat.value;
      box.appendChild(em);
      box.appendChild(b);
      stats.appendChild(box);
    });
    var errors = document.getElementById('sheetErrors');
    errors.textContent = '';
    (item.errors || []).forEach(function (line) {
      var p = document.createElement('p');
      p.textContent = line;
      errors.appendChild(p);
    });
    errors.hidden = !errors.children.length;
    var body = document.getElementById('sheetRounds');
    body.textContent = '';
    (item.rounds || []).forEach(function (round) {
      var tr = document.createElement('tr');
      (round.cells || []).forEach(function (text, index) {
        var td = document.createElement('td');
        if (index > 1) td.className = 'num mono';
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    document.getElementById('sheetTable').hidden = !body.children.length;
    overlay.hidden = false;
    overlay.classList.add('is-on');
    root.classList.add('is-locked');
    document.getElementById('sheetClose').focus();
  }
  document.querySelectorAll('.matrix-cell').forEach(function (el) {
    el.addEventListener('click', function () {
      lastFocus = el;
      openSheet(Number(el.getAttribute('data-i')));
    });
  });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) closeSheet(); });
})();
`

export function buildCacheMatrixHtml(reports: CacheMatrixHtmlReport[]): string {
  const labels = cacheMatrixColumns(reports)
  const groups = cacheMatrixGroups(reports)
  const flat: SheetItem[] = []
  const colspan = reports.length + 1
  let rows = ''
  for (const group of groups) {
    rows += `<tr class="mx-group"><td colspan="${colspan}"><span>${esc(group.title)}</span></td></tr>`
    for (const row of group.rows) {
      const cells = reports.map(report => {
        const result = cacheMatrixCell(report, group.caseId, row.format)
        if (!result) return '<td class="gap">—</td>'
        const item = sheetItem(group.caseId, `${group.title} · ${row.label}`, report.target.model || '未命名模型', result)
        const index = flat.length
        flat.push(item)
        const aria = `${group.title} ${row.label} ${item.word} ${item.detail}`
        return `<td><button type="button" class="matrix-cell dot-st ${esc(item.tone)}" data-i="${index}" aria-label="${esc(aria)}">${esc(item.word)}</button></td>`
      }).join('')
      rows += `<tr><th class="rowh" scope="row">${esc(row.label)}</th>${cells}</tr>`
    }
  }
  const head = labels.map(column => `<th scope="col"><span class="col-model">${esc(column.model)}</span>${column.source ? `<span class="col-src">${esc(column.source)}</span>` : ''}</th>`).join('')
  const roundHead = ['轮次', '判定', 'HTTP', '总输入', '缓存读', '缓存写', '未缓存', '输出', '耗时']
    .map((name, index) => `<th${index > 1 ? ' class="num"' : ''}>${name}</th>`).join('')
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>缓存命中率</title>
<script>
(function () {
  try {
    var t = localStorage.getItem('cachehit-report-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="top">
  <div class="brand">缓存命中率</div>
  <button type="button" class="icon-btn" id="themeBtn"><svg class="i-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M13.3 9.4A5.6 5.6 0 0 1 6.6 2.7a5.6 5.6 0 1 0 6.7 6.7z"/></svg><svg class="i-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5"/></svg></button>
</header>
<main>
  <div class="matrix-bleed">
    <table class="matrix">
      <thead><tr><th class="rowh" scope="col">协议</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</main>
<div class="overlay" id="overlay" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-head">
      <div class="sheet-title">
        <span class="dot-st" id="sheetPill"></span>
        <h2 id="sheetTitle"></h2>
        <span class="model" id="sheetModel"></span>
      </div>
      <button type="button" class="icon-btn" id="sheetClose" aria-label="关闭" title="关闭"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
    </div>
    <p class="detail" id="sheetDetail"></p>
    <div class="dropped" id="sheetDropped" hidden>已去掉 prompt_cache_key</div>
    <div class="stats" id="sheetStats"></div>
    <div class="errors" id="sheetErrors"></div>
    <table class="rounds" id="sheetTable">
      <thead><tr>${roundHead}</tr></thead>
      <tbody id="sheetRounds"></tbody>
    </table>
  </div>
</div>
<script>window.__CACHE_ITEMS = ${embedJson(flat)};</script>
<script>${SHEET_SCRIPT}</script>
</body>
</html>`
}

export function cacheMatrixHtmlFileName(count: number): string {
  return `缓存命中率_${count}.html`
}

export function downloadCacheMatrixHtml(reports: CacheMatrixHtmlReport[]): void {
  const html = buildCacheMatrixHtml(reports)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = cacheMatrixHtmlFileName(reports.length)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
