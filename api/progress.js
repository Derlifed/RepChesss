// Save/load user progress. Requires Bearer token in Authorization header.
import { send, fail, readJson } from './_http.js';
import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return send(res, 401, { error: 'Unauthorized' });

  try {
    const sb = getSupabase();
    const { data: authUser, error: authError } = await sb.auth.getUser(token);
    if (authError || !authUser.user) return send(res, 401, { error: 'Unauthorized' });

    const userId = authUser.user.id;

    if (req.method === 'GET') {
      const { data, error } = await sb.from('progress').select('data').eq('user_id', userId).single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return send(res, 200, { data: data?.data ?? null });
    }

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const { error } = await sb.from('progress').upsert({ user_id: userId, data: body.data });
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e, 'progress');
  }
}
