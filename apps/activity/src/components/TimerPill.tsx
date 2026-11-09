import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/store';
import { useNow } from '../lib/useNow';
import clsx from 'clsx';

export function TimerPill({
  deadlineAt,
  className,
}: {
  deadlineAt: number | null;
  className?: string;
}) {
  const offset = useGameStore((state) => state.serverOffset);
  const now = useNow(250);
  const { t } = useTranslation();

  if (!deadlineAt) return null;
  const remaining = Math.max(0, Math.ceil((deadlineAt - (now + offset)) / 1000));

  return (
    <span
      className={clsx('timer', remaining <= 5 && 'timer--urgent', className)}
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="timer__icon">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {t('time.secondsLeft', { seconds: remaining })}
    </span>
  );
}
