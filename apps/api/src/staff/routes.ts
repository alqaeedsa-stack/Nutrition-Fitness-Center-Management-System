import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, brands, categories, centers, customers, productBarcodes, productSerials, products, saleItems, sales, stockMovements, staffProfiles, users, permissions, userPermissions } from '../db/schema';
import { storeOrderItems, storeOrders } from '../db/store';
import { requirePermission, PERMISSIONS, getUserPermissionCodes, type PermissionCode } from '../auth/permissions';
import { hashPassword } from '../auth/password';
import { calculateTax } from '../tax/engine';
import { postSaleWithProductAccounts, reverseSale } from '../accounting/service';
import { getOriginalSaleUnitCost, getProductCost } from '../inventory/costing';

export type StaffBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export const staffRoutes = new Hono<{ Bindings: StaffBindings }>();

const NON_STOCK_PRODUCT_TYPES = ['subscription', 'service'] as const;

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
  permissionCodes: z.array(z.string()).default([]),
});

staffRoutes.get('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requirePermission(c, 'staff.manage');
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
    .where(eq(users.centerId, auth.user.centerId!))
    .orderBy(staffProfiles.createdAt));

  return c.json({ staff: rows });
});

staffRoutes.post('/', async c => {
  if (!c.env.HYPERDRIVE && !c.env.DATABASE_URL) {
    return c.json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'قاعدة البيانات غير مهيأة بعد' } }, 503);
  }

  const auth = await requirePermission(c, 'staff.manage');
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
    const existing = await tx.select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(or(eq(users.email, email), ...(phone ? [eq(users.phone, phone)] : [])))
      .limit(1);

    if (existing[0]) {
      if (existing[0].email?.toLowerCase() === email) return { error: 'EMAIL_EXISTS' as const };
      return { error: 'PHONE_EXISTS' as const };
    }

    const userRows = await tx.insert(users).values({
      centerId: auth.user.centerId!,
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

    const requestedCodes = data.permissionCodes.filter(code => PERMISSIONS.some(permission => permission.code === code));
    if (requestedCodes.length) {
      const permissionRows = await tx.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, requestedCodes));
      if (permissionRows.length) {
        await tx.insert(userPermissions).values(permissionRows.map(permission => ({ userId: user.id, permissionId: permission.id })));
      }
    }

    await tx.insert(auditLogs).values({
      centerId: auth.user.centerId!,
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
        permissionCodes: requestedCodes,
      },
    };
  }));

  if ('error' in created) {
    if (created.error === 'EMAIL_EXISTS') {
      return c.json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'البريد الإلكتروني مستخدم بالفعل' } }, 409);
    }
    return c.json({ error: { code: 'PHONE_ALREADY_EXISTS', message: 'رقم الجوال مستخدم بالفعل' } }, 409);
  }

  return c.json({ staff: created.staff }, 201);
});


staffRoutes.get('/permissions', async c => {
  const auth = await requirePermission(c, 'staff.manage');
  if ('error' in auth) return auth.error;
  return c.json({ permissions: PERMISSIONS });
});

staffRoutes.get('/:id/permissions', async c => {
  const auth = await requirePermission(c, 'staff.manage');
  if ('error' in auth) return auth.error;
  const userRow = await withDatabase(c.env, db => db.select({ id: users.id }).from(users)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(and(eq(staffProfiles.id, c.req.param('id')), eq(users.centerId, auth.user.centerId!))).limit(1));
  if (!userRow[0]) return c.json({ error: { code: 'STAFF_NOT_FOUND', message: 'الموظف غير موجود' } }, 404);
  return c.json({ permissionCodes: await getUserPermissionCodes(c.env, userRow[0].id) });
});

staffRoutes.put('/:id/permissions', async c => {
  const auth = await requirePermission(c, 'staff.manage');
  if ('error' in auth) return auth.error;
  const body = z.object({ permissionCodes: z.array(z.string()).default([]) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'قائمة الصلاحيات غير صحيحة' } }, 400);
  const requestedCodes = [...new Set(body.data.permissionCodes.filter(code => PERMISSIONS.some(permission => permission.code === code)))];
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const staff = await tx.select({ userId: users.id, staffType: staffProfiles.staffType })
      .from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId))
      .where(and(eq(staffProfiles.id, c.req.param('id')), eq(users.centerId, auth.user.centerId!))).limit(1);
    if (!staff[0]) return { error: 'NOT_FOUND' as const };
    if (staff[0].userId === auth.user.userId && staff[0].staffType === 'admin') {
      return { error: 'SELF_ADMIN' as const };
    }
    const permissionRows = requestedCodes.length
      ? await tx.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, requestedCodes))
      : [];
    await tx.delete(userPermissions).where(eq(userPermissions.userId, staff[0].userId));
    if (permissionRows.length) {
      await tx.insert(userPermissions).values(permissionRows.map(permission => ({ userId: staff[0].userId, permissionId: permission.id })));
    }
    await tx.insert(auditLogs).values({
      centerId: auth.user.centerId,
      actorUserId: auth.user.userId,
      action: 'staff.permissions.update',
      resourceType: 'staff_profile',
      resourceId: c.req.param('id'),
      result: 'success',
      metadata: { permissionCodes: requestedCodes },
      ipAddress: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });
    return { permissionCodes: requestedCodes };
  }));
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return c.json({ error: { code: 'STAFF_NOT_FOUND', message: 'الموظف غير موجود' } }, 404);
    return c.json({ error: { code: 'SELF_ADMIN_LOCKOUT', message: 'لا يمكن إزالة صلاحيات حساب الإدارة الحالي من نفسه' } }, 409);
  }
  return c.json(result);
});

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  productType: z.enum(['product','service','subscription']).default('product'),
  purchaseCost: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().min(0).default(0),
  taxCode: z.string().trim().max(50).nullable().optional(),
  reorderPoint: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
  inventoryValuationMethod: z.enum(['inherit','perpetual','periodic']).default('inherit'),
  costMethod: z.enum(['inherit','standard','average','fifo']).default('inherit'),
  inventoryTracking: z.enum(['none','lot','serial']).default('none'),
  serialAutoGenerate: z.boolean().default(true),
  serialPrefix: z.string().trim().max(30).nullable().optional(),
  allowNegativeStock: z.boolean().default(false),
  expiryTracking: z.boolean().default(false),
  posAvailable: z.boolean().default(true),
  ecommerceAvailable: z.boolean().default(false),
  requiresCustomer: z.boolean().default(false),
  requiresSpecialist: z.boolean().default(false),
  purchaseAllowed: z.boolean().default(true),
  salesUom: z.string().trim().min(1).max(30).default('unit'),
  purchaseUom: z.string().trim().min(1).max(30).default('unit'),
  minimumSalesPrice: z.coerce.number().min(0).nullable().optional(),
  inventoryAccountId: z.string().uuid().nullable().optional(),
  costOfSalesAccountId: z.string().uuid().nullable().optional(),
  revenueAccountId: z.string().uuid().nullable().optional(),
  purchaseAccountId: z.string().uuid().nullable().optional(),
  salesReturnAccountId: z.string().uuid().nullable().optional(),
  purchaseReturnAccountId: z.string().uuid().nullable().optional(),
  deferredRevenueAccountId: z.string().uuid().nullable().optional(),
  subscriptionRevenueAccountId: z.string().uuid().nullable().optional(),
  subscriptionDeferredRevenueEnabled: z.boolean().default(false),
  subscriptionRecognitionMethod: z.enum(['monthly','daily']).default('monthly'),
  subscriptionDurationMonths: z.coerce.number().int().positive().max(120).nullable().optional(),
  subscriptionDailyProration: z.boolean().default(true),
});

