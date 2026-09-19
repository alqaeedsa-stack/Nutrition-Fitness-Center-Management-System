import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { products, purchaseOrderItems, purchaseOrders, purchaseReturnItems, purchaseReturns, purchaseReceipts, purchaseReceiptItems, stockMovements, vendors } from '../db/schema';
import { requirePermission } from '../auth/permissions';
import { postPurchaseReturn } from '../accounting/service';
import { getProductCost } from '../inventory/costing';

export type PurchaseBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const purchaseRoutes = new Hono<{ Bindings: PurchaseBindings }>();

async function access(c: any, permission: 'purchases.read' | 'purchases.write') {
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

function receiptNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return 'GRN-' + stamp + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

function poNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return 'PO-' + stamp + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

purchaseRoutes.get('/vendors', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select().from(vendors)
    .where(eq(vendors.centerId, auth.user.centerId!))
    .orderBy(asc(vendors.name)));
  return c.json({ vendors: rows });
});

purchaseRoutes.post('/vendors', async c => {
  const auth = await access(c, 'purchases.write');
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
  const auth = await access(c, 'purchases.write');
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
  const auth = await access(c, 'purchases.read');
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
  const auth = await access(c, 'purchases.read');
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
    sku: products.sku, quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity, returnedQuantity: purchaseOrderItems.returnedQuantity,
    unitCost: purchaseOrderItems.unitCost, tax: purchaseOrderItems.tax, lineTotal: purchaseOrderItems.lineTotal,
  }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId))
    .where(eq(purchaseOrderItems.purchaseOrderId, order[0].id)).orderBy(asc(products.name)));
  return c.json({ order: order[0], items });
});

purchaseRoutes.post('/orders', async c => {
  const auth = await access(c, 'purchases.write');
  if ('error' in auth) return auth.error;
  const parsed = purchaseOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات أمر الشراء غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const vendor = await tx.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.id, parsed.data.vendorId), eq(vendors.centerId, auth.user.centerId!), eq(vendors.active, true))).limit(1);
    if (!vendor[0]) return { error: 'VENDOR_NOT_FOUND' as const };

    const productIds = [...new Set(parsed.data.items.map(item => item.productId))];
    const productRows = await tx.select({ id: products.id, costMethod: products.costMethod, purchaseCost: products.purchaseCost }).from(products)
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
  const auth = await access(c, 'purchases.write');
  if ('error' in auth) return auth.error;
  const parsed = z.object({ status: z.enum(['sent', 'confirmed', 'cancelled']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_STATUS', message: 'حالة أمر الشراء غير صحيحة' } }, 400);
  const order = await withDatabase(c.env, db => db.select({ id: purchaseOrders.id, status: purchaseOrders.status })
    .from(purchaseOrders).where(and(eq(purchaseOrders.id, c.req.param('id')), eq(purchaseOrders.centerId, auth.user.centerId!))).limit(1));
  if (!order[0]) return c.json({ error: { code: 'PO_NOT_FOUND', message: 'أمر الشراء غير موجود' } }, 404);
  if (order[0].status === 'cancelled' || order[0].status === 'received' || order[0].status === 'partially_received') return c.json({ error: { code: 'PO_LOCKED', message: 'لا يمكن تعديل أمر الشراء بعد الإلغاء أو بدء الاستلام' } }, 409);
  const allowed: Record<string,string[]> = { draft: ['sent','cancelled'], sent: ['confirmed','cancelled'], confirmed: ['cancelled'] };
  if (!(allowed[order[0].status] ?? []).includes(parsed.data.status)) return c.json({ error: { code: 'INVALID_TRANSITION', message: 'لا يمكن الانتقال من '+order[0].status+' إلى '+parsed.data.status } }, 409);
  const rows = await withDatabase(c.env, db => db.update(purchaseOrders).set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, order[0].id), eq(purchaseOrders.centerId, auth.user.centerId!))).returning());
  return c.json({ order: rows[0] });
});

