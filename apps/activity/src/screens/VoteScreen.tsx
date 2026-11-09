import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerCard } from '../components/PlayerCard';
import { TimerPill } from '../components/TimerPill';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';

export function VoteScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);
  const [selection, setSelection] = useState<string | null>(null);

  if (!state || !auth) return null;

  const meId = auth.user.id;
  const locked = Boolean(state.myVote);
  const selectedId = locked ? state.myVote : selection;

  const confirm = () => {
    if (!selectedId || locked) return;
    getSocket()?.emit('game:vote', { targetId: selectedId });
  };

  return (
    <section className="screen vote">
      <div className="screen__heading">
        <div>
          <span className="eyebrow">{t('common.round', { round: state.round, total: state.totalRounds })}</span>
          <h1>{t('vote.title')}</h1>
          <p>{t('vote.subtitle')}</p>
        </div>
        <TimerPill deadlineAt={state.deadlineAt} />
      </div>

      <div className="player-grid player-grid--vote">
        {state.players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            isYou={player.id === meId}
            selected={selectedId === player.id}
            disabled={locked || player.id === meId}
            onSelect={setSelection}
            showVoteState
            showScore
          />
        ))}
      </div>

      <div className="vote__actions">
        {locked ? (
          <p className="waiting-note">{t('vote.waiting')}</p>
        ) : (
          <>
            <p className="field__hint">{t('vote.self')}</p>
            <button
              type="button"
              className="button button--primary"
              onClick={confirm}
              disabled={!selectedId}
            >
              {t('vote.confirm')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
