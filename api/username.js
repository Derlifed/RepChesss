import { send, fail, readJson } from './_http.js';
import { getSupabaseAnon } from './_supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const username = new URL(req.url, 'http://localhost').searchParams.get('check')?.toLowerCase().trim();
      if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
        return send(res, 400, { error: 'Invalid username.' });
      }

      const sb = getSupabaseAnon();
      const { data, error } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return send(res, 200, { available: !data });
    }

    if (req.method === 'PUT') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return send(res, 401, { error: 'Unauthorized' });

      const body = await readJson(req);
      const username = String(body?.username ?? '').toLowerCase().trim();
      if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
        return send(res, 400, { error: 'Usernames are 3 to 20 letters, numbers or underscores.' });
      }

      const sb = getSupabaseAnon();
      const { data: userData, error: userError } = await sb.auth.getUser(token);
      if (userError || !userData.user) return send(res, 401, { error: 'Unauthorized' });

      const { error } = await sb.from('profiles').update({ username }).eq('id', userData.user.id);
      if (error) {
        if (String(error.message || '').toLowerCase().includes('duplicate')) {
          return send(res, 409, { error: 'That username is taken. Try another one.' });
        }
        throw error;
      }

      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e, 'username');
  }
}
