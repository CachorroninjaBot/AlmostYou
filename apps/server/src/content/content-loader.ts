import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  contentDeckSchema,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  directionFor,
  localeDisplayName,
  normalizeLocale,
  resolveLocale,
} from '@almost-you/shared';
import type {
  ContentDeck,
  LocaleInfo,
  LocalesResponse,
  SceneCard,
  ScenePair,
} from '@almost-you/shared';
import type { AppConfig } from '../config.js';

type LocaleResource = Record<string, unknown>;

interface StoredLocale {
  code: string;
  resource: LocaleResource;
  fileName: string;
}

export interface LocalizedResource {
  locale: string;
  fallbackLocale: string;
  dir: 'ltr' | 'rtl';
  resource: LocaleResource;
}

export class ContentService {
  private readonly localeMap = new Map<string, StoredLocale>();
  private readonly locales: LocaleInfo[];
  private readonly contentLocales: string[];
  private readonly deck: ContentDeck;

  private constructor(
    localeMap: Map<string, StoredLocale>,
    locales: LocaleInfo[],
    contentLocales: string[],
    deck: ContentDeck,
  ) {
    this.localeMap = localeMap;
    this.locales = locales;
    this.contentLocales = contentLocales;
    this.deck = deck;
  }

  static async load(config: AppConfig): Promise<ContentService> {
    const localesDir = path.join(config.contentDir, 'locales');
    const deckPath = path.join(config.contentDir, 'decks', 'almost-you', 'deck.json');

    const localeMap = await loadLocaleFiles(localesDir);
    if (!localeMap.has(FALLBACK_LOCALE.toLowerCase())) {
      throw new Error(
        `missing fallback locale ${FALLBACK_LOCALE} in ${localesDir}`,
      );
    }

    const deck = await loadDeck(deckPath);
    const contentLocales = collectContentLocales(deck);
    const locales = [...localeMap.values()]
      .map((locale) => localeInfoFor(locale.code))
      .sort((a, b) => a.nativeName.localeCompare(b.nativeName, 'en'));

    return new ContentService(localeMap, locales, contentLocales, deck);
  }

  getDeck(): ContentDeck {
    return this.deck;
  }

  getPairs(): ScenePair[] {
    return this.deck.pairs;
  }

  getAvailableLocaleCodes(): string[] {
    return this.locales.map((locale) => locale.code);
  }

  getContentLocales(): string[] {
    return this.contentLocales;
  }

  getLocalesResponse(): LocalesResponse {
    return {
      locales: this.locales,
      defaultLocale: DEFAULT_LOCALE,
      fallbackLocale: FALLBACK_LOCALE,
      contentLocales: this.contentLocales,
    };
  }

  resolveUiLocale(raw: string | null | undefined): string {
    return resolveLocale(raw, this.getAvailableLocaleCodes(), FALLBACK_LOCALE);
  }

  getLocalizedResource(raw: string | null | undefined): LocalizedResource | null {
    const code = this.resolveUiLocale(raw);
    const requested = this.localeMap.get(code.toLowerCase());
    const fallback = this.localeMap.get(FALLBACK_LOCALE.toLowerCase());
    if (!requested || !fallback) return null;

    const resource =
      requested.code.toLowerCase() === fallback.code.toLowerCase()
        ? fallback.resource
        : deepMerge(fallback.resource, requested.resource);

    return {
      locale: requested.code,
      fallbackLocale: fallback.code,
      dir: directionFor(requested.code),
      resource,
    };
  }
}

async function loadLocaleFiles(localesDir: string): Promise<Map<string, StoredLocale>> {
  let entries;
  try {
    entries = await readdir(localesDir, { withFileTypes: true });
  } catch {
    throw new Error(`could not read locales directory: ${localesDir}`);
  }

  const localeMap = new Map<string, StoredLocale>();
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of files) {
    const rawCode = fileName.slice(0, -'.json'.length);
    const code = normalizeLocale(rawCode);
    if (!code) {
      throw new Error(`invalid locale file name: ${fileName}`);
    }
    if (localeMap.has(code.toLowerCase())) {
      throw new Error(`duplicate locale: ${code}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.join(localesDir, fileName), 'utf8'));
    } catch (error) {
      throw new Error(`invalid JSON in locale file ${fileName}: ${String(error)}`);
    }
    if (!isPlainObject(parsed)) {
      throw new Error(`locale file ${fileName} must contain a JSON object`);
    }

    localeMap.set(code.toLowerCase(), { code, resource: parsed, fileName });
  }

  if (localeMap.size === 0) {
    throw new Error(`no locale files found in ${localesDir}`);
  }

  return localeMap;
}

async function loadDeck(deckPath: string): Promise<ContentDeck> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(deckPath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read content deck ${deckPath}: ${String(error)}`);
  }

  const result = contentDeckSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid content deck: ${details}`);
  }

  const pairs = result.data.pairs.map((pair) => ({
    ...pair,
    majority: normalizeScene(pair.majority),
    almost: normalizeScene(pair.almost),
  }));

  return { ...result.data, pairs };
}

function normalizeScene(scene: SceneCard): SceneCard {
  const labels: Record<string, string> = {};
  for (const [rawCode, label] of Object.entries(scene.labels)) {
    const code = normalizeLocale(rawCode) ?? rawCode;
    if (labels[code]) {
      throw new Error(`scene ${scene.id} has duplicate label locale ${code}`);
    }
    labels[code] = label;
  }
  if (!labels[FALLBACK_LOCALE] && !labels.en) {
    throw new Error(`scene ${scene.id} is missing the ${FALLBACK_LOCALE} label`);
  }
  return { ...scene, labels };
}

function collectContentLocales(deck: ContentDeck): string[] {
  const codes = new Set<string>();
  for (const pair of deck.pairs) {
    for (const scene of [pair.majority, pair.almost]) {
      for (const code of Object.keys(scene.labels)) {
        codes.add(code);
      }
    }
  }
  return [...codes].sort((a, b) =>
    localeDisplayName(a, 'en-US').localeCompare(localeDisplayName(b, 'en-US'), 'en'),
  );
}

function localeInfoFor(code: string): LocaleInfo {
  return {
    code,
    name: localeDisplayName(code, 'en-US'),
    nativeName: localeDisplayName(code, code),
    dir: directionFor(code),
  };
}

function isPlainObject(value: unknown): value is LocaleResource {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: LocaleResource, override: LocaleResource): LocaleResource {
  const merged: LocaleResource = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(baseValue) ? deepMerge(baseValue, value) : value;
  }
  return merged;
}
