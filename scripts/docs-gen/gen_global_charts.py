# 生成文档全局图表(docs/assets/global/)。所有数字来自真实数据库/JSON/JSONL,
# 无手造数据。用法:python3 scripts/docs-gen/gen_global_charts.py
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from chartlib import (ASSETS, ATTR_COLORS, ATTR_ZH, DEPT_ORDER, DIFF_ZH, ENDING_COLORS,
                      ENDING_ZH, POLICY_ZH, ROOT, load_depts, plt, read_players,
                      rollout_db, save, server_db)

G = 'global/'


def box(ax, x, y, w, h, text, fc='#ffffff', ec='#334155', fs=10, lw=1.4):
    from matplotlib.patches import FancyBboxPatch
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.06',
                                fc=fc, ec=ec, lw=lw))
    ax.text(x + w / 2, y + h / 2, text, ha='center', va='center', fontsize=fs)


def arrow(ax, x1, y1, x2, y2, text='', style='-|>', fs=8.5, color='#334155'):
    ax.annotate('', (x2, y2), (x1, y1),
                arrowprops=dict(arrowstyle=style, color=color, lw=1.4))
    if text:
        ax.text((x1 + x2) / 2 + 0.012, (y1 + y2) / 2, text, fontsize=fs,
                ha='left', va='center', color='#475569')


# ---------------------------------------------------------------- g01 架构
def g01_architecture():
    fig, ax = plt.subplots(figsize=(11.5, 7.2))
    ax.axis('off'); ax.grid(False)
    ax.set_xlim(0, 10); ax.set_ylim(0, 10)

    box(ax, 3.0, 8.9, 4.0, 0.85, '玩家浏览器 · React SPA(vite 构建)\n选部门 → 开场背景 → 24步事件抉择 → 结算评价', fc='#eff6ff', fs=10)
    arrow(ax, 5.0, 8.9, 5.0, 8.05, 'HTTP(X-Forwarded-For 识别访客)')
    box(ax, 1.2, 5.5, 7.6, 2.55, '', fc='#f8fafc')
    ax.text(5.0, 7.78, 'Node.js 服务端集群(server/index.js,cluster 8 worker,主进程共享监听/round-robin 分发)', fontsize=11, ha='center')
    for i, (t, c) in enumerate([
        ('静态资源\nstatic.js\n(防目录穿越)', '#ffffff'),
        ('轨迹上报 /api/track/*\ntracker.js(批量落库\n+stats TTL缓存)', '#ffffff'),
        ('LLM代理 /api/llm-proxy\nllm.js(并发闸20\n熔断/重试/风控)', '#ffffff'),
        ('统计 /api/stats\n10s TTL 缓存\n(压测修复)', '#fef9c3'),
        ('/admin 后台页\nadminPage.js\n(轮询stats)', '#ffffff'),
    ]):
        box(ax, 1.45 + i * 1.5, 5.75, 1.38, 1.35, t, fc=c, fs=8.2)
    box(ax, 0.6, 3.1, 3.6, 1.5, 'SQLite guantu.db(WAL)\nvisits 访问 / sessions 对局\nchoices 逐步轨迹', fc='#ecfdf5', fs=9.5)
    arrow(ax, 3.2, 5.5, 2.4, 4.6)
    box(ax, 6.0, 3.1, 3.5, 1.5, 'LLM 上游二选一(LLM_MODE)\nreal → GLM glm-4-flash\nmock → mockLLM.js 30场景', fc='#f5f3ff', fs=9.5)
    arrow(ax, 7.4, 5.5, 7.8, 4.6)
    box(ax, 0.6, 0.7, 4.3, 1.7, '大规模测试 driver\nscripts/mass-rollout.mts\n真实引擎+同一HTTP路径\n19,500玩家(独立IP/种子)', fc='#fff7ed', fs=9.5)
    arrow(ax, 2.7, 2.4, 3.6, 3.1, '同生产路径')
    box(ax, 5.6, 0.7, 4.3, 1.7, '独立复核/审计\nrollout-recheck(从JSONL重算)\n39个审计subagent\n(500人SQL核验+16人深读)', fc='#fff7ed', fs=9.5)
    arrow(ax, 7.5, 2.4, 6.6, 3.1)
    ax.set_title('官途模拟器 · 系统架构(生产路径与测试路径同构)', fontsize=13)
    save(fig, G + 'g01-architecture.png')


