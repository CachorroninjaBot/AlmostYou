import { MAX_NAME_LENGTH } from './constants.js';

const UNSAFE_CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function sanitizeDisplayName(
  raw: unknown,
  fallback = 'Player',
  maxLength = MAX_NAME_LENGTH,
): string {
  const cleaned = String(raw ?? '')
    .normalize('NFC')
    .replace(UNSAFE_CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();

  const truncated = Array.from(cleaned).slice(0, maxLength).join('').trim();
  return truncated || fallback;
}

export function sanitizeChatText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(UNSAFE_CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LINK_PATTERN = /(?:https?:\/\/|www\.|discord(?:app)?\.gg\/)/i;

export function containsLink(value: string): boolean {
  return LINK_PATTERN.test(value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function initialsFor(name: string): string {
  const parts = name
    .split(' ')
    .map((part) => Array.from(part)[0])
    .filter((char): char is string => Boolean(char));
  return parts.slice(0, 2).join('').toUpperCase() || '?';
}
