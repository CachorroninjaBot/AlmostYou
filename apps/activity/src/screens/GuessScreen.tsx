import { useState } from 'react';
import { pickLocalized } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import { TimerPill } from '../components/TimerPill';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';

export function GuessScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const [chosen, setChosen] = useState<string | null>(null);

  if (!state) return null;

  const isAlmost = state.role === 'almost';
  const options = state.guessOptions ?? [];

  const pick = (optionId: string) => {
    if (chosen) return;
    setChosen(optionId);
    getSocket()?.emit('game:guess', { optionId });
  };

  return (
    <section className="screen guess">
      <div className="screen__heading">
        <div>
          <span className="eyebrow">{t('common.round', { round: state.round, total: state.totalRounds })}</span>
          <h1>{t(isAlmost ? 'guess.almostTitle' : 'guess.insiderTitle')}</h1>
          <p>{t(isAlmost ? 'guess.almostSubtitle' : 'guess.insiderSubtitle')}</p>
        </div>
        <TimerPill deadlineAt={state.deadlineAt} />
      </div>

      {isAlmost ? (
        <div className="guess-grid">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="guess-option"
              onClick={() => pick(option.id)}
              disabled={chosen !== null}
              aria-pressed={chosen === option.id}
              aria-label={t('a11y.chooseScene', { scene: pickLocalized(option.labels, state.contentLocale) })}
            >
              <span className="guess-option__emoji" aria-hidden="true">
                {option.emoji}
              </span>
              <span>{pickLocalized(option.labels, state.contentLocale)}</span>
            </button>
          ))}
          {options.length === 0 && <p className="waiting-note">{t('guess.waiting')}</p>}
          <p className="field__hint">{t('guess.pick')}</p>
        </div>
      ) : (
        <div className="guess-waiting">
          <span className="guess-waiting__mask" aria-hidden="true">
            🎭
          </span>
          <p className="waiting-note">{t('guess.waiting')}</p>
        </div>
      )}
    </section>
  );
}
