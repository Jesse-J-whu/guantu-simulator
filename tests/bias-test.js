/**
 * 官途模拟器 - 偏差测试套件
 *
 * 这个测试套件用于验证和修复游戏中的偏差问题，
 * 即用户不管怎么选择都容易落入不良结局的问题。
 */

// ===== 游戏状态常量 =====
const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard'
};

// ===== 从游戏逻辑中提取的关键函数 =====

/**
 * 计算游戏结局（从 index.html 的 computeEnding 函数）
 */
function computeEnding(attrs, rank, difficulty, maxSteps) {
  const integrityScore = attrs.integrity;
  const politicsScore = attrs.politics;
  const networkScore = attrs.network;
  const executeScore = attrs.execute;
  const totalScore = (politicsScore + executeScore + networkScore + integrityScore) / 4;

  const diffFactor = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.4 : 1.0;
  const risk = (100 - integrityScore) * diffFactor;

  let endingType;

  // 当前的判定逻辑（有偏差）
  if (risk >= 70) {
    endingType = 'BAD';
  } else if (integrityScore >= 75 && totalScore >= 65 && rank >= 3) {
    endingType = 'GREAT';
  } else if (integrityScore >= 60 && totalScore >= 55) {
    endingType = 'GOOD';
  } else if (rank <= 1) {
    endingType = 'MID';
  } else {
    endingType = 'MID2';
  }

  return {
    endingType,
    risk,
    integrityScore,
    totalScore,
    rank,
    diffFactor
  };
}

/**
 * 当前修复后的结局计算函数（与index.html保持一致）
 */
function computeEndingFixed(attrs, rank, difficulty, maxSteps) {
  const integrityScore = attrs.integrity;
  const politicsScore = attrs.politics;
  const networkScore = attrs.network;
  const executeScore = attrs.execute;
  const totalScore = (politicsScore + executeScore + networkScore + integrityScore) / 4;

  // 修复后的难度系数
  const diffFactor = difficulty === 'easy' ? 0.6 : difficulty === 'hard' ? 1.2 : 0.9;
  const risk = (100 - integrityScore) * diffFactor;

  // 计算综合表现评分：60%来自属性平均分，40%来自职级进度
  const performanceScore = totalScore * 0.6 + (rank / maxSteps) * 100 * 0.4;

  let endingType;

  // 修复后的判定逻辑 - 更平衡的结局分布
  if (risk >= 85) {
    // 只有在极高风险时才落马（需要廉洁度<30且困难模式）
    endingType = 'BAD';
  } else if (integrityScore >= 70 && performanceScore >= 60 && rank >= 2) {
    // 放宽GREAT结局条件：廉洁度70（原75），职级2（原3）
    endingType = 'GREAT';
  } else if (integrityScore >= 50 && performanceScore >= 45) {
    // 放宽GOOD结局条件：廉洁度50（原60），综合评分45（原55）
    endingType = 'GOOD';
  } else if (integrityScore >= 35) {
    // 保持一定廉洁度，至少是普通结局（调任闲职）
    endingType = 'MID';
  } else {
    // 只有廉洁度<35才会受到处分
    endingType = 'MID2';
  }

  return {
    endingType,
    risk,
    integrityScore,
    totalScore,
    rank,
    diffFactor,
    performanceScore
  };
}

// ===== 测试场景 =====

/**
 * 测试场景生成器
 */
function generateTestScenarios() {
  return [
    // 场景1: 高廉洁度，中等属性（应该有好结局）
    { name: '高廉洁-中属性', attrs: { politics: 60, execute: 65, network: 55, integrity: 80 }, rank: 3 },
    // 场景2: 中等廉洁度，中等属性（应该有中等以上结局）
    { name: '中廉洁-中属性', attrs: { politics: 55, execute: 60, network: 50, integrity: 55 }, rank: 2 },
    // 场景3: 低廉洁度，高其他属性（风险场景，但不应总是坏结局）
    { name: '低廉洁-高属性', attrs: { politics: 80, execute: 85, network: 75, integrity: 35 }, rank: 4 },
    // 场景4: 低廉洁度，低属性（应该有坏结局）
    { name: '低廉洁-低属性', attrs: { politics: 30, execute: 35, network: 25, integrity: 25 }, rank: 1 },
    // 场景5: 平衡型，所有属性中等（最常见的情况）
    { name: '平衡-中等', attrs: { politics: 50, execute: 50, network: 50, integrity: 50 }, rank: 2 },
    // 场景6: 高廉洁，低执行（廉洁但能力不足）
    { name: '高廉洁-低执行', attrs: { politics: 40, execute: 30, network: 45, integrity: 85 }, rank: 1 },
    // 场景7: 低廉洁，高人脉（关系导向型）
    { name: '低廉洁-高人脉', attrs: { politics: 70, execute: 60, network: 90, integrity: 30 }, rank: 3 },
    // 场景8: 新手玩家初始状态
    { name: '新手初始', attrs: { politics: 50, execute: 50, network: 50, integrity: 80 }, rank: 0 },
    // 场景9: 高级官员，高属性
    { name: '高级官员', attrs: { politics: 75, execute: 80, network: 70, integrity: 70 }, rank: 5 },
    // 场景10: 廉洁度刚好在临界点
    { name: '临界点30', attrs: { politics: 50, execute: 50, network: 50, integrity: 30 }, rank: 2 },
  ];
}

/**
 * 模拟多步游戏并计算属性变化
 */
