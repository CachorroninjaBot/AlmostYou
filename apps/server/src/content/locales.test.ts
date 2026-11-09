import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentDeckSchema, FALLBACK_LOCALE, normalizeLocale } from '@almost-you/shared';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const localesDir = path.join(repoRoot, 'content', 'locales');
const deckPath = path.join(repoRoot, 'content', 'decks', 'almost-you', 'deck.json');

type Json = Record<string, unknown>;

function flattenKeys(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      return flattenKeys(child as Json, full);
    }
    return [full];
  });
}

function flattenValues(value: Json, prefix = ''): Array<[string, unknown]> {
  return Object.entries(value).flatMap(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      return flattenValues(child as Json, full);
    }
    return [[full, child] as [string, unknown]];
  });
}

async function loadLocales(): Promise<Map<string, Json>> {
  const files = (await readdir(localesDir)).filter((file) => file.endsWith('.json'));
  const locales = new Map<string, Json>();
  for (const file of files) {
    const code = normalizeLocale(file.slice(0, -'.json'.length));
    if (!code) throw new Error(`invalid locale file ${file}`);
    locales.set(code, JSON.parse(await readFile(path.join(localesDir, file), 'utf8')) as Json);
  }
  return locales;
}

describe('locale bundles', () => {
  it('include the fallback locale', async () => {
    const locales = await loadLocales();
    expect(locales.has(FALLBACK_LOCALE)).toBe(true);
  });

  it('share the same keys and non-empty strings as the fallback', async () => {
    const locales = await loadLocales();
    const fallback = locales.get(FALLBACK_LOCALE);
    expect(fallback).toBeDefined();
    const expected = flattenKeys(fallback!).sort();

    for (const [code, resource] of locales) {
      const keys = flattenKeys(resource).sort();
      expect(keys, `key set for ${code}`).toEqual(expected);

      for (const [key, value] of flattenValues(resource)) {
        expect(typeof value, `${code}:${key}`).toBe('string');
        expect((value as string).trim().length, `${code}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('content deck', () => {
  it('is valid and labelled in every bundled locale', async () => {
    const deck = contentDeckSchema.parse(JSON.parse(await readFile(deckPath, 'utf8')));
    const locales = await loadLocales();

    expect(deck.pairs.length).toBeGreaterThanOrEqual(20);
    for (const pair of deck.pairs) {
      for (const scene of [pair.majority, pair.almost]) {
        for (const code of locales.keys()) {
          const label = scene.labels[code];
          expect(label, `${scene.id} label for ${code}`).toBeTruthy();
          expect(label.trim().length, `${scene.id} label for ${code}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('has unique pair ids and unique scene emoji', async () => {
    const deck = contentDeckSchema.parse(JSON.parse(await readFile(deckPath, 'utf8')));
    const scenes = deck.pairs.flatMap((pair) => [pair.majority, pair.almost]);
    expect(new Set(deck.pairs.map((pair) => pair.id)).size).toBe(deck.pairs.length);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
    expect(new Set(scenes.map((scene) => scene.emoji)).size).toBe(scenes.length);
  });
});