const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(999999),
  movementType: z.enum(['opening', 'adjustment_in', 'adjustment_out']).default('adjustment_in'),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

function normalizeProductSettings(data: z.infer<typeof productSchema>) {
  const tracking = data.inventoryTracking;
  return {
    inventoryValuationMethod: data.inventoryValuationMethod === 'inherit' ? null : data.inventoryValuationMethod,
    costMethod: data.costMethod === 'inherit' ? null : data.costMethod,
    inventoryTracking: tracking,
    serialTracking: tracking === 'serial',
    serialAutoGenerate: data.serialAutoGenerate,
    serialPrefix: data.serialPrefix ?? null,
    allowNegativeStock: data.allowNegativeStock,
    expiryTracking: data.expiryTracking,
    posAvailable: data.posAvailable,
    ecommerceAvailable: data.ecommerceAvailable,
    requiresCustomer: data.requiresCustomer,
    requiresSpecialist: data.requiresSpecialist,
    purchaseAllowed: data.purchaseAllowed,
    salesUom: data.salesUom,
    purchaseUom: data.purchaseUom,
    minimumSalesPrice: data.minimumSalesPrice == null ? null : data.minimumSalesPrice.toFixed(2),
    inventoryAccountId: data.inventoryAccountId ?? null,
    costOfSalesAccountId: data.costOfSalesAccountId ?? null,
    revenueAccountId: data.revenueAccountId ?? null,
    purchaseAccountId: data.purchaseAccountId ?? null,
    salesReturnAccountId: data.salesReturnAccountId ?? null,
    purchaseReturnAccountId: data.purchaseReturnAccountId ?? null,
    deferredRevenueAccountId: data.deferredRevenueAccountId ?? null,
    subscriptionRevenueAccountId: data.subscriptionRevenueAccountId ?? null,
    subscriptionDeferredRevenueEnabled: data.subscriptionDeferredRevenueEnabled,
    subscriptionRecognitionMethod: data.subscriptionRecognitionMethod,
    subscriptionDurationMonths: data.subscriptionDurationMonths ?? null,
    subscriptionDailyProration: data.subscriptionDailyProration,
  };
}

staffRoutes.get('/catalog-options', async c => {
  const auth = await requirePermission(c, 'catalog.read'); if ('error' in auth) return auth.error;
  const [categoryRows, brandRows] = await Promise.all([
    withDatabase(c.env, db => db.select({ id: categories.id, name: categories.name }).from(categories)
      .where(and(eq(categories.centerId, auth.user.centerId!), eq(categories.active, true))).orderBy(asc(categories.name))),
    withDatabase(c.env, db => db.select({ id: brands.id, name: brands.name }).from(brands)
      .where(and(eq(brands.centerId, auth.user.centerId!), eq(brands.active, true))).orderBy(asc(brands.name))),
  ]);
  return c.json({ categories: categoryRows, brands: brandRows });
});

staffRoutes.get('/products', async c => {
  const auth = await requirePermission(c, 'catalog.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name, categoryId: products.categoryId,
    brandId: products.brandId, productType: products.productType, purchaseCost: products.purchaseCost,
    sellingPrice: products.sellingPrice, taxCode: products.taxCode, reorderPoint: products.reorderPoint,
    active: products.active, categoryName: categories.name, brandName: brands.name,
    inventoryValuationMethod: products.inventoryValuationMethod, costMethod: products.costMethod,
    inventoryTracking: products.inventoryTracking, serialAutoGenerate: products.serialAutoGenerate,
    serialPrefix: products.serialPrefix, allowNegativeStock: products.allowNegativeStock,
    expiryTracking: products.expiryTracking, posAvailable: products.posAvailable,
    ecommerceAvailable: products.ecommerceAvailable, requiresCustomer: products.requiresCustomer,
    requiresSpecialist: products.requiresSpecialist, purchaseAllowed: products.purchaseAllowed,
    salesUom: products.salesUom, purchaseUom: products.purchaseUom, minimumSalesPrice: products.minimumSalesPrice,
    inventoryAccountId: products.inventoryAccountId, costOfSalesAccountId: products.costOfSalesAccountId,
    revenueAccountId: products.revenueAccountId, purchaseAccountId: products.purchaseAccountId,
    salesReturnAccountId: products.salesReturnAccountId, purchaseReturnAccountId: products.purchaseReturnAccountId,
    deferredRevenueAccountId: products.deferredRevenueAccountId, subscriptionRevenueAccountId: products.subscriptionRevenueAccountId,
    subscriptionDeferredRevenueEnabled: products.subscriptionDeferredRevenueEnabled, subscriptionRecognitionMethod: products.subscriptionRecognitionMethod,
    subscriptionDurationMonths: products.subscriptionDurationMonths, subscriptionDailyProration: products.subscriptionDailyProration,
  }).from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.centerId, auth.user.centerId!)).orderBy(asc(products.name)));
  return c.json({ products: rows });
});

