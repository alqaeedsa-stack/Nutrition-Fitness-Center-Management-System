import { eq, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, centers, customers, users } from '../db/schema';
import { customerAccounts } from './customer-account';
import { hashPassword, verifyPassword } from './password';
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

const customerRegistrationSchema = z.object({
  centerCode: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().max(320).optional().or(z.literal('')),
  password: z.string().min(10).max(256),
});

export type AuthBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const authRoutes = new Hono<{ Bindings: AuthBindings }>();

function isDatabaseConfigured(env: AuthBindings) {
  return Boolean(env.HYPERDRIVE || env.DATABASE_URL);
}

function registrationConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

authRoutes.get('/customer/centers', async (c) => {
  if (!isDatabaseConfigured(c.env)) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const availableCenters = await withDatabase(c.env, async (db) => db.select({
    code: centers.code,
    name: centers.name,
  }).from(centers).where(eq(centers.status, 'active')));

  return c.json({ centers: availableCenters });
});

authRoutes.post('/customer/register', async (c) => {
  const body = customerRegistrationSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات تسجيل العميل غير صحيحة' } }, 400);
  }

  if (!isDatabaseConfigured(c.env)) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const email = body.data.email ? body.data.email.toLowerCase() : null;
  const phone = body.data.phone;

  try {
    const result = await withDatabase(c.env, async (db) => db.transaction(async (tx) => {
      const centerRows = await tx.select({ id: centers.id, name: centers.name })
        .from(centers)
        .where(eq(centers.code, body.data.centerCode))
        .limit(1);
      const center = centerRows[0];

      if (!center) {
        return { error: 'CENTER_NOT_FOUND' as const };
      }

      const passwordHash = await hashPassword(body.data.password);
      const userRows = await tx.insert(users).values({
        centerId: center.id,
        email,
        phone,
        passwordHash,
        status: 'active',
      }).returning({ id: users.id });
      const user = userRows[0];

      if (!user) throw new Error('Customer user creation failed');

      const customerNumber = `CUS-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
      const customerRows = await tx.insert(customers).values({
        centerId: center.id,
        customerNumber,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        phone,
        email,
        status: 'active',
        source: 'self_registration',
        createdBy: user.id,
        updatedBy: user.id,
      }).returning({ id: customers.id, customerNumber: customers.customerNumber });
      const customer = customerRows[0];

      if (!customer) throw new Error('Customer creation failed');

      await tx.insert(customerAccounts).values({
        customerId: customer.id,
        userId: user.id,
        status: 'active',
      });

      await tx.insert(auditLogs).values({
        centerId: center.id,
        actorUserId: user.id,
        action: 'auth.customer_register',
        resourceType: 'customer_account',
        resourceId: customer.id,
        result: 'success',
        ipAddress: c.req.header('CF-Connecting-IP'),
        userAgent: c.req.header('User-Agent'),
      });

      return {
        userId: user.id,
        customerId: customer.id,
        customerNumber: customer.customerNumber,
        centerId: center.id,
      };
    }));

    if ('error' in result && result.error === 'CENTER_NOT_FOUND') {
      return c.json({ error: { code: 'CENTER_NOT_FOUND', message: 'المركز المطلوب غير موجود أو غير متاح للتسجيل' } }, 404);
    }

    const session = await createSession(c.env, result.userId, c.req.raw);
    c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));

    return c.json({
      user: {
        id: result.userId,
        centerId: result.centerId,
        email,
        phone,
        status: 'active',
        accountType: 'customer',
        customerId: result.customerId,
        customerNumber: result.customerNumber,
      },
      expiresAt: session.expiresAt.toISOString(),
    }, 201);
  } catch (error) {
    if (registrationConflict(error)) {
      return c.json({ error: { code: 'ACCOUNT_EXISTS', message: 'البريد الإلكتروني أو رقم الجوال مستخدم بالفعل' } }, 409);
    }
    throw error;
  }
});

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات تسجيل الدخول غير صحيحة' } }, 400);
  }

  if (!isDatabaseConfigured(c.env)) {
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

  const customerAccount = await withDatabase(c.env, async (db) => {
    const rows = await db.select({
      customerId: customerAccounts.customerId,
      status: customerAccounts.status,
    }).from(customerAccounts)
      .where(eq(customerAccounts.userId, user.id))
      .limit(1);
    return rows[0] ?? null;
  });

  if (customerAccount?.status !== undefined && customerAccount.status !== 'active') {
    return c.json({ error: { code: 'ACCOUNT_DISABLED', message: 'حساب العميل غير نشط' } }, 403);
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
      accountType: customerAccount ? 'customer' as const : 'staff' as const,
      customerId: customerAccount?.customerId ?? null,
    },
    expiresAt: session.expiresAt.toISOString(),
  });
});

authRoutes.post('/logout', async (c) => {
  if (isDatabaseConfigured(c.env)) {
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
  if (!isDatabaseConfigured(c.env)) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  }

  return c.json({ user });
});
