/** 属性变化浮动反馈:每次选择后弹出,含政绩点变化。 */

import { useEffect } from 'react';
import type { ChoiceEffect } from '../../engine/types.ts';

interface AttrChangeToastProps {
  effects: ChoiceEffect;
  pointsGained: number;
  onDismiss: () => void;
}

const LABELS: Record<string, string> = {
  politics: '政治嗅觉',
  execute: '执行力',
  network: '人脉资源',
  integrity: '廉洁度',
};

export function AttrChangeToast({ effects, pointsGained, onDismiss }: AttrChangeToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2800);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const rows = (Object.keys(LABELS) as Array<keyof ChoiceEffect>)
    .filter((k) => effects[k] !== 0)
    .map((k) => {
      const v = effects[k];
      return (
        <div className="attr-change-row" key={k}>
          <span className="attr-change-label">{LABELS[k]}</span>
          <span className={`attr-change-val ${v > 0 ? 'pos' : 'neg'}`}>
            {v > 0 ? `+${v}` : v}
          </span>
        </div>
      );
    });

  return (
    <div className="attr-change-popup visible" data-testid="attr-toast">
      <div className="attr-change-title">属性变化</div>
      {rows.length > 0 ? rows : <div className="attr-change-row"><span className="attr-change-label">本次无变化</span></div>}
      <div className="attr-change-row">
        <span className="attr-change-label" style={{ color: 'var(--gold)' }}>
          政绩点
        </span>
        <span className="attr-change-val pos" style={{ color: 'var(--gold)' }}>
          +{pointsGained}
        </span>
      </div>
    </div>
  );
}
