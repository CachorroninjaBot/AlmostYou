import { pickLocalized } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Avatar } from '../components/Avatar';
import { ScoreList } from '../components/ScoreList';
import { TimerPill } from '../components/TimerPill';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';
import { useNow } from '../lib/useNow';

export function ResultScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);
  const offset = useGameStore((store) => store.serverOffset);
  const now = useNow(500);

  if (!state || !auth) return null;

  const summary = state.lastSummary;
  if (!summary) {
    return (
      <section className="screen result">
        <p className="waiting-note">{t('common.waiting')}</p>
      </section>
    );
  }

  const isHost = state.hostId === auth.user.id;
  const finalRound = state.round >= state.totalRounds;
  const bannerKey = !summary.caught
    ? 'result.almostWon'
    : summary.correctGuess
      ? 'result.guessed'
      : 'result.caught';
  const majorityLabel = pickLocalized(summary.majorityScene.labels, state.contentLocale);
  const almostLabel = pickLocalized(summary.almostScene.labels, state.contentLocale);
  const autoSeconds = state.deadlineAt
    ? Math.max(0, Math.ceil((state.deadlineAt - (now + offset)) / 1000))
    : null;

  const voteRows = state.players
    .map((player) => ({ player, count: summary.voteCounts[player.id] ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <section className="screen result">
      <div className={clsx('result-banner', summary.almostWon ? 'result-banner--lost' : 'result-banner--won')}>
        <span className="result-banner__emoji" aria-hidden="true">
          {summary.almostWon ? '🎭' : '🎟️'}
        </span>
        <div>
          <h1>{t(bannerKey)}</h1>
          <p>{t('result.scene')}: {`${summary.majorityScene.emoji} ${majorityLabel}`}</p>
        </div>
      </div>

      <div className="result__facts">
        <div className="fact">
          <span className="fact__label">{t('result.almost')}</span>
          <strong>{summary.almostName}</strong>
        </div>
        <div className="fact">
          <span className="fact__label">{t('result.almostScene')}</span>
          <strong>{`${summary.almostScene.emoji} ${almostLabel}`}</strong>
        </div>
        {summary.caught && (
          <div className="fact">
            <span className="fact__label">{t('result.guess')}</span>
            <strong>{t(summary.correctGuess ? 'result.rightGuess' : 'result.wrongGuess')}</strong>
          </div>
        )}
        <div className="fact">
          <span className="fact__label">{t('common.round', { round: state.round, total: state.totalRounds })}</span>
          <strong>{finalRound ? t('result.finalRound') : t('result.next')}</strong>
        </div>
      </div>

      <div className="result__grid">
        <div className="panel">
          <h2 className="panel__title">{t('result.roundScores')}</h2>
          <ScoreList
            players={state.players}
            deltas={summary.roundScores}
            winnerIds={summary.winnerIds}
            meId={auth.user.id}
          />
        </div>

        <div className="panel">
          <h2 className="panel__title">{t('result.votes')}</h2>
          {voteRows.length === 0 ? (
            <p className="waiting-note">{t('result.noVotes')}</p>
          ) : (
            <ul className="vote-tally">
              {voteRows.map(({ player, count }) => (
                <li key={player.id} className="vote-tally__row">
                  <Avatar
                    name={player.name}
                    avatarUrl={player.avatarUrl}
                    color={player.color}
                    size="sm"
                  />
                  <span>{player.name}</span>
                  <strong>{t('common.votes', { count })}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="result__footer">
        <TimerPill deadlineAt={state.deadlineAt} />
        {isHost ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => getSocket()?.emit('game:next-round')}
          >
            {finalRound ? t('result.finalRound') : t('result.next')}
          </button>
        ) : (
          autoSeconds !== null && (
            <p className="waiting-note">{t('result.autoNext', { seconds: autoSeconds })}</p>
          )
        )}
      </footer>
    </section>
  );
}
