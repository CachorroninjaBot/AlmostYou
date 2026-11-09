import type { DiscordSDK } from '@discord/embedded-app-sdk';
import type { ActivityContext, AuthResponse } from '@almost-you/shared';
import { apiFetch } from './api';
import { DEV_NAME, DISCORD_CLIENT_ID } from './env';

const DEV_USER_KEY = 'almost-you:dev-user';

interface DevIdentity {
  id: string;
  name: string;
}

const NAME_PARTS = [
  'Comet',
  'Pebble',
  'Mango',
  'Zigzag',
  'Pickle',
  'Noodle',
  'Biscuit',
  'Waffle',
  'Squiggle',
  'Acorn',
];

function randomSuffix(): string {
  return Math.floor(100 + Math.random() * 900).toString();
}

function readDevIdentity(): DevIdentity {
  try {
    const stored = sessionStorage.getItem(DEV_USER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DevIdentity>;
      if (
        typeof parsed.id === 'string' &&
        parsed.id.length >= 3 &&
        typeof parsed.name === 'string' &&
        parsed.name.length > 0
      ) {
        return { id: parsed.id, name: DEV_NAME ?? parsed.name };
      }
    }
  } catch {
    // Corrupted storage; fall through and generate a new identity.
  }

  const part = NAME_PARTS[Math.floor(Math.random() * NAME_PARTS.length)] ?? 'Player';
  const identity: DevIdentity = {
    id: `dev-${crypto.randomUUID()}`,
    name: DEV_NAME ?? `${part} ${randomSuffix()}`,
  };
  sessionStorage.setItem(DEV_USER_KEY, JSON.stringify(identity));
  return identity;
}

async function authenticateDev(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/dev', {
    method: 'POST',
    body: JSON.stringify(readDevIdentity()),
  });
}

async function authenticateDiscord(
  sdk: DiscordSDK,
  context: ActivityContext,
): Promise<AuthResponse> {
  const { code } = await sdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  return apiFetch<AuthResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ code, instanceId: context.instanceId }),
  });
}

export async function authenticate(
  sdk: DiscordSDK | null,
  context: ActivityContext,
): Promise<AuthResponse> {
  return sdk ? authenticateDiscord(sdk, context) : authenticateDev();
}

export function roomIdFor(context: ActivityContext, fallback: string): string {
  return context.channelId ?? context.instanceId ?? fallback;
}
