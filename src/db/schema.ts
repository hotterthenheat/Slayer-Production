import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  version: integer('version').default(0).notNull(), // OCC for token/billing updates
  tokens: integer('tokens').default(0).notNull(),
  fullProfile: text('full_profile'),
  createdAt: timestamp('created_at').defaultNow(),
});
