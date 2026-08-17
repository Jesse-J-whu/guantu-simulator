/**
 * 官途模拟器 - 真实玩家模拟测试
 *
 * 使用 DeepSeek API 模拟不同类型的真实玩家，分析他们如何做出选择
 * 以及这些选择是否导致系统性偏差
 */

const https = require('https');
const http = require('http');

// 从环境变量读取 API Key
require('dotenv').config();
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_ENDPOINT = 'https://api.deepseek.com/chat/completions';

// 玩家原型定义
const PLAYER_ARCHETYPES = [
  {
    name: '谨慎型',
    description: '做事谨慎，重视廉洁，但可能缺乏进取心',
    traits: '倾向于保守选择，避免风险，优先考虑廉洁和稳定',
  },
  {
    name: '进取型',
    description: '野心勃勃，渴望晋升，愿意冒险',
    traits: '倾向于高风险高回报的选择，重视晋升机会',
  },
  {
    name: '实用型',
    description: '现实主义者，权衡利弊',
    traits: '根据具体情况做出最有利的选择，不过分理想化',
  },
  {
    name: '理想型',
    description: '坚持原则，重视正义',
    traits: '坚持做正确的事，即使对个人不利',
  },
  {
    name: '随机型',
    description: '决策不固定，容易被选项描述影响',
    traits: '容易被选项的表述方式影响，没有固定倾向',
  }
];

/**
 * 调用 DeepSeek API
 */
