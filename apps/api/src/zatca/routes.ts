import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthenticatedUser } from '../auth/session';
import { withDatabase } from '../db/client';
import { eInvoices, sales, staffProfiles, taxRates, zatcaSettings } from '../db/schema';
import { submitZatcaInvoice } from './client';

export type ZatcaBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  ZATCA_BINARY_SECURITY_TOKEN?: string;
  ZATCA_SECRET?: string;
};

export const zatcaRoutes = new Hono<{ Bindings: ZatcaBindings }>();

async function requireStaff(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };
  const profile = await withDatabase(c.env, db => db.select({
    id: staffProfiles.id, staffType: staffProfiles.staffType, active: staffProfiles.active,
  }).from(staffProfiles).where(eq(staffProfiles.userId, user.userId)).limit(1));
  if (!profile[0]?.active) return { error: c.json({ error: { code: 'STAFF_ACCESS_REQUIRED', message: 'هذه الوحدة للموظفين فقط' } }, 403) };
  return { user, profile: profile[0] };
}

const taxRateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  rate: z.coerce.number().min(0).max(100),
  categoryCode: z.enum(['S', 'Z', 'E', 'O']).default('S'),
  exemptionReasonCode: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().default(true),
});

zatcaRoutes.get('/tax-rates', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(taxRates)
    .where(eq(taxRates.centerId, auth.user.centerId!))
    .orderBy(asc(taxRates.code)));
  return c.json({ taxRates: rows });
});

zatcaRoutes.post('/tax-rates', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = taxRateSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'إعداد الضريبة غير صحيح' } }, 400);
  try {
    const row = await withDatabase(c.env, db => db.insert(taxRates).values({
      centerId: auth.user.centerId!, code: body.data.code, name: body.data.name,
      rate: body.data.rate.toFixed(4), categoryCode: body.data.categoryCode,
      exemptionReasonCode: body.data.exemptionReasonCode ?? null, active: body.data.active,
    }).returning());
    return c.json({ taxRate: row[0] }, 201);
  } catch {
    return c.json({ error: { code: 'TAX_CODE_EXISTS', message: 'كود الضريبة مستخدم بالفعل' } }, 409);
  }
});

zatcaRoutes.patch('/tax-rates/:id', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = taxRateSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'إعداد الضريبة غير صحيح' } }, 400);
  const d = body.data;
  const rows = await withDatabase(c.env, db => db.update(taxRates).set({
    ...(d.code !== undefined ? { code: d.code } : {}),
    ...(d.name !== undefined ? { name: d.name } : {}),
    ...(d.rate !== undefined ? { rate: d.rate.toFixed(4) } : {}),
    ...(d.categoryCode !== undefined ? { categoryCode: d.categoryCode } : {}),
    ...(d.exemptionReasonCode !== undefined ? { exemptionReasonCode: d.exemptionReasonCode } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}),
    updatedAt: new Date(),
  }).where(and(eq(taxRates.id, c.req.param('id')), eq(taxRates.centerId, auth.user.centerId!))).returning());
  if (!rows[0]) return c.json({ error: { code: 'TAX_RATE_NOT_FOUND', message: 'إعداد الضريبة غير موجود' } }, 404);
  return c.json({ taxRate: rows[0] });
});

const settingsSchema = z.object({
  environment: z.enum(['simulation', 'production']),
  vatNumber: z.string().trim().max(20).nullable().optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  invoiceTypeCode: z.string().trim().min(1).max(10).optional(),
  deviceSerial: z.string().trim().max(200).nullable().optional(),
  pih: z.string().trim().max(1000).nullable().optional(),
});

zatcaRoutes.get('/settings', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: zatcaSettings.id, environment: zatcaSettings.environment, vatNumber: zatcaSettings.vatNumber,
    legalName: zatcaSettings.legalName, invoiceTypeCode: zatcaSettings.invoiceTypeCode,
    deviceSerial: zatcaSettings.deviceSerial, pih: zatcaSettings.pih, lastIcv: zatcaSettings.lastIcv,
    status: zatcaSettings.status, lastError: zatcaSettings.lastError, updatedAt: zatcaSettings.updatedAt,
  }).from(zatcaSettings).where(eq(zatcaSettings.centerId, auth.user.centerId!)).limit(1));
  return c.json({ settings: rows[0] ?? null });
});

zatcaRoutes.put('/settings', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'إعدادات ZATCA غير صحيحة' } }, 400);
  const d = body.data;
  const row = await withDatabase(c.env, db => db.insert(zatcaSettings).values({
    centerId: auth.user.centerId!, environment: d.environment,
    vatNumber: d.vatNumber ?? null, legalName: d.legalName ?? null,
    invoiceTypeCode: d.invoiceTypeCode ?? '0200000', deviceSerial: d.deviceSerial ?? null,
    pih: d.pih ?? null, status: 'configured',
  }).onConflictDoUpdate({
    target: zatcaSettings.centerId,
    set: {
      environment: d.environment, vatNumber: d.vatNumber ?? null, legalName: d.legalName ?? null,
      invoiceTypeCode: d.invoiceTypeCode ?? '0200000', deviceSerial: d.deviceSerial ?? null,
      pih: d.pih ?? null, status: 'configured', updatedAt: new Date(),
    },
  }).returning());
  return c.json({ settings: row[0] });
});

