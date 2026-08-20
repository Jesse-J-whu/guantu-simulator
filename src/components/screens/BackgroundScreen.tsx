/** 开局背景屏:打字机开场白 + 初始属性。 */

import { useEffect, useState } from 'react';
import type { GameState } from '../../engine/types.ts';
import { AttrBars } from '../game/AttrBars.tsx';

interface BackgroundScreenProps {
  state: GameState;
  onBegin: () => void;
}

export function BackgroundScreen({ state, onBegin }: BackgroundScreenProps) {
  const bg = state.background;
  const [shownLength, setShownLength] = useState(0);
  const [typing, setTyping] = useState(true);
  const text = bg?.openingText ?? '';

  useEffect(() => {
    setShownLength(0);
    setTyping(true);
    const timer = setInterval(() => {
      setShownLength((len) => {
        if (len >= text.length) {
          clearInterval(timer);
          setTyping(false);
          return len;
        }
        return len + 1;
      });
    }, 18);
    return () => clearInterval(timer);
  }, [text]);

  if (!bg) return null;
  const fullText = bg.openingText;
  const done = shownLength >= fullText.length;

  return (
    <div id="screen-background" className="screen">
      <div className="container">
        <div className="story-card">
          <div className="story-meta">
            <span className="story-badge highlight">
              {state.dept.icon} {state.dept.name}
            </span>
            <span className="story-badge">📍 {bg.level}</span>
            <span className="story-badge">🎓 {bg.origin}</span>
            <span className="story-badge">👤 {bg.background}</span>
            <span className="story-badge">💼 {bg.rankTitle}</span>
          </div>
          <div className="story-text">
            {fullText.slice(0, shownLength)}
            {typing ? <span className="typing-cursor" /> : null}
          </div>
          {!done ? (
            <button
              className="skip-btn"
              onClick={() => {
                setShownLength(fullText.length);
                setTyping(false);
              }}
            >
              跳过动画 →
            </button>
          ) : null}
        </div>

        <div className="attrs-panel" style={{ maxWidth: 720, margin: '24px auto 0' }}>
          <div className="attrs-title">初始属性 · INITIAL ATTRIBUTES</div>
          <div className="attrs-grid">
            <AttrBars attrs={state.attrs} />
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button className="btn-primary" style={{ maxWidth: 280 }} onClick={onBegin}>
            开始你的官途
          </button>
        </div>
      </div>
    </div>
  );
}
