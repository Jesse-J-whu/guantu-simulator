/** 晋升庆祝弹层。 */

import { useEffect } from 'react';
import type { PromotionRecord } from '../../engine/types.ts';

interface PromotionOverlayProps {
  promotion: PromotionRecord;
  onContinue: () => void;
  /** 晋升前后官职(如 "综合科科员/秘书" → "综合科副科长/副主任科员"),可选。 */
  positionFrom?: string;
  positionTo?: string;
}

const ICONS = ['🏛', '⭐', '🏆', '🎖️', '👑'];

export function PromotionOverlay({ promotion, onContinue, positionFrom, positionTo }: PromotionOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  const level = promotion.toRank.length; // 简单取图标
  return (
    <div className="promo-overlay active" data-testid="promo-overlay">
      <div className="promo-confetti">🎉 ✨ 🎊 ✨ 🎉 ✨ 🎊</div>
      <div className="promo-badge" id="promo-icon">
        {ICONS[Math.min(level, ICONS.length - 1)]}
      </div>
      <div className="promo-title">恭 喜 晋 升</div>
      <div className="promo-subtitle">{promotion.toRank}</div>
      <div className="promo-rank-from">
        {promotion.fromRank} <span className="arrow">→</span> {promotion.toRank}
      </div>
      {positionFrom && positionTo ? (
        <div className="promo-position" data-testid="promo-position">
          {positionFrom} <span className="arrow">→</span> {positionTo}
        </div>
      ) : null}
      <div className="promo-reason">
        {promotion.reason === 'choice' ? '因你在关键事件中的突出表现' : '因你年度考核成绩优秀'}
      </div>
      <button className="promo-continue-btn" onClick={onContinue} data-testid="promo-continue">
        继续仕途
      </button>
    </div>
  );
}
