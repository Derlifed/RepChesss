import { eq } from "drizzle-orm";
import { db, withDb } from "../db/index.js";
import { getUserId, sameOrigin } from "../db/auth.js";
import { usernames } from "../db/schema.js";

// Usernames are stored lowercase so "Magnus" and "magnus" can't both exist.
const VALID = /^[a-z0-9_]{3,20}$/;
const clean = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const taken = async (name: string) =>
  (await db.select({ userId: usernames.userId }).from(usernames).where(eq(usernames.username, name)))[0]?.userId;

async function handler(req: Request) {
  const noStore = { "Cache-Control": "no-store" };

  if (req.method === "GET") {
    const check = new URL(req.url).searchParams.get("check");
    if (check !== null) {
      const name = clean(check);
      if (!VALID.test(name)) return Response.json({ available: false, valid: false }, { headers: noStore });
      return Response.json({ available: !(await taken(name)), valid: true }, { headers: noStore });
    }
    const userId = await getUserId(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const [row] = await db.select().from(usernames).where(eq(usernames.userId, userId));
    return Response.json({ username: row?.username ?? null }, { headers: noStore });
  }

  if (req.method === "PUT") {
    const userId = await getUserId(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
    let name = "";
    try {
      name = clean((await req.json())?.username);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!VALID.test(name)) {
      return Response.json({ error: "Usernames are 3 to 20 letters, numbers or underscores." }, { status: 400 });
    }
    const owner = await taken(name);
    if (owner && owner !== userId) return Response.json({ error: "That username is taken." }, { status: 409 });
    try {
      await db
        .insert(usernames)
        .values({ userId, username: name })
        .onConflictDoUpdate({ target: usernames.userId, set: { username: name } });
    } catch {
      // A unique violation here means someone claimed it between the check and the write.
      return Response.json({ error: "That username is taken." }, { status: 409 });
    }
    return Response.json({ username: name });
  }

  return new Response("Method not allowed", { status: 405 });
}

const route = withDb(handler);
export { route as GET, route as PUT };
