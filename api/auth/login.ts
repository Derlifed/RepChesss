import { withDb } from "../../db/index.js";
import { publicUser } from "../../db/users.js";
import { authError, fail, json, readBody, sameOrigin, sessionCookies, signIn } from "../../lib/auth.js";

// POST /api/auth/login  { email, password }
async function handler(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const body = await readBody(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("Enter your email and password.", 400);

  const r = await signIn(email, password);
  if (!r.ok) return fail(authError(r), r.status === 429 ? 429 : 401);
  return json({ user: await publicUser(r.data.user) }, 200, sessionCookies(req, r.data));
}

export const POST = withDb(handler);
