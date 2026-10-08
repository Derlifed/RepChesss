import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// Both tables are keyed by the Clerk user id (e.g. "user_2abc...").
// Row level security is on with no policies, so only this site's API routes,
// which connect as the database owner, can read them.

export const userProfiles = pgTable.withRLS("user_profiles", {
  userId: text("user_id").primaryKey(),
  username: text().notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// The headline stats get their own columns so they're easy to query (leaderboards, reports).
// `data` holds the trainer's full progress object, which the stats are calculated from.
export const userStats = pgTable.withRLS("user_stats", {
  userId: text("user_id").primaryKey(),
  streak: integer().default(0).notNull(),
  xp: integer().default(0).notNull(),
  completed: integer().default(0).notNull(),
  drillBest: integer("drill_best").default(0).notNull(),
  data: jsonb().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
