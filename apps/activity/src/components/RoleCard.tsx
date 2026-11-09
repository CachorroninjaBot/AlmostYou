import { pickLocalized } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import type { Role, SceneCard } from '@almost-you/shared';
import clsx from 'clsx';

interface RoleCardProps {
  role: Role | null;
  scene: SceneCard | null;
  contentLocale: string;
}

export function RoleCard({ role, scene, contentLocale }: RoleCardProps) {
  const { t } = useTranslation();
  const isAlmost = role === 'almost';

  return (
    <div className={clsx('role-card', isAlmost ? 'role-card--faker' : 'role-card--artist')}>
      <div className="role-card__badge">
        <span className="role-card__icon" aria-hidden="true">
          {isAlmost ? '🎭' : '🎟️'}
        </span>
        <div>
          <p className="role-card__eyebrow">{t('roles.keepSecret')}</p>
          <h2>{t(isAlmost ? 'roles.almostTitle' : 'roles.insiderTitle')}</h2>
        </div>
      </div>

      <p className="role-card__hint">{t(isAlmost ? 'roles.almostHint' : 'roles.insiderHint')}</p>

      <div className="role-card__theme" role="img" aria-label={`${t('a11y.sceneCard')}: ${scene ? pickLocalized(scene.labels, contentLocale) : ''}`}>
        <span className="role-card__label">{t('roles.scene')}</span>
        {scene ? (
          <div className="role-card__theme-value">
            <span className="role-card__emoji" aria-hidden="true">
              {scene.emoji}
            </span>
            <strong>{pickLocalized(scene.labels, contentLocale)}</strong>
          </div>
        ) : (
          <div className="role-card__theme-value role-card__theme-value--empty">
            <span className="role-card__emoji" aria-hidden="true">
              ❓
            </span>
            <strong>{t('common.waiting')}</strong>
          </div>
        )}
      </div>

      {isAlmost && <p className="role-card__hint">{t('roles.almostSceneHint')}</p>}
    </div>
  );
}
