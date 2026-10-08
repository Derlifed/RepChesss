import { withDb } from "../../db/index.js";
import { USERNAME, USERNAME_MSG, cleanUsername, setUsername, usernameOwner } from "../../db/users.js";
import { EMAIL, PASSWORD_MSG, authError, fail, json, okPassword, readBody, sameOrigin, sessionCookies, signUp } from "../../lib/auth.js";

// POST /api/auth/signup  { username, email, password }
async function handler(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const body = await readBody(req);
  const username = cleanUsername(body.username);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!USERNAME.test(username)) return fail(USERNAME_MSG, 400);
  if (!EMAIL.test(email)) return fail("Enter a valid email address.", 400);
  if (!okPassword(body.password)) return fail(PASSWORD_MSG, 400);
  // Check first so a taken username doesn't leave a half-made Supabase account behind.
  if (await usernameOwner(username)) return fail("That username is taken. Try another one.", 409);

  const r = await signUp(email, body.password, username, new URL("/", req.url).href);
  if (!r.ok) return fail(authError(r), r.status === 429 ? 429 : 400);

  // With email confirmation on, Supabase returns just the user and no session.
  const user = r.data.user ?? r.data;
  // An existing email comes back as a placeholder user with no identities, so nobody can probe for accounts.
  if (!user?.id || (Array.isArray(user.identities) && user.identities.length === 0)) {
    return fail("An account with that email already exists. Try logging in.", 409);
  }
  if (!(await setUsername(user.id, username))) return fail("That username is taken. Try another one.", 409);

  if (!r.data.access_token) {
    return json({ confirm: true, message: `Almost done! We sent a confirmation link to ${email}. Open it, then log in.` });
  }
  return json({ user: { id: user.id, email: user.email, username } }, 200, sessionCookies(req, r.data));
}

export const POST = withDb(handler);
