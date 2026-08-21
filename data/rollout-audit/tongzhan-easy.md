# 轨迹审计摘要:tongzhan/easy(统战部 · easy,combo_id=21)

**verdict: PASS** —— 500 玩家全部完成、合规,0 真实违例。

## A. 全量机械核验(SQL,data/rollout.db)
- players=500,completed=500,meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors
  —— 十项 SUM 全部 = 0
- 附加:policy 与 playerIdx%4 映射 0 错配;steps_done 全 24;500 个独立 ip 与 seed;bg_ok=500
- 分布(诉求5/6):good 125 全 GREAT(均晋升3);bad 125 全 BAD(均晋升2);
  random GREAT86/GOOD22/MID17;mixed GREAT124/GOOD1。
  bad 全 BAD 是策略必然:坏选择把廉洁打到 0,风险=(100-0)×0.8=80≥75 必落马;
  且廉洁<35 触发 INTEGRITY_GATE 暂缓提拔,晋升止步 2 次 —— 与 promotion.ts/ending.ts 一致,非异常。

## B. 独立重算(npx tsx,从原始 JSONL,不信 DB)
- 30 人抽样(idx 0-7/120-127/360-367/490-495,按行内 playerIdx 字段过滤):**0 违例**
- 检查:标题 bigram≥0.55、正文/选项相似度≥0.8、选项至少 1 项非零效果、
  effectsApplied==所选 effect、clamp(prev+effect)==attrsAfter、
  rank 仅 promoted 时 +1、finalRank 对 departments.ts 阶梯、结局按 ending.ts 重算
- 另对 16 名深读玩家复跑同脚本:**0 违例**(共 46 人次)
- 澄清:首轮 30 条 FINALRANK 报警系审计员比较器把字符串职级名与数字 rank 直接相比,
  修正为 finalRank==ladder[rank] 后全部通过 —— 数据无问题。

## C. 逐字深读(16 人 × 24 步)
idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499},四种策略 × 首/中/尾。
每人逐项核验:衔接 24/24 非空且引用的上一步标题 100% 真实存在;标题/正文/选项一局内
零雷同;属性数学全对;职级只在 promoted 步 +1,finalRank 与统战部阶梯
(科员→副科级→正科级→副处级,顶格 rank3)一致;结局阈值亲手验算 16/16 全对
(含边界样本:102 廉54→GOOD、250 廉39→MID、498 廉62→GOOD)。
最弱衔接例:玩家0 step5「信访群众围堵办公楼」承接上步「两位领导方案之争」,
仅靠公式句,正文无剧情牵连。

## 非违规观察(mock 口径内,建议产品知悉)
1. 全 500 玩家共用**完全相同的 24 场景固定顺序**(全文件仅 24 个去重标题/正文,字节级一致,
   未洗牌)——一局内不重复达标,但跨玩家叙事零差异。
2. 衔接语是固定公式「承接「上一标题」的余波,事情还没完。」,正文为年度换景式松散衔接。
3. 选项文案取自 稳妥/程序/关系/省事 四原型池,少数与场景语义不合
   (如送礼场景提供「先试点再推开」)。
4. BAD 结局评语「2次晋升,稳步向前,但级别越高,摔得越重」语气略违和(ending.ts 文案)。
5. 后期属性顶格 100 后加值不变、廉洁归 0 后减值不变,均系 0..100 夹取正常行为。

## 结论
六大诉求(衔接/不重复/属性生效/职级事实/晋升体验/结局评级)在该组合 0 真实违例。
文件:data/rollout-audit/tongzhan-easy.json(机器可读详情)。
