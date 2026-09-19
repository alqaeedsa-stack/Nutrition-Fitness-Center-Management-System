import { and, asc, desc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthenticatedUser } from '../auth/session';
import { withDatabase } from '../db/client';
import { appointments, customers, staffProfiles, users } from '../db/schema';
import { requirePermission } from '../auth/permissions';

export type AppointmentBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const appointmentRoutes = new Hono<{ Bindings: AppointmentBindings }>();

const SPECIALIST_TYPES = ['doctor', 'nutritionist', 'trainer', 'specialist'] as const;

const appointmentSchema = z.object({
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  appointmentType: z.string().trim().min(2).max(80),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).default('scheduled'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

function validStatusTransition(current: string, next: string) {
  if (current === next) return true;
  const allowed: Record<string, string[]> = {
    scheduled: ['confirmed', 'cancelled', 'no_show'],
    confirmed: ['completed', 'cancelled', 'no_show'],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  return (allowed[current] ?? []).includes(next);
}

async function ensureStaff(c: any, permission: 'appointments.read' | 'appointments.manage') {
  const auth = await requirePermission(c, permission);
  if ('error' in auth) return auth;
  if (!auth.user.centerId) return { error: c.json({ error: { code: 'CENTER_REQUIRED', message: 'الحساب غير مرتبط بمركز' } }, 403) };
  return auth;
}

appointmentRoutes.get('/', async c => {
  const auth = await ensureStaff(c, 'appointments.read');
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: appointments.id,
    customerId: appointments.customerId,
    customerName: customers.firstName,
    customerLastName: customers.lastName,
    staffId: appointments.staffId,
    staffName: staffProfiles.displayName,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    appointmentType: appointments.appointmentType,
    status: appointments.status,
    notes: appointments.notes,
  })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(users, eq(users.id, appointments.staffId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(eq(appointments.centerId, auth.user.centerId!))
    .orderBy(asc(appointments.startsAt)));

  return c.json({ appointments: rows });
});

appointmentRoutes.get('/options', async c => {
  const auth = await ensureStaff(c, 'appointments.read');
  if ('error' in auth) return auth.error;

  const [customerRows, staffRows] = await Promise.all([
    withDatabase(c.env, db => db.select({
      id: customers.id,
      name: customers.firstName,
      lastName: customers.lastName,
      customerNumber: customers.customerNumber,
    }).from(customers).where(and(eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'))).orderBy(asc(customers.firstName))),
    withDatabase(c.env, db => db.select({
      id: users.id,
      name: staffProfiles.displayName,
      staffType: staffProfiles.staffType,
    }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.centerId, auth.user.centerId!), eq(staffProfiles.active, true), inArray(staffProfiles.staffType, [...SPECIALIST_TYPES])))
      .orderBy(asc(staffProfiles.displayName))),
  ]);

  return c.json({ customers: customerRows, staff: staffRows });
});

appointmentRoutes.post('/', async c => {
  const auth = await ensureStaff(c, 'appointments.manage');
  if ('error' in auth) return auth.error;

  const body = appointmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الموعد غير صحيحة' } }, 400);

  const data = body.data;
  // New appointments always enter the workflow as scheduled; completion/cancellation/no-show are lifecycle actions.
  if (data.status !== 'scheduled') {
    return c.json({ error: { code: 'INVALID_INITIAL_STATUS', message: 'يجب إنشاء الموعد بالحالة المجدولة أولًا' } }, 400);
  }
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (endsAt <= startsAt) return c.json({ error: { code: 'INVALID_TIME_RANGE', message: 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية' } }, 400);

  const created = await withDatabase(c.env, async db => db.transaction(async tx => {
    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, data.customerId), eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'))).limit(1);
    const [staff] = await tx.select({ id: users.id }).from(users)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(and(eq(users.id, data.staffId), eq(users.centerId, auth.user.centerId!), eq(staffProfiles.active, true), inArray(staffProfiles.staffType, [...SPECIALIST_TYPES]))).limit(1);
    if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
    if (!staff) return { error: 'STAFF_NOT_FOUND' as const };

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
        eq(appointments.customerId, data.customerId),
        ne(appointments.status, 'cancelled'),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
      )).limit(1);
    if (customerOverlap[0]) return { error: 'CUSTOMER_TIME_CONFLICT' as const };

    const [row] = await tx.insert(appointments).values({
      centerId: auth.user.centerId!,
      customerId: data.customerId,
      staffId: data.staffId,
      startsAt,
      endsAt,
      appointmentType: data.appointmentType,
      status: data.status,
      notes: data.notes || null,
    }).returning();
    return { appointment: row };
  }));

  if ('error' in created) {
    const messages: Record<string, [string, number]> = {
      CUSTOMER_NOT_FOUND: ['العميل غير موجود داخل هذا المركز', 404],
      STAFF_NOT_FOUND: ['الموظف المختص غير موجود أو غير نشط', 404],
      STAFF_TIME_CONFLICT: ['يوجد موعد آخر لهذا الموظف في نفس الفترة', 409],
      CUSTOMER_TIME_CONFLICT: ['يوجد موعد آخر للعميل في نفس الفترة', 409],
      INVALID_STATUS_TRANSITION: ['لا يمكن الانتقال إلى حالة الموعد المطلوبة من الحالة الحالية', 409],
      APPOINTMENT_LOCKED: ['الموعد مغلق بعد الإكمال أو الإلغاء أو عدم الحضور', 409],
    };
    const entry = messages[String(created.error)];
    if (!entry) return c.json({ error: { code: String(created.error), message: 'تعذر معالجة الطلب' } }, 500);
    const [message, status] = entry;
    return c.json({ error: { code: created.error, message } }, status as any);
  }

  return c.json(created, 201);
});

appointmentRoutes.patch('/:id', async c => {
  const auth = await ensureStaff(c, 'appointments.manage');
  if ('error' in auth) return auth.error;

  const body = appointmentSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الموعد غير صحيحة' } }, 400);
  const data = body.data;

  const result = await withDatabase(c.env, async db => db.transaction(async tx => {
    const [existing] = await tx.select().from(appointments)
      .where(and(eq(appointments.id, c.req.param('id')), eq(appointments.centerId, auth.user.centerId!))).limit(1);
    if (!existing) return { error: 'APPOINTMENT_NOT_FOUND' as const };

    const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) return { error: 'INVALID_TIME_RANGE' as const };

    const nextStatus = data.status ?? existing.status;
    if (!validStatusTransition(existing.status, nextStatus)) return { error: 'INVALID_STATUS_TRANSITION' as const };
    const hasSchedulingChange = data.customerId !== undefined || data.staffId !== undefined || data.startsAt !== undefined || data.endsAt !== undefined || data.appointmentType !== undefined;
    if (['completed', 'cancelled', 'no_show'].includes(existing.status) && hasSchedulingChange) {
      return { error: 'APPOINTMENT_LOCKED' as const };
    }

    if (data.customerId) {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, data.customerId), eq(customers.centerId, auth.user.centerId!))).limit(1);
      if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
    }
    if (data.staffId) {
      const [staff] = await tx.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
        .where(and(eq(users.id, data.staffId), eq(users.centerId, auth.user.centerId!), eq(staffProfiles.active, true))).limit(1);
      if (!staff) return { error: 'STAFF_NOT_FOUND' as const };
    }

    const staffId = data.staffId ?? existing.staffId;
    const staffOverlap = await tx.select({ id: appointments.id }).from(appointments)
      .where(and(eq(appointments.centerId, auth.user.centerId!), eq(appointments.staffId, staffId), ne(appointments.id, existing.id),
        ne(appointments.status, 'cancelled'), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1);
    if (staffOverlap[0] && nextStatus !== 'cancelled') return { error: 'STAFF_TIME_CONFLICT' as const };

    const customerId = data.customerId ?? existing.customerId;
    const customerOverlap = await tx.select({ id: appointments.id }).from(appointments)
      .where(and(eq(appointments.centerId, auth.user.centerId!), eq(appointments.customerId, customerId), ne(appointments.id, existing.id),
        ne(appointments.status, 'cancelled'), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1);
    if (customerOverlap[0] && nextStatus !== 'cancelled') return { error: 'CUSTOMER_TIME_CONFLICT' as const };

    const [updated] = await tx.update(appointments).set({
      ...(data.customerId ? { customerId: data.customerId } : {}),
      ...(data.staffId ? { staffId: data.staffId } : {}),
      ...(data.startsAt ? { startsAt } : {}),
      ...(data.endsAt ? { endsAt } : {}),
      ...(data.appointmentType ? { appointmentType: data.appointmentType } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      updatedAt: new Date(),
    }).where(and(eq(appointments.id, existing.id), eq(appointments.centerId, auth.user.centerId!))).returning();
    return { appointment: updated };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, number]> = {
      APPOINTMENT_NOT_FOUND: ['الموعد غير موجود', 404],
      INVALID_TIME_RANGE: ['وقت نهاية الموعد يجب أن يكون بعد وقت البداية', 400],
      CUSTOMER_NOT_FOUND: ['العميل غير موجود داخل هذا المركز', 404],
      STAFF_NOT_FOUND: ['الموظف المختص غير موجود أو غير نشط', 404],
      STAFF_TIME_CONFLICT: ['يوجد موعد آخر لهذا الموظف في نفس الفترة', 409],
      INVALID_STATUS_TRANSITION: ['لا يمكن الانتقال إلى حالة الموعد المطلوبة من الحالة الحالية', 409],
      APPOINTMENT_LOCKED: ['الموعد مغلق بعد الإكمال أو الإلغاء أو عدم الحضور', 409],
    };
    const entry = messages[String(result.error)];
    if (!entry) return c.json({ error: { code: String(result.error), message: 'تعذر معالجة الطلب' } }, 500);
    const [message, status] = entry;
    return c.json({ error: { code: result.error, message } }, status as any);
  }

  return c.json(result);
});
