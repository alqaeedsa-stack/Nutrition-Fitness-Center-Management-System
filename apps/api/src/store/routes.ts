import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthenticatedUser } from '../auth/session';
import { withDatabase } from '../db/client';
import { customerAccounts } from '../db/customer-accounts';
import { customers, products, sales, saleItems, stockMovements, taxRates } from '../db/schema';
import { requirePermission } from '../auth/permissions';
import { storeCartItems, storeCarts, storeOrderItems, storeOrders } from '../db/store';
import { postSale, reverseSale } from '../accounting/service';

export type StoreBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const storeRoutes = new Hono<{ Bindings: StoreBindings }>();

async function customerContext(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };

  const account = await withDatabase(c.env, db => db.select({
    customerId: customerAccounts.customerId,
    status: customerAccounts.status,
  }).from(customerAccounts).where(eq(customerAccounts.userId, user.userId)).limit(1));

  if (!account[0] || account[0].status !== 'active') {
    return { error: c.json({ error: { code: 'CUSTOMER_ACCESS_REQUIRED', message: 'هذه الوحدة مخصصة للعملاء' } }, 403) };
  }

  return { user, customerId: account[0].customerId };
}

async function getOrCreateCart(c: any, customerId: string, centerId: string) {
  return withDatabase(c.env, async db => {
    const existing = await db.select().from(storeCarts)
      .where(and(eq(storeCarts.customerId, customerId), eq(storeCarts.centerId, centerId), eq(storeCarts.status, 'active')))
      .limit(1);
    if (existing[0]) return existing[0];

    try {
      const rows = await db.insert(storeCarts).values({ customerId, centerId, status: 'active' }).returning();
      return rows[0];
    } catch {
      const retry = await db.select().from(storeCarts)
        .where(and(eq(storeCarts.customerId, customerId), eq(storeCarts.status, 'active')))
        .limit(1);
      return retry[0];
    }
  });
}



async function staffContext(c: any, permission: 'catalog.read' | 'inventory.read' | 'inventory.adjust' | 'pos.read' | 'pos.sell' | 'pos.void') {
  return requirePermission(c, permission);
}

storeRoutes.get('/admin/products', async c => {
  const auth = await staffContext(c, 'catalog.read');
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    productType: products.productType,
    sellingPrice: products.sellingPrice,
    purchaseCost: products.purchaseCost,
    taxCode: products.taxCode,
    reorderPoint: products.reorderPoint,
    active: products.active,
    categoryId: products.categoryId,
    barcode: sql<string | null>`(select pb.barcode from product_barcodes pb where pb.product_id = ${products.id} and pb.active = true order by pb.id limit 1)`,
  }).from(products).where(eq(products.centerId, auth.user.centerId!)).orderBy(asc(products.name)));

  const movements = rows.length ? await withDatabase(c.env, db => db.select({
    productId: stockMovements.productId,
    quantity: stockMovements.quantity,
  }).from(stockMovements).where(and(
    eq(stockMovements.centerId, auth.user.centerId!),
    inArray(stockMovements.productId, rows.map(row => row.id)),
  ))) : [];

  const stock = new Map<string, number>();
  for (const movement of movements) stock.set(movement.productId, (stock.get(movement.productId) ?? 0) + Number(movement.quantity));

  return c.json({ products: rows.map(product => ({ ...product, quantity: stock.get(product.id) ?? 0 })) });
});

storeRoutes.get('/admin/customers/:customerId/sales', async c => {
  const auth = await staffContext(c, 'pos.read');
  if ('error' in auth) return auth.error;
  const customer = await withDatabase(c.env, db => db.select({ id: customers.id })
    .from(customers).where(and(eq(customers.id, c.req.param('customerId')), eq(customers.centerId, auth.user.centerId!))).limit(1));
  if (!customer[0]) return c.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' } }, 404);

  const rows = await withDatabase(c.env, db => db.select().from(sales)
    .where(and(eq(sales.customerId, customer[0].id), eq(sales.centerId, auth.user.centerId!)))
    .orderBy(desc(sales.createdAt)));
  return c.json({ sales: rows });
});

