import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/store';

export function NoticeToast() {
  const { t } = useTranslation();
  const notice = useGameStore((store) => store.notice);
  const clearNotice = useGameStore((store) => store.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => clearNotice(), 3_500);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);

  if (!notice) return null;
  const text = t(`notices.${notice}`, { defaultValue: '' });
  if (!text) return null;

  return (
    <div className="error-toast notice-toast" role="status">
      <span className="error-toast__icon" aria-hidden="true">
        ★
      </span>
      <span>{text}</span>
      <button type="button" className="error-toast__close" onClick={clearNotice}>
        {t('common.close')}
      </button>
    </div>
  );
}
