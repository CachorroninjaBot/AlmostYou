import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/store';

export function ConnectionBanner() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const connection = useGameStore((store) => store.connection);

  if (!state || connection === 'connected') return null;

  return (
    <div className="connection-banner" role="status">
      <span className="connection-banner__spinner" aria-hidden="true" />
      {t('errors.connect')}
    </div>
  );
}