storeRoutes.get('/admin/sales/:saleId', async c => {
  const auth = await staffContext(c, 'pos.read');
  if ('error' in auth) return auth.error;
  const saleId = c.req.param('saleId');
  if (!z.string().uuid().safeParse(saleId).success) return c.json({ error: { code: 'INVALID_SALE_ID', message: 'رقم عملية البيع غير صحيح' } }, 400);

  const sale = await withDatabase(c.env, db => db.select({
    id: sales.id, saleNumber: sales.saleNumber, status: sales.status, subtotal: sales.subtotal,
    discount: sales.discount, tax: sales.tax, total: sales.total, paymentStatus: sales.paymentStatus,
    paymentMethod: sales.paymentMethod, createdAt: sales.createdAt,
  }).from(sales).where(and(eq(sales.id, saleId), eq(sales.centerId, auth.user.centerId!))).limit(1));
  if (!sale[0]) return c.json({ error: { code: 'SALE_NOT_FOUND', message: 'عملية البيع غير موجودة' } }, 404);

  const items = await withDatabase(c.env, db => db.select({
    id: saleItems.id, productId: saleItems.productId, productName: products.name,
    sku: products.sku, quantity: saleItems.quantity, unitPrice: saleItems.unitPrice,
    tax: saleItems.tax, lineTotal: saleItems.lineTotal,
  }).from(saleItems).innerJoin(products, eq(products.id, saleItems.productId))
    .where(eq(saleItems.saleId, saleId)).orderBy(asc(products.name)));

  const returnedRows = await withDatabase(c.env, db => db.select({
    productId: stockMovements.productId, quantity: stockMovements.quantity,
  }).from(stockMovements).where(and(
    eq(stockMovements.centerId, auth.user.centerId!),
    eq(stockMovements.referenceType, 'sale_return'),
    eq(stockMovements.referenceId, saleId),
  )));
  const returned = new Map<string, number>();
  for (const row of returnedRows) returned.set(row.productId, (returned.get(row.productId) ?? 0) + Number(row.quantity));

  return c.json({ sale: sale[0], items: items.map(item => ({
    ...item,
    returnedQuantity: returned.get(item.productId) ?? 0,
    returnableQuantity: Math.max(0, Number(item.quantity) - (returned.get(item.productId) ?? 0)),
  })) });
});

const staffSaleSchema = z.object({
  customerId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'mada', 'card', 'bank_transfer', 'apple_pay']),
  paymentStatus: z.enum(['paid', 'unpaid', 'partial']).default('paid'),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(9999),
  })).min(1),
});

