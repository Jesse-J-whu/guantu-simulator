/** 游戏主屏:HUD + 事件卡 + 反馈弹层 + 晋升庆祝 + 错误重试。 */

import { useState } from 'react';
import type { ChoiceEffect, GameState, PromotionRecord } from '../../engine/types.ts';
import { rankPositionOf } from '../../engine/departments.ts';
import { HUD } from '../game/HUD.tsx';
import { EventCard } from '../game/EventCard.tsx';
import { AttrChangeToast } from '../game/AttrChangeToast.tsx';
import { PromotionOverlay } from '../game/PromotionOverlay.tsx';

interface GameScreenProps {
  state: GameState;
  error: string | null;
  toast: { effects: ChoiceEffect; pointsGained: number } | null;
  onDismissToast: () => void;
  lastPromotion: PromotionRecord | null;
  onPromotionContinue: () => void;
  onChoose: (idx: number) => void;
  onRetry: () => void;
}

export function GameScreen({
  state,
  error,
  toast,
  onDismissToast,
  lastPromotion,
  onPromotionContinue,
  onChoose,
  onRetry,
}: GameScreenProps) {
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const event = state.currentEvent;
  const rankName = state.dept.ranks[Math.min(state.rank, state.dept.ranks.length - 1)];
  const positionLabel = `${rankName} · ${rankPositionOf(state.dept, state.rank)}`;

  const handleChoose = (idx: number) => {
    setChosenIdx(idx);
    onChoose(idx);
    setTimeout(() => setChosenIdx(null), 1000);
  };

  return (
    <div id="screen-game" className="screen">
      <HUD state={state} />
      <div className="container">
        <div id="event-container">
          {error ? (
            <div className="event-card" style={{ textAlign: 'center', padding: '40px 24px' }} data-testid="error-card">
              <div style={{ fontSize: '2rem', marginBottom: 16 }}>⚠</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: 10 }}>
                AI 推演暂时中断
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 24 }}>
                {error.slice(0, 120)}
              </div>
              <button className="btn-primary" style={{ maxWidth: 200 }} onClick={onRetry} data-testid="retry-btn">
                重新推演
              </button>
            </div>
          ) : event ? (
            <EventCard
              event={event}
              year={state.year}
              attrs={state.attrs}
              disabled={chosenIdx !== null}
              chosenIdx={chosenIdx}
              onChoose={handleChoose}
              positionLabel={positionLabel}
            />
          ) : null}
        </div>
      </div>

      {toast ? (
        <AttrChangeToast effects={toast.effects} pointsGained={toast.pointsGained} onDismiss={onDismissToast} />
      ) : null}
      {lastPromotion && toast === null ? (
        <PromotionOverlay
          promotion={lastPromotion}
          onContinue={onPromotionContinue}
          positionFrom={state.dept.rankPositions[lastPromotion.fromRank] || lastPromotion.fromRank}
          positionTo={state.dept.rankPositions[lastPromotion.toRank] || lastPromotion.toRank}
        />
      ) : null}
    </div>
  );
}
