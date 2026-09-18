import { boolean, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { centers, customers, products } from './schema';

export const storeCarts = pgTable('store_carts', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('store_carts_customer_status_idx').on(table.customerId, table.status),
  index('store_carts_center_status_idx').on(table.centerId, table.status),
]);

export const storeCartItems = pgTable('store_cart_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  cartId: uuid('cart_id').notNull().references(() => storeCarts.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('store_cart_items_cart_product_uq').on(table.cartId, table.productId),
]);

export const storeOrders = pgTable('store_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  centerId: uuid('center_id').notNull().references(() => centers.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  orderNumber: varchar('order_number', { length: 80 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentMethod: varchar('payment_method', { length: 50 }),
  paymentStatus: varchar('payment_status', { length: 30 }).notNull().default('unpaid'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('store_orders_center_number_uq').on(table.centerId, table.orderNumber),
  index('store_orders_customer_date_idx').on(table.customerId, table.createdAt),
]);

export const storeOrderItems = pgTable('store_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => storeOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 200 }).notNull(),
  sku: varchar('sku', { length: 80 }).notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
}, table => [
  index('store_order_items_order_idx').on(table.orderId),
]);
