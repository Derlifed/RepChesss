// /api/auth/me | login | signup | logout | forgot | reset
import { send, fail, readJson, sameOrigin, clientIp, siteUrl } from '../_http.js';
import { hashPassword, verifyPassword, dummyHash, newResetToken, sha256 } from '../_crypto.js';
import { db, limited, findUserByEmail, findUserById, publicUser } from '../_db.js';
import { currentUser, startSession, endSession } from '../_session.js';
import { emailEnabled, sendResetEmail } from '../_email.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[a-z0-9_]{3,20}$/;
const NAMEMSG = 'Usernames are 3 to 20 letters, numbers or underscores.';
const TOO_MANY = { error: 'Too many attempts. Wait a few minutes and try again.' };
const BAD_LINK = { error: 'This reset link is invalid or has expired. Request a new one.' };
const clean = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const validEmail = (e) => e.length <= 254 && EMAIL.test(e);
const passwordError = (p) =>
  typeof p !== 'string' || p.length < 8
    ? 'Passwords need at least 8 characters.'
    : p.length > 200
      ? 'Passwords can be at most 200 characters.'
      : '';

const routes = {
  async me(req, res) {
    const user = await currentUser(req);
    return send(res, 200, { user: user ? publicUser(user) : null });
  },

  async signup(req, res) {
    const b = (await readJson(req)) ?? {};
    const email = clean(b.email), username = clean(b.username), pwError = passwordError(b.password);
    if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
    if (!NAME.test(username)) return send(res, 400, { error: NAMEMSG });
    if (pwError) return send(res, 400, { error: pwError });

    const sql = await db();
    if (await limited(sql, `signup:${clientIp(req)}`, 10, 3600)) return send(res, 429, TOO_MANY);
    const [seen] = await sql`SELECT
      (SELECT 1 FROM users WHERE email = ${email}) AS email,
      (SELECT 1 FROM usernames WHERE username = ${username}) AS username`;
    if (seen.email) return send(res, 409, { error: 'An account with that email already exists. Log in instead.' });
    if (seen.username) return send(res, 409, { error: 'That username is taken. Try another one.' });

    const hash = await hashPassword(b.password);
    let row;
    try {
      // One statement, so the account and its username are created together or not at all.
      [row] = await sql`WITH u AS (INSERT INTO users (email, password_hash) VALUES (${email}, ${hash}) RETURNING id)
        INSERT INTO usernames (user_id, username) SELECT id, ${username} FROM u RETURNING user_id`;
    } catch (e) {
      if (e?.code !== '23505') throw e;
      const c = String(e.constraint || '');
      return send(res, 409, {
        error: c.includes('username')
          ? 'That username is taken. Try another one.'
          : c.includes('email')
            ? 'An account with that email already exists. Log in instead.'
            : 'That email or username is already in use.',
      });
    }
    const user = { id: row.user_id, email, username, password_hash: hash };
    startSession(req, res, user);
    return send(res, 201, { user: publicUser(user) });
  },

  async login(req, res) {
    const b = (await readJson(req)) ?? {};
    const email = clean(b.email), password = typeof b.password === 'string' ? b.password : '';
    if (!validEmail(email) || !password || password.length > 200) return send(res, 401, { error: 'Invalid email or password.' });

    const sql = await db();
    if ((await limited(sql, `login:ip:${clientIp(req)}`, 40, 900)) || (await limited(sql, `login:email:${email}`, 10, 900))) {
      return send(res, 429, TOO_MANY);
    }
    const user = await findUserByEmail(sql, email);
    const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash());
    if (!user || !ok) return send(res, 401, { error: 'Invalid email or password.' });
    startSession(req, res, user);
    return send(res, 200, { user: publicUser(user) });
  },

  async logout(req, res) {
    endSession(req, res);
    return send(res, 200, { ok: true });
  },

  async forgot(req, res) {
    const email = clean(((await readJson(req)) ?? {}).email);
    if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
    if (!emailEnabled()) return send(res, 503, { error: 'Password reset by email is not set up yet.' });

    const sql = await db();
    if ((await limited(sql, `forgot:ip:${clientIp(req)}`, 10, 3600)) || (await limited(sql, `forgot:email:${email}`, 3, 3600))) {
      return send(res, 429, TOO_MANY);
    }
    const user = await findUserByEmail(sql, email);
    if (user) {
      const token = newResetToken();
      await sql.transaction([
        sql`DELETE FROM password_resets WHERE user_id = ${user.id} OR expires_at < now()`,
        sql`INSERT INTO password_resets (token_hash, user_id, expires_at)
          VALUES (${sha256(token)}, ${user.id}, now() + interval '1 hour')`,
      ]);
      try {
        await sendResetEmail(email, `${siteUrl(req)}/#reset=${token}`);
      } catch (e) {
        console.error('[auth/forgot] could not send the reset email:', e);
        return send(res, 502, { error: 'We could not send the email right now. Try again later.' });
      }
    }
    // Same answer whether or not the account exists.
    return send(res, 200, { ok: true });
  },

  async reset(req, res) {
    const b = (await readJson(req)) ?? {};
    const token = typeof b.token === 'string' ? b.token : '', pwError = passwordError(b.password);
    if (!/^[\w-]{20,100}$/.test(token)) return send(res, 400, BAD_LINK);
    if (pwError) return send(res, 400, { error: pwError });

    const sql = await db();
    if (await limited(sql, `reset:ip:${clientIp(req)}`, 20, 3600)) return send(res, 429, TOO_MANY);
    // Deleting the row is what makes the link single-use.
    const [t] = await sql`DELETE FROM password_resets WHERE token_hash = ${sha256(token)} AND expires_at > now() RETURNING user_id`;
    if (!t) return send(res, 400, BAD_LINK);

    await sql`UPDATE users SET password_hash = ${await hashPassword(b.password)} WHERE id = ${t.user_id}`;
    await sql`DELETE FROM password_resets WHERE user_id = ${t.user_id}`;
    const user = await findUserById(sql, t.user_id);
    startSession(req, res, user);
    return send(res, 200, { user: publicUser(user) });
  },
};

export default async function handler(req, res) {
  const action = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '').split('/').pop();
  if (!Object.hasOwn(routes, action)) return send(res, 404, { error: 'Not found' });
  const method = action === 'me' ? 'GET' : 'POST';
  if (req.method !== method) {
    res.setHeader('Allow', method);
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  try {
    await routes[action](req, res);
  } catch (e) {
    fail(res, e, `auth/${action}`);
  }
}
