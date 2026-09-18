import { eq, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, staffProfiles, users } from '../db/schema';
import { getCompany } from '../db/company';
import { getAuthenticatedUser } from '../auth/session';
import { hashPassword } from '../auth/password';

export type StaffBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const staffRoutes = new Hono<{ Bindings: StaffBindings }>();

const staffTypeSchema = z.enum([
  'admin',
  'doctor',
  'nutritionist',
  'trainer',
  'employee',
  'cashier',
  'warehouse',
]);

const createStaffSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  staffType: staffTypeSchema,
  email: z.string().trim().email().max(320),
  phone: z.union([z.string().trim().regex(/^\+[1-9]\d{6,14}$/), z.literal('')]).optional(),
  password: z.string().min(10).max(256),
});

async function requireAdmin(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) {
    return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };
  }

  const profile = await withDatabase(c.env, async db => {
    const rows = await db.select({
      id: staffProfiles.id,
      staffType: staffProfiles.staffType,
      active: staffProfiles.active,
    })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, user.userId))
      .limit(1);

    return rows[0] ?? null;
  });

  if (!profile?.active || profile.staffType !== 'admin') {
    return { error: c.json({ error: { code: 'ADMIN_ACCESS_REQUIRED', message: 'إدارة الموظفين متاحة لحسابات الإدارة فقط' } }, 403) };
  }

  return { user, profile };
}

staffRoutes.get('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: staffProfiles.id,
    userId: users.id,
    displayName: staffProfiles.displayName,
    staffType: staffProfiles.staffType,
    active: staffProfiles.active,
    email: users.email,
    phone: users.phone,
    createdAt: staffProfiles.createdAt,
  })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .orderBy(staffProfiles.createdAt));

  return c.json({ staff: rows });
});

staffRoutes.post('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = createStaffSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الموظف غير صحيحة' } }, 400);
  }

  const data = body.data;
  const email = data.email.toLowerCase();
  const phone = data.phone || null;
  const passwordHash = await hashPassword(data.password);

  const created = await withDatabase(c.env, async db => db.transaction(async tx => {
    const company = await getCompany(tx);
    if (!company) return { error: 'COMPANY_NOT_CONFIGURED' as const };

    const existing = await tx.select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(or(eq(users.email, email), ...(phone ? [eq(users.phone, phone)] : [])))
      .limit(1);

    if (existing[0]) {
      if (existing[0].email?.toLowerCase() === email) return { error: 'EMAIL_EXISTS' as const };
      return { error: 'PHONE_EXISTS' as const };
    }

    const userRows = await tx.insert(users).values({
      centerId: company.id,
      email,
      phone,
      passwordHash,
      status: 'active',
      createdBy: auth.user.userId,
      updatedBy: auth.user.userId,
    }).returning({
      id: users.id,
      centerId: users.centerId,
      email: users.email,
      phone: users.phone,
      status: users.status,
    });

    const user = userRows[0];
    if (!user) throw new Error('Staff user insert returned no row');

    const profileRows = await tx.insert(staffProfiles).values({
      userId: user.id,
      staffType: data.staffType,
      displayName: data.displayName,
      active: true,
    }).returning({ id: staffProfiles.id });

    const profile = profileRows[0];
    if (!profile) throw new Error('Staff profile insert returned no row');

    await tx.insert(auditLogs).values({
      centerId: company.id,
      actorUserId: auth.user.userId,
      action: 'staff.create',
      resourceType: 'staff_profile',
      resourceId: profile.id,
      result: 'success',
      metadata: { staffType: data.staffType },
      ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return {
      staff: {
        id: profile.id,
        userId: user.id,
        displayName: data.displayName,
        staffType: data.staffType,
        active: true,
        email: user.email,
        phone: user.phone,
      },
    };
  }));

  if ('error' in created) {
    if (created.error === 'COMPANY_NOT_CONFIGURED') {
      return c.json({ error: { code: 'COMPANY_NOT_CONFIGURED', message: 'لم يتم إعداد بيانات الشركة في النظام بعد' } }, 503);
    }
    if (created.error === 'EMAIL_EXISTS') {
      return c.json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'البريد الإلكتروني مستخدم بالفعل' } }, 409);
    }
    return c.json({ error: { code: 'PHONE_ALREADY_EXISTS', message: 'رقم الجوال مستخدم بالفعل' } }, 409);
  }

  return c.json({ staff: created.staff }, 201);
});
