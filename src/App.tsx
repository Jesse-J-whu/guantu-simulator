/** 应用根组件:屏幕流转。 */

import { useGame } from './hooks/useGame.ts';
import { DeptSelectScreen } from './components/screens/DeptSelectScreen.tsx';
import { LoadingScreen } from './components/screens/LoadingScreen.tsx';
import { BackgroundScreen } from './components/screens/BackgroundScreen.tsx';
import { GameScreen } from './components/screens/GameScreen.tsx';
import { ResultScreen } from './components/screens/ResultScreen.tsx';

export default function App() {
  const game = useGame();

  return (
    <div id="app">
      {game.screen === 'select' ? (
        <DeptSelectScreen
          selectedDeptId={game.selectedDeptId}
          onSelectDept={game.selectDept}
          difficulty={game.difficulty}
          onDifficultyChange={game.setDifficulty}
          onStart={() => void game.startGame()}
        />
      ) : null}

      {game.screen === 'loading' ? (
        <LoadingScreen text={game.loadingText} subtext={game.loadingSubtext} />
      ) : null}

      {game.screen === 'background' && game.state ? (
        <BackgroundScreen state={game.state} onBegin={() => void game.beginGame()} />
      ) : null}

      {game.screen === 'game' && game.state ? (
        <GameScreen
          state={game.state}
          error={game.error}
          toast={game.feedback}
          onDismissToast={game.dismissFeedback}
          lastPromotion={game.lastPromotion}
          onPromotionContinue={game.continueAfterPromotion}
          onChoose={(idx) => void game.choose(idx)}
          onRetry={() => void game.retryEvent()}
        />
      ) : null}

      {game.screen === 'result' && game.state && game.ending ? (
        <ResultScreen state={game.state} ending={game.ending} onRestart={game.restart} />
      ) : null}
    </div>
  );
}
