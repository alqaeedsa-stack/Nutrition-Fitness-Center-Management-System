import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { customers } from '../db/schema';
import { withDatabase } from '../db/client';
import { getAuthenticatedUser } from '../auth/session';

export type CustomerBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const customerRoutes = new Hono<{ Bindings: CustomerBindings }>();

customerRoutes.get('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  if (!user.centerId) return c.json({ error: { code: 'CENTER_NOT_ASSIGNED', message: 'المستخدم غير مرتبط بمركز' } }, 403);

  const search = c.req.query('search')?.trim();
  const status = c.req.query('status')?.trim();
  const parsedLimit = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

  const rows = await withDatabase(c.env, (db) => db.select({
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
  }).from(customers).where(and(
    eq(customers.centerId, user.centerId),
    ...(status ? [eq(customers.status, status)] : []),
    ...(search ? [or(
      ilike(customers.firstName, `%${search}%`),
      ilike(customers.lastName, `%${search}%`),
      ilike(customers.phone, `%${search}%`),
      ilike(customers.customerNumber, `%${search}%`),
    )!] : []),
  )).orderBy(desc(customers.createdAt)).limit(limit));

  return c.json({ customers: rows });
});

customerRoutes.get('/:id', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  if (!user.centerId) return c.json({ error: { code: 'CENTER_NOT_ASSIGNED', message: 'المستخدم غير مرتبط بمركز' } }, 403);

  const id = c.req.param('id');
  const customer = await withDatabase(c.env, async (db) => {
    const rows = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.centerId, user.centerId))).limit(1);
    return rows[0] ?? null;
  });

  if (!customer) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  return c.json({ customer });
});

customerRoutes.post('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);
  if (!user.centerId) return c.json({ error: { code: 'CENTER_NOT_ASSIGNED', message: 'المستخدم غير مرتبط بمركز' } }, 403);

  const body = await c.req.json<{
    customerNumber?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    source?: string | null;
    notes?: string | null;
  }>();

  const customerNumber = body.customerNumber?.trim();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const phone = body.phone?.trim();
  if (!customerNumber || !firstName || !lastName || !phone) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'رقم العميل والاسم الأول واسم العائلة والجوال حقول مطلوبة' } }, 400);
  }

  const created = await withDatabase(c.env, async (db) => {
    const existing = await db.select({ id: customers.id }).from(customers).where(and(
      eq(customers.centerId, user.centerId),
      eq(customers.customerNumber, customerNumber),
    )).limit(1);
    if (existing[0]) return { conflict: true as const };

    const rows = await db.insert(customers).values({
      centerId: user.centerId,
      customerNumber,
      firstName,
      lastName,
      phone,
      email: body.email?.trim() || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender?.trim() || null,
      source: body.source?.trim() || null,
      notes: body.notes?.trim() || null,
      createdBy: user.userId,
      updatedBy: user.userId,
    }).returning();
    return { customer: rows[0] };
  });

  if ('conflict' in created) {
    return c.json({ error: { code: 'CUSTOMER_NUMBER_EXISTS', message: 'رقم العميل مستخدم بالفعل داخل هذا المركز' } }, 409);
  }

  return c.json({ customer: created.customer }, 201);
});
