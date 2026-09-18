import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const auditTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const centers = pgTable('centers', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Riyadh'),
  currencyCode: varchar('currency_code', { length: 3 }).notNull().default('SAR'),
  locale: varchar('locale', { length: 20 }).notNull().default('ar-SA'),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  ...auditTimestamps,
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').references(() => centers.id),
  email: varchar('email', { length: 320 }),
  phone: varchar('phone', { length: 30 }),
  passwordHash: text('password_hash'),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...auditTimestamps,
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
}, (table) => [
  index('users_center_status_idx').on(table.centerId, table.status),
  index('users_email_idx').on(table.email),
  index('users_phone_idx').on(table.phone),
]);

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').references(() => centers.id),
  code: varchar('code', { length: 80 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  ...auditTimestamps,
}, (table) => [
  uniqueIndex('roles_center_code_uq').on(table.centerId, table.code),
]);

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 150 }).notNull().unique(),
  resource: varchar('resource', { length: 80 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  description: text('description'),
});

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.roleId] })]);

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]);

export const userPermissions = pgTable('user_permissions', {
  userId: uuid('user_id').notNull().references(() => users.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.permissionId] })]);

export const staffProfiles = pgTable('staff_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  staffType: varchar('staff_type', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  active: boolean('active').notNull().default(true),
  ...auditTimestamps,
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  sessionTokenHash: varchar('session_token_hash', { length: 128 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
}, (table) => [index('sessions_user_status_idx').on(table.userId, table.revokedAt, table.expiresAt)]);

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerNumber: varchar('customer_number', { length: 50 }).notNull().default(sql`nextval('customer_number_seq')::text`),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 320 }),
  dateOfBirth: date('date_of_birth'),
  gender: varchar('gender', { length: 30 }),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  source: varchar('source', { length: 80 }),
  notes: text('notes'),
  ...auditTimestamps,
  createdBy: uuid('created_by').notNull().references(() => users.id),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('customers_center_number_uq').on(table.centerId, table.customerNumber),
  index('customers_center_phone_idx').on(table.centerId, table.phone),
]);

export const measurementTypes = pgTable('measurement_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  code: varchar('code', { length: 80 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  unit: varchar('unit', { length: 30 }),
  active: boolean('active').notNull().default(true),
}, (table) => [uniqueIndex('measurement_types_center_code_uq').on(table.centerId, table.code)]);

export const measurementRecords = pgTable('measurement_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  measurementTypeId: uuid('measurement_type_id').notNull().references(() => measurementTypes.id),
  value: numeric('value', { precision: 14, scale: 4 }).notNull(),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  ...auditTimestamps,
});

export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  staffId: uuid('assigned_staff_id').notNull().references(() => users.id),
  startsAt: timestamp('scheduled_start', { withTimezone: true }).notNull(),
  endsAt: timestamp('scheduled_end', { withTimezone: true }).notNull(),
  appointmentType: varchar('appointment_type', { length: 80 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('scheduled'),
  notes: text('notes'),
  ...auditTimestamps,
});

export const nutritionPlans = pgTable('nutrition_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  specialistId: uuid('specialist_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  goals: text('goals'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  ...auditTimestamps,
});

