import type { Config } from "@netlify/functions";
import { withDb } from "../../db/index.js";
import { getStats, saveStats } from "../../db/stats.js";
import { fail, getUserId, json, sameOrigin } from "../../lib/auth.js";

const MAX_BYTES = 2_000_000;

// GET /api/stats  ->  { data, stats } for the signed-in user (both null before the first save)
// PUT /api/stats  { data }  ->  { stats }
async function handler(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return fail("Unauthorized", 401);

  if (req.method === "GET") {
    const row = await getStats(userId);
    const stats = row && { streak: row.streak, xp: row.xp, completed: row.completed, drillBest: row.drillBest };
    return json({ data: row?.data ?? null, stats });
  }

  if (req.method !== "PUT") return fail("Method not allowed", 405);
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const body = await req.text();
  if (body.length > MAX_BYTES) return fail("Too large", 413);
  let data: unknown;
  try {
    data = JSON.parse(body)?.data;
  } catch {
    return fail("Invalid JSON", 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("Invalid progress", 400);
  return json({ stats: await saveStats(userId, data as Record<string, unknown>) });
}

export default withDb(handler);

export const config: Config = { path: "/api/stats" };
