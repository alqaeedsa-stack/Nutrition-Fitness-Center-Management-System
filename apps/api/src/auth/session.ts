import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { sessions, users } from '../db/schema';
import { withDatabase } from '../db/client';

const SESSION_COOKIE = 'nc_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getSessionToken(request: Request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export async function createSession(env: Parameters<typeof withDatabase>[0], userId: string, request: Request) {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await withDatabase(env, async (db) => {
    await db.insert(sessions).values({
      userId,
      sessionTokenHash: sha256(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      ipAddress: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
    });

    await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, userId));
  });

  return { token, expiresAt };
}

export async function getAuthenticatedUser(env: Parameters<typeof withDatabase>[0], request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;

  return withDatabase(env, async (db) => {
    const rows = await db.select({
      sessionId: sessions.id,
      userId: users.id,
      centerId: users.centerId,
      email: users.email,
      phone: users.phone,
      status: users.status,
      expiresAt: sessions.expiresAt,
    })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(
        eq(sessions.sessionTokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, 'active'),
      ))
      .limit(1);

    return rows[0] ?? null;
  });
}

export async function revokeSession(env: Parameters<typeof withDatabase>[0], request: Request) {
  const token = getSessionToken(request);
  if (!token) return false;

  const result = await withDatabase(env, async (db) => db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.sessionTokenHash, sha256(token)), isNull(sessions.revokedAt))));

  return result.rowCount > 0;
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
