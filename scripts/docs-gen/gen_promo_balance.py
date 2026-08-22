# 晋升平衡分析图表(docs/experiments/exp-promotion-balance.md 引用)。
# 数据源:
#   1) 旧分布(系数1.3):data/promo-balance/old-dist-by-combo.csv(重跑前对旧 rollout.db 的聚合快照,
#      data/*.db* 不入 git,旧库本体已被重跑覆盖)
#   2) 新分布(系数1.2):data/rollout.db(重跑后)
#   3) 上界口径:data/promo-balance/ceiling-hard1.3.json 与 ceiling-hard1.2.json,
#      由 scripts/promotion-ceiling.mts 生成(200 种子)
# 运行:python3 scripts/docs-gen/gen_promo_balance.py
import csv
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
from chartlib import ASSETS, ATTR_COLORS, DEPT_ORDER, save  # noqa: E402

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

OLD_CSV = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'promo-balance', 'old-dist-by-combo.csv')
NEW_CEIL = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'promo-balance', 'ceiling-hard1.2.json')
OLD_CEIL = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'promo-balance', 'ceiling-hard1.3.json')
OUT_DIR = 'experiments/promo-balance'

DEPT_ZH = {
    'weiban': '委办', 'fuban': '府办', 'zuzhiB': '组织部', 'jiwei': '纪委', 'fagaB': '发改委',
    'caizhi': '财政', 'xuanchuanB': '宣传部', 'tongzhan': '统战', 'zhengfaB': '政法',
    'jiaoyu': '教育', 'keji': '科技', 'zhengxie': '政协', 'renda': '人大',
}


def load_rolls():
    """读取上界 JSON。"""
    import json
    with open(NEW_CEIL, encoding='utf-8') as f:
        new = json.load(f)
    with open(OLD_CEIL, encoding='utf-8') as f:
        old = json.load(f)
    return old, new


def new_dist():
    """新 rollout.db:dept×difficulty 的 good 玩家晋升均值 + 秩次分布。"""
    con = sqlite3.connect(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'rollout.db'))
    con.row_factory = sqlite3.Row
    rows = {}
    for r in con.execute(
        'SELECT dept_id, difficulty, promotions, COUNT(*) n FROM players GROUP BY dept_id, difficulty, promotions'
    ):
        rows.setdefault((r['dept_id'], r['difficulty']), {})[r['promotions']] = r['n']
    good = {}
    for r in con.execute(
        "SELECT dept_id, difficulty, AVG(promotions) m FROM players WHERE policy='good' GROUP BY dept_id, difficulty"
    ):
        good[(r['dept_id'], r['difficulty'])] = r['m']
    con.close()
    return rows, good


