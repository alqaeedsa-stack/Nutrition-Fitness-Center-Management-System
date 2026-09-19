import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { customers, nutritionPlanItems, nutritionPlans, staffProfiles, users } from '../db/schema';
import { requirePermission } from '../auth/permissions';

export type NutritionBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const nutritionRoutes = new Hono<{ Bindings: NutritionBindings }>();

async function auth(c: any, permission: 'nutrition.read' | 'nutrition.write') {
  const result = await requirePermission(c, permission);
  if ('error' in result) return result;
  if (!result.user.centerId) return { error: c.json({ error: { code: 'CENTER_REQUIRED', message: 'الحساب غير مرتبط بمركز' } }, 403) };
  return result;
}

const planSchema = z.object({
  customerId: z.string().uuid(),
  specialistId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  goals: z.string().trim().max(5000).optional().nullable(),
  startDate: z.string().date(),
  endDate: z.string().date().optional().nullable(),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']).default('draft'),
});

function validPlanStatusTransition(current: string, next: string) {
  if (current === next) return true;
  const allowed: Record<string, string[]> = { draft: ['active', 'cancelled'], active: ['completed', 'cancelled'], completed: [], cancelled: [] };
  return (allowed[current] ?? []).includes(next);
}

const itemSchema = z.object({
  mealType: z.string().trim().min(2).max(50),
  itemName: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().nonnegative().optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  calories: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});

nutritionRoutes.get('/', async c => {
  const a = await auth(c, 'nutrition.read');
  if ('error' in a) return a.error;
  const plans = await withDatabase(c.env, db => db.select({
    id: nutritionPlans.id, customerId: nutritionPlans.customerId, specialistId: nutritionPlans.specialistId,
    title: nutritionPlans.title, goals: nutritionPlans.goals, startDate: nutritionPlans.startDate,
    endDate: nutritionPlans.endDate, status: nutritionPlans.status, version: nutritionPlans.version,
    customerName: customers.firstName, customerLastName: customers.lastName,
    specialistName: staffProfiles.displayName,
  }).from(nutritionPlans)
    .innerJoin(customers, eq(customers.id, nutritionPlans.customerId))
    .innerJoin(users, eq(users.id, nutritionPlans.specialistId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(eq(nutritionPlans.centerId, a.user.centerId!))
    .orderBy(desc(nutritionPlans.startDate), desc(nutritionPlans.version)));

  const ids = plans.map(p => p.id);
  const items = ids.length ? await withDatabase(c.env, db => db.select().from(nutritionPlanItems)
    .where(inArray(nutritionPlanItems.nutritionPlanId, ids))
    .orderBy(asc(nutritionPlanItems.sortOrder), asc(nutritionPlanItems.mealType))) : [];

  return c.json({ plans: plans.map(p => ({ ...p, items: items.filter(i => i.nutritionPlanId === p.id) })) });
});

nutritionRoutes.get('/options', async c => {
  const a = await auth(c, 'nutrition.read');
  if ('error' in a) return a.error;
  const [customerRows, specialistRows] = await Promise.all([
    withDatabase(c.env, db => db.select({ id: customers.id, name: customers.firstName, lastName: customers.lastName, customerNumber: customers.customerNumber })
      .from(customers).where(and(eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active')))
      .orderBy(asc(customers.firstName))),
    withDatabase(c.env, db => db.select({ id: users.id, name: staffProfiles.displayName, staffType: staffProfiles.staffType })
      .from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true)))
      .orderBy(asc(staffProfiles.displayName))),
  ]);
  return c.json({ customers: customerRows, specialists: specialistRows });
});

nutritionRoutes.post('/', async c => {
  const a = await auth(c, 'nutrition.write');
  if ('error' in a) return a.error;
  const parsed = planSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الخطة غير صحيحة' } }, 400);
  const d = parsed.data;
  if (['completed', 'cancelled'].includes(d.status)) return c.json({ error: { code: 'INVALID_INITIAL_STATUS', message: 'لا يمكن إنشاء خطة بحالة مكتملة أو ملغاة' } }, 400);
  if (d.endDate && d.endDate < d.startDate) return c.json({ error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ نهاية الخطة يجب أن يكون بعد تاريخ البداية' } }, 400);

  const result = await withDatabase(c.env, async db => db.transaction(async tx => {
    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, d.customerId), eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active'))).limit(1);
    const [specialist] = await tx.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.id, d.specialistId), eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true))).limit(1);
    if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
    if (!specialist) return { error: 'SPECIALIST_NOT_FOUND' as const };
    const [row] = await tx.insert(nutritionPlans).values({
      centerId: a.user.centerId!, customerId: d.customerId, specialistId: d.specialistId,
      title: d.title, goals: d.goals || null, startDate: d.startDate, endDate: d.endDate || null, status: d.status,
    }).returning();
    return { plan: row };
  }));
  if ('error' in result) {
    const m: Record<string, [string, number]> = { CUSTOMER_NOT_FOUND: ['العميل غير موجود داخل هذا المركز', 404], SPECIALIST_NOT_FOUND: ['الأخصائي غير موجود أو غير نشط', 404] };
    const entry = m[String(result.error)];
    if (!entry) return c.json({ error: { code: String(result.error), message: 'تعذر معالجة الطلب' } }, 500);
    const [message, status] = entry;
    return c.json({ error: { code: result.error, message } }, status as any);
  }
  return c.json(result, 201);
});