purchaseRoutes.post('/orders/:id/receive', async c => {
  const auth = await access(c, 'purchases.write');
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

    const receipt = await tx.insert(purchaseReceipts).values({
      centerId: auth.user.centerId!,
      purchaseOrderId: order[0].id,
      receiptNumber: receiptNumber(),
      receiptDate: new Date().toISOString().slice(0, 10),
      status: 'posted',
      notes: parsed.data.notes || null,
      createdBy: auth.user.userId,
    }).returning();
    if (!receipt[0]) throw new Error('Purchase receipt insert failed');

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
      const current = await tx.select({
        stock: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
        purchaseCost: products.purchaseCost,
      }).from(products).leftJoin(stockMovements, and(
        eq(stockMovements.productId, products.id),
        eq(stockMovements.centerId, auth.user.centerId!),
      )).where(eq(products.id, line.productId)).groupBy(products.id);
      const currentStock = Number(current[0]?.stock ?? 0);
      const currentCost = Number(current[0]?.purchaseCost ?? 0);
      const newStock = currentStock + requested.quantity;
      const weightedCost = newStock > 0 ? ((currentStock * currentCost) + (requested.quantity * unitCost)) / newStock : unitCost;

      await tx.insert(purchaseReceiptItems).values({
        purchaseReceiptId: receipt[0].id,
        purchaseOrderItemId: line.id,
        productId: line.productId,
        quantity: requested.quantity.toString(),
        unitCost: unitCost.toFixed(2),
      });
      await tx.insert(stockMovements).values({
        centerId: auth.user.centerId!, productId: line.productId, movementType: 'purchase',
        quantity: requested.quantity.toString(), unitCost: unitCost.toFixed(2),
        referenceType: 'purchase_receipt', referenceId: receipt[0].id, occurredAt: new Date(),
        createdBy: auth.user.userId, notes: parsed.data.notes || ('استلام من أمر الشراء ' + order[0].poNumber),
      });
      await tx.update(products).set({ purchaseCost: weightedCost.toFixed(2), updatedAt: new Date() })
        .where(and(eq(products.id, line.productId), eq(products.centerId, auth.user.centerId!)));
      receivedAny = true;
    }

    const refreshed = await tx.select({ quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity })
      .from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order[0].id));
    const fullyReceived = refreshed.length > 0 && refreshed.every(item => Number(item.receivedQuantity) >= Number(item.quantity) - 0.000001);
    await tx.update(purchaseOrders).set({
      status: fullyReceived ? 'received' : 'partially_received',
      updatedAt: new Date(),
    }).where(eq(purchaseOrders.id, order[0].id));

    return { receivedAny, status: fullyReceived ? 'received' : 'partially_received', receiptNumber: receipt[0].receiptNumber, receiptId: receipt[0].id };
  }));
  if ('error' in result) {
    const messages: Record<string,string> = {
      PO_NOT_FOUND: 'أمر الشراء غير موجود', PO_NOT_RECEIVABLE: 'أمر الشراء يجب أن يكون مؤكدًا قبل الاستلام',
      PO_ITEM_NOT_FOUND: 'أحد بنود أمر الشراء غير موجود',
      PRODUCT_NOT_FOUND: 'أحد منتجات المرتجع غير موجود في المركز', RECEIPT_QTY_EXCEEDED: 'كمية الاستلام أكبر من الكمية المتبقية',
    };
    const errorCode = String(result.error ?? 'UNKNOWN');
    const message = messages[errorCode] ?? 'تعذر تسجيل الاستلام';
    const details = 'itemId' in result ? { itemId: result.itemId, remaining: result.remaining, requested: result.requested } : undefined;
    return c.json({ error: { code: errorCode, message, ...(details ? { details } : {}) } }, errorCode === 'PO_NOT_FOUND' ? 404 : 409);
  }
  return c.json({ ok: true, status: result.status, receiptNumber: result.receiptNumber, receiptId: result.receiptId });
});



