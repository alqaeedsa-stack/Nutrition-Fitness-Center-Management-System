import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { withDatabase } from './db/client';
import { authRoutes } from './auth/routes';
import { bootstrapAdminRoutes } from './auth/bootstrap-admin';
import { customerAccountRoutes } from './customer-account/routes';
import { customerRoutes } from './customers/routes';
import { staffRoutes } from './staff/routes';
import { customerPortalRoutes } from './customer-portal/routes';
import { storeRoutes } from './store/routes';
import { zatcaRoutes } from './zatca/routes';
import { appointmentRoutes } from './appointments/routes';
import { nutritionRoutes } from './nutrition/routes';
import { fitnessRoutes } from './fitness/routes';
import { measurementRoutes } from './measurements/routes';
import followUpRoutes from './follow-ups/routes';
import { purchaseRoutes } from './purchases/routes';
import { purchaseBillingRoutes } from './purchases/billing-routes';

type DatabaseBinding = {
  connectionString: string;
};

export type Bindings = {
  ENVIRONMENT: string;
  API_VERSION: string;
  HYPERDRIVE?: DatabaseBinding;
  DATABASE_URL?: string;
  ZATCA_BINARY_SECURITY_TOKEN?: string;
  ZATCA_SECRET?: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/auth/bootstrap-admin', bootstrapAdminRoutes);
app.route('/api/v1/customer-account', customerAccountRoutes);
app.route('/api/v1/customers', customerRoutes);
app.route('/api/v1/staff', staffRoutes);
app.route('/api/v1/customer-portal', customerPortalRoutes);
app.route('/api/v1/store', storeRoutes);
app.route('/api/v1/zatca', zatcaRoutes);
app.route('/api/v1/appointments', appointmentRoutes);
app.route('/api/v1/nutrition', nutritionRoutes);
app.route('/api/v1/fitness', fitnessRoutes);
app.route('/api/v1/measurements', measurementRoutes);
app.route('/api/v1/follow-ups', followUpRoutes);
app.route('/api/v1/purchases', purchaseRoutes);
app.route('/api/v1/purchases', purchaseBillingRoutes);

app.get('/api/v1/health', (c) => {
  return c.json({
    ok: true,
    service: 'nutrition-center-api',
    environment: c.env.ENVIRONMENT,
    version: c.env.API_VERSION,
  });
});

app.get('/api/v1/health/db', async (c) => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({
      ok: false,
      database: 'not_configured',
      message: 'قاعدة البيانات غير مهيأة بعد',
    }, 503);
  }

  try {
    const result = await withDatabase(c.env, async (db) => {
      const response = await db.execute(sql`select 1 as ok`);
      return response.rows[0];
    });

    return c.json({
      ok: true,
      database: 'connected',
      result,
    });
  } catch (error) {
    console.error('Database health check failed', error);
    return c.json({
      ok: false,
      database: 'unavailable',
      message: 'تعذر الاتصال بقاعدة البيانات',
    }, 503);
  }
});

app.notFound((c) => c.json({
  error: {
    code: 'NOT_FOUND',
    message: 'المورد المطلوب غير موجود',
  },
}, 404));

app.onError((error, c) => {
  const requestId = crypto.randomUUID();
  const detail = error instanceof Error ? error.message : String(error);

  console.error('Unhandled API error', {
    requestId,
    detail,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ داخلي غير متوقع',
      requestId,
      detail,
    },
  }, 500);
});

export default app;
