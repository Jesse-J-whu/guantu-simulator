/** 游戏 HUD:职级/官职/部门/年份/进度 + 晋升绩效进度条。 */

import type { GameState } from '../../engine/types.ts';
import { promotionProgress, promotionCost } from '../../engine/promotion.ts';
import { rankPositionOf } from '../../engine/departments.ts';

interface HUDProps {
  state: GameState;
}

export function HUD({ state }: HUDProps) {
  const rank = state.dept.ranks[Math.min(state.rank, state.dept.ranks.length - 1)];
  const position = rankPositionOf(state.dept, state.rank);
  const progress = promotionProgress(state);
  const cost = promotionCost(state);
  const atTop = !isFinite(cost);

  return (
    <div className="game-topbar">
      <div className="game-info">
        <div className="info-item">
          <span className="info-label">当前职级</span>
          <span className="info-value" id="hud-rank">
            {rank}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">当前官职</span>
          <span className="info-value info-value-position" id="hud-position" title={position}>
            {position}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">所在部门</span>
          <span className="info-value" id="hud-dept">
            {state.dept.name.split('（')[0]}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">游戏年份</span>
          <span className="info-value" id="hud-year">
            {state.year} 年
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">政绩点</span>
          <span className="info-value" id="hud-points">
            {state.promotionPoints}
          </span>
        </div>
      </div>
      <div className="progress-bar-wrap">
        <span id="hud-step">
          第 {state.step} 年 / 共 {state.maxSteps} 年
        </span>
        <div className="progress-bar">
          <div className="progress-fill" id="hud-progress" style={{ width: `${(state.step / state.maxSteps) * 100}%` }} />
        </div>
        <div className="promo-progress-wrap" title="晋升进度:年度考核时攒满即可晋升">
          <span className="promo-progress-label">{atTop ? '⭐ 已到顶' : '晋升进度'}</span>
          <div className="promo-progress-bar">
            <div className="promo-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          {!atTop ? (
            <span className="promo-progress-text">
              {state.promotionPoints}/{cost}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