purchaseRoutes.get('/receipts', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: purchaseReceipts.id,
    receiptNumber: purchaseReceipts.receiptNumber,
    receiptDate: purchaseReceipts.receiptDate,
    status: purchaseReceipts.status,
    notes: purchaseReceipts.notes,
    purchaseOrderId: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    vendorId: vendors.id,
    vendorName: vendors.name,
  }).from(purchaseReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReceipts.purchaseOrderId))
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(eq(purchaseReceipts.centerId, auth.user.centerId!))
    .orderBy(desc(purchaseReceipts.receiptDate), desc(purchaseReceipts.createdAt)));
  return c.json({ receipts: rows });
});

purchaseRoutes.get('/receipts/:id', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const receipt = await withDatabase(c.env, db => db.select({
    id: purchaseReceipts.id,
    receiptNumber: purchaseReceipts.receiptNumber,
    receiptDate: purchaseReceipts.receiptDate,
    status: purchaseReceipts.status,
    notes: purchaseReceipts.notes,
    purchaseOrderId: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    vendorId: vendors.id,
    vendorName: vendors.name,
  }).from(purchaseReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReceipts.purchaseOrderId))
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(and(eq(purchaseReceipts.id, c.req.param('id')), eq(purchaseReceipts.centerId, auth.user.centerId!)))
    .limit(1));
  if (!receipt[0]) return c.json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'مستند الاستلام غير موجود' } }, 404);

  const items = await withDatabase(c.env, db => db.select({
    id: purchaseReceiptItems.id,
    purchaseOrderItemId: purchaseReceiptItems.purchaseOrderItemId,
    productId: purchaseReceiptItems.productId,
    productName: products.name,
    sku: products.sku,
    quantity: purchaseReceiptItems.quantity,
    unitCost: purchaseReceiptItems.unitCost,
  }).from(purchaseReceiptItems)
    .innerJoin(products, eq(products.id, purchaseReceiptItems.productId))
    .where(eq(purchaseReceiptItems.purchaseReceiptId, receipt[0].id))
    .orderBy(asc(products.name)));
  return c.json({ receipt: receipt[0], items });
});


const returnSchema = z.object({
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().uuid(),
    quantity: z.number().positive().max(999999),
  })).min(1).max(100),
});

function returnNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return 'PR-' + stamp + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

purchaseRoutes.get('/dashboard', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, async db => {
    const [orders, returns, vendorsCount, openOrders] = await Promise.all([
      db.select({ status: purchaseOrders.status, total: purchaseOrders.total })
        .from(purchaseOrders).where(eq(purchaseOrders.centerId, auth.user.centerId!)),
      db.select({ total: purchaseReturns.total })
        .from(purchaseReturns).where(eq(purchaseReturns.centerId, auth.user.centerId!)),
      db.select({ count: sql<number>`count(*)` }).from(vendors)
        .where(and(eq(vendors.centerId, auth.user.centerId!), eq(vendors.active, true))),
      db.select({ count: sql<number>`count(*)` }).from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.centerId, auth.user.centerId!),
          inArray(purchaseOrders.status, ['sent', 'confirmed', 'partially_received'])
        )),
    ]);
    const purchaseTotal = orders.filter(x => x.status !== 'cancelled').reduce((s, x) => s + Number(x.total), 0);
    const received = orders.filter(x => x.status === 'received').length;
    const partial = orders.filter(x => x.status === 'partially_received').length;
    const draft = orders.filter(x => x.status === 'draft').length;
    const sent = orders.filter(x => x.status === 'sent').length;
    const confirmed = orders.filter(x => x.status === 'confirmed').length;
    const cancelled = orders.filter(x => x.status === 'cancelled').length;
    const returnTotal = returns.reduce((s, x) => s + Number(x.total), 0);
    return {
      activeVendors: Number(vendorsCount[0]?.count ?? 0),
      openOrders: Number(openOrders[0]?.count ?? 0),
      purchaseTotal: purchaseTotal.toFixed(2),
      returnTotal: returnTotal.toFixed(2),
      orderCounts: { draft, sent, confirmed, received, partial, cancelled, total: orders.length },
    };
  });
  return c.json(rows);
});

