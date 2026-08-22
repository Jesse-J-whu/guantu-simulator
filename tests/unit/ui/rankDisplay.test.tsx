// @vitest-environment jsdom
/**
 * 官职/职级展示组件测试(诉求:每年的界面显示当前官职与职级)。
 * 覆盖:HUD(职级+官职两项)、事件卡官职徽标、晋升庆祝官职变迁、结算屏终局官职。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HUD } from '../../../src/components/game/HUD.tsx';
import { EventCard } from '../../../src/components/game/EventCard.tsx';
import { PromotionOverlay } from '../../../src/components/game/PromotionOverlay.tsx';
import { ResultScreen } from '../../../src/components/screens/ResultScreen.tsx';
import { createGame } from '../../../src/engine/gameEngine.ts';
import { getDeptById, rankPositionOf } from '../../../src/engine/departments.ts';
import type { GameEvent, GameState, PromotionRecord } from '../../../src/engine/types.ts';

afterEach(cleanup);

/** 造一个最小可渲染事件。 */
function fakeEvent(): GameEvent {
  return {
    id: 'e1',
    tag: 'daily',
    tagLabel: '日常政务',
    title: '急件连夜核改报送',
    desc: '一份急件摆在案头。',
    hint: '急件不急,口径事大',
    continuity: '',
    npcs: [],
    choices: [
      { text: '逐项核对台账后再报', hint: '稳妥但费工', effect: { politics: 3, execute: 3, network: 1, integrity: 3, promotion: 0 } },
      { text: '按惯例请示后再定', hint: '程序优先', effect: { politics: 2, execute: 2, network: 0, integrity: 2, promotion: 0 } },
      { text: '找老科长打听底细', hint: '经营关系', effect: { politics: 2, execute: 0, network: 4, integrity: -2, promotion: 0 } },
      { text: '先放一放明天再说', hint: '省事但有代价', effect: { politics: -3, execute: -2, network: -3, integrity: -3, promotion: 0 } },
    ],
    aiGenerated: false,
    repairs: [],
  };
}

function stateWith(rank = 0): GameState {
  const s = createGame('weiban', 'normal');
  s.rank = rank;
  s.background = {
    level: '省级',
    origin: '省考招录',
    background: '普通家庭',
    openingText: '你报到入职。',
    rankTitle: '综合科科员',
  };
  return s;
}

describe('HUD:当前职级 + 当前官职', () => {
  it('开局显示 科员 / 综合科科员·秘书', () => {
    render(<HUD state={stateWith(0)} />);
    const rank = document.getElementById('hud-rank');
    const position = document.getElementById('hud-position');
    expect(rank?.textContent).toBe('科员');
    expect(position?.textContent).toBe('综合科科员/秘书');
  });

  it('晋升后官职随职级更新', () => {
    render(<HUD state={stateWith(1)} />);
    expect(document.getElementById('hud-rank')?.textContent).toBe('副科级');
    expect(document.getElementById('hud-position')?.textContent).toBe('综合科副科长/副主任科员');
  });
});

describe('EventCard:每年界面的官职徽标', () => {
  it('传入 positionLabel 时渲染徽标', () => {
    render(
      <EventCard
        event={fakeEvent()}
        year={2016}
        attrs={{ politics: 50, execute: 50, network: 50, integrity: 80 }}
        disabled={false}
        chosenIdx={null}
        onChoose={() => {}}
        positionLabel="科员 · 综合科科员/秘书"
      />,
    );
    const badge = screen.getByTestId('event-position');
    expect(badge.textContent).toBe('科员 · 综合科科员/秘书');
  });

  it('未传 positionLabel 时不渲染徽标(向后兼容)', () => {
    render(
      <EventCard
        event={fakeEvent()}
        year={2016}
        attrs={{ politics: 50, execute: 50, network: 50, integrity: 80 }}
        disabled={false}
        chosenIdx={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.queryByTestId('event-position')).toBeNull();
  });
});

describe('PromotionOverlay:官职变迁行', () => {
  const promo: PromotionRecord = {
    step: 3,
    year: 2018,
    fromRank: '科员',
    toRank: '副科级',
    reason: 'year-review',
  };

  it('传入官职前后值时显示变迁', () => {
    render(
      <PromotionOverlay
        promotion={promo}
        onContinue={() => {}}
        positionFrom="综合科科员/秘书"
        positionTo="综合科副科长/副主任科员"
      />,
    );
    const line = screen.getByTestId('promo-position');
    expect(line.textContent).toContain('综合科科员/秘书');
    expect(line.textContent).toContain('综合科副科长/副主任科员');
  });

  it('未传时不显示官职行(向后兼容)', () => {
    render(<PromotionOverlay promotion={promo} onContinue={() => {}} />);
    expect(screen.queryByTestId('promo-position')).toBeNull();
  });
});

describe('ResultScreen:终局官职', () => {
  it('结算统计里显示最终官职', () => {
    const state = stateWith(2);
    const ending = {
      endingType: 'GOOD',
      endingTitle: '稳健良好',
      endingIcon: '🏛',
      endingSummary: '一步一个脚印。',
      evalText: '评语。',
      finalRank: '正科级',
    } as const;
    render(<ResultScreen state={state} ending={ending} onRestart={() => {}} />);
    const pos = screen.getByTestId('final-position');
    expect(pos.textContent).toBe(`官职 ${rankPositionOf(getDeptById('weiban'), 2)}`);
    expect(pos.textContent).toContain('综合科科长/秘书科科长');
  });
});
