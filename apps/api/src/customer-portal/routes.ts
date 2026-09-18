import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getAuthenticatedUser } from '../auth/session';
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
  saleItems,
  sales,
} from '../db/schema';
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
    .where(eq(measurementRecords.customerId, auth.customerId))
    .orderBy(desc(measurementRecords.measuredAt)));

  return c.json({ measurements: rows });
});

customerPortalRoutes.get('/nutrition', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const plans = await withDatabase(c.env, db => db.select()
    .from(nutritionPlans)
    .where(eq(nutritionPlans.customerId, auth.customerId))
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
    .where(eq(fitnessPlans.customerId, auth.customerId))
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
    .where(eq(appointments.customerId, auth.customerId))
    .orderBy(desc(appointments.startsAt)));

  return c.json({ appointments: rows });
});

customerPortalRoutes.get('/orders', async c => {
  const auth = await getCustomerContext(c);
  if ('error' in auth) return auth.error;

  const orderRows = await withDatabase(c.env, db => db.select()
    .from(sales)
    .where(eq(sales.customerId, auth.customerId))
    .orderBy(desc(sales.createdAt)));

  const orderIds = orderRows.map(order => order.id);
  const items = orderIds.length
    ? await withDatabase(c.env, db => db.select({
      id: saleItems.id,
      saleId: saleItems.saleId,
      productId: saleItems.productId,
      productName: products.name,
      sku: products.sku,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      discount: saleItems.discount,
      tax: saleItems.tax,
      lineTotal: saleItems.lineTotal,
    })
      .from(saleItems)
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(inArray(saleItems.saleId, orderIds)))
    : [];

  return c.json({ orders: orderRows.map(order => ({
    ...order,
    items: items.filter(item => item.saleId === order.id),
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
