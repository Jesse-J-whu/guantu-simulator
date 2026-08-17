/**
 * 官途模拟器 - 分析LLM生成事件的偏差
 *
 * 关键洞察：用户报告大多数玩家得到坏结局，但我的模拟显示0%坏结局
 * 这说明问题可能不在结局计算，而在LLM生成的事件选项！
 */

const https = require('https');
require('dotenv').config();
const API_KEY = process.env.DEEPSEEK_API_KEY;

/**
 * 调用DeepSeek生成一个事件
 */
async function generateOneEvent() {
  const prompt = `你是一个精通中国公务员体制的官场模拟器事件生成器。

请生成一个简单的官场事件，格式如下：
【事件类型】temptation
【事件标题】8-15字标题
【事件描述】有冲突的详细描述
【选项A】选项文字
【选项A效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:-5 晋升:0
【选项B】选项文字
【选项B效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0
【选项C】选项文字
【选项C效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0
【选项D】选项文字
【选项D效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0

注意：事件要围绕一个利益诱惑或道德两难的选择展开。`;

  try {
    const response = await callDeepSeek(prompt);
    return parseEvent(response);
  } catch (error) {
    console.error('生成事件失败:', error.message);
    return null;
  }
}

/**
 * 解析事件
 */
function parseEvent(text) {
  const event = {
    title: '',
    desc: '',
    choices: []
  };

  const lines = text.split('\n');
  let currentSection = '';
  let currentChoice = null;

  for (const line of lines) {
    if (line.includes('【事件标题】')) {
      event.title = line.replace('【事件标题】', '').trim();
    } else if (line.includes('【事件描述】')) {
      currentSection = 'desc';
      event.desc = line.replace('【事件描述】', '').trim();
    } else if (line.includes('【选项') && line.includes('】')) {
      const choiceText = line.match(/【选项(.)】(.*)/);
      if (choiceText) {
        currentChoice = { letter: choiceText[1], text: choiceText[2].trim(), effect: null };
        event.choices.push(currentChoice);
        currentSection = 'choice';
      }
    } else if (line.includes('【选项') && line.includes('效果】')) {
      const effectText = line.match(/【选项(.)效果】(.*)/);
      if (effectText && currentChoice) {
        currentChoice.effect = parseEffect(effectText[2]);
      }
    }
  }

  return event;
}

/**
 * 解析效果字符串
 */
function parseEffect(effectStr) {
  const effect = { politics: 0, execute: 0, network: 0, integrity: 0, rank: 0 };

  const patterns = {
    politics: /政治嗅觉\s*[:：]\s*(-?\d+)/,
    execute: /执行力\s*[:：]\s*(-?\d+)/,
    network: /人脉资源\s*[:：]\s*(-?\d+)/,
    integrity: /廉洁度\s*[:：]\s*(-?\d+)/,
    rank: /晋升\s*[:：]\s*(-?\d+)/
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = effectStr.match(pattern);
    if (match) {
      effect[key] = parseInt(match[1]) || 0;
    }
  }

  return effect;
}

/**
 * 调用DeepSeek API
 */
function callDeepSeek(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1500
    });

    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          const content = response.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 分析事件的偏差
 */