async function callDeepSeek(prompt, options = {}) {
  const { max_tokens = 1000, temperature = 0.7, top_p = 0.9 } = options;

  const requestBody = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens,
    top_p
  });

  return new Promise((resolve, reject) => {
    const url = new URL(API_ENDPOINT);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const content = response.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (error) {
          reject(new Error(`API解析错误: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * 模拟玩家选择
 *
 * @param {Object} event - 事件对象
 * @param {Object} playerType - 玩家类型
 * @returns {number} 选择的索引 (0-3)
 */
async function simulatePlayerChoice(event, playerType) {
  const prompt = `你是一个${playerType.name}的官员，你的特点是：${playerType.description}，你的决策风格是：${playerType.traits}

现在你面临以下官场事件：

【事件】${event.title}
【描述】${event.desc}
【提示】${event.hint || '无'}

请从以下四个选项中选择一个，只回答选项字母（A/B/C/D），不要解释：

${event.choices.map((c, i) => {
  const letter = String.fromCharCode(65 + i);
  return `${letter}. ${c.text}\n   提示：${c.hint}`;
}).join('\n')}

记住：作为${playerType.name}官员，根据${playerType.traits}的原则做出选择。只回答选项字母。`;

  try {
    const response = await callDeepSeek(prompt, {
      max_tokens: 10,
      temperature: 0.5 // 降低温度以获得更一致的选择
    });

    const choice = response.trim().toUpperCase();
    // 验证返回的选项
    if (choice === 'A' || choice === 'B' || choice === 'C' || choice === 'D') {
      return choice.charCodeAt(0) - 65; // 转换为 0-3
    }
    // 如果返回不正确，随机选择
    return Math.floor(Math.random() * 4);
  } catch (error) {
    console.error('API调用失败:', error.message);
    return Math.floor(Math.random() * 4);
  }
}

/**
 * 模拟完整游戏
 */
async function simulateGame(playerType, maxSteps = 10) {
  // 初始状态
  let state = {
    attrs: { politics: 50, execute: 50, network: 50, integrity: 80 },
    rank: 0,
    step: 0,
    history: []
  };

  // 模拟事件（这里使用简化的模拟事件）
  const events = generateMockEvents(maxSteps);

  for (const event of events) {
    if (state.step >= maxSteps) break;

    // 模拟玩家选择
    const choiceIndex = await simulatePlayerChoice(event, playerType);
    const choice = event.choices[choiceIndex];

    // 记录历史
    state.history.push({
      step: state.step,
      event: event.title,
      choice: choice.text,
      effects: choice.effect
    });

    // 应用效果
    if (choice.effect.politics) {
      state.attrs.politics = Math.max(0, Math.min(100, state.attrs.politics + choice.effect.politics));
    }
    if (choice.effect.execute) {
      state.attrs.execute = Math.max(0, Math.min(100, state.attrs.execute + choice.effect.execute));
    }
    if (choice.effect.network) {
      state.attrs.network = Math.max(0, Math.min(100, state.attrs.network + choice.effect.network));
    }
    if (choice.effect.integrity) {
      state.attrs.integrity = Math.max(0, Math.min(100, state.attrs.integrity + choice.effect.integrity));
    }
    if (choice.effect.rank) {
      state.rank = Math.min(state.rank + choice.effect.rank, 5);
    }

    state.step++;

    // 添加小延迟避免API限流
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 计算结局
  const ending = computeEnding(state.attrs, state.rank, 'normal', maxSteps);

  return {
    playerType: playerType.name,
    finalState: state,
    ending: ending.endingType
  };
}

/**
 * 生成模拟事件
 */
function generateMockEvents(count) {
  const events = [
    {
      title: '红包礼节',
      desc: '春节前，一位企业老板送来一个"红包"，说是过节费',
      hint: '这种事在官场很常见，但风险也不小',
      choices: [
        { text: '礼貌拒绝', hint: '保持廉洁', effect: { politics: -2, execute: 0, network: -2, integrity: +5, rank: 0 } },
        { text: '收下红包', hint: '可能开启后续利益往来', effect: { politics: +2, execute: 0, network: +3, integrity: -8, rank: 0 } },
        { text: '收下但上交组织', hint: '既不伤和气又保持廉洁', effect: { politics: +3, execute: 0, network: +1, integrity: +3, rank: 0 } },
        { text: '收下并退回等价礼品', hint: '巧妙处理', effect: { politics: +1, execute: +2, network: +2, integrity: +1, rank: 0 } }
      ]
    },
    {
      title: '晋升机会',
      desc: '上级暗示，如果支持某个项目，可能获得晋升机会',
      hint: '机会难得，但项目可能有问题',
      choices: [
        { text: '全力支持', hint: '抓住晋升机会', effect: { politics: +5, execute: +3, network: +5, integrity: -5, rank: 1 } },
        { text: '谨慎支持', hint: '既表态又不完全承诺', effect: { politics: +2, execute: +2, network: +2, integrity: -1, rank: 0 } },
        { text: '婉言拒绝', hint: '保持原则', effect: { politics: -3, execute: 0, network: -3, integrity: +5, rank: 0 } },
        { text: '详细调查后再决定', hint: '理性分析', effect: { politics: +1, execute: +3, network: +1, integrity: +2, rank: 0 } }
      ]
    },
    {
      title: '人情请托',
      desc: '老同学请你在某件事上帮忙，说小事一桩',
      hint: '拒绝可能伤感情，答应可能有风险',
      choices: [
        { text: '爽快答应', hint: '重视人情', effect: { politics: +1, execute: +1, network: +3, integrity: -3, rank: 0 } },
        { text: '婉言谢绝', hint: '遵守原则', effect: { politics: -1, execute: 0, network: -2, integrity: +3, rank: 0 } },
        { text: '了解情况后再决定', hint: '谨慎处理', effect: { politics: +1, execute: +2, network: +1, integrity: +1, rank: 0 } },
        { text: '介绍他去正规渠道', hint: '既帮忙又避嫌', effect: { politics: +2, execute: +2, network: +2, integrity: +2, rank: 0 } }
      ]
    },
    {
      title: '利益诱惑',
      desc: '有人提供合作机会，说可以一起赚点外快',
      hint: '明显违规，但诱惑很大',
      choices: [
        { text: '坚决拒绝', hint: '守住底线', effect: { politics: -2, execute: 0, network: -2, integrity: +8, rank: 0 } },
        { text: '表示考虑', hint: '不直接拒绝', effect: { politics: +2, execute: +1, network: +3, integrity: -5, rank: 0 } },
        { text: '断然拒绝并举报', hint: '积极作为', effect: { politics: +3, execute: +2, network: -3, integrity: +10, rank: 0 } },
        { text: '委婉拒绝但保持关系', hint: '圆滑处理', effect: { politics: +2, execute: +2, network: +2, integrity: +2, rank: 0 } }
      ]
    },
    {
      title: '站队选择',
      desc: '单位内部有两派，需要明确表态支持哪一边',
      hint: '站队很重要，选错很麻烦',
      choices: [
        { text: '支持强势一方', hint: '务实选择', effect: { politics: +4, execute: +2, network: +4, integrity: -2, rank: 0 } },
        { text: '支持弱势一方', hint: '可能押错宝', effect: { politics: -2, execute: +1, network: +2, integrity: +2, rank: 0 } },
        { text: '保持中立', hint: '不站队', effect: { politics: -1, execute: 0, network: +1, integrity: +3, rank: 0 } },
        { text: '根据原则表态', hint: '坚持原则', effect: { politics: +1, execute: +2, network: +1, integrity: +5, rank: 0 } }
      ]
    },
    {
      title: '违规操作',
      desc: '领导让你做一件事，你觉得可能有违规嫌疑',
      hint: '执行可能有风险，拒绝可能得罪领导',
      choices: [
        { text: '坚决执行', hint: '服从领导', effect: { politics: +3, execute: +3, network: +3, integrity: -6, rank: 0 } },
        { text: '提醒风险', hint: '既执行又提醒', effect: { politics: +2, execute: +2, network: +2, integrity: +1, rank: 0 } },
        { text: '拒绝执行', hint: '坚持原则', effect: { politics: -3, execute: -1, network: -3, integrity: +6, rank: 0 } },
        { text: '建议变通方式', hint: '智慧处理', effect: { politics: +3, execute: +4, network: +2, integrity: +2, rank: 0 } }
      ]
    },
    {
      title: '举报信息',
      desc: '有人举报某位领导，你掌握一些相关信息',
      hint: '说可能得罪人，不说可能被牵连',
      choices: [
        { text: '如实提供信息', hint: '配合调查', effect: { politics: -2, execute: +1, network: -3, integrity: +7, rank: 0 } },
        { text: '保持沉默', hint: '明哲保身', effect: { politics: -1, execute: 0, network: +1, integrity: -2, rank: 0 } },
        { text: '为领导辩护', hint: '维护关系', effect: { politics: +2, execute: +1, network: +3, integrity: -4, rank: 0 } },
        { text: '谨慎提供有限信息', hint: '平衡处理', effect: { politics: +1, execute: +2, network: +1, integrity: +3, rank: 0 } }
      ]
    },
    {
      title: '项目审批',
      desc: '一个投资项目等你审批，有人说可以从中分一杯羹',
      hint: '明显的权钱交易诱惑',
      choices: [
        { text: '严格审批', hint: '按程序办事', effect: { politics: +1, execute: +3, network: +1, integrity: +6, rank: 0 } },
        { text: '快速批准', hint: '可能有问题', effect: { politics: +2, execute: +2, network: +3, integrity: -8, rank: 0 } },
        { text: '详细审查后再决定', hint: '认真负责', effect: { politics: +2, execute: +4, network: +2, integrity: +4, rank: 0 } },
        { text: '推迟审批', hint: '拖延战术', effect: { politics: +1, execute: +1, network: +1, integrity: +2, rank: 0 } }
      ]
    },
    {
      title: '交际应酬',
      desc: '需要参加各种应酬活动，花费不小',
      hint: '应酬可能建立关系，但也可能有问题',
      choices: [
        { text: '积极参加', hint: '建立人脉', effect: { politics: +3, execute: +2, network: +4, integrity: -4, rank: 0 } },
        { text: '选择性参加', hint: '平衡考虑', effect: { politics: +2, execute: +2, network: +2, integrity: +2, rank: 0 } },
        { text: '尽量推脱', hint: '保持清白', effect: { politics: -2, execute: +1, network: -2, integrity: +4, rank: 0 } },
        { text: '正当参加', hint: '合规参与', effect: { politics: +1, execute: +1, network: +2, integrity: +3, rank: 0 } }
      ]
    },
    {
      title: '年终考核',
      desc: '年终考核，有机会获得优秀评价',
      hint: '优秀评价对晋升很重要',
      choices: [
        { text: '积极争取', hint: '主动出击', effect: { politics: +3, execute: +3, network: +3, integrity: -2, rank: 0 } },
        { text: '正常表现', hint: '顺其自然', effect: { politics: +1, execute: +1, network: +1, integrity: +1, rank: 0 } },
        { text: '突出业绩', hint: '靠实力说话', effect: { politics: +2, execute: +4, network: +2, integrity: +3, rank: 1 } },
        { text: '低调处理', hint: '避免竞争', effect: { politics: -1, execute: +1, network: +1, integrity: +2, rank: 0 } }
      ]
    }
  ];

  // 随机选择指定数量的事件
  const shuffled = [...events].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, events.length));
}

/**
 * 计算结局
 */
function computeEnding(attrs, rank, difficulty, maxSteps) {
  const integrityScore = attrs.integrity;
  const totalScore = (attrs.politics + attrs.execute + attrs.network + integrityScore) / 4;

  const diffFactor = difficulty === 'easy' ? 0.6 : difficulty === 'hard' ? 1.2 : 0.9;
  const risk = (100 - integrityScore) * diffFactor;

  const performanceScore = totalScore * 0.6 + (rank / maxSteps) * 100 * 0.4;

  let endingType;

  if (risk >= 85) {
    endingType = 'BAD';
  } else if (integrityScore >= 70 && performanceScore >= 60 && rank >= 2) {
    endingType = 'GREAT';
  } else if (integrityScore >= 50 && performanceScore >= 45) {
    endingType = 'GOOD';
  } else if (integrityScore >= 35) {
    endingType = 'MID';
  } else {
    endingType = 'MID2';
  }

  return { endingType, risk, integrityScore, totalScore, rank, diffFactor, performanceScore };
}

/**
 * 运行大规模模拟测试
 */
async function runLargeScaleSimulation() {
  console.log('========================================');
  console.log('  真实玩家模拟测试');
  console.log('========================================\n');

  if (!API_KEY) {
    console.error('错误: DEEPSEEK_API_KEY 环境变量未设置');
    console.log('请在 .env 文件中设置: DEEPSEEK_API_KEY=你的API密钥');
    return;
  }

  const results = {
    byPlayerType: {},
    overall: { BAD: 0, MID2: 0, MID: 0, GOOD: 0, GREAT: 0, total: 0 }
  };

  // 对每种玩家类型运行模拟
  for (const playerType of PLAYER_ARCHETYPES) {
    console.log(`\n正在模拟 ${playerType.name} 玩家...`);

    const playerResults = { BAD: 0, MID2: 0, MID: 0, GOOD: 0, GREAT: 0 };

    // 每种类型运行 10 次模拟
    for (let i = 0; i < 10; i++) {
      try {
        const result = await simulateGame(playerType, 10);
        playerResults[result.ending]++;
        results.overall[result.ending]++;
        results.overall.total++;

        process.stdout.write(`.`);
      } catch (error) {
        console.error(`\n模拟失败: ${error.message}`);
      }
    }

    results.byPlayerType[playerType.name] = playerResults;
    console.log(` 完成`);
  }

  console.log('\n\n========================================');
  console.log('  测试结果');
  console.log('========================================\n');

  // 显示每种玩家类型的结果
  console.log('各类型玩家结局分布:');
  for (const [playerTypeName, playerResults] of Object.entries(results.byPlayerType)) {
    const total = Object.values(playerResults).reduce((a, b) => a + b, 0);
    console.log(`\n${playerTypeName}:`);
    for (const [ending, count] of Object.entries(playerResults)) {
      console.log(`  ${ending.padEnd(6)}: ${count} (${(count/total*100).toFixed(1)}%)`);
    }
  }

  // 显示总体结果
  console.log('\n总体结局分布:');
  const total = results.overall.total;
  for (const [ending, count] of Object.entries(results.overall)) {
    if (ending === 'total') continue;
    console.log(`  ${ending.padEnd(6)}: ${count} (${(count/total*100).toFixed(1)}%)`);
  }

  console.log(`\n总模拟次数: ${total}`);

  // 分析是否存在偏差
  const badEndingRate = results.overall.BAD / total;
  console.log(`\n坏结局率: ${(badEndingRate * 100).toFixed(1)}%`);

  if (badEndingRate > 0.3) {
    console.log('⚠️ 警告: 坏结局率过高，存在系统性偏差');
  } else if (badEndingRate < 0.1) {
    console.log('✅ 坏结局率合理');
  } else {
    console.log('ℹ️ 坏结局率在可接受范围');
  }

  return results;
}

// 运行测试
if (require.main === module) {
  runLargeScaleSimulation().catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
}

module.exports = { runLargeScaleSimulation, simulatePlayerChoice, simulateGame };