export const nutritionPlanItems = pgTable('nutrition_plan_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  nutritionPlanId: uuid('nutrition_plan_id').notNull().references(() => nutritionPlans.id),
  mealType: varchar('meal_type', { length: 50 }).notNull(),
  itemName: varchar('item_name', { length: 200 }).notNull(),
  quantity: numeric('quantity'),
  unit: varchar('unit', { length: 30 }),
  calories: numeric('calories'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const fitnessPlans = pgTable('fitness_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  specialistId: uuid('specialist_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  goals: text('goals'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  ...auditTimestamps,
});

export const fitnessPlanExercises = pgTable('fitness_plan_exercises', {
  id: uuid('id').defaultRandom().primaryKey(),
  fitnessPlanId: uuid('fitness_plan_id').notNull().references(() => fitnessPlans.id),
  exerciseName: varchar('exercise_name', { length: 200 }).notNull(),
  sets: integer('sets'),
  repetitions: integer('repetitions'),
  durationSeconds: integer('duration_seconds'),
  restSeconds: integer('rest_seconds'),
  targetNotes: text('target_notes'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  parentId: uuid('parent_id'),
  name: varchar('name', { length: 150 }).notNull(),
  code: varchar('code', { length: 80 }),
  active: boolean('active').notNull().default(true),
}, (table) => [index('categories_center_idx').on(table.centerId)]);

export const brands = pgTable('brands', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  name: varchar('name', { length: 150 }).notNull(),
  code: varchar('code', { length: 80 }),
  active: boolean('active').notNull().default(true),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  sku: varchar('sku', { length: 80 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  brandId: uuid('brand_id').references(() => brands.id),
  productType: varchar('product_type', { length: 50 }).notNull().default('product'),
  purchaseCost: numeric('purchase_cost', { precision: 14, scale: 2 }).notNull().default('0'),
  sellingPrice: numeric('selling_price', { precision: 14, scale: 2 }).notNull().default('0'),
  taxCode: varchar('tax_code', { length: 50 }),
  reorderPoint: numeric('reorder_point', { precision: 14, scale: 3 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  ...auditTimestamps,
}, (table) => [uniqueIndex('products_center_sku_uq').on(table.centerId, table.sku)]);

export const productBarcodes = pgTable('product_barcodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id),
  barcode: varchar('barcode', { length: 100 }).notNull().unique(),
  barcodeType: varchar('barcode_type', { length: 30 }).notNull().default('EAN'),
  active: boolean('active').notNull().default(true),
});

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  movementType: varchar('movement_type', { length: 40 }).notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  notes: text('notes'),
}, (table) => [
  index('stock_movements_product_date_idx').on(table.productId, table.occurredAt),
  index('stock_movements_reference_idx').on(table.referenceType, table.referenceId),
]);

export const sales = pgTable('sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').references(() => customers.id),
  soldBy: uuid('sold_by').notNull().references(() => users.id),
  saleNumber: varchar('sale_number', { length: 80 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('completed'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  ...auditTimestamps,
}, (table) => [
  uniqueIndex('sales_center_number_uq').on(table.centerId, table.saleNumber),
  index('sales_customer_date_idx').on(table.customerId, table.createdAt),
]);

export const saleItems = pgTable('sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id').notNull().references(() => sales.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const taxRates = pgTable('tax_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),
  categoryCode: varchar('category_code', { length: 10 }).notNull().default('S'),
  exemptionReasonCode: varchar('exemption_reason_code', { length: 20 }),
  active: boolean('active').notNull().default(true),
  ...auditTimestamps,
}, (table) => [
  uniqueIndex('tax_rates_center_code_uq').on(table.centerId, table.code),
  index('tax_rates_center_active_idx').on(table.centerId, table.active),
]);

export const zatcaSettings = pgTable('zatca_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().unique().references(() => centers.id),
  environment: varchar('environment', { length: 20 }).notNull().default('simulation'),
  vatNumber: varchar('vat_number', { length: 20 }),
  legalName: varchar('legal_name', { length: 200 }),
  invoiceTypeCode: varchar('invoice_type_code', { length: 10 }).notNull().default('0200000'),
  deviceSerial: varchar('device_serial', { length: 200 }),
  sellerStreet: varchar('seller_street', { length: 200 }),
  sellerBuildingNumber: varchar('seller_building_number', { length: 50 }),
  sellerCity: varchar('seller_city', { length: 100 }),
  sellerPostalCode: varchar('seller_postal_code', { length: 20 }),
  sellerCountryCode: varchar('seller_country_code', { length: 2 }).notNull().default('SA'),
  pih: text('pih'),
  lastIcv: integer('last_icv').notNull().default(0),
  status: varchar('status', { length: 30 }).notNull().default('not_configured'),
  lastError: text('last_error'),
  ...auditTimestamps,
});

export const eInvoices = pgTable('e_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  saleId: uuid('sale_id').references(() => sales.id),
  invoiceNumber: varchar('invoice_number', { length: 100 }).notNull(),
  uuid: uuid('uuid').notNull().unique(),
  invoiceType: varchar('invoice_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  invoiceHash: text('invoice_hash'),
  xml: text('xml'),
  qrCode: text('qr_code'),
  reportingStatus: varchar('reporting_status', { length: 30 }),
  clearanceStatus: varchar('clearance_status', { length: 30 }),
  responseCode: varchar('response_code', { length: 50 }),
  responseBody: jsonb('response_body'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reportedAt: timestamp('reported_at', { withTimezone: true }),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  ...auditTimestamps,
}, (table) => [
  uniqueIndex('e_invoices_center_number_uq').on(table.centerId, table.invoiceNumber),
  uniqueIndex('e_invoices_sale_uq').on(table.saleId),
  index('e_invoices_center_status_idx').on(table.centerId, table.status),
]);

export const customerFollowUps = pgTable('customer_follow_ups', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  staffId: uuid('staff_id').notNull().references(() => users.id),
  followUpAt: timestamp('follow_up_at', { withTimezone: true }).notNull(),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  weight: numeric('weight', { precision: 14, scale: 4 }),
  height: numeric('height', { precision: 14, scale: 4 }),
  adherenceScore: integer('adherence_score'),
  nutritionAdherenceScore: integer('nutrition_adherence_score'),
  fitnessAdherenceScore: integer('fitness_adherence_score'),
  notes: text('notes'),
  recommendations: text('recommendations'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  ...auditTimestamps,
}, (table) => [
  index('customer_follow_ups_center_customer_date_idx').on(table.centerId, table.customerId, table.followUpAt),
  index('customer_follow_ups_center_date_idx').on(table.centerId, table.followUpAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').references(() => centers.id),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  result: varchar('result', { length: 30 }).notNull().default('success'),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_center_date_idx').on(table.centerId, table.createdAt),
  index('audit_resource_date_idx').on(table.resourceType, table.resourceId, table.createdAt),
  index('audit_actor_date_idx').on(table.actorUserId, table.createdAt),
]);