def old_good():
    out = {}
    with open(OLD_CSV, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            out[(row['dept_id'], row['difficulty'])] = float(row["mean_prom_good"])
    return out


def main():
    old_ceil, new_ceil = load_rolls()
    dist, good_new = new_dist()
    good_old = old_good()
    os.makedirs(os.path.join(ASSETS, OUT_DIR), exist_ok=True)

    # ---- pb01:hard 点数预算 vs 累计晋升成本(星级分层,旧1.3 vs 新1.2) ----
    fig, ax = plt.subplots(figsize=(8.6, 5.0))
    star_tiers = {5: '#15803d', 4: '#2563eb', 3: '#f59e0b', 2: '#b45309'}
    for star, color in star_tiers.items():
        row = next(r for r in new_ceil['combos'] if r['difficulty'] == 'hard' and r['promoStar'] == star)
        row_old = next(r for r in old_ceil['combos'] if r['difficulty'] == 'hard' and r['promoStar'] == star)
        x = range(1, len(row['cumCosts']) + 1)
        ax.plot(list(x), row['cumCosts'], '-o', color=color, ms=4,
                label=f'{star}星(系数{row["starFactor"]}) · 新1.2')
        ax.plot(list(x), row_old['cumCosts'], '--', color=color, ms=3, alpha=0.55,
                label=f'{star}星 · 旧1.3')
    budget = next(r for r in new_ceil['combos'] if r['difficulty'] == 'hard')['good_points']
    ax.axhline(budget, color='#dc2626', lw=1.6)
    ax.text(6.6, budget + 2, f'hard 24步点数预算 ≈ {budget:.0f}(good/最优玩法)', color='#dc2626', fontsize=9)
    ax.set_xlabel('第 N 次晋升(累计成本)')
    ax.set_ylabel('累计晋升成本(绩效点)')
    ax.set_title('pb01 · hard 难度:累计晋升成本曲线 vs 点数预算(旧 1.3 → 新 1.2)')
    ax.legend(fontsize=7.5, ncol=2, loc='upper left')
    save(fig, os.path.join(OUT_DIR, 'pb01-hard-budget.png'))

    # ---- pb02:hard good 玩家晋升均值 旧 vs 新(13 部门) ----
    fig, ax = plt.subplots(figsize=(9.2, 4.6))
    x = np.arange(len(DEPT_ORDER))
    olds = [good_old.get((d, 'hard'), 0) for d in DEPT_ORDER]
    news = [good_new.get((d, 'hard'), 0) for d in DEPT_ORDER]
    ax.bar(x - 0.2, olds, 0.38, label='旧 hard 系数 1.3', color='#94a3b8')
    ax.bar(x + 0.2, news, 0.38, label='新 hard 系数 1.2', color=ATTR_COLORS['politics'])
    for i, (o, n) in enumerate(zip(olds, news)):
        ax.text(i, max(o, n) + 0.08, f'{o:.2f}→{n:.2f}', ha='center', fontsize=7)
    ax.set_xticks(x)
    ax.set_xticklabels([DEPT_ZH[d] for d in DEPT_ORDER], fontsize=9)
    ax.set_ylim(0, 5.2)
    ax.set_ylabel('good 玩家平均晋升次数')
    ax.set_title('pb02 · hard 难度 good 玩家晋升次数:旧 1.3(全员恒 3.00)vs 新 1.2(五星部门 4.00)')
    ax.legend()
    save(fig, os.path.join(OUT_DIR, 'pb02-hard-good.png'))

    # ---- pb03:组织部 hard 终局秩次分布 旧 vs 新 ----
    fig, ax = plt.subplots(figsize=(8.6, 4.6))
    ranks_n = 7
    old_hist = [0] * ranks_n
    with open(OLD_CSV, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['dept_id'] == 'zuzhiB' and row['difficulty'] == 'hard':
                for i in range(ranks_n):
                    old_hist[i] = int(row.get(f'rank{i}', 0) or 0)
    new_hist = [dist.get(('zuzhiB', 'hard'), {}).get(i, 0) for i in range(ranks_n)]
    x = np.arange(ranks_n)
    ax.bar(x - 0.2, old_hist, 0.38, label='旧 1.3', color='#94a3b8')
    ax.bar(x + 0.2, new_hist, 0.38, label='新 1.2', color=ATTR_COLORS['execute'])
    ax.set_xticks(x)
    ax.set_xticklabels(['科员', '副科级', '正科级', '副处级', '正处级', '副厅级', '正厅级'], fontsize=9)
    ax.set_ylabel('玩家数(/500)')
    ax.set_title('pb03 · 组织部 hard:终局职级分布 旧 vs 新(副处级 298 人的堆积被打开)')
    for i, (o, n) in enumerate(zip(old_hist, new_hist)):
        if o or n:
            ax.text(i, max(o, n) + 6, f'{o}→{n}', ha='center', fontsize=8)
    ax.legend()
    save(fig, os.path.join(OUT_DIR, 'pb03-zuzhi-hard.png'))

    # ---- pb04:三难度 × 四策略 平均晋升 旧 vs 新 ----
    fig, axes = plt.subplots(1, 3, figsize=(10.5, 4.0), sharey=True)
    con = sqlite3.connect(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'rollout.db'))
    policies = ['good', 'mixed', 'random', 'bad']
    old_agg = {  # 旧全库聚合(重跑前 SQL,见 exp 文档 §2.2 表 / data/promo-balance/old-sql-summary.md)
        'easy': [4.077, 3.985, 3.716, 2.062],
        'normal': [3.847, 3.568, 3.105, 1.143],
        'hard': [2.923, 2.802, 2.164, 0.997],
    }
    for ax, diff in zip(axes, ['easy', 'normal', 'hard']):
        new_vals = [
            con.execute(
                "SELECT AVG(promotions) FROM players WHERE difficulty=? AND policy=?", (diff, p)
            ).fetchone()[0]
            for p in policies
        ]
        x = np.arange(len(policies))
        ax.bar(x - 0.2, old_agg[diff], 0.38, label='旧 1.3', color='#94a3b8')
        ax.bar(x + 0.2, new_vals, 0.38, label='新 1.2', color=ATTR_COLORS['network'])
        ax.set_xticks(x)
        ax.set_xticklabels(['good', 'mixed', 'random', 'bad'], fontsize=9)
        ax.set_title(f'{diff}')
        for i, (o, n) in enumerate(zip(old_agg[diff], new_vals)):
            ax.text(i, max(o, n) + 0.08, f'{n:.2f}', ha='center', fontsize=7.5, color=ATTR_COLORS['network'])
        ax.legend(fontsize=8)
    axes[0].set_ylabel('平均晋升次数(全部门)')
    fig.suptitle('pb04 · 难度 × 策略平均晋升:重跑前后(easy/normal 不变,hard 五星部门抬升)', y=1.02)
    save(fig, os.path.join(OUT_DIR, 'pb04-diff-policy.png'))
    con.close()

    print('promo-balance charts done')


if __name__ == '__main__':
    main()
