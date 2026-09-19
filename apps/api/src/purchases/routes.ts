import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { products, purchaseOrderItems, purchaseOrders, stockMovements, vendors } from '../db/schema';
import { requirePermission } from '../auth/permissions';

export type PurchaseBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const purchaseRoutes = new Hono<{ Bindings: PurchaseBindings }>();

async function access(c: any, permission: 'inventory.read' | 'inventory.adjust') {
  return requirePermission(c, permission);
}

const vendorSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  taxNumber: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
  address: z.string().trim().max(1000).optional().nullable(),
  paymentTerms: z.string().trim().max(100).optional().nullable(),
});

const purchaseOrderSchema = z.object({
  vendorId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(999999),
    unitCost: z.number().min(0).max(999999999),
    tax: z.number().min(0).max(999999999).default(0),
  })).min(1).max(100),
});

const receiveSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().positive().max(999999),
    unitCost: z.number().min(0).optional(),
  })).min(1).max(100),
  notes: z.string().trim().max(500).optional().nullable(),
});

function poNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return 'PO-' + stamp + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

purchaseRoutes.get('/vendors', async c => {
  const auth = await access(c, 'inventory.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(vendors)
    .where(eq(vendors.centerId, auth.user.centerId!))
    .orderBy(asc(vendors.name)));
  return c.json({ vendors: rows });
});

purchaseRoutes.post('/vendors', async c => {
  const auth = await access(c, 'inventory.adjust');
  if ('error' in auth) return auth.error;
  const parsed = vendorSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات المورد غير صحيحة' } }, 400);
  const existing = await withDatabase(c.env, db => db.select({ id: vendors.id }).from(vendors)
    .where(and(eq(vendors.centerId, auth.user.centerId!), eq(vendors.code, parsed.data.code))).limit(1));
  if (existing[0]) return c.json({ error: { code: 'VENDOR_CODE_EXISTS', message: 'كود المورد مستخدم بالفعل' } }, 409);
  const rows = await withDatabase(c.env, db => db.insert(vendors).values({
    centerId: auth.user.centerId!, code: parsed.data.code, name: parsed.data.name,
    taxNumber: parsed.data.taxNumber || null, phone: parsed.data.phone || null,
    email: parsed.data.email || null, address: parsed.data.address || null,
    paymentTerms: parsed.data.paymentTerms || null, active: true,
  }).returning());
  return c.json({ vendor: rows[0] }, 201);
});

purchaseRoutes.patch('/vendors/:id', async c => {
  const auth = await access(c, 'inventory.adjust');
  if ('error' in auth) return auth.error;
  const parsed = vendorSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات المورد غير صحيحة' } }, 400);
  const rows = await withDatabase(c.env, db => db.update(vendors).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(and(eq(vendors.id, c.req.param('id')), eq(vendors.centerId, auth.user.centerId!))).returning());
  if (!rows[0]) return c.json({ error: { code: 'VENDOR_NOT_FOUND', message: 'المورد غير موجود' } }, 404);
  return c.json({ vendor: rows[0] });
});

purchaseRoutes.get('/orders', async c => {
  const auth = await access(c, 'inventory.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
    orderDate: purchaseOrders.orderDate, expectedDate: purchaseOrders.expectedDate,
    subtotal: purchaseOrders.subtotal, tax: purchaseOrders.tax, total: purchaseOrders.total,
    vendorId: vendors.id, vendorName: vendors.name,
  }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(eq(purchaseOrders.centerId, auth.user.centerId!))
    .orderBy(desc(purchaseOrders.createdAt)));
  return c.json({ orders: rows });
});

