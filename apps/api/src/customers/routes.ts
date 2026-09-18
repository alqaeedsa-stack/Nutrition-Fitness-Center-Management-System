import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { appointments, customerFollowUps, customers, fitnessPlans, measurementRecords, measurementTypes, nutritionPlans, sales, staffProfiles } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { withDatabase } from '../db/client';
import { requirePermission } from '../auth/permissions';

export type CustomerBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const customerRoutes = new Hono<{ Bindings: CustomerBindings }>();


customerRoutes.get('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.read'); if ('error' in auth) return auth.error;
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
      eq(customers.centerId, auth.user.centerId!),
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
  const auth = await requirePermission(c, 'customers.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(customers).where(and(eq(customers.id, c.req.param('id')), eq(customers.centerId, auth.user.centerId!))).limit(1));
  if (!rows[0]) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  return c.json({ customer: rows[0] });
});

customerRoutes.get('/:id/360', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.read'); if ('error' in auth) return auth.error;
  const customerId = c.req.param('id');

  const result = await withDatabase(c.env, async db => {
    const customerRows = await db.select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.centerId, auth.user.centerId!))).limit(1);
    if (!customerRows[0]) return { notFound: true as const };

    const [measurements, nutrition, fitness, appointmentsRows, salesRows, followUps] = await Promise.all([
      db.select({
        id: measurementRecords.id,
        value: measurementRecords.value,
        measuredAt: measurementRecords.measuredAt,
        notes: measurementRecords.notes,
        typeName: measurementTypes.name,
        unit: measurementTypes.unit,
      }).from(measurementRecords)
        .innerJoin(measurementTypes, eq(measurementTypes.id, measurementRecords.measurementTypeId))
        .where(and(eq(measurementRecords.customerId, customerId), eq(measurementRecords.centerId, auth.user.centerId!)))
        .orderBy(desc(measurementRecords.measuredAt)).limit(50),
      db.select({
        id: nutritionPlans.id,
        title: nutritionPlans.title,
        goals: nutritionPlans.goals,
        startDate: nutritionPlans.startDate,
        endDate: nutritionPlans.endDate,
        status: nutritionPlans.status,
        version: nutritionPlans.version,
        specialistName: staffProfiles.displayName,
      }).from(nutritionPlans)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, nutritionPlans.specialistId))
        .where(and(eq(nutritionPlans.customerId, customerId), eq(nutritionPlans.centerId, auth.user.centerId!)))
        .orderBy(desc(nutritionPlans.createdAt)).limit(20),
      db.select({
        id: fitnessPlans.id,
        title: fitnessPlans.title,
        goals: fitnessPlans.goals,
        startDate: fitnessPlans.startDate,
        endDate: fitnessPlans.endDate,
        status: fitnessPlans.status,
        version: fitnessPlans.version,
        specialistName: staffProfiles.displayName,
      }).from(fitnessPlans)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, fitnessPlans.specialistId))
        .where(and(eq(fitnessPlans.customerId, customerId), eq(fitnessPlans.centerId, auth.user.centerId!)))
        .orderBy(desc(fitnessPlans.createdAt)).limit(20),
      db.select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        appointmentType: appointments.appointmentType,
        status: appointments.status,
        notes: appointments.notes,
        staffName: staffProfiles.displayName,
      }).from(appointments)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, appointments.staffId))
        .where(and(eq(appointments.customerId, customerId), eq(appointments.centerId, auth.user.centerId!)))
        .orderBy(desc(appointments.startsAt)).limit(30),
      db.select({
        id: sales.id,
        saleNumber: sales.saleNumber,
        status: sales.status,
        subtotal: sales.subtotal,
        discount: sales.discount,
        tax: sales.tax,
        total: sales.total,
        paymentStatus: sales.paymentStatus,
        createdAt: sales.createdAt,
      }).from(sales)
        .where(and(eq(sales.customerId, customerId), eq(sales.centerId, auth.user.centerId!)))
        .orderBy(desc(sales.createdAt)).limit(30),
      db.select({
        id: customerFollowUps.id,
        followUpAt: customerFollowUps.followUpAt,
        nextFollowUpAt: customerFollowUps.nextFollowUpAt,
        weight: customerFollowUps.weight,
        height: customerFollowUps.height,
        adherenceScore: customerFollowUps.adherenceScore,
        nutritionAdherenceScore: customerFollowUps.nutritionAdherenceScore,
        fitnessAdherenceScore: customerFollowUps.fitnessAdherenceScore,
        notes: customerFollowUps.notes,
        recommendations: customerFollowUps.recommendations,
        staffName: staffProfiles.displayName,
      }).from(customerFollowUps)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, customerFollowUps.staffId))
        .where(and(eq(customerFollowUps.customerId, customerId), eq(customerFollowUps.centerId, auth.user.centerId!)))
        .orderBy(desc(customerFollowUps.followUpAt)).limit(20),
    ]);

    return { customer: customerRows[0], measurements, nutrition, fitness, appointments: appointmentsRows, sales: salesRows, followUps };
  });

  if ('notFound' in result) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  return c.json(result);
});