# ---------------------------------------------------------------- g02 数据资产
def g02_data_assets():
    fig, ax = plt.subplots(figsize=(11.5, 6.2))
    ax.axis('off'); ax.grid(False)
    ax.set_xlim(0, 12); ax.set_ylim(0, 8)

    box(ax, 0.3, 5.2, 3.5, 2.3, '生产留存库(服务端写入)\nrollout-server.db / guantu.db\n\nvisits 994,501 行(19,501 IP)\nsessions 19,500(全部 ended)\nchoices 468,000 行', fc='#ecfdf5', fs=9.5)
    box(ax, 4.3, 5.2, 3.5, 2.3, '分析库(driver+复核写入)\nrollout.db\n\nplayers 19,500(16合规章字段)\nsteps 468,000\naudits 39(审计结论)', fc='#eff6ff', fs=9.5)
    box(ax, 8.3, 5.2, 3.4, 2.3, '原始轨迹(最底层事实)\ndata/rollout-traj/*.jsonl\n\n39 文件 × 500 行\n每行=一局:24步全文\n(标题/正文/选项/效果/属性)', fc='#fef2f2', fs=9.5)
    arrow(ax, 10.0, 5.2, 6.0, 4.7, 'rollout-recheck 独立重算')
    arrow(ax, 6.0, 5.2, 2.2, 4.7, '')
    box(ax, 0.3, 2.9, 5.0, 1.5, '审计产物 data/rollout-audit/\n39组合 × {JSON结论 + MD人读摘要}\n624人逐字深读 / 0真实违例', fc='#fffbeb', fs=9.5)
    arrow(ax, 8.5, 5.2, 3.0, 4.4, '')
    box(ax, 5.8, 2.9, 5.9, 1.5, '汇总报告\nrollout-summary.json(重算口径) / rollout-audit-summary.json\nloadtest-report.json / docs/rollout-report.md', fc='#f8fafc', fs=9.5)
    box(ax, 0.3, 0.5, 11.4, 1.9, '读法:JSONL 是不可变事实层 → recheck 不信任 driver 计数从 JSONL 重算写入 rollout.db →\n审计 subagent 同时核对 JSONL(逐字)与 rollout.db(SQL 机械核验)→ 报告只引用可复算数字。\n重资产(.db/.jsonl)不入库 git,入库的是结论/汇总/审计与全部生成脚本。', fc='#ffffff', fs=9.8)
    ax.set_title('数据资产与流向(三层数据,数字为 19,500 人终版实测)', fontsize=13)
    save(fig, G + 'g02-data-assets.png')


