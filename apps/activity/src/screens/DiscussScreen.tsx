import { pickLocalized } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Avatar } from '../components/Avatar';
import { TimerPill } from '../components/TimerPill';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';

export function DiscussScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);

  if (!state || !auth) return null;

  const meId = auth.user.id;
  const isActive = state.activePlayerId === meId;
  const activePlayer = state.players.find((player) => player.id === state.activePlayerId) ?? null;
  const isAlmost = state.role === 'almost';
  const sceneLabel = state.scene ? pickLocalized(state.scene.labels, state.contentLocale) : null;

  return (
    <section className="screen discuss">
      <div className="draw__top">
        <span className="eyebrow">
          {t('discuss.round', { round: state.discussRound, total: state.discussLoops })}
        </span>
        <span className="discuss__turn-label">
          {isActive ? t('discuss.yourTurn') : t('common.discussingNow')}
        </span>
        <TimerPill deadlineAt={state.deadlineAt} />
      </div>

      <div className="draw__meta">
        <div className={clsx('theme-chip', isAlmost && 'theme-chip--hidden')}>
          <span className="theme-chip__emoji" aria-hidden="true">
            {isAlmost ? '🎭' : (state.scene?.emoji ?? '❓')}
          </span>
          <span className="theme-chip__text">
            <span className="theme-chip__label">
              {isAlmost ? t('roles.almost') : t('roles.scene')}
            </span>
            <strong>{isAlmost ? t('roles.almostHint') : (sceneLabel ?? '—')}</strong>
          </span>
        </div>
        <span className="eyebrow">{t('common.round', { round: state.round, total: state.totalRounds })}</span>
      </div>

      <div className={clsx('discuss__stage', isActive && 'discuss__stage--active')}>
        {activePlayer && (
          <Avatar
            name={activePlayer.name}
            avatarUrl={activePlayer.avatarUrl}
            color={activePlayer.color}
            size="md"
          />
        )}
        <div className="discuss__copy">
          <h1>
            {isActive
              ? t('discuss.yourTurn')
              : t('discuss.asking', { name: activePlayer?.name ?? '—' })}
          </h1>
          <p>{isActive ? t('discuss.turnHint') : t('discuss.watching')}</p>
        </div>
        {isActive && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => getSocket()?.emit('game:end-turn')}
          >
            {t('discuss.endTurn')}
          </button>
        )}
      </div>

      <div className="discuss__hints">
        <p className="field__hint">{isAlmost ? t('discuss.almostHint') : t('discuss.insiderHint')}</p>
        <p className="discuss__chat-hint">
          <span aria-hidden="true">💬</span>
          {t('discuss.chatHint')}
        </p>
      </div>
    </section>
  );
}
