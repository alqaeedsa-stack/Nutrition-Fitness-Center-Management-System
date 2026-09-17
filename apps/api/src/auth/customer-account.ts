import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { customers, users } from '../db/schema';

export const customerAccounts = pgTable('customer_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().unique().references(() => customers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('customer_accounts_customer_uq').on(table.customerId),
  uniqueIndex('customer_accounts_user_uq').on(table.userId),
  index('customer_accounts_status_idx').on(table.status),
]);
