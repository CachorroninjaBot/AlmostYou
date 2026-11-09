import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { changeUiLocale } from '../i18n';
import { copyText } from '../lib/clipboard';
import { useGameStore } from '../lib/store';
import { Logo } from './Logo';
import { SelectMenu } from './SelectMenu';

function shortRoom(roomId: string): string {
  return roomId.length <= 10 ? roomId.toUpperCase() : roomId.slice(-6).toUpperCase();
}

export function AppHeader() {
  const { t } = useTranslation();
  const roomId = useGameStore((state) => state.roomId);
  const locales = useGameStore((state) => state.locales);
  const uiLocale = useGameStore((state) => state.uiLocale);
  const connection = useGameStore((state) => state.connection);
  const latency = useGameStore((state) => state.latency);
  const setLocaleMeta = useGameStore((state) => state.setLocaleMeta);
  const setError = useGameStore((state) => state.setError);

  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLocale = async (code: string) => {
    if (code === uiLocale || switching) return;
    setSwitching(true);
    try {
      const payload = await changeUiLocale(code);
      setLocaleMeta(payload.locale, payload.dir);
      localStorage.setItem('almost-you:locale', payload.locale);
    } catch {
      setError('GENERIC');
    } finally {
      setSwitching(false);
    }
  };

  const handleCopy = async () => {
    if (!roomId) return;
    if (!(await copyText(roomId))) {
      setError('GENERIC');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1_600);
  };

  return (
    <header className="app-header">
      <Logo />
      <div className="app-header__meta">
        {roomId && (
          <button
            type="button"
            className={clsx('room-chip', copied && 'room-chip--copied')}
            onClick={handleCopy}
            title={roomId}
          >
            <span className="room-chip__label">{t('common.room')}</span>
            <span className="room-chip__code">{shortRoom(roomId)}</span>
            <span className="room-chip__action">
              {copied ? t('common.copied') : t('common.copy')}
            </span>
          </button>
        )}

        <SelectMenu
          className="app-header__language"
          value={uiLocale}
          options={locales.map((locale) => ({ value: locale.code, label: locale.nativeName }))}
          onChange={(code) => void handleLocale(code)}
          disabled={switching}
          ariaLabel={t('a11y.languageMenu')}
          align="end"
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M3.5 12h17M12 3.2c2.6 2.6 3.9 5.6 3.9 8.8s-1.3 6.2-3.9 8.8c-2.6-2.6-3.9-5.6-3.9-8.8S9.4 5.8 12 3.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          }
        />

        <span
          className={clsx('connection-dot', `connection-dot--${connection}`)}
          title={t(`common.${connection === 'connected' ? 'online' : 'offline'}`)}
        >
          <span className="connection-dot__pulse" />
          {latency !== null && connection === 'connected' ? `${latency}ms` : null}
        </span>
      </div>
    </header>
  );
}
