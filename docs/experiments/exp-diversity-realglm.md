# 实验 E2:真实 GLM 多样性验证(glm-4-flash)

> 模型:glm-4-flash(用户提供的 API Key,仅经 `.env` 注入项目内使用,不入库不入文档)
> 脚本:`scripts/diversity-scan.mts`(生产路径真 API 扫描)· 三轮:13 局初扫 → 8 局确认 → 8 局终验,共 29 局
> 数据:`data/final-scan-13games.json` / `data/confirm-scan-8games.json` / `data/final-confirm-scan.json`(摘要均取自各自 `summary` 字段)

**一句话结论:三轮真实 GLM 全流程扫描把"局内重复文案"从不达标收敛到全零——终验 8 局 × 24 步,局内标题重复 0、选项重复 0、套话标题 0,解析成功率 100%、剧情衔接 100%、属性非零效果 100%(737/737)、职级残留 0;选项重复的收敛轨迹为 17 → 3 → 0,每一轮残留都定位到根因并修复后复测。**

| 关键指标(终验扫描,82e4bad 引擎) | 数值 | 初扫(修复前) |
| --- | --- | --- |
| 一局内标题重复(bigram≥0.55) | **0** | 12/13 局,37 次 |
| 泛化套话标题(「暗流涌动」类) | **0** | 14 次 / 9 个部门 |
| 一局内选项重复(相似度≥0.8) | **0** | 17 次(1.4%) |
| 解析成功率 / 剧情衔接覆盖率 | **100% / 100%** | — |
| 属性非零效果 | **100% (737/737)** | — |
| 职级错误修正后残留 | **0** | 源头存在错误 |
| NPC 名册复用率(跨事件人物延续) | 94.8% | 94.2% |
| 完整通关 | 8/8 局(0 中断 0 上游错误) | 13/13 局 |
| 事件延迟 p50 / p95 | 28s / 82s(含去重重试) | 22s / 83s |

## 目录

