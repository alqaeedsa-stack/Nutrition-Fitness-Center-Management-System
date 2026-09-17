import {
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Customer portal account mapping.
 * Foreign keys are enforced by the PostgreSQL schema; this isolated module
 * avoids introducing a circular import into the existing schema definition.
 */
export const customerAccounts = pgTable('customer_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('customer_accounts_customer_id_uq').on(table.customerId),
  uniqueIndex('customer_accounts_user_id_uq').on(table.userId),
]);