purchaseRoutes.get('/returns', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: purchaseReturns.id, returnNumber: purchaseReturns.returnNumber, status: purchaseReturns.status,
    returnDate: purchaseReturns.returnDate, total: purchaseReturns.total, notes: purchaseReturns.notes,
    vendorId: vendors.id, vendorName: vendors.name, poNumber: purchaseOrders.poNumber,
  }).from(purchaseReturns)
    .innerJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReturns.purchaseOrderId))
    .where(eq(purchaseReturns.centerId, auth.user.centerId!))
    .orderBy(desc(purchaseReturns.createdAt)));
  return c.json({ returns: rows });
});

purchaseRoutes.get('/vendors/:id', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const vendor = await withDatabase(c.env, db => db.select().from(vendors)
    .where(and(eq(vendors.id, c.req.param('id')), eq(vendors.centerId, auth.user.centerId!))).limit(1));
  if (!vendor[0]) return c.json({ error: { code: 'VENDOR_NOT_FOUND', message: 'المورد غير موجود' } }, 404);
  const [orders, returns] = await Promise.all([
    withDatabase(c.env, db => db.select({
      id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate, total: purchaseOrders.total,
    }).from(purchaseOrders).where(and(
      eq(purchaseOrders.vendorId, vendor[0].id), eq(purchaseOrders.centerId, auth.user.centerId!)
    )).orderBy(desc(purchaseOrders.orderDate))),
    withDatabase(c.env, db => db.select({
      id: purchaseReturns.id, returnNumber: purchaseReturns.returnNumber,
      returnDate: purchaseReturns.returnDate, total: purchaseReturns.total, purchaseOrderId: purchaseReturns.purchaseOrderId,
    }).from(purchaseReturns).where(and(
      eq(purchaseReturns.vendorId, vendor[0].id), eq(purchaseReturns.centerId, auth.user.centerId!)
    )).orderBy(desc(purchaseReturns.returnDate))),
  ]);
  return c.json({
    vendor: vendor[0],
    orders,
    returns,
    totals: {
      orders: orders.filter(x => x.status !== 'cancelled').reduce((s, x) => s + Number(x.total), 0).toFixed(2),
      returns: returns.reduce((s, x) => s + Number(x.total), 0).toFixed(2),
    },
  });
});