const prepareSchema = z.object({
  invoiceType: z.enum(['simplified', 'standard']),
});

zatcaRoutes.post('/sales/:saleId/prepare', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = prepareSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'نوع الفاتورة غير صحيح' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const saleRows = await tx.select({
      id: sales.id, saleNumber: sales.saleNumber,
    }).from(sales).where(and(
      eq(sales.id, c.req.param('saleId')), eq(sales.centerId, auth.user.centerId!), eq(sales.status, 'completed'),
    )).limit(1);
    const sale = saleRows[0];
    if (!sale) return { error: 'SALE_NOT_FOUND' as const };

    const existing = await tx.select().from(eInvoices).where(eq(eInvoices.saleId, sale.id)).limit(1);
    if (existing[0]) return { invoice: existing[0] };

    const rows = await tx.insert(eInvoices).values({
      centerId: auth.user.centerId!, saleId: sale.id, invoiceNumber: sale.saleNumber,
      uuid: crypto.randomUUID(), invoiceType: body.data.invoiceType, status: 'pending',
    }).returning();
    return { invoice: rows[0] };
  }));

  if ('error' in result) return c.json({ error: { code: result.error, message: 'عملية البيع غير موجودة أو غير مكتملة' } }, 404);
  return c.json({ invoice: result.invoice }, 201);
});

zatcaRoutes.post('/invoices/:id/submit', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const invoiceRows = await withDatabase(c.env, db => db.select().from(eInvoices).where(and(
    eq(eInvoices.id, c.req.param('id')), eq(eInvoices.centerId, auth.user.centerId!),
  )).limit(1));
  const invoice = invoiceRows[0];
  if (!invoice) return c.json({ error: { code: 'EINVOICE_NOT_FOUND', message: 'الفاتورة الإلكترونية غير موجودة' } }, 404);
  if (!invoice.xml || !invoice.invoiceHash) {
    return c.json({ error: { code: 'SIGNED_XML_REQUIRED', message: 'يجب توليد وتوقيع XML للفواتير قبل الإرسال إلى فاتورة' } }, 409);
  }

  const settingsRows = await withDatabase(c.env, db => db.select().from(zatcaSettings)
    .where(eq(zatcaSettings.centerId, auth.user.centerId!)).limit(1));
  const settings = settingsRows[0];
  if (!settings?.vatNumber) return c.json({ error: { code: 'ZATCA_NOT_CONFIGURED', message: 'الرقم الضريبي وإعدادات ZATCA غير مكتملة' } }, 409);

  const token = c.env.ZATCA_BINARY_SECURITY_TOKEN;
  const secret = c.env.ZATCA_SECRET;
  if (!token || !secret) {
    return c.json({ error: { code: 'ZATCA_CREDENTIALS_MISSING', message: 'بيانات اعتماد ZATCA غير مضافة إلى Cloudflare Secrets' } }, 503);
  }

  const mode = invoice.invoiceType === 'standard' ? 'clearance' : 'reporting';
  const result = await submitZatcaInvoice({
    environment: settings.environment === 'production' ? 'production' : 'simulation',
    binarySecurityToken: token,
    secret,
    invoiceHash: invoice.invoiceHash,
    uuid: invoice.uuid,
    xml: invoice.xml,
    mode,
  });

  const now = new Date();
  await withDatabase(c.env, db => db.update(eInvoices).set({
    status: result.ok ? (mode === 'clearance' ? 'cleared' : 'reported') : 'rejected',
    reportingStatus: mode === 'reporting' ? (result.ok ? 'reported' : 'rejected') : invoice.reportingStatus,
    clearanceStatus: mode === 'clearance' ? (result.ok ? 'cleared' : 'rejected') : invoice.clearanceStatus,
    responseCode: String(result.status),
    responseBody: result.body as any,
    submittedAt: now,
    ...(result.ok ? (mode === 'clearance' ? { clearedAt: now } : { reportedAt: now }) : {}),
    updatedAt: now,
  }).where(eq(eInvoices.id, invoice.id)));

  return c.json({
    ok: result.ok,
    status: result.status,
    invoiceId: invoice.id,
    mode,
    response: result.body,
  }, result.ok ? 200 : 502);
});

zatcaRoutes.get('/invoices', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(eInvoices)
    .where(eq(eInvoices.centerId, auth.user.centerId!))
    .orderBy(desc(eInvoices.createdAt)).limit(100));
  return c.json({ invoices: rows });
});