function analyzeEventBias(event) {
  console.log('\n========================================');
  console.log(`事件: ${event.title}`);
  console.log('========================================');
  console.log(`描述: ${event.desc}\n`);

  // 分析每个选项
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (let i = 0; i < event.choices.length; i++) {
    const choice = event.choices[i];
    const effect = choice.effect || {};

    // 判断选项是正面还是负面
    const totalEffect = (effect.politics || 0) + (effect.execute || 0) +
                       (effect.network || 0) + (effect.integrity || 0);

    let type = 'neutral';
    if (totalEffect > 0) {
      type = 'positive';
      positiveCount++;
    } else if (totalEffect < 0) {
      type = 'negative';
      negativeCount++;
    } else {
      neutralCount++;
    }

    console.log(`选项 ${String.fromCharCode(65 + i)}: ${choice.text}`);
    console.log(`  类型: ${type}`);
    console.log(`  效果: 政${effect.politics || 0} 执${effect.execute || 0} 脉${effect.network || 0} 廉${effect.integrity || 0}`);
    console.log(`  总效果: ${totalEffect}`);
  }

  console.log('\n选项分布:');
  console.log(`  正面选项: ${positiveCount}`);
  console.log(`  负面选项: ${negativeCount}`);
  console.log(`  中性选项: ${neutralCount}`);

  // 检查是否存在偏差
  if (negativeCount > positiveCount) {
    console.log('⚠️ 偏差: 负面选项多于正面选项');
  } else if (positiveCount > negativeCount) {
    console.log('✅ 平衡: 正面选项多于负面选项');
  } else {
    console.log('ℹ️ 平等: 正负面选项数量相等');
  }

  // 检查廉洁度影响
  let integrityNegative = 0;
  for (const choice of event.choices) {
    if (choice.effect && choice.effect.integrity < 0) {
      integrityNegative++;
    }
  }

  if (integrityNegative > 2) {
    console.log('⚠️ 廉洁偏差: 超过2个选项会降低廉洁度');
  }

  return {
    positiveCount,
    negativeCount,
    neutralCount,
    integrityNegative
  };
}

/**
 * 运行多次分析
 */
async function runMultipleAnalysis(count = 10) {
  console.log('========================================');
  console.log('  LLM事件偏差分析');
  console.log('========================================\n');

  const results = {
    totalPositive: 0,
    totalNegative: 0,
    totalNeutral: 0,
    integrityNegativeEvents: 0,
    biasedEvents: 0
  };

  for (let i = 0; i < count; i++) {
    console.log(`\n--- 生成事件 ${i + 1}/${count} ---`);
    const event = await generateOneEvent();

    if (!event) {
      console.log('生成失败，跳过');
      continue;
    }

    const analysis = analyzeEventBias(event);

    results.totalPositive += analysis.positiveCount;
    results.totalNegative += analysis.negativeCount;
    results.totalNeutral += analysis.neutralCount;

    if (analysis.integrityNegative > 2) {
      results.integrityNegativeEvents++;
    }
    if (analysis.negativeCount > analysis.positiveCount) {
      results.biasedEvents++;
    }

    // 添加延迟避免API限流
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n\n========================================');
  console.log('  总体分析');
  console.log('========================================\n');

  console.log(`生成事件数: ${count}`);
  console.log(`总选项分布:`);
  console.log(`  正面选项: ${results.totalPositive}`);
  console.log(`  负面选项: ${results.totalNegative}`);
  console.log(`  中性选项: ${results.totalNeutral}`);

  console.log(`\n偏差统计:`);
  console.log(`  负面偏多的事件: ${results.biasedEvents} (${(results.biasedEvents / count * 100).toFixed(1)}%)`);
  console.log(`  廉洁度负面偏多的事件: ${results.integrityNegativeEvents} (${(results.integrityNegativeEvents / count * 100).toFixed(1)}%)`);

  if (results.biasedEvents > count * 0.5) {
    console.log('\n⚠️ 严重偏差: 大多数事件负面选项偏多');
  } else if (results.biasedEvents > count * 0.3) {
    console.log('\n⚠️ 轻微偏差: 部分事件负面选项偏多');
  } else {
    console.log('\n✅ 无明显偏差: 事件选项分布平衡');
  }

  return results;
}

// 运行分析
if (require.main === module) {
  if (!API_KEY) {
    console.error('错误: DEEPSEEK_API_KEY 环境变量未设置');
    process.exit(1);
  }

  runMultipleAnalysis(5).catch(error => {
    console.error('分析失败:', error);
    process.exit(1);
  });
}

module.exports = { runMultipleAnalysis, analyzeEventBias, generateOneEvent };
