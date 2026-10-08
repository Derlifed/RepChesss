// /api/auth/me | login | signup | logout | forgot | reset
import { send, fail, readJson, sameOrigin, siteUrl } from '../_http.js';
import { getSupabaseAnon, getSupabaseAdmin } from '../_supabase.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[a-z0-9_]{3,20}$/;
const NAMEMSG = 'Usernames are 3 to 20 letters, numbers or underscores.';
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
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return send(res, 200, { user: null });

    try {
      const sb = getSupabaseAnon();
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return send(res, 200, { user: null });

      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('id, email, username')
        .eq('id', data.user.id)
        .maybeSingle();

      const user = profile || { id: data.user.id, email: data.user.email, username: data.user.user_metadata?.username ?? null };
      return send(res, 200, { user });
    } catch {
      return send(res, 200, { user: null });
    }
  },

  async signup(req, res) {
    const b = (await readJson(req)) ?? {};
    const email = clean(b.email);
    const username = clean(b.username);
    const pwError = passwordError(b.password);

    if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
    if (!NAME.test(username)) return send(res, 400, { error: NAMEMSG });
    if (pwError) return send(res, 400, { error: pwError });

    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: b.password,
        email_confirm: true,
        user_metadata: { username },
      });

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('already')) {
          return send(res, 409, { error: 'An account with that email already exists. Log in instead.' });
        }
        if (msg.includes('username')) {
          return send(res, 409, { error: 'That username is taken. Try another one.' });
        }
        return send(res, 400, { error: error.message || 'Could not create the account.' });
      }

      const user = { id: data.user.id, email: data.user.email, username };
      const { error: profileErr } = await sb.from('profiles').upsert([{ id: user.id, email: user.email, username: user.username }]);
      if (profileErr) {
        if (String(profileErr.message || '').toLowerCase().includes('username')) {
          return send(res, 409, { error: 'That username is taken. Try another one.' });
        }
        throw profileErr;
      }

      return send(res, 201, { user });
    } catch (e) {
      fail(res, e, 'auth/signup');
    }
  },

  async login(req, res) {
    const b = (await readJson(req)) ?? {};
    const email = clean(b.email);
    const password = typeof b.password === 'string' ? b.password : '';

    if (!validEmail(email) || !password || password.length > 200) {
      return send(res, 401, { error: 'Invalid email or password.' });
    }

    try {
      const sb = getSupabaseAnon();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.user) return send(res, 401, { error: 'Invalid email or password.' });

      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .maybeSingle();

      const user = {
        id: data.user.id,
        email: data.user.email,
        username: profile?.username ?? data.user.user_metadata?.username ?? null,
      };

      return send(res, 200, { user });
    } catch (e) {
      fail(res, e, 'auth/login');
    }
  },

  async logout(req, res) {
    return send(res, 200, { ok: true });
  },

  async forgot(req, res) {
    const email = clean(((await readJson(req)) ?? {}).email);
    if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });

    try {
      const sb = getSupabaseAnon();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl(req)}/#reset`,
      });
      if (error && !String(error.message || '').toLowerCase().includes('not found')) throw error;
      return send(res, 200, { ok: true });
    } catch (e) {
      fail(res, e, 'auth/forgot');
    }
  },

  async reset(req, res) {
    const b = (await readJson(req)) ?? {};
    const token = typeof b.token === 'string' ? b.token : '';
    const pwError = passwordError(b.password);
    if (!token || !/^[\w-]{20,200}$/.test(token)) return send(res, 400, BAD_LINK);
    if (pwError) return send(res, 400, { error: pwError });

    try {
      const sb = getSupabaseAnon();
      const { data, error } = await sb.auth.exchangeCodeForSession(token);
      if (error || !data.session) return send(res, 400, BAD_LINK);

      const update = await sb.auth.updateUser({ password: b.password });
      if (update.error) throw update.error;

      return send(res, 200, { user: { id: data.user.id, email: data.user.email, username: data.user.user_metadata?.username ?? null } });
    } catch (e) {
      fail(res, e, 'auth/reset');
    }
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
