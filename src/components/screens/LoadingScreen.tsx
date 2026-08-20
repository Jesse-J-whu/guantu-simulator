/** 加载屏:天机推演动画。 */

interface LoadingScreenProps {
  text: string;
  subtext: string;
}

const ROTATING_MESSAGES = [
  '朝中有人正在议事...',
  '新的机遇正在酝酿...',
  '组织正在考察你的表现...',
  '官场暗流涌动...',
  '命运的天平正在倾斜...',
  '有人正在提起你的名字...',
  '一封密函正在路上...',
  '风声渐紧，局势未明...',
];

export function LoadingScreen({ text, subtext }: LoadingScreenProps) {
  return (
    <div id="screen-loading" className="screen">
      <div className="loading-orb" />
      <div className="loading-text">{text}</div>
      <div className="loading-subtext">{subtext || ROTATING_MESSAGES[Date.now() % ROTATING_MESSAGES.length]}</div>
    </div>
  );
}
