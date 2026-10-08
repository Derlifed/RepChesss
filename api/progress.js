import { send, fail, readJson } from './_http.js';
import { getSupabaseAnon } from './_supabase.js';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return send(res, 401, { error: 'Unauthorized' });

  try {
    const sb = getSupabaseAnon();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return send(res, 401, { error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { data: saved, error: lookupError } = await sb
        .from('progress')
        .select('data')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (lookupError && lookupError.code !== 'PGRST116') throw lookupError;
      return send(res, 200, { data: saved?.data ?? null });
    }

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const { error: upsertError } = await sb
        .from('progress')
        .upsert({ user_id: data.user.id, data: body?.data ?? {} }, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e, 'progress');
  }
}
