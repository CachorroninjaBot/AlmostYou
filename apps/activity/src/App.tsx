import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AppHeader } from './components/AppHeader';
import { ChatDock } from './components/ChatDock';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ErrorToast } from './components/ErrorToast';
import { Logo } from './components/Logo';
import { NoticeToast } from './components/NoticeToast';
import { ReactionOverlay } from './components/ReactionOverlay';
import { DiscussScreen } from './screens/DiscussScreen';
import { FinishedScreen } from './screens/FinishedScreen';
import { GuessScreen } from './screens/GuessScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RevealScreen } from './screens/RevealScreen';
import { VoteScreen } from './screens/VoteScreen';
import { bootstrap } from './bootstrap';
import { useGameStore } from './lib/store';

function BootScreen({ error }: { error: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="boot">
      <div className="boot__card">
        <Logo />
        <p className="boot__tagline">{t('app.tagline')}</p>
        {error ? (
          <>
            <p className="boot__error">{error}</p>
            <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
              {t('app.reload')}
            </button>
          </>
        ) : (
          <span className="boot__spinner" aria-label={t('app.loading')} />
        )}
      </div>
    </div>
  );
}

function CurrentScreen() {
  const phase = useGameStore((store) => store.state?.phase);

  switch (phase) {
    case 'lobby':
      return <LobbyScreen />;
    case 'reveal':
      return <RevealScreen />;
    case 'discuss':
      return <DiscussScreen />;
    case 'vote':
      return <VoteScreen />;
    case 'guess':
      return <GuessScreen />;
    case 'result':
      return <ResultScreen />;
    case 'finished':
      return <FinishedScreen />;
    default:
      return null;
  }
}

export default function App() {
  const { t } = useTranslation();
  const status = useGameStore((store) => store.status);
  const bootError = useGameStore((store) => store.bootError);
  const state = useGameStore((store) => store.state);
  const chatOpen = useGameStore((store) => store.chatOpen);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, []);

  if (status === 'error') return <BootScreen error={bootError} />;
  if (status !== 'ready') return <BootScreen error={null} />;

  if (!state) {
    return (
      <div className="boot">
        <div className="boot__card">
          <Logo />
          <span className="boot__spinner" aria-label={t('app.loading')} />
          <p className="boot__tagline">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <div className={clsx('app-body', chatOpen && state && 'app-body--chat')}>
        <main className="app-main">
          <CurrentScreen />
        </main>
        <ChatDock />
      </div>
      <ReactionOverlay />
      <ErrorToast />
      <NoticeToast />
      <ConnectionBanner />
    </div>
  );
}