storeRoutes.post('/admin/sales', async c => {
  const auth = await staffContext(c, 'pos.sell');
  if ('error' in auth) return auth.error;

  const parsed = staffSaleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات البيع غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const customer = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, parsed.data.customerId), eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'))).limit(1);
    if (!customer[0]) return { error: 'CUSTOMER_NOT_FOUND' as const };

    const productIds = [...new Set(parsed.data.items.map(item => item.productId))];
    const productRows = await tx.select({
      id: products.id, sku: products.sku, name: products.name, productType: products.productType, sellingPrice: products.sellingPrice, purchaseCost: products.purchaseCost, taxCode: products.taxCode, active: products.active,
    }).from(products).where(and(eq(products.centerId, auth.user.centerId!), inArray(products.id, productIds), eq(products.active, true)));
    if (productRows.length !== productIds.length) return { error: 'PRODUCT_NOT_FOUND' as const };

    const taxCodes = [...new Set(productRows.map(product => product.taxCode).filter((code): code is string => Boolean(code)))];
    const taxRows = taxCodes.length
      ? await tx.select({ code: taxRates.code, rate: taxRates.rate, categoryCode: taxRates.categoryCode, exemptionReasonCode: taxRates.exemptionReasonCode })
        .from(taxRates)
        .where(and(eq(taxRates.centerId, auth.user.centerId!), inArray(taxRates.code, taxCodes), eq(taxRates.active, true)))
      : [];
    const taxMap = new Map(taxRows.map(row => [row.code, row]));
    for (const product of productRows) {
      if (product.taxCode && !taxMap.has(product.taxCode)) return { error: 'TAX_CONFIGURATION_REQUIRED' as const, taxCode: product.taxCode };
    }

    const movements = await tx.select({ productId: stockMovements.productId, quantity: stockMovements.quantity })
      .from(stockMovements).where(and(eq(stockMovements.centerId, auth.user.centerId!), inArray(stockMovements.productId, productIds)));
    const onHand = new Map<string, number>();
    for (const movement of movements) onHand.set(movement.productId, (onHand.get(movement.productId) ?? 0) + Number(movement.quantity));

    const requested = new Map<string, number>();
    for (const item of parsed.data.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    for (const [productId, quantity] of requested) {
      const product = productRows.find(row => row.id === productId)!;
      const available = onHand.get(productId) ?? 0;
      if (product.productType !== 'subscription' && quantity > available) return { error: 'INSUFFICIENT_STOCK' as const, productId, available, requested: quantity };
    }

    for (const item of parsed.data.items) {
      const product = productRows.find(row => row.id === item.productId)!;
      if (Number(product.sellingPrice) < Number(product.purchaseCost)) {
        return { error: 'BELOW_COST' as const, productId: item.productId, sellingPrice: Number(product.sellingPrice), purchaseCost: Number(product.purchaseCost) };
      }
    }

    const lineCalculations = parsed.data.items.map(item => {
      const product = productRows.find(row => row.id === item.productId)!;
      const taxableBase = item.quantity * Number(product.sellingPrice);
      const taxConfig = product.taxCode ? taxMap.get(product.taxCode) : null;
      const taxAmount = taxConfig && taxConfig.categoryCode === 'S' ? taxableBase * Number(taxConfig.rate) / 100 : 0;
      const lineTotal = taxableBase + taxAmount;
      return { item, product, taxableBase, taxAmount, lineTotal };
    });
    const subtotal = lineCalculations.reduce((sum, line) => sum + line.taxableBase, 0);
    const taxTotal = lineCalculations.reduce((sum, line) => sum + line.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;
    const saleNumber = 'POS-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();

    const sale = await tx.insert(sales).values({
      centerId: auth.user.centerId!,
      customerId: customer[0].id,
      cashierId: auth.user.userId,
      saleNumber,
      status: 'completed',
      currencyCode: 'SAR',
      subtotal: subtotal.toFixed(2),
      discount: '0',
      tax: taxTotal.toFixed(2),
      total: grandTotal.toFixed(2),
      paymentStatus: parsed.data.paymentStatus,
      paymentMethod: parsed.data.paymentMethod,
    }).returning();
    if (!sale[0]) return { error: 'SALE_CREATE_FAILED' as const };

    for (const line of lineCalculations) {
      const { item, product, taxAmount, lineTotal } = line;
      await tx.insert(saleItems).values({
        saleId: sale[0].id, productId: product.id, quantity: item.quantity.toString(), unitPrice: product.sellingPrice, discount: '0', tax: taxAmount.toFixed(2), lineTotal: lineTotal.toFixed(2),
      });
      if (product.productType !== 'subscription') {
        await tx.insert(stockMovements).values({
          centerId: auth.user.centerId!, productId: product.id, movementType: 'sale', quantity: (-item.quantity).toString(), unitCost: product.purchaseCost,
          referenceType: 'sale', referenceId: sale[0].id, occurredAt: new Date(), createdBy: auth.user.userId, notes: 'صرف من نقطة البيع',
        });
      }
    }
    const accountingPaymentMethod = parsed.data.paymentStatus === 'unpaid' ? 'unpaid' : parsed.data.paymentStatus === 'paid' ? parsed.data.paymentMethod : 'partial';
    try {
      const cogs = lineCalculations.reduce((sum, line) => sum + (line.product.productType === 'subscription' ? 0 : Number(line.item.quantity) * Number(line.product.purchaseCost)), 0);
      const entry = await postSale(tx, { centerId: auth.user.centerId!, saleId: sale[0].id, saleNumber: sale[0].saleNumber, saleDate: new Date().toISOString().slice(0,10), subtotal, tax: taxTotal, total: grandTotal, cogs, paymentMethod: accountingPaymentMethod, createdBy: auth.user.userId });
      return { sale: sale[0], journalEntry: entry };
    } catch (e) {
      throw e;
    }
  }));

  if ('error' in result) {
    const errorCode = result.error;
    if (!errorCode) {
      return c.json({ error: { code: 'SALE_CREATE_FAILED', message: 'تعذر إنشاء عملية البيع' } }, 500);
    }

    const messages: Record<string, string> = {
      CUSTOMER_NOT_FOUND: 'العميل غير موجود أو غير نشط',
      PRODUCT_NOT_FOUND: 'أحد المنتجات غير موجود أو غير نشط',
      TAX_CONFIGURATION_REQUIRED: 'يوجد منتج عليه رمز ضريبة غير مرتبط بكود ضريبي نشط. لم يتم إنشاء البيع.',
      SALE_CREATE_FAILED: 'تعذر إنشاء عملية البيع',
      BELOW_COST: 'لا يمكن بيع المنتج بسعر أقل من تكلفة الشراء',
    };
    if (errorCode === 'BELOW_COST') return c.json({ error: { code: errorCode, message: messages[errorCode], details: { productId: result.productId, sellingPrice: result.sellingPrice, purchaseCost: result.purchaseCost } } }, 409);
    if (errorCode === 'INSUFFICIENT_STOCK') {
      return c.json({
        error: {
          code: errorCode,
          message: 'الكمية المطلوبة أكبر من المخزون المتاح',
          details: { productId: result.productId, available: result.available, requested: result.requested },
        },
      }, 409);
    }
    return c.json({
      error: { code: errorCode, message: messages[errorCode] ?? 'تعذر إنشاء البيع', ...(errorCode === 'TAX_CONFIGURATION_REQUIRED' && 'taxCode' in result ? { details: { taxCode: result.taxCode } } : {}) },
    }, errorCode === 'TAX_CONFIGURATION_REQUIRED' ? 409 : 400);
  }

  return c.json({ sale: result.sale }, 201);
});

