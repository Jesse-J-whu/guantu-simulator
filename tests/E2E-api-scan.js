/**
 * E2E 纯 API 批量扫描
 *
 * 直接调用本地 /api/llm-proxy 批量生成真实事件，并用与游戏 index.html 完全一致的
 * 解析/RAG/分类逻辑检查生成结果。不做浏览器 UI，避开 CDP 长尾卡死，
 * 快速横向扫遍全部部门 × 各职级起点，集中暴露：
 *   - 事件生成失败率 / 上游错误类型
 *   - 解析崩溃 / 选项不足 / 事件类型缺失 / 格式异常
 *   - RAG/classifyCase 崩溃
 *   - 长尾延迟分布（响应耗时的长尾）
 *
 * 运行：node server.js 需已启动；本脚本连 http://localhost:3000/api/llm-proxy
 * 用法：node tests/E2E-api-scan.js [depts=weiban,jiwei] [perStep=1] [concurrency=4] [noDetail]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const RAG_DATA = require('../rag_knowledge.json');

// ========== 与 index.html 一致的事件解析 ==========
function parseStructuredEvent(content) {
  const fields = {};
  const markerRegex = /【([^】]+)】/g;
  let match; const keys = [];
  while ((match = markerRegex.exec(content)) !== null) {
    keys.push({ key: match[1], start: match.index + match[0].length });
  }
  for (let i = 0; i < keys.length; i++) {
    const end = i + 1 < keys.length ? keys[i + 1].start - keys[i + 1].key.length - 2 : content.length;
    fields[keys[i].key] = content.substring(keys[i].start, end).trim();
  }
  const choices = [];
  const letterLabels = ['A', 'B', 'C', 'D'];
  for (const letter of letterLabels) {
    const text = fields[`选项${letter}`];
    const hint = fields[`选项${letter}提示`];
    const effectStr = fields[`选项${letter}效果`];
    if (!text) continue;
    const effect = { politics: 0, execute: 0, network: 0, integrity: 0, rank: 0 };
    if (effectStr) {
      let m;
      if ((m = effectStr.match(/政治嗅觉\s*[:：]\s*(-?\d+)/))) effect.politics = parseInt(m[1]) || 0;
      if ((m = effectStr.match(/执行力\s*[:：]\s*(-?\d+)/))) effect.execute = parseInt(m[1]) || 0;
      if ((m = effectStr.match(/人脉资源\s*[:：]\s*(-?\d+)/))) effect.network = parseInt(m[1]) || 0;
      if ((m = effectStr.match(/廉洁度\s*[:：]\s*(-?\d+)/))) effect.integrity = parseInt(m[1]) || 0;
      if ((m = effectStr.match(/晋升\s*[:：]\s*(-?\d+)/))) effect.rank = parseInt(m[1]) || 0;
    }
    choices.push({ text, hint: hint || '', effect });
  }
  const tagMap = { daily:'daily', opportunity:'opportunity', temptation:'temptation', politics:'politics', crisis:'crisis', interpersonal:'interpersonal' };
  const tagLabelMap = { daily:'日常政务', opportunity:'晋升机遇', temptation:'利益诱惑', politics:'政治站队', crisis:'危机应对', interpersonal:'人际关系' };
  const rawTag = (fields['事件类型'] || 'daily').toLowerCase().trim();
  return {
    id: 'scan', tag: tagMap[rawTag] || 'daily', tagLabel: fields['类型标签'] || tagLabelMap[rawTag] || '日常政务',
    title: fields['事件标题'] || '', desc: fields['事件描述'] || '', hint: fields['官场格言'] || '',
    choices, aiGenerated: true,
  };
}

// ========== 与 index.html 一致的 RAG 分类/检索（暴露崩溃点） ==========
function classifyCase(caseData) {
  const tags = [];
  if (caseData.is_corrupt) {
    tags.push('腐败案例');
    if (caseData.corrupt_detail) {
      let detail = '';
      if (typeof caseData.corrupt_detail === 'string') detail = caseData.corrupt_detail;
      else if (Array.isArray(caseData.corrupt_detail)) detail = caseData.corrupt_detail.join(' ');
      else if (typeof caseData.corrupt_detail === 'object') detail = Object.values(caseData.corrupt_detail).join(' ');
      if (detail.includes('受贿')) tags.push('受贿');
      if (detail.includes('贪污')) tags.push('贪污');
      if (detail.includes('滥用职权')) tags.push('滥用职权');
    }
  }
  if (caseData.level) {
    if (caseData.level.includes('正') || caseData.level.includes('副')) tags.push('高级官员');
  }
  if (caseData.org) {
    if (caseData.org.includes('纪委')) tags.push('纪检监察');
    if (caseData.org.includes('发改委')) tags.push('经济发展');
    if (caseData.org.includes('财政')) tags.push('财政管理');
    if (caseData.org.includes('组织')) tags.push('组织人事');
  }
  return tags;
}
function calculateTextSimilarity(text1, text2) {
  const tokenize = (text) => text.toLowerCase().replace(/[^一-龥a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const t1 = tokenize(text1), t2 = tokenize(text2);
  if (t1.length === 0 || t2.length === 0) return 0;
  const s1 = new Set(t1), s2 = new Set(t2);
  const inter = new Set([...s1].filter(x => s2.has(x)));
  const mag1 = Math.sqrt(s1.size), mag2 = Math.sqrt(s2.size);
  if (mag1 === 0 || mag2 === 0) return 0;
  return inter.size / (mag1 * mag2);
}
const EVENT_TYPE_TO_CASE_TYPE = {
  daily:['日常政务','基础工作','常规业务'], opportunity:['晋升机遇','提拔重用','考核考察'],
  temptation:['腐败案例','利益诱惑','权钱交易'], politics:['站队选择','派系政治','人事博弈'],
  crisis:['危机应对','突发事件','群众上访'], interpersonal:['人际关系','职场博弈','上下级关系']
};
function getRelevantCasesByEventType(eventType, deptId, gameRank, count = 2) {
  if (!RAG_DATA) return null;
  const levelMap = { '科员':'科员级','副科级':'副处级','正科级':'正处级','副处级':'副处级','正处级':'正处级','副厅级':'副厅级','正厅级':'正厅级','委员':'科员级','常委':'正处级','副主席':'副厅级','代表':'科员级' };
  const ragLevel = levelMap[gameRank] || '科员级';
  const key = deptId + '_' + ragLevel;
  const cases = RAG_DATA.cases_by_dept_level[key];
  if (!cases || cases.length === 0) return null;
  const targetTypes = EVENT_TYPE_TO_CASE_TYPE[eventType] || ['日常政务'];
  const scored = cases.map(cd => {
    let s = 0;
    const tags = classifyCase(cd);
    for (const t of targetTypes) for (const tag of tags) if (tag.includes(t) || t.includes(tag)) s += 2;
    if (cd.org) for (const t of targetTypes) s += calculateTextSimilarity(cd.org, t) * 3;
    if (cd.position) for (const t of targetTypes) s += calculateTextSimilarity(cd.position, t) * 2;
    return { cd, s };
  }).sort((a,b) => b.s - a.s);
  const top = scored.slice(0, count).map(x => x.cd);
  if (top[0] && scored[0].s < 1) { const sh = [...cases].sort(() => Math.random()-0.5); return sh.slice(0, count); }
  return top;
}

// ========== 调用本地 proxy ==========
function callProxy(prompt, type) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const body = JSON.stringify({ prompt, max_tokens: type==='background'?1000:1500, temperature: type==='background'?0.7:0.8, top_p: type==='background'?0.85:0.90, stream:false });
    const req = http.request({ host:'localhost', port:3000, path:'/api/llm-proxy', method:'POST', headers:{'Content-Type':'application/json'} }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        let json=null; try{ json=JSON.parse(d); }catch{}
        resolve({ ms: Date.now()-t0, status: res.statusCode, ok: res.statusCode===200, content: json?.content||'', error: json?.error||null });
      });
    });
    req.on('error', e => resolve({ ms: Date.now()-t0, ok:false, content:'', error:'req:'+e.message }));
    req.setTimeout(600000, ()=>{ req.destroy(); resolve({ ms: Date.now()-t0, ok:false, content:'', error:'timeout>600s' }); });
    req.write(body); req.end();
  });
}

// ========== 构造与游戏一致的 event prompt ==========
const DEPTS = [
  ['weiban','委办（党委办公室）'], ['fuban','府办（政府办公室）'], ['zuzhiB','组织部'], ['jiwei','纪委（纪律检查委员会）'],
  ['fagaB','发改委'], ['caizhi','财政部门'], ['xuanchuanB','宣传部'], ['tongzhan','统战部'],
  ['zhengfaB','政法委'], ['jiaoyu','教育部门'], ['keji','科技部门'], ['zhengxie','政协'], ['renda','人大'],
];
const RANKS_BY_DEPT = {
  weiban:['科员','副科级','正科级','副处级','正处级','副厅级'], fuban:['科员','副科级','正科级','副处级','正处级'],
  zuzhiB:['科员','副科级','正科级','副处级','正处级','副厅级','正厅级'], jiwei:['科员','副科级','正科级','副处级','正处级','副厅级'],
  fagaB:['科员','副科级','正科级','副处级','正处级','副厅级'], caizhi:['科员','副科级','正科级','副处级','正处级'],
  xuanchuanB:['科员','副科级','正科级','副处级','正处级'], tongzhan:['科员','副科级','正科级','副处级'],
  zhengfaB:['科员','副科级','正科级','副处级','正处级','副厅级'], jiaoyu:['科员','副科级','正科级','副处级'],
  keji:['科员','副科级','正科级','副处级','正处级'], zhengxie:['科员','副科级','正科级'], renda:['科员','副科级','正科级','副处级'],
};

function buildEventPrompt(deptId, deptName, currentRank) {
  const ranks = RANKS_BY_DEPT[deptId];
  const rankIdx = ranks.indexOf(currentRank);
  const nextRank = rankIdx < ranks.length-1 ? ranks[rankIdx+1] : '已到顶峰';
  let rag = '';
  try {
    const cases = getRelevantCasesByEventType('daily', deptId, currentRank, 2);
    if (cases && cases.length) {
      rag = '\n## 真实官员履历参考\n' + cases.map((c,i)=>`${i+1}. ${c.name}：${c.level}，${c.position}（${c.org}）${c.is_corrupt?' [后被查处]':''}`).join('\n');
    }
  } catch (e) { rag = '\n[RAG-CRASH] ' + (e.message||''); }
  return `你是一个中国官场模拟事件生成器。玩家：${deptName} 的${currentRank}（下一级：${nextRank}）。
参照以下真实官员履历增强真实感：${rag}
严格按照分隔符格式输出，不要输出JSON：
【事件类型】daily或opportunity或temptation或politics或crisis或interpersonal
【类型标签】中文标签
【事件标题】8到15字
【事件描述】有冲突的详细描述
【官场格言】一句格言
【选项A】文字
【选项A提示】提示
【选项A效果】政治嗅觉:+5 执行力:+3 人脉资源:+2 廉洁度:+1 晋升:0
【选项B】文字
【选项B提示】提示
【选项B效果】政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0
【选项C】文字
【选项C提示】提示
【选项C效果】政治嗅觉:-2 执行力:0 人脉资源:-3 廉洁度:+5 晋升:0
【选项D】文字
【选项D提示】提示
【选项D效果】政治嗅觉:+3 执行力:+5 人脉资源:+4 廉洁度:-3 晋升:0
每个属性必须是-30到+20的整数，至少2个选项有正面增益，只输出上述标记格式。`;
}

// ========== 构造背景 prompt（与 callLLM_background 一致） ==========
function buildBgPrompt(deptName, difficulty='normal') {
  return `你是一个中国官场文学作家。请为一个选择进入"${deptName}"的玩家生成一段官途开局背景。
要求：
1. 包含：姓名（中文名）、入职年份（2014-2016年间）、毕业院校、入职方式、家庭背景、初始职务全称
2. 用第二人称（"你"）写一段200-300字的沉浸式开场白，语言要有文学感和官场韵味
3. 难度：${difficulty}
4. 严格按照以下分隔符格式输出，不要输出JSON：

【行政级别】省级/市级/县级
【入职方式】入职方式描述
【家庭背景】家庭背景描述
【开场白】用第二人称写的200-300字沉浸式开场白，可多行，直到下一个标记为止
【初始职务】初始职务全称`;
}

// ========== run ==========
(async () => {
  const args = process.argv.slice(2);
  const get = k => { const x=args.find(a=>a.startsWith(k+'=')); return x?x.split('=')[1]:null; };
  const deptFilter = get('depts') ? get('depts').split(',') : null;
  const PER = parseInt(get('perStep')||'1', 10);
  const CONC = Math.min(8, parseInt(get('concurrency')||'4', 10));
  const VERBOSE = !get('noDetail');

  const targets = [];
  for (const [deptId, deptName] of DEPTS) {
    if (deptFilter && !deptFilter.includes(deptId)) continue;
    // 全部职级（ALL 参数）或抽样（默认起始 + 进阶）
    const ranks = RANKS_BY_DEPT[deptId];
    const all = get('all') === '1';
    const rankSamples = all ? ranks : (ranks.length>4 ? [ranks[0], ranks[1], ranks[Math.floor(ranks.length/2)]] : [ranks[0]]);
    for (const rank of rankSamples) for (let i=0;i<PER;i++) targets.push({ deptId, deptName, rank });
  }
  // 追加背景生成目标（每部门1个，用于验证 callLLM_background 路径）
  const bg = get('bg') !== '0';
  if (bg) {
    for (const [deptId, deptName] of DEPTS) {
      if (deptFilter && !deptFilter.includes(deptId)) continue;
      targets.push({ deptId, deptName, rank: null, isBg: true });
    }
  }
  console.log(`\n========== 纯API事件扫描 ==========`);
  console.log(`目标: ${targets.length} 个 (事件生成) | 并发 ${CONC} | 平均每步载荷(事件 prompt) 大\n`);

  // concurrency pool
  let idx = 0; const results = [];
  async function worker() {
    while (idx < targets.length) {
      const t = targets[idx++];
      const prompt = t.isBg ? buildBgPrompt(t.deptName) : buildEventPrompt(t.deptId, t.deptName, t.rank);
      const r = await callProxy(prompt, t.isBg ? 'background' : 'event');
      // parse
      let parsed=null, crash=null, choiceCount=0, hasOpening=false;
      if (r.ok && r.content) {
        try {
          if (t.isBg) {
            // background 解析
            parsed = { fields: {} };
            const markerRegex = /【([^】]+)】/g;
            let mm; const ks=[];
            while ((mm=markerRegex.exec(r.content))!==null) ks.push({key:mm[1], start:mm.index+mm[0].length});
            for (let i=0;i<ks.length;i++){ const e=i+1<ks.length?ks[i+1].start-ks[i+1].key.length-2:r.content.length; parsed.fields[ks[i].key]=r.content.substring(ks[i].start,e).trim(); }
            hasOpening = !!parsed.fields['开场白'];
            choiceCount = -1; // bg 无选项
          } else {
            parsed = parseStructuredEvent(r.content); choiceCount = parsed.choices.length;
          }
        }
        catch (e) { crash = 'parse:' + (e.message||'').slice(0,60); }
      }
      const entry = {
        dept: t.deptId, rank: t.rank || (t.isBg?'bg':null), ms: r.ms, status: r.status, ok: r.ok,
        choices: choiceCount, hasTitle: t.isBg ? hasOpening : !!parsed?.title, hasDesc: t.isBg ? hasOpening : !!parsed?.desc,
        eventType: t.isBg ? 'bg' : parsed?.tag, error: r.error, crash,
      };
      if (!r.ok && !r.error) entry.error = 'empty-content';
      results.push(entry);
      if (VERBOSE) console.log(`  [${t.deptId}/${entry.rank}] ${r.ms}ms ${r.ok?'OK':'FAIL('+(r.error||r.status)+')'} ${t.isBg?'opening='+hasOpening:'choices='+choiceCount} ${t.isBg?'':('type='+parsed?.tag||'-')}${entry.crash?' CRASH='+entry.crash:''}`);
    }
  }
  const workers = Array.from({length: CONC}, worker);
  await Promise.all(workers);

  // aggregate
  const total = results.length;
  const fail = results.filter(r=>!r.ok);
  const parseCrash = results.filter(r=>r.crash);
  const lowChoices = results.filter(r=>r.choices>0 && r.choices<2);
  const noTitle = results.filter(r=>r.ok && !r.hasTitle);
  const slow = results.filter(r=>r.ok && r.ms>100000);
  const byDeptFail = {};
  results.forEach(r=>{ if(!r.ok){ byDeptFail[r.dept]=(byDeptFail[r.dept]||0)+1; } });
  const ms = results.filter(r=>r.ok).map(r=>r.ms);
  const avg = ms.length? ms.reduce((a,b)=>a+b,0)/ms.length : 0;

  console.log(`\n========== 汇总 ==========`);
  console.log(`总生成: ${total} | 成功: ${total-fail.length} | 失败: ${fail.length} (${(fail.length/total*100).toFixed(1)}%)`);
  console.log(`解析崩溃: ${parseCrash.length}`);
  console.log(`成功但选项<2: ${lowChoices.length}`);
  console.log(`成功但无标题: ${noTitle.length}`);
  console.log(`慢响应(>100s): ${slow.length}`);
  console.log(`平均响应: ${avg|0}ms | 最慢: ${ms.length?Math.max(...ms):0}ms`);
  console.log(`\n分部门失败数:`); for (const [d,n] of Object.entries(byDeptFail)) console.log(`  ${d}: ${n}`);
  console.log(`\n失败样例(错误):`); const errCount={}; fail.forEach(r=>{ const k=(r.error||('status'+r.status)).slice(0,40); errCount[k]=(errCount[k]||0)+1; }); for(const [k,n] of Object.entries(errCount)) console.log(`  ${n}x  ${k}`);
  console.log(`\n解析崩溃样例:`); parseCrash.slice(0,5).forEach(r=>console.log(`  ${r.dept}/${r.rank}: ${r.crash}`));
  if (slow.length) { console.log(`\n慢响应分布(>100s):`); slow.sort((a,b)=>b.ms-a.ms).slice(0,8).forEach(r=>console.log(`  ${r.dept}/${r.rank}: ${(r.ms/1000|0)}s`)); }

  fs.mkdirSync(path.join(__dirname,'reports'), {recursive:true});
  fs.writeFileSync(path.join(__dirname,'reports','e2e-api-scan.json'), JSON.stringify({generatedAt:new Date().toISOString(), total, ok:total-fail.length, fail:fail.length, parseCrash:parseCrash.length, results}, null, 2));
  console.log(`\n明细已写入 tests/reports/e2e-api-scan.json`);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
