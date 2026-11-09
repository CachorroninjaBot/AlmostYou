import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/store';

export function ErrorToast() {
  const { t } = useTranslation();
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => clearError(), 4_500);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  if (!error) return null;

  const translated = t(`errors.${error.code}`, { defaultValue: '' });

  return (
    <div className="error-toast" role="status">
      <span className="error-toast__icon" aria-hidden="true">
        !
      </span>
      <span>{translated || error.message || t('errors.generic')}</span>
      <button type="button" className="error-toast__close" onClick={clearError}>
        {t('common.close')}
      </button>
    </div>
  );
}