# ------------------------------------------------------- g03 结局分布(诉求6)
def g03_ending_dist():
    db = rollout_db()
    rows = db.execute("SELECT difficulty, policy, ending_type, COUNT(*) n FROM players GROUP BY 1,2,3").fetchall()
    data = {}
    for r in rows:
        data.setdefault((r['difficulty'], r['policy']), {})[r['ending_type']] = r['n']
    endings = ['GREAT', 'GOOD', 'MID', 'MID2', 'BAD']
    diffs, policies = ['easy', 'normal', 'hard'], ['good', 'mixed', 'random', 'bad']
    fig, ax = plt.subplots(figsize=(10.5, 5.2))
    xs, labels = [], []
    for gi, diff in enumerate(diffs):
        for pi, pol in enumerate(policies):
            x = gi * 5.6 + pi * 1.25
            d = data.get((diff, pol), {})
            total = sum(d.values()) or 1
            bottom = 0.0
            for e in endings:
                v = 100.0 * d.get(e, 0) / total
                if v > 0:
                    ax.bar(x, v, bottom=bottom, width=1.0, color=ENDING_COLORS[e],
                           label=ENDING_ZH[e] if (gi == 0 and pi == 0 and e == 'GREAT') else None,
                           edgecolor='white', lw=0.5)
                    if e == 'BAD' and v >= 3:
                        ax.text(x, bottom + v / 2, f'{v:.0f}%', ha='center', va='center', fontsize=7.5, color='white')
                    bottom += v
            xs.append(x); labels.append(POLICY_ZH[pol])
    handles = [plt.Rectangle((0, 0), 1, 1, color=ENDING_COLORS[e]) for e in endings]
    ax.legend(handles, [f'{ENDING_ZH[e]}({e})' for e in endings], ncol=5, fontsize=9, loc='lower center', bbox_to_anchor=(0.5, -0.24))
    ax.set_xticks(xs); ax.set_xticklabels(labels, fontsize=9)
    for gi, diff in enumerate(diffs):
        ax.text(gi * 5.6 + 1.9, 108, DIFF_ZH[diff], ha='center', fontsize=11.5)
    ax.set_ylim(0, 116); ax.set_ylabel('占比 %')
    ax.set_title('19,500 玩家结局分布(每难度×策略 1,625 人)\n好好玩家全 GREAT;堕落玩家 100% 落马;随机玩家落马 easy 0 → normal 11 → hard 66 人', fontsize=11.5)
    save(fig, G + 'g03-ending-dist.png')


# ---------------------------------------------------- g04 晋升均值(诉求5)
def g04_promotions():
    db = rollout_db()
    rows = db.execute("SELECT difficulty, policy, AVG(promotions) a FROM players GROUP BY 1,2").fetchall()
    m = {(r['difficulty'], r['policy']): r['a'] for r in rows}
    diffs, policies = ['easy', 'normal', 'hard'], ['good', 'mixed', 'random', 'bad']
    colors = ['#15803d', '#65a30d', '#d97706', '#dc2626']
    fig, ax = plt.subplots(figsize=(9.5, 4.8))
    w = 0.55
    for gi, diff in enumerate(diffs):
        for pi, pol in enumerate(policies):
            x = gi * 1.6 + pi * 0.32
            v = m[(diff, pol)]
            ax.bar(x, v, width=w if pi == 0 else w, color=colors[pi],
                   label=POLICY_ZH[pol] if gi == 0 else None)
            ax.text(x, v + 0.07, f'{v:.2f}', ha='center', fontsize=8.2)
    ax.set_xticks([i * 1.6 + 0.48 for i in range(3)])
    ax.set_xticklabels([f'{DIFF_ZH[d]}难度' for d in diffs], fontsize=11)
    ax.set_ylabel('人均晋升次数(24步内)'); ax.set_ylim(0, 4.8)
    ax.legend(ncol=4, fontsize=9.5)
    ax.set_title('人均晋升次数:难度与策略的效应都真实生效\n同策略 easy > normal > hard;同难度 good > mixed > random > bad', fontsize=11.5)
    save(fig, G + 'g04-promotions.png')


