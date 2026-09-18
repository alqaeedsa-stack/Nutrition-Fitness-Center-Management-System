import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, brands, categories, products, saleItems, sales, stockMovements, staffProfiles, users } from '../db/schema';
import { storeOrders } from '../db/store';
import { getCompany } from '../db/company';
import { getAuthenticatedUser } from '../auth/session';
import { hashPassword } from '../auth/password';

export type StaffBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const staffRoutes = new Hono<{ Bindings: StaffBindings }>();

const staffTypeSchema = z.enum([
  'admin',
  'doctor',
  'nutritionist',
  'trainer',
  'employee',
  'cashier',
  'warehouse',
]);

const createStaffSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  staffType: staffTypeSchema,
  email: z.string().trim().email().max(320),
  phone: z.union([z.string().trim().regex(/^\+[1-9]\d{6,14}$/), z.literal('')]).optional(),
  password: z.string().min(10).max(256),
});

async function requireAdmin(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) {
    return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };
  }

  const profile = await withDatabase(c.env, async db => {
    const rows = await db.select({
      id: staffProfiles.id,
      staffType: staffProfiles.staffType,
      active: staffProfiles.active,
    })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, user.userId))
      .limit(1);

    return rows[0] ?? null;
  });

  if (!profile?.active || profile.staffType !== 'admin') {
    return { error: c.json({ error: { code: 'ADMIN_ACCESS_REQUIRED', message: 'إدارة الموظفين متاحة لحسابات الإدارة فقط' } }, 403) };
  }

  return { user, profile };
}

staffRoutes.get('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const rows = await withDatabase(c.env, db => db.select({
    id: staffProfiles.id,
    userId: users.id,
    displayName: staffProfiles.displayName,
    staffType: staffProfiles.staffType,
    active: staffProfiles.active,
    email: users.email,
    phone: users.phone,
    createdAt: staffProfiles.createdAt,
  })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .orderBy(staffProfiles.createdAt));

  return c.json({ staff: rows });
});

staffRoutes.post('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = createStaffSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الموظف غير صحيحة' } }, 400);
  }

  const data = body.data;
  const email = data.email.toLowerCase();
  const phone = data.phone || null;
  const passwordHash = await hashPassword(data.password);

  const created = await withDatabase(c.env, async db => db.transaction(async tx => {
    const company = await getCompany(tx);
    if (!company) return { error: 'COMPANY_NOT_CONFIGURED' as const };

    const existing = await tx.select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(or(eq(users.email, email), ...(phone ? [eq(users.phone, phone)] : [])))
      .limit(1);

    if (existing[0]) {
      if (existing[0].email?.toLowerCase() === email) return { error: 'EMAIL_EXISTS' as const };
      return { error: 'PHONE_EXISTS' as const };
    }

    const userRows = await tx.insert(users).values({
      centerId: company.id,
      email,
      phone,
      passwordHash,
      status: 'active',
      createdBy: auth.user.userId,
      updatedBy: auth.user.userId,
    }).returning({
      id: users.id,
      centerId: users.centerId,
      email: users.email,
      phone: users.phone,
      status: users.status,
    });

    const user = userRows[0];
    if (!user) throw new Error('Staff user insert returned no row');

    const profileRows = await tx.insert(staffProfiles).values({
      userId: user.id,
      staffType: data.staffType,
      displayName: data.displayName,
      active: true,
    }).returning({ id: staffProfiles.id });

    const profile = profileRows[0];
    if (!profile) throw new Error('Staff profile insert returned no row');

    await tx.insert(auditLogs).values({
      centerId: company.id,
      actorUserId: auth.user.userId,
      action: 'staff.create',
      resourceType: 'staff_profile',
      resourceId: profile.id,
      result: 'success',
      metadata: { staffType: data.staffType },
      ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return {
      staff: {
        id: profile.id,
        userId: user.id,
        displayName: data.displayName,
        staffType: data.staffType,
        active: true,
        email: user.email,
        phone: user.phone,
      },
    };
  }));

  if ('error' in created) {
    if (created.error === 'COMPANY_NOT_CONFIGURED') {
      return c.json({ error: { code: 'COMPANY_NOT_CONFIGURED', message: 'لم يتم إعداد بيانات الشركة في النظام بعد' } }, 503);
    }
    if (created.error === 'EMAIL_EXISTS') {
      return c.json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'البريد الإلكتروني مستخدم بالفعل' } }, 409);
    }
    return c.json({ error: { code: 'PHONE_ALREADY_EXISTS', message: 'رقم الجوال مستخدم بالفعل' } }, 409);
  }

  return c.json({ staff: created.staff }, 201);
});


