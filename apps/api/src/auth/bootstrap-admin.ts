import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, staffProfiles, users } from '../db/schema';
import { getCompany } from '../db/company';
import { hashPassword } from './password';

type BootstrapBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
};

const bootstrapAdminRoutes = new Hono<{ Bindings: BootstrapBindings }>();

const schema = z.object({
  token: z.string().trim().min(32).max(256),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(256),
  displayName: z.string().trim().min(2).max(200).default('مدير النظام'),
});

bootstrapAdminRoutes.post('/', async (c) => {
  const body = schema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات إنشاء المدير غير صحيحة' } }, 400);

  const configuredToken = c.env.BOOTSTRAP_ADMIN_TOKEN;
  if (!configuredToken) return c.json({ error: { code: 'BOOTSTRAP_DISABLED', message: 'إنشاء المدير الأول غير مفعّل على بيئة التشغيل' } }, 404);
  if (body.data.token !== configuredToken) return c.json({ error: { code: 'INVALID_BOOTSTRAP_TOKEN', message: 'رمز التهيئة غير صحيح' } }, 403);
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);

  try {
    const passwordHash = await hashPassword(body.data.password);
    const result = await withDatabase(c.env, async (db) => db.transaction(async (tx) => {
      const existingStaff = await tx.select({ id: staffProfiles.id }).from(staffProfiles).limit(1);
      if (existingStaff[0]) return { error: 'STAFF_ALREADY_EXISTS' as const };

      const email = body.data.email.toLowerCase();
      const existingUser = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existingUser[0]) return { error: 'EMAIL_ALREADY_EXISTS' as const };

      const company = await getCompany(tx);
      if (!company) return { error: 'COMPANY_NOT_CONFIGURED' as const };

      const userRows = await tx.insert(users).values({
        centerId: company.id,
        email,
        passwordHash,
        status: 'active',
      }).returning({ id: users.id, centerId: users.centerId, email: users.email, status: users.status });

      const user = userRows[0];
      if (!user) throw new Error('Admin user insert returned no row');

      await tx.insert(staffProfiles).values({
        userId: user.id,
        staffType: 'admin',
        displayName: body.data.displayName,
        active: true,
      });

      await tx.insert(auditLogs).values({
        centerId: company.id,
        actorUserId: user.id,
        action: 'auth.bootstrap_admin',
        resourceType: 'staff_profile',
        resourceId: user.id,
        result: 'success',
        ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return { user, centerName: company.name };
    });

    if ('error' in result) {
      if (result.error === 'STAFF_ALREADY_EXISTS') return c.json({ error: { code: result.error, message: 'تم إنشاء حساب موظف مسبقًا؛ تهيئة المدير الأول مغلقة.' } }, 409);
      if (result.error === 'EMAIL_ALREADY_EXISTS') return c.json({ error: { code: result.error, message: 'البريد الإلكتروني مستخدم مسبقًا.' } }, 409);
      return c.json({ error: { code: result.error, message: 'لم يتم إعداد المركز في النظام بعد.' } }, 503);
    }

    return c.json({
      success: true,
      message: 'تم إنشاء حساب المدير الأول. تهيئة المدير الأول أصبحت مغلقة تلقائيًا بعد الإنشاء.',
      user: result.user,
      centerName: result.centerName,
    }, 201);
  } catch (error) {
    console.error('Bootstrap admin creation failed', { detail: error instanceof Error ? error.message : String(error) });
    return c.json({ error: { code: 'BOOTSTRAP_ADMIN_FAILED', message: 'تعذر إنشاء حساب المدير الأول حاليًا' } }, 500);
  }
});

export { bootstrapAdminRoutes };