staffRoutes.get('/products/:id', async c => {
  const auth = await requirePermission(c, 'catalog.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name, categoryId: products.categoryId, brandId: products.brandId,
    productType: products.productType, purchaseCost: products.purchaseCost, sellingPrice: products.sellingPrice,
    taxCode: products.taxCode, reorderPoint: products.reorderPoint, active: products.active,
    inventoryValuationMethod: products.inventoryValuationMethod, costMethod: products.costMethod,
    inventoryTracking: products.inventoryTracking, serialAutoGenerate: products.serialAutoGenerate,
    serialPrefix: products.serialPrefix, allowNegativeStock: products.allowNegativeStock, expiryTracking: products.expiryTracking,
    posAvailable: products.posAvailable, ecommerceAvailable: products.ecommerceAvailable, requiresCustomer: products.requiresCustomer,
    requiresSpecialist: products.requiresSpecialist, purchaseAllowed: products.purchaseAllowed, salesUom: products.salesUom,
    purchaseUom: products.purchaseUom, minimumSalesPrice: products.minimumSalesPrice,
    inventoryAccountId: products.inventoryAccountId, costOfSalesAccountId: products.costOfSalesAccountId,
    revenueAccountId: products.revenueAccountId, purchaseAccountId: products.purchaseAccountId,
    salesReturnAccountId: products.salesReturnAccountId, purchaseReturnAccountId: products.purchaseReturnAccountId,
    deferredRevenueAccountId: products.deferredRevenueAccountId, subscriptionRevenueAccountId: products.subscriptionRevenueAccountId,
    subscriptionDeferredRevenueEnabled: products.subscriptionDeferredRevenueEnabled, subscriptionRecognitionMethod: products.subscriptionRecognitionMethod,
    subscriptionDurationMonths: products.subscriptionDurationMonths, subscriptionDailyProration: products.subscriptionDailyProration,
  }).from(products).where(and(eq(products.id, c.req.param('id')), eq(products.centerId, auth.user.centerId!))).limit(1));
  if (!rows[0]) return c.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' } }, 404);
  const center = await withDatabase(c.env, db => db.select({ inventoryValuationMethod: centers.inventoryValuationMethod }).from(centers).where(eq(centers.id, auth.user.centerId!)).limit(1));
  return c.json({ product: rows[0], centerDefaultInventoryValuationMethod: center[0]?.inventoryValuationMethod ?? 'perpetual' });
});

staffRoutes.post('/products', async c => {
  const auth = await requirePermission(c, 'catalog.write'); if ('error' in auth) return auth.error;
  const body = productSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات المنتج غير صحيحة' } }, 400);
  const data = body.data;
  const settings = normalizeProductSettings(data);
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
      brandId: data.brandId ?? null, productType: data.productType,
      purchaseCost: (data.productType === 'service' || data.productType === 'subscription') ? '0.00' : data.purchaseCost.toFixed(2),
      sellingPrice: data.sellingPrice.toFixed(2), taxCode: data.taxCode ?? null,
      reorderPoint: (data.productType === 'service' || data.productType === 'subscription') ? '0.000' : data.reorderPoint.toFixed(3),
      active: data.active, ...settings,
    }).returning();
    return { product: row[0] };
  }));
  if ('error' in created) return c.json({ error: { code: created.error, message: created.error === 'SKU_EXISTS' ? 'SKU مستخدم بالفعل' : 'البيانات المرتبطة بالمنتج غير صحيحة' } }, 409);
  return c.json({ product: created.product }, 201);
});

staffRoutes.patch('/products/:id', async c => {
  const auth = await requirePermission(c, 'catalog.write'); if ('error' in auth) return auth.error;
  const body = productSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات المنتج غير صحيحة' } }, 400);
  const data = body.data;
  const row = await withDatabase(c.env, db => db.transaction(async tx => {
    const existing = await tx.select({ id: products.id, categoryId: products.categoryId, brandId: products.brandId, productType: products.productType }).from(products)
      .where(and(eq(products.id, c.req.param('id')), eq(products.centerId, auth.user.centerId!))).limit(1);
    if (!existing[0]) return { error: 'PRODUCT_NOT_FOUND' as const };
    if (data.categoryId !== undefined) {
      const category = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.id, data.categoryId), eq(categories.centerId, auth.user.centerId!), eq(categories.active, true))).limit(1);
      if (!category[0]) return { error: 'CATEGORY_NOT_FOUND' as const };
    }
    if (data.brandId !== undefined && data.brandId !== null) {
      const brand = await tx.select({ id: brands.id }).from(brands).where(and(eq(brands.id, data.brandId), eq(brands.centerId, auth.user.centerId!), eq(brands.active, true))).limit(1);
      if (!brand[0]) return { error: 'BRAND_NOT_FOUND' as const };
    }
    if (data.sku !== undefined) {
      const duplicate = await tx.select({ id: products.id }).from(products).where(and(eq(products.centerId, auth.user.centerId!), eq(products.sku, data.sku), sql`${products.id} <> ${c.req.param('id')}`)).limit(1);
      if (duplicate[0]) return { error: 'SKU_EXISTS' as const };
    }
    const nextProductType = data.productType ?? existing[0].productType;
    const nextIsNonStock = NON_STOCK_PRODUCT_TYPES.includes(nextProductType as (typeof NON_STOCK_PRODUCT_TYPES)[number]);
    const updateData: any = {
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.brandId !== undefined ? { brandId: data.brandId } : {}),
      ...(data.productType !== undefined ? { productType: data.productType } : {}),
      ...(nextIsNonStock ? { purchaseCost: '0.00', reorderPoint: '0.000' } : {
        ...(data.purchaseCost !== undefined ? { purchaseCost: data.purchaseCost.toFixed(2) } : {}),
        ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint.toFixed(3) } : {}),
      }),
      ...(data.sellingPrice !== undefined ? { sellingPrice: data.sellingPrice.toFixed(2) } : {}),
      ...(data.taxCode !== undefined ? { taxCode: data.taxCode } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.inventoryValuationMethod !== undefined ? { inventoryValuationMethod: data.inventoryValuationMethod === 'inherit' ? null : data.inventoryValuationMethod } : {}),
      ...(data.costMethod !== undefined ? { costMethod: data.costMethod === 'inherit' ? null : data.costMethod } : {}),
      ...(data.inventoryTracking !== undefined ? { inventoryTracking: data.inventoryTracking, serialTracking: data.inventoryTracking === 'serial' } : {}),
      ...(data.serialAutoGenerate !== undefined ? { serialAutoGenerate: data.serialAutoGenerate } : {}),
      ...(data.serialPrefix !== undefined ? { serialPrefix: data.serialPrefix ?? null } : {}),
      ...(data.allowNegativeStock !== undefined ? { allowNegativeStock: data.allowNegativeStock } : {}),
      ...(data.expiryTracking !== undefined ? { expiryTracking: data.expiryTracking } : {}),
      ...(data.posAvailable !== undefined ? { posAvailable: data.posAvailable } : {}),
      ...(data.ecommerceAvailable !== undefined ? { ecommerceAvailable: data.ecommerceAvailable } : {}),
      ...(data.requiresCustomer !== undefined ? { requiresCustomer: data.requiresCustomer } : {}),
      ...(data.requiresSpecialist !== undefined ? { requiresSpecialist: data.requiresSpecialist } : {}),
      ...(data.purchaseAllowed !== undefined ? { purchaseAllowed: data.purchaseAllowed } : {}),
      ...(data.salesUom !== undefined ? { salesUom: data.salesUom } : {}),
      ...(data.purchaseUom !== undefined ? { purchaseUom: data.purchaseUom } : {}),
      ...(data.minimumSalesPrice !== undefined ? { minimumSalesPrice: data.minimumSalesPrice == null ? null : data.minimumSalesPrice.toFixed(2) } : {}),
      ...(data.inventoryAccountId !== undefined ? { inventoryAccountId: data.inventoryAccountId ?? null } : {}),
      ...(data.costOfSalesAccountId !== undefined ? { costOfSalesAccountId: data.costOfSalesAccountId ?? null } : {}),
      ...(data.revenueAccountId !== undefined ? { revenueAccountId: data.revenueAccountId ?? null } : {}),
      ...(data.purchaseAccountId !== undefined ? { purchaseAccountId: data.purchaseAccountId ?? null } : {}),
      ...(data.salesReturnAccountId !== undefined ? { salesReturnAccountId: data.salesReturnAccountId ?? null } : {}),
      ...(data.purchaseReturnAccountId !== undefined ? { purchaseReturnAccountId: data.purchaseReturnAccountId ?? null } : {}),
      ...(data.deferredRevenueAccountId !== undefined ? { deferredRevenueAccountId: data.deferredRevenueAccountId ?? null } : {}),
      ...(data.subscriptionRevenueAccountId !== undefined ? { subscriptionRevenueAccountId: data.subscriptionRevenueAccountId ?? null } : {}),
      ...(data.subscriptionDeferredRevenueEnabled !== undefined ? { subscriptionDeferredRevenueEnabled: data.subscriptionDeferredRevenueEnabled } : {}),
      ...(data.subscriptionRecognitionMethod !== undefined ? { subscriptionRecognitionMethod: data.subscriptionRecognitionMethod } : {}),
      ...(data.subscriptionDurationMonths !== undefined ? { subscriptionDurationMonths: data.subscriptionDurationMonths ?? null } : {}),
      ...(data.subscriptionDailyProration !== undefined ? { subscriptionDailyProration: data.subscriptionDailyProration } : {}),
      updatedAt: new Date(),
    };
    const updated = await tx.update(products).set(updateData).where(and(eq(products.id, c.req.param('id')), eq(products.centerId, auth.user.centerId!))).returning();
    return { product: updated[0] };
  }));
  if ('error' in row) {
    if (row.error === 'PRODUCT_NOT_FOUND') return c.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' } }, 404);
    if (row.error === 'CATEGORY_NOT_FOUND') return c.json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'التصنيف غير موجود أو لا يتبع للمركز' } }, 409);
    if (row.error === 'BRAND_NOT_FOUND') return c.json({ error: { code: 'BRAND_NOT_FOUND', message: 'العلامة التجارية غير موجودة أو لا تتبع للمركز' } }, 409);
    if (row.error === 'SKU_EXISTS') return c.json({ error: { code: 'SKU_EXISTS', message: 'SKU مستخدم بالفعل في هذا المركز' } }, 409);
  }
  return c.json({ product: row.product });
});

