import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, getDeptById } from '../../src/engine/departments.ts';

/** 用户校准的星级表(2026-08):部门 → [权力, 繁忙, 晋升, 风险]。 */
const EXPECTED_RATINGS: Record<string, [number, number, number, number]> = {
  weiban: [5, 5, 5, 3],
  fuban: [4, 5, 4, 2],
  zuzhiB: [5, 4, 5, 4],
  jiwei: [5, 5, 5, 3],
  fagaB: [4, 4, 4, 4],
  caizhi: [4, 4, 3, 4],
  xuanchuanB: [3, 4, 3, 3],
  tongzhan: [2, 2, 2, 2],
  zhengfaB: [3, 3, 4, 4],
  jiaoyu: [2, 4, 2, 3],
  keji: [2, 3, 3, 2],
  zhengxie: [2, 2, 2, 1],
  renda: [2, 2, 2, 1],
};

describe('部门星级表(用户校准值)', () => {
  it('共 13 个部门且星级逐项精确匹配', () => {
    expect(DEPARTMENTS).toHaveLength(13);
    for (const dept of DEPARTMENTS) {
      const expected = EXPECTED_RATINGS[dept.id];
      expect(expected, `缺少部门 ${dept.id}`).toBeDefined();
      const [power, busy, promotion, risk] = expected;
      expect(dept.ratings, dept.id).toEqual({ power, busy, promotion, risk });
    }
  });

  it('所有星级在 1-5 范围内', () => {
    for (const dept of DEPARTMENTS) {
      for (const [key, v] of Object.entries(dept.ratings)) {
        expect(v, `${dept.id}.${key}`).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  it('每个部门有完整职级阶梯与职务对照', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.ranks.length, dept.id).toBeGreaterThanOrEqual(3);
      for (const r of dept.ranks) {
        expect(dept.rankPositions[r], `${dept.id}:${r} 职务缺失`).toBeTruthy();
        expect(dept.rankScope[r], `${dept.id}:${r} 职责缺失`).toBeTruthy();
      }
    }
  });

  it('getDeptById 未知 id 抛错', () => {
    expect(() => getDeptById('nonexistent')).toThrow();
  });
});