const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  productType: z.string().trim().min(1).max(50).default('product'),
  purchaseCost: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  taxCode: z.string().trim().max(50).nullable().optional(),
  reorderPoint: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
});

const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().refine(v => v !== 0, 'الكمية لا يمكن أن تكون صفرًا'),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

async function requireStaff(c: any) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };
  const profile = await withDatabase(c.env, db => db.select({
    id: staffProfiles.id, staffType: staffProfiles.staffType, active: staffProfiles.active,
  }).from(staffProfiles).where(eq(staffProfiles.userId, user.userId)).limit(1));
  if (!profile[0]?.active) return { error: c.json({ error: { code: 'STAFF_ACCESS_REQUIRED', message: 'هذه الوحدة للموظفين فقط' } }, 403) };
  return { user, profile: profile[0] };
}

staffRoutes.get('/catalog-options', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const [categoryRows, brandRows] = await Promise.all([
    withDatabase(c.env, db => db.select({ id: categories.id, name: categories.name }).from(categories)
      .where(and(eq(categories.centerId, auth.user.centerId!), eq(categories.active, true))).orderBy(asc(categories.name))),
    withDatabase(c.env, db => db.select({ id: brands.id, name: brands.name }).from(brands)
      .where(and(eq(brands.centerId, auth.user.centerId!), eq(brands.active, true))).orderBy(asc(brands.name))),
  ]);
  return c.json({ categories: categoryRows, brands: brandRows });
});

staffRoutes.get('/products', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name, categoryId: products.categoryId,
    brandId: products.brandId, productType: products.productType, purchaseCost: products.purchaseCost,
    sellingPrice: products.sellingPrice, taxCode: products.taxCode, reorderPoint: products.reorderPoint,
    active: products.active, categoryName: categories.name, brandName: brands.name,
  }).from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.centerId, auth.user.centerId!)).orderBy(asc(products.name)));
  return c.json({ products: rows });
});

staffRoutes.post('/products', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = productSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات المنتج غير صحيحة' } }, 400);
  const data = body.data;
  const created = await withDatabase(c.env, db => db.transaction(async tx => {
    const category = await tx.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.centerId, auth.user.centerId!), eq(categories.active, true))).limit(1);
    if (!category[0]) return { error: 'CATEGORY_NOT_FOUND' as const };
    if (data.brandId) {
      const brand = await tx.select({ id: brands.id }).from(brands)
        .where(and(eq(brands.id, data.brandId), eq(brands.centerId, auth.user.centerId!), eq(brands.active, true))).limit(1);
      if (!brand[0]) return { error: 'BRAND_NOT_FOUND' as const };
    }
    const existing = await tx.select({ id: products.id }).from(products)
      .where(and(eq(products.centerId, auth.user.centerId!), eq(products.sku, data.sku))).limit(1);
    if (existing[0]) return { error: 'SKU_EXISTS' as const };
    const row = await tx.insert(products).values({
      centerId: auth.user.centerId!, sku: data.sku, name: data.name, categoryId: data.categoryId,
      brandId: data.brandId ?? null, productType: data.productType, purchaseCost: data.purchaseCost.toFixed(2),
      sellingPrice: data.sellingPrice.toFixed(2), taxCode: data.taxCode ?? null,
      reorderPoint: data.reorderPoint.toFixed(3), active: data.active,
    }).returning();
    return { product: row[0] };
  }));
  if ('error' in created) return c.json({ error: { code: created.error, message: created.error === 'SKU_EXISTS' ? 'SKU مستخدم بالفعل' : 'البيانات المرتبطة بالمنتج غير صحيحة' } }, 409);
  return c.json({ product: created.product }, 201);
});

