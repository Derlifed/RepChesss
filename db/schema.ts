import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

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

// Accounts are keyed by the same user_id as usernames and progress.
export const accounts = pgTable("accounts", {
  userId: text("user_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Only a SHA-256 hash of each session token is stored, never the token itself.
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);