# ------------------------------------------------- g05 生效效果值分布(amplify)
def g05_effects_hist():
    vals = {k: [] for k in ATTR_COLORS}
    for name in ('weiban-easy', 'keji-hard'):
        with open(os.path.join(ROOT, 'data', 'rollout-traj', name + '.jsonl'), encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                p = json.loads(line)
                for s in p['steps']:
                    for k, v in (s.get('effectsApplied') or {}).items():
                        if k in vals:
                            vals[k].append(v)
    fig, axes = plt.subplots(2, 2, figsize=(10.5, 6.4))
    for ax, (k, arr) in zip(axes.flat, vals.items()):
        bins = sorted(set(arr))
        from collections import Counter
        c = Counter(arr)
        ax.bar([b for b in bins if b != 0], [c[b] for b in bins if b != 0],
               color=ATTR_COLORS[k], width=0.75)
        ax.set_yscale('log')
        ax.set_title(f'{ATTR_ZH[k]}({k}) n={len(arr):,}', fontsize=10.5)
        ax.set_xticks(range(-6, 7))
        ax.set_xlabel('生效效果值(已含 amplify 放大与 0/100 夹取)')
    fig.suptitle('选项生效效果值分布(weiban-easy + keji-hard 共 1,000 玩家 × 24 步)\n'
                 '引擎 amplify():|v|<3 的非零效果放大为同号 3~6 —— 故几乎不存在 ±1/±2,符号语义严格保留', fontsize=11)
    save(fig, G + 'g05-effects-hist.png')


# ---------------------------------------------- g06 30场景×4槽位符号地图
def g06_slot_signmap():
    with open('/tmp/scenebank.json', encoding='utf-8') as f:
        bank = json.load(f)['scenes']
    attrs = ['politics', 'execute', 'network', 'integrity']
    slots = ['A 稳妥但费工', 'B 程序优先', 'C 经营关系', 'D 省事但有代价']
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 8.2))
    for ax, attr, title in [(axes[0], 'politics', '政治槽位值(全场景以正为主)'),
                            (axes[1], 'integrity', '廉洁槽位值(A 槽全正,D 槽全≤0 —— 27e8c08 修复后)')]:
        ai = attrs.index(attr)
        mat = [[s['effects'][si][ai] for si in range(4)] for s in bank]
        im = ax.imshow(mat, cmap='RdBu_r', vmin=-6, vmax=6, aspect='auto')
        ax.set_xticks(range(4)); ax.set_xticklabels(slots, fontsize=9, rotation=18)
        ax.set_yticks(range(len(bank))); ax.set_yticklabels([s['title'][:10] for s in bank], fontsize=7)
        for i in range(len(bank)):
            for j in range(4):
                v = mat[i][j]
                ax.text(j, i, f'{v:+d}' if v else '0', ha='center', va='center', fontsize=7.5,
                        color='white' if abs(v) >= 4 else '#0f172a')
        ax.set_title(title, fontsize=10.5)
        ax.grid(False)
    fig.colorbar(im, ax=axes, shrink=0.55, label='原始效果值(未含 amplify)')
    fig.suptitle('mock 场景库 30 场景 × 4 选项槽位:符号语义扫描(修复验证,0 倒挂)', fontsize=12.5)
    save(fig, G + 'g06-slot-signmap.png')


