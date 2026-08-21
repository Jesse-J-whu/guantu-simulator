/**
 * @file 官员履历 RAG 检索 — 从 rag_knowledge.json 检索真实案例注入提示词,增强真实感。
 * 从旧版 index.html 移植并模块化。
 */

import type { EventTag } from './types.ts';

/** 履历案例。 */
export interface RagCase {
  name: string;
  position?: string;
  org?: string;
  area?: string;
  level?: string;
  period?: string;
  is_corrupt?: boolean;
  corrupt_detail?: unknown;
}

/** 腐败案例。 */
export interface CorruptCase {
  name: string;
  education?: string;
  crime?: string;
  amount?: string;
  sentence?: string;
}

/** 知识库整体结构。 */
export interface RagData {
  cases_by_dept_level: Record<string, RagCase[]>;
  corrupt_cases: CorruptCase[];
  promotion_paths: unknown[];
}

/** 游戏职级 → RAG 档案级别映射。 */
const GAME_RANK_TO_RAG_LEVEL: Record<string, string> = {
  科员: '科员级',
  副科级: '副处级',
  正科级: '正处级',
  副处级: '副处级',
  正处级: '正处级',
  副厅级: '副厅级',
  正厅级: '正厅级',
  委员: '科员级',
  常委: '正处级',
  副主席: '副厅级',
  代表: '科员级',
};

/** 事件类型 → 案例检索关键词(预留给按需扩展的检索策略)。 */
const EVENT_TYPE_KEYWORDS: Record<EventTag, string[]> = {
  daily: ['日常政务', '基础工作', '常规业务'],
  opportunity: ['晋升机遇', '提拔重用', '考核考察'],
  temptation: ['腐败案例', '利益诱惑', '权钱交易'],
  politics: ['站队选择', '派系政治', '人事博弈'],
  crisis: ['危机应对', '突发事件', '群众上访'],
  interpersonal: ['人际关系', '职场博弈', '上下级关系'],
};
void EVENT_TYPE_KEYWORDS;

/** RAG 检索器:持有知识库引用。 */
export class RagRetriever {
  private readonly data: RagData | null;

  constructor(data: RagData | null) {
    this.data = data;
  }

  /** 按 部门+职级 取同级别案例,带腐败标签相关性打分。 */
  getCases(deptId: string, gameRank: string, count = 2): RagCase[] {
    if (!this.data) return [];
    const ragLevel = GAME_RANK_TO_RAG_LEVEL[gameRank] || '科员级';
    const cases = this.data.cases_by_dept_level[`${deptId}_${ragLevel}`];
    if (!cases || cases.length === 0) return [];
    const scored = cases.map((c) => ({ c, score: Math.random() }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((s) => s.c);
  }

  /** 随机取一条腐败案例(诱惑/危机类优先大案)。 */
  getCorruptCase(tag: EventTag): CorruptCase | null {
    if (!this.data || this.data.corrupt_cases.length === 0) return null;
    if (tag === 'temptation' || tag === 'crisis') {
      const severe = this.data.corrupt_cases.filter(
        (c) => c.amount && (c.amount.includes('万') || c.amount.includes('亿')),
      );
      if (severe.length > 0) return severe[Math.floor(Math.random() * severe.length)];
    }
    return this.data.corrupt_cases[Math.floor(Math.random() * this.data.corrupt_cases.length)];
  }

  /** 生成注入提示词的 RAG 段落。 */
  buildPromptSection(deptId: string, gameRank: string, tag: EventTag, progress: number): string {
    if (!this.data) return '';
    const parts: string[] = [];
    const cases = this.getCases(deptId, gameRank, 2);
    if (cases.length > 0) {
      // 注意:档案库没有科级条目,科级玩家会取到处级案例——仅作履历写法
      // 与职务体系的风格参考,不得照抄其级别(否则加剧职级虚高)。
      parts.push('【真实官员履历参考（仅风格参考，人物级别以本文职级规则表为准）】');
      cases.forEach((c, i) => {
        let line = `${i + 1}. ${c.name}：${c.level ?? ''}，${c.position ?? ''}（${c.org ?? ''}）`;
        if (c.area && !c.area.includes('nan')) line += `，${c.area}`;
        line += `，任期${c.period ?? '不详'}`;
        if (c.is_corrupt) line += ' [后被查处]';
        parts.push(line);
      });
    }
    if (progress > 0.5 || tag === 'temptation' || tag === 'crisis') {
      const corrupt = this.getCorruptCase(tag);
      if (corrupt) {
        parts.push('');
        parts.push('【真实腐败案例参考】');
        let cline = `${corrupt.name}（${corrupt.education ?? ''}），${corrupt.crime ?? ''}`;
        if (corrupt.amount) cline += `，涉案${corrupt.amount}`;
        if (corrupt.sentence) cline += `，判${corrupt.sentence}`;
        parts.push(cline);
      }
    }
    return parts.length > 0 ? parts.join('\n') : '';
  }
}

/** 从 URL 加载知识库(浏览器端)。 */
export async function loadRagData(url = '/rag_knowledge.json'): Promise<RagData | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as RagData;
  } catch {
    return null;
  }
}
