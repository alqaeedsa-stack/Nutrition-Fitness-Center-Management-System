import { and, eq, gt, isNull } from 'drizzle-orm';
import { customerAccounts } from './customer-account';
import { sessions, users } from '../db/schema';
import { withDatabase } from '../db/client';

const SESSION_COOKIE = 'nc_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const tokenHash = await sha256(token);

  await withDatabase(env, async (db) => {
    await db.insert(sessions).values({
      userId,
      sessionTokenHash: tokenHash,
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
  const tokenHash = await sha256(token);

  return withDatabase(env, async (db) => {
    const rows = await db.select({
      sessionId: sessions.id,
      userId: users.id,
      centerId: users.centerId,
      email: users.email,
      phone: users.phone,
      status: users.status,
      expiresAt: sessions.expiresAt,
      customerId: customerAccounts.customerId,
    })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(customerAccounts, eq(customerAccounts.userId, users.id))
      .where(and(
        eq(sessions.sessionTokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, 'active'),
      ))
      .limit(1);

    const user = rows[0];
    if (!user) return null;
    return { ...user, accountType: user.customerId ? 'customer' as const : 'staff' as const };
  });
}

export async function revokeSession(env: Parameters<typeof withDatabase>[0], request: Request) {
  const token = getSessionToken(request);
  if (!token) return false;
  const tokenHash = await sha256(token);

  const result = await withDatabase(env, async (db) => db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.sessionTokenHash, tokenHash), isNull(sessions.revokedAt))));

  return (result.rowCount ?? 0) > 0;
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
