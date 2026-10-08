import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db } from "./index.js";
import { sessions } from "./schema.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "rc_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function checkPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scryptAsync(password, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(got, want);
}

const sha = (token: string) => createHash("sha256").update(token).digest("hex");

function readCookie(req: Request) {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return "";
}

const cookie = (req: Request, value: string, maxAge: number) => {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};

// Creates a session and returns the Set-Cookie header value for it.
export async function startSession(req: Request, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ tokenHash: sha(token), userId, expiresAt });
  return cookie(req, token, SESSION_DAYS * 86400);
}

// Deletes the current session and returns a Set-Cookie header that clears it.
export async function endSession(req: Request) {
  const token = readCookie(req);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  return cookie(req, "", 0);
}

// Returns the signed-in user's id, or null.
export async function getUserId(req: Request) {
  const token = readCookie(req);
  if (!token) return null;
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date())));
  return row?.userId ?? null;
}

// Rejects state-changing requests sent from other sites.
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}
