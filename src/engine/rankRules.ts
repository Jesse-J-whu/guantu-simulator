/**
 * @file 官职事实性规则库 — 校验并自动修正 LLM 生成文本中的职级错误。
 *
 * 背景:LLM 常见错误如"县住建局办公室主任（正科级）"——县住建局本身是正科级单位,
 * 其内设办公室负责人只能是股级(个别高配副科),绝不能与单位同级。
 * 本模块用规则库对生成文本做确定性校验:提示词里预防 + 生成后兜底修正。
 */

/** 一次职级违规。 */
export interface RankViolation {
  /** 规则 id。 */
  rule: string;
  /** 命中的原文(含括号级别)。 */
  matched: string;
  /** 修正后的文本。 */
  fixed: string;
  /** 违规原因说明。 */
  reason: string;
}

interface RankRule {
  id: string;
  pattern: RegExp;
  /** 正确级别(替换括号内级别)。 */
  correctLevel: string;
  reason: string;
}

/**
 * 职级规则表。正则均含 g 标志,可全文多次匹配。
 * 层级事实:
 *  - 县/区直局(住建局、财政局、教育局…) = 正科级单位:局长正科、副局长副科、
 *    内设科室(办公室/XX科)负责人股级(≤副科)。
 *  - 市直局 = 正处级单位:局长正处、副局长副处、内设科长/办公室主任正科。
 *  - 省直厅 = 正厅级单位:厅长正厅、副厅长副厅、内设处长/办公室主任正处。
 *  - 乡镇 = 正科级:乡长/镇长正科、副职副科。
 * 排除项:县委办/县政府办是独立的正科级部门,其办公室主任正科合法,
 * 故规则仅针对"X局/X厅"的内设机构("政府办公室主任""委办副主任"不匹配)。
 */
const RANK_RULES: RankRule[] = [
  {
    id: 'county-bureau-internal-office',
    pattern:
      /(县|区)([一-龥]{1,10}?局)((?:办公室(?:主任|副主任)|[一-龥]{1,8}科(?:科长|副科长)))[（(]\s*(正科级|副处级|正处级|副厅级|正厅级)\s*[）)]/g,
    correctLevel: '股级',
    reason: '县/区直局为正科级单位，其内设办公室或科室的负责人是股级，不能是正科及以上',
  },
  {
    id: 'county-bureau-deputy-chief',
    pattern:
      /(县|区)([一-龥]{1,10}?局)副局长[（(]\s*(正科级|正处级|正厅级)\s*[）)]/g,
    correctLevel: '副科级',
    reason: '县/区直局为正科级单位，副局长应为副科级',
  },
  {
    id: 'city-bureau-internal-office',
    pattern:
      /(市)([一-龥]{1,10}?局)((?:办公室(?:主任|副主任)|[一-龥]{1,8}科(?:科长|副科长)))[（(]\s*(正处级|副厅级|正厅级)\s*[）)]/g,
    correctLevel: '正科级',
    reason: '市直局为正处级单位，其内设科室负责人为正科级，不能是处级及以上',
  },
  {
    id: 'city-bureau-deputy-chief',
    pattern:
      /(市)([一-龥]{1,10}?局)副局长[（(]\s*(正处级|正厅级)\s*[）)]/g,
    correctLevel: '副处级',
    reason: '市直局为正处级单位，副局长应为副处级',
  },
  {
    id: 'province-dept-internal',
    pattern:
      /(省)([一-龥]{1,10}?厅)((?:办公室(?:主任|副主任)|[一-龥]{1,8}处(?:处长|副处长)))[（(]\s*(正厅级|副厅级)\s*[）)]/g,
    correctLevel: '正处级',
    reason: '省直厅为正厅级单位，其内设处室负责人为正处级，不能是厅级',
  },
  {
    id: 'province-dept-deputy',
    pattern:
      /(省)([一-龥]{1,10}?厅)副厅长[（(]\s*(正厅级)\s*[）)]/g,
    correctLevel: '副厅级',
    reason: '省直厅为正厅级单位，副厅长应为副厅级',
  },
  {
    id: 'township-chief',
    pattern: /(乡长|镇长)[（(]\s*(副科级|正股级|股级)\s*[）)]/g,
    correctLevel: '正科级',
    reason: '乡镇为正科级单位，乡长/镇长应为正科级',
  },
  {
    id: 'township-deputy',
    pattern: /(副乡长|副镇长)[（(]\s*(正科级)\s*[）)]/g,
    correctLevel: '副科级',
    reason: '乡镇副职应为副科级，不能是正科级',
  },
];

