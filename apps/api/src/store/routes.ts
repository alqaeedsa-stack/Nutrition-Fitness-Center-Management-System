import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthenticatedUser } from '../auth/session';
import { withDatabase } from '../db/client';
import { customerAccounts } from '../db/customer-accounts';
import { products, stockMovements } from '../db/schema';
import { storeCartItems, storeCarts, storeOrderItems, storeOrders } from '../db/store';

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
      .where(and(eq(storeCarts.customerId, customerId), eq(storeCarts.status, 'active')))
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
    .from(storeCarts).where(and(eq(storeCarts.customerId, auth.customerId), eq(storeCarts.status, 'active'))).limit(1));
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
    .where(eq(storeOrders.customerId, auth.customerId))
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

  if ('shortages' in result && result.shortages.length) {
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
