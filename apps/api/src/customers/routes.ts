import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { customers } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { withDatabase } from '../db/client';
import { getCompany } from '../db/company';
import { getAuthenticatedUser } from '../auth/session';

export type CustomerBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const customerRoutes = new Hono<{ Bindings: CustomerBindings }>();

async function requireStaffUser(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };

  const linkedCustomer = await withDatabase(c.env, async (db) => {
    const rows = await db.select({ id: customerAccounts.id, status: customerAccounts.status })
      .from(customerAccounts)
      .where(eq(customerAccounts.userId, user.userId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (linkedCustomer?.status === 'active') {
    return { error: c.json({ error: { code: 'STAFF_ACCESS_REQUIRED', message: 'هذه الوحدة مخصصة لموظفي المركز' } }, 403) };
  }

  return { user };
}

customerRoutes.get('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requireStaffUser(c); if ('error' in auth) return auth.error;
  const search = c.req.query('search')?.trim();
  const status = c.req.query('status')?.trim();
  const parsedLimit = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

  const rows = await withDatabase(c.env, db => db.select({
    id: customers.id,
    centerId: customers.centerId,
    customerNumber: customers.customerNumber,
    firstName: customers.firstName,
    lastName: customers.lastName,
    phone: customers.phone,
    email: customers.email,
    dateOfBirth: customers.dateOfBirth,
    gender: customers.gender,
    status: customers.status,
    source: customers.source,
    notes: customers.notes,
    createdAt: customers.createdAt,
    updatedAt: customers.updatedAt,
  })
    .from(customers)
    .where(and(
      ...(status ? [eq(customers.status, status)] : []),
      ...(search ? [or(
        ilike(customers.firstName, `%${search}%`),
        ilike(customers.lastName, `%${search}%`),
        ilike(customers.phone, `%${search}%`),
        ilike(customers.customerNumber, `%${search}%`),
      )!] : []),
    ))
    .orderBy(desc(customers.createdAt))
    .limit(limit));

  return c.json({ customers: rows });
});

customerRoutes.get('/:id', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requireStaffUser(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(customers).where(eq(customers.id, c.req.param('id'))).limit(1));
  if (!rows[0]) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  return c.json({ customer: rows[0] });
});

customerRoutes.post('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requireStaffUser(c); if ('error' in auth) return auth.error;
  const body = await c.req.json<{ customerNumber?: string; firstName?: string; lastName?: string; phone?: string; email?: string; dateOfBirth?: string; gender?: string; source?: string; notes?: string }>();
  const customerNumber = body.customerNumber?.trim();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const phone = body.phone?.trim();
  if (!customerNumber || !firstName || !lastName || !phone) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'رقم العميل والاسم الأول واسم العائلة والجوال حقول مطلوبة' } }, 400);

  const created = await withDatabase(c.env, async db => {
    const company = await getCompany(db);
    if (!company) return { companyMissing: true as const };
    const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerNumber, customerNumber)).limit(1);
    if (existing[0]) return { conflict: true as const };
    const values = {
      centerId: company.id,
      customerNumber,
      firstName,
      lastName,
      phone,
      ...(body.email?.trim() ? { email: body.email.trim() } : {}),
      ...(body.dateOfBirth ? { dateOfBirth: body.dateOfBirth } : {}),
      ...(body.gender?.trim() ? { gender: body.gender.trim() } : {}),
      ...(body.source?.trim() ? { source: body.source.trim() } : {}),
      ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
      createdBy: auth.user.userId,
      updatedBy: auth.user.userId,
    };
    const rows = await db.insert(customers).values(values).returning();
    return { customer: rows[0] };
  });

  if ('companyMissing' in created) return c.json({ error: { code: 'COMPANY_NOT_CONFIGURED', message: 'لم يتم إعداد بيانات الشركة في النظام بعد' } }, 503);
  if ('conflict' in created) return c.json({ error: { code: 'CUSTOMER_NUMBER_EXISTS', message: 'رقم العميل مستخدم بالفعل' } }, 409);
  return c.json({ customer: created.customer }, 201);
});
