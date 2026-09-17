import { and, eq, gt, isNull } from 'drizzle-orm';
import { passwordResetTokens, users } from '../db/schema';
import { hashPassword } from './password';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function createResetToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function issuePasswordReset(db: any, userId: string, requestedIp?: string, userAgent?: string) {
  const rawToken = createResetToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
    requestedIp: requestedIp ?? null,
    userAgent: userAgent ?? null,
  });

  return { rawToken, expiresAt };
}

export async function consumePasswordReset(db: any, rawToken: string, newPassword: string) {
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();

  return db.transaction(async (tx: any) => {
    const rows = await tx
      .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, now),
        isNull(passwordResetTokens.usedAt),
      ))
      .limit(1);

    const token = rows[0];
    if (!token) return false;

    const passwordHash = await hashPassword(newPassword);
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, token.userId));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, token.id));
    return true;
  });
}
