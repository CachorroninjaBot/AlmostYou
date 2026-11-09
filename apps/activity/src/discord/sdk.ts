import type { DiscordSDK } from '@discord/embedded-app-sdk';
import type { ActivityContext } from '@almost-you/shared';
import { DISCORD_CLIENT_ID, IS_EMBEDDED } from '../lib/env';

let sdk: DiscordSDK | null = null;

export interface DiscordBootstrap {
  sdk: DiscordSDK | null;
  context: ActivityContext;
  detectedLocale: string | null;
}

export async function bootstrapDiscord(): Promise<DiscordBootstrap> {
  const params = new URLSearchParams(window.location.search);
  const fallbackLocale = navigator.language || null;

  if (!IS_EMBEDDED || !DISCORD_CLIENT_ID) {
    return {
      sdk: null,
      detectedLocale: fallbackLocale,
      context: {
        locale: fallbackLocale ?? undefined,
        channelId: params.get('room') ?? undefined,
      },
    };
  }

  const { DiscordSDK: DiscordSdkClass } = await import('@discord/embedded-app-sdk');
  sdk = new DiscordSdkClass(DISCORD_CLIENT_ID);
  await sdk.ready();

  let detectedLocale: string | null = fallbackLocale;
  try {
    const result = await sdk.commands.userSettingsGetLocale();
    detectedLocale = result.locale || fallbackLocale;
  } catch {
    // Locale detection is best effort; the SDK locale is optional.
  }

  return {
    sdk,
    detectedLocale,
    context: {
      instanceId: sdk.instanceId ?? undefined,
      channelId: sdk.channelId ?? undefined,
      guildId: sdk.guildId ?? undefined,
      locale: detectedLocale ?? undefined,
    },
  };
}

export function getDiscordSdk(): DiscordSDK | null {
  return sdk;
}

export async function openInviteDialog(): Promise<boolean> {
  if (!sdk) return false;
  try {
    await sdk.commands.openInviteDialog();
    return true;
  } catch {
    return false;
  }
}