staffRoutes.get('/inventory', async c => {
  const auth = await requirePermission(c, 'inventory.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    productId: products.id, sku: products.sku, name: products.name, purchaseCost: products.purchaseCost,
    sellingPrice: products.sellingPrice, reorderPoint: products.reorderPoint,
    quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
  }).from(products).leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(and(eq(products.centerId, auth.user.centerId!), notInArray(products.productType, [...NON_STOCK_PRODUCT_TYPES]))).groupBy(products.id).orderBy(asc(products.name)));
  const inventory = rows.map(row => ({
    ...row,
    lowStock: Number(row.quantity) <= Number(row.reorderPoint),
  }));
  return c.json({
    inventory,
    lowStockCount: inventory.filter(row => row.lowStock).length,
  });
});

staffRoutes.get('/inventory/:productId/movements', async c => {
  const auth = await requirePermission(c, 'inventory.read'); if ('error' in auth) return auth.error;
  const product = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name,
  }).from(products).where(and(
    eq(products.id, c.req.param('productId')),
    eq(products.centerId, auth.user.centerId!),
  )).limit(1));
  if (!product[0]) return c.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' } }, 404);

  const movements = await withDatabase(c.env, db => db.select({
    id: stockMovements.id,
    movementType: stockMovements.movementType,
    quantity: stockMovements.quantity,
    unitCost: stockMovements.unitCost,
    referenceType: stockMovements.referenceType,
    referenceId: stockMovements.referenceId,
    occurredAt: stockMovements.occurredAt,
    notes: stockMovements.notes,
  }).from(stockMovements).where(and(
    eq(stockMovements.productId, product[0].id),
    eq(stockMovements.centerId, auth.user.centerId!),
  )).orderBy(desc(stockMovements.occurredAt)).limit(100));

  return c.json({ product: product[0], movements });
});

const stockReceiptSchema = z.object({
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(999999),
    unitCost: z.coerce.number().min(0).optional(),
  })).min(1).max(100),
});

staffRoutes.post('/inventory/receipt', async c => {
  const auth = await requirePermission(c, 'inventory.adjust'); if ('error' in auth) return auth.error;
  const body = stockReceiptSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الاستلام غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const productIds = [...new Set(body.data.items.map(item => item.productId))];
    const productRows = await tx.select({
      id: products.id, sku: products.sku, name: products.name, productType: products.productType, purchaseCost: products.purchaseCost, active: products.active, inventoryTracking: products.inventoryTracking, serialAutoGenerate: products.serialAutoGenerate, serialPrefix: products.serialPrefix,
    }).from(products).where(and(
      eq(products.centerId, auth.user.centerId!),
      inArray(products.id, productIds),
    ));
    const productMap = new Map(productRows.map(product => [product.id, product]));
    for (const item of body.data.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.active || product.productType === 'subscription') return { error: 'PHYSICAL_PRODUCT_REQUIRED' as const };
    }

    const reference = body.data.reference?.trim() || null;
    const now = new Date();
    const serialRows: { centerId:string; productId:string; serialNumber:string; status:string }[] = [];
    for (const item of body.data.items) {
      const product = productMap.get(item.productId)!;
      if (product.inventoryTracking === 'serial') {
        if (!Number.isInteger(item.quantity)) return { error: 'SERIAL_QUANTITY_MUST_BE_INTEGER' as const };
        if (!product.serialAutoGenerate) return { error: 'SERIAL_MANUAL_REQUIRED' as const };
        const prefix = product.serialPrefix?.trim() || `SRL-${product.sku}-`;
        for (let i=0;i<item.quantity;i++) serialRows.push({
          centerId:auth.user.centerId!, productId:item.productId,
          serialNumber:`${prefix}${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()}`,
          status:'available'
        });
      }
    }
    const inserted = await tx.insert(stockMovements).values(body.data.items.map(item => {
      const product = productMap.get(item.productId)!;
      return {
        centerId: auth.user.centerId!,
        productId: item.productId,
        movementType: 'purchase' as const,
        quantity: item.quantity.toString(),
        unitCost: (item.unitCost ?? Number(product.purchaseCost)).toFixed(2),
        referenceType: 'direct_receipt',
        referenceId: reference,
        occurredAt: now,
        createdBy: auth.user.userId,
        notes: body.data.notes?.trim() || null,
      };
    })).returning({ id: stockMovements.id });
    if (serialRows.length) await tx.insert(productSerials).values(serialRows);
    return { receivedLines: inserted.length, generatedSerials: serialRows.length, reference };
  }));

  if ('error' in result) {
    return c.json({ error: { code: result.error, message: result.error === 'PHYSICAL_PRODUCT_REQUIRED' ? 'الاستلام المباشر مخصص للمنتجات المخزنية فقط' : result.error === 'SERIAL_QUANTITY_MUST_BE_INTEGER' ? 'الصنف المتتبع بالسيريال يجب استلامه بكميات صحيحة' : result.error === 'SERIAL_MANUAL_REQUIRED' ? 'هذا الصنف يحتاج إدخال السيريالات يدويًا قبل الاستلام' : result.error === 'PRODUCT_NOT_FOUND' ? 'أحد المنتجات غير موجود أو موقوف' : 'تعذر تسجيل الاستلام' } }, 409);
  }
  return c.json({ ok: true, ...result }, 201);
});

