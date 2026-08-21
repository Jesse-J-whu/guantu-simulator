# 审计摘要:xuanchuanB/normal(宣传部 · normal,combo_id=19)—— PASS

- 全量 SQL(players WHERE combo_id=19):players=500,completed=500,meets_requirements=500,bg_ok=500;
  continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/
  rank_residual/illegal_rank_change/llm_errors/track_failures 全部 SUM=0,逐玩家违规行数 0。
- 独立重算(npx tsx,按 playerIdx 字段取样 30 人:0-7/120-127/360-367/490-495):checked 30,violations 0。
  另全量扫描 JSONL:500 行、playerIdx 0..499 唯一、policy==[good,bad,random,mixed][idx%4] 0 错、
  steps=24 全部、48000 张选项卡 effect 全非零。
- 分布:bad 125 全 BAD(均晋升 1.21);good 125 全 GREAT(均 4);mixed 124 GREAT+1 GOOD(均 3.86);
  random GREAT87/GOOD26/MID11/BAD1(均 3.10)。finalRank 仅出现于阶梯科员→正处级(departments.ts)。
  同部门难度梯度 easy 3.50 > normal 3.02 > hard 2.25,符合 promotion.ts 成本系数 0.8/1.0/1.3。
- 逐字深读 16 人({0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499},每人 24 步全文通读):
  衔接 24/24、局内标题/正文/选项三层去重通过、属性 clamp 数学通过、职级仅在 promoted 步 +1、
  finalRank 与阶梯一致;16/16 结局按 ending.ts 阈值(BAD:(100-廉)×1.0≥75;GREAT:廉≥70 且均分≥60
  且 rank≥2)手工验算全部 MATCH(含边界:idx499 廉74 仍≥70 判 GREAT;idx102 廉59 落 GOOD 档)。
- 违规数:0。三项非违规设计性观察:
  1) continuity 全为模板句「承接「上一步标题」的余波」,desc 剧情级承接偏弱(最弱例:idx0 step5
     信访围堵 vs 上一步方案之争,无实质延续)。已核实为提示词/mock 设计(src/engine/llm.ts:308),
     衔接语引用的上一步标题均真实存在,不算数据违例;若产品要强连续性需改提示词。
  2) 选项文案偶与场景脱节(如 idx0 step23 果篮场景配「走访关联方逐一核实」),hint 恒为四原型;
     局内选项文案仍互不重复,属 mock 罐头单元设计。
  3) good 策略 125 人晋升数完全一致(恒 4,步 3/6/12/18),系 mock 效果同质+确定性策略所致;
     bad 玩家廉洁<35 后晋升被 INTEGRITY_GATE=35 暂缓(idx101/253/449 均如此),与引擎一致。
- 引擎事实核对:阶梯 5 级(科员/副科级/正科级/副处级/正处级,起步科员);晋升成本 12/18/26/36,
  每 3 步年度考核;廉洁门 35。轨迹全部吻合。
- 结论:verdict=PASS。500 玩家全部完成、六大诉求 0 违例、无审计器误报需要澄清。
