import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../auth/permissions';
import { withDatabase } from '../db/client';
import { customerFollowUps, customers, staffProfiles, users } from '../db/schema';

export type FollowUpBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const followUpRoutes = new Hono<{ Bindings: FollowUpBindings }>();

async function auth(c: any, permission: 'customers.read' | 'followups.write') {
  const result = await requirePermission(c, permission);
  if ('error' in result) return result;
  if (!result.user.centerId) return { error: c.json({ error: { code: 'CENTER_REQUIRED', message: 'الحساب غير مرتبط بمركز' } }, 403) };
  return result;
}

const followUpSchema = z.object({
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  followUpAt: z.string().datetime({ offset: true }).optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional().nullable(),
  weight: z.coerce.number().nonnegative().finite().optional().nullable(),
  height: z.coerce.number().positive().finite().optional().nullable(),
  adherenceScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  nutritionAdherenceScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  fitnessAdherenceScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  recommendations: z.string().trim().max(5000).optional().nullable(),
});

followUpRoutes.get('/options', async c => {
  const a = await auth(c, 'customers.read');
  if ('error' in a) return a.error;
  const [customerRows, staffRows] = await Promise.all([
    withDatabase(c.env, db => db.select({
      id: customers.id, customerNumber: customers.customerNumber,
      firstName: customers.firstName, lastName: customers.lastName,
    }).from(customers)
      .where(and(eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active')))
      .orderBy(asc(customers.firstName), asc(customers.lastName))),
    withDatabase(c.env, db => db.select({
      id: users.id, name: staffProfiles.displayName, staffType: staffProfiles.staffType,
    }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true)))
      .orderBy(asc(staffProfiles.displayName))),
  ]);
  return c.json({ customers: customerRows, staff: staffRows });
});

followUpRoutes.get('/', async c => {
  const a = await auth(c, 'customers.read');
  if ('error' in a) return a.error;
  const customerId = c.req.query('customerId');
  const where = customerId
    ? and(eq(customerFollowUps.centerId, a.user.centerId!), eq(customerFollowUps.customerId, customerId))
    : eq(customerFollowUps.centerId, a.user.centerId!);

  const rows = await withDatabase(c.env, db => db.select({
    id: customerFollowUps.id,
    customerId: customerFollowUps.customerId,
    staffId: customerFollowUps.staffId,
    followUpAt: customerFollowUps.followUpAt,
    nextFollowUpAt: customerFollowUps.nextFollowUpAt,
    weight: customerFollowUps.weight,
    height: customerFollowUps.height,
    adherenceScore: customerFollowUps.adherenceScore,
    nutritionAdherenceScore: customerFollowUps.nutritionAdherenceScore,
    fitnessAdherenceScore: customerFollowUps.fitnessAdherenceScore,
    notes: customerFollowUps.notes,
    recommendations: customerFollowUps.recommendations,
    customerName: customers.firstName,
    customerLastName: customers.lastName,
    customerNumber: customers.customerNumber,
    staffName: staffProfiles.displayName,
  }).from(customerFollowUps)
    .innerJoin(customers, eq(customers.id, customerFollowUps.customerId))
    .innerJoin(users, eq(users.id, customerFollowUps.staffId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(customerFollowUps.followUpAt))
    .limit(500));
  return c.json({ followUps: rows });
});

followUpRoutes.post('/', async c => {
  const a = await auth(c, 'followups.write');
  if ('error' in a) return a.error;
  const parsed = followUpSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات المتابعة غير صحيحة' } }, 400);
  const d = parsed.data;

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, d.customerId), eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active'))).limit(1);
    const [staff] = await tx.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.id, d.staffId), eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true))).limit(1);
    if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
    if (!staff) return { error: 'STAFF_NOT_FOUND' as const };
    if (d.nextFollowUpAt && d.followUpAt && new Date(d.nextFollowUpAt) < new Date(d.followUpAt)) {
      return { error: 'INVALID_DATE_RANGE' as const };
    }
    const [row] = await tx.insert(customerFollowUps).values({
      centerId: a.user.centerId!,
      customerId: d.customerId,
      staffId: d.staffId,
      followUpAt: d.followUpAt ? new Date(d.followUpAt) : new Date(),
      nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
      weight: d.weight == null ? null : String(d.weight),
      height: d.height == null ? null : String(d.height),
      adherenceScore: d.adherenceScore ?? null,
      nutritionAdherenceScore: d.nutritionAdherenceScore ?? null,
      fitnessAdherenceScore: d.fitnessAdherenceScore ?? null,
      notes: d.notes || null,
      recommendations: d.recommendations || null,
      createdBy: a.user.userId,
    }).returning();
    return { followUp: row };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, number]> = {
      CUSTOMER_NOT_FOUND: ['العميل غير موجود أو غير نشط', 404],
      STAFF_NOT_FOUND: ['الموظف غير موجود أو غير نشط', 404],
      INVALID_DATE_RANGE: ['موعد المتابعة التالية يجب ألا يسبق موعد المتابعة الحالية', 400],
    };
    const entry = messages[String(result.error)];
    if (!entry) return c.json({ error: { code: String(result.error), message: 'تعذر معالجة المتابعة' } }, 500);
    return c.json({ error: { code: result.error, message: entry[0] } }, entry[1] as any);
  }
  return c.json(result, 201);
});


