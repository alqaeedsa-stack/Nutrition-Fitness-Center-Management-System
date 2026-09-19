import { and, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, customers, sessions, staffProfiles, users } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { passwordResetTokens } from '../db/password-reset';
import { getCompany } from '../db/company';
import { hashPassword, verifyPassword } from './password';
import { sendPasswordResetEmail } from './email';
import { getUserPermissionCodes } from './permissions';
import {
  clearSessionCookie,
  createSession,
  getAuthenticatedUser,
  revokeSession,
  sessionCookie,
} from './session';

const internationalPhoneSchema = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'رقم الجوال يجب أن يكون بصيغة دولية صحيحة');

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.union([internationalPhoneSchema, z.literal('')]).optional(),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(256),
  confirmPassword: z.string().min(10).max(256),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'كلمتا المرور غير متطابقتين' });
  }
});

const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });
const resetPasswordSchema = z.object({
  token: z.string().trim().min(40).max(200),
  password: z.string().min(10).max(256),
  confirmPassword: z.string().min(10).max(256),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'كلمتا المرور غير متطابقتين' });
  }
});

export type AuthBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  TURBOSMTP_CONSUMER_KEY?: string;
  TURBOSMTP_CONSUMER_SECRET?: string;
  TURBOSMTP_FROM_EMAIL?: string;
};
export const authRoutes = new Hono<{ Bindings: AuthBindings }>();

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