storeRoutes.get('/admin/sales', async c => {
  const auth = await staffContext(c, 'pos.read');
  if ('error' in auth) return auth.error;
  const parsedLimit = Number(c.req.query('limit') ?? 100);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;
  const rows = await withDatabase(c.env, db => db.select({
    id: sales.id,
    saleNumber: sales.saleNumber,
    status: sales.status,
    subtotal: sales.subtotal,
    discount: sales.discount,
    tax: sales.tax,
    total: sales.total,
    paymentStatus: sales.paymentStatus,
    paymentMethod: sales.paymentMethod,
    createdAt: sales.createdAt,
    customerName: customers.firstName,
    customerLastName: customers.lastName,
  }).from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.centerId, auth.user.centerId!))
    .orderBy(desc(sales.createdAt))
    .limit(limit));
  return c.json({ sales: rows.map(row => ({ ...row, customerName: row.customerName ? row.customerName + ' ' + (row.customerLastName ?? '') : null })) });
});

storeRoutes.post('/admin/sales/:saleId/void', async c => {
  const auth = await staffContext(c, 'pos.void');
  if ('error' in auth) return auth.error;
  const saleId = c.req.param('saleId');
  if (!z.string().uuid().safeParse(saleId).success) return c.json({ error: { code: 'INVALID_SALE_ID', message: 'رقم عملية البيع غير صحيح' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const saleRows = await tx.select({ id:sales.id, status:sales.status, saleNumber:sales.saleNumber })
      .from(sales).where(and(eq(sales.id,saleId),eq(sales.centerId,auth.user.centerId!))).limit(1);
    if (!saleRows[0]) return { error:'SALE_NOT_FOUND' as const };
    if (saleRows[0].status !== 'completed') return { error:'SALE_NOT_VOIDABLE' as const };

    const lines = await tx.select({productId:saleItems.productId,quantity:saleItems.quantity})
      .from(saleItems).where(eq(saleItems.saleId,saleId));
    if (!lines.length) return { error:'SALE_ITEMS_NOT_FOUND' as const };

    const returnedRows = await tx.select({productId:stockMovements.productId,quantity:stockMovements.quantity})
      .from(stockMovements).where(and(eq(stockMovements.centerId,auth.user.centerId!),eq(stockMovements.referenceType,'sale_return'),eq(stockMovements.referenceId,saleId)));
    const alreadyReturned = new Map<string,number>();
    for(const row of returnedRows) alreadyReturned.set(row.productId,(alreadyReturned.get(row.productId)??0)+Number(row.quantity));

    const productsRows = await tx.select({id:products.id,purchaseCost:products.purchaseCost,productType:products.productType})
      .from(products).where(and(eq(products.centerId,auth.user.centerId!),inArray(products.id,[...new Set(lines.map(x=>x.productId))])));
    const productMap = new Map(productsRows.map(x=>[x.id,x]));
    for(const line of lines){
      const remaining=Math.max(0,Number(line.quantity)-(alreadyReturned.get(line.productId)??0));
      if(remaining<=0) continue;
      const product=productMap.get(line.productId);
      if(!product) return {error:'PRODUCT_NOT_FOUND' as const};
      if (product.productType !== 'subscription') {
        await tx.insert(stockMovements).values({
          centerId:auth.user.centerId!,productId:line.productId,movementType:'return_in',quantity:remaining.toString(),
          unitCost:product.purchaseCost,referenceType:'sale_return',referenceId:saleId,occurredAt:new Date(),createdBy:auth.user.userId,
          notes:'عكس بيع وإرجاع المخزون '+saleRows[0].saleNumber,
        });
      }
    }

    const journalEntry=await reverseSale(tx,{centerId:auth.user.centerId!,saleId,saleNumber:saleRows[0].saleNumber,date:new Date().toISOString().slice(0,10),createdBy:auth.user.userId});
    await tx.update(sales).set({status:'voided',paymentStatus:'refunded',updatedAt:new Date()})
      .where(and(eq(sales.id,saleId),eq(sales.centerId,auth.user.centerId!)));
    return {ok:true,journalEntry};
  }));

  if ('error' in result) {
    const messages:Record<string,string>={
      SALE_NOT_FOUND:'عملية البيع غير موجودة',
      SALE_NOT_VOIDABLE:'لا يمكن إلغاء عملية البيع بعد تغيير حالتها',
      SALE_ITEMS_NOT_FOUND:'لا توجد بنود مرتبطة بالبيع',
      PRODUCT_NOT_FOUND:'أحد منتجات البيع غير موجود في المركز',
    };
    const code=String(result.error);
    return c.json({error:{code,message:messages[code]??'تعذر إلغاء عملية البيع'}},code==='SALE_NOT_FOUND'?404:409);
  }
  return c.json(result);
});

const saleReturnSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(9999),
  })).min(1),
});

storeRoutes.post('/admin/sales/:saleId/return', async c => {
  const auth = await staffContext(c, 'pos.void');
  if ('error' in auth) return auth.error;

  const saleId = c.req.param('saleId');
  if (!z.string().uuid().safeParse(saleId).success) {
    return c.json({ error: { code: 'INVALID_SALE_ID', message: 'رقم عملية البيع غير صحيح' } }, 400);
  }
  const parsed = saleReturnSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'حدد كميات المرتجع لكل منتج' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const saleRows = await tx.select({
      id: sales.id, status: sales.status, customerId: sales.customerId, saleNumber: sales.saleNumber,
    }).from(sales).where(and(eq(sales.id, saleId), eq(sales.centerId, auth.user.centerId!))).limit(1);

    if (!saleRows[0]) return { error: 'SALE_NOT_FOUND' as const };
    if (!['completed', 'partially_returned'].includes(saleRows[0].status)) return { error: 'SALE_NOT_RETURNABLE' as const };

    const saleLines = await tx.select({
      productId: saleItems.productId, quantity: saleItems.quantity, unitPrice: saleItems.unitPrice, tax: saleItems.tax,
    }).from(saleItems).where(eq(saleItems.saleId, saleId));
    if (!saleLines.length) return { error: 'SALE_ITEMS_NOT_FOUND' as const };

    const returnedRows = await tx.select({
      productId: stockMovements.productId, quantity: stockMovements.quantity,
    }).from(stockMovements).where(and(
      eq(stockMovements.centerId, auth.user.centerId!),
      eq(stockMovements.referenceType, 'sale_return'),
      eq(stockMovements.referenceId, saleId),
    ));
    const alreadyReturned = new Map<string, number>();
    for (const row of returnedRows) alreadyReturned.set(row.productId, (alreadyReturned.get(row.productId) ?? 0) + Number(row.quantity));

    const requested = new Map<string, number>();
    for (const item of parsed.data.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);

    let returnTotal = 0;
    let returnedLines = 0;
    for (const [productId, quantity] of requested) {
      const line = saleLines.find(item => item.productId === productId);
      if (!line) return { error: 'PRODUCT_NOT_IN_SALE' as const, productId };
      const remaining = Number(line.quantity) - (alreadyReturned.get(productId) ?? 0);
      if (quantity > remaining + 0.000001) return { error: 'RETURN_QTY_EXCEEDED' as const, productId, remaining, requested: quantity };

      const taxPerUnit = Number(line.quantity) > 0 ? Number(line.tax) / Number(line.quantity) : 0;
      const refundPerUnit = Number(line.unitPrice) + taxPerUnit;
      returnTotal += quantity * refundPerUnit;
      returnedLines++;
    }

    const productIds = [...requested.keys()];
    const productRows = await tx.select({ id: products.id, purchaseCost: products.purchaseCost })
      .from(products).where(and(eq(products.centerId, auth.user.centerId!), inArray(products.id, productIds)));
    const productMap = new Map(productRows.map(product => [product.id, product]));

    for (const [productId, quantity] of requested) {
      const product = productMap.get(productId);
      if (!product) return { error: 'PRODUCT_NOT_FOUND' as const };
      await tx.insert(stockMovements).values({
        centerId: auth.user.centerId!, productId, movementType: 'return_in', quantity: quantity.toString(),
        unitCost: product.purchaseCost, referenceType: 'sale_return', referenceId: saleId,
        occurredAt: new Date(), createdBy: auth.user.userId,
        notes: 'مرتجع جزئي/كلي للفاتورة ' + saleRows[0].saleNumber,
      });
    }

    const allReturned = saleLines.every(line =>
      (alreadyReturned.get(line.productId) ?? 0) + (requested.get(line.productId) ?? 0) >= Number(line.quantity) - 0.000001
    );
    await tx.update(sales).set({
      status: allReturned ? 'returned' : 'partially_returned',
      paymentStatus: allReturned ? 'refunded' : 'partial',
      updatedAt: new Date(),
    }).where(and(eq(sales.id, saleId), eq(sales.centerId, auth.user.centerId!)));

    return { saleNumber: saleRows[0].saleNumber, returnTotal, returnedLines, status: allReturned ? 'returned' : 'partially_returned' };
  }));

  if ('error' in result) {
    const errorCode = String(result.error ?? 'UNKNOWN');
    const messages: Record<string, string> = {
      SALE_NOT_FOUND: 'عملية البيع غير موجودة',
      SALE_NOT_RETURNABLE: 'لا يمكن إرجاع هذه العملية بحالتها الحالية',
      SALE_ITEMS_NOT_FOUND: 'لا توجد بنود مرتبطة بالبيع',
      PRODUCT_NOT_IN_SALE: 'المنتج المحدد غير موجود ضمن البيع',
      RETURN_QTY_EXCEEDED: 'كمية المرتجع أكبر من الكمية المتبقية القابلة للإرجاع',
      PRODUCT_NOT_FOUND: 'أحد المنتجات غير موجود في المركز',
    };
    const message = messages[errorCode] ?? 'تعذر تنفيذ المرتجع';
    if (errorCode === 'RETURN_QTY_EXCEEDED') return c.json({ error: { code: errorCode, message, details: { productId: result.productId, remaining: result.remaining, requested: result.requested } } }, 409);
    if (errorCode === 'PRODUCT_NOT_IN_SALE') return c.json({ error: { code: errorCode, message } }, 409);
    return c.json({ error: { code: errorCode, message } }, errorCode === 'SALE_NOT_FOUND' ? 404 : 409);
  }

  return c.json({ ok: true, saleNumber: result.saleNumber, returnTotal: result.returnTotal.toFixed(2), returnedLines: result.returnedLines, status: result.status });
});

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(9999),
});