staffRoutes.post('/inventory/adjust', async c => {
  const auth = await requirePermission(c, 'inventory.adjust'); if ('error' in auth) return auth.error;
  const body = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: body.error.issues[0]?.message ?? 'بيانات الحركة غير صحيحة' } }, 400);
  const data = body.data;
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const product = await tx.select({ id: products.id, purchaseCost: products.purchaseCost }).from(products)
      .where(and(eq(products.id, data.productId), eq(products.centerId, auth.user.centerId!), eq(products.active, true))).limit(1);
    if (!product[0]) return { error: 'PRODUCT_NOT_FOUND' as const };

    const currentRow = await tx.select({
      quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
    }).from(stockMovements).where(and(
      eq(stockMovements.productId, data.productId),
      eq(stockMovements.centerId, auth.user.centerId!),
    ));
    const currentStock = Number(currentRow[0]?.quantity ?? 0);
    const type = data.movementType;
    if (type === 'opening' && currentStock !== 0) return { error: 'OPENING_BALANCE_ONLY_ON_EMPTY_STOCK' as const, currentStock };
    const sign = type === 'adjustment_out' ? -1 : 1;
    const signedQuantity = Number(data.quantity) * sign;
    if (currentStock + signedQuantity < 0) {
      return { error: 'INSUFFICIENT_STOCK' as const, currentStock };
    }

    const row = await tx.insert(stockMovements).values({
      centerId: auth.user.centerId!, productId: data.productId, movementType: type,
      quantity: signedQuantity.toFixed(3), unitCost: (data.unitCost ?? Number(product[0].purchaseCost)).toFixed(2),
      referenceType: 'manual_inventory', occurredAt: new Date(), createdBy: auth.user.userId,
      notes: data.notes ?? null,
    }).returning();
    return { movement: row[0], currentStock: currentStock + signedQuantity };
  }));
  if ('error' in result) {
    if (result.error === 'PRODUCT_NOT_FOUND') return c.json({ error: { code: result.error, message: 'المنتج غير موجود أو غير نشط' } }, 404);
    if (result.error === 'OPENING_BALANCE_ONLY_ON_EMPTY_STOCK') return c.json({ error: { code: result.error, message: 'الرصيد الافتتاحي لا يُسجل إلا على منتج لا يملك حركة مخزون سابقة', details: { currentStock: result.currentStock } } }, 409);
    if (result.error === 'INSUFFICIENT_STOCK') return c.json({
      error: { code: result.error, message: 'لا يمكن صرف كمية أكبر من الرصيد الحالي', details: { currentStock: result.currentStock, requested: data.quantity } },
    }, 409);
  }
  return c.json({ movement: result.movement, currentStock: result.currentStock }, 201);
});


const posSaleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(['cash', 'card', 'mada', 'bank_transfer']),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(9999),
    unitPrice: z.coerce.number().min(0),
    discount: z.coerce.number().min(0).default(0),
  })).min(1).max(500),
});

staffRoutes.get('/pos/products', async c => {
  const auth = await requirePermission(c, 'pos.read'); if ('error' in auth) return auth.error;
  const query = (c.req.query('q') ?? '').trim();
  if (!query) return c.json({ products: [] });

  const rows = await withDatabase(c.env, db => db.select({
    id: products.id, sku: products.sku, name: products.name, productType: products.productType,
    sellingPrice: products.sellingPrice, purchaseCost: products.purchaseCost,
    barcode: productBarcodes.barcode,
    quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
  }).from(products)
    .leftJoin(productBarcodes, and(eq(productBarcodes.productId, products.id), eq(productBarcodes.active, true)))
    .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(and(
      eq(products.centerId, auth.user.centerId!), eq(products.active, true),
      or(eq(products.sku, query), eq(productBarcodes.barcode, query),
        sql`lower(${products.name}) like lower(concat('%', ${query}, '%'))`),
    ))
    .groupBy(products.id, productBarcodes.barcode)
    .orderBy(asc(products.name)).limit(20));
  return c.json({ products: rows });
});

staffRoutes.get('/pos/customers', async c => {
  const auth = await requirePermission(c, 'pos.read'); if ('error' in auth) return auth.error;
  const query = (c.req.query('q') ?? '').trim();
  if (!query) return c.json({ customers: [] });
  const rows = await withDatabase(c.env, db => db.select({
    id: customers.id, customerNumber: customers.customerNumber,
    firstName: customers.firstName, lastName: customers.lastName, phone: customers.phone,
  }).from(customers).where(and(
    eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'),
    or(eq(customers.customerNumber, query), eq(customers.phone, query),
      sql`lower(concat(${customers.firstName}, ' ', ${customers.lastName})) like lower(concat('%', ${query}, '%'))`),
  )).orderBy(asc(customers.firstName)).limit(20));
  return c.json({ customers: rows });
});

