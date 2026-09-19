import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appointments, customerFollowUps, customers, fitnessPlans, measurementRecords, measurementTypes, nutritionPlans, sales, staffProfiles, customerSubscriptions, products } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { withDatabase } from '../db/client';
import { requirePermission } from '../auth/permissions';

export type CustomerBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const customerRoutes = new Hono<{ Bindings: CustomerBindings }>();

const customerCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  dateOfBirth: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  source: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
});

const customerUpdateSchema = customerCreateSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal('')),
  dateOfBirth: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional().nullable().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().nullable().or(z.literal('')),
  source: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});


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

const subscriptionSchema = z.object({
  productId: z.string().uuid(),
  startDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  endDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  saleId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

customerRoutes.get('/:id/subscriptions', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.read'); if ('error' in auth) return auth.error;
  const customerId = c.req.param('id');
  const customer = await withDatabase(c.env, db => db.select({ id: customers.id })
    .from(customers).where(and(eq(customers.id, customerId), eq(customers.centerId, auth.user.centerId!))).limit(1));
  if (!customer[0]) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  const rows = await withDatabase(c.env, db => db.select({
    id: customerSubscriptions.id,
    productId: customerSubscriptions.productId,
    productName: products.name,
    sku: products.sku,
    saleId: customerSubscriptions.saleId,
    startDate: customerSubscriptions.startDate,
    endDate: customerSubscriptions.endDate,
    status: customerSubscriptions.status,
    unitPrice: customerSubscriptions.unitPrice,
    notes: customerSubscriptions.notes,
  }).from(customerSubscriptions)
    .innerJoin(products, eq(products.id, customerSubscriptions.productId))
    .where(and(eq(customerSubscriptions.customerId, customerId), eq(customerSubscriptions.centerId, auth.user.centerId!)))
    .orderBy(desc(customerSubscriptions.startDate)));
  return c.json({ subscriptions: rows });
});

customerRoutes.get('/:id/subscriptions/options', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'catalog.read'); if ('error' in auth) return auth.error;
  const customerId = c.req.param('id');
  const customer = await withDatabase(c.env, db => db.select({ id: customers.id })
    .from(customers).where(and(eq(customers.id, customerId), eq(customers.centerId, auth.user.centerId!))).limit(1));
  if (!customer[0]) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  const rows = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name, sellingPrice: products.sellingPrice,
  }).from(products).where(and(
    eq(products.centerId, auth.user.centerId!),
    eq(products.active, true),
    eq(products.productType, 'subscription'),
  )).orderBy(asc(products.name)));
  return c.json({ products: rows });
});

customerRoutes.post('/:id/subscriptions', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.update'); if ('error' in auth) return auth.error;
  const customerId = c.req.param('id');
  const parsed = subscriptionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الاشتراك غير صحيحة' } }, 400);
  const data = parsed.data;
  if (data.endDate < data.startDate) return c.json({ error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const customer = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'))).limit(1);
    if (!customer[0]) return { error: 'CUSTOMER_NOT_FOUND' as const };

    const product = await tx.select({ id: products.id, sellingPrice: products.sellingPrice, productType: products.productType, active: products.active })
      .from(products).where(and(
        eq(products.id, data.productId),
        eq(products.centerId, auth.user.centerId!),
        eq(products.active, true),
      )).limit(1);
    if (!product[0] || product[0].productType !== 'subscription') return { error: 'SUBSCRIPTION_PRODUCT_REQUIRED' as const };

    if (data.saleId) {
      const sale = await tx.select({ id: sales.id }).from(sales).where(and(
        eq(sales.id, data.saleId),
        eq(sales.centerId, auth.user.centerId!),
        eq(sales.customerId, customerId),
      )).limit(1);
      if (!sale[0]) return { error: 'SALE_NOT_FOUND' as const };
    }

    const overlap = await tx.select({ id: customerSubscriptions.id }).from(customerSubscriptions).where(and(
      eq(customerSubscriptions.customerId, customerId),
      eq(customerSubscriptions.centerId, auth.user.centerId!),
      eq(customerSubscriptions.productId, data.productId),
      eq(customerSubscriptions.status, 'active'),
      lte(customerSubscriptions.startDate, data.endDate),
      gte(customerSubscriptions.endDate, data.startDate),
    )).limit(1);
    if (overlap[0]) return { error: 'SUBSCRIPTION_OVERLAP' as const };

    const [row] = await tx.insert(customerSubscriptions).values({
      centerId: auth.user.centerId!,
      customerId,
      productId: data.productId,
      saleId: data.saleId ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'active',
      unitPrice: product[0].sellingPrice,
      notes: data.notes || null,
      createdBy: auth.user.userId,
      updatedBy: auth.user.userId,
    }).returning();
    return { subscription: row };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, number]> = {
      CUSTOMER_NOT_FOUND: ['العميل غير موجود أو غير نشط', 404],
      SUBSCRIPTION_PRODUCT_REQUIRED: ['يجب اختيار منتج من نوع اشتراك', 409],
      SALE_NOT_FOUND: ['عملية البيع غير موجودة أو لا تخص هذا العميل', 409],
      SUBSCRIPTION_OVERLAP: ['يوجد اشتراك نشط لنفس المنتج داخل نفس الفترة', 409],
    };
    const entry = messages[result.error];
    return c.json({ error: { code: result.error, message: entry?.[0] ?? 'تعذر إنشاء الاشتراك' } }, entry?.[1] ?? 409);
  }
  return c.json({ subscription: result.subscription }, 201);
});

customerRoutes.post('/', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  const auth = await requirePermission(c, 'customers.create'); if ('error' in auth) return auth.error;
  const parsed = customerCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'بيانات العميل غير صحيحة' } }, 400);
  const body = parsed.data;
  const firstName = body.firstName;
  const lastName = body.lastName;
  const phone = body.phone;

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
  const parsed = customerUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'بيانات التعديل غير صحيحة' } }, 400);
  const body = parsed.data;
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
    const current = await db.select({ id: customers.id, status: customers.status })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.centerId, auth.user.centerId!)))
      .limit(1);

    if (!current[0]) return { notFound: true as const };
    if (current[0].status === 'inactive') return { alreadyInactive: true as const };

    const rows = await db.update(customers)
      .set({ status: 'inactive', updatedBy: auth.user.userId, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.centerId, auth.user.centerId!)))
      .returning({ id: customers.id, status: customers.status });

    return rows[0] ? { deactivated: true as const, customer: rows[0] } : { notFound: true as const };
  });

  if ('notFound' in result) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);
  if ('alreadyInactive' in result) return c.json({ error: { code: 'CUSTOMER_ALREADY_INACTIVE', message: 'العميل معطل بالفعل' } }, 409);
  return c.json({ customer: result.customer });
});