purchaseRoutes.post('/returns', async c => {
  const auth = await access(c, 'purchases.write');
  if ('error' in auth) return auth.error;
  const parsed = returnSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'بيانات مرتجع الشراء غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const requestedIds = [...new Set(parsed.data.items.map(x => x.purchaseOrderItemId))];
    const lines = await tx.select({
      id: purchaseOrderItems.id, purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      productId: purchaseOrderItems.productId, quantity: purchaseOrderItems.quantity,
      receivedQuantity: purchaseOrderItems.receivedQuantity, returnedQuantity: purchaseOrderItems.returnedQuantity,
      unitCost: purchaseOrderItems.unitCost, vendorId: purchaseOrders.vendorId,
      orderStatus: purchaseOrders.status,
    }).from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
      .where(and(eq(purchaseOrders.centerId, auth.user.centerId!), inArray(purchaseOrderItems.id, requestedIds)));
    if (lines.length !== requestedIds.length) return { error: 'PO_ITEM_NOT_FOUND' as const };

    const vendorId = lines[0]?.vendorId;
    if (!vendorId || lines.some(x => x.vendorId !== vendorId)) return { error: 'MULTI_VENDOR_NOT_ALLOWED' as const };

    const productIds = [...new Set(lines.map(x => x.productId))];
    const productRows = await tx.select({
      id: products.id, costMethod: products.costMethod, purchaseCost: products.purchaseCost, purchaseReturnAccountId: products.purchaseReturnAccountId, purchaseAccountId: products.purchaseAccountId,
    }).from(products).where(and(eq(products.centerId, auth.user.centerId!), inArray(products.id, productIds)));
    const productMap = new Map(productRows.map(x => [x.id, x]));
    const calculations: { line: typeof lines[number]; quantity: number; unitCost: number; lineTotal: number }[] = [];
    for (const req of parsed.data.items) {
      const line = lines.find(x => x.id === req.purchaseOrderItemId)!;
      const available = Number(line.receivedQuantity) - Number(line.returnedQuantity);
      if (req.quantity > available + 0.000001) {
        return { error: 'RETURN_QTY_EXCEEDED' as const, itemId: req.purchaseOrderItemId, remaining: available, requested: req.quantity };
      }
      const product = productMap.get(line.productId);
      if (!product) return { error: 'PRODUCT_NOT_FOUND' as const };
      const unitCost = await getProductCost(tx, {
        centerId: auth.user.centerId!, productId: line.productId, quantity: req.quantity,
        costMethod: product.costMethod, standardCost: Number(product.purchaseCost),
      });
      calculations.push({ line, quantity: req.quantity, unitCost, lineTotal: req.quantity * unitCost });
    }

    const total = calculations.reduce((sum, x) => sum + x.lineTotal, 0);
    const created = await tx.insert(purchaseReturns).values({
      centerId: auth.user.centerId!, vendorId, purchaseOrderId: lines[0]!.purchaseOrderId,
      returnNumber: returnNumber(), status: 'posted', returnDate: parsed.data.returnDate,
      total: total.toFixed(2), notes: parsed.data.notes || null, createdBy: auth.user.userId,
    }).returning();
    if (!created[0]) throw new Error('Purchase return insert failed');

    for (const item of calculations) {
      await tx.update(purchaseOrderItems).set({
        returnedQuantity: (Number(item.line.returnedQuantity) + item.quantity).toString(),
        updatedAt: new Date(),
      }).where(eq(purchaseOrderItems.id, item.line.id));
      await tx.insert(purchaseReturnItems).values({
        purchaseReturnId: created[0].id, purchaseOrderItemId: item.line.id, productId: item.line.productId,
        quantity: item.quantity.toString(), unitCost: item.unitCost.toFixed(2), lineTotal: item.lineTotal.toFixed(2),
      });
      await tx.insert(stockMovements).values({
        centerId: auth.user.centerId!, productId: item.line.productId, movementType: 'return_out',
        quantity: (-item.quantity).toString(), unitCost: item.unitCost.toFixed(2),
        referenceType: 'purchase_return', referenceId: created[0].id, occurredAt: new Date(),
        createdBy: auth.user.userId, notes: parsed.data.notes || ('مرتجع شراء ' + created[0].returnNumber),
      });
    }
    const entry = await postPurchaseReturn(tx, {
      centerId: auth.user.centerId!, returnId: created[0].id, returnNumber: created[0].returnNumber,
      date: parsed.data.returnDate, total, createdBy: auth.user.userId,
      lines: calculations.map(item => ({
        amount: item.lineTotal,
        purchaseReturnAccountId: productMap.get(item.line.productId)?.purchaseReturnAccountId ?? null,
        purchaseAccountId: productMap.get(item.line.productId)?.purchaseAccountId ?? null,
        inventoryAccountId: null,
      })),
    });
    return { returnNumber: created[0].returnNumber, total: created[0].total, journalEntryId: entry.id };
  }));

  if ('error' in result) {
    const messages: Record<string,string> = {
      PO_ITEM_NOT_FOUND: 'أحد بنود أمر الشراء غير موجود',
      MULTI_VENDOR_NOT_ALLOWED: 'يجب أن يكون المرتجع لمورد واحد',
      RETURN_QTY_EXCEEDED: 'كمية المرتجع أكبر من الكمية المستلمة والمتبقية للمرتجع',
    };
    const errorCode = String(result.error ?? 'UNKNOWN');
    const message = messages[errorCode] ?? 'تعذر تسجيل مرتجع الشراء';
    const details = 'itemId' in result ? { itemId: result.itemId, remaining: result.remaining, requested: result.requested } : undefined;
    return c.json({ error: { code: errorCode, message, ...(details ? { details } : {}) } }, 409);
  }
  return c.json({ ok: true, ...result }, 201);
});
