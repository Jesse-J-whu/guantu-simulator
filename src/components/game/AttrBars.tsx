/** 四维属性条。 */

import type { Attrs } from '../../engine/types.ts';

const DEFS = [
  { key: 'politics', label: '政治嗅觉', cls: 'politics' },
  { key: 'execute', label: '执行力', cls: 'execute' },
  { key: 'network', label: '人脉资源', cls: 'network' },
  { key: 'integrity', label: '廉洁度', cls: 'integrity' },
] as const;

interface AttrBarsProps {
  attrs: Attrs;
  /** 与上一帧的差值,用于闪光动画。 */
  deltas?: Partial<Attrs>;
}

export function AttrBars({ attrs, deltas }: AttrBarsProps) {
  return (
    <>
      {DEFS.map((d) => {
        const value = attrs[d.key];
        const delta = deltas?.[d.key] ?? 0;
        return (
          <div key={d.key} className={`attr-item${delta !== 0 ? ' attr-changed' : ''}`}>
            <div className="attr-label">
              <span>{d.label}</span>
              <span className="attr-value-text" style={{ color: 'var(--gold)' }}>
                {value}
                {delta !== 0 ? (
                  <em className={`attr-delta ${delta > 0 ? 'pos' : 'neg'}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </em>
                ) : null}
              </span>
            </div>
            <div className="attr-bar">
              <div className={`attr-fill ${d.cls}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        );
      })}
    </>
  );
}
