import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { MAX_ROOM_ID_LENGTH, MIN_PLAYERS, localeInfo, roomIdSchema } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/store';
import { getSocket, joinRoom } from '../lib/socket';
import { copyText } from '../lib/clipboard';
import { openInviteDialog } from '../discord/sdk';
import { DiscoverPanel } from '../components/DiscoverPanel';
import { PlayerCard } from '../components/PlayerCard';
import { SelectMenu } from '../components/SelectMenu';

const TAB_ORDER = ['room', 'discover'] as const;
type LobbyTab = (typeof TAB_ORDER)[number];

export function LobbyScreen() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);
  const contentLocales = useGameStore((store) => store.contentLocales);
  const dir = useGameStore((store) => store.dir);
  const setError = useGameStore((store) => store.setError);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [tab, setTab] = useState<LobbyTab>('room');
  const pendingCode = useRef<string | null>(null);
  const tabRefs = useRef<Record<LobbyTab, HTMLButtonElement | null>>({
    room: null,
    discover: null,
  });

  const roomId = state?.roomId;

  useEffect(() => {
    setTab('room');
    if (pendingCode.current && pendingCode.current === roomId) {
      setJoinCode('');
      pendingCode.current = null;
    }
  }, [roomId]);

  if (!state || !auth) return null;

  const meId = auth.user.id;
  const isHost = state.hostId === meId;
  const listed = state.listed === true;
  const connectedCount = state.players.filter((player) => player.connected).length;
  const canStart = isHost && connectedCount >= MIN_PLAYERS;
  const trimmedCode = joinCode.trim();
  const codeValid = roomIdSchema.safeParse(trimmedCode).success;

  const setContentLocale = (locale: string) => {
    getSocket()?.emit('lobby:set-content-locale', { locale });
  };

  const toggleListed = () => {
    getSocket()?.emit('lobby:set-listed', { listed: !listed });
  };

  const selectTab = (next: LobbyTab) => {
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const index = TAB_ORDER.indexOf(tab);
    let next: LobbyTab | null = null;

    if (event.key === forward) {
      next = TAB_ORDER[(index + 1) % TAB_ORDER.length] ?? null;
    } else if (event.key === backward) {
      next = TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length] ?? null;
    } else if (event.key === 'Home') {
      next = TAB_ORDER[0] ?? null;
    } else if (event.key === 'End') {
      next = TAB_ORDER[TAB_ORDER.length - 1] ?? null;
    }

    if (!next) return;
    event.preventDefault();
    selectTab(next);
  };

  const start = () => {
    getSocket()?.emit('lobby:start');
  };

  const kick = (playerId: string) => {
    getSocket()?.emit('lobby:kick', { playerId });
  };

  const invite = async () => {
    if (await openInviteDialog()) return;
    if (!(await copyText(state.roomId))) {
      setError('GENERIC');
      return;
    }
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2_000);
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    if (!codeValid) return;
    const code = trimmedCode.toUpperCase();
    if (!joinRoom(code)) {
      setError('CONNECT');
      return;
    }
    pendingCode.current = code;
  };

  return (
    <section className="screen lobby">
      <div className="hero">
        <div className="hero__copy">
          <span className="eyebrow">{t('app.name')}</span>
          <h1>{t('lobby.title')}</h1>
          <p>{t('lobby.subtitle')}</p>
        </div>
        <div className="hero__aside">
          <div className="room-ticket">
            <span className="room-ticket__eyebrow">{t('lobby.roomCode')}</span>
            <strong className="room-ticket__code">{state.roomId}</strong>
            <button
              type="button"
              className="button button--primary button--compact room-ticket__button"
              onClick={() => void invite()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9.5" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M3.6 19c.6-3.2 3-5.2 5.9-5.2 2.4 0 4.4 1.4 5.3 3.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M18 8.5v5M15.5 11h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {inviteCopied ? t('common.copied') : t('lobby.inviteFriends')}
            </button>
            <p className="room-ticket__hint">
              {inviteCopied ? t('lobby.inviteCopied') : t('lobby.inviteHint')}
            </p>
          </div>
          <div className="hero__stats">
            <span className="stat-chip">{t('lobby.connectedCount', { count: connectedCount })}</span>
            <span className="stat-chip">{localeInfo(state.contentLocale).nativeName}</span>
            {listed && <span className="stat-chip stat-chip--accent">{t('lobby.publicBadge')}</span>}
          </div>
        </div>
      </div>

      <div className="lobby-tabs" role="tablist" aria-label={t('a11y.lobbyTabs')}>
        <button
          type="button"
          ref={(element) => {
            tabRefs.current.room = element;
          }}
          id="lobby-tab-room"
          role="tab"
          aria-selected={tab === 'room'}
          aria-controls="lobby-panel-room"
          tabIndex={tab === 'room' ? 0 : -1}
          className={clsx('lobby-tabs__tab', tab === 'room' && 'lobby-tabs__tab--active')}
          onClick={() => setTab('room')}
          onKeyDown={onTabKeyDown}
        >
          {t('lobby.roomTab')}
        </button>
        <button
          type="button"
          ref={(element) => {
            tabRefs.current.discover = element;
          }}
          id="lobby-tab-discover"
          role="tab"
          aria-selected={tab === 'discover'}
          aria-controls="lobby-panel-discover"
          tabIndex={tab === 'discover' ? 0 : -1}
          className={clsx('lobby-tabs__tab', tab === 'discover' && 'lobby-tabs__tab--active')}
          onClick={() => setTab('discover')}
          onKeyDown={onTabKeyDown}
        >
          {t('lobby.discoverTab')}
        </button>
      </div>

      {tab === 'room' ? (
        <div
          className="lobby__grid"
          id="lobby-panel-room"
          role="tabpanel"
          aria-labelledby="lobby-tab-room"
        >
          <div className="panel panel--rules">
            <h2 className="panel__title">{t('lobby.howToPlay')}</h2>
            <ol className="rules">
              <li>
                <span className="rules__number">1</span>
                <span>{t('lobby.rule1')}</span>
              </li>
              <li>
                <span className="rules__number">2</span>
                <span>{t('lobby.rule2')}</span>
              </li>
              <li>
                <span className="rules__number">3</span>
                <span>{t('lobby.rule3')}</span>
              </li>
            </ol>

            <div className="field">
              <div className="field__label-row">
                <label className="field__label" htmlFor="content-locale">
                  {t('lobby.roomLanguage')}
                </label>
                {isHost && <span className="tag tag--host">{t('common.host')}</span>}
              </div>
              <SelectMenu
                id="content-locale"
                variant="field"
                value={state.contentLocale}
                options={contentLocales.map((locale) => ({
                  value: locale,
                  label: localeInfo(locale).nativeName,
                  meta: locale.toUpperCase(),
                }))}
                onChange={setContentLocale}
                disabled={!isHost}
                ariaLabel={t('a11y.contentLanguageMenu')}
                icon={
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 15.5c2.5-6 6.5-9.5 12-11 1.2-.3 2.2.7 1.9 1.9-1.5 5.5-5 9.5-11 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M4 20c1.4-3.2 3.6-5.6 6.7-7.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                }
              />
              <p className="field__hint">{t('lobby.roomLanguageHint')}</p>
            </div>

            <div className="visibility">
              <div className="visibility__copy">
                <span className="field__label">{t('lobby.publicRoom')}</span>
                <p className="field__hint">
                  {isHost ? t('lobby.publicRoomHint') : t('lobby.publicRoomHostOnly')}
                </p>
              </div>
              {isHost ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={listed}
                  aria-label={t('lobby.publicRoom')}
                  className={clsx('switch', listed && 'switch--on')}
                  onClick={toggleListed}
                >
                  <span className="switch__thumb" aria-hidden="true" />
                </button>
              ) : (
                listed && <span className="tag tag--public">{t('lobby.publicBadge')}</span>
              )}
            </div>

            <div className="lobby__actions">
              {isHost ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={start}
                  disabled={!canStart}
                >
                  {t('lobby.start')}
                </button>
              ) : (
                <p className="waiting-note">{t('lobby.waitingForHost')}</p>
              )}
              {isHost && !canStart && (
                <p className="field__hint field__hint--warn">
                  {t('lobby.needPlayers', { count: MIN_PLAYERS })}
                </p>
              )}
              {isHost && <p className="field__hint">{t('lobby.youAreHost')}</p>}
            </div>
          </div>

          <div className="panel panel--players">
            <div className="panel__header">
              <h2 className="panel__title">{t('lobby.whoIsHere')}</h2>
              <span className="counter">
                {t('lobby.connectedCount', { count: connectedCount })}
              </span>
            </div>
            <div className="player-grid">
              {state.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isYou={player.id === meId}
                  showScore={player.score > 0}
                  onKick={
                    isHost && player.id !== meId && player.connected ? kick : undefined
                  }
                />
              ))}
            </div>
            <form className="join-form" onSubmit={join}>
              <div className="join-form__header">
                <label className="field__label" htmlFor="room-code">
                  {t('lobby.joinRoom')}
                </label>
                <span className="join-form__hint">{t('lobby.joinRoomHint')}</span>
              </div>
              <div className="join-form__controls">
                <input
                  id="room-code"
                  className="join-form__input"
                  type="text"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder={t('lobby.joinRoomPlaceholder')}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={MAX_ROOM_ID_LENGTH}
                />
                <button type="submit" className="button button--compact" disabled={!codeValid}>
                  {t('lobby.joinRoomAction')}
                </button>
              </div>
              {trimmedCode.length > 0 && !codeValid && (
                <p className="field__hint field__hint--warn">{t('lobby.joinRoomInvalid')}</p>
              )}
            </form>
          </div>
        </div>
      ) : (
        <DiscoverPanel />
      )}

      <footer className="legal-footer">
        <a href="/legal/privacy.html">{t('footer.privacy')}</a>
        <span aria-hidden="true">·</span>
        <a href="/legal/terms.html">{t('footer.terms')}</a>
      </footer>
    </section>
  );
}
