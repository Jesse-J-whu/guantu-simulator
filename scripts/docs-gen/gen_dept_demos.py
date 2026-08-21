# 生成 13 个部门的轨迹 Demo 文档(docs/demos/dept-<id>.md + docs/assets/demos/)。
# 每部门:双精选玩家(好好玩家 easy / 堕落玩家 normal)的属性曲线图+职级阶梯图、
# 24 步轨迹全表、两步原文全样例(标题/衔接/正文/四选项)、三难度结局分布图。
# 所有内容直接取自 data/rollout-traj/*.jsonl 与 data/rollout.db,零手写数据。
# 用法:python3 scripts/docs-gen/gen_dept_demos.py
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from chartlib import (ATTR_COLORS, ATTR_ZH, DEPT_ORDER, DIFF_ZH, ENDING_COLORS, ENDING_ZH,
                      ROOT, fmt_effect, load_depts, plt, read_players, rollout_db, save)

DEMOS_DIR = os.path.join(ROOT, 'docs', 'demos')
ASSET_DIR = 'demos/'


def journey_figure(dept, player, tag):
    """单玩家旅程图:上=四属性曲线(0-100)+晋升标记,下=职级阶梯。"""
    ranks = dept['ranks']
    steps = player['steps']
    xs = [s['step'] for s in steps]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10.5, 6.8), sharex=True,
                                   gridspec_kw={'height_ratios': [2.1, 1.0], 'hspace': 0.12})
    for k in ATTR_COLORS:
        ax1.plot(xs, [s['attrsAfter'][k] for s in steps], '-o', ms=3, lw=1.7,
                 color=ATTR_COLORS[k], label=ATTR_ZH[k])
    proms = [s['step'] for s in steps if s['promoted']]
    for ps in proms:
        ax1.axvline(ps, color='#d4af37', ls='--', lw=1, alpha=0.75)
    if proms:
        ax1.axvline(proms[0], color='#d4af37', ls='--', lw=1, alpha=0.75, label='晋升步')
    ax1.set_ylim(-3, 103)
    ax1.set_ylabel('属性值(0-100)')
    ax1.legend(ncol=5, fontsize=9, loc='lower left')
    ax2.step([0] + xs, [0] + [s['rankAfter'] for s in steps], where='post',
             color='#7c3aed', lw=2)
    ax2.plot(proms, [s['rankAfter'] for s in steps if s['promoted']], '^', ms=8, color='#d4af37')
    ax2.set_yticks(range(len(ranks)))
    ax2.set_yticklabels(ranks, fontsize=8.5)
    ax2.set_ylim(-0.4, len(ranks) - 0.6)
    ax2.set_xlabel('游戏步数(1-24)')
    pol = {'good': '好好玩家', 'bad': '堕落玩家', 'random': '随机玩家', 'mixed': '混合玩家'}[player['policy']]
    fig.suptitle(f"{dept['name']} · {DIFF_ZH[player['difficulty']]}难度 · {pol}(playerIdx={player['playerIdx']})\n"
                 f"结局:{ENDING_ZH.get(player['endingType'], player['endingType'])}({player['endingType']}) · "
                 f"终职级:{player['finalRank']} · 晋升{player['promotions']}次", fontsize=11.5)
    save(fig, f'{ASSET_DIR}{dept["id"]}-{tag}.png')


def endings_figure(dept, dept_id):
    db = rollout_db()
    rows = db.execute("SELECT difficulty, ending_type, COUNT(*) n FROM players WHERE dept_id=? GROUP BY 1,2",
                      (dept_id,)).fetchall()
    data = {}
    for r in rows:
        data.setdefault(r['difficulty'], {})[r['ending_type']] = r['n']
    endings = ['GREAT', 'GOOD', 'MID', 'MID2', 'BAD']
    fig, ax = plt.subplots(figsize=(8.6, 4.6))
    for gi, diff in enumerate(('easy', 'normal', 'hard')):
        d = data.get(diff, {})
        total = sum(d.values()) or 1
        bottom = 0.0
        for e in endings:
            v = 100.0 * d.get(e, 0) / total
            if v > 0:
                ax.bar(gi, v, bottom=bottom, width=0.62, color=ENDING_COLORS[e],
                       edgecolor='white', lw=0.5)
                if v >= 6:
                    ax.text(gi, bottom + v / 2, f'{v:.0f}%', ha='center', va='center',
                            fontsize=8.5, color='white')
                bottom += v
    handles = [plt.Rectangle((0, 0), 1, 1, color=ENDING_COLORS[e]) for e in endings]
    ax.legend(handles, [ENDING_ZH[e] for e in endings], ncol=5, fontsize=8.5,
              loc='lower center', bbox_to_anchor=(0.5, -0.3))
    ax.set_xticks(range(3)); ax.set_xticklabels([f'{DIFF_ZH[d]}(500人)' for d in ('easy', 'normal', 'hard')])
    ax.set_ylim(0, 116); ax.set_ylabel('占比 %')
    ax.set_title(f"{dept['name']} · 1,500 名玩家(3难度×4策略×125人)结局分布", fontsize=11.5)
    save(fig, f'{ASSET_DIR}{dept_id}-endings.png')


