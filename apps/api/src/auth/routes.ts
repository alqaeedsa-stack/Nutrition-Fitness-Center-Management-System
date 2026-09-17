import { or, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, customers, staffProfiles, users } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { getCompany } from '../db/company';
import { hashPassword, verifyPassword } from './password';
import {
  clearSessionCookie,
  createSession,
  getAuthenticatedUser,
  revokeSession,
  sessionCookie,
} from './session';

const saudiPhoneSchema = z.string().trim().regex(/^\+9665\d{8}$/, 'رقم الجوال يجب أن يكون بصيغة +9665XXXXXXXX');

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.union([saudiPhoneSchema, z.literal('')]).optional(),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(256),
  confirmPassword: z.string().min(10).max(256),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'كلمتا المرور غير متطابقتين' });
  }
});

export type AuthBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const authRoutes = new Hono<{ Bindings: AuthBindings }>();

authRoutes.post('/register', async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات التسجيل غير صحيحة' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const data = body.data;
  const email = data.email;
  const phone = data.phone || '';
  const passwordHash = await hashPassword(data.password);
  const created = await withDatabase(c.env, async (db) => {
    const company = await getCompany(db);
    if (!company) return { error: 'COMPANY_NOT_CONFIGURED' as const };

    const existing = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) return { error: 'ACCOUNT_EXISTS' as const };

    const customerNumber = `C-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const userRows = await db.insert(users).values({ centerId: company.id, email, phone: phone || null, passwordHash, status: 'active' })
      .returning({ id: users.id, centerId: users.centerId, email: users.email, phone: users.phone, status: users.status });
    const user = userRows[0];
    const customerRows = await db.insert(customers).values({
      centerId: company.id,
      customerNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      phone,
      email,
      status: 'active',
      createdBy: user.id,
      updatedBy: user.id,
    }).returning({ id: customers.id });
    const customer = customerRows[0];
    await db.insert(customerAccounts).values({ customerId: customer.id, userId: user.id, status: 'active' });
    await db.insert(auditLogs).values({
      centerId: company.id,
      actorUserId: user.id,
      action: 'auth.register',
      resourceType: 'customer_account',
      resourceId: customer.id,
      result: 'success',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
    return { user };
  });

  if ('error' in created) {
    if (created.error === 'COMPANY_NOT_CONFIGURED') {
      return c.json({ error: { code: 'COMPANY_NOT_CONFIGURED', message: 'لم يتم إعداد بيانات الشركة في النظام بعد' } }, 503);
    }
    return c.json({ error: { code: 'ACCOUNT_EXISTS', message: 'يوجد حساب مسجل بهذا البريد الإلكتروني' } }, 409);
  }

  const session = await createSession(c.env, created.user.id, c.req.raw);
  c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  return c.json({ user: created.user, expiresAt: session.expiresAt.toISOString() }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات تسجيل الدخول غير صحيحة' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const user = await withDatabase(c.env, async (db) => {
    const rows = await db.select().from(users)
      .where(body.data.portal === 'customer'
        ? eq(users.email, body.data.identifier)
        : or(eq(users.email, body.data.identifier), eq(users.phone, body.data.identifier)))
      .limit(1);
    const candidate = rows[0];
    if (!candidate) return null;

    if (body.data.portal === 'customer') {
      const account = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.userId, candidate.id)).limit(1);
      if (!account[0]) return null;
    } else {
      const staff = await db.select({ id: staffProfiles.id }).from(staffProfiles).where(eq(staffProfiles.userId, candidate.id)).limit(1);
      if (!staff[0]) return null;
    }

    return candidate;
  });

  if (!user || user.status !== 'active' || !user.passwordHash || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة أو نوع الحساب لا يطابق مساحة الدخول' } }, 401);
  }
  const session = await createSession(c.env, user.id, c.req.raw);
  await withDatabase(c.env, async (db) => db.insert(auditLogs).values({
    centerId: user.centerId,
    actorUserId: user.id,
    action: 'auth.login',
    resourceType: 'session',
    result: 'success',
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  }));
  c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  return c.json({ user: { id: user.id, centerId: user.centerId, email: user.email, phone: user.phone, status: user.status }, expiresAt: session.expiresAt.toISOString() });
});

authRoutes.post('/logout', async (c) => {
  if (c.env.HYPERDRIVE || c.env.DATABASE_URL) {
    const user = await getAuthenticatedUser(c.env, c.req.raw);
    await revokeSession(c.env, c.req.raw);
    if (user) await withDatabase(c.env, async (db) => db.insert(auditLogs).values({ centerId: user.centerId, actorUserId: user.userId, action: 'auth.logout', resourceType: 'session', resourceId: user.sessionId, result: 'success', ipAddress: c.req.header('CF-Connecting-IP'), userAgent: c.req.header('User-Agent') }));
  }
  c.header('Set-Cookie', clearSessionCookie());
  return c.body(null, 204);
});

authRoutes.get('/me', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  return c.json({ user });
});
