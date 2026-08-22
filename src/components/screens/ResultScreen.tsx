/** 结局屏:结局卡 + 最终属性 + 官途时间线(完整轨迹) + 评语 + 分享。 */

import { useState } from 'react';
import type { Ending, GameState } from '../../engine/types.ts';
import { rankPositionOf } from '../../engine/departments.ts';
import { AttrBars } from '../game/AttrBars.tsx';

interface ResultScreenProps {
  state: GameState;
  ending: Ending;
  onRestart: () => void;
}

export function ResultScreen({ state, ending, onRestart }: ResultScreenProps) {
  const [toastMsg, setToastMsg] = useState('');

  const share = async () => {
    const text = `我在【官途模拟器】走了一遍官场，结局是：${ending.endingTitle}\n部门：${state.dept.name}\n你也来试试？`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '官途模拟器', text });
        return;
      } catch {
        /* 用户取消 */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setToastMsg('已复制到剪贴板');
    } catch {
      setToastMsg('复制失败，请手动复制');
    }
    setTimeout(() => setToastMsg(''), 2500);
  };

  const copy = async () => {
    const lastLine = ending.evalText.split('\n').slice(-1)[0];
    try {
      await navigator.clipboard.writeText(`【官途模拟器结局】\n${ending.endingTitle}\n\n${lastLine}`);
      setToastMsg('结局文字已复制');
    } catch {
      setToastMsg('请手动复制');
    }
    setTimeout(() => setToastMsg(''), 2500);
  };

  const typeClass =
    ending.endingType === 'GREAT'
      ? 'ending-great'
      : ending.endingType === 'BAD'
        ? 'ending-bad'
        : 'ending-mid';

  return (
    <div id="screen-result" className="screen">
      <div className="container">
        <div className={`result-hero ${typeClass}`}>
          <div className={`result-emblem ${typeClass}`}>{ending.endingIcon}</div>
          <div className="result-type">{ending.endingType === 'GREAT' ? '★ 官途圆满 ★' : ending.endingType === 'BAD' ? '▲ 落马结局 ▲' : '— 官途终章 —'}</div>
          <h2 className={`result-title ${typeClass}`}>{ending.endingTitle}</h2>
          <p className="result-summary">{ending.endingSummary}</p>
          <div className="result-stats">
            <span>晋升 {state.promotions.length} 次</span>
            <span>走过 {state.maxSteps} 年</span>
            <span>终职 {ending.finalRank}</span>
            <span data-testid="final-position">官职 {rankPositionOf(state.dept, state.rank)}</span>
          </div>
        </div>

        <div className="attrs-panel">
          <div className="attrs-title">最终属性 · FINAL ATTRIBUTES</div>
          <div className="attrs-grid">
            <AttrBars attrs={state.attrs} />
          </div>
        </div>

        <div className="timeline-section">
          <h2 className="section-title" style={{ marginBottom: 24 }}>
            官途时间线 · 共 {state.timeline.length} 步
          </h2>
          <div className="timeline" id="result-timeline">
            {state.timeline.map((t) => (
              <div className="timeline-item" key={t.step}>
                <div className="timeline-year">
                  {t.year} 年{t.promoted ? ' 🎉晋升' : ''}
                </div>
                <div className="timeline-event">
                  {t.title} — 选择：{t.choice}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="final-eval">
          <div className="eval-label">官途评语 · CAREER ASSESSMENT</div>
          <div className="eval-text">{ending.evalText}</div>
        </div>

        <div className="share-row">
          <button className="btn-share" onClick={() => void share()}>
            📤 分享我的结局
          </button>
          <button className="btn-share" onClick={() => void copy()}>
            📋 复制结局文字
          </button>
        </div>

        <div className="restart-section">
          <button className="btn-primary" style={{ display: 'inline-block', maxWidth: 280 }} onClick={onRestart}>
            重走一次官途
          </button>
        </div>
      </div>

      <footer className="site-footer">
        <p>
          本游戏内容纯属虚构，以真实官场案例为参考背景
          <br />
          所有剧情均为文学创作，不代表现实任何机构或个人
        </p>
      </footer>

      {toastMsg ? <div className="toast show">{toastMsg}</div> : null}
    </div>
  );
}