const quantitySchema = z.object({ quantity: z.number().positive().max(9999) });

const checkoutSchema = z.object({
  paymentMethod: z.enum(['cash_on_delivery', 'bank_transfer', 'mada', 'apple_pay', 'card']),
});

function orderNumber() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `WEB-${stamp}-${suffix}`;
}

storeRoutes.get('/cart', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;

  const cart = await getOrCreateCart(c, auth.customerId, auth.user.centerId!);
  if (!cart) return c.json({ error: { code: 'CART_CREATE_FAILED', message: 'تعذر إنشاء سلة التسوق' } }, 500);

  const items = await withDatabase(c.env, db => db.select({
    id: storeCartItems.id,
    productId: storeCartItems.productId,
    quantity: storeCartItems.quantity,
    unitPrice: storeCartItems.unitPrice,
    name: products.name,
    sku: products.sku,
    taxCode: products.taxCode,
  }).from(storeCartItems)
    .innerJoin(products, eq(products.id, storeCartItems.productId))
    .where(eq(storeCartItems.cartId, cart.id))
    .orderBy(asc(storeCartItems.createdAt)));

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  return c.json({ cart: { id: cart.id, status: cart.status, items, subtotal: subtotal.toFixed(2), tax: null, total: null } });
});

storeRoutes.post('/cart/items', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;

  const parsed = itemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'المنتج أو الكمية غير صحيحة' } }, 400);

  const cart = await getOrCreateCart(c, auth.customerId, auth.user.centerId!);
  if (!cart) return c.json({ error: { code: 'CART_CREATE_FAILED', message: 'تعذر إنشاء سلة التسوق' } }, 500);

  const product = await withDatabase(c.env, db => db.select({
    id: products.id,
    name: products.name,
    sku: products.sku,
    sellingPrice: products.sellingPrice,
    active: products.active,
    centerId: products.centerId,
  }).from(products).where(and(
    eq(products.id, parsed.data.productId),
    eq(products.centerId, auth.user.centerId!),
    eq(products.active, true),
  )).limit(1));

  if (!product[0]) return c.json({ error: { code: 'PRODUCT_NOT_AVAILABLE', message: 'المنتج غير متاح حاليًا' } }, 404);

  await withDatabase(c.env, async db => db.transaction(async tx => {
    const existing = await tx.select({ id: storeCartItems.id, quantity: storeCartItems.quantity })
      .from(storeCartItems)
      .where(and(eq(storeCartItems.cartId, cart.id), eq(storeCartItems.productId, product[0].id)))
      .limit(1);

    if (existing[0]) {
      await tx.update(storeCartItems).set({
        quantity: (Number(existing[0].quantity) + parsed.data.quantity).toString(),
        unitPrice: product[0].sellingPrice,
        updatedAt: new Date(),
      }).where(eq(storeCartItems.id, existing[0].id));
    } else {
      await tx.insert(storeCartItems).values({
        cartId: cart.id,
        productId: product[0].id,
        quantity: parsed.data.quantity.toString(),
        unitPrice: product[0].sellingPrice,
      });
    }
  }));

  return c.json({ ok: true });
});

