import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const progress = pgTable("progress", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usernames = pgTable("usernames", {
  userId: text("user_id").primaryKey(),
  username: text().notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
