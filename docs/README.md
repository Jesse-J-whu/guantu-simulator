# 官途模拟器 · 文档中心

> 这里是全部文档的入口。**改代码必须同步改文档** —— 维护规则见文末。

## 快速导航(按你想做什么)

| 你想… | 去看 |
|---|---|
| 5 分钟了解这个项目是什么、怎么跑起来 | [latest/overview.md](latest/overview.md) |
| 看真实玩家的一局长什么样(截图 walkthrough) | [user-journey.md](user-journey.md) |
| 读懂/修改核心算法(效果、晋升、结局、去重) | [latest/engine.md](latest/engine.md) |
| 部署、改服务端、加 API | [latest/server.md](latest/server.md) |
| 改前端页面与交互 | [latest/frontend.md](latest/frontend.md) |
| 查数据:轨迹/统计/数据库表结构 | [latest/data-assets.md](latest/data-assets.md) |
| 看某个部门的玩家轨迹 Demo(13 篇,图文) | [demos/](demos/README.md) |
| 复现实验(19,500 玩家 rollout / 真 GLM 多样性 / 压测 / 晋升平衡调优) | [experiments/](experiments/README.md) |
| 了解每一版 commit 为什么改、怎么验证的 | [dev-history/](dev-history/README.md) |

## 文档地图

```text
docs/
├── README.md                  ← 你在这里(总索引)
├── user-journey.md            真实浏览器一局完整截图 walkthrough(E2E 产物)
├── rollout-report.md          19,500 玩家大规模测试终版报告(结论层)
├── diversity-report.md        真实 GLM 多样性验证报告(结论层)
├── audit-prompt-template.md   39 个审计 subagent 的提示词模板(v3 全量)
├── audit-prompt-template-v4.md v4 定点审计模板(3 个 hard 代表组合)
├── latest/                    ★ 活文档:当前最新设计(改代码必同步)
│   ├── overview.md            产品/架构/快速开始(配架构图+用户截图)
│   ├── engine.md              引擎与算法(效果/amplify/晋升/结局/去重,配图)
│   ├── server.md              服务端(集群/API/留存库/LLM代理/stats缓存,配图)
│   ├── frontend.md            前端(组件树/useGame状态机/严格TS,配截图)
│   └── data-assets.md         数据资产/表结构/后台数据呈现方案/查看命令
├── demos/                     13 部门轨迹 Demo(每部门:双玩家曲线图+24步全表+原文样例)
├── experiments/               可复现实验报告(方法/结果/如何查看/复现命令)
│   ├── exp-rollout-19500.md   19,500 玩家大规模用户测试
│   ├── exp-diversity-realglm.md  真实 GLM 多样性验证
│   ├── exp-loadtest.md        压测与容量修复(含 stats TTL 前后对照)
│   └── exp-promotion-balance.md  晋升平衡调优(上界分析 + 1.3→1.2 + v4 重跑)
├── dev-history/               开发史:每个 commit 的动机/改动/验证
│   ├── phase-1.md             算法大修 + 真 GLM 验证(20 commit)
│   ├── phase-2.md             大规模用户测试(11 commit)
│   └── phase-3.md             文档基建 + 官职显示 + E4 晋升平衡调优(12 commit)
└── assets/                    全部插图(脚本生成,可复现)
    ├── global/                10 张全局图(g01架构 … g10审计热图)
    ├── demos/                 39 张部门图(每部门×3)
    ├── experiments/promo-balance/  4 张晋升平衡图(预算vs成本/新旧对比/直方图/难度×策略)
    └── user-journey/          8 张真实浏览器截图(E2E)
```

## 阅读顺序建议

- **新接手项目**:overview → user-journey → engine → 按需其他
- **评审/验收**:rollout-report → experiments/ → demos/(抽查两个部门)→ dev-history/
- **运营看数据**:data-assets.md 的「如何查看」命令 + demos/

## 文档维护规则(重要)

1. **`latest/` 是活文档**:任何改动生产代码/脚本的 commit,必须在同一个 commit 里
   更新对应 `latest/*.md`。文档顶部有基线 hash,更新时刷新。
2. **结论文档只追加不改写历史**:rollout-report / diversity-report 记录的是当时事实,
   后续变化写新报告或在 dev-history 记新条目。
3. **数字必须可复算**:文档里出现的每个关键数字,要么给出来源文件,要么给出复算
   命令。禁止手造数字。
4. **图表用脚本生成**:`scripts/docs-gen/` 下脚本 + `docs/assets/` 产物;改数据后
   重跑脚本更新图,不手工 P 图。
5. **图片必须嵌入**正文(markdown `![](...)`),不允许只给路径。
6. 新增文档:放进对应子目录,并更新本 README 的地图与导航表。
