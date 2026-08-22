# 开发史(Development History)

> 官途模拟器 2026-08-21 至 08-23 的三阶段演进:从 v1 单文件原型到 19,500 玩家验证的生产系统。
> 基线 `2596870`(v1 时代最后的 commit)→ Phase 1 合入 `f0d9847` → Phase 2 合入 `e4fa8f5`
> → Phase 3 合入 `c6e6ddf`(当前 main)。

## 三阶段导读

**[Phase 1 — 算法/工程大修](phase-1.md)**(分支 `dev/v2-overhaul`,01:32–09:02,20 commits)
围绕用户六大诉求(故事衔接/文案不重复/属性生效/职级正确/晋升体验/结局评级)重写引擎、前后端与服务端,建立 vitest 91→127、Playwright E2E、autocannon 压测三层质量地基;随后接真实 GLM(glm-4-flash)走生产路径做**三轮 29 局全流程扫描**,把"一局内重复文案"从 37 次标题重复 + 14 次套话收敛到**标题/选项重复 0**,期间 reviewer 五轮对抗审核全部 PoC 化修复。详见 [phase-1.md](phase-1.md) 与 [docs/diversity-report.md](../diversity-report.md)。

**[Phase 2 — 19,500 玩家大规模用户测试](phase-2.md)**(分支 `feat/mass-rollout`,10:15–14:50,11 commits)
13 部门 × 3 难度 × 500 玩家走生产 HTTP 路径完整通关;独立复核脚本从原始轨迹全量重算(drift=0);39 个审计 subagent 全量机械核验 + 624 人逐字深读,0 真实违例。**两轮审计驱动的真实返工**(v1 正文模板重复 → 重写 30 场景单元;v2 D 槽廉洁语义倒挂 → 改符号)各触发一次 19,500 人全量重跑,保证代码/数据/审计三者一致。压测暴露 /api/stats 容量缺陷,TTL 缓存修复后 S3 p99 17.2s→107ms。详见 [phase-2.md](phase-2.md) 与 [docs/rollout-report.md](../rollout-report.md)。

**[Phase 3 — 全套文档 + 前端官职显示 + E4 晋升平衡调优](phase-3.md)**(分支 `docs/full-docs` / `feat/rank-position-ui` / `feat/promotion-balance`,08-21 晚–08-23)
三条线:①91 文件全套文档与「latest 活文档,改代码必同步」制度(57 图全部脚本可再生成);②每年界面常驻显示官职与职级(HUD 双项 + 事件卡徽标 + 晋升/结算官职,组件测试 + E2E 断言);③用户观察「有的情况下十分难以晋升」触发 E4——上界分析证明 1.3 时代 hard 五星部门第 4 级成本 106 高于任何种子的收入上限 104(结构性不可达),修正系数 1.3→1.2 并 **19,500 人 v4 全量重跑**(easy/normal 逐组合零变化、结局分布不变、hard good 2.923→3.156、4 次晋升者 0→386)+ 3 组合定点审计全 PASS。详见 [phase-3.md](phase-3.md) 与 [docs/experiments/exp-promotion-balance.md](../experiments/exp-promotion-balance.md)。

## commit 索引

### Phase 1(dev/v2-overhaul,时间序)

| Hash | 主题 | 驱动方 |
|---|---|---|
| cecbb0f | vitest 91 用例 + 模块化重构 + 修 3 个引擎缺陷 | 测试 |
| 80bca04 | Playwright E2E + 修晋升庆祝死锁(严重) | E2E |
| 343b952 | 压测 3 个服务端缺陷(建库竞态/503/排空请求体) | 压测 |
| 83ebda7 | GLM 风控(1301)双级防护 + 多样性扫描脚本 | 真实 GLM |
| ec6bfbb | 解析失败自动重试(约 7% 格式违规率) | 真实 GLM |
| dc68ca7 | 解析器键名变体容错(选项 A/全角Ａ) | 真实 GLM |
| 6f5061b | reviewer 一轮 P1(XSS/XFF/穿越/跨事件去重/strict) | reviewer |
| ee120d0 | 解析器容忍选项正文为空的真实样本 | 真实 GLM |
| 9354bf0 | reviewer 二轮 P2(禁回退仓库根/XFF 取最右) | reviewer |
| 37687b1 | 真实 README(TRUST_PROXY 前提)+ 防变异掩蔽断言 | reviewer |
| bf330c3 | 套话标题根治(暗流涌动 9 部门复现 14 次) | 13 局扫描 |
| eb5c430 | 去重阈值再校准 + 兜底不放行逐字重复 | 探针 1 |
| c837bea | 标题改词组级口径 + 撞车选项点名重试 | 探针 2 |
| 456aded | 剥离格式模板回声 | 探针 3 |
| 431d673 | mock 选项文案按步供给 24 组互异 | E2E |
| f13d8f8 | reviewer 三轮 P2:去重兜底硬保证自验 | reviewer |
| cc70ac1 | 真实 GLM 13 局终扫报告(原始数据入库) | 终扫 |
| 82e4bad | 确认扫描两根因(去重池 60 截断/超时语义) | 8 局确认扫 |
| 65057fe | 终验扫描全指标达标(选项重复 0) | 8 局终验 |
| 8934a52 | reviewer 3b 阻断项:合成选项逐级验池 | reviewer |
| **f0d9847** | **Merge dev/v2-overhaul 合入 main**(81 文件 +34,864/−3,909) | — |

