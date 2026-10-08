// Session cookie: a signed token naming the user. It stops working if the user's password changes.
import { readToken, makeToken, fingerprint } from './_crypto.js';
import { db, findUserById } from './_db.js';
import { getCookie, sessionCookie, SESSION } from './_http.js';

const MAX_AGE = 30 * 86400;

// The signed-in user (with username), or null. Costs nothing when there is no cookie.
export async function currentUser(req) {
  const raw = getCookie(req, SESSION);
  if (!raw) return null;
  const token = readToken(raw);
  if (!token) return null;
  const user = await findUserById(await db(), token.sub);
  return user && fingerprint(user.password_hash) === token.pv ? user : null;
}

export const startSession = (req, res, user) =>
  res.setHeader('Set-Cookie', sessionCookie(req, makeToken(user.id, user.password_hash), MAX_AGE));
export const endSession = (req, res) => res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