function simulateGame(scenario, difficulty, maxSteps = 10) {
  const state = {
    attrs: { ...scenario.attrs },
    rank: scenario.rank,
    step: 0
  };

  // 模拟随机选择（假设每次选择对属性有小幅波动）
  for (let i = 0; i < maxSteps; i++) {
    // 随机波动（-5 到 +8）
    state.attrs.politics = Math.max(0, Math.min(100, state.attrs.politics + (Math.random() * 13 - 5)));
    state.attrs.execute = Math.max(0, Math.min(100, state.attrs.execute + (Math.random() * 13 - 5)));
    state.attrs.network = Math.max(0, Math.min(100, state.attrs.network + (Math.random() * 13 - 5)));
    // 廉洁度倾向于下降（模拟诱惑）
    state.attrs.integrity = Math.max(0, Math.min(100, state.attrs.integrity + (Math.random() * 10 - 7)));

    state.step++;
    // 随机晋升
    if (Math.random() < 0.15 && state.rank < 5) {
      state.rank++;
    }
  }

  return state;
}

// ===== 测试运行器 =====

/**
 * 运行偏差测试
 */
function runBiasTest() {
  console.log('========================================');
  console.log('  官途模拟器 - 偏差测试报告');
  console.log('========================================\n');

  const scenarios = generateTestScenarios();
  const difficulties = [DIFFICULTY_LEVELS.EASY, DIFFICULTY_LEVELS.NORMAL, DIFFICULTY_LEVELS.HARD];
  const maxSteps = 10;

  let totalTests = 0;
  let badEndingCountOriginal = 0;
  let badEndingCountFixed = 0;

  const endingDistributionOriginal = { BAD: 0, GREAT: 0, GOOD: 0, MID: 0, MID2: 0 };
  const endingDistributionFixed = { BAD: 0, GREAT: 0, GOOD: 0, MID: 0, MID2: 0 };

  // 测试每个场景
  for (const scenario of scenarios) {
    console.log(`\n--- 场景: ${scenario.name} ---`);
    console.log(`初始属性: 廉洁${scenario.attrs.integrity} | 政治${scenario.attrs.politics} | 执行${scenario.attrs.execute} | 人脉${scenario.attrs.network}`);
    console.log(`初始职级: ${scenario.rank}`);

    // 模拟游戏过程
    const finalState = simulateGame(scenario, DIFFICULTY_LEVELS.NORMAL, maxSteps);
    console.log(`最终属性: 廉洁${finalState.attrs.integrity.toFixed(0)} | 政治${finalState.attrs.politics.toFixed(0)} | 执行${finalState.attrs.execute.toFixed(0)} | 人脉${finalState.attrs.network.toFixed(0)}`);
    console.log(`最终职级: ${finalState.rank}`);

    // 测试不同难度
    for (const difficulty of difficulties) {
      totalTests++;

      // 原始逻辑
      const originalEnding = computeEnding(finalState.attrs, finalState.rank, difficulty, maxSteps);
      endingDistributionOriginal[originalEnding.endingType]++;
      if (originalEnding.endingType === 'BAD') badEndingCountOriginal++;

      // 修复后逻辑
      const fixedEnding = computeEndingFixed(finalState.attrs, finalState.rank, difficulty, maxSteps);
      endingDistributionFixed[fixedEnding.endingType]++;
      if (fixedEnding.endingType === 'BAD') badEndingCountFixed++;

      console.log(`  [${difficulty.padEnd(6)}] 原始: ${originalEnding.endingType} (risk: ${originalEnding.risk.toFixed(0)}) | 修复: ${fixedEnding.endingType} (risk: ${fixedEnding.risk.toFixed(0)})`);
    }
  }

  // 输出统计报告
  console.log('\n========================================');
  console.log('  统计报告');
  console.log('========================================\n');

  console.log(`总测试数: ${totalTests}`);
  console.log(`\n原始逻辑 - 坏结局数: ${badEndingCountOriginal} (${(badEndingCountOriginal/totalTests*100).toFixed(1)}%)`);
  console.log(`修复后逻辑 - 坏结局数: ${badEndingCountFixed} (${(badEndingCountFixed/totalTests*100).toFixed(1)}%)`);
  console.log(`\n坏结局减少: ${((badEndingCountOriginal - badEndingCountFixed)/totalTests*100).toFixed(1)}%`);

  console.log('\n原始逻辑结局分布:');
  for (const type of ['BAD', 'MID2', 'MID', 'GOOD', 'GREAT']) {
    console.log(`  ${type.padEnd(6)}: ${endingDistributionOriginal[type]} (${(endingDistributionOriginal[type]/totalTests*100).toFixed(1)}%)`);
  }

  console.log('\n修复后逻辑结局分布:');
  for (const type of ['BAD', 'MID2', 'MID', 'GOOD', 'GREAT']) {
    console.log(`  ${type.padEnd(6)}: ${endingDistributionFixed[type]} (${(endingDistributionFixed[type]/totalTests*100).toFixed(1)}%)`);
  }

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================');

  return {
    totalTests,
    badEndingCountOriginal,
    badEndingCountFixed,
    endingDistributionOriginal,
    endingDistributionFixed
  };
}

// ===== 运行测试 =====
if (require.main === module) {
  runBiasTest();
}

module.exports = {
  computeEnding,
  computeEndingFixed,
  generateTestScenarios,
  simulateGame,
  runBiasTest
};
