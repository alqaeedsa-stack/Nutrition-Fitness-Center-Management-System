import { Hono } from 'hono';

export type Bindings = {
  ENVIRONMENT: string;
  API_VERSION: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/api/v1/health', (c) => {
  return c.json({
    ok: true,
    service: 'nutrition-center-api',
    environment: c.env.ENVIRONMENT,
    version: c.env.API_VERSION,
  });
});

app.notFound((c) => c.json({
  error: {
    code: 'NOT_FOUND',
    message: 'المورد المطلوب غير موجود',
  },
}, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ داخلي غير متوقع',
    },
  }, 500);
});

export default app;