nutritionRoutes.patch('/:id', async c => {
  const a = await auth(c, 'nutrition.write');
  if ('error' in a) return a.error;
  const parsed = planSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الخطة غير صحيحة' } }, 400);
  const d = parsed.data;
  const [existing] = await withDatabase(c.env, db => db.select().from(nutritionPlans)
    .where(and(eq(nutritionPlans.id, c.req.param('id')), eq(nutritionPlans.centerId, a.user.centerId!))).limit(1));
  if (!existing) return c.json({ error: { code: 'PLAN_NOT_FOUND', message: 'الخطة الغذائية غير موجودة' } }, 404);
  const nextStatus = d.status ?? existing.status;
  if (!validPlanStatusTransition(existing.status, nextStatus)) return c.json({ error: { code: 'INVALID_STATUS_TRANSITION', message: 'لا يمكن الانتقال من حالة الخطة الحالية إلى الحالة المطلوبة' } }, 409);
  const editingStructure = d.customerId !== undefined || d.specialistId !== undefined || d.title !== undefined || d.goals !== undefined || d.startDate !== undefined || d.endDate !== undefined;
  if (['completed', 'cancelled'].includes(existing.status) && editingStructure) return c.json({ error: { code: 'PLAN_LOCKED', message: 'لا يمكن تعديل بيانات الخطة بعد إكمالها أو إلغائها' } }, 409);
  if (['completed', 'cancelled'].includes(nextStatus) && existing.status === nextStatus) return c.json({ error: { code: 'PLAN_LOCKED', message: 'الخطة مغلقة ولا تقبل تعديلات' } }, 409);
  const startDate = d.startDate ?? existing.startDate;
  const endDate = d.endDate !== undefined ? d.endDate : existing.endDate;
  if (endDate && endDate < startDate) return c.json({ error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ نهاية الخطة يجب أن يكون بعد تاريخ البداية' } }, 400);

  if (d.customerId) {
    const [row] = await withDatabase(c.env, db => db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, d.customerId!), eq(customers.centerId, a.user.centerId!))).limit(1));
    if (!row) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود داخل هذا المركز' } }, 404);
  }
  if (d.specialistId) {
    const [row] = await withDatabase(c.env, db => db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.id, d.specialistId!), eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true))).limit(1));
    if (!row) return c.json({ error: { code: 'SPECIALIST_NOT_FOUND', message: 'الأخصائي غير موجود أو غير نشط' } }, 404);
  }

  const [updated] = await withDatabase(c.env, db => db.update(nutritionPlans).set({
    ...(d.customerId ? { customerId: d.customerId } : {}),
    ...(d.specialistId ? { specialistId: d.specialistId } : {}),
    ...(d.title ? { title: d.title } : {}),
    ...(d.goals !== undefined ? { goals: d.goals || null } : {}),
    ...(d.startDate ? { startDate: d.startDate } : {}),
    ...(d.endDate !== undefined ? { endDate: d.endDate || null } : {}),
    ...(d.status ? { status: d.status } : {}),
    version: existing.version + 1, updatedAt: new Date(),
  }).where(and(eq(nutritionPlans.id, existing.id), eq(nutritionPlans.centerId, a.user.centerId!))).returning());
  return c.json({ plan: updated });
});

