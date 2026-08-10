import type { Report } from '../shared/llm-report'

// 导出：自包含单文件 HTML 报告（内嵌 echarts + 深/浅主题切换，与 StreamBench 参考一致）
// echarts 源码经 Vite `?raw` 取为字符串，仅进入本工具的懒加载 chunk
import echartsSource from 'echarts/dist/echarts.min.js?raw'

// 图表配色（与前端 recharts 用 CSS 变量同源：accent 橙/蓝双色 + 成功绿 + 失败红）
const REPORT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html[data-theme="dark"] {
  --bg:#0b0b13; --glass:#14141f; --glass2:#191927;
  --glassBorder:rgba(255,255,255,.07); --glassBorder2:rgba(255,255,255,.1);
  --hl:rgba(255,255,255,.05); --ink:#f2f3f8; --sub:#9fa3b8; --sub2:#c6cad9;
  --mut:#63687f; --acc:#ff8a3d; --accA:#ff7a2f; --accB:#ffb45c; --accT:255,138,61;
  --dim:rgba(255,255,255,.07); --line:rgba(255,255,255,.05);
  --warn:#e8b345; --bad:#f0566a; --ok:#51d18f;
}
html[data-theme="light"] {
  --bg:#f3f3f6; --glass:#ffffff; --glass2:#f7f7fa;
  --glassBorder:rgba(22,24,44,.08); --glassBorder2:rgba(22,24,44,.1);
  --hl:rgba(255,255,255,.9); --ink:#1a1c2e; --sub:#5c6076; --sub2:#3c405a;
  --mut:#9094ab; --acc:#cf5b10; --accA:#f07524; --accB:#ffb45c; --accT:240,117,36;
  --dim:rgba(22,24,44,.06); --line:rgba(22,24,44,.05);
  --warn:#96660f; --bad:#d3453a; --ok:#128a50;
}
body { background: var(--bg); color: var(--ink);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  padding: 28px clamp(12px, 4vw, 40px) 40px; transition: background .2s, color .2s; }
.mono { font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace; }
.wrap { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.eyebrow { font-family: ui-monospace, monospace; font-size: 10.5px; letter-spacing: 3px; color: var(--acc); }
h1 { font-size: 28px; font-weight: 700; letter-spacing: -.4px; }
.badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; background: rgba(var(--accT),.15); color: var(--acc); vertical-align: 4px; margin-left: 10px; }
.subline { font-size: 12px; color: var(--sub); margin-top: 4px; line-height: 1.6; }
.card { background: var(--glass); border: 1px solid var(--glassBorder); border-radius: 18px; padding: 16px 18px; box-shadow: inset 0 1px 0 var(--hl); }
.cards6 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.stat { background: var(--glass); border: 1px solid var(--glassBorder); border-radius: 14px; padding: 12px 14px; }
.stat .k { font-size: 10.5px; font-weight: 600; color: var(--sub); }
.stat .v { font-family: ui-monospace, monospace; font-size: 21px; font-weight: 700; }
.stat .v.acc { color: var(--acc); }
.stat .n { font-size: 10px; color: var(--mut); margin-top: 2px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(460px, 100%), 1fr)); gap: 12px; }
.chart-card h2, .card h2 { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.chart { width: 100%; height: 230px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; font-size: 11px; color: var(--mut); font-weight: 700; padding: 8px 10px; border-bottom: 1px solid var(--dim); letter-spacing: .4px; }
td { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--sub2); }
td.num, th.num { text-align: right; font-family: ui-monospace, monospace; }
details { border: 1px solid var(--glassBorder); border-radius: 14px; background: var(--glass2); }
details > summary { cursor: pointer; padding: 12px 18px; font-size: 13px; font-weight: 700; color: var(--sub2); list-style: none; }
details > summary::before { content: '▸ '; color: var(--acc); }
details[open] > summary::before { content: '▾ '; }
details > .inner { padding: 0 18px 14px; overflow-x: auto; }
.footer { font-size: 11.5px; color: var(--mut); line-height: 1.8; }
.scroll-x { overflow-x: auto; }
.bar { display: inline-block; height: 9px; border-radius: 3px; vertical-align: -1px; margin-right: 6px; }
.theme-toggle { position: fixed; top: 16px; right: 16px; z-index: 99; font: inherit; font-size: 12px; font-weight: 600; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--glassBorder2); background: var(--glass); color: var(--sub2); cursor: pointer; box-shadow: 0 4px 14px -6px rgba(0,0,0,.3); }
.theme-toggle:hover { filter: brightness(1.08); }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .chart { break-inside: avoid; } .theme-toggle { display: none; } }
`

// 内嵌图表 builder（经典脚本；无模板字面量，与模板字符串安全共存）
const CHART_BUILDERS_JS = `
'use strict';
window.LR = window.LR || {};
(function () {
  var P = function (dark) {
    return {
      ink: dark ? '#f2f3f8' : '#1a1c2e',
      mut: dark ? '#9fa3b8' : '#9094ab',
      grid: dark ? 'rgba(255,255,255,.09)' : 'rgba(26,28,46,.08)',
      acc: dark ? '#ff7a2f' : '#f07524',
      accD: dark ? '#ff8a3d' : '#cf5b10',
      accT: dark ? '255,138,61' : '240,117,36',
      accS: dark ? '224,122,46' : '207,91,16',
      ok: dark ? '#51d18f' : '#128a50',
      bad: dark ? '#f0566a' : '#d3453a',
      warn: dark ? '#e8b345' : '#96660f',
      blue: '#2f7fd1',
      sextet: dark ? ['#ff8a3d','#8b7cf6','#2fd4b2','#ffc94d','#f65e7a','#4db8ff'] : ['#e0621a','#6d5ce6','#0fa88a','#d99a16','#d94f68','#2b8fd8'],
      errCols: ['#ffb340','#c2483e','#8ba194','#40d2ff','#8b7cf6','#2fd4b2'],
    };
  };
  function axis(p) {
    return { axisLine:{lineStyle:{color:p.grid}}, axisLabel:{color:p.mut,fontSize:10,fontFamily:'JetBrains Mono, monospace'}, splitLine:{lineStyle:{color:p.grid}} };
  }
  function legend(p) { return { top:0, left:0, itemWidth:14, itemHeight:8, textStyle:{color:p.mut,fontSize:10.5} }; }
  function grad(p) { return { type:'linear', x:0, y:0, x2:0, y2:1, colorStops:[{offset:0,color:p.acc},{offset:1,color:'#ffb45c'}] }; }
  function baseGrid(l,r,t,b) { return { left:l, right:r, top:t, bottom:b }; }
  function merge(a,b){ var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o; }

  // ① TTFT 直方图
  window.LR.tHist = function (rep, dark) {
    var p = P(dark), h = rep.ttftHist;
    if (!h) return { title:{ text:'无流式样本', textStyle:{color:p.mut,fontSize:12}, left:'center', top:'middle' } };
    var step = h.bins.length > 1 ? h.bins[1] - h.bins[0] : 1;
    var bidx = function (v) { return v == null ? -1 : Math.max(0, Math.min(h.bins.length - 1, Math.floor((v - h.bins[0]) / step))); };
    return {
      grid: baseGrid(44, 12, 30, 26),
      tooltip: {},
      xAxis: merge({ type:'category', data:h.bins.map(function(b){return Math.round(b);}), name:'ms', nameTextStyle:{color:p.mut} }, axis(p)),
      yAxis: merge({ type:'value' }, axis(p)),
      series: [{
        type:'bar', data:h.counts, barMaxWidth:18,
        itemStyle:{ color: grad(p), borderRadius:[4,4,0,0] },
        markLine: { symbol:'none', lineStyle:{ color:p.warn, type:'dashed' }, label:{ color:p.warn, fontSize:10, fontFamily:'monospace' },
          data:[
            { xAxis: bidx(h.p50), name:'P50', label:{ formatter:'P50 ' + rep.ttftStream.p50 } },
            { xAxis: bidx(h.p99), name:'P99', label:{ formatter:'P99 ' + rep.ttftStream.p99 } },
          ] },
      }],
    };
  };

  // ② 成功/失败堆叠时序
  window.LR.tSeries = function (rep, dark) {
    var p = P(dark);
    return {
      grid: baseGrid(36, 12, 34, 44),
      tooltip: { trigger:'axis' },
      legend: legend(p),
      xAxis: merge({ type:'category', data:rep.series.map(function(s){return s.label;}), axisLabel:{color:p.mut,fontSize:9.5,interval:0} }, axis(p)),
      yAxis: merge({ type:'value' }, axis(p)),
      series: [
        { name:'成功', type:'bar', stack:'r', barMaxWidth:14, itemStyle:{ color: grad(p) }, data:rep.series.map(function(s){return s.ok;}) },
        { name:'失败', type:'bar', stack:'r', barMaxWidth:14, itemStyle:{ color: p.bad }, data:rep.series.map(function(s){return s.fail;}) },
      ],
    };
  };

  // ③ Token 吞吐时序
  window.LR.tTokens = function (rep, dark) {
    var p = P(dark);
    return {
      grid: baseGrid(56, 14, 30, 44),
      tooltip: { trigger:'axis' },
      legend: legend(p),
      xAxis: merge({ type:'category', data:rep.series.map(function(s){return s.label;}), axisLabel:{color:p.mut,fontSize:9.5,interval:0} }, axis(p)),
      yAxis: merge({ type:'value' }, axis(p)),
      series: [
        { name:'输入', type:'line', smooth:true, symbol:'none', lineStyle:{color:p.acc,width:2}, areaStyle:{color:'rgba('+p.accT+',.2)'}, data:rep.series.map(function(s){return s.prompt;}) },
        { name:'输出', type:'line', smooth:true, symbol:'none', lineStyle:{color:p.blue,width:2}, areaStyle:{color:'rgba(47,127,209,.14)'}, data:rep.series.map(function(s){return s.completion;}) },
      ],
    };
  };

  // ④ 错误饼图
  window.LR.errPie = function (rep, dark) {
    var p = P(dark);
    if (!rep.byError.length) return { title:{ text:'无失败请求 ✓', textStyle:{ color:p.mut, fontSize:12 }, left:'center', top:'middle' } };
    var data = rep.byError.map(function(e, i){ return { name:e.key, value:e.count, itemStyle:{ color:p.errCols[i % p.errCols.length] } }; });
    return {
      tooltip: {},
      legend: { bottom:0, textStyle:{color:p.mut,fontSize:10} },
      series: [{ type:'pie', radius:['45%','68%'], center:['50%','44%'], label:{show:false}, data:data }],
    };
  };
})();
`

// 内嵌渲染脚本：统计卡 / 图表 / 分位数表 / 分组表 / 失败明细 / 参数快照
const RENDER_JS = `
'use strict';
(function () {
  var D = window.__REPORT_DATA;
  var app = document.getElementById('app');
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function fmtK(v) {
    if (v == null) return '—';
    return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : '' + v;
  }
  function pct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function ms(v) { return v == null ? '—' : Math.round(v) + 'ms'; }
  function sec(v) { return v == null ? '—' : Math.round(v * 10) / 10 + 's'; }
  function fmtTime(u) {
    var d = new Date(u * 1000), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // 主题切换
  function themeObj() { return { dark: document.documentElement.getAttribute('data-theme') !== 'light' }; }
  var toggle = el('button', 'theme-toggle');
  function syncLabel() { toggle.textContent = themeObj().dark ? '☀ 浅色模式' : '☾ 深色模式'; }
  toggle.onclick = function () {
    var next = themeObj().dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sb-report-theme', next); } catch (e) { /* noop */ }
    syncLabel(); renderCharts();
  };
  syncLabel();
  document.body.appendChild(toggle);

  // 头部
  var head = el('div');
  head.appendChild(el('div', 'eyebrow', 'LLM LOG REPORT · ' + esc(D.generatedAt.slice(0, 16).replace('T', ' '))));
  head.appendChild(el('h1', null, esc(D.title || 'LLM 日志性能分析报告') +
    (D.fail ? '<span class="badge" style="background:rgba(240,86,106,.15);color:#f0566a">失败 ' + D.fail + '</span>' : '')));
  var models = (D.models || []).slice(0, 5).join(' · ');
  head.appendChild(el('div', 'subline',
    '<span class="mono">' + esc(models) + '</span>' +
    (D.models.length > 5 ? ' 等 ' + D.models.length + ' 个模型' : '') +
    ' · 时间 ' + esc(fmtTime(D.timeStart)) + ' → ' + esc(fmtTime(D.timeEnd)) +
    (D.source && D.source.concurrency != null ? ' · 并发数 ' + D.source.concurrency : '')));
  app.appendChild(head);

  // 汇总卡
  var cards = el('div', 'cards6');
  [
    ['成功率', pct(D.successRate), true, D.ok + ' / ' + D.total],
    ['TTFT P50', ms(D.ttftStream ? D.ttftStream.p50 : null), false, '流式首 token'],
    ['TTFT P99', ms(D.ttftStream ? D.ttftStream.p99 : null), false, '长尾'],
    ['总请求数', D.total, false, '流式 ' + D.stream + ' / 非流式 ' + D.nonStream],
    ['总 tokens', fmtK(D.totalTokens), false, 'in ' + fmtK(D.promptTokens) + ' / out ' + fmtK(D.completionTokens)],
    ['平均总耗时', sec(D.useTime ? D.useTime.avg : null), false, 'P50 ' + sec(D.useTime ? D.useTime.p50 : null)],
  ].forEach(function (c) {
    var s = el('div', 'stat');
    s.appendChild(el('div', 'k', esc(c[0])));
    s.appendChild(el('div', 'v' + (c[2] ? ' acc' : ''), esc(c[1])));
    s.appendChild(el('div', 'n', esc(c[3])));
    cards.appendChild(s);
  });
  app.appendChild(cards);

  // 图表
  var chartRegistry = [];
  function chartCard(title, builder) {
    var opt = builder(D, themeObj());
    if (!opt) return null;
    var c = el('div', 'card chart-card');
    c.appendChild(el('h2', null, esc(title)));
    var box = el('div', 'chart');
    c.appendChild(box);
    chartRegistry.push({ box: box, builder: builder, inst: null });
    return c;
  }
  function renderCharts() {
    chartRegistry.forEach(function (c) {
      if (c.inst) { c.inst.dispose(); c.inst = null; }
      c.inst = echarts.init(c.box);
      c.inst.setOption(c.builder(D, themeObj()));
    });
  }
  var grid = el('div', 'grid2');
  [
    ['TTFT 分布直方图', window.LR.tHist],
    ['请求量时序（成功/失败）', window.LR.tSeries],
    ['Token 吞吐时序', window.LR.tTokens],
    ['错误类别构成', window.LR.errPie],
  ].forEach(function (item) {
    var c = chartCard(item[0], item[1]);
    if (c) grid.appendChild(c);
  });
  app.appendChild(grid);
  requestAnimationFrame(renderCharts);
  window.addEventListener('resize', function () {
    chartRegistry.forEach(function (c) { if (c.inst) c.inst.resize(); });
  });

  // 分位数表
  var pcard = el('div', 'card');
  pcard.appendChild(el('h2', null, '延迟分位数'));
  var pt = el('table');
  pt.appendChild(el('thead', null, '<tr><th>指标</th><th class="num">min</th><th class="num">avg</th><th class="num">P50</th><th class="num">P90</th><th class="num">P95</th><th class="num">P99</th><th class="num">max</th></tr>'));
  var ptb = el('tbody');
  var metricRows = [];
  if (D.ttftStream) metricRows.push(['TTFT（流式 ms）', D.ttftStream]);
  if (D.useTime) metricRows.push(['总耗时（秒）', D.useTime]);
  metricRows.forEach(function (r) {
    var p = r[1];
    var cells = [p.min, p.avg, p.p50, p.p90, p.p95, p.p99, p.max].map(function (v) {
      return '<td class="num">' + (v == null ? '—' : r[0].indexOf('TTFT') === 0 ? Math.round(v) : Math.round(v * 10) / 10) + '</td>';
    }).join('');
    ptb.appendChild(el('tr', null, '<td>' + esc(r[0]) + '</td>' + cells));
  });
  pt.appendChild(ptb);
  var pwrap = el('div', 'scroll-x');
  pwrap.appendChild(pt);
  pcard.appendChild(pwrap);
  app.appendChild(pcard);

  // 失败明细
  if (D.failures.length) {
    var fdet = el('details');
    fdet.appendChild(el('summary', null, '失败请求明细（前 ' + D.failures.length + ' 条）'));
    var finner = el('div', 'inner');
    var ft = el('table');
    ft.appendChild(el('thead', null, '<tr><th>时刻</th><th>模型</th><th>用户</th><th>状态</th><th>结束原因</th><th>接口</th><th class="num">耗时 s</th></tr>'));
    var ftb = el('tbody');
    D.failures.forEach(function (f) {
      ftb.appendChild(el('tr', null,
        '<td class="num">' + esc(f.at) + '</td>' +
        '<td>' + esc(f.model) + '</td>' +
        '<td>' + esc(f.user) + '</td>' +
        '<td>' + esc(f.status) + '</td>' +
        '<td>' + esc(f.endReason) + '</td>' +
        '<td style="max-width:200px;word-break:break-all">' + esc(f.path) + '</td>' +
        '<td class="num">' + sec(f.useTime) + '</td>'));
    });
    ft.appendChild(ftb);
    finner.appendChild(ft);
    fdet.appendChild(finner);
    app.appendChild(fdet);
  }

  // 页脚
  app.appendChild(el('div', 'footer',
    '所有指标由导入日志本地计算，不包含任何费用字段 · 报告为自包含单文件，可直接转发，无需联网 · 生成于 ' + esc(D.generatedAt.slice(0, 19).replace('T', ' '))));
})();
`

export function buildReportHtml(report: Report): string {
  // 内联数据 JSON 转义 `<`，避免 `</script>` 提前闭合
  const dataStr = JSON.stringify(report).replace(/</g, '\\u003c')
  const docTitle = report.title || 'LLM 日志性能分析报告'
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docTitle}</title>
<script>
(function () {
  var t = 'light';
  try { t = localStorage.getItem('sb-report-theme') || 'light'; } catch (e) { /* noop */ }
  document.documentElement.setAttribute('data-theme', t);
})();
</script>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap" id="app"><noscript>本报告需要启用 JavaScript 才能显示图表。</noscript></div>
<script>${echartsSource}</script>
<script>window.__REPORT_DATA = ${dataStr}</script>
<script>${CHART_BUILDERS_JS}</script>
<script>${RENDER_JS}</script>
</body>
</html>`
}

export function reportFileName(report: Report): string {
  const d = new Date(report.timeStart * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
  const base = (report.title || 'llm-report')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'llm-report'
  return `${base}_${stamp}.html`
}

export function downloadReportHtml(report: Report): void {
  const blob = new Blob([buildReportHtml(report)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = reportFileName(report)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

