import { initialsFor } from '@almost-you/shared';
import clsx from 'clsx';

interface AvatarProps {
  name: string;
  avatarUrl: string | null;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  dimmed?: boolean;
}

export function Avatar({ name, avatarUrl, color, size = 'md', dimmed = false }: AvatarProps) {
  return (
    <span
      className={clsx('avatar', `avatar--${size}`, dimmed && 'avatar--dimmed')}
      style={{ '--player-color': color } as React.CSSProperties}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <span className="avatar__initials" aria-hidden="true">
        {initialsFor(name)}
      </span>
    </span>
  );
}
