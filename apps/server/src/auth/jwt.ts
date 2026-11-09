import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { AuthResponse, SessionUser } from '@almost-you/shared';

const ISSUER = 'almost-you';
const AUDIENCE = 'almost-you-activity';

const claimsSchema = z.object({
  sub: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  avatarUrl: z.string().max(512).nullable(),
  guest: z.boolean(),
});

function keyFor(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  user: SessionUser,
  secret: string,
  ttlSeconds: number,
): Promise<AuthResponse> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const token = await new SignJWT({
    name: user.name,
    avatarUrl: user.avatarUrl,
    guest: user.guest,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(keyFor(secret));

  return { token, user, expiresAt };
}

export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, keyFor(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('invalid session claims');
  }

  return {
    id: parsed.data.sub,
    name: parsed.data.name,
    avatarUrl: parsed.data.avatarUrl,
    guest: parsed.data.guest,
  };
}
