import { Hono } from 'hono';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, users } from '../db/schema';
import { verifyPassword } from './password';
import {
  clearSessionCookie,
  createSession,
  getAuthenticatedUser,
  revokeSession,
  sessionCookie,
} from './session';

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
});

export type AuthBindings = {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
};

export const authRoutes = new Hono<{ Bindings: AuthBindings }>();

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات تسجيل الدخول غير صحيحة' } }, 400);
  }

  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const user = await withDatabase(c.env, async (db) => {
    const rows = await db.select().from(users)
      .where(or(eq(users.email, body.data.identifier), eq(users.phone, body.data.identifier)))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!user || user.status !== 'active' || !user.passwordHash || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' } }, 401);
  }

  const session = await createSession(c.env, user.id, c.req.raw);

  await withDatabase(c.env, async (db) => {
    await db.insert(auditLogs).values({
      centerId: user.centerId,
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'session',
      result: 'success',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
  });

  c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  return c.json({
    user: {
      id: user.id,
      centerId: user.centerId,
      email: user.email,
      phone: user.phone,
      status: user.status,
    },
    expiresAt: session.expiresAt.toISOString(),
  });
});

authRoutes.post('/logout', async (c) => {
  if (c.env.HYPERDRIVE || c.env.DATABASE_URL) {
    const user = await getAuthenticatedUser(c.env, c.req.raw);
    await revokeSession(c.env, c.req.raw);

    if (user) {
      await withDatabase(c.env, async (db) => {
        await db.insert(auditLogs).values({
          centerId: user.centerId,
          actorUserId: user.userId,
          action: 'auth.logout',
          resourceType: 'session',
          resourceId: user.sessionId,
          result: 'success',
          ipAddress: c.req.header('CF-Connecting-IP'),
          userAgent: c.req.header('User-Agent'),
        });
      });
    }
  }

  c.header('Set-Cookie', clearSessionCookie());
  return c.body(null, 204);
});

authRoutes.get('/me', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  }

  return c.json({ user });
});