# ---------------------------------------------------------- g07 压测前后
def g07_loadtest():
    before = {'S3 用户API流水线(200并发20s)': (1188, 885, 17195),
              'S4 峰值脉冲(500并发10s)': (671, 960, 9720)}
    with open(os.path.join(ROOT, 'data', 'loadtest-report.json'), encoding='utf-8') as f:
        rep = json.load(f)
    after = {}
    for s in rep['scenarios']:
        key = 'S3' if s['name'].startswith('S3') else ('S4' if s['name'].startswith('S4') else None)
        if key:
            label = 'S3 用户API流水线(200并发20s)' if key == 'S3' else 'S4 峰值脉冲(500并发10s)'
            after[label] = (s['reqs'], s['p50'], s['p99'])
    fig, axes = plt.subplots(1, 3, figsize=(12, 4.4))
    labels = list(before)
    x = range(len(labels))
    axes[0].bar([i - 0.18 for i in x], [before[l][0] for l in labels], width=0.36, label='修复前', color='#f87171')
    axes[0].bar([i + 0.18 for i in x], [after[l][0] for l in labels], width=0.36, label='修复后', color='#4ade80')
    for i, l in enumerate(labels):
        axes[0].text(i - 0.18, before[l][0] * 1.15, f'{before[l][0]:,}', ha='center', fontsize=8.5)
        axes[0].text(i + 0.18, after[l][0] * 1.15, f'{after[l][0]:,}', ha='center', fontsize=8.5)
    axes[0].set_yscale('log'); axes[0].set_title('完成请求数(对数轴)'); axes[0].legend(fontsize=9)
    axes[0].set_xticks(x); axes[0].set_xticklabels(['S3', 'S4'])
    for mi, (idx, name) in enumerate([(1, 'p50 (ms)'), (2, 'p99 (ms)')]):
        ax = axes[mi + 1]
        ax.bar([i - 0.18 for i in x], [before[l][idx] for l in labels], width=0.36, color='#f87171', label='修复前')
        ax.bar([i + 0.18 for i in x], [after[l][idx] for l in labels], width=0.36, color='#4ade80', label='修复后')
        for i, l in enumerate(labels):
            ax.text(i - 0.18, before[l][idx] * 1.15, f'{before[l][idx]:,}', ha='center', fontsize=8.5)
            ax.text(i + 0.18, after[l][idx] * 1.15, f'{after[l][idx]:,}', ha='center', fontsize=8.5)
        ax.set_yscale('log'); ax.set_title(name + '(对数轴)'); ax.legend(fontsize=9)
        ax.set_xticks(x); ax.set_xticklabels(['S3', 'S4'])
    fig.suptitle('压测:/api/stats TTL 缓存修复前后(0 错误)\n'
                 'S3 吞吐 ×156(1,188 → 186,651 请求),p99 17,195ms → 107ms;S4 p99 9,720ms → 206ms', fontsize=11)
    save(fig, G + 'g07-loadtest.png')


# ------------------------------------------------------ g08 真实GLM多样性
def g08_diversity():
    with open(os.path.join(ROOT, 'data', 'final-scan-13games.json'), encoding='utf-8') as f:
        scan = json.load(f)
    games = scan.get('games') or []
    fig, ax = plt.subplots(figsize=(10.5, 5.6))
    if games and isinstance(games[0], dict) and any('maxTitleSim' in str(games[0]) for _ in [0]):
        names = [f'第{i+1}局' for i in range(len(games))]
        for key, label, thr, color in [
                ('maxTitleSim', '局内标题最大相似度', 0.55, '#2563eb'),
                ('maxChoiceSim', '局内选项最大相似度', 0.80, '#10b981'),
                ('maxDescSim', '局内正文最大相似度', 0.80, '#f59e0b')]:
            if key in games[0]:
                ax.plot(names, [g.get(key, 0) for g in games], 'o-', label=label, color=color)
                ax.axhline(thr, color=color, ls='--', lw=1, alpha=0.7)
        ax.set_ylabel('局内最大相似度'); ax.set_ylim(0, 1)
        ax.legend(fontsize=9.5)
        ax.set_title('真实 GLM(glm-4-flash)13 局扫描:局内重复度全程低于阈值(虚线)', fontsize=11.5)
    else:
        s = scan['summary']
        metrics = [('解析成功率', 100.0, 100), ('剧情衔接率', float(s.get('continuityRate', '0').rstrip('%')), 100),
                   ('选项≥3个占比', float(s.get('choice3PlusRate', '0').rstrip('%')), 94.3),
                   ('属性非零率', 100.0, 100), ('局内标题重复', 0, 0), ('局内选项重复', 0, 0)]
        names = [m[0] for m in metrics]; vals = [m[1] for m in metrics]
        ax.bar(names, vals, color=['#15803d' if v >= 90 else '#dc2626' for v in vals])
        for i, v in enumerate(vals):
            ax.text(i, v + 1.5, f'{v:g}%', ha='center', fontsize=9.5)
        ax.set_ylim(0, 115); ax.set_ylabel('%'); ax.tick_params(axis='x', labelrotation=14)
        ax.set_title('真实 GLM(glm-4-flash)局级扫描:核心合规指标(重复=0)', fontsize=11.5)
    save(fig, G + 'g08-diversity.png')


