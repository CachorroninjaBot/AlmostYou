import { resolveLocale } from '@almost-you/shared';
import { bootstrapDiscord } from './discord/sdk';
import { fetchLocaleResource, fetchLocales, initI18n } from './i18n';
import { authenticate, roomIdFor } from './lib/auth';
import { describeError } from './lib/errors';
import { DEV_ROOM } from './lib/env';
import { connectSocket } from './lib/socket';
import { useGameStore } from './lib/store';

const LOCALE_KEY = 'almost-you:locale';

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

export async function bootstrap(): Promise<void> {
  const store = useGameStore.getState();
  store.setStatus('loading');

  try {
    const [{ sdk, context, detectedLocale }, localesResponse] = await Promise.all([
      bootstrapDiscord(),
      fetchLocales(),
    ]);

    store.setLocales(localesResponse.locales, localesResponse.contentLocales);

    const available = localesResponse.locales.map((locale) => locale.code);
    const preferred = resolveLocale(
      readStoredLocale() ?? detectedLocale,
      available,
      localesResponse.defaultLocale,
    );

    const localePayload = await fetchLocaleResource(preferred);
    await initI18n(localePayload);
    store.setLocaleMeta(localePayload.locale, localePayload.dir);

    const auth = await authenticate(sdk, context);
    const runtimeContext = { ...context, locale: localePayload.locale };
    const roomId = roomIdFor(context, DEV_ROOM);

    store.setSession(auth, runtimeContext, roomId);
    connectSocket(auth, runtimeContext, roomId);
    store.setStatus('ready');
  } catch (error) {
    console.error('almost-you: bootstrap failed', error);
    store.setBootError(describeError(error));
    store.setStatus('error');
  }
}
