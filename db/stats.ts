import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { userStats } from "./schema.js";

type Progress = { streak?: unknown; xp?: unknown; best?: unknown; ln?: unknown };

const count = (v: unknown) => (Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v as number), 0), 2_147_483_647) : 0);

// Works out the headline stats from the trainer's progress object, the same way the home page does.
export function statsFrom(data: Progress) {
  const ln = data.ln && typeof data.ln === "object" ? Object.values(data.ln) : [];
  return {
    streak: count(data.streak),
    xp: count(data.xp),
    drillBest: count(data.best),
    completed: ln.filter((n) => count(n) > 0).length,
  };
}

export async function getStats(userId: string) {
  const [row] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  return row ?? null;
}

// Saves a user's progress and refreshes their stat columns.
export async function saveStats(userId: string, data: Record<string, unknown>) {
  const stats = statsFrom(data);
  await db
    .insert(userStats)
    .values({ userId, data, ...stats })
    .onConflictDoUpdate({ target: userStats.userId, set: { data, ...stats, updatedAt: new Date() } });
  return stats;
}