### Phase 2(feat/mass-rollout,时间序)

| Hash | 主题 | 驱动方 |
|---|---|---|
| ea7c17d | 大规模 rollout 系统(13×3×500 玩家,生产路径) | 需求 |
| 5e5ddce | 属性生效判定考虑 0/100 夹取边界 + 独立复核脚本 | 复核 |
| 539250b | 39 审计 subagent 统一提示词模板 | 审计制度 |
| 6015d2e | mock 重写 30 场景单元 + descDup 指标(全量重跑 v2) | 审计一轮 |
| 34dec68 | 审计模板按 playerIdx 取样(行序陷阱) | 审计实测 |
| 27e8c08 | 场景 1/3 D 槽廉洁 +1 改 −2(全量重跑 v3) | 审计二轮 |
| 9007585 | rollout 最终报告 + 39 组合审计全 PASS(624 人深读) | 审计汇总 |
| 17e764f | /api/stats 10s TTL 缓存(S3 吞吐 156 倍) | 压测 |
| 62d805b | 全量 gate 补记 + E2E 截图证据入库 | 留档 |
| a382d8e | 评审 P3 四项(数字对齐 DB/TTL 单测/幂等/口径) | 评审 |
| 318fffc | 晋升占比 11.94%→11.95%(四舍五入) | 评审 |
| **e4fa8f5** | **Merge feat/mass-rollout 合入 main**(99 文件 +8,192/−107) | — |

### Phase 3(docs/full-docs → feat/rank-position-ui → feat/promotion-balance,时间序)

| Hash | 主题 | 驱动方 |
|---|---|---|
| 706d523 | 全套开发文档:latest 活文档 ×5 / 13 部门 Demo / 实验报告 / 开发史 / 用户旅程,57 图 | 文档制度 |
| 6d2adf4 | 文档评审 P3/P4 五项修正(峰值笔误/双口径/行号漂移/pyc 出库/精确口径) | 评审 |
| **146004a** | **Merge docs/full-docs 合入 main**(91 文件 +6,367) | — |
| a5f8c43 | 修事件卡入场动画导致内容永久透明 | 前置修复 |
| be73cb5 | 每年界面常驻显示官职与职级(HUD/徽标/晋升/结算+组件测试+E2E) | 用户诉求 |
| e7d16e3 | UI 评审 P3/P4 四项(删失实声称/基线/反引号/移动端换行) | 评审 |
| **d2654e0** | **Merge feat/rank-position-ui 合入 main**(27 文件 +296/−23) | — |
| 755e211 | E4 上界分析脚本 + hard 1.3→1.2 + 两个回归锚点测试 | 数据分析 |
| 6901ab9 | v4 全量重跑 19,500 人 + 定点审计 3 组合 + 全套文档/图同步 | 验证闭环 |
| e314fd8 | merge main(官职显示)入平衡分支 | 分支同步 |
| 5b1e1c9 | 评审 P3/P4 六项(行号锚点漂移/v4 标头/12 部门口径/bad≈1.00/归档清单/锚点注释) | 评审 |
| **c6e6ddf** | **Merge feat/promotion-balance 合入 main**(49 文件 +5,347/−127) | — |

## 如何用 git 验证

```bash
git log --oneline --reverse 2596870..f0d9847    # Phase 1 全部 commit
git log --oneline --reverse f0d9847..e4fa8f5    # Phase 2 全部 commit
git log --oneline --reverse e4fa8f5..c6e6ddf    # Phase 3 全部 commit
git show <hash>                                  # 任意 commit 的动机(message)与 diff
git show <hash> --stat                           # 只看改动文件清单
git diff 2596870 f0d9847 --shortstat             # Phase 1 总差异:81 文件
git diff f0d9847 e4fa8f5 --shortstat             # Phase 2 总差异:99 文件
git diff e4fa8f5 c6e6ddf --shortstat             # Phase 3 总差异:133 文件
git log --graph --oneline 2596870..c6e6ddf       # 三阶段分支拓扑
```

每章末尾另附该阶段的专属验证命令(查 `data/rollout.db`、重跑扫描/复核/压测/上界分析等)。所有文档结论均可用上述命令与仓库内 `data/` 原始数据复验;两轮审计驱动的返工与已知产品级观察均在报告中如实记录,未作修饰。
