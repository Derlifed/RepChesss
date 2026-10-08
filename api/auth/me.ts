import { withDb } from "../../db/index.js";
import { publicUser } from "../../db/users.js";
import { getSession, json } from "../../lib/auth.js";

// GET /api/auth/me  ->  { user } or { user: null }
async function handler(req: Request) {
  const session = await getSession(req);
  if (!session) return json({ user: null });
  return json({ user: await publicUser(session.user) }, 200, session.cookies);
}

export const GET = withDb(handler);
