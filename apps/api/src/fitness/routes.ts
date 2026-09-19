import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { customers, fitnessPlanExercises, fitnessPlans, staffProfiles, users } from '../db/schema';
import { requirePermission } from '../auth/permissions';

export type FitnessBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const fitnessRoutes = new Hono<{ Bindings: FitnessBindings }>();

async function auth(c: any, permission: 'fitness.read' | 'fitness.write') {
  const result = await requirePermission(c, permission);
  if ('error' in result) return result;
  if (!result.user.centerId) return { error: c.json({ error: { code: 'CENTER_REQUIRED', message: 'الحساب غير مرتبط بمركز' } }, 403) };
  return result;
}

const FITNESS_SPECIALIST_TYPES = ['doctor', 'trainer', 'specialist'] as const;

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

const exerciseSchema = z.object({
  exerciseName: z.string().trim().min(2).max(200),
  sets: z.coerce.number().int().nonnegative().optional().nullable(),
  repetitions: z.coerce.number().int().nonnegative().optional().nullable(),
  durationSeconds: z.coerce.number().int().nonnegative().optional().nullable(),
  restSeconds: z.coerce.number().int().nonnegative().optional().nullable(),
  targetNotes: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});

fitnessRoutes.get('/', async c => {
  const a = await auth(c, 'fitness.read'); if ('error' in a) return a.error;
  const plans = await withDatabase(c.env, db => db.select({
    id: fitnessPlans.id, customerId: fitnessPlans.customerId, specialistId: fitnessPlans.specialistId,
    title: fitnessPlans.title, goals: fitnessPlans.goals, startDate: fitnessPlans.startDate, endDate: fitnessPlans.endDate,
    status: fitnessPlans.status, version: fitnessPlans.version, customerName: customers.firstName,
    customerLastName: customers.lastName, specialistName: staffProfiles.displayName,
  }).from(fitnessPlans).innerJoin(customers, eq(customers.id, fitnessPlans.customerId))
    .innerJoin(users, eq(users.id, fitnessPlans.specialistId)).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(eq(fitnessPlans.centerId, a.user.centerId!)).orderBy(desc(fitnessPlans.startDate), desc(fitnessPlans.version)));
  const ids = plans.map(p => p.id);
  const exercises = ids.length ? await withDatabase(c.env, db => db.select().from(fitnessPlanExercises)
    .where(inArray(fitnessPlanExercises.fitnessPlanId, ids)).orderBy(asc(fitnessPlanExercises.sortOrder), asc(fitnessPlanExercises.exerciseName))) : [];
  return c.json({ plans: plans.map(p => ({ ...p, exercises: exercises.filter(x => x.fitnessPlanId === p.id) })) });
});

fitnessRoutes.get('/options', async c => {
  const a = await auth(c, 'fitness.read'); if ('error' in a) return a.error;
  const [customersRows, staffRows] = await Promise.all([
    withDatabase(c.env, db => db.select({ id: customers.id, name: customers.firstName, lastName: customers.lastName, customerNumber: customers.customerNumber })
      .from(customers).where(and(eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active'))).orderBy(asc(customers.firstName))),
    withDatabase(c.env, db => db.select({ id: users.id, name: staffProfiles.displayName, staffType: staffProfiles.staffType })
      .from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true), inArray(staffProfiles.staffType, [...FITNESS_SPECIALIST_TYPES]))).orderBy(asc(staffProfiles.displayName))),
  ]);
  return c.json({ customers: customersRows, specialists: staffRows });
});