def steps_table(player, ranks):
    lines = ['| 步 | 年份 | 事件标题 | 所选选项 | 生效效果 | 职级 | 晋升 |',
             '|---:|---:|---|---|---|---|:---:|']
    for s in player['steps']:
        idx = s['chosenIdx']
        chosen = s['choices'][idx]['text'] if idx is not None and idx < len(s['choices']) else '—'
        if len(chosen) > 16:
            chosen = chosen[:15] + '…'
        if s['promoted']:
            rank_disp = '↑ %d %s' % (s['rankAfter'], ranks[s['rankAfter']])
        else:
            rank_disp = str(s['rankAfter'])
        lines.append('| %d | %s | %s | %s | `%s` | %s | %s |' % (
            s['step'], s['year'], s['title'], chosen,
            fmt_effect(s.get('effectsApplied') or {}), rank_disp, '✔' if s['promoted'] else ''))
    return '\n'.join(lines)


def sample_step(player, step_no, heading):
    s = next(x for x in player['steps'] if x['step'] == step_no)
    out = ['**%s(第 %d 步原文,逐字取自 JSONL)**' % (heading, step_no), '',
           '> **%s**(`%s`)' % (s['title'], s['tagLabel']), '',
           '*衔接语*:%s' % s['continuity'], '', s['desc'], '',
           '| 选项 | 提示 | 效果(政/执/网/廉) |', '|---|---|---|']
    for i, c in enumerate(s['choices']):
        mark = ' ←选中' if i == s['chosenIdx'] else ''
        out.append('| %s. %s%s | %s | `%s` |' % (
            chr(65 + i), c['text'], mark, c.get('hint', ''), fmt_effect(c.get('effect') or {})))
    return '\n'.join(out)


