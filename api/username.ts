import { withDb } from "../db/index.js";
import { USERNAME, USERNAME_MSG, cleanUsername, getUsername, setUsername, usernameOwner } from "../db/users.js";
import { fail, getSession, json, readBody, sameOrigin } from "../lib/auth.js";

// GET /api/username?check=name  ->  { available, valid }
// GET /api/username             ->  { username } for the signed-in user
// PUT /api/username  { username }
async function handler(req: Request) {
  if (req.method === "GET") {
    const check = new URL(req.url).searchParams.get("check");
    if (check !== null) {
      const name = cleanUsername(check);
      if (!USERNAME.test(name)) return json({ available: false, valid: false });
      return json({ available: !(await usernameOwner(name)), valid: true });
    }
    const session = await getSession(req);
    if (!session) return fail("Unauthorized", 401);
    return json({ username: await getUsername(session.user.id) }, 200, session.cookies);
  }

  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const session = await getSession(req);
  if (!session) return fail("Unauthorized", 401);
  const name = cleanUsername((await readBody(req)).username);
  if (!USERNAME.test(name)) return fail(USERNAME_MSG, 400, session.cookies);
  if (!(await setUsername(session.user.id, name))) return fail("That username is taken.", 409, session.cookies);
  return json({ username: name }, 200, session.cookies);
}

const route = withDb(handler);
export { route as GET, route as PUT };
