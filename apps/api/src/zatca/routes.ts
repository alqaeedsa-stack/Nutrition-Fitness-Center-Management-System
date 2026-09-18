import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../auth/permissions';
import { withDatabase } from '../db/client';
import { eInvoices, products, saleItems, sales, staffProfiles, taxRates, zatcaSettings } from '../db/schema';
import { submitZatcaInvoice } from './client';
import { firstInvoicePreviousHash, generateZatcaInvoice } from './generator';

export type ZatcaBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  ZATCA_BINARY_SECURITY_TOKEN?: string;
  ZATCA_SECRET?: string;
};

export const zatcaRoutes = new Hono<{ Bindings: ZatcaBindings }>();

const taxRateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  rate: z.coerce.number().min(0).max(100),
  categoryCode: z.enum(['S', 'Z', 'E', 'O']).default('S'),
  exemptionReasonCode: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().default(true),
});

zatcaRoutes.get('/tax-rates', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(taxRates)
    .where(eq(taxRates.centerId, auth.user.centerId!))
    .orderBy(asc(taxRates.code)));
  return c.json({ taxRates: rows });
});

zatcaRoutes.post('/tax-rates', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
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
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
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
  vatNumber: z.string().trim().regex(/^\d{15}$/, 'VAT number must contain exactly 15 digits').nullable().optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  invoiceTypeCode: z.string().trim().min(1).max(10).optional(),
  deviceSerial: z.string().trim().max(200).nullable().optional(),
  sellerStreet: z.string().trim().max(200).nullable().optional(),
  sellerBuildingNumber: z.string().trim().regex(/^\d{4}$/, 'Building number must contain exactly 4 digits').nullable().optional(),
  sellerCity: z.string().trim().max(100).nullable().optional(),
  sellerPostalCode: z.string().trim().max(20).nullable().optional(),
  sellerCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  pih: z.string().trim().max(1000).nullable().optional(),
});

zatcaRoutes.get('/settings', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: zatcaSettings.id, environment: zatcaSettings.environment, vatNumber: zatcaSettings.vatNumber,
    legalName: zatcaSettings.legalName, invoiceTypeCode: zatcaSettings.invoiceTypeCode,
    deviceSerial: zatcaSettings.deviceSerial, sellerStreet: zatcaSettings.sellerStreet,
    sellerBuildingNumber: zatcaSettings.sellerBuildingNumber, sellerCity: zatcaSettings.sellerCity,
    sellerPostalCode: zatcaSettings.sellerPostalCode, sellerCountryCode: zatcaSettings.sellerCountryCode,
    pih: zatcaSettings.pih, lastIcv: zatcaSettings.lastIcv,
    status: zatcaSettings.status, lastError: zatcaSettings.lastError, updatedAt: zatcaSettings.updatedAt,
  }).from(zatcaSettings).where(eq(zatcaSettings.centerId, auth.user.centerId!)).limit(1));
  return c.json({ settings: rows[0] ?? null });
});

zatcaRoutes.put('/settings', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const body = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'إعدادات ZATCA غير صحيحة' } }, 400);
  const d = body.data;
  const row = await withDatabase(c.env, db => db.insert(zatcaSettings).values({
    centerId: auth.user.centerId!, environment: d.environment,
    vatNumber: d.vatNumber ?? null, legalName: d.legalName ?? null,
    invoiceTypeCode: d.invoiceTypeCode ?? '0200000', deviceSerial: d.deviceSerial ?? null,
    sellerStreet: d.sellerStreet ?? null, sellerBuildingNumber: d.sellerBuildingNumber ?? null,
    sellerCity: d.sellerCity ?? null, sellerPostalCode: d.sellerPostalCode ?? null,
    sellerCountryCode: d.sellerCountryCode ?? 'SA', pih: d.pih ?? null, status: 'configured',
  }).onConflictDoUpdate({
    target: zatcaSettings.centerId,
    set: {
      environment: d.environment, vatNumber: d.vatNumber ?? null, legalName: d.legalName ?? null,
      invoiceTypeCode: d.invoiceTypeCode ?? '0200000', deviceSerial: d.deviceSerial ?? null,
      sellerStreet: d.sellerStreet ?? null, sellerBuildingNumber: d.sellerBuildingNumber ?? null,
      sellerCity: d.sellerCity ?? null, sellerPostalCode: d.sellerPostalCode ?? null,
      sellerCountryCode: d.sellerCountryCode ?? 'SA', pih: d.pih ?? null, status: 'configured', updatedAt: new Date(),
    },
  }).returning());
  return c.json({ settings: row[0] });
});

const prepareSchema = z.object({
  invoiceType: z.enum(['simplified', 'standard']),
});

