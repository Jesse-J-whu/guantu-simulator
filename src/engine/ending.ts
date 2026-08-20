/**
 * @file 结局计算 — 基于属性、职级进度与廉洁度的分档结局。
 */

import type { Ending, GameState } from './types.ts';

/** 计算最终结局。 */
export function computeEnding(state: GameState): Ending {
  const { attrs, rank, dept, difficulty } = state;
  const totalScore = (attrs.politics + attrs.execute + attrs.network + attrs.integrity) / 4;
  const rankRatio = rank / Math.max(1, dept.ranks.length - 1);
  const finalRank = dept.ranks[Math.min(rank, dept.ranks.length - 1)];
  const diffFactor = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.3 : 1.0;
  const adjustedRisk = (100 - attrs.integrity) * diffFactor;

  const promotionCount = state.promotions.length;
  const promotionText =
    promotionCount >= 4
      ? `${promotionCount}次晋升，平步青云`
      : promotionCount >= 2
        ? `${promotionCount}次晋升，稳步向前`
        : promotionCount === 1
          ? '仅有1次晋升，蹉跎多年'
          : '原地踏步，未曾晋升';

  // 落马阈值 75:保证"受到处分(MID2)"档位在 normal/hard 也可达
  // (若取 65,normal 难度下廉洁度 <35 必然落马,MID2 永远不可触发)。
  if (adjustedRisk >= 75) {
    return {
      endingType: 'BAD',
      endingIcon: '⚖️',
      endingTitle: '落马——双规室里的人生终点',
      endingSummary: `你在仕途上走了${state.maxSteps}年，最终因廉洁度严重透支，被纪委立案调查。从光鲜的官员到囹圄之身，这条路走得快，也走得险。`,
      evalText: `你的官途，是一面镜子。\n\n廉洁度只剩 ${attrs.integrity} 分。你选择了那条看似捷径的路，在权力的诱惑面前一次次妥协，终于走到了无法回头的岔路口。\n\n${promotionText}，但级别越高，摔得越重。\n\n【官途评语】风险偏好者 · 短视逐利型`,
      finalRank,
    };
  }
  if (attrs.integrity >= 70 && totalScore >= 60 && rank >= 2) {
    return {
      endingType: 'GREAT',
      endingIcon: '🌟',
      endingTitle: `光荣退休 — ${finalRank}`,
      endingSummary: `你在体制内耕耘了${state.maxSteps}年，以${finalRank}的职级光荣退休。廉洁、能干、有人缘，你走出了一条让人尊敬的官途。`,
      evalText: `你的官途，是一首质朴的诗。\n\n政治嗅觉 ${attrs.politics} | 执行力 ${attrs.execute} | 人脉 ${attrs.network} | 廉洁度 ${attrs.integrity}\n\n${promotionText}。你始终知道，真正的权力不是用来占便宜的，而是用来做事情的。\n\n【官途评语】清廉务实型 · 稳步致远者`,
      finalRank,
    };
  }
  if (attrs.integrity >= 50 && totalScore >= 45) {
    return {
      endingType: 'GOOD',
      endingIcon: '📋',
      endingTitle: `平稳落幕 — ${finalRank}`,
      endingSummary: `你在体制内任职${state.maxSteps}年，以${finalRank}退休。没有特别耀眼，也没有重大失误，是官场中大多数人的真实写照。`,
      evalText: `你的官途，是一杯温热的白开水。\n\n平均属性 ${Math.round(totalScore)} 分。${promotionText}。你没有走极端，也没有特别突出。\n\n体制内，像你这样的人是主流——不贪不懒，安然退休。\n\n【官途评语】务实稳健型 · 中流砥柱者`,
      finalRank,
    };
  }
  if (attrs.integrity >= 35 || rankRatio >= 0.5) {
    return {
      endingType: 'MID',
      endingIcon: '🌿',
      endingTitle: '调任闲职，颐养天年',
      endingSummary: `你在仕途上勤恳工作了${state.maxSteps}年，但晋升之路并不顺畅，最终被调往一个清闲的岗位，远离权力中心，却也得享安宁。`,
      evalText: `你的官途，是一条幽静的林间小道。\n\n${promotionText}。你没能登上权力的顶峰，但也没有摔落深渊。\n\n在那个清闲的岗位上，你有时间思考那些在忙碌中来不及思考的问题：权力究竟意味着什么？\n\n【官途评语】淡泊名利型 · 随遇而安者`,
      finalRank,
    };
  }
  return {
    endingType: 'MID2',
    endingIcon: '⚡',
    endingTitle: '受到处分，仕途受阻',
    endingSummary: `你在某些关键节点做出了错误选择，受到了党纪处分，仕途由此蒙上阴影，再难升迁。但你保住了自由，也有机会重新反思。`,
    evalText: `你的官途，是一次跌倒后的漫长爬起。\n\n廉洁度 ${attrs.integrity}，你在某些诱惑面前没能完全守住。${promotionText}。\n\n好在，你没有走到最深处。\n\n【官途评语】犹豫摇摆型 · 代价教训者`,
    finalRank,
  };
}
