# 13 部门轨迹 Demo 总览

> 数据源:`data/rollout-traj/<部门>-<难度>.jsonl`(39 文件 × 500 玩家,rollout v3 终版数据,mock LLM 口径)。每个 Demo 精选 2 名玩家做全景展示,并提供 24 步完整轨迹表、原文样例与本部门 1,500 人统计。
> 玩家策略由 `playerIdx % 4` 决定:0=好好玩家(good),1=堕落玩家(bad),2=随机玩家(random),3=混合玩家(mixed)—— 你可以用下方命令查看任何一位。

| 部门 | 图:好好玩家(简单) | 图:堕落玩家(普通) | 人均晋升 简/普/困 |
|---|---|---|---|
| [🏛 委办（党委办公室）](dept-weiban.md) | [属性曲线+职级](../assets/demos/weiban-good-easy.png) | [属性曲线+职级](../assets/demos/weiban-bad-normal.png) | 4.12 / 3.40 / 2.67 |
| [📋 府办（政府办公室）](dept-fuban.md) | [属性曲线+职级](../assets/demos/fuban-good-easy.png) | [属性曲线+职级](../assets/demos/fuban-bad-normal.png) | 3.50 / 3.09 / 2.37 |
| [🎯 组织部](dept-zuzhiB.md) | [属性曲线+职级](../assets/demos/zuzhiB-good-easy.png) | [属性曲线+职级](../assets/demos/zuzhiB-bad-normal.png) | 4.39 / 3.39 / 2.69 |
| [⚖️ 纪委（纪律检查委员会）](dept-jiwei.md) | [属性曲线+职级](../assets/demos/jiwei-good-easy.png) | [属性曲线+职级](../assets/demos/jiwei-bad-normal.png) | 4.12 / 3.41 / 2.69 |
| [📊 发改委](dept-fagaB.md) | [属性曲线+职级](../assets/demos/fagaB-good-easy.png) | [属性曲线+职级](../assets/demos/fagaB-bad-normal.png) | 4.04 / 3.10 / 2.37 |
| [💰 财政部门](dept-caizhi.md) | [属性曲线+职级](../assets/demos/caizhi-good-easy.png) | [属性曲线+职级](../assets/demos/caizhi-bad-normal.png) | 3.50 / 2.99 / 2.32 |
| [📢 宣传部](dept-xuanchuanB.md) | [属性曲线+职级](../assets/demos/xuanchuanB-good-easy.png) | [属性曲线+职级](../assets/demos/xuanchuanB-bad-normal.png) | 3.50 / 3.02 / 2.32 |
| [🤝 统战部](dept-tongzhan.md) | [属性曲线+职级](../assets/demos/tongzhan-good-easy.png) | [属性曲线+职级](../assets/demos/tongzhan-bad-normal.png) | 2.75 / 2.53 / 2.27 |
| [🔰 政法委](dept-zhengfaB.md) | [属性曲线+职级](../assets/demos/zhengfaB-good-easy.png) | [属性曲线+职级](../assets/demos/zhengfaB-bad-normal.png) | 4.07 / 3.11 / 2.38 |
| [📚 教育部门](dept-jiaoyu.md) | [属性曲线+职级](../assets/demos/jiaoyu-good-easy.png) | [属性曲线+职级](../assets/demos/jiaoyu-bad-normal.png) | 2.75 / 2.53 / 2.26 |
| [🔬 科技部门](dept-keji.md) | [属性曲线+职级](../assets/demos/keji-good-easy.png) | [属性曲线+职级](../assets/demos/keji-bad-normal.png) | 3.50 / 3.03 / 2.31 |
| [🏅 政协](dept-zhengxie.md) | [属性曲线+职级](../assets/demos/zhengxie-good-easy.png) | [属性曲线+职级](../assets/demos/zhengxie-bad-normal.png) | 2.00 / 1.78 / 1.75 |
| [📜 人大](dept-renda.md) | [属性曲线+职级](../assets/demos/renda-good-easy.png) | [属性曲线+职级](../assets/demos/renda-bad-normal.png) | 2.75 / 2.53 / 2.27 |

## 批量查看任意玩家

```bash
# 例:组织部 普通难度 第 251 行(playerIdx=250,随机玩家)
sed -n '251p' data/rollout-traj/zuzhiB-normal.jsonl | python3 -m json.tool | less
# 全局结局/晋升分布图与生成脚本
ls docs/assets/global/  # g03-结局分布 / g04-晋升均值 / g05-效果分布
python3 scripts/docs-gen/gen_dept_demos.py   # 本目录全部文档与图表复现
```
