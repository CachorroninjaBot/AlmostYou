import { useTranslation } from 'react-i18next';
import type { PublicPlayer } from '@almost-you/shared';
import clsx from 'clsx';
import { Avatar } from './Avatar';

interface ScoreListProps {
  players: PublicPlayer[];
  deltas?: Record<string, number>;
  winnerIds?: string[];
  meId?: string | null;
}

export function ScoreList({ players, deltas, winnerIds, meId }: ScoreListProps) {
  const { t } = useTranslation();
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const winners = new Set(winnerIds ?? []);

  return (
    <ol className="score-list">
      {sorted.map((player, index) => {
        const delta = deltas?.[player.id] ?? 0;
        return (
          <li
            key={player.id}
            className={clsx(
              'score-row',
              winners.has(player.id) && 'score-row--winner',
              player.id === meId && 'score-row--me',
            )}
          >
            <span className="score-row__rank">{index + 1}</span>
            <Avatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              color={player.color}
              size="sm"
            />
            <span className="score-row__name">
              {player.name}
              {player.id === meId && <span className="tag tag--you">{t('common.you')}</span>}
            </span>
            {delta !== 0 && (
              <span className={clsx('score-row__delta', delta > 0 && 'score-row__delta--up')}>
                {t('result.pointsGained', { points: delta })}
              </span>
            )}
            <strong className="score-row__score">
              {t('common.points', { count: player.score })}
            </strong>
          </li>
        );
      })}
    </ol>
  );
}