purchaseRoutes.get('/orders/:id', async c => {
  const auth = await access(c, 'inventory.read');
  if ('error' in auth) return auth.error;
  const order = await withDatabase(c.env, db => db.select({
    id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
    orderDate: purchaseOrders.orderDate, expectedDate: purchaseOrders.expectedDate,
    notes: purchaseOrders.notes, subtotal: purchaseOrders.subtotal, tax: purchaseOrders.tax,
    total: purchaseOrders.total, vendorId: vendors.id, vendorName: vendors.name,
  }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(and(eq(purchaseOrders.id, c.req.param('id')), eq(purchaseOrders.centerId, auth.user.centerId!))).limit(1));
  if (!order[0]) return c.json({ error: { code: 'PO_NOT_FOUND', message: 'أمر الشراء غير موجود' } }, 404);
  const items = await withDatabase(c.env, db => db.select({
    id: purchaseOrderItems.id, productId: purchaseOrderItems.productId, productName: products.name,
    sku: products.sku, quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity,
    unitCost: purchaseOrderItems.unitCost, tax: purchaseOrderItems.tax, lineTotal: purchaseOrderItems.lineTotal,
  }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId))
    .where(eq(purchaseOrderItems.purchaseOrderId, order[0].id)).orderBy(asc(products.name)));
  return c.json({ order: order[0], items });
});

purchaseRoutes.post('/orders', async c => {
  const auth = await access(c, 'inventory.adjust');
  if ('error' in auth) return auth.error;
  const parsed = purchaseOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات أمر الشراء غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const vendor = await tx.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.id, parsed.data.vendorId), eq(vendors.centerId, auth.user.centerId!), eq(vendors.active, true))).limit(1);
    if (!vendor[0]) return { error: 'VENDOR_NOT_FOUND' as const };

    const productIds = [...new Set(parsed.data.items.map(item => item.productId))];
    const productRows = await tx.select({ id: products.id }).from(products)
      .where(and(eq(products.centerId, auth.user.centerId!), inArray(products.id, productIds), eq(products.active, true)));
    if (productRows.length !== productIds.length) return { error: 'PRODUCT_NOT_FOUND' as const };

    const calculations = parsed.data.items.map(item => ({
      ...item,
      lineTotal: item.quantity * item.unitCost + item.tax,
    }));
    const subtotal = calculations.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const tax = calculations.reduce((sum, item) => sum + item.tax, 0);
    const total = subtotal + tax;
    const po = await tx.insert(purchaseOrders).values({
      centerId: auth.user.centerId!, vendorId: parsed.data.vendorId, poNumber: poNumber(),
      status: 'draft', orderDate: parsed.data.orderDate, expectedDate: parsed.data.expectedDate || null,
      currencyCode: 'SAR', subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
      notes: parsed.data.notes || null, createdBy: auth.user.userId,
    }).returning();
    if (!po[0]) throw new Error('Purchase order insert failed');
    await tx.insert(purchaseOrderItems).values(calculations.map(item => ({
      purchaseOrderId: po[0].id, productId: item.productId, quantity: item.quantity.toString(),
      receivedQuantity: '0', unitCost: item.unitCost.toFixed(2), tax: item.tax.toFixed(2), lineTotal: item.lineTotal.toFixed(2),
    })));
    return { order: po[0] };
  }));
  if ('error' in result) return c.json({ error: { code: result.error, message: result.error === 'VENDOR_NOT_FOUND' ? 'المورد غير موجود' : 'أحد المنتجات غير موجود أو غير نشط' } }, 409);
  return c.json(result, 201);
});

purchaseRoutes.patch('/orders/:id/status', async c => {
  const auth = await access(c, 'inventory.adjust');
  if ('error' in auth) return auth.error;
  const parsed = z.object({ status: z.enum(['sent', 'confirmed', 'cancelled']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_STATUS', message: 'حالة أمر الشراء غير صحيحة' } }, 400);
  const order = await withDatabase(c.env, db => db.select({ id: purchaseOrders.id, status: purchaseOrders.status })
    .from(purchaseOrders).where(and(eq(purchaseOrders.id, c.req.param('id')), eq(purchaseOrders.centerId, auth.user.centerId!))).limit(1));
  if (!order[0]) return c.json({ error: { code: 'PO_NOT_FOUND', message: 'أمر الشراء غير موجود' } }, 404);
  if (order[0].status === 'cancelled' || order[0].status === 'received') return c.json({ error: { code: 'PO_LOCKED', message: 'لا يمكن تعديل أمر الشراء بعد الإلغاء أو الإغلاق' } }, 409);
  const rows = await withDatabase(c.env, db => db.update(purchaseOrders).set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, order[0].id), eq(purchaseOrders.centerId, auth.user.centerId!))).returning());
  return c.json({ order: rows[0] });
});

