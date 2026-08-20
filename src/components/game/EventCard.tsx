/** 事件卡片:类型标签 + 前情衔接 + 标题 + 描述 + 选项列表。 */

import { useEffect, useRef, useState } from 'react';
import type { Attrs, GameEvent } from '../../engine/types.ts';
import { AttrBars } from './AttrBars.tsx';

interface EventCardProps {
  event: GameEvent;
  year: number;
  attrs: Attrs;
  disabled: boolean;
  chosenIdx: number | null;
  onChoose: (idx: number) => void;
}

export function EventCard({ event, year, attrs, disabled, chosenIdx, onChoose }: EventCardProps) {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(raf);
  }, [event.id]);

  return (
    <div
      ref={cardRef}
      className={`event-card${visible ? ' event-visible' : ''}`}
      style={{ transition: 'all 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`event-tag ${event.tag}`}>{event.tagLabel}</span>
        <span className="event-year">{year} 年</span>
      </div>
      {event.continuity ? <div className="event-continuity">↩ 前情:{event.continuity}</div> : null}
      <h2 className="event-title">{event.title}</h2>
      <p className="event-desc">{event.desc}</p>
      {event.hint ? <div className="hint-box">{event.hint}</div> : null}
      <div className="choices-list">
        {event.choices.map((c, i) => (
          <button
            key={i}
            className={`choice-btn${chosenIdx === i ? ' chosen' : ''}${disabled && chosenIdx !== i ? ' dimmed' : ''}`}
            disabled={disabled}
            data-testid={`choice-${i}`}
            onClick={() => onChoose(i)}
          >
            <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
            <span className="choice-text">
              {c.text}
              {c.hint ? <span className="choice-hint">{c.hint}</span> : null}
            </span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="attrs-panel">
          <div className="attrs-title">当前属性</div>
          <div className="attrs-grid" data-testid="current-attrs">
            <AttrBars attrs={attrs} />
          </div>
        </div>
      </div>
    </div>
  );
}
