import { useTranslation } from 'react-i18next';
import { RoleCard } from '../components/RoleCard';
import { TimerPill } from '../components/TimerPill';
import { useGameStore } from '../lib/store';
import { useNow } from '../lib/useNow';

export function RevealScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const offset = useGameStore((store) => store.serverOffset);
  const now = useNow(250);

  if (!state) return null;

  const seconds = state.deadlineAt
    ? Math.max(0, Math.ceil((state.deadlineAt - (now + offset)) / 1000))
    : null;

  return (
    <section className="screen reveal">
      <div className="reveal__top">
        <span className="eyebrow">{t('common.round', { round: state.round, total: state.totalRounds })}</span>
        <TimerPill deadlineAt={state.deadlineAt} />
      </div>

      <RoleCard role={state.role} scene={state.scene} contentLocale={state.contentLocale} />

      {seconds !== null && (
        <p className="reveal__countdown">{t('roles.revealIn', { seconds })}</p>
      )}
    </section>
  );
}
