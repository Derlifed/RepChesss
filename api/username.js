// /api/username: GET ?check=name (is it free?), GET (mine), PUT (set or change mine).
import { send, fail, readJson, sameOrigin } from './_http.js';
import { db } from './_db.js';
import { currentUser } from './_session.js';

// Usernames are stored lowercase so "Magnus" and "magnus" can't both exist.
const VALID = /^[a-z0-9_]{3,20}$/;
const clean = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const sql = await db();
    const taken = async (name) => (await sql`SELECT user_id FROM usernames WHERE username = ${name}`)[0]?.user_id;

    if (req.method === 'GET') {
      const check = new URL(req.url, 'http://localhost').searchParams.get('check');
      if (check !== null) {
        const name = clean(check);
        if (!VALID.test(name)) return send(res, 200, { available: false, valid: false });
        return send(res, 200, { available: !(await taken(name)), valid: true });
      }
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'Unauthorized' });
      return send(res, 200, { username: user.username ?? null });
    }

    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const name = clean(body.username);
    if (!VALID.test(name)) return send(res, 400, { error: 'Usernames are 3 to 20 letters, numbers or underscores.' });
    const owner = await taken(name);
    if (owner && owner !== user.id) return send(res, 409, { error: 'That username is taken.' });
    try {
      await sql`INSERT INTO usernames (user_id, username) VALUES (${user.id}, ${name})
        ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`;
    } catch (e) {
      if (e?.code === '23505') return send(res, 409, { error: 'That username is taken.' }); // claimed between the check and the write
      throw e;
    }
    return send(res, 200, { username: name });
  } catch (e) {
    return fail(res, e, 'username');
  }
}
