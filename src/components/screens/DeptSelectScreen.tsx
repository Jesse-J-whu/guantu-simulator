/** 部门选择屏:星级卡片(用户校准数值)+ 难度 + 开始。 */

import { useState } from 'react';
import { DEPARTMENTS } from '../../engine/departments.ts';
import type { Difficulty } from '../../engine/types.ts';
import { StarRating } from '../common/StarRating.tsx';

interface DeptSelectScreenProps {
  selectedDeptId: string | null;
  onSelectDept: (id: string | null) => void;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onStart: () => void;
}

const DIFFICULTIES: Array<{ id: Difficulty; name: string; desc: string }> = [
  { id: 'easy', name: '轻松', desc: '故事向，风险低<br>适合初次体验' },
  { id: 'normal', name: '标准', desc: '官场常态<br>平衡的挑战' },
  { id: 'hard', name: '硬核', desc: '高风险高回报<br>命悬一线' },
];

export function DeptSelectScreen({
  selectedDeptId,
  onSelectDept,
  difficulty,
  onDifficultyChange,
  onStart,
}: DeptSelectScreenProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div id="screen-select" className="screen">
      <header className="site-header">
        <div className="logo-badge">GUANTU SIMULATOR · 官场沉浸体验</div>
        <h1 className="site-title">官途模拟器</h1>
        <p className="site-subtitle">以真实案例为鉴，体验每一次抉择的重量</p>
        <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>v3.0 · AI事件引擎 · React</div>
        <div style={{ marginTop: 16 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '7px 18px' }}
            onClick={() => setShowHelp(true)}
          >
            📖 玩法说明
          </button>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 40, paddingBottom: 40, flex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 className="section-title">选择你的起点</h2>
          <p className="section-subtitle">每个部门都是一条不同的命运之路，请审慎抉择</p>
        </div>

        <div className="dept-grid" id="dept-grid">
          {DEPARTMENTS.map((d) => (
            <div
              key={d.id}
              className={`dept-card${selectedDeptId === d.id ? ' selected' : ''}`}
              data-id={d.id}
              onClick={() => onSelectDept(d.id)}
            >
              <div className="dept-card-header">
                <span className="dept-name">
                  {d.name}
                  {d.recommended ? <span className="dept-recommended">推荐新手</span> : null}
                </span>
                <span className="dept-icon">{d.icon}</span>
              </div>
              <p className="dept-desc">{d.desc}</p>
              <div className="dept-ratings">
                <StarRating label="权力" value={d.ratings.power} />
                <StarRating label="繁忙" value={d.ratings.busy} />
                <StarRating label="晋升" value={d.ratings.promotion} />
                <StarRating label="风险" value={d.ratings.risk} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <h2 className="section-title">选择难度</h2>
          <p className="section-subtitle">难度影响事件触发概率与风险权重</p>
          <div className="difficulty-group" id="diff-group">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className={`diff-btn${difficulty === d.id ? ' active' : ''}`}
                data-diff={d.id}
                onClick={() => onDifficultyChange(d.id)}
              >
                <div className="diff-name">{d.name}</div>
                <div className="diff-desc" dangerouslySetInnerHTML={{ __html: d.desc }} />
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary" id="btn-start" disabled={!selectedDeptId} onClick={onStart}>
          踏入官场
        </button>
      </main>

      <footer className="site-footer">
        <p>
          本游戏内容纯属虚构，以真实官场案例为参考背景
          <br />
          所有剧情均为文学创作，不代表现实任何机构或个人
        </p>
      </footer>

      {showHelp ? <HowToPlayModal onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const items = [
    {
      num: '1',
      title: '选择部门',
      text: '从13个部门中选择你的起点。每个部门有不同的权力、繁忙、晋升与风险。',
    },
    { num: '2', title: '生成背景', text: 'AI 会为你生成专属的官途起源故事，包括学历、任职单位和初始人物设定。' },
    {
      num: '3',
      title: '做出抉择',
      text: '每次选择都会影响属性（政治嗅觉、执行力、人脉、廉洁度），并积累晋升绩效点。年度考核达标即晋升！',
    },
    { num: '4', title: '迎接结局', text: '光荣退休、处分落马、调任闲职…你的每一次选择都在书写属于你的官途。' },
    {
      num: '★',
      title: '小提示',
      text: '晋升进度条攒满并通过年度考核即可升职；廉洁度过低会被暂缓提拔甚至落马。',
    },
  ];
  return (
    <div className="modal-overlay" id="modal-howtoplay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2 className="modal-title">📖 如何游玩</h2>
        {items.map((it) => (
          <div className="how-to-item" key={it.num}>
            <div className="how-to-num">{it.num}</div>
            <div className="how-to-text">
              <strong style={{ color: 'var(--text-primary)' }}>{it.title}</strong>
              <br />
              {it.text}
            </div>
          </div>
        ))}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn-primary" style={{ maxWidth: 200, margin: '0 auto' }} onClick={onClose}>
            开始游玩
          </button>
        </div>
      </div>
    </div>
  );
}
