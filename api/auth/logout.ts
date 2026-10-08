import { withDb } from "../../db/index.js";
import { clearCookies, fail, getSession, json, sameOrigin, signOut } from "../../lib/auth.js";

// POST /api/auth/logout
async function handler(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const session = await getSession(req);
  // Revokes the refresh token in Supabase too; the cookies are cleared either way.
  if (session) await signOut(session.token).catch(() => {});
  return json({ ok: true }, 200, clearCookies(req));
}

export const POST = withDb(handler);