fitnessRoutes.post('/', async c => {
  const a = await auth(c, 'fitness.write'); if ('error' in a) return a.error;
  const parsed = planSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات الخطة غير صحيحة' } }, 400);
  const d = parsed.data;
  if (['completed', 'cancelled'].includes(d.status)) return c.json({ error: { code: 'INVALID_INITIAL_STATUS', message: 'لا يمكن إنشاء خطة بحالة مكتملة أو ملغاة' } }, 400);
  if (d.endDate && d.endDate < d.startDate) return c.json({ error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ نهاية الخطة يجب أن يكون بعد تاريخ البداية' } }, 400);
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, d.customerId), eq(customers.centerId, a.user.centerId!), eq(customers.status, 'active'))).limit(1);
    const [specialist] = await tx.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.id, d.specialistId), eq(users.centerId, a.user.centerId!), eq(staffProfiles.active, true), inArray(staffProfiles.staffType, [...FITNESS_SPECIALIST_TYPES]))).limit(1);
    if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
    if (!specialist) return { error: 'SPECIALIST_NOT_FOUND' as const };
    const [plan] = await tx.insert(fitnessPlans).values({
      centerId: a.user.centerId!, customerId: d.customerId, specialistId: d.specialistId, title: d.title,
      goals: d.goals || null, startDate: d.startDate, endDate: d.endDate || null, status: d.status,
    }).returning();
    return { plan };
  }));
  if ('error' in result) {
    const m: Record<string,[string,number]>={CUSTOMER_NOT_FOUND:['العميل غير موجود داخل هذا المركز',404],SPECIALIST_NOT_FOUND:['المدرب أو المختص غير موجود أو غير نشط',404]};
    const entry=m[String(result.error)]; if(!entry)return c.json({error:{code:String(result.error),message:'تعذر معالجة الطلب'}},500); const [message,status]=entry; return c.json({error:{code:result.error,message}},status as any);
  }
  return c.json(result,201);
});

fitnessRoutes.patch('/:id', async c => {
  const a=await auth(c,'fitness.write'); if('error' in a)return a.error;
  const parsed=planSchema.partial().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'INVALID_INPUT',message:parsed.error.issues[0]?.message??'بيانات الخطة غير صحيحة'}},400);
  const d=parsed.data;
  const [existing]=await withDatabase(c.env,db=>db.select().from(fitnessPlans).where(and(eq(fitnessPlans.id,c.req.param('id')),eq(fitnessPlans.centerId,a.user.centerId!))).limit(1));
  if(!existing)return c.json({error:{code:'PLAN_NOT_FOUND',message:'الخطة الرياضية غير موجودة'}},404);
  const nextStatus=d.status??existing.status;
  if(!validPlanStatusTransition(existing.status,nextStatus))return c.json({error:{code:'INVALID_STATUS_TRANSITION',message:'لا يمكن الانتقال من حالة الخطة الحالية إلى الحالة المطلوبة'}},409);
  const editingStructure=d.customerId!==undefined||d.specialistId!==undefined||d.title!==undefined||d.goals!==undefined||d.startDate!==undefined||d.endDate!==undefined;
  if(['completed','cancelled'].includes(existing.status)&&editingStructure)return c.json({error:{code:'PLAN_LOCKED',message:'لا يمكن تعديل بيانات الخطة بعد إكمالها أو إلغائها'}},409);
  if(['completed','cancelled'].includes(existing.status)&&d.status===undefined)return c.json({error:{code:'PLAN_LOCKED',message:'الخطة مغلقة ولا تقبل تعديلات'}},409);
  const startDate=d.startDate??existing.startDate; const endDate=d.endDate!==undefined?d.endDate:existing.endDate;
  if(endDate&&endDate<startDate)return c.json({error:{code:'INVALID_DATE_RANGE',message:'تاريخ نهاية الخطة يجب أن يكون بعد تاريخ البداية'}},400);
  const [updated]=await withDatabase(c.env,db=>db.update(fitnessPlans).set({
    ...(d.customerId?{customerId:d.customerId}:{}),...(d.specialistId?{specialistId:d.specialistId}:{}),
    ...(d.title?{title:d.title}:{}),...(d.goals!==undefined?{goals:d.goals||null}:{}),
    ...(d.startDate?{startDate:d.startDate}:{}),...(d.endDate!==undefined?{endDate:d.endDate||null}:{}),
    ...(d.status?{status:d.status}:{}),version:existing.version+1,updatedAt:new Date(),
  }).where(and(eq(fitnessPlans.id,existing.id),eq(fitnessPlans.centerId,a.user.centerId!))).returning());
  return c.json({plan:updated});
});

