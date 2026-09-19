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
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.centerId, auth.user.centerId!)).orderBy(asc(products.name)));
  return c.json({ products: rows });
});

staffRoutes.get('/products/:id', async c => {
  const auth = await requirePermission(c, 'catalog.read'); if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({