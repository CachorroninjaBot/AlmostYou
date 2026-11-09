import clsx from 'clsx';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={clsx('logo', compact && 'logo--compact')}>
      <svg className="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="2" y="2" width="60" height="60" rx="18" fill="var(--ink-800)" />
        <circle cx="27" cy="34" r="14" fill="var(--coral)" />
        <circle
          cx="38"
          cy="30"
          r="13"
          fill="none"
          stroke="var(--mint)"
          strokeWidth="4"
        />
        <circle cx="49" cy="17" r="3" fill="var(--sun)" />
      </svg>
      {!compact && (
        <span className="logo__word">
          Almost<span>You</span>
        </span>
      )}
    </div>
  );
}
