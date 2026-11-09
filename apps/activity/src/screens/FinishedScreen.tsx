import { formatList } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import { ScoreList } from '../components/ScoreList';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';

export function FinishedScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);
  const uiLocale = useGameStore((store) => store.uiLocale);

  if (!state || !auth) return null;

  const isHost = state.hostId === auth.user.id;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((player) => player.score === topScore);
  const winnerIds = winners.map((player) => player.id);
  const names = formatList(
    winners.map((player) => player.name),
    uiLocale,
  );

  const headline =
    topScore === 0 || winners.length === state.players.length
      ? t('finished.tie')
      : winners.length === 1
        ? t('finished.winner', { name: names })
        : t('finished.winners', { names });

  return (
    <section className="screen finished">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, index) => (
          <span key={index} className={`confetti__piece confetti__piece--${index % 5}`} />
        ))}
      </div>

      <div className="finished__hero">
        <span className="finished__trophy" aria-hidden="true">
          🏆
        </span>
        <span className="eyebrow">{t('finished.title')}</span>
        <h1>{headline}</h1>
      </div>

      <div className="panel">
        <h2 className="panel__title">{t('finished.finalScores')}</h2>
        <ScoreList players={state.players} winnerIds={winnerIds} meId={auth.user.id} />
      </div>

      <footer className="finished__footer">
        {isHost ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => getSocket()?.emit('game:rematch')}
          >
            {t('finished.playAgain')}
          </button>
        ) : (
          <p className="waiting-note">{t('finished.waiting')}</p>
        )}
      </footer>
    </section>
  );
}
