import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { PublicPlayer } from '@almost-you/shared';
import { Avatar } from './Avatar';

interface PlayerCardProps {
  player: PublicPlayer;
  isYou?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (playerId: string) => void;
  onKick?: (playerId: string) => void;
  showVoteState?: boolean;
  showScore?: boolean;
  compact?: boolean;
}

export function PlayerCard({
  player,
  isYou = false,
  selected = false,
  disabled = false,
  onSelect,
  onKick,
  showVoteState = false,
  showScore = false,
  compact = false,
}: PlayerCardProps) {
  const { t } = useTranslation();

  const content = (
    <>
      <Avatar
        name={player.name}
        avatarUrl={player.avatarUrl}
        color={player.color}
        size={compact ? 'sm' : 'md'}
        dimmed={!player.connected}
      />
      <span className="player-card__body">
        <span className="player-card__name">
          {player.name}
          {isYou && <span className="tag tag--you">{t('common.you')}</span>}
          {player.isHost && <span className="tag tag--host">{t('common.host')}</span>}
        </span>
        <span className="player-card__meta">
          {!player.connected && <span className="player-card__offline">{t('common.offline')}</span>}
          {player.isActive && <span className="player-card__active">{t('common.discussingNow')}</span>}
          {showVoteState && player.hasVoted && (
            <span className="player-card__voted">{t('vote.voted')}</span>
          )}
          {showScore && (
            <span className="player-card__score">
              {t('common.points', { count: player.score })}
            </span>
          )}
        </span>
      </span>
      {selected && (
        <span className="player-card__check" aria-hidden="true">
          ✓
        </span>
      )}
      {onKick && !onSelect && (
        <button
          type="button"
          className="player-card__kick"
          title={t('lobby.kick')}
          aria-label={t('lobby.kickPlayer', { name: player.name })}
          onClick={() => onKick(player.id)}
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 7l10 10M17 7 7 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </>
  );

  const className = clsx(
    'player-card',
    compact && 'player-card--compact',
    selected && 'player-card--selected',
    player.isActive && 'player-card--active',
    !player.connected && 'player-card--offline',
    disabled && 'player-card--disabled',
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onSelect(player.id)}
        disabled={disabled}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
