import { and, asc, desc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { getAuthenticatedUser } from '../auth/session';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import {
  appointments,
  fitnessPlanExercises,
  fitnessPlans,
  measurementRecords,
  measurementTypes,
  nutritionPlanItems,
  nutritionPlans,
  products,
  customers,
  staffProfiles,
  users,
} from '../db/schema';
import { storeOrderItems, storeOrders } from '../db/store';
import { customerAccounts } from '../db/customer-accounts';

export type CustomerPortalBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const customerPortalRoutes = new Hono<{ Bindings: CustomerPortalBindings }>();


async function getCustomerContext(c: any) {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return { error: c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503) };
  }

  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) {
    return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };
  }

  const account = await withDatabase(c.env, async db => {
    const rows = await db.select({
      customerId: customerAccounts.customerId,
      status: customerAccounts.status,
    })
      .from(customerAccounts)
      .where(eq(customerAccounts.userId, user.userId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!account || account.status !== 'active') {
    return { error: c.json({ error: { code: 'CUSTOMER_ACCESS_REQUIRED', message: 'هذه الوحدة مخصصة للعملاء' } }, 403) };
  }

  return { user, customerId: account.customerId };
}


const CUSTOMER_APPOINTMENT_SPECIALIST_TYPES = ['doctor', 'nutritionist', 'trainer', 'specialist'] as const;

customerPortalRoutes.get('/appointment-options', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const staffRows = await withDatabase(c.env, db => db.select({
    id: users.id,
    name: staffProfiles.displayName,
    staffType: staffProfiles.staffType,
  }).from(users)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(and(
      eq(users.centerId, auth.user.centerId!),
      eq(users.status, 'active'),
      eq(staffProfiles.active, true),
      inArray(staffProfiles.staffType, [...CUSTOMER_APPOINTMENT_SPECIALIST_TYPES]),
    ))
    .orderBy(asc(staffProfiles.displayName)));

  return c.json({ staff: staffRows });
});

const customerAppointmentSchema = z.object({
  staffId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  appointmentType: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(2000).optional().nullable(),
});

customerPortalRoutes.post('/appointments', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const body = customerAppointmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الموعد غير صحيحة' } }, 400);
  }

  const data = body.data;
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (endsAt <= startsAt) {
    return c.json({ error: { code: 'INVALID_TIME_RANGE', message: 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية' } }, 400);
  }
  if (startsAt.getTime() <= Date.now()) {
    return c.json({ error: { code: 'PAST_APPOINTMENT', message: 'لا يمكن حجز موعد في وقت سابق' } }, 400);
  }

  const created = await withDatabase(c.env, async db => db.transaction(async tx => {
    const [staff] = await tx.select({ id: users.id }).from(users)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(
        eq(users.id, data.staffId),
        eq(users.centerId, auth.user.centerId!),
        eq(users.status, 'active'),
        eq(staffProfiles.active, true),
        inArray(staffProfiles.staffType, [...CUSTOMER_APPOINTMENT_SPECIALIST_TYPES]),
      )).limit(1);

    if (!staff) return { error: 'STAFF_NOT_FOUND' as const };

    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(
        eq(customers.id, auth.customerId),
        eq(customers.centerId, auth.user.centerId!),
        eq(customers.status, 'active'),
      )).limit(1);

    if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };

    const staffOverlap = await tx.select({ id: appointments.id }).from(appointments)
      .where(and(
        eq(appointments.centerId, auth.user.centerId!),
        eq(appointments.staffId, data.staffId),
        ne(appointments.status, 'cancelled'),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
      )).limit(1);

    if (staffOverlap[0]) return { error: 'STAFF_TIME_CONFLICT' as const };

    const customerOverlap = await tx.select({ id: appointments.id }).from(appointments)
      .where(and(
        eq(appointments.centerId, auth.user.centerId!),
        eq(appointments.customerId, auth.customerId),
        ne(appointments.status, 'cancelled'),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
      )).limit(1);

    if (customerOverlap[0]) return { error: 'CUSTOMER_TIME_CONFLICT' as const };

    const [row] = await tx.insert(appointments).values({
      centerId: auth.user.centerId!,
      customerId: auth.customerId,
      staffId: data.staffId,
      startsAt,
      endsAt,
      appointmentType: data.appointmentType,
      status: 'scheduled',
      notes: data.notes || null,
    }).returning();

    return { appointment: row };
  }));

  if ('error' in created) {
    const messages: Record<string, [string, number]> = {
      STAFF_NOT_FOUND: ['الموظف المختص غير موجود أو غير نشط', 404],
      CUSTOMER_NOT_FOUND: ['حساب العميل غير صالح للحجز', 403],
      STAFF_TIME_CONFLICT: ['هذا الوقت غير متاح مع الموظف المختص', 409],
      CUSTOMER_TIME_CONFLICT: ['لديك موعد آخر في نفس الفترة', 409],
    };
    const entry = messages[String(created.error)];
    if (!entry) return c.json({ error: { code: String(created.error), message: 'تعذر معالجة طلب الحجز' } }, 500);
    return c.json({ error: { code: created.error, message: entry[0] } }, entry[1] as any);
  }

  return c.json(created, 201);
});

