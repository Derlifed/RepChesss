import { withDb } from "../db.js";
import { USERNAME, USERNAME_MSG, cleanUsername, getUsername, setUsername, usernameOwner } from "../db-users.js";
import { fail, getUserId, json, readBody, sameOrigin } from "../auth.js";

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
    const userId = await getUserId(req);
    if (!userId) return fail("Unauthorized", 401);
    return json({ username: await getUsername(userId) });
  }

  if (req.method !== "PUT") return fail("Method not allowed", 405);
  if (!sameOrigin(req)) return fail("Forbidden", 403);
  const userId = await getUserId(req);
  if (!userId) return fail("Unauthorized", 401);
  const name = cleanUsername((await readBody(req)).username);
  if (!USERNAME.test(name)) return fail(USERNAME_MSG, 400);
  if (!(await setUsername(userId, name))) return fail("That username is taken.", 409);
  return json({ username: name });
}

// Vercel Function: each exported HTTP method gets the same handler.
export const GET = withDb(handler);
export const PUT = withDb(handler);
