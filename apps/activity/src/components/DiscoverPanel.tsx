import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeInfo } from '@almost-you/shared';
import type { PublicRoomListing } from '@almost-you/shared';
import { ApiError } from '../lib/api';
import { fetchPublicRooms } from '../lib/rooms';
import { joinRoom } from '../lib/socket';
import { useGameStore } from '../lib/store';
import { Avatar } from './Avatar';

const REFRESH_MS = 8_000;
const JOIN_REFRESH_MS = 1_200;

export function DiscoverPanel() {
  const { t } = useTranslation();
  const currentRoomId = useGameStore((store) => store.state?.roomId ?? null);
  const setError = useGameStore((store) => store.setError);
  const [rooms, setRooms] = useState<PublicRoomListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [limited, setLimited] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const cooldownUntil = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!manual && Date.now() < cooldownUntil.current) return;
    if (manual) setRefreshing(true);
    try {
      const payload = await fetchPublicRooms();
      if (!alive.current) return;
      setRooms(payload.rooms);
      setFailed(false);
      setLimited(false);
      cooldownUntil.current = 0;
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiError && error.status === 429) {
        cooldownUntil.current = Date.now() + (error.retryAfterMs ?? REFRESH_MS);
        setLimited(true);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } finally {
      if (alive.current && manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const join = (roomId: string) => {
    if (!joinRoom(roomId)) {
      setError('CONNECT');
      return;
    }
    // The room may be gone already; drop the card and resync instead of leaving a dead entry.
    setRooms((current) => current?.filter((room) => room.roomId !== roomId) ?? current);
    window.setTimeout(() => void load(true), JOIN_REFRESH_MS);
  };

  const showError = rooms === null && failed;
  const loading = rooms === null && !failed && !limited;

  return (
    <div
      className="panel panel--discover"
      id="lobby-panel-discover"
      role="tabpanel"
      aria-labelledby="lobby-tab-discover"
    >
      <div className="panel__header discover__header">
        <div className="discover__heading">
          <h2 className="panel__title">{t('discover.title')}</h2>
          <p className="discover__subtitle">{t('discover.subtitle')}</p>
        </div>
        <button
          type="button"
          className="button button--compact discover__refresh"
          onClick={() => void load(true)}
          disabled={refreshing || limited}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 12a7 7 0 1 1-2.1-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M19 4v4h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('discover.refresh')}
        </button>
      </div>

      {loading && <p className="discover__state">{t('discover.loading')}</p>}

      {showError && (
        <div className="discover__state discover__state--error">
          <p>{t('discover.error')}</p>
          <button type="button" className="button button--compact" onClick={() => void load(true)}>
            {t('discover.retry')}
          </button>
        </div>
      )}

      {limited && (
        <p className="discover__state discover__state--warn">{t('discover.limited')}</p>
      )}

      {rooms && rooms.length === 0 && !limited && (
        <p className="discover__state">{t('discover.empty')}</p>
      )}

      {rooms && rooms.length > 0 && (
        <div className="room-grid">
          {rooms.map((room) => {
            const isCurrent = room.roomId === currentRoomId;
            return (
              <article className="room-card" key={room.roomId}>
                <div className="room-card__host">
                  <Avatar
                    name={room.hostName}
                    avatarUrl={room.hostAvatarUrl}
                    color={room.hostColor}
                  />
                  <div className="room-card__identity">
                    <span className="room-card__name">{room.hostName}</span>
                    <span className="room-card__code">{room.roomId}</span>
                  </div>
                </div>
                <div className="room-card__meta">
                  <span className="room-card__pill">
                    {t('discover.players', { count: room.players, capacity: room.capacity })}
                  </span>
                  <span className="room-card__pill">
                    {t('discover.language', {
                      language: localeInfo(room.contentLocale).nativeName,
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button--compact button--primary room-card__join"
                  onClick={() => join(room.roomId)}
                  disabled={isCurrent}
                >
                  {isCurrent ? t('discover.current') : t('discover.join')}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="discover__auto">{t('discover.auto')}</p>
    </div>
  );
}