storeRoutes.patch('/cart/items/:id', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;
  const parsed = quantitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'الكمية غير صحيحة' } }, 400);

  const cart = await withDatabase(c.env, db => db.select({ id: storeCarts.id })
    .from(storeCarts).where(and(eq(storeCarts.customerId, auth.customerId), eq(storeCarts.centerId, auth.user.centerId!), eq(storeCarts.status, 'active'))).limit(1));
  if (!cart[0]) return c.json({ error: { code: 'CART_NOT_FOUND', message: 'السلة غير موجودة' } }, 404);

  const item = await withDatabase(c.env, db => db.select({ id: storeCartItems.id })
    .from(storeCartItems).where(and(eq(storeCartItems.id, c.req.param('id')), eq(storeCartItems.cartId, cart[0].id))).limit(1));
  if (!item[0]) return c.json({ error: { code: 'CART_ITEM_NOT_FOUND', message: 'عنصر السلة غير موجود' } }, 404);

  await withDatabase(c.env, db => db.update(storeCartItems)
    .set({ quantity: parsed.data.quantity.toString(), updatedAt: new Date() })
    .where(eq(storeCartItems.id, item[0].id)));

  return c.json({ ok: true });
});

storeRoutes.delete('/cart/items/:id', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;

  const cart = await withDatabase(c.env, db => db.select({ id: storeCarts.id })
    .from(storeCarts).where(and(eq(storeCarts.customerId, auth.customerId), eq(storeCarts.status, 'active'))).limit(1));
  if (!cart[0]) return c.json({ error: { code: 'CART_NOT_FOUND', message: 'السلة غير موجودة' } }, 404);

  const item = await withDatabase(c.env, db => db.select({ id: storeCartItems.id })
    .from(storeCartItems).where(and(eq(storeCartItems.id, c.req.param('id')), eq(storeCartItems.cartId, cart[0].id))).limit(1));
  if (!item[0]) return c.json({ error: { code: 'CART_ITEM_NOT_FOUND', message: 'عنصر السلة غير موجود' } }, 404);

  await withDatabase(c.env, db => db.delete(storeCartItems).where(eq(storeCartItems.id, item[0].id)));
  return c.json({ ok: true });
});

storeRoutes.get('/orders', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;

  const orders = await withDatabase(c.env, db => db.select().from(storeOrders)
    .where(and(eq(storeOrders.customerId, auth.customerId), eq(storeOrders.centerId, auth.user.centerId!)))
    .orderBy(desc(storeOrders.createdAt)));

  const orderIds = orders.map(order => order.id);
  const items = orderIds.length
    ? await withDatabase(c.env, db => db.select()
      .from(storeOrderItems)
      .where(inArray(storeOrderItems.orderId, orderIds))
      .orderBy(asc(storeOrderItems.id)))
    : [];

  return c.json({
    orders: orders.map(order => ({
      ...order,
      items: items.filter(item => item.orderId === order.id),
    })),
  });
});

