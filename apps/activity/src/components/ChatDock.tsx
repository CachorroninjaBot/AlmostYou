import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import clsx from 'clsx';
import { CHAT_TYPING_COOLDOWN_MS, CHAT_TYPING_TTL_MS, MAX_CHAT_LENGTH } from '@almost-you/shared';
import type { ChatMessage } from '@almost-you/shared';
import { useTranslation } from 'react-i18next';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';
import { useNow } from '../lib/useNow';
import { Avatar } from './Avatar';
import { ReactionBar } from './ReactionBar';

const QUICK_KEYS = ['chat.quick1', 'chat.quick2', 'chat.quick3', 'chat.quick4'] as const;

export function ChatDock() {
  const { t } = useTranslation();
  const state = useGameStore((store) => store.state);
  const auth = useGameStore((store) => store.auth);
  const chat = useGameStore((store) => store.chat);
  const chatOpen = useGameStore((store) => store.chatOpen);
  const chatUnread = useGameStore((store) => store.chatUnread);
  const typing = useGameStore((store) => store.typing);
  const uiLocale = useGameStore((store) => store.uiLocale);
  const offset = useGameStore((store) => store.serverOffset);
  const setChatOpen = useGameStore((store) => store.setChatOpen);
  const markChatRead = useGameStore((store) => store.markChatRead);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const lastTypingRef = useRef(0);
  const now = useNow(1_000);

  const connected = state?.players.filter((player) => player.connected).length ?? 0;
  const meId = auth?.user.id ?? null;
  const typingVisible = Boolean(
    typing && now + offset - typing.at < CHAT_TYPING_TTL_MS && typing.playerId !== meId,
  );

  useEffect(() => {
    if (!chatOpen) return;
    markChatRead();
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chatOpen, markChatRead]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !stickRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [chat.length, typingVisible, chatOpen]);

  if (!state || !auth) return null;

  const timeFormatter = new Intl.DateTimeFormat(uiLocale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    getSocket()?.emit('chat:send', { text });
    setDraft('');
    stickRef.current = true;
    inputRef.current?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  const onDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    const stamp = Date.now();
    if (event.target.value.trim() && stamp - lastTypingRef.current > CHAT_TYPING_COOLDOWN_MS) {
      lastTypingRef.current = stamp;
      getSocket()?.emit('chat:typing');
    }
  };

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
  };

  const close = () => {
    setChatOpen(false);
    stickRef.current = true;
  };

  const systemText = (message: Extract<ChatMessage, { kind: 'system' }>) => {
    const key =
      message.event === 'JOIN'
        ? 'chat.systemJoin'
        : message.event === 'LEAVE'
          ? 'chat.systemLeave'
          : 'chat.systemKick';
    return t(key, { name: message.actorName });
  };

  return (
    <>
      {!chatOpen && (
        <button
          type="button"
          className="chat-fab"
          onClick={() => setChatOpen(true)}
          aria-label={t('a11y.chatOpen')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.6 3.2a.7.7 0 0 1-1.1-.6v-2.6H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8 10.5h8M8 13.5h5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <span className="chat-fab__label">{t('chat.title')}</span>
          {chatUnread > 0 && (
            <span className="chat-fab__badge" aria-label={t('chat.unread', { count: chatUnread })}>
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          )}
        </button>
      )}

      {chatOpen && (
        <button
          type="button"
          className="chat-backdrop"
          aria-label={t('common.close')}
          onClick={close}
        />
      )}

      <aside
        className={clsx('chat', chatOpen ? 'chat--open' : 'chat--closed')}
        aria-label={t('a11y.chatPanel')}
        aria-hidden={!chatOpen}
      >
        <header className="chat__header">
          <div className="chat__heading">
            <span className="chat__live" aria-hidden="true" />
            <div>
              <h2>{t('chat.title')}</h2>
              <p>{t('chat.connected', { count: connected })}</p>
            </div>
          </div>
          <button
            type="button"
            className="chat__close"
            onClick={close}
            aria-label={t('a11y.chatClose')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 7l10 10M17 7 7 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div
          className="chat__log"
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label={t('a11y.chatMessages')}
        >
          {chat.length === 0 && <p className="chat__empty">{t('chat.empty')}</p>}

          {chat.map((message) =>
            message.kind === 'system' ? (
              <p key={message.id} className="chat__system">
                {systemText(message)}
              </p>
            ) : (
              <article
                key={message.id}
                className={clsx('chat__message', message.playerId === meId && 'chat__message--me')}
              >
                <Avatar
                  name={message.playerName}
                  avatarUrl={message.playerAvatarUrl}
                  color={message.playerColor}
                  size="sm"
                />
                <div className="chat__bubble">
                  <span className="chat__author">
                    {message.playerName}
                    <time dateTime={new Date(message.at).toISOString()}>
                      {timeFormatter.format(new Date(message.at))}
                    </time>
                  </span>
                  <p>{message.text}</p>
                </div>
              </article>
            ),
          )}

          {typingVisible && typing && (
            <p className="chat__typing">
              {t('chat.typing', { name: typing.playerName })}
              <span className="chat__typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          )}
        </div>

        <div className="chat__footer">
          <div className="chat__quick" role="group" aria-label={t('a11y.chatQuick')}>
            {QUICK_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="chat__quick-chip"
                onClick={() => send(t(key))}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <ReactionBar className="reaction-bar--inline" />

          <form className="chat__composer" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              id="chat-message"
              name="chat-message"
              className="chat__input"
              value={draft}
              onChange={onDraftChange}
              placeholder={t('chat.placeholder')}
              aria-label={t('a11y.chatInput')}
              maxLength={MAX_CHAT_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className="chat__send"
              disabled={!draft.trim()}
              aria-label={t('chat.send')}
              title={t('chat.send')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4.2 11.4 19.4 4.8c.7-.3 1.4.4 1.1 1.1l-6.6 15.2c-.3.8-1.5.7-1.7-.1l-1.8-5.4-5.4-1.8c-.8-.3-.9-1.4-.1-1.7z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