staffRoutes.patch('/products/:id', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = productSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات المنتج غير صحيحة' } }, 400);
  const data = body.data;
  const row = await withDatabase(c.env, db => db.update(products).set({
    ...(data.sku !== undefined ? { sku: data.sku } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
    ...(data.brandId !== undefined ? { brandId: data.brandId } : {}),
    ...(data.productType !== undefined ? { productType: data.productType } : {}),
    ...(data.purchaseCost !== undefined ? { purchaseCost: data.purchaseCost.toFixed(2) } : {}),
    ...(data.sellingPrice !== undefined ? { sellingPrice: data.sellingPrice.toFixed(2) } : {}),
    ...(data.taxCode !== undefined ? { taxCode: data.taxCode } : {}),
    ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint.toFixed(3) } : {}),
    ...(data.active !== undefined ? { active: data.active } : {}),
    updatedAt: new Date(),
  }).where(and(eq(products.id, c.req.param('id')), eq(products.centerId, auth.user.centerId!))).returning());
  if (!row[0]) return c.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' } }, 404);
  return c.json({ product: row[0] });
});

staffRoutes.get('/inventory', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    productId: products.id, sku: products.sku, name: products.name, purchaseCost: products.purchaseCost,
    sellingPrice: products.sellingPrice, reorderPoint: products.reorderPoint,
    quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
  }).from(products).leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(eq(products.centerId, auth.user.centerId!)).groupBy(products.id).orderBy(asc(products.name)));
  return c.json({ inventory: rows });
});

staffRoutes.post('/inventory/adjust', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const body = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الحركة غير صحيحة' } }, 400);
  const data = body.data;
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const product = await tx.select({ id: products.id, purchaseCost: products.purchaseCost }).from(products)
      .where(and(eq(products.id, data.productId), eq(products.centerId, auth.user.centerId!), eq(products.active, true))).limit(1);
    if (!product[0]) return { error: 'PRODUCT_NOT_FOUND' as const };
    const type = data.quantity > 0 ? 'adjustment_in' : 'adjustment_out';
    const row = await tx.insert(stockMovements).values({
      centerId: auth.user.centerId!, productId: data.productId, movementType: type,
      quantity: data.quantity.toFixed(3), unitCost: (data.unitCost ?? Number(product[0].purchaseCost)).toFixed(2),
      referenceType: 'manual_adjustment', occurredAt: new Date(), createdBy: auth.user.userId,
      notes: data.notes ?? null,
    }).returning();
    return { movement: row[0] };
  }));
  if ('error' in result) return c.json({ error: { code: result.error, message: 'المنتج غير موجود' } }, 404);
  return c.json({ movement: result.movement }, 201);
});

staffRoutes.get('/orders', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const orders = await withDatabase(c.env, db => db.select().from(storeOrders)
    .where(eq(storeOrders.centerId, auth.user.centerId!)).orderBy(desc(storeOrders.createdAt)));
  return c.json({ orders });
});

