import i18n from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LOCALE } from '@almost-you/shared';
import type { LocalesResponse, TextDirection } from '@almost-you/shared';
import { apiFetch } from '../lib/api';

export interface LocalePayload {
  locale: string;
  fallbackLocale: string;
  dir: TextDirection;
  resource: Record<string, unknown>;
}

const instanceReady = i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: FALLBACK_LOCALE,
    fallbackLng: FALLBACK_LOCALE,
    defaultNS: 'translation',
    ns: ['translation'],
    resources: {},
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });

export async function fetchLocales(): Promise<LocalesResponse> {
  return apiFetch<LocalesResponse>('/locales');
}

export async function fetchLocaleResource(code: string): Promise<LocalePayload> {
  return apiFetch<LocalePayload>(`/locales/${encodeURIComponent(code)}`);
}

function applyDocumentLocale(locale: string, dir: TextDirection): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = dir;
}

export async function initI18n(payload: LocalePayload): Promise<void> {
  await instanceReady;
  i18n.addResourceBundle(payload.locale, 'translation', payload.resource, true, true);
  if (i18n.language !== payload.locale) {
    await i18n.changeLanguage(payload.locale);
  }
  applyDocumentLocale(payload.locale, payload.dir);
}

export async function changeUiLocale(code: string): Promise<LocalePayload> {
  const payload = await fetchLocaleResource(code);
  await initI18n(payload);
  return payload;
}

export default i18n;
