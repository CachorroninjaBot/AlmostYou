import { useState } from 'react';
import { REACTION_COOLDOWN_MS, REACTION_EMOJIS } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import { getSocket } from '../lib/socket';

export function ReactionBar() {
  const { t } = useTranslation();
  const [cooling, setCooling] = useState(false);

  const send = (emoji: string) => {
    const socket = getSocket();
    if (!socket || cooling) return;
    socket.emit('game:reaction', { emoji });
    setCooling(true);
    setTimeout(() => setCooling(false), REACTION_COOLDOWN_MS);
  };

  return (
    <div className="reaction-bar" role="group" aria-label={t('a11y.reactions')}>
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-bar__button"
          onClick={() => send(emoji)}
          disabled={cooling}
          aria-label={t('a11y.reaction', { emoji })}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