customerPortalRoutes.patch('/appointments/:id/cancel', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const result = await withDatabase(c.env, async db => db.transaction(async tx => {
    const [existing] = await tx.select().from(appointments)
      .where(and(
        eq(appointments.id, c.req.param('id')),
        eq(appointments.customerId, auth.customerId),
        eq(appointments.centerId, auth.user.centerId!),
      )).limit(1);

    if (!existing) return { error: 'APPOINTMENT_NOT_FOUND' as const };
    if (['completed', 'cancelled', 'no_show'].includes(existing.status)) {
      return { error: 'APPOINTMENT_LOCKED' as const };
    }

    const [updated] = await tx.update(appointments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(appointments.id, existing.id),
        eq(appointments.customerId, auth.customerId),
        eq(appointments.centerId, auth.user.centerId!),
      )).returning();

    return { appointment: updated };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, number]> = {
      APPOINTMENT_NOT_FOUND: ['الموعد غير موجود', 404],
      APPOINTMENT_LOCKED: ['لا يمكن إلغاء هذا الموعد بعد إغلاقه', 409],
    };
    const entry = messages[String(result.error)];
    return c.json({ error: { code: result.error, message: entry?.[0] ?? 'تعذر إلغاء الموعد' } }, entry?.[1] as any ?? 500);
  }

  return c.json(result);
});

customerPortalRoutes.get('/measurements', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: measurementRecords.id,
    value: measurementRecords.value,
    measuredAt: measurementRecords.measuredAt,
    notes: measurementRecords.notes,
    typeCode: measurementTypes.code,
    typeName: measurementTypes.name,
    unit: measurementTypes.unit,
  })
    .from(measurementRecords)
    .innerJoin(measurementTypes, eq(measurementTypes.id, measurementRecords.measurementTypeId))
    .where(and(eq(measurementRecords.customerId, auth.customerId), eq(measurementRecords.centerId, auth.user.centerId!)))
    .orderBy(desc(measurementRecords.measuredAt)));

  return c.json({ measurements: rows });
});

customerPortalRoutes.get('/nutrition', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const plans = await withDatabase(c.env, db => db.select()
    .from(nutritionPlans)
    .where(and(eq(nutritionPlans.customerId, auth.customerId), eq(nutritionPlans.centerId, auth.user.centerId!)))
    .orderBy(desc(nutritionPlans.startDate), desc(nutritionPlans.version)));

  const planIds = plans.map(plan => plan.id);
  const items = planIds.length
    ? await withDatabase(c.env, db => db.select()
      .from(nutritionPlanItems)
      .where(inArray(nutritionPlanItems.nutritionPlanId, planIds))
      .orderBy(asc(nutritionPlanItems.sortOrder), asc(nutritionPlanItems.mealType)))
    : [];

  return c.json({ plans: plans.map(plan => ({
    ...plan,
    items: items.filter(item => item.nutritionPlanId === plan.id),
  })) });
});

customerPortalRoutes.get('/fitness', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const plans = await withDatabase(c.env, db => db.select()
    .from(fitnessPlans)
    .where(and(eq(fitnessPlans.customerId, auth.customerId), eq(fitnessPlans.centerId, auth.user.centerId!)))
    .orderBy(desc(fitnessPlans.startDate), desc(fitnessPlans.version)));

  const planIds = plans.map(plan => plan.id);
  const exercises = planIds.length
    ? await withDatabase(c.env, db => db.select()
      .from(fitnessPlanExercises)
      .where(inArray(fitnessPlanExercises.fitnessPlanId, planIds))
      .orderBy(asc(fitnessPlanExercises.sortOrder), asc(fitnessPlanExercises.exerciseName)))
    : [];

  return c.json({ plans: plans.map(plan => ({
    ...plan,
    exercises: exercises.filter(exercise => exercise.fitnessPlanId === plan.id),
  })) });
});

customerPortalRoutes.get('/appointments', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    appointmentType: appointments.appointmentType,
    status: appointments.status,
    notes: appointments.notes,
  })
    .from(appointments)
    .where(and(eq(appointments.customerId, auth.customerId), eq(appointments.centerId, auth.user.centerId!)))
    .orderBy(desc(appointments.startsAt)));

  return c.json({ appointments: rows });
});

customerPortalRoutes.get('/orders', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const orderRows = await withDatabase(c.env, db => db.select()
    .from(storeOrders)
    .where(and(eq(storeOrders.customerId, auth.customerId), eq(storeOrders.centerId, auth.user.centerId!)))
    .orderBy(desc(storeOrders.createdAt)));

  const orderIds = orderRows.map(order => order.id);
  const items = orderIds.length
    ? await withDatabase(c.env, db => db.select()
      .from(storeOrderItems)
      .where(inArray(storeOrderItems.orderId, orderIds)))
    : [];

  return c.json({ orders: orderRows.map(order => ({
    ...order,
    items: items.filter(item => item.orderId === order.id),
  })) });
});

customerPortalRoutes.get('/store/products', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    categoryId: products.categoryId,
    brandId: products.brandId,
    productType: products.productType,
    sellingPrice: products.sellingPrice,
    taxCode: products.taxCode,
  })
    .from(products)
    .where(and(eq(products.centerId, auth.user.centerId!), eq(products.active, true)))
    .orderBy(asc(products.name)));

  return c.json({ products: rows });
});
