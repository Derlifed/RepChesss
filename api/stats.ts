import { withDb } from "../db/index.js";
import { getStats, saveStats } from "../db/stats.js";
import { fail, getSession, json, sameOrigin } from "../lib/auth.js";

const MAX_BYTES = 2_000_000;

// GET /api/stats  ->  { data, stats } for the signed-in user (both null before the first save)
// PUT /api/stats  { data }  ->  { stats }
async function handler(req: Request) {
  const session = await getSession(req);
  if (!session) return fail("Unauthorized", 401);
  const userId = session.user.id;

  if (req.method === "GET") {
    const row = await getStats(userId);
    const stats = row && { streak: row.streak, xp: row.xp, completed: row.completed, drillBest: row.drillBest };
    return json({ data: row?.data ?? null, stats }, 200, session.cookies);
  }

  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const body = await req.text();
  if (body.length > MAX_BYTES) return fail("Too large", 413, session.cookies);
  let data: unknown;
  try {
    data = JSON.parse(body)?.data;
  } catch {
    return fail("Invalid JSON", 400, session.cookies);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("Invalid progress", 400, session.cookies);
  return json({ stats: await saveStats(userId, data as Record<string, unknown>) }, 200, session.cookies);
}

const route = withDb(handler);
export { route as GET, route as PUT };