fitnessRoutes.post('/:id/exercises', async c => {
  const a=await auth(c,'fitness.write'); if('error' in a)return a.error;
  const parsed=exerciseSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'INVALID_INPUT',message:parsed.error.issues[0]?.message??'بيانات التمرين غير صحيحة'}},400);
  const d=parsed.data;
  const [plan]=await withDatabase(c.env,db=>db.select({id:fitnessPlans.id,status:fitnessPlans.status}).from(fitnessPlans).where(and(eq(fitnessPlans.id,c.req.param('id')),eq(fitnessPlans.centerId,a.user.centerId!))).limit(1));
  if(!plan)return c.json({error:{code:'PLAN_NOT_FOUND',message:'الخطة الرياضية غير موجودة'}},404);if(['completed','cancelled'].includes(plan.status))return c.json({error:{code:'PLAN_LOCKED',message:'لا يمكن تعديل خطة مكتملة أو ملغاة'}},409);
  const [exercise]=await withDatabase(c.env,db=>db.insert(fitnessPlanExercises).values({
    fitnessPlanId:plan.id,exerciseName:d.exerciseName,sets:d.sets??null,repetitions:d.repetitions??null,
    durationSeconds:d.durationSeconds??null,restSeconds:d.restSeconds??null,targetNotes:d.targetNotes||null,sortOrder:d.sortOrder,
  }).returning());
  return c.json({exercise},201);
});

fitnessRoutes.patch('/:id/exercises/:exerciseId', async c => {
  const a=await auth(c,'fitness.write'); if('error' in a)return a.error;
  const parsed=exerciseSchema.partial().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'INVALID_INPUT',message:parsed.error.issues[0]?.message??'بيانات التمرين غير صحيحة'}},400);
  const [exercise]=await withDatabase(c.env,db=>db.select({id:fitnessPlanExercises.id,planStatus:fitnessPlans.status}).from(fitnessPlanExercises)
    .innerJoin(fitnessPlans,eq(fitnessPlans.id,fitnessPlanExercises.fitnessPlanId))
    .where(and(eq(fitnessPlanExercises.id,c.req.param('exerciseId')),eq(fitnessPlans.id,c.req.param('id')),eq(fitnessPlans.centerId,a.user.centerId!))).limit(1));
  if(!exercise)return c.json({error:{code:'EXERCISE_NOT_FOUND',message:'التمرين غير موجود'}},404);if(['completed','cancelled'].includes(exercise.planStatus))return c.json({error:{code:'PLAN_LOCKED',message:'لا يمكن تعديل خطة مكتملة أو ملغاة'}},409);
  const d=parsed.data;
  const [updated]=await withDatabase(c.env,db=>db.update(fitnessPlanExercises).set({
    ...(d.exerciseName?{exerciseName:d.exerciseName}:{}),...(d.sets!==undefined?{sets:d.sets??null}:{}),
    ...(d.repetitions!==undefined?{repetitions:d.repetitions??null}:{}),...(d.durationSeconds!==undefined?{durationSeconds:d.durationSeconds??null}:{}),
    ...(d.restSeconds!==undefined?{restSeconds:d.restSeconds??null}:{}),...(d.targetNotes!==undefined?{targetNotes:d.targetNotes||null}:{}),
    ...(d.sortOrder!==undefined?{sortOrder:d.sortOrder}:{}),
  }).where(eq(fitnessPlanExercises.id,exercise.id)).returning());
  return c.json({exercise:updated});
});

fitnessRoutes.delete('/:id/exercises/:exerciseId', async c => {
  const a=await auth(c,'fitness.write'); if('error' in a)return a.error;
  const [exercise]=await withDatabase(c.env,db=>db.select({id:fitnessPlanExercises.id}).from(fitnessPlanExercises)
    .innerJoin(fitnessPlans,eq(fitnessPlans.id,fitnessPlanExercises.fitnessPlanId))
    .where(and(eq(fitnessPlanExercises.id,c.req.param('exerciseId')),eq(fitnessPlans.id,c.req.param('id')),eq(fitnessPlans.centerId,a.user.centerId!))).limit(1));
  if(!exercise)return c.json({error:{code:'EXERCISE_NOT_FOUND',message:'التمرين غير موجود'}},404);
  await withDatabase(c.env,db=>db.delete(fitnessPlanExercises).where(eq(fitnessPlanExercises.id,exercise.id)));
  return c.json({ok:true});
});
