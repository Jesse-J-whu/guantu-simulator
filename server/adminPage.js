// 后台统计页 — 无构建依赖的服务端 HTML,轮询 /api/stats 渲染。
// 访问:/admin

function renderAdminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>官途模拟器 · 数据看板</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0a0c10; color: #d8dee9; padding: 24px; }
  h1 { font-size: 20px; color: #c9a84c; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #111520; border: 1px solid #1f2735; border-radius: 10px; padding: 16px; }
  .card .label { font-size: 12px; color: #8b93a3; }
  .card .value { font-size: 26px; font-weight: 700; color: #c9a84c; margin-top: 6px; }
  .card .value small { font-size: 13px; color: #8b93a3; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; background: #111520; border-radius: 10px; overflow: hidden; font-size: 13px; margin-bottom: 24px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #1f2735; }
  th { background: #161b2a; color: #8b93a3; font-weight: 600; }
  h2 { font-size: 15px; color: #d8dee9; margin: 18px 0 10px; }
  .ending-BAD { color: #cc2a2a; } .ending-GREAT { color: #e5c158; }
  .ending-GOOD { color: #6fbf73; } .ending-MID, .ending-MID2 { color: #8b93a3; }
  .bar { height: 8px; background: #1f2735; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .bar > div { height: 100%; background: #c9a84c; }
</style>
</head>
<body>
<h1>官途模拟器 · 数据看板</h1>
<div class="sub">IP计数 / 访问请求 / 平均时长 / 1分钟留存率 / 完整通关率 — 每 5 秒自动刷新</div>
<div class="grid" id="cards"></div>
<h2>结局分布</h2>
<div id="endings"></div>
<h2>部门热度</h2>
<table id="dept-table"><thead><tr><th>部门</th><th>开局数</th><th>完结数</th><th>完结率</th></tr></thead><tbody></tbody></table>
<h2>最近对局</h2>
<table id="sessions"><thead><tr><th>会话</th><th>部门</th><th>难度</th><th>步数</th><th>晋升</th><th>结局</th><th>最终职级</th><th>时长</th></tr></thead><tbody></tbody></table>
<script>
const fmtDur = (ms) => ms > 0 ? (ms/1000/60).toFixed(1) + ' 分钟' : '—';
const pct = (v) => (v*100).toFixed(1) + '%';
// 所有来自 /api/stats 的字符串(部门名/难度/职级等)都经玩家可控的
// /api/track/* 写入,渲染前必须转义,防存储型 XSS。
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const endingClass = (t) => /^[A-Z0-9_]+$/.test(t || '') ? t : 'MID';
async function refresh() {
  try {
    const r = await fetch('/api/stats');
    const s = await r.json();
    const cards = [
      ['总访问请求', s.requests.total.toLocaleString()],
      ['独立 IP 数', s.visits.uniqueIps.toLocaleString(), '近24h: ' + s.visits.last24hUniqueIps],
      ['近1小时请求', s.requests.lastHour.toLocaleString(), s.requests.perMinuteLastHour + ' 次/分'],
      ['平均响应时长', s.requests.avgDurationMs + ' ms'],
      ['1分钟留存率', pct(s.retention.oneMinute), s.retention.retainedVisitors + '/' + s.retention.visitors24h + ' 访问者'],
      ['开始对局', s.sessions.started.toLocaleString()],
      ['完整通关率', pct(s.sessions.completionRate), s.sessions.completed + ' 局完结'],
      ['平均对局时长', fmtDur(s.sessions.avgDurationMs), '平均步数 ' + s.sessions.avgSteps],
    ];
    document.getElementById('cards').innerHTML = cards.map(c =>
      '<div class="card"><div class="label">' + c[0] + '</div><div class="value">' + c[1] +
      (c[2] ? ' <small>' + c[2] + '</small>' : '') + '</div></div>').join('');
    const endings = s.sessions.byEnding;
    const totalE = endings.reduce((a, e) => a + e.count, 0) || 1;
    const names = { GREAT: '官途圆满', GOOD: '平稳落幕', MID: '调任闲职', MID2: '受到处分', BAD: '落马' };
    document.getElementById('endings').innerHTML = endings.map(e =>
      '<div style="margin-bottom:10px"><span class="ending-' + endingClass(e.type) + '">' + (Object.hasOwn(names, e.type) ? names[e.type] : esc(e.type)) +
      ' · ' + e.count + ' (' + pct(e.count/totalE) + ')</span><div class="bar"><div style="width:' +
      (e.count/totalE*100) + '%"></div></div></div>').join('') || '<div class="sub">暂无完结对局</div>';
    document.querySelector('#dept-table tbody').innerHTML = s.sessions.byDept.map(d =>
      '<tr><td>' + esc(d.dept || '—') + '</td><td>' + d.count + '</td><td>' + d.ended + '</td><td>' +
      pct(d.count ? d.ended/d.count : 0) + '</td></tr>').join('');
    document.querySelector('#sessions tbody').innerHTML = s.sessions.recent.map(x =>
      '<tr><td>' + esc(String(x.session_id || '').slice(0, 14)) + '…</td><td>' + esc(x.dept_name || '—') + '</td><td>' +
      esc(x.difficulty || '—') + '</td><td>' + x.steps_done + '</td><td>' + x.promotions + '</td><td class="ending-' +
      endingClass(x.ending_type) + '">' + esc(x.ending_type || '进行中') + '</td><td>' + esc(x.final_rank || '—') + '</td><td>' +
      fmtDur(x.duration_ms) + '</td></tr>').join('');
  } catch (e) { console.error(e); }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

module.exports = { renderAdminPage };