authRoutes.post('/register', async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات التسجيل غير صحيحة' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const data = body.data;
  const email = data.email.toLowerCase();
  const phone = data.phone || null;
  let stage = 'password_hash';

  try {
    const passwordHash = await hashPassword(data.password);
    stage = 'database_transaction';

    const created = await withDatabase(c.env, async (db) => {
      return db.transaction(async (tx) => {
        stage = 'company_lookup';
        const company = await getCompany(tx);
        if (!company) return { error: 'COMPANY_NOT_CONFIGURED' as const };

        stage = 'duplicate_email_check';
        const existingRows = await tx.select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const existing = existingRows[0];

        if (existing) {
          const customerAccount = await tx.select({ id: customerAccounts.id })
            .from(customerAccounts)
            .where(eq(customerAccounts.userId, existing.id))
            .limit(1);
          const staffProfile = await tx.select({ id: staffProfiles.id })
            .from(staffProfiles)
            .where(eq(staffProfiles.userId, existing.id))
            .limit(1);

          if (customerAccount[0] || staffProfile[0]) return { error: 'ACCOUNT_EXISTS' as const };
        }

        if (phone) {
          stage = 'duplicate_phone_check';
          const phoneRows = await tx.select({ id: users.id })
            .from(users)
            .where(eq(users.phone, phone))
            .limit(1);
          const phoneOwner = phoneRows[0];

          if (phoneOwner && (!existing || phoneOwner.id !== existing.id)) {
            return { error: 'PHONE_EXISTS' as const };
          }
        }

        let user;
        const customerNumber = `C-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

        if (existing) {
          stage = 'orphan_user_recovery';
          const recoveredRows = await tx.update(users)
            .set({ centerId: company.id, email, phone, passwordHash, status: 'active', updatedAt: new Date() })
            .where(eq(users.id, existing.id))
            .returning({ id: users.id, centerId: users.centerId, email: users.email, phone: users.phone, status: users.status });
          user = recoveredRows[0];
        } else {
          stage = 'user_insert';
          const userRows = await tx.insert(users).values({ centerId: company.id, email, phone, passwordHash, status: 'active' })
            .returning({ id: users.id, centerId: users.centerId, email: users.email, phone: users.phone, status: users.status });
          user = userRows[0];
        }

        if (!user) throw new Error('User insert/recovery returned no row');

        stage = 'customer_insert';
        const customerRows = await tx.insert(customers).values({
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
        if (!customer) throw new Error('Customer insert returned no row');

        stage = 'customer_account_insert';
        await tx.insert(customerAccounts).values({ customerId: customer.id, userId: user.id, status: 'active' });

        stage = 'audit_log_insert';
        await tx.insert(auditLogs).values({
          centerId: company.id,
          actorUserId: user.id,
          action: 'auth.register',
          resourceType: 'customer_account',
          resourceId: customer.id,
          result: 'success',
          ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
          userAgent: c.req.header('User-Agent') ?? undefined,
        });

        return { user };
      });
    });

    if ('error' in created) {
      if (created.error === 'COMPANY_NOT_CONFIGURED') {
        return c.json({ error: { code: 'COMPANY_NOT_CONFIGURED', message: 'لم يتم إعداد بيانات الشركة في النظام بعد' } }, 503);
      }
      if (created.error === 'PHONE_EXISTS') {
        return c.json({ error: { code: 'PHONE_ALREADY_EXISTS', message: 'رقم الجوال هذا مسجل مسبقًا. استخدم رقم جوال آخر أو اترك خانة الجوال فارغة.' } }, 409);
      }
      return c.json({ error: { code: 'ACCOUNT_EXISTS', message: 'يوجد حساب مسجل بهذا البريد الإلكتروني' } }, 409);
    }

    stage = 'session_create';
    const session = await createSession(c.env, created.user.id, c.req.raw);
    c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    return c.json({ user: { ...created.user, role: 'customer' as const }, expiresAt: session.expiresAt.toISOString() }, 201);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Customer registration failed', { stage, detail });
    return c.json({ error: { code: 'REGISTRATION_FAILED', message: 'تعذر إنشاء حساب العميل حاليًا' } }, 500);
  }
});

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات تسجيل الدخول غير صحيحة' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const user = await withDatabase(c.env, async (db) => {
    const rows = await db.select().from(users)
      .where(body.data.portal === 'customer'
        ? eq(users.email, body.data.identifier.toLowerCase())
        : or(eq(users.email, body.data.identifier), eq(users.phone, body.data.identifier)))
      .limit(1);
    const candidate = rows[0];
    if (!candidate) return null;

    if (body.data.portal === 'customer') {
      const account = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.userId, candidate.id)).limit(1);
      if (!account[0]) return null;
    } else {
      const staff = await db.select({ id: staffProfiles.id, staffType: staffProfiles.staffType, active: staffProfiles.active }).from(staffProfiles).where(eq(staffProfiles.userId, candidate.id)).limit(1);
      if (!staff[0] || !staff[0].active) return null;
    }

    return candidate;
  });

  if (!user || user.status !== 'active' || !user.passwordHash || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة أو نوع الحساب لا يطابق مساحة الدخول' } }, 401);
  }
  const session = await createSession(c.env, user.id, c.req.raw);
  const staffProfile = body.data.portal === 'staff'
    ? await withDatabase(c.env, db => db.select({ staffType: staffProfiles.staffType, active: staffProfiles.active }).from(staffProfiles).where(eq(staffProfiles.userId, user.id)).limit(1))
    : [];
  await withDatabase(c.env, async (db) => db.insert(auditLogs).values({
    centerId: user.centerId,
    actorUserId: user.id,
    action: 'auth.login',
    resourceType: 'session',
    result: 'success',
    ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  }));
  c.header('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  return c.json({
    user: {
      id: user.id,
      centerId: user.centerId,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: body.data.portal,
      ...(body.data.portal === 'staff' ? { staffType: staffProfile[0]?.staffType ?? null, permissions: await getUserPermissionCodes(c.env, user.id) } : {}),
    },
    expiresAt: session.expiresAt.toISOString(),
  });
});

authRoutes.post('/logout', async (c) => {
  const user = await getAuthenticatedUser(c.env, c.req.raw);

  if (user) {
    await withDatabase(c.env, async (db) => db.insert(auditLogs).values({
      centerId: user.centerId,
      actorUserId: user.userId,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: user.sessionId,
      result: 'success',
      ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    }));
  }

  await revokeSession(c.env, c.req.raw);
  c.header('Set-Cookie', clearSessionCookie());
  return c.body(null, 204);
});

authRoutes.get('/me', async (c) => {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'تسجيل الدخول مطلوب' } }, 401);

  const role = await withDatabase(c.env, async (db) => {
    const staff = await db.select({ id: staffProfiles.id, staffType: staffProfiles.staffType, active: staffProfiles.active }).from(staffProfiles).where(eq(staffProfiles.userId, user.userId)).limit(1);
    if (staff[0]?.active) return { role: 'staff' as const, staffType: staff[0].staffType };
    const customer = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.userId, user.userId)).limit(1);
    if (customer[0]) return { role: 'customer' as const, staffType: null };
    return null;
  });

  if (!role) {
    await revokeSession(c.env, c.req.raw);
    return c.json({ error: { code: 'ACCOUNT_ROLE_MISSING', message: 'نوع الحساب غير محدد' } }, 403);
  }

  return c.json({ user: { id: user.userId, centerId: user.centerId, email: user.email, phone: user.phone, status: user.status, role: role.role, ...(role.role === 'staff' ? { staffType: role.staffType, permissions: await getUserPermissionCodes(c.env, user.userId) } : {}) } });
});

authRoutes.post('/forgot-password', async (c) => {
  const body = forgotPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'أدخل بريدًا إلكترونيًا صحيحًا' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const email = body.data.email.toLowerCase();
  const user = await withDatabase(c.env, async (db) => {
    const rows = await db.select({ id: users.id, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const candidate = rows[0];
    if (!candidate || candidate.status !== 'active' || !candidate.email) return null;
    const account = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.userId, candidate.id)).limit(1);
    return account[0] ? candidate : null;
  });

  if (!user) return c.json({ message: 'إذا كان البريد مسجلًا، ستصل رسالة إعادة تعيين كلمة المرور خلال دقائق.' });
  if (!user.email) return c.json({ error: { code: 'ACCOUNT_EMAIL_MISSING', message: 'حساب العميل لا يحتوي على بريد إلكتروني صالح لإعادة التعيين' } }, 500);

  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(rawToken)}`, c.req.url).toString();

  try {
    await withDatabase(c.env, async (db) => {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });
    });

    await sendPasswordResetEmail(c.env, user.email, resetUrl);
    return c.json({ message: 'إذا كان البريد مسجلًا، ستصل رسالة إعادة تعيين كلمة المرور خلال دقائق.' });
  } catch (error) {
    console.error('Password reset email failed', { detail: error instanceof Error ? error.message : String(error) });
    await withDatabase(c.env, async (db) => db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.tokenHash, tokenHash))));
    return c.json({ error: { code: 'PASSWORD_RESET_EMAIL_FAILED', message: 'تعذر إرسال رسالة إعادة تعيين كلمة المرور حاليًا' } }, 503);
  }
});

authRoutes.post('/reset-password', async (c) => {
  const body = resetPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات إعادة التعيين غير صحيحة' } }, 400);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  const tokenHash = await sha256Hex(body.data.token);
  const now = new Date();
  try {
    const result = await withDatabase(c.env, async (db) => db.transaction(async (tx) => {
      const rows = await tx.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
        .from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
        .limit(1);
      const token = rows[0];
      if (!token || token.expiresAt <= now) return { error: 'INVALID_OR_EXPIRED_TOKEN' as const };

      const passwordHash = await hashPassword(body.data.password);
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, token.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, token.id));
      await tx.delete(sessions).where(eq(sessions.userId, token.userId));
      return { success: true as const };
    }));

    if ('error' in result) return c.json({ error: { code: result.error, message: 'رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته' } }, 400);
    return c.json({ message: 'تم تحديث كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Password reset failed', { detail: error instanceof Error ? error.message : String(error) });
    return c.json({ error: { code: 'PASSWORD_RESET_FAILED', message: 'تعذر تحديث كلمة المرور حاليًا' } }, 500);
  }
});

export default authRoutes;
