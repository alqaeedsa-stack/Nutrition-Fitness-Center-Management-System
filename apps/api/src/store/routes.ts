import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthenticatedUser } from '../auth/session';
import { withDatabase } from '../db/client';
import { customerAccounts } from '../db/customer-accounts';
import { products } from '../db/schema';
import { storeCartItems, storeCarts } from '../db/store';

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

    const rows = await db.insert(storeCarts).values({ customerId, centerId, status: 'active' }).returning();
    return rows[0];
  });
}

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(9999),
});

const quantitySchema = z.object({ quantity: z.number().positive().max(9999) });

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
  }).from(products).where(and(eq(products.id, parsed.data.productId), eq(products.centerId, auth.user.centerId!), eq(products.active, true))).limit(1));

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
