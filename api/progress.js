// /api/progress: the signed-in user's saved progress (GET to load, PUT to save).
import { send, fail, readJson, sameOrigin } from './_http.js';
import { db } from './_db.js';
import { currentUser } from './_session.js';

const MAX_BYTES = 2_000_000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    const sql = await db();

    if (req.method === 'GET') {
      const [row] = await sql`SELECT data FROM progress WHERE user_id = ${user.id}`;
      const data = typeof row?.data === 'string' ? JSON.parse(row.data) : (row?.data ?? null);
      return send(res, 200, { data });
    }

    if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
    const data = (await readJson(req))?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'Invalid progress' });
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return send(res, 413, { error: 'Too large' });
    await sql`INSERT INTO progress (user_id, data) VALUES (${user.id}, ${json}::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    return send(res, 200, { ok: true });
  } catch (e) {
    return fail(res, e, 'progress');
  }
}
