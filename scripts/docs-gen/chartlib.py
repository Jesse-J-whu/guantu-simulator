# 文档图表公共库 — 统一中文字体/配色/输出路径,供 gen_global_charts.py 与
# gen_dept_demos.py 复用。所有图表可由脚本复现(文档"如何查看/如何复现"引用)。
import json
import os
import sqlite3

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'docs', 'assets')

# 中文字体:服务器已装 Noto Sans CJK;注册后 matplotlib 全局可用。
for _f in ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',):
    if os.path.exists(_f):
        font_manager.fontManager.addfont(_f)
plt.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'Noto Sans CJK JP', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.dpi'] = 140
plt.rcParams['savefig.bbox'] = 'tight'
plt.rcParams['axes.grid'] = True
plt.rcParams['grid.alpha'] = 0.25

# 属性固定配色(全文档一致):政/执/网/廉
ATTR_COLORS = {'politics': '#2563eb', 'execute': '#f59e0b', 'network': '#10b981', 'integrity': '#ef4444'}
ATTR_ZH = {'politics': '政治', 'execute': '执行', 'network': '人脉', 'integrity': '廉洁'}
ENDING_COLORS = {'GREAT': '#15803d', 'GOOD': '#65a30d', 'MID': '#d97706', 'MID2': '#b45309', 'BAD': '#dc2626'}
ENDING_ZH = {'GREAT': '青云直上', 'GOOD': '稳健良好', 'MID': '中评', 'MID2': '平淡', 'BAD': '落马'}
DIFF_ZH = {'easy': '简单', 'normal': '普通', 'hard': '困难'}
POLICY_ZH = {'good': '好好玩家', 'bad': '堕落玩家', 'random': '随机玩家', 'mixed': '混合玩家'}
DEPT_ORDER = ['weiban', 'fuban', 'zuzhiB', 'jiwei', 'fagaB', 'caizhi', 'xuanchuanB',
              'tongzhan', 'zhengfaB', 'jiaoyu', 'keji', 'zhengxie', 'renda']


def save(fig, relpath):
    """按 docs/assets 下相对路径保存并关闭。"""
    fp = os.path.join(ASSETS, relpath)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    fig.savefig(fp)
    plt.close(fig)
    print('saved', fp)


def rollout_db():
    con = sqlite3.connect(os.path.join(ROOT, 'data', 'rollout.db'))
    con.row_factory = sqlite3.Row
    return con


def server_db():
    con = sqlite3.connect(os.path.join(ROOT, 'data', 'rollout-server.db'))
    con.row_factory = sqlite3.Row
    return con


def load_depts():
    """部门元数据(ladder/星级/岗位),由 tsx 从 src/engine/departments.ts 导出。"""
    with open('/tmp/guantu-depts.json', encoding='utf-8') as f:
        return json.load(f)


def read_players(traj_name, want_idx):
    """从轨迹 JSONL 按 playerIdx 取指定玩家(文件已按 playerIdx 排序,仍按字段过滤防错位)。"""
    fp = os.path.join(ROOT, 'data', 'rollout-traj', traj_name + '.jsonl')
    got = {}
    with open(fp, encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            p = json.loads(line)
            if p['playerIdx'] in want_idx:
                got[p['playerIdx']] = p
                if len(got) == len(want_idx):
                    break
    return got


def fmt_effect(effects):
    """效果字典 → 紧凑中文串,如 `政+3 执+5 网-1 廉+4`。"""
    key_zh = {'politics': '政', 'execute': '执', 'network': '网', 'integrity': '廉'}
    parts = []
    for k in ('politics', 'execute', 'network', 'integrity'):
        v = effects.get(k) or 0
        parts.append(f"{key_zh[k]}{v:+d}" if v else f"{key_zh[k]}0")
    return ' '.join(parts)
