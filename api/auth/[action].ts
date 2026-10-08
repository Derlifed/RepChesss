import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, withDb } from "../../db/index.js";
import { accounts, sessions, usernames } from "../../db/schema.js";
import { checkPassword, endSession, getUserId, hashPassword, sameOrigin, startSession } from "../../db/auth.js";

// Usernames are stored lowercase so "Magnus" and "magnus" can't both exist.
const VALID = /^[a-z0-9_]{3,20}$/;
const clean = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const okPassword = (v: unknown): v is string => typeof v === "string" && v.length >= 8 && v.length <= 200;
const PASSWORD_MSG = "Passwords need 8 to 200 characters.";
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });
const withCookie = (body: object, setCookie: string) =>
  Response.json(body, { headers: { ...noStore, "Set-Cookie": setCookie } });

const findByName = async (username: string) =>
  (
    await db
      .select({ userId: usernames.userId, passwordHash: accounts.passwordHash })
      .from(usernames)
      .leftJoin(accounts, eq(accounts.userId, usernames.userId))
      .where(eq(usernames.username, username))
  )[0];

const passwordOf = async (userId: string) =>
  (await db.select({ hash: accounts.passwordHash }).from(accounts).where(eq(accounts.userId, userId)))[0]?.hash;

async function handler(req: Request) {
  const action = new URL(req.url).pathname.split("/").pop();

  if (req.method === "GET" && action === "me") {
    const userId = await getUserId(req);
    if (!userId) return Response.json({ user: null }, { headers: noStore });
    const [row] = await db.select().from(usernames).where(eq(usernames.userId, userId));
    return Response.json({ user: { id: userId, username: row?.username ?? null } }, { headers: noStore });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!sameOrigin(req)) return fail("Forbidden", 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    if (action !== "logout") return fail("Invalid JSON", 400);
  }

  if (action === "signup") {
    const username = clean(body.username);
    if (!VALID.test(username)) return fail("Usernames are 3 to 20 letters, numbers or underscores.", 400);
    if (!okPassword(body.password)) return fail(PASSWORD_MSG, 400);
    const existing = await findByName(username);
    if (existing?.passwordHash) return fail("That username is taken. Try another one.", 409);
    // A username without a password belongs to an old account from the previous login system; release it.
    if (existing) await db.delete(usernames).where(eq(usernames.userId, existing.userId));
    const userId = randomUUID();
    try {
      await db.insert(usernames).values({ userId, username });
    } catch {
      // A unique violation here means someone claimed it between the check and the write.
      return fail("That username is taken. Try another one.", 409);
    }
    await db.insert(accounts).values({ userId, passwordHash: await hashPassword(body.password) });
    return withCookie({ user: { id: userId, username } }, await startSession(req, userId));
  }

  if (action === "login") {
    const username = clean(body.username);
    const password = typeof body.password === "string" ? body.password : "";
    const found = VALID.test(username) ? await findByName(username) : undefined;
    if (!found?.passwordHash || !(await checkPassword(password, found.passwordHash))) {
      return fail("Invalid username or password.", 401);
    }
    return withCookie({ user: { id: found.userId, username } }, await startSession(req, found.userId));
  }

  if (action === "logout") return withCookie({ ok: true }, await endSession(req));

  if (action === "password") {
    const userId = await getUserId(req);
    if (!userId) return fail("Unauthorized", 401);
    const hash = await passwordOf(userId);
    const current = typeof body.current === "string" ? body.current : "";
    if (!hash || !(await checkPassword(current, hash))) return fail("Your current password is wrong.", 401);
    if (!okPassword(body.password)) return fail(PASSWORD_MSG, 400);
    await db.update(accounts).set({ passwordHash: await hashPassword(body.password) }).where(eq(accounts.userId, userId));
    // Sign out every other device, then start a fresh session here.
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return withCookie({ ok: true }, await startSession(req, userId));
  }

  return fail("Not found", 404);
}

const route = withDb(handler);
export { route as GET, route as POST };
