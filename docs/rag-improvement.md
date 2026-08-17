# 官途模拟器 - RAG 改进方案

## 问题分析

当前 RAG 实现过于粗糙，主要问题：

### 1. 纯随机采样，无语义相关性

```javascript
const shuffled = [...cases].sort(() => Math.random() - 0.5);
```

完全随机打乱数组，没有考虑案例与当前事件的语义相关性。

### 2. 无向量嵌入和相似度计算

没有使用任何文本嵌入技术，无法计算语义相似度。

### 3. 缺少上下文感知

根据事件类型（日常、危机、诱惑等）应该检索不同类型的案例，但当前实现没有这种区分。

## 改进方案

### 方案 A：基于 TF-IDF 的轻量级相似度（立即实现）

由于是浏览器端游戏，我们可以使用简化的 TF-IDF 算法：

```javascript
// 简单的文本相似度计算
function calculateSimilarity(queryText, documentText) {
  const queryTerms = tokenize(queryText);
  const docTerms = tokenize(documentText);

  // 计算词频
  const queryTf = getTermFrequency(queryTerms);
  const docTf = getTermFrequency(docTerms);

  // 计算余弦相似度
  return cosineSimilarity(queryTf, docTf);
}

// 分词函数（中文）
function tokenize(text) {
  // 简单的分词 - 按字符和常见词边界
  return text.toLowerCase()
    .replace(/[^一-龥a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}
```

### 方案 B：基于事件类型的智能检索

```javascript
function getRelevantCases(eventType, deptId, gameRank) {
  const ragLevel = getRAGLevel(gameRank);
  const key = deptId + '_' + ragLevel;
  const cases = RAG_DATA.cases_by_dept_level[key] || [];

  // 根据事件类型过滤
  const eventTypeFilters = {
    'temptation': (c) => c.is_corrupt || hasRiskFactors(c),
    'crisis': (c) => hasCrisisHandling(c),
    'opportunity': (c) => hasPromotionPath(c),
    'politics': (c) => isIntricatePolitics(c),
    'default': () => true
  };

  const filter = eventTypeFilters[eventType] || eventTypeFilters['default'];
  const relevantCases = cases.filter(filter);

  // 计算相似度并排序
  return relevantCases
    .map(c => ({
      ...c,
      similarity: calculateContextSimilarity(c, eventType)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 2);
}
```

### 方案 C：预计算嵌入（可选高级方案）

如果需要真正的语义搜索，可以预计算嵌入：

```javascript
// 预处理阶段（可以离线完成）
async function precomputeEmbeddings() {
  for (const key in RAG_DATA.cases_by_dept_level) {
    const cases = RAG_DATA.cases_by_dept_level[key];
    for (const case of cases) {
      // 创建案例描述文本
      const caseText = `${case.name} ${case.position} ${case.org} ${case.period}`;
      // 调用嵌入 API（如 DeepSeek Embedding API）
      case.embedding = await getEmbedding(caseText);
    }
  }
}

// 运行时检索
function findMostRelevantCases(query, cases, topK = 2) {
  const queryEmbedding = getEmbedding(query);

  return cases
    .map(c => ({
      ...c,
      similarity: cosineSimilarity(queryEmbedding, c.embedding)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
```

## 实施计划

### 阶段 1（立即实施）

1. 实现基于关键词的相似度计算
2. 根据事件类型智能过滤案例
3. 添加案例标签和分类

### 阶段 2（可选）

1. 预计算案例嵌入
2. 实现真正的语义搜索
3. 添加案例聚类和分类

## 具体实现

### 1. 案例分类和标签

```javascript
// 为案例添加标签
function classifyCase(caseData) {
  const tags = [];

  if (caseData.is_corrupt) tags.push('腐败案例');
  if (caseData.level === '正厅级' || caseData.level === '副厅级') tags.push('高级官员');
  if (caseData.org.includes('纪委')) tags.push('纪检监察');
  if (caseData.org.includes('组织部')) tags.push('组织人事');

  return tags;
}
```

### 2. 事件类型与案例匹配

```javascript
const EVENT_TYPE_TO_CASE_TYPE = {
  'daily': ['日常政务', '基础工作'],
  'opportunity': ['晋升机遇', '提拔重用'],
  'temptation': ['腐败案例', '利益诱惑'],
  'politics': ['站队选择', '派系政治'],
  'crisis': ['危机应对', '突发事件'],
  'interpersonal': ['人际关系', '职场博弈']
};
```

### 3. 优化后的检索函数

```javascript
function buildRAGPromptSection(deptId, gameRank, eventType = 'daily') {
  if (!RAG_DATA) return '';

  const parts = [];
  const ragLevel = getRAGLevel(gameRank);
  const key = deptId + '_' + ragLevel;
  const cases = RAG_DATA.cases_by_dept_level[key] || [];

  // 根据事件类型智能检索
  const relevantCases = getRelevantCasesByEventType(cases, eventType, 2);

  if (relevantCases.length > 0) {
    parts.push('【相关真实官员任职参考】');
    relevantCases.forEach((c, i) => {
      let line = `${i + 1}. ${c.name}：${c.level}，${c.position}（${c.org}）`;
      if (c.area && c.area !== '中央nannan') line += `，${c.area}`;
      line += `，任期${c.period}`;
      parts.push(line);
    });
  }

  // 根据事件类型选择性添加腐败案例
  if (eventType === 'temptation' || eventType === 'crisis') {
    const corrupt = getRelevantCorruptCase(eventType);
    if (corrupt) {
      parts.push('');
      parts.push('【相关真实案例参考】');
      parts.push(`${corrupt.name}：${corrupt.crime}，判${corrupt.sentence}`);
    }
  }

  return parts.join('\n');
}
```

## 预期效果

| 改进项 | 当前问题 | 改进后效果 |
|-------|---------|----------|
| 相关性 | 完全随机 | 基于事件类型和语义的相关性 |
| 一致性 | 相同事件不同案例 | 相似事件获得相似案例 |
| 效率 | 加载所有案例 | 智能过滤，减少无用信息 |
| 用户体验 | 不相关的案例干扰 | 高度相关的案例增强真实感 |

## 相关文件

- `rag_knowledge.json` - RAG 知识库
- `index.html` - 当前 RAG 实现
- `docs/rag-improvement.md` - 本文档

---

改进日期: 2026-08-17
分支: dev/rag-improvement
