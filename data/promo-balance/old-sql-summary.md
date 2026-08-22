# 晋升分布分析 — data/rollout.db(19,500 玩家 / 39 组合 / 500 人每组合)

数据: `players` 19,500 行(39 combo × 500),全部 `steps_done=24`、`completed=100%`、`meets_requirements=100%`。
阶梯以 `src/engine/departments.ts` 的 `ranks` 数组为准(2026-08-22 逐部门核对)。
映射交叉验证: `final_rank` 文本 → 秩次 vs `steps` 中 step=24 的 `rank_after`,抽样 combo 1/7/17 各 500/500 一致,全局 **19,500/19,500 = 100%** 一致(见 mapping_validation.txt)。

## 0. 阶梯核对:任务描述中的记忆有 6 处与代码不符(以代码为准)

| 部门 | 记忆 | 代码(departments.ts) |
|---|---|---|
| fagaB 发改委 | 5级(→正处级) | **6级**(科员,副科级,正科级,副处级,正处级,副厅级) |
| zhengfaB 政法 | 5级 | **6级**(→副厅级) |
| tongzhan 统战 | 5级 | **4级**(科员,副科级,正科级,副处级) |
| jiaoyu 教育 | 5级 | **4级**(→副处级) |
| zhengxie 政协 | 3级(科员,副科级,正科级) | **3级但名称不同:委员,常委,副主席** |
| renda 人大 | 3级 | **4级:代表,委员,副主任,主任** |

weiban(6)/fuban(5)/zuzhiB(7)/jiwei(6)/caizhi(5)/xuanchuanB(5)/keji(5) 与记忆一致。

## 1. 全局不变量

- **promotions ≡ final_rank 秩次**:19,500 人逐一校验 0 处不一致(每人从秩次 0 出发,每晋升 +1)。因此 mean_final_rank_idx 与 mean_promotions 在全部 39 组合完全相等。
- 全局 mean_promotions=2.866(p50=3,max=6);easy 3.460 / normal 2.916 / hard 2.221。
- 策略排序恒定:good > mixed > random >> bad。聚合均值(每格 1,625 人):easy 4.077/3.985/3.716/2.062;normal 3.847/3.568/3.105/1.143;hard 2.923/2.802/2.164/0.997。

## 2. 对照设计期望(普通玩家 2-3 次、优秀玩家 4-5 次;ladder_len-1 为上限)

- **normal 全体均值 2.92 ✓ 落在"普通 2-3 次"区间**。
- **"优秀玩家 4-5 次"只在 L≥5 部门成立**:normal 难度 good 均值——L7 zuzhiB 5.00,L6 weiban/jiwei 5.00、fagaB 4.01、zhengfaB 4.00,L5 各部门 4.00。但 **L4 部门(jiaoyu/tongzhan/renda)good 恒等于 3.00 = 阶梯上限,根本到不了 4-5 次**;zhengxie(L3)good 恒 2.00。上限封顶使该设计目标在 4 个部门结构性不可达。
- **hard 难度 good 在全部 13 个部门精确等于 3.00**(每格 125 人均值零偏差),bad 精确 1.00(仅 4 级部门 0.98-0.99,共 6 人 24 步 0 晋升卡在科员/代表)。hard 下晋升次数对纯策略近乎确定,难度是唯一主导变量。

## 3. 分布退化(大量玩家卡在同一级)

- **zhengxie easy:500/500 全部到顶副主席**,四种策略全部精确 2.00 —— 完全无区分度(全库唯一)。
- 到顶率 ≥74% 的组合共 12 个,集中在 easy/normal 的短阶梯:zhengxie easy 100% / normal 77.8% / hard 74.8%;jiaoyu easy 75.2% / normal 75.0%;tongzhan easy 74.8% / normal 74.6%;renda easy 74.8% / normal 74.2%;xuanchuanB easy 74.6%;caizhi easy 74.2%;keji easy 74.0%;fuban easy 73.8%。即 easy 下 L4/L5 部门约 3/4 玩家挤在最高级,单级堆积 369-376 人。
- **hard 下 L5-L7 部门到顶率全部为 0%**(24 步内无人到顶),人群改挤中间层:zuzhiB hard 298/500(59.6%)卡在副处级(秩3),weiban 295、jiwei 299 同卡副处级 —— hard 的"顶"实际变成正科级/副处级,顶格奖励形同虚设。
- 非退化健康样本:zuzhiB easy(到顶 27.0%,good-bad 极差 3.87 全库最大,7 级全用上)、jiwei/weiban easy(58.4%,good 5.00)。

## 4. 政协/人大(短阶梯)区分度

- **zhengxie(3级,上限2次)**:结局只有 1 或 2 次晋升两种,good-bad 极差 easy 0.00 / normal 0.88 / hard 1.00 —— 全库最低,近乎抛硬币;且 easy 全员到顶。
- **renda(4级,上限3次)**:好于政协(good-bad 极差 easy 2.01 / normal 2.05 / hard 2.02),但 good 三档难度全部精确 3.00(顶格),hard 到顶率仍 42.2%。
- 对比:L≥6 部门 good-bad 极差普遍 2.8-3.9,长阶梯是区分策略优劣的主要来源。

## 5. 显著困难的组合(worst.csv,按 mean_promotions 升序)

前 15 名全部是短阶梯或 hard:zhengxie 三档包揽倒数 1-3(1.748/1.778/2.000),renda/tongzhan/jiaoyu hard 居 4-6(2.166-2.220),其余为 L5-L7 部门 hard(2.228-2.346)。这些"低均值"部分是阶梯上限使然(zhengxie 上限 2),不全是难度问题;真正的异常是 **hard 下 good 也被压到 3.00、到顶 0%**。

## 6. 交叉:promotions × ending_type 按难度(promo_by_ending_type.csv)

单调关系稳定 **BAD < MID/MID2 < GOOD < GREAT**,三档难度全部成立:

| 难度 | BAD | GOOD | GREAT | MID(稀有) |
|---|---|---|---|---|
| easy | 2.062 (n=1625) | 3.635 (n=397) | 3.970 (n=4344) | 3.361 (n=133), MID2 n=1 |
| normal | 1.149 (n=1636) | 2.916 (n=393) | 3.587 (n=4330) | 2.820 (n=139), MID2 n=2 |
| hard | 1.030 (n=1691) | 2.012 (n=422) | 2.710 (n=4334) | 2.000 (n=53) |

GREAT 与 GOOD 的晋升差(easy 0.34 / normal 0.67 / hard 0.70)远小于 GOOD 与 BAD 的差(easy 1.57 / normal 1.77 / hard 0.98):**BAD 结局主要由低晋升驱动,GREAT/GOOD 的分化更多来自其他条件**。ending_type 构成与难度几乎无关(GREAT≈66.7%、BAD≈25% 三档恒定),结局判定主要由局内表现而非难度决定。MID/MID2 合计仅 328 人(1.7%),类别稀有。

## 文件清单

- `dist_by_combo.csv` — 39 组合全量:秩次分布 rank0..rank6、mean/p25/p50/p75、到顶率、四策略均值
- `worst.csv` — mean_promotions 升序前 15
- `promo_by_ending_type.csv` — promotions × ending_type × difficulty 交叉
- `mapping_validation.txt` — final_rank 映射交叉验证(抽样3组合+全局)
- `analyze.py` — 可复现脚本(只读打开 DB)