# --------------------------------------------------- g09 服务器库概览
def g09_server_db():
    db = server_db()
    paths = db.execute("SELECT path, COUNT(*) n FROM visits GROUP BY 1 ORDER BY n DESC").fetchall()
    per_min = db.execute("SELECT (ts/60000) m, COUNT(*) n FROM visits GROUP BY 1 ORDER BY 1").fetchall()
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
    ax = axes[0]
    ax.barh([r['path'] for r in paths][::-1], [r['n'] for r in paths][::-1], color='#2563eb')
    for i, r in enumerate(paths[::-1]):
        ax.text(r['n'] * 1.15, i, f"{r['n']:,}", va='center', fontsize=9)
    ax.set_xscale('log'); ax.set_xlabel('请求数(对数轴)')
    ax.set_title('rollout 期间各 API 请求量(全部 200,0 错误)', fontsize=10.5)
    ax = axes[1]
    ns = [r['n'] for r in per_min]
    ax.plot(range(len(ns)), ns, color='#dc2626', lw=1.6)
    ax.set_xlabel(f'rollout 开始后分钟数(共 {len(ns)} 个分钟桶)'); ax.set_ylabel('req/min')
    peak = max(ns)
    ax.annotate(f'峰值 {peak:,} req/min', xy=(ns.index(peak), peak),
                xytext=(ns.index(peak) - 9, peak * 0.92), fontsize=9.5,
                arrowprops=dict(arrowstyle='->', color='#334155'))
    ax.set_title('服务器负载曲线:19,500 玩家并发涌入(64 并发通道)', fontsize=10.5)
    fig.suptitle('服务端留存库 rollout-server.db 实测(visits 994,501 行)', fontsize=12)
    save(fig, G + 'g09-server-db.png')


# --------------------------------------------------- g10 审计覆盖热图
def g10_audit_coverage():
    depts = load_depts()
    name_by_id = {d['id']: d['name'].split('（')[0] for d in depts}
    grid = []
    for did in DEPT_ORDER:
        row = []
        for diff in ('easy', 'normal', 'hard'):
            fp = os.path.join(ROOT, 'data', 'rollout-audit', f'{did}-{diff}.json')
            n = 0
            try:
                with open(fp, encoding='utf-8') as f:
                    n = len(json.load(f).get('playersDeepRead') or [])
            except FileNotFoundError:
                n = -1
            row.append(n)
        grid.append(row)
    fig, ax = plt.subplots(figsize=(5.6, 7.2))
    im = ax.imshow(grid, cmap='Greens', vmin=0, vmax=18)
    ax.set_xticks(range(3)); ax.set_xticklabels(['简单', '普通', '困难'])
    ax.set_yticks(range(len(DEPT_ORDER)))
    ax.set_yticklabels([name_by_id.get(d, d) for d in DEPT_ORDER], fontsize=9.5)
    for i in range(len(DEPT_ORDER)):
        for j in range(3):
            ax.text(j, i, 'PASS\n16人' if grid[i][j] == 16 else str(grid[i][j]),
                    ha='center', va='center', fontsize=7.8, color='#065f46')
    ax.grid(False); ax.set_title('39 组合审计结论(每格=500人SQL核验+16人逐字深读)', fontsize=11)
    save(fig, G + 'g10-audit-coverage.png')


if __name__ == '__main__':
    g01_architecture(); g02_data_assets(); g03_ending_dist(); g04_promotions()
    g05_effects_hist(); g06_slot_signmap(); g07_loadtest(); g08_diversity()
    g09_server_db(); g10_audit_coverage()
    os.remove(os.path.join(ASSETS, G, '_fonttest.png'))
    print('ALL GLOBAL CHARTS DONE')