if __name__ == '__main__':
    depts = load_depts()
    db = rollout_db()
    index_rows = []
    for dept in depts:
        dept_id = dept['id']
        ranks = dept['ranks']
        good = read_players(f'{dept_id}-easy', {0})[0]
        bad = read_players(f'{dept_id}-normal', {1})[1]
        journey_figure(dept, good, 'good-easy')
        journey_figure(dept, bad, 'bad-normal')
        endings_figure(dept, dept_id)

        promo = db.execute("SELECT difficulty, AVG(promotions) a FROM players WHERE dept_id=? GROUP BY 1",
                           (dept_id,)).fetchall()
        promo_map = {r['difficulty']: r['a'] for r in promo}
        r3 = dept['ratings']
        md = [f"# {dept['icon']} {dept['name']} · 轨迹 Demo", '',
              f"> {dept['desc']}", '',
              '## 部门速览', '',
              '| 维度 | 评分 | 职级阶梯(起步科员) |', '|---|---|---|',
              f"| 权力 {'★'*r3['power']} | 忙碌 {'★'*r3['busy']} | "
              f"{' → '.join(dept['ranks'])} |",
              f"| 晋升 {'★'*r3['promotion']} | 风险 {'★'*r3['risk']} | 终点:{dept['ranks'][-1]} |", '',
              '| 职级 | 对应岗位 |', '|---|---|']
        for rk, pos in dept['rankPositions'].items():
            md.append(f'| {rk} | {pos} |')

        for p, tag, title in [(good, 'good-easy', '好好玩家(简单难度 · playerIdx 0)'),
                              (bad, 'bad-normal', '堕落玩家(普通难度 · playerIdx 1)')]:
            md += ['', f'## {title}', '',
                   f"![{dept_id}-{tag}](../assets/demos/{dept_id}-{tag}.png)", '',
                   f'- **结局**:{ENDING_ZH.get(p["endingType"], p["endingType"])}({p["endingType"]})·「{p["endingTitle"]}」',
                   f'- **终职级**:{p["finalRank"]}(晋升 {p["promotions"]} 次)',
                   f'- **结算评语**:{p["evalText"][:120]}', '',
                   '<details>', '<summary>📈 24 步完整轨迹表(点开)</summary>', '',
                   steps_table(p, ranks), '', '</details>', '',
                   sample_step(p, 1, '开局样例'),
                   '',
                   sample_step(p, next((s['step'] for s in p['steps'] if s['promoted']), 24),
                               '晋升步样例')]

        md += ['', '## 本部门 1,500 人结局与晋升', '',
               f"![{dept_id}-endings](../assets/demos/{dept_id}-endings.png)", '',
               '| 难度 | 人均晋升 |', '|---|---:|']
        for d in ('easy', 'normal', 'hard'):
            md.append(f'| {DIFF_ZH[d]} | {promo_map[d]:.2f} |')
        md += ['', '## 如何查看原始数据', '', '```bash',
               f'# 该部门三难度全部 500 人轨迹(每行=一局)',
               f'wc -l data/rollout-traj/{dept_id}-{{easy,normal,hard}}.jsonl',
               f'# 精选好好玩家(playerIdx=0,文件已按 playerIdx 排序,第1行即该玩家)',
               f'head -1 data/rollout-traj/{dept_id}-easy.jsonl | python3 -m json.tool | less',
               f'# 本部门聚合统计', 'node --experimental-sqlite -e "',
               f"const {{DatabaseSync}}=require('node:sqlite');const db=new DatabaseSync('data/rollout.db');",
               f"console.log(db.prepare('SELECT difficulty,policy,ending_type,COUNT(*) n,AVG(promotions) p FROM players WHERE dept_id=\\'{dept_id}\\' GROUP BY 1,2,3').all());\"",
               '```', '']
        with open(os.path.join(DEMOS_DIR, f'dept-{dept_id}.md'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(md))
        index_rows.append((dept, promo_map))
        print('doc', dept_id)

    # demos/README.md 索引(人读导航;数据口径与批量查看命令)
    readme = ['# 13 部门轨迹 Demo 总览', '',
              '> 数据源:`data/rollout-traj/<部门>-<难度>.jsonl`(39 文件 × 500 玩家,'
              'rollout v3 终版数据,mock LLM 口径)。每个 Demo 精选 2 名玩家做全景展示,'
              '并提供 24 步完整轨迹表、原文样例与本部门 1,500 人统计。',
              '> 玩家策略由 `playerIdx % 4` 决定:0=好好玩家(good),1=堕落玩家(bad),'
              '2=随机玩家(random),3=混合玩家(mixed)—— 你可以用下方命令查看任何一位。', '',
              '| 部门 | 图:好好玩家(简单) | 图:堕落玩家(普通) | 人均晋升 简/普/困 |', '|---|---|---|---|']
    for dept, pm in index_rows:
        readme.append(f"| [{dept['icon']} {dept['name']}](dept-{dept['id']}.md) | "
                      f"[属性曲线+职级](../assets/demos/{dept['id']}-good-easy.png) | "
                      f"[属性曲线+职级](../assets/demos/{dept['id']}-bad-normal.png) | "
                      f"{pm['easy']:.2f} / {pm['normal']:.2f} / {pm['hard']:.2f} |")
    readme += ['',
               '## 批量查看任意玩家', '', '```bash',
               '# 例:组织部 普通难度 第 251 行(playerIdx=250,随机玩家)',
               "sed -n '251p' data/rollout-traj/zuzhiB-normal.jsonl | python3 -m json.tool | less",
               '# 全局结局/晋升分布图与生成脚本',
               'ls docs/assets/global/  # g03-结局分布 / g04-晋升均值 / g05-效果分布',
               'python3 scripts/docs-gen/gen_dept_demos.py   # 本目录全部文档与图表复现',
               '```', '']
    with open(os.path.join(DEMOS_DIR, 'README.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(readme))
    print('DEMOS DONE')