customerRoutes.post('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.create'); if ('error' in auth) return auth.error;
  const body = await c.req.json<{ firstName?: string; lastName?: string; phone?: string; email?: string; dateOfBirth?: string; gender?: string; source?: string; notes?: string }>();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const phone = body.phone?.trim();
  if (!firstName || !lastName || !phone) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'الاسم الأول واسم العائلة والجوال حقول مطلوبة' } }, 400);

  const created = await withDatabase(c.env, async db => {
    const values = {
      centerId: auth.user.centerId!,
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

  return c.json({ customer: created.customer }, 201);
});

customerRoutes.patch('/:id', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.update'); if ('error' in auth) return auth.error;
  const body = await c.req.json<{ firstName?: string; lastName?: string; phone?: string; email?: string | null; dateOfBirth?: string | null; gender?: string | null; status?: string; source?: string | null; notes?: string | null }>();
  const data = {
    ...(body.firstName !== undefined ? { firstName: body.firstName.trim() } : {}),
    ...(body.lastName !== undefined ? { lastName: body.lastName.trim() } : {}),
    ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
    ...(body.email !== undefined ? { email: body.email?.trim() || null } : {}),
    ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth || null } : {}),
    ...(body.gender !== undefined ? { gender: body.gender?.trim() || null } : {}),
    ...(body.status !== undefined ? { status: body.status.trim() } : {}),
    ...(body.source !== undefined ? { source: body.source?.trim() || null } : {}),
    ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
    updatedBy: auth.user.userId,
    updatedAt: new Date(),
  };
  if (Object.keys(data).length <= 2) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'لم يتم إرسال أي بيانات للتعديل' } }, 400);
  if (data.firstName !== undefined && !data.firstName) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'الاسم الأول لا يمكن أن يكون فارغًا' } }, 400);
  if (data.lastName !== undefined && !data.lastName) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'اسم العائلة لا يمكن أن يكون فارغًا' } }, 400);

  const result = await withDatabase(c.env, async db => {
    const current = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, c.req.param('id')), eq(customers.centerId, auth.user.centerId!))).limit(1);
    if (!current[0]) return { notFound: true as const };
    const rows = await db.update(customers).set(data).where(and(eq(customers.id, c.req.param('id')), eq(customers.centerId, auth.user.centerId!))).returning();
    return rows[0] ? { customer: rows[0] } : { notFound: true as const };
  });
  if ('notFound' in result) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  return c.json({ customer: result.customer });
});

customerRoutes.delete('/:id', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.delete'); if ('error' in auth) return auth.error;
  const id = c.req.param('id');
  const result = await withDatabase(c.env, async db => {
    const current = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, id), eq(customers.centerId, auth.user.centerId!))).limit(1);
    if (!current[0]) return { notFound: true as const };
    const refs = await Promise.all([
      db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.customerId, id)).limit(1),
    ]);
    if (refs.some(rows => rows.length > 0)) return { dependent: true as const };
    try {
      const rows = await db.delete(customers).where(and(eq(customers.id, id), eq(customers.centerId, auth.user.centerId!))).returning({ id: customers.id });
      return rows[0] ? { deleted: true as const } : { notFound: true as const };
    } catch {
      return { dependent: true as const };
    }
  });
  if ('notFound' in result) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  if ('dependent' in result) return c.json({ error: { code: 'CUSTOMER_HAS_DEPENDENCIES', message: 'لا يمكن حذف العميل لوجود بيانات مرتبطة به. استخدم تعطيل الحساب بدلًا من الحذف.' } }, 409);
  return c.body(null, 204);
});