zatcaRoutes.post('/sales/:saleId/prepare', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const body = prepareSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'نوع الفاتورة غير صحيح' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const saleRows = await tx.select({
      id: sales.id, saleNumber: sales.saleNumber, subtotal: sales.subtotal,
      discount: sales.discount, tax: sales.tax, total: sales.total, createdAt: sales.createdAt,
    }).from(sales).where(and(
      eq(sales.id, c.req.param('saleId')), eq(sales.centerId, auth.user.centerId!), eq(sales.status, 'completed'),
    )).limit(1);
    const sale = saleRows[0];
    if (!sale) return { error: 'SALE_NOT_FOUND' as const };

    const existing = await tx.select().from(eInvoices).where(eq(eInvoices.saleId, sale.id)).limit(1);
    if (existing[0]) return { invoice: existing[0] };

    const settingsRows = await tx.select().from(zatcaSettings)
      .where(eq(zatcaSettings.centerId, auth.user.centerId!)).limit(1);
    const settings = settingsRows[0];
    if (!settings?.vatNumber || !settings.legalName) return { error: 'ZATCA_SELLER_NOT_CONFIGURED' as const };
    if (!settings.sellerStreet || !settings.sellerBuildingNumber || !settings.sellerCity || !settings.sellerPostalCode) {
      return { error: 'ZATCA_SELLER_ADDRESS_REQUIRED' as const };
    }
    if (body.data.invoiceType === 'standard') {
      return { error: 'STANDARD_BUYER_DATA_REQUIRED' as const };
    }

    const itemRows = await tx.select({
      id: saleItems.id, productId: saleItems.productId, quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice, discount: saleItems.discount, tax: saleItems.tax,
      lineTotal: saleItems.lineTotal, productName: products.name, taxCode: products.taxCode,
    }).from(saleItems).innerJoin(products, eq(products.id, saleItems.productId))
      .where(eq(saleItems.saleId, sale.id));

    if (!itemRows.length) return { error: 'EMPTY_SALE' as const };

    const taxRows = await tx.select({
      code: taxRates.code, rate: taxRates.rate, categoryCode: taxRates.categoryCode,
      exemptionReasonCode: taxRates.exemptionReasonCode,
    }).from(taxRates).where(eq(taxRates.centerId, auth.user.centerId!));
    const taxMap = new Map(taxRows.map(row => [row.code, row]));

    const nextIcv = settings.lastIcv + 1;
    const previousInvoiceHash = settings.pih || firstInvoicePreviousHash;
    const uuid = crypto.randomUUID();
    const invoiceLines = itemRows.map(item => {
      const tax = item.taxCode ? taxMap.get(item.taxCode) : undefined;
      const taxable = Math.max(0, Number(item.quantity) * Number(item.unitPrice) - Number(item.discount));
      const taxAmount = Number(item.tax);
      const inferredRate = taxable > 0 ? (taxAmount / taxable) * 100 : 0;
      return {
        id: item.id,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        tax: taxAmount,
        lineTotal: Number(item.lineTotal),
        taxCode: item.taxCode,
        taxRate: tax ? Number(tax.rate) : inferredRate,
        categoryCode: tax?.categoryCode ?? (taxAmount > 0 ? 'S' : 'O'),
        exemptionReasonCode: tax?.exemptionReasonCode ?? null,
      };
    });

    const generated = await generateZatcaInvoice({
      invoiceNumber: sale.saleNumber,
      uuid,
      invoiceType: body.data.invoiceType,
      issueDate: sale.createdAt,
      icv: nextIcv,
      previousInvoiceHash,
      seller: {
        legalName: settings.legalName,
        vatNumber: settings.vatNumber,
        street: settings.sellerStreet,
        buildingNumber: settings.sellerBuildingNumber,
        city: settings.sellerCity,
        postalCode: settings.sellerPostalCode,
        countryCode: settings.sellerCountryCode || 'SA',
      },
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      tax: Number(sale.tax),
      total: Number(sale.total),
      lines: invoiceLines,
    });

    await tx.update(zatcaSettings).set({
      lastIcv: nextIcv,
      updatedAt: new Date(),
    }).where(eq(zatcaSettings.id, settings.id));

    const rows = await tx.insert(eInvoices).values({
      centerId: auth.user.centerId!, saleId: sale.id, invoiceNumber: sale.saleNumber,
      uuid, invoiceType: body.data.invoiceType, status: 'prepared',
      invoiceHash: generated.invoiceHash, xml: generated.xml, qrCode: generated.qrCode,
    }).returning();

    return { invoice: rows[0] };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, string, number]> = {
      SALE_NOT_FOUND: ['SALE_NOT_FOUND', 'عملية البيع غير موجودة أو غير مكتملة', 404],
      ZATCA_SELLER_NOT_CONFIGURED: ['ZATCA_SELLER_NOT_CONFIGURED', 'أكمل اسم المنشأة والرقم الضريبي في إعدادات ZATCA', 409],
      ZATCA_SELLER_ADDRESS_REQUIRED: ['ZATCA_SELLER_ADDRESS_REQUIRED', 'أكمل عنوان المنشأة في إعدادات ZATCA قبل توليد الفاتورة', 409],
      STANDARD_BUYER_DATA_REQUIRED: ['STANDARD_BUYER_DATA_REQUIRED', 'الفاتورة القياسية تحتاج بيانات مشتري كاملة قبل تفعيل هذا المسار', 409],
      EMPTY_SALE: ['EMPTY_SALE', 'لا يمكن إصدار فاتورة لعملية بيع بدون أصناف', 409],
    };
    const errorCode = result.error ?? 'ZATCA_PREPARE_ERROR';
    const [code, message, status] = messages[errorCode] ?? ['ZATCA_PREPARE_ERROR', 'تعذر تجهيز الفاتورة الإلكترونية', 500];
    return c.json({ error: { code, message } }, status as any);
  }
  return c.json({ invoice: result.invoice }, 201);
});

zatcaRoutes.post('/invoices/:id/submit', async c => {
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const invoiceRows = await withDatabase(c.env, db => db.select().from(eInvoices).where(and(
    eq(eInvoices.id, c.req.param('id')), eq(eInvoices.centerId, auth.user.centerId!),
  )).limit(1));
  const invoice = invoiceRows[0];
  if (!invoice) return c.json({ error: { code: 'EINVOICE_NOT_FOUND', message: 'الفاتورة الإلكترونية غير موجودة' } }, 404);
  if (!invoice.xml || !invoice.invoiceHash || !/<(?:ds:)?Signature\\b/.test(invoice.xml)) {
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
  const auth = await requirePermission(c, 'zatca.manage'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(eInvoices)
    .where(eq(eInvoices.centerId, auth.user.centerId!))
    .orderBy(desc(eInvoices.createdAt)).limit(100));
  return c.json({ invoices: rows });
});