staffRoutes.post('/pos/sales', async c => {
  const auth = await requirePermission(c, 'pos.sell'); if ('error' in auth) return auth.error;
  const body = posSaleSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: { code: 'INVALID_INPUT', message: 'بيانات البيع غير صحيحة' } }, 400);

  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const data = body.data;
    const ids = [...new Set(data.items.map(item => item.productId))].sort();
    const locked = await tx.select({
      id: products.id, sku: products.sku, name: products.name, productType: products.productType,
      purchaseCost: products.purchaseCost, costMethod: products.costMethod, allowNegativeStock: products.allowNegativeStock, sellingPrice: products.sellingPrice, taxCode: products.taxCode, active: products.active, posAvailable: products.posAvailable, minimumSalesPrice: products.minimumSalesPrice, inventoryTracking: products.inventoryTracking, revenueAccountId: products.revenueAccountId, salesReturnAccountId: products.salesReturnAccountId, costOfSalesAccountId: products.costOfSalesAccountId, inventoryAccountId: products.inventoryAccountId,
    }).from(products).where(and(
      eq(products.centerId, auth.user.centerId!), inArray(products.id, ids), eq(products.active, true),
    ));
    if (locked.length !== ids.length) return { error: 'PRODUCT_NOT_FOUND' as const };
    for (const id of ids) await tx.execute(sql`select id from products where id = ${id} for update`);

    if (data.customerId) {
      const customer = await tx.select({ id: customers.id }).from(customers).where(and(
        eq(customers.id, data.customerId), eq(customers.centerId, auth.user.centerId!), eq(customers.status, 'active'),
      )).limit(1);
      if (!customer[0]) return { error: 'CUSTOMER_NOT_FOUND' as const };
    }

    const movementRows = await tx.select({ productId: stockMovements.productId, quantity: stockMovements.quantity })
      .from(stockMovements).where(and(
        eq(stockMovements.centerId, auth.user.centerId!), inArray(stockMovements.productId, ids),
      ));
    const available = new Map<string, number>();
    for (const row of movementRows) available.set(row.productId, (available.get(row.productId) ?? 0) + Number(row.quantity));
    const productMap = new Map(locked.map(p => [p.id, p]));

    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      if (!product.posAvailable) return { error: 'POS_PRODUCT_DISABLED' as const, productId: item.productId };
      if (product.minimumSalesPrice != null && item.unitPrice < Number(product.minimumSalesPrice)) return { error: 'BELOW_MINIMUM_PRICE' as const, productId: item.productId };
      if (product.productType === 'product') {
        const currentCost = await getProductCost(tx, { centerId: auth.user.centerId!, productId: product.id, quantity: item.quantity, costMethod: product.costMethod, standardCost: Number(product.purchaseCost) });
        if (item.unitPrice < currentCost) return { error: 'BELOW_COST' as const, productId: item.productId };
      }
      if (product.inventoryTracking === 'serial' && !Number.isInteger(item.quantity)) return { error: 'SERIAL_QUANTITY_MUST_BE_INTEGER' as const, productId: item.productId };
      if (!NON_STOCK_PRODUCT_TYPES.includes(product.productType as (typeof NON_STOCK_PRODUCT_TYPES)[number]) && !product.allowNegativeStock && item.quantity > (available.get(item.productId) ?? 0)) return { error: 'INSUFFICIENT_STOCK' as const, productId: item.productId };
      if (product.inventoryTracking === 'serial') {
        const serials = await tx.execute(sql`select id from product_serials where center_id=${auth.user.centerId!} and product_id=${item.productId} and status='available' order by created_at,id limit ${Math.trunc(item.quantity)} for update`);
        if (serials.rows.length < item.quantity) return { error: 'INSUFFICIENT_SERIALS' as const, productId: item.productId };
      }
    }

    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = data.items.reduce((sum, item) => sum + item.discount, 0);
    const taxLines: Awaited<ReturnType<typeof calculateTax>>[] = [];
    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      try {
        taxLines.push(await calculateTax(tx, auth.user.centerId!, {
          taxCode: product.taxCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.startsWith('TAX_RATE_NOT_CONFIGURED:')) {
          return { error: 'TAX_RATE_NOT_CONFIGURED' as const, taxCode: product.taxCode };
        }
        throw error;
      }
    }
    const tax = taxLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = Math.max(0, subtotal - discount + tax);
    const costByProduct = new Map<string, number>();
    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      if (NON_STOCK_PRODUCT_TYPES.includes(product.productType as (typeof NON_STOCK_PRODUCT_TYPES)[number])) {
        costByProduct.set(product.id, 0);
      } else {
        costByProduct.set(product.id, await getProductCost(tx, {
          centerId: auth.user.centerId!, productId: product.id, quantity: item.quantity,
          costMethod: product.costMethod, standardCost: Number(product.purchaseCost),
        }));
      }
    }
    const saleNumber = `POS-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const saleRows = await tx.insert(sales).values({
      centerId: auth.user.centerId!, customerId: data.customerId ?? null, cashierId: auth.user.userId,
      saleNumber, status: 'completed', subtotal: subtotal.toFixed(2), discount: discount.toFixed(2),
      tax: tax.toFixed(2), total: total.toFixed(2), paymentMethod: data.paymentMethod,
    }).returning();
    const sale = saleRows[0];
    if (!sale) return { error: 'SALE_CREATE_FAILED' as const };

    await tx.insert(saleItems).values(data.items.map((item, index) => {
      const taxLine = taxLines[index];
      return {
        saleId: sale.id, productId: item.productId, quantity: item.quantity.toFixed(3),
        unitPrice: item.unitPrice.toFixed(2), discount: item.discount.toFixed(2),
        tax: taxLine.taxAmount.toFixed(2),
        lineTotal: taxLine.totalAmount.toFixed(2),
      };
    }));

    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      if (product.inventoryTracking === 'serial') {
        await tx.execute(sql`update product_serials set status='sold', sale_id=${sale.id}, updated_at=now() where id in (select id from product_serials where center_id=${auth.user.centerId!} and product_id=${item.productId} and status='available' order by created_at,id limit ${Math.trunc(item.quantity)})`);
      }
    }
    const stockLines = data.items.filter(item => !NON_STOCK_PRODUCT_TYPES.includes(productMap.get(item.productId)!.productType as (typeof NON_STOCK_PRODUCT_TYPES)[number]));
    if (stockLines.length) {
      await tx.insert(stockMovements).values(stockLines.map(item => ({
        centerId: auth.user.centerId!, productId: item.productId, movementType: 'sale',
        quantity: (-item.quantity).toFixed(3), unitCost: (costByProduct.get(item.productId) ?? 0).toFixed(2),
        referenceType: 'pos_sale', referenceId: sale.id, occurredAt: new Date(), createdBy: auth.user.userId,
        notes: `صرف من نقطة البيع ${saleNumber}`,
      })));
    }
    const accountingLines = data.items.map(item => {
      const product = productMap.get(item.productId)!;
      const netSubtotal = Math.max(0, item.quantity * item.unitPrice - item.discount);
      return {
        productId: product.id, productType: product.productType, subtotal: netSubtotal,
        tax: taxLines[data.items.indexOf(item)].taxAmount,
        cogs: NON_STOCK_PRODUCT_TYPES.includes(product.productType as (typeof NON_STOCK_PRODUCT_TYPES)[number]) ? 0 : item.quantity * (costByProduct.get(product.id) ?? 0),
        revenueAccountId: product.revenueAccountId,
        salesReturnAccountId: product.salesReturnAccountId,
        costOfSalesAccountId: product.costOfSalesAccountId,
        inventoryAccountId: product.inventoryAccountId,
      };
    });
    await postSaleWithProductAccounts(tx, {
      centerId: auth.user.centerId!, saleId: sale.id, saleNumber, saleDate: new Date().toISOString().slice(0,10),
      tax, total, paymentMethod: data.paymentMethod, createdBy: auth.user.userId, lines: accountingLines,
    });
    return { sale };
  }));

  if ('error' in result) {
    const messages: Record<string, [string, string, number]> = {
      PRODUCT_NOT_FOUND: ['PRODUCT_NOT_FOUND', 'يوجد منتج غير متاح أو غير تابع للمركز', 404],
      CUSTOMER_NOT_FOUND: ['CUSTOMER_NOT_FOUND', 'العميل غير موجود أو غير نشط', 404],
      BELOW_COST: ['BELOW_COST', 'لا يمكن بيع منتج مخزني بسعر أقل من تكلفة الشراء', 409],
      BELOW_MINIMUM_PRICE: ['BELOW_MINIMUM_PRICE', 'سعر البيع أقل من الحد الأدنى المحدد للصنف', 409],
      POS_PRODUCT_DISABLED: ['POS_PRODUCT_DISABLED', 'الصنف غير متاح في نقطة البيع حسب إعداداته', 409],
      SERIAL_QUANTITY_MUST_BE_INTEGER: ['SERIAL_QUANTITY_MUST_BE_INTEGER', 'الصنف المتتبع بالسيريال يجب بيعه بكميات صحيحة', 409],
      INSUFFICIENT_SERIALS: ['INSUFFICIENT_SERIALS', 'لا توجد سيريالات متاحة بالكمية المطلوبة للصنف', 409],
      INSUFFICIENT_STOCK: ['INSUFFICIENT_STOCK', 'المخزون الحالي غير كافٍ لإتمام البيع', 409],
      SALE_CREATE_FAILED: ['SALE_CREATE_FAILED', 'تعذر إنشاء عملية البيع', 500],
      TAX_RATE_NOT_CONFIGURED: ['TAX_RATE_NOT_CONFIGURED', 'كود الضريبة للمنتج غير مُهيأ في إعدادات الضرائب', 409],
    };
    const errorCode = result.error ?? 'POS_ERROR';
    const [code, message, status] = messages[errorCode] ?? ['POS_ERROR', 'تعذر إتمام البيع', 500];
    return c.json({ error: { code, message } }, status as any);
  }
  return c.json({ sale: result.sale }, 201);
});

staffRoutes.get('/pos/sales', async c => {
  const auth = await requirePermission(c, 'pos.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: sales.id, saleNumber: sales.saleNumber, status: sales.status, subtotal: sales.subtotal,
    discount: sales.discount, tax: sales.tax, total: sales.total, paymentMethod: sales.paymentMethod,
    createdAt: sales.createdAt, customerName: sql<string | null>`nullif(concat(${customers.firstName}, ' ', ${customers.lastName}), ' ')`,
  }).from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.centerId, auth.user.centerId!))
    .orderBy(desc(sales.createdAt)).limit(100));
  return c.json({ sales: rows });
});

staffRoutes.post('/pos/sales/:id/void', async c => {
  const auth = await requirePermission(c, 'pos.void'); if ('error' in auth) return auth.error;
  const result = await withDatabase(c.env, db => db.transaction(async tx => {
    const saleRows = await tx.select().from(sales).where(and(eq(sales.id, c.req.param('id')), eq(sales.centerId, auth.user.centerId!))).limit(1);
    const sale = saleRows[0];
    if (!sale) return { error: 'SALE_NOT_FOUND' as const };
    if (sale.status === 'voided') return { error: 'ALREADY_VOIDED' as const };
    if (sale.status !== 'completed') return { error: 'INVALID_STATUS' as const };
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    if (!items.length) return { error: 'EMPTY_SALE' as const };
    const existingReversal = await tx.select({ id: stockMovements.id }).from(stockMovements)
      .where(and(eq(stockMovements.referenceType, 'pos_void'), eq(stockMovements.referenceId, sale.id))).limit(1);
    if (existingReversal[0]) return { error: 'ALREADY_REVERSED' as const };
    const productIds = [...new Set(items.map(item => item.productId))];
    const productRows = await tx.select({ id: products.id, purchaseCost: products.purchaseCost, productType: products.productType })
      .from(products).where(and(eq(products.centerId, auth.user.centerId!), inArray(products.id, productIds)));
    const costByProduct = new Map(productRows.map(product => [product.id, Number(product.purchaseCost)]));
    const stockReturnItems = items.filter(item => productRows.find(product => product.id === item.productId)?.productType !== 'subscription');
    if (stockReturnItems.length) {
      await tx.insert(stockMovements).values(stockReturnItems.map(item => ({
        centerId: auth.user.centerId!, productId: item.productId, movementType: 'return',
        quantity: Number(item.quantity).toFixed(3), unitCost: (costByProduct.get(item.productId) ?? 0).toFixed(2),
        referenceType: 'pos_void', referenceId: sale.id, occurredAt: new Date(), createdBy: auth.user.userId,
        notes: `عكس صرف عملية البيع ${sale.saleNumber}`,
      })));
    }
    await reverseSale(tx, { centerId: auth.user.centerId!, saleId: sale.id, saleNumber: sale.saleNumber, date: new Date().toISOString().slice(0,10), createdBy: auth.user.userId });
    const updated = await tx.update(sales).set({ status: 'voided', paymentStatus: 'refunded', updatedAt: new Date() }).where(eq(sales.id, sale.id)).returning();
    return { sale: updated[0] };
  }));
  if ('error' in result) {
    const messages: Record<string, [string, string, number]> = {
      SALE_NOT_FOUND: ['SALE_NOT_FOUND', 'عملية البيع غير موجودة', 404],
      ALREADY_VOIDED: ['ALREADY_VOIDED', 'عملية البيع ملغاة بالفعل', 409],
      INVALID_STATUS: ['INVALID_STATUS', 'لا يمكن إلغاء هذه العملية من حالتها الحالية', 409],
      EMPTY_SALE: ['EMPTY_SALE', 'لا يمكن إلغاء عملية بيع بدون أصناف', 409],
      ALREADY_REVERSED: ['ALREADY_REVERSED', 'تم عكس مخزون هذه العملية بالفعل', 409],
    };
    const errorCode = result.error ?? 'POS_VOID_ERROR';
    const [code, message, status] = messages[errorCode] ?? ['POS_VOID_ERROR', 'تعذر إلغاء عملية البيع', 500];
    return c.json({ error: { code, message } }, status as any);
  }
  return c.json({ sale: result.sale });
});

staffRoutes.get('/pos/sales/:id', async c => {
  const auth = await requirePermission(c, 'pos.read'); if ('error' in auth) return auth.error;
  const saleRows = await withDatabase(c.env, db => db.select({
    id: sales.id, saleNumber: sales.saleNumber, status: sales.status, subtotal: sales.subtotal,
    discount: sales.discount, tax: sales.tax, total: sales.total, paymentMethod: sales.paymentMethod,
    createdAt: sales.createdAt,
    customerName: sql<string | null>`nullif(concat(${customers.firstName}, ' ', ${customers.lastName}), ' ')`,
  }).from(sales).leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.id, c.req.param('id')), eq(sales.centerId, auth.user.centerId!))).limit(1));
  if (!saleRows[0]) return c.json({ error: { code: 'SALE_NOT_FOUND', message: 'عملية البيع غير موجودة' } }, 404);
  const items = await withDatabase(c.env, db => db.select({
    id: saleItems.id, productId: saleItems.productId, productName: products.name,
    sku: products.sku, quantity: saleItems.quantity, unitPrice: saleItems.unitPrice,
    discount: saleItems.discount, tax: saleItems.tax, lineTotal: saleItems.lineTotal,
  }).from(saleItems).innerJoin(products, eq(products.id, saleItems.productId))
    .where(eq(saleItems.saleId, saleRows[0].id)).orderBy(asc(products.name)));
  return c.json({ sale: saleRows[0], items });
});

staffRoutes.get('/orders', async c => {
  const auth = await requirePermission(c, 'orders.read'); if ('error' in auth) return auth.error;
  const orders = await withDatabase(c.env, db => db.select().from(storeOrders)
    .where(eq(storeOrders.centerId, auth.user.centerId!)).orderBy(desc(storeOrders.createdAt)));
  return c.json({ orders });
});

staffRoutes.patch('/orders/:id/status', async c => {
  const auth = await requirePermission(c, 'orders.update'); if ('error' in auth) return auth.error;
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
        cashierId: auth.user.userId,
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


staffRoutes.get('/reports/summary', async c => {
  const auth = await requirePermission(c, 'reports.read'); if ('error' in auth) return auth.error;
  const from = c.req.query('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ from, to });
  if (!parsed.success || from > to) return c.json({ error: { code: 'INVALID_DATE_RANGE', message: 'نطاق التاريخ غير صحيح' } }, 400);
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T00:00:00.000Z'); end.setUTCDate(end.getUTCDate() + 1);

  const [salesRows, dailyRows, paymentRows, movementRows, inventoryRows] = await Promise.all([
    withDatabase(c.env, db => db.select({
      status: sales.status,
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<string>`coalesce(sum(${sales.total}), 0)`.mapWith(String),
      tax: sql<string>`coalesce(sum(${sales.tax}), 0)`.mapWith(String),
    }).from(sales).where(and(eq(sales.centerId, auth.user.centerId!), gte(sales.createdAt, start), lt(sales.createdAt, end))).groupBy(sales.status)),
    withDatabase(c.env, db => db.select({
      date: sql<string>`to_char(date_trunc('day', ${sales.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<string>`coalesce(sum(${sales.total}), 0)`.mapWith(String),
    }).from(sales).where(and(eq(sales.centerId, auth.user.centerId!), eq(sales.status, 'completed'), gte(sales.createdAt, start), lt(sales.createdAt, end)))
      .groupBy(sql`date_trunc('day', ${sales.createdAt})`).orderBy(sql`date_trunc('day', ${sales.createdAt})`)),
    withDatabase(c.env, db => db.select({
      paymentMethod: sales.paymentMethod,
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<string>`coalesce(sum(${sales.total}), 0)`.mapWith(String),
    }).from(sales).where(and(eq(sales.centerId, auth.user.centerId!), eq(sales.status, 'completed'), gte(sales.createdAt, start), lt(sales.createdAt, end)))
      .groupBy(sales.paymentMethod).orderBy(desc(sql`sum(${sales.total})`))),
    withDatabase(c.env, db => db.select({
      movementType: stockMovements.movementType,
      quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`.mapWith(String),
    }).from(stockMovements).where(and(eq(stockMovements.centerId, auth.user.centerId!), gte(stockMovements.occurredAt, start), lt(stockMovements.occurredAt, end)))
      .groupBy(stockMovements.movementType).orderBy(asc(stockMovements.movementType))),
    withDatabase(c.env, db => db.select({
      productId: products.id, sku: products.sku, name: products.name,
      quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`.mapWith(String),
      reorderPoint: products.reorderPoint, purchaseCost: products.purchaseCost,
    }).from(products).leftJoin(stockMovements, and(eq(stockMovements.productId, products.id), eq(stockMovements.centerId, auth.user.centerId!)))
      .where(and(eq(products.centerId, auth.user.centerId!), eq(products.active, true)))
      .groupBy(products.id).orderBy(asc(products.name))),
  ]);

  const completed = salesRows.find(row => row.status === 'completed');
  const returned = salesRows.find(row => row.status === 'returned');
  const voided = salesRows.find(row => row.status === 'voided');
  const lowStock = inventoryRows.filter(row => Number(row.reorderPoint) > 0 && Number(row.quantity) <= Number(row.reorderPoint));
  const outOfStock = inventoryRows.filter(row => Number(row.quantity) <= 0);
  const inventoryValue = inventoryRows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.purchaseCost), 0);

  return c.json({
    from, to,
    summary: {
      salesCount: Number(completed?.count ?? 0), salesTotal: String(completed?.total ?? '0'), taxTotal: String(completed?.tax ?? '0'),
      returnedCount: Number(returned?.count ?? 0), returnedTotal: String(returned?.total ?? '0'), voidedCount: Number(voided?.count ?? 0),
      inventoryValue: inventoryValue.toFixed(2), lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
    },
    dailySales: dailyRows.map(row => ({ date: row.date, count: Number(row.count), total: String(row.total ?? '0') })),
    paymentMethods: paymentRows.map(row => ({ paymentMethod: row.paymentMethod, count: Number(row.count), total: String(row.total ?? '0') })),
    movementTotals: movementRows.map(row => ({ movementType: row.movementType, quantity: String(row.quantity ?? '0') })),
    lowStock: lowStock.map(row => ({ productId: row.productId, sku: row.sku, name: row.name, quantity: String(row.quantity ?? '0'), reorderPoint: String(row.reorderPoint ?? '0'), purchaseCost: String(row.purchaseCost ?? '0') })),
    outOfStock: outOfStock.map(row => ({ productId: row.productId, sku: row.sku, name: row.name, quantity: String(row.quantity ?? '0'), purchaseCost: String(row.purchaseCost ?? '0') })),
  });
});
