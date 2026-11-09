import { useGameStore } from '../lib/store';
import { useNow } from '../lib/useNow';

const LIFETIME_MS = 3_600;

export function ReactionOverlay() {
  const reactions = useGameStore((state) => state.reactions);
  const offset = useGameStore((state) => state.serverOffset);
  const now = useNow(400);

  const visible = reactions.filter((reaction) => now - (reaction.at - offset) < LIFETIME_MS);
  if (visible.length === 0) return null;

  return (
    <div className="reaction-overlay" aria-hidden="true">
      {visible.map((reaction) => {
        const seed = [...reaction.playerId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const lane = seed % 4;
        return (
          <span
            key={`${reaction.playerId}-${reaction.at}-${reaction.emoji}`}
            className={`reaction-bubble reaction-bubble--lane-${lane}`}
          >
            <span className="reaction-bubble__emoji">{reaction.emoji}</span>
            <span className="reaction-bubble__name">{reaction.playerName}</span>
          </span>
        );
      })}
    </div>
  );
}
