import { z } from 'zod';
import {
  MAX_NAME_LENGTH,
  MAX_ROOM_ID_LENGTH,
  REACTION_EMOJIS,
  ROOM_ID_MIN_LENGTH,
} from './constants.js';
import { isHttpUrl } from './text.js';

export const localeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'invalid locale code');

export const roomIdSchema = z
  .string()
  .trim()
  .min(ROOM_ID_MIN_LENGTH)
  .max(MAX_ROOM_ID_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/, 'room id may only contain letters, numbers, _ and -');

export const displayNameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH * 2);

export const joinRoomSchema = z
  .object({
    roomId: roomIdSchema,
    mustExist: z.boolean().optional(),
  })
  .strict();

export const setContentLocaleSchema = z
  .object({
    locale: localeCodeSchema,
  })
  .strict();

export const setListedSchema = z
  .object({
    listed: z.boolean(),
  })
  .strict();

export const kickPlayerSchema = z
  .object({
    playerId: z.string().min(1).max(64),
  })
  .strict();

export const voteSchema = z
  .object({
    targetId: z.string().min(1).max(64),
  })
  .strict();

export const guessSchema = z
  .object({
    optionId: z.string().min(1).max(64),
  })
  .strict();

export const reactionSchema = z
  .object({
    emoji: z.enum(REACTION_EMOJIS),
  })
  .strict();

export const latencyPingSchema = z
  .object({
    t: z.number().finite(),
  })
  .strict();

export const activityContextSchema = z
  .object({
    instanceId: z.string().max(64).optional(),
    channelId: z.string().max(64).optional(),
    guildId: z.string().max(64).optional(),
    locale: localeCodeSchema.optional(),
  })
  .strict();

export const devAuthSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    name: displayNameSchema,
    avatarUrl: z
      .url()
      .max(512)
      .refine(isHttpUrl, 'avatar must use http or https')
      .nullable()
      .optional(),
  })
  .strict();

export const tokenExchangeSchema = z
  .object({
    code: z.string().min(1).max(4096),
    instanceId: z.string().max(64).optional(),
  })
  .strict();

export const sceneCardSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid scene id'),
  emoji: z.string().min(1).max(16),
  labels: z
    .record(localeCodeSchema, z.string().trim().min(1).max(80))
    .refine((labels) => Object.keys(labels).length > 0, 'scene needs at least one label'),
  category: z.string().min(2).max(40).optional(),
});

export const scenePairSchema = z
  .object({
    id: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid pair id'),
    category: z.string().min(2).max(40).optional(),
    majority: sceneCardSchema,
    almost: sceneCardSchema,
  })
  .strict()
  .refine((pair) => pair.majority.id !== pair.almost.id, 'pair scenes must differ');

export const contentDeckSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.number().int().positive(),
  pairs: z
    .array(scenePairSchema)
    .min(4)
    .superRefine((pairs, ctx) => {
      const seen = new Set<string>();
      const sceneIds = new Set<string>();
      for (const pair of pairs) {
        if (seen.has(pair.id)) {
          ctx.addIssue({ code: 'custom', message: `duplicate pair id: ${pair.id}` });
        }
        seen.add(pair.id);
        for (const scene of [pair.majority, pair.almost]) {
          if (sceneIds.has(scene.id)) {
            ctx.addIssue({ code: 'custom', message: `duplicate scene id: ${scene.id}` });
          }
          sceneIds.add(scene.id);
        }
      }
    }),
});

export type ContentDeck = z.infer<typeof contentDeckSchema>;