staffRoutes.patch('/orders/:id/status', async c => {
  const auth = await requireStaff(c); if ('error' in auth) return auth.error;
  const schema = z.object({ status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']) });
  const body = schema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_STATUS', message: 'حالة الطلب غير صحيحة' } }, 400);
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const order = await tx.select().from(storeOrders)
      .where(and(eq(storeOrders.id, c.req.param('id')), eq(storeOrders.centerId, auth.user.centerId!))).limit(1);
    if (!order[0]) return { error: 'NOT_FOUND' as const };
    if (order[0].status === body.data.status) return { order: order[0] };

    if (body.data.status === 'completed') {
      const items = await tx.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, order[0].id));
      if (!items.length) return { error: 'EMPTY_ORDER' as const };

      const productIds = items.map(item => item.productId);
      const productRows = await tx.select({
        id: products.id, purchaseCost: products.purchaseCost, active: products.active,
      }).from(products).where(and(
        eq(products.centerId, auth.user.centerId!),
        inArray(products.id, productIds),
        eq(products.active, true),
      ));

      const available = new Map<string, number>();
      const movements = await tx.select({
        productId: stockMovements.productId, quantity: stockMovements.quantity,
      }).from(stockMovements).where(and(
        eq(stockMovements.centerId, auth.user.centerId!),
        inArray(stockMovements.productId, productIds),
      ));
      for (const movement of movements) {
        available.set(movement.productId, (available.get(movement.productId) ?? 0) + Number(movement.quantity));
      }

      for (const item of items) {
        if ((available.get(item.productId) ?? 0) < Number(item.quantity)) {
          return { error: 'INSUFFICIENT_STOCK' as const, productId: item.productId };
        }
      }

      const saleRows = await tx.insert(sales).values({
        centerId: auth.user.centerId!,
        customerId: order[0].customerId,
        soldBy: auth.user.userId,
        saleNumber: order[0].orderNumber,
        status: 'completed',
        subtotal: order[0].subtotal,
        discount: order[0].discount,
        tax: order[0].tax,
        total: order[0].total,
        paymentMethod: order[0].paymentMethod ?? 'cash_on_delivery',
      }).returning();
      const sale = saleRows[0];
      if (!sale) return { error: 'SALE_CREATE_FAILED' as const };

      await tx.insert(saleItems).values(items.map(item => ({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        lineTotal: item.lineTotal,
      })));

      const costByProduct = new Map(productRows.map(product => [product.id, Number(product.purchaseCost)]));
      await tx.insert(stockMovements).values(items.map(item => ({
        centerId: auth.user.centerId!,
        productId: item.productId,
        movementType: 'sale',
        quantity: (-Number(item.quantity)).toFixed(3),
        unitCost: (costByProduct.get(item.productId) ?? 0).toFixed(2),
        referenceType: 'store_order',
        referenceId: order[0].id,
        occurredAt: new Date(),
        createdBy: auth.user.userId,
        notes: `صرف من طلب المتجر ${order[0].orderNumber}`,
      })));
    }

    const updated = await tx.update(storeOrders).set({
      status: body.data.status,
      updatedAt: new Date(),
      ...(body.data.status === 'completed' && order[0].paymentMethod === 'cash_on_delivery'
        ? { paymentStatus: 'paid' }
        : {}),
    }).where(eq(storeOrders.id, order[0].id)).returning();
    return { order: updated[0] };
  }));
  if ('error' in result) {
    if (result.error === 'INSUFFICIENT_STOCK') return c.json({ error: { code: 'INSUFFICIENT_STOCK', message: 'لا يمكن إكمال الطلب لأن المخزون الحالي غير كافٍ' } }, 409);
    if (result.error === 'EMPTY_ORDER') return c.json({ error: { code: 'EMPTY_ORDER', message: 'الطلب لا يحتوي على منتجات' } }, 400);
    if (result.error === 'SALE_CREATE_FAILED') return c.json({ error: { code: 'SALE_CREATE_FAILED', message: 'تعذر إنشاء المبيعات المرتبطة بالطلب' } }, 500);
    return c.json({ error: { code: 'ORDER_NOT_FOUND', message: 'الطلب غير موجود' } }, 404);
  }
  return c.json({ order: result.order });
});