/** 校验文本中的职级事实,返回全部违规(不修改原文)。 */
export function validateRankFacts(text: string): RankViolation[] {
  const violations: RankViolation[] = [];
  for (const rule of RANK_RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      violations.push({
        rule: rule.id,
        matched: m[0],
        fixed: m[0].replace(/([（(]\s*)[^（()）]*(\s*[）)])/, `$1${rule.correctLevel}$2`),
        reason: rule.reason,
      });
    }
  }
  return violations;
}

/** 就地修正文本中的职级错误,返回修正后文本与修复清单。 */
export function fixRankFacts(text: string): { text: string; fixes: RankViolation[] } {
  let out = text;
  const fixes: RankViolation[] = [];
  for (const rule of RANK_RULES) {
    rule.pattern.lastIndex = 0;
    out = out.replace(rule.pattern, (matched) => {
      const fixed = matched.replace(/([（(]\s*)[^（()）]*(\s*[）)])/, `$1${rule.correctLevel}$2`);
      fixes.push({ rule: rule.id, matched, fixed, reason: rule.reason });
      return fixed;
    });
  }
  return { text: out, fixes };
}

/** 注入提示词的职级红线(增强版,含内设机构规则)。 */
export const RANK_REFERENCE_TEXT = `
【中国公务员职级-职务对照表 — 生成事件时必须严格遵守】

科员级：科员、办事员、试用期公务员
科级（乡科级正副职）：副科长、科长、股长、副乡长、乡长、副镇长、镇长
处级（县处级正副职）：副处长、处长、副县长、县长、副区长、区长、市直部门副局长/局长、省直机关处长/副处长
厅级（地厅级正副职）：副厅长、厅长、副市长、市长、省直部门局长/副局长

【单位级别与内设机构级别 — 最容易出错,务必牢记】
1. 县/区直局(如住建局、财政局、教育局、自然资源局) = 正科级单位:
   局长=正科级,副局长=副科级
   内设办公室/XX科的负责人(办公室主任、科长)= 股级,个别高配副科级,【绝对不能是正科级】
   反面例子:"县住建局办公室主任(正科级)" 是错的,正确是 "县住建局办公室主任(股级)"
2. 市直局 = 正处级单位:局长=正处级,副局长=副处级,内设科长/办公室主任=正科级
3. 省直厅 = 正厅级单位:厅长=正厅级,副厅长=副厅级,内设处长/办公室主任=正处级
4. 乡镇 = 正科级单位:乡长/镇长=正科级,副乡长/副镇长=副科级
5. 县委办/县政府办本身是正科级部门,其主任=正科级、副主任=副科级(这是单位正副职,不是内设机构)

【职级换算】
正处级 = 省厅处长 = 县长 = 市直局长 = 区长
副厅级 = 省厅副厅长 = 副市长 = 省直副局长
正科级 = 县直局长（小局）= 副乡镇长 = 市直副科长 = 乡镇长

【职级逻辑红线 — 绝对禁止】
1. 任何单位的内设机构负责人不得与本单位同级或更高(局长正科则科长必须股级)
2. 正处级不可能被"下放副县长"(副县长是副处,属于降职)
3. 副厅级竞争者不可能是"副局长"(省厅副局长是处级)
4. "下放基层锻炼"对处级干部通常指下县当县长/副县长,不是当科员
5. 跨部门调动职级必须对等或提升,不能明升暗降
6. 科级干部不可能分管全市财政/决策重大工程项目
7. 同一系统中上级必须是更高职级(如处长管科长)
`;
