import { withDb } from "../../db/index.js";
import { PASSWORD_MSG, authError, fail, getSession, json, readBody, sameOrigin, sessionCookies, signIn, signOut, okPassword, updatePassword } from "../../lib/auth.js";

// POST /api/auth/password  { current, password }
async function handler(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const session = await getSession(req);
  if (!session) return fail("Unauthorized", 401);
  const body = await readBody(req);
  if (!okPassword(body.password)) return fail(PASSWORD_MSG, 400, session.cookies);

  // Supabase doesn't ask for the current password, so check it by signing in with it.
  const check = await signIn(session.user.email, typeof body.current === "string" ? body.current : "");
  if (!check.ok) return fail("Your current password is wrong.", 401, session.cookies);

  const r = await updatePassword(check.data.access_token, body.password);
  if (!r.ok) return fail(authError(r), 400, sessionCookies(req, check.data));
  // Sign out every other device and keep this one on the fresh session.
  await signOut(check.data.access_token, "others").catch(() => {});
  return json({ ok: true }, 200, sessionCookies(req, check.data));
}

export const POST = withDb(handler);