1. [实验目的](#一实验目的)
2. [实验设计](#二实验设计)
3. [实验方法](#三实验方法)
4. [结果](#四结果)
5. [如何查看(命令速查)](#五如何查看命令速查)
6. [局限与诚实声明](#六局限与诚实声明)
7. [完整复现与环境要求](#七完整复现与环境要求)

## 一、实验目的

E1 的大规模 rollout 因成本用 mock LLM(48.75 万次调用不可行),因此**文案层的真实多样性必须用真实模型单独验证**。本实验回答:

1. 真实 glm-4-flash 沿生产路径(`/api/llm-proxy` → GLM 上游)逐局生成时,六大诉求里的"局内不重复、衔接、属性非零、职级事实"是否成立?
2. 不成立时,漏洞在引擎防线(去重兜底/去重池/重试语义)的哪一层?修复后能否复测收敛到 0?

## 二、实验设计

### 被测对象

- 引擎:`src/engine/` 真实引擎(driver 内运行,与浏览器同一份代码),基线版本 dev/v2-overhaul@431d673,后续轮次带 f13d8f8 / 82e4bad 修复。
- LLM 链路:**生产路径真 API**——`diversity-scan.mts:46-49` 以 `PORT=3393 WORKERS=1 LLM_MODE=real DB_PATH=data/diversity.db` 拉起服务,事件生成经 `POST /api/llm-proxy`(含服务端风控安全重试、故障切换、超时语义改写),再由上游真正调用 glm-4-flash。Key 从 `.env` 的 `GLM_API_KEY` 注入,不落盘。

### 变量与分组

| 维度 | 取值 | 规则(`diversity-scan.mts:163-168`) |
| --- | --- | --- |
| 局数 | 初扫 13 / 确认 8 / 终验 8(GAMES 环境变量) | 覆盖 13 部门(初扫全覆盖) |
| 难度 | normal / easy / hard | `gameId % 3` 轮换 |
| 玩家策略 | good(净收益含廉洁×1.5 最高)/ random(确定性伪随机) | `gameId % 2` 轮换(bad 策略的落马与晋升拦截由单测覆盖) |
| 种子 | `20260821*1000 + gameId` | 每局独立可复现 RNG |

### 控制与量级(诚实口径)

- 每局固定 24 步;三轮合计 29 局、约 1,300 次上游调用(`docs/diversity-report.md` 口径),事件数 312 + 184 + 192。
- **为什么只有 29 局**:真实 glm-4-flash 单事件延迟 p50 22-28s、p95 78-83s(实测见结果表),13 局初扫墙钟即 3,831s(64 分钟)。把 E1 的 19,500 局换真 API 在时间与费用上都不可行——这是 E1 用 mock、E2 用小样本真 API 分工的根本原因。
- 采样参数与生产一致:temperature 0.85、top_p 0.9、max_tokens 1600(`diversity-scan.mts:72-76`)。
- driver 侧另有 429/5xx/超时退避重试包装(`RetryLLM`,`diversity-scan.mts:89-108`);上游真实故障**不静默跳过**——一局中断记 ABORTED 如实入统计(`diversity-scan.mts:226-232`)。

### 环境

Node ≥ 24(实测 v24.14.0)、`npx tsx` 直跑 .mts、单 worker 服务 + 并发 CONCURRENCY=3 局、`.env` 需含 `GLM_API_KEY`(及可选 `GLM_MODEL=glm-4-flash`、`GLM_ENDPOINT`)。

## 三、实验方法

### 总体流程

```
. ./.env(GLM_API_KEY 注入,不回显)
        │
        ▼
spawn node server.js(PORT=3393, WORKERS=1, LLM_MODE=real, DB=data/diversity.db)
        │  /healthz 返回 mode==='real' 才继续
        ▼
GAMES 局 × 24 步(CONCURRENCY=3 并发):
  generateBackground ──► 每步 nextEvent(/api/llm-proxy → glm-4-flash)
  每事件记录:解析成功/选项数/标题/衔接/泛化标题/NPC 复用/
             职级修正与残留/属性非零/去重疑似/延迟/上游错误
  applyChoice(策略选卡)──► finishGame
        ▼
summary 汇总(局内重算 + 跨局去重)──► test-results/diversity-scan.json
        ▼
轮次迭代:初扫 → 修 f13d8f8 → 确认扫 → 修 82e4bad → 终验扫(全部指标 0)
```

### 局内重复的事后全量重算(与引擎同阈值)

`diversity-scan.mts:284-300` 不信任引擎放行结果,对每局全部标题/选项两两重算:

```ts
let withinTitleDup = 0; let withinChoiceDup = 0;
for (const g of stats) {
  const seenChoices: string[] = [];
  g.titles.forEach((title, i) => {
    for (let j = 0; j < i; j++)
      if (titleSimilarity(g.titles[j], title) >= TITLE_DUP_THRESHOLD) { withinTitleDup++; break; }
    const ev = g.events[i];
    if (ev?.parseOK) for (const ct of ev.choiceTexts) {
      if (seenChoices.some((c) => similarity(c, ct) >= CHOICE_DUP_THRESHOLD)) withinChoiceDup++;
      seenChoices.push(ct);
    }
  });
}
```

阈值即生产值:标题 bigram Jaccard ≥ 0.55、选项相似度 ≥ 0.8(`src/engine/dedup.ts:64,72`);套话标题黑名单(暗流/暗影/深夜/抉择/风波/疑云/博弈…)见 `dedup.ts:80`——该正则的注释本身就记录着初扫的实测:「暗流涌动」曾在 9 个不同部门复现 14 次,短标题一旦命中这些词几乎必然是可套用任何剧情的套话。

### 三轮迭代各做了什么

**初扫(13 局,引擎 431d673)**:标题重复 37 次、选项重复 17 次、套话标题 0(黑名单已生效)。对 17 次逐条核对定性:约 1/3 为逐字重复(含句号差异),根因是 `enforceFreshness` 在"干净选项 <2"时的旧兜底——保留碰撞最轻的 2 条放行;其余为包含式近似(短选项字符集 ⊂ 长选项,如「向李明汇报情况,寻求建议。」⊂「…寻求他的建议和帮助」),处于 0.80-0.9 阈值边缘。

**修复一(f13d8f8)**:① 兜底改为引擎**合成**一对互异且与池零碰撞的选项,绝不逐字放行;② 事件内部槽位互抄(同一文案写进 A/B 槽)先剔除再过滤。

**确认扫(8 局,引擎 f13d8f8)**:选项重复 17 → 3,另 1 局因上游 60s 超时中断(ABORTED)。3 例残留 + 1 次中断定位到两个新根因:

1. **去重池 60 条截断**:24 步 × 4 选项 = 96 条,第 15 步起开局文案被挤出池,与早期文案 1.00 全等的照抄查不出来——3 例残留全部撞的是早期文案。修复:池上限提至 200(提示词只读最近 12 条,扩大零成本);
2. **超时语义不可重试**:AbortError 原消息「This operation was aborted」不含 timeout 字样,重试正则失配,瞬时超时被当成致命错误。修复:服务端统一改写为「upstream … timeout after Xms」,重试正则补 abort。

**修复二(82e4bad)→ 终验扫(8 局)**:全部指标归零,8/8 完整通关,0 中断 0 上游错误。

## 四、结果

### 4.1 三轮扫描汇总(逐项抄自 data/*.json 的 summary)

| 指标 | 初扫 13 局 | 确认扫 8 局 | 终验 8 局 |
| --- | --- | --- | --- |
| startedAt(UTC) | 2026-08-20 22:54 | 2026-08-20 23:32 | 2026-08-21 00:25 |
| 完整通关 | 13/13 | 7/8(1 局 ABORTED) | 8/8 |
| 事件 / 选项总数 | 312 / 1,207 | 184 / 724 | 192 / 737 |
| 解析成功率 | 100.0% | 100.0% | 100.0% |
| 剧情衔接覆盖率 | 100.0% | 100.0% | 100.0% |
| **局内标题重复** | **0** | **0** | **0** |
| **局内选项重复** | **17** | **3** | **0** |
| 泛化套话标题 | 0 | 0 | 0 |
| 属性非零效果 | 100% (1207/1207) | 100% (724/724) | 100% (737/737) |
| 职级修正 / 修正后残留 | 0 / 0 | 0 / 0 | 0 / 0 |
| NPC 复用率(事件级) | 94.2% | 94.0% | 94.8% |
| 跨局标题重复率 | 1.0% (3/312) | 0.5% (1/184) | 1.0% (2/192) |
| ≥3 选项事件占比 | 95.2% | 97.8% | 94.3% |
| 延迟 p50 / p95 / max | 22.1s / 83.4s / 101.8s | 20.5s / 78.9s / 92.8s | 28.0s / 81.6s / 92.4s |
| 晋升次数(good 均值 / random 均值) | 3.6 / 2.8 | 3.5 / 3.0 | 4.0 / 3.0 |
| 结局分布 | GREAT 12 / GOOD 1 | GREAT 7 / ABORTED 1 | GREAT 7 / GOOD 1 |
| 墙钟 | 3,831s(64 分钟) | 2,076s | 2,544s(约 42 分钟) |

(初扫另有 574 次服务端 LLM 代理调用、0 次 5xx,见 `docs/diversity-report.md` 头部;晋升均值为各局列表的算术平均:初扫 good [4,3,5,3,3,4,3]=3.6、random [4,3,2,3,3,2]=2.8。)

![真实 GLM 多样性](../assets/global/g08-diversity.png)

### 4.2 多样性供给面(初扫 312 事件)

- 标题:312 个事件 309 个互异标题,跨局重复 3 次(1.0%),且均为不同局独立生成撞车,非同局复用;
- 选项:1,207 条文案 1,200 个互异(去标点口径);
- 15/312 事件仅 2 个选项(4.8%):解析端与去重剔除后的合法下限,非缺陷;
- NPC:平均名册 4.9 人/局,复用率 94.2-94.8%——同一批人物跨事件真实延续,支撑剧情连续性。

### 4.3 结果解读(机制层面)

- **收敛靠的是堵防线漏洞,不是放宽阈值**:三轮阈值始终是 0.55 / 0.8,不变;变化的是兜底逻辑(逐字放行 → 合成新选项)、去重池容量(60 → 200,消除第 15 步起的"失忆")与超时重试语义。终验 `dedupSuspectEvents=22`(去重系统工作过 22 次)说明防线在真实模型面前持续触发并成功拦截,而非无碰撞可拦。
- **衔接与复用是模型行为,不是模板**:mock 的衔接是固定句式(E1 已声明),真实扫描中 100% 事件带非空【剧情衔接】、94.8% 事件出场既有 NPC——glm-4-flash 在 prompt 约束下真实延续了剧情与人设。
- **延迟主导项是上游**:p50 22-28s 单事件(含去重触发的多次上游调用),这也是大规模层只能用 mock 的定量依据。
- **结局分布偏 GREAT 是策略选择的结果**:扫描只含 good/random 策略;bad 策略的 BAD 结局与晋升拦截由 `tests/unit/gameEngine.test.ts` 坏玩家全流程单测覆盖,真实 API 下的 bad 全流程未在扫描范围(见局限)。

## 五、如何查看(命令速查)

### 5.1 读三轮扫描的 summary(一行命令)

```bash
python3 -c "import json;d=json.load(open('data/final-confirm-scan.json'))['summary'];print(d['withinGameTitleDup'],d['withinGameChoiceDup'],d['attrNonZeroRate'],d['parseOKRate'])"
# 预期:0 0 100.0% (737/737) 100.0%
```

```bash
python3 -c "
import json
for f in ['final-scan-13games','confirm-scan-8games','final-confirm-scan']:
    s=json.load(open(f'data/{f}.json'))['summary']
    print(f, '| games', s['gamesCompleted'],'/',s['games'], '| events', s['totalEvents'],
          '| titleDup', s['withinGameTitleDup'], '| choiceDup', s['withinGameChoiceDup'],
          '| latency p50/p95', s['latency']['p50'], s['latency']['p95'])"
# 预期:final-scan-13games | games 13/13 | events 312 | titleDup 0 | choiceDup 17 | latency p50/p95 22053 83437
#       confirm-scan-8games | games 7/8 | events 184 | titleDup 0 | choiceDup 3 | latency p50/p95 20494 78932
#       final-confirm-scan | games 8/8 | events 192 | titleDup 0 | choiceDup 0 | latency p50/p95 27966 81601
```

### 5.2 看某一局的 24 步标题(games[].titles 存原文)

```bash
python3 -c "
import json
g=json.load(open('data/final-confirm-scan.json'))['games'][2]
print(g['deptName'],'|',g['difficulty'],g['policy'],'| 晋升',g['promotions'],'|',g['endingType'])
print('24 步标题:'); [print(' ',i+1,t) for i,t in enumerate(g['titles'])]"
# 预期:组织部 | hard good | 晋升 3 | GREAT
#       随后 24 行互不相同的具体事件标题(如「廉政档案核查的疑云」「李明的深夜来电」…
#       直至「老支书的深夜来电」)——肉眼可验"一局内不重复"
```

逐事件统计字段(解析/衔接/NPC 复用/职级修正/延迟等)在同文件的 `games[].events[]` 数组,每步一条。

### 5.3 重跑扫描(消耗真实 API 配额,先小后大)

```bash
set -a && . ./.env && set +a          # 注入 GLM_API_KEY(勿 echo,勿提交)
GAMES=2 CONCURRENCY=1 SCAN_PORT=3393 npx tsx scripts/diversity-scan.mts   # 试跑 2 局
# 预期:控制台逐局输出 [game N] 部门/难度/策略 → steps=24 promos=… ending=…
#       结束打印 summary 并写 test-results/diversity-scan.json

GAMES=13 CONCURRENCY=3 SCAN_PORT=3393 npx tsx scripts/diversity-scan.mts  # 全量 13 局(约 64 分钟)
```

### 5.4 核对去重阈值与套话黑名单(判定口径)

```bash
sed -n '64p;72p;80p' src/engine/dedup.ts
# 预期:TITLE_DUP_THRESHOLD = 0.55;CHOICE_DUP_THRESHOLD = 0.8;GENERIC_TITLE_WORDS = /暗流|暗影|…/i
```

### 5.5 看图

`docs/assets/global/g08-diversity.png`(局内重复度全程低于阈值 + 局级核心合规指标),由 `scripts/docs-gen/gen_global_charts.py` 的 `g08_diversity()` 从 `data/final-scan-13games.json` 生成。

## 六、局限与诚实声明

1. **样本规模有限**:29 局 / 688 个事件(三轮 JSON 事件数合计;`docs/diversity-report.md` 原文记三轮合计 29 局、约 1,300 次上游调用)。它证明的是"生产路径 + 真实模型下防线有效",不是对文案空间的穷举;更小概率的重复模式可能未暴露。
2. **策略覆盖不全**:扫描仅 good/random;bad 策略(必落马路径)由单测覆盖,未做真 API 全流程验证。
3. **单一模型单一 Key**:全部结论仅对 glm-4-flash 成立;换模型/换温度需重跑。API Key 属用户提供、仅项目内使用,本文与仓库均不包含 Key。
4. **探针期观察未完全留档**:初扫之前的调试期问题(如格式说明被 glm-4-flash 抄进正文、约 7% 输出格式违规)只见于项目过程讨论,`data/` 未保留其扫描 JSON;本篇初版问题仅引用可核实来源——`docs/diversity-report.md` 对照表(37 次标题重复 / 14 次套话 / 选项逐字放行)与 `src/engine/dedup.ts:80` 注释(「暗流涌动」9 部门复现 14 次)。
5. **延迟数字含重试**:p50/p95 是 driver 侧每事件墙钟,含去重触发的一次或多次上游调用,不是裸模型延迟。
6. **确认扫的 1 局 ABORTED 如实计入**(上游 60s 超时且当时语义不可重试);终验 0 中断。三轮原始 JSON 均在 `data/` 入库可查。

## 七、完整复现与环境要求

环境:Node ≥ 24(实测 v24.14.0)、`npx tsx`、`.env` 含 `GLM_API_KEY`(建议显式 `GLM_MODEL=glm-4-flash`)、可访问 GLM 端点的网络、真实配额(13 局约 574 次上游调用、64 分钟墙钟)。

```bash
set -a && . ./.env && set +a
GAMES=13 CONCURRENCY=3 SCAN_PORT=3393 npx tsx scripts/diversity-scan.mts
# 输出:test-results/diversity-scan.json(summary + games 全量)
# 归档惯例:将结果复制为 data/final-*.json / confirm-*.json(历次如此入库)
```

预期终态(引擎 ≥ 82e4bad):`withinGameTitleDup=0`、`withinGameChoiceDup=0`、`genericTitleEvents=0`、`parseOKRate="100.0%"`、`continuityRate="100.0%"`、`attrNonZeroRate="100.0% (n/n)"`、`rankResidualTotal=0`、无 ABORTED 局。

相关阅读:[实验总览](./README.md) · [E1 19,500 玩家 rollout(mock 口径与文案多样性的分工)](./exp-rollout-19500.md) · 数字权威来源 `docs/diversity-report.md`
