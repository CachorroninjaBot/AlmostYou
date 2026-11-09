import { z } from 'zod';
import type { SessionUser } from '@almost-you/shared';
import type { AppConfig } from '../config.js';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

const discordUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

const instanceSchema = z.object({
  users: z.array(z.string()).optional(),
});

export class DiscordAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'DiscordAuthError';
  }
}

export function discordOAuthConfigured(config: AppConfig): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret);
}

export async function exchangeDiscordCode(
  config: AppConfig,
  code: string,
): Promise<SessionUser> {
  if (!config.discordClientId || !config.discordClientSecret) {
    throw new DiscordAuthError('Discord login is not configured', 503);
  }

  const body = new URLSearchParams({
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    grant_type: 'authorization_code',
    code,
  });
  if (config.discordRedirectUri) {
    body.set('redirect_uri', config.discordRedirectUri);
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${config.discordApiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new DiscordAuthError('Could not reach Discord', 502);
  }

  if (!tokenResponse.ok) {
    throw new DiscordAuthError('Discord code exchange failed', 401);
  }

  const tokenParsed = tokenResponseSchema.safeParse(await tokenResponse.json());
  if (!tokenParsed.success) {
    throw new DiscordAuthError('Discord returned an invalid token response', 502);
  }

  let userResponse: Response;
  try {
    userResponse = await fetch(`${config.discordApiBase}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenParsed.data.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new DiscordAuthError('Could not reach Discord', 502);
  }

  if (!userResponse.ok) {
    throw new DiscordAuthError('Could not load the Discord user', 502);
  }

  const userParsed = discordUserSchema.safeParse(await userResponse.json());
  if (!userParsed.success) {
    throw new DiscordAuthError('Discord returned an invalid user', 502);
  }

  const user = userParsed.data;
  const name = user.global_name?.trim() || user.username;
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : null;

  return {
    id: user.id,
    name,
    avatarUrl,
    guest: false,
  };
}

export async function assertUserInInstance(
  config: AppConfig,
  instanceId: string | undefined,
  userId: string,
): Promise<void> {
  if (config.skipInstanceValidation) return;
  if (!config.discordBotToken || !config.discordClientId) return;
  if (!instanceId) {
    throw new DiscordAuthError('Missing activity instance id', 401);
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.discordApiBase}/applications/${config.discordClientId}/activity-instances/${encodeURIComponent(instanceId)}`,
      {
        headers: { Authorization: `Bot ${config.discordBotToken}` },
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new DiscordAuthError('Could not validate the activity instance', 502);
  }

  if (!response.ok) {
    throw new DiscordAuthError('Could not validate the activity instance', 401);
  }

  const parsed = instanceSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data.users) {
    throw new DiscordAuthError('Invalid activity instance response', 502);
  }

  if (!parsed.data.users.includes(userId)) {
    throw new DiscordAuthError('User is not in this activity instance', 403);
  }
}