followUpRoutes.patch('/:id', async c => {
  const a = await auth(c, 'followups.write');
  if ('error' in a) return a.error;
  const parsed = followUpSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات المتابعة غير صحيحة' } }, 400);
  const d = parsed.data;
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const [existing] = await tx.select().from(customerFollowUps)
      .where(and(eq(customerFollowUps.id, c.req.param('id')), eq(customerFollowUps.centerId, a.user.centerId!))).limit(1);
    if (!existing) return { error: 'FOLLOW_UP_NOT_FOUND' as const };
    const followUpAt = d.followUpAt ? new Date(d.followUpAt) : existing.followUpAt;
    const nextFollowUpAt = d.nextFollowUpAt === undefined ? existing.nextFollowUpAt : d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
    if (nextFollowUpAt && nextFollowUpAt < followUpAt) return { error: 'INVALID_DATE_RANGE' as const };
    if (d.customerId) {
      const [customer] = await tx.select({id:customers.id}).from(customers).where(and(eq(customers.id,d.customerId),eq(customers.centerId,a.user.centerId!))).limit(1);
      if (!customer) return { error:'CUSTOMER_NOT_FOUND' as const };
    }
    if (d.staffId) {
      const [staff] = await tx.select({id:users.id}).from(users).innerJoin(staffProfiles,eq(staffProfiles.userId,users.id))
        .where(and(eq(users.id,d.staffId),eq(users.centerId,a.user.centerId!),eq(staffProfiles.active,true))).limit(1);
      if (!staff) return { error:'STAFF_NOT_FOUND' as const };
    }
    const [row] = await tx.update(customerFollowUps).set({
      ...(d.customerId ? {customerId:d.customerId}:{ }),
      ...(d.staffId ? {staffId:d.staffId}:{ }),
      ...(d.followUpAt ? {followUpAt}:{ }),
      ...(d.nextFollowUpAt !== undefined ? {nextFollowUpAt}:{ }),
      ...(d.weight !== undefined ? {weight:d.weight==null?null:String(d.weight)}:{}),
      ...(d.height !== undefined ? {height:d.height==null?null:String(d.height)}:{}),
      ...(d.adherenceScore !== undefined ? {adherenceScore:d.adherenceScore??null}:{}),
      ...(d.nutritionAdherenceScore !== undefined ? {nutritionAdherenceScore:d.nutritionAdherenceScore??null}:{}),
      ...(d.fitnessAdherenceScore !== undefined ? {fitnessAdherenceScore:d.fitnessAdherenceScore??null}:{}),
      ...(d.notes !== undefined ? {notes:d.notes||null}:{}),
      ...(d.recommendations !== undefined ? {recommendations:d.recommendations||null}:{}),
      updatedAt:new Date(),
    }).where(and(eq(customerFollowUps.id,c.req.param('id')),eq(customerFollowUps.centerId,a.user.centerId!))).returning();
    return row ? {followUp:row} : {error:'FOLLOW_UP_NOT_FOUND' as const};
  }));
  if ('error' in result) {
    const messages:Record<string,[string,number]>={FOLLOW_UP_NOT_FOUND:['المتابعة غير موجودة',404],CUSTOMER_NOT_FOUND:['العميل غير موجود داخل هذا المركز',404],STAFF_NOT_FOUND:['الموظف غير موجود أو غير نشط',404],INVALID_DATE_RANGE:['موعد المتابعة التالية يجب ألا يسبق الموعد الحالي',400]};
    const errorCode=String(result.error);
    const e=messages[errorCode]??['تعذر تحديث المتابعة',409];
    return c.json({error:{code:errorCode,message:e[0]}},e[1] as any);
  }
  return c.json(result);
});

followUpRoutes.delete('/:id', async c => {
  const a = await auth(c, 'followups.write');
  if ('error' in a) return a.error;
  const [existing] = await withDatabase(c.env, db => db.select({id:customerFollowUps.id}).from(customerFollowUps)
    .where(and(eq(customerFollowUps.id,c.req.param('id')),eq(customerFollowUps.centerId,a.user.centerId!))).limit(1));
  if (!existing) return c.json({error:{code:'FOLLOW_UP_NOT_FOUND',message:'المتابعة غير موجودة'}},404);
  await withDatabase(c.env, db => db.delete(customerFollowUps).where(and(eq(customerFollowUps.id,existing.id),eq(customerFollowUps.centerId,a.user.centerId!))));
  return c.json({ok:true});
});

export default followUpRoutes;
