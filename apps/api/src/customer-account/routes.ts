import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { customerAccounts } from '../db/customer-accounts';
import { customers } from '../db/schema';
import { withDatabase } from '../db/client';
import { getAuthenticatedUser } from '../auth/session';

export type CustomerAccountBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const customerAccountRoutes = new Hono<{ Bindings: CustomerAccountBindings }>();

customerAccountRoutes.get('/me', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401);

  const account = await withDatabase(c.env, async (db) => {
    const rows = await db.select({
      id: customerAccounts.id,
      customerId: customerAccounts.customerId,
      userId: customerAccounts.userId,
      status: customerAccounts.status,
      createdAt: customerAccounts.createdAt,
      updatedAt: customerAccounts.updatedAt,
      customer: customers,
    })
      .from(customerAccounts)
      .innerJoin(customers, eq(customers.id, customerAccounts.customerId))
      .where(and(eq(customerAccounts.userId, user.userId), eq(customers.centerId, user.centerId!)))
      .limit(1);

    return rows[0] ?? null;
  });

  if (!account) return c.json({ error: { code: 'CUSTOMER_ACCOUNT_NOT_FOUND', message: 'لا يوجد حساب عميل مرتبط بالمستخدم الحالي' } }, 404);
  if (account.status !== 'active' || account.customer.status !== 'active') {
    return c.json({ error: { code: 'CUSTOMER_ACCOUNT_INACTIVE', message: 'حساب العميل غير نشط' } }, 403);
  }

  return c.json({
    account: {
      id: account.id,
      customerId: account.customerId,
      userId: account.userId,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    },
    customer: account.customer,
  });
});