purchaseRoutes.post('/orders/:id/receive', async c => {
  const auth = await access(c, 'inventory.adjust');
  if ('error' in auth) return auth.error;
  const parsed = receiveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات الاستلام غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const order = await tx.select({ id: purchaseOrders.id, status: purchaseOrders.status, poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders).where(and(eq(purchaseOrders.id, c.req.param('id')), eq(purchaseOrders.centerId, auth.user.centerId!))).limit(1);
    if (!order[0]) return { error: 'PO_NOT_FOUND' as const };
    if (!['confirmed', 'partially_received'].includes(order[0].status)) return { error: 'PO_NOT_RECEIVABLE' as const };

    const itemIds = [...new Set(parsed.data.items.map(item => item.itemId))];
    const lines = await tx.select({
      id: purchaseOrderItems.id, productId: purchaseOrderItems.productId,
      quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity,
      unitCost: purchaseOrderItems.unitCost,
    }).from(purchaseOrderItems).where(and(eq(purchaseOrderItems.purchaseOrderId, order[0].id), inArray(purchaseOrderItems.id, itemIds)));
    if (lines.length !== itemIds.length) return { error: 'PO_ITEM_NOT_FOUND' as const };

    let receivedAny = false;
    for (const requested of parsed.data.items) {
      const line = lines.find(item => item.id === requested.itemId)!;
      const remaining = Number(line.quantity) - Number(line.receivedQuantity);
      if (requested.quantity > remaining + 0.000001) return { error: 'RECEIPT_QTY_EXCEEDED' as const, itemId: requested.itemId, remaining, requested: requested.quantity };
      const unitCost = requested.unitCost ?? Number(line.unitCost);
      await tx.update(purchaseOrderItems).set({
        receivedQuantity: (Number(line.receivedQuantity) + requested.quantity).toString(),
        updatedAt: new Date(),
      }).where(eq(purchaseOrderItems.id, line.id));
      await tx.insert(stockMovements).values({
        centerId: auth.user.centerId!, productId: line.productId, movementType: 'purchase',
        quantity: requested.quantity.toString(), unitCost: unitCost.toFixed(2),
        referenceType: 'purchase_order', referenceId: order[0].id, occurredAt: new Date(),
        createdBy: auth.user.userId, notes: parsed.data.notes || ('استلام من أمر الشراء ' + order[0].poNumber),
      });
      receivedAny = true;
    }

    const refreshed = await tx.select({ quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity })
      .from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order[0].id));
    const fullyReceived = refreshed.length > 0 && refreshed.every(item => Number(item.receivedQuantity) >= Number(item.quantity) - 0.000001);
    await tx.update(purchaseOrders).set({
      status: fullyReceived ? 'received' : 'partially_received',
      updatedAt: new Date(),
    }).where(eq(purchaseOrders.id, order[0].id));

    return { receivedAny, status: fullyReceived ? 'received' : 'partially_received' };
  }));
  if ('error' in result) {
    const messages: Record<string,string> = {
      PO_NOT_FOUND: 'أمر الشراء غير موجود', PO_NOT_RECEIVABLE: 'أمر الشراء يجب أن يكون مؤكدًا قبل الاستلام',
      PO_ITEM_NOT_FOUND: 'أحد بنود أمر الشراء غير موجود', RECEIPT_QTY_EXCEEDED: 'كمية الاستلام أكبر من الكمية المتبقية',
    };
    const errorCode = String(result.error ?? 'UNKNOWN');
    const message = messages[errorCode] ?? 'تعذر تسجيل الاستلام';
    const details = 'itemId' in result ? { itemId: result.itemId, remaining: result.remaining, requested: result.requested } : undefined;
    return c.json({ error: { code: errorCode, message, ...(details ? { details } : {}) } }, errorCode === 'PO_NOT_FOUND' ? 404 : 409);
  }
  return c.json({ ok: true, status: result.status });
});