nutritionRoutes.post('/:id/items', async c => {
  const a = await auth(c, 'nutrition.write');
  if ('error' in a) return a.error;
  const parsed = itemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الوجبة غير صحيحة' } }, 400);
  const d = parsed.data;
  const [plan] = await withDatabase(c.env, db => db.select({ id: nutritionPlans.id, status: nutritionPlans.status }).from(nutritionPlans)
    .where(and(eq(nutritionPlans.id, c.req.param('id')), eq(nutritionPlans.centerId, a.user.centerId!))).limit(1));
  if (!plan) return c.json({ error: { code: 'PLAN_NOT_FOUND', message: 'الخطة الغذائية غير موجودة' } }, 404);
  if (['completed', 'cancelled'].includes(plan.status)) return c.json({ error: { code: 'PLAN_LOCKED', message: 'لا يمكن تعديل خطة مكتملة أو ملغاة' } }, 409);
  const [item] = await withDatabase(c.env, db => db.insert(nutritionPlanItems).values({
    nutritionPlanId: plan.id, mealType: d.mealType, itemName: d.itemName, quantity: d.quantity == null ? null : String(d.quantity),
    unit: d.unit || null, calories: d.calories == null ? null : String(d.calories), notes: d.notes || null, sortOrder: d.sortOrder,
  }).returning());
  return c.json({ item }, 201);
});

nutritionRoutes.patch('/:id/items/:itemId', async c => {
  const a = await auth(c, 'nutrition.write');
  if ('error' in a) return a.error;
  const parsed = itemSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الوجبة غير صحيحة' } }, 400);
  const [item] = await withDatabase(c.env, db => db.select({ id: nutritionPlanItems.id, planStatus: nutritionPlans.status }).from(nutritionPlanItems)
    .innerJoin(nutritionPlans, eq(nutritionPlans.id, nutritionPlanItems.nutritionPlanId))
    .where(and(eq(nutritionPlanItems.id, c.req.param('itemId')), eq(nutritionPlans.id, c.req.param('id')), eq(nutritionPlans.centerId, a.user.centerId!))).limit(1));
  if (!item) return c.json({ error: { code: 'ITEM_NOT_FOUND', message: 'عنصر الخطة غير موجود' } }, 404);
  if (['completed', 'cancelled'].includes(item.planStatus)) return c.json({ error: { code: 'PLAN_LOCKED', message: 'لا يمكن تعديل خطة مكتملة أو ملغاة' } }, 409);
  const d = parsed.data;
  const [updated] = await withDatabase(c.env, db => db.update(nutritionPlanItems).set({
    ...(d.mealType ? { mealType: d.mealType } : {}), ...(d.itemName ? { itemName: d.itemName } : {}),
    ...(d.quantity !== undefined ? { quantity: d.quantity == null ? null : String(d.quantity) } : {}),
    ...(d.unit !== undefined ? { unit: d.unit || null } : {}), ...(d.calories !== undefined ? { calories: d.calories == null ? null : String(d.calories) } : {}),
    ...(d.notes !== undefined ? { notes: d.notes || null } : {}), ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
  }).where(eq(nutritionPlanItems.id, item.id)).returning());
  return c.json({ item: updated });
});

nutritionRoutes.delete('/:id/items/:itemId', async c => {
  const a = await auth(c, 'nutrition.write');
  if ('error' in a) return a.error;
  const [item] = await withDatabase(c.env, db => db.select({ id: nutritionPlanItems.id }).from(nutritionPlanItems)
    .innerJoin(nutritionPlans, eq(nutritionPlans.id, nutritionPlanItems.nutritionPlanId))
    .where(and(eq(nutritionPlanItems.id, c.req.param('itemId')), eq(nutritionPlans.id, c.req.param('id')), eq(nutritionPlans.centerId, a.user.centerId!))).limit(1));
  if (!item) return c.json({ error: { code: 'ITEM_NOT_FOUND', message: 'عنصر الخطة غير موجود' } }, 404);
  await withDatabase(c.env, db => db.delete(nutritionPlanItems).where(eq(nutritionPlanItems.id, item.id)));
  return c.json({ ok: true });
});