storeRoutes.post('/checkout', async c => {
  const auth = await customerContext(c);
  if ('error' in auth) return auth.error;

  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { code: 'INVALID_PAYMENT_METHOD', message: 'طريقة الدفع غير صحيحة' } }, 400);
  }

  const paymentMethod = parsed.data.paymentMethod;
  if (['mada', 'apple_pay', 'card'].includes(paymentMethod)) {
    return c.json({
      error: {
        code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
        message: 'الدفع الإلكتروني لهذه الطريقة لم يتم ربطه بعد. لا يتم إنشاء عملية دفع وهمية.',
      },
    }, 409);
  }

  const cart = await getOrCreateCart(c, auth.customerId, auth.user.centerId!);
  if (!cart) return c.json({ error: { code: 'CART_NOT_FOUND', message: 'السلة غير موجودة' } }, 404);

  const result = await withDatabase(c.env, async db => db.transaction(async tx => {
    const lockedProducts = await tx.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      sellingPrice: products.sellingPrice,
      active: products.active,
      centerId: products.centerId,
      taxCode: products.taxCode,
    })
      .from(products)
      .innerJoin(storeCartItems, eq(storeCartItems.productId, products.id))
      .where(and(eq(storeCartItems.cartId, cart.id), eq(products.centerId, auth.user.centerId!), eq(products.active, true)));

    if (!lockedProducts.length) return { cartEmpty: true };

    const taxConfigured = lockedProducts.every(product => !product.taxCode);
    if (!taxConfigured) {
      return { taxConfigurationRequired: true };
    }

    const productIds = [...new Set(lockedProducts.map(product => product.id))].sort();
    for (const productId of productIds) {
      await tx.execute(sql`select id from products where id = ${productId} for update`);
    }

    const cartItems = await tx.select({
      id: storeCartItems.id,
      productId: storeCartItems.productId,
      quantity: storeCartItems.quantity,
      unitPrice: storeCartItems.unitPrice,
    }).from(storeCartItems).where(eq(storeCartItems.cartId, cart.id));

    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const pendingRows = await tx.select({
      orderId: storeOrderItems.orderId,
      productId: storeOrderItems.productId,
      quantity: storeOrderItems.quantity,
      createdAt: storeOrders.createdAt,
    })
      .from(storeOrderItems)
      .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.orderId))
      .where(and(
        eq(storeOrders.centerId, auth.user.centerId!),
        eq(storeOrders.status, 'pending'),
      ));

    const reservedByProduct = new Map<string, number>();
    for (const row of pendingRows) {
      if (row.createdAt >= cutoff) {
        reservedByProduct.set(row.productId, (reservedByProduct.get(row.productId) ?? 0) + Number(row.quantity));
      }
    }

    const movements = lockedProducts.length
      ? await tx.select({
        productId: stockMovements.productId,
        quantity: stockMovements.quantity,
      }).from(stockMovements).where(and(
        eq(stockMovements.centerId, auth.user.centerId!),
        inArray(stockMovements.productId, lockedProducts.map(p => p.id)),
      ))
      : [];

    const onHand = new Map<string, number>();
    for (const movement of movements) {
      onHand.set(movement.productId, (onHand.get(movement.productId) ?? 0) + Number(movement.quantity));
    }

    const shortages: Array<{ productId: string; name: string; requested: number; available: number }> = [];
    for (const item of cartItems) {
      const available = (onHand.get(item.productId) ?? 0) - (reservedByProduct.get(item.productId) ?? 0);
      if (Number(item.quantity) > available) {
        const product = lockedProducts.find(p => p.id === item.productId);
        shortages.push({
          productId: item.productId,
          name: product?.name ?? 'منتج',
          requested: Number(item.quantity),
          available: Math.max(0, available),
        });
      }
    }

    if (shortages.length) {
      return { shortages };
    }

    const subtotal = cartItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const order = await tx.insert(storeOrders).values({
      centerId: auth.user.centerId!,
      customerId: auth.customerId,
      orderNumber: orderNumber(),
      status: 'pending',
      subtotal: subtotal.toFixed(2),
      discount: '0',
      tax: '0',
      total: subtotal.toFixed(2),
      paymentMethod,
      paymentStatus: 'unpaid',
    }).returning();

    if (!order[0]) return { orderCreateFailed: true };

    await tx.insert(storeOrderItems).values(cartItems.map(item => {
      const product = lockedProducts.find(p => p.id === item.productId)!;
      const lineTotal = (Number(item.quantity) * Number(item.unitPrice)).toFixed(2);
      return {
        orderId: order[0].id,
        productId: item.productId,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: '0',
        tax: '0',
        lineTotal,
      };
    }));

    await tx.update(storeCarts).set({
      status: 'converted',
      updatedAt: new Date(),
    }).where(eq(storeCarts.id, cart.id));

    return { order: order[0] };
  }));

  if ('cartEmpty' in result && result.cartEmpty) {
    return c.json({ error: { code: 'CART_EMPTY', message: 'السلة فارغة' } }, 400);
  }

  if ('orderCreateFailed' in result && result.orderCreateFailed) {
    return c.json({ error: { code: 'ORDER_CREATE_FAILED', message: 'تعذر إنشاء الطلب' } }, 500);
  }

  if ('taxConfigurationRequired' in result && result.taxConfigurationRequired) {
    return c.json({
      error: {
        code: 'TAX_CONFIGURATION_REQUIRED',
        message: 'يوجد منتج في السلة له رمز ضريبة، لكن محرك الضريبة لم يتم ربطه بعد. لم يتم إنشاء الطلب حتى لا يتم احتساب ضريبة غير صحيحة.',
      },
    }, 409);
  }

  if ('shortages' in result && Array.isArray(result.shortages) && result.shortages.length) {
    return c.json({
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'بعض المنتجات لا تتوفر بالكمية المطلوبة حاليًا',
        details: result.shortages,
      },
    }, 409);
  }

  return c.json({
    order: {
      ...result.order,
      message: paymentMethod === 'bank_transfer'
        ? 'تم إنشاء الطلب. حالة الدفع غير مدفوعة، وسيتم تأكيد الطلب بعد التحقق من التحويل البنكي.'
        : 'تم إنشاء الطلب. الدفع عند الاستلام، وسيتم تأكيد الطلب من المركز.',
    },
  }, 201);
});
