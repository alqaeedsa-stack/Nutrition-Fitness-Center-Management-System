import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './schema';

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  requestedIp: varchar('requested_ip', { length: 64 }),
  userAgent: text('user_agent'),
}, (table) => [
  index('password_reset_tokens_user_idx').on(table.userId, table.expiresAt),
  index('password_reset_tokens_active_idx').on(table.tokenHash, table.expiresAt, table.usedAt),
]);
