/**
 * 测试改进后的LLM事件生成提示词
 */

const https = require('https');
require('dotenv').config();
const API_KEY = process.env.DEEPSEEK_API_KEY;

/**
 * 测试改进后的提示词
 */
async function testImprovedPrompt() {
  const prompt = `你是一个精通中国公务员体制的官场模拟器事件生成器。

请按照以下格式生成一个官场事件：

【事件类型】temptation
【类型标签】利益诱惑
【事件标题】8到15字的标题
【事件描述】有画面感有冲突的详细描述，参考真实官场案例。可以写多行，直到下一个标记为止。
【官场格言】一句暗示或格言
【选项A】选项文字描述
【选项A提示】这个选项的提示或暗示
【选项A效果】政治嗅觉:+5 执行力:+3 人脉资源:+2 廉洁度:0 晋升:0
【选项B】选项文字描述
【选项B提示】这个选项的提示或暗示
【选项B效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0
【选项C】选项文字描述
【选项C提示】这个选项的提示或暗示
【选项C效果】政治嗅觉:-2 执行力:0 人脉资源:-3 廉洁度:+5 晋升:0
【选项D】选项文字描述
【选项D提示】这个选项的提示或暗示
【选项D效果】政治嗅觉:+3 执行力:+5 人脉资源:+4 廉洁度:-3 晋升:0

注意：
- 必须使用具体数字，不要使用X占位符
- 每个属性必须是-30到+20之间的整数（包括正数和负数）
- 廉洁度变化很重要，好的选择应该增加或保持廉洁度
- 四个选项的效果必须平衡分布，不要都是正面或都是负面
- 选项必须具体且各有利弊，玩家需要权衡
- 只输出以上标记格式的内容，不要输出任何其他文字

现在请生成一个关于利益诱惑或道德两难的官场事件。`;

  try {
    const response = await callDeepSeek(prompt);
    console.log('========================================');
    console.log('LLM 生成的完整事件：');
    console.log('========================================\n');
    console.log(response);
    console.log('\n========================================');
    console.log('解析分析：');
    console.log('========================================\n');

    // 分析生成的选项效果
    const effects = [];
    const effectPattern = /【选项(.)效果】([^【]*)/g;
    let match;

    while ((match = effectPattern.exec(response)) !== null) {
      effects.push({
        option: match[1],
        effectStr: match[2].trim()
      });
    }

    console.log(`共找到 ${effects.length} 个选项效果：\n`);

    let hasPositiveIntegrity = false;
    let hasNegativeIntegrity = false;
    let allZeros = true;

    for (const effect of effects) {
      console.log(`选项 ${effect.option}: ${effect.effectStr}`);

      // 检查是否全是0
      if (effect.effectStr !== '政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0') {
        allZeros = false;
      }

      // 检查廉洁度影响
      const integrityMatch = effect.effectStr.match(/廉洁度:([+-]?\d+)/);
      if (integrityMatch) {
        const integrityValue = parseInt(integrityMatch[1]);
        if (integrityValue > 0) hasPositiveIntegrity = true;
        if (integrityValue < 0) hasNegativeIntegrity = true;
      }
    }

    console.log('\n分析结果：');
    console.log(`- 是否全为0: ${allZeros ? '❌ 是' : '✅ 否'}`);
    console.log(`- 有正面廉洁度效果: ${hasPositiveIntegrity ? '✅ 是' : '❌ 否'}`);
    console.log(`- 有负面廉洁度效果: ${hasNegativeIntegrity ? '✅ 是' : '❌ 否'}`);

    if (allZeros) {
      console.log('\n❌ 问题：LLM仍然生成全0效果，提示词需要进一步改进');
    } else {
      console.log('\n✅ 成功：LLM生成了带具体数值的效果');
    }

  } catch (error) {
    console.error('测试失败:', error.message);
  }
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

// 运行测试
if (require.main === module) {
  if (!API_KEY) {
    console.error('错误: DEEPSEEK_API_KEY 环境变量未设置');
    process.exit(1);
  }

  testImprovedPrompt().catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
}

module.exports = { testImprovedPrompt };
