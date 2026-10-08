// /api/auth/me | login | signup | logout | forgot | reset
// Supabase Auth backend. The frontend talks to Supabase Auth directly;
// these routes are thin wrappers for server-side operations only.

import { send, fail, readJson, sameOrigin } from '../_http.js';
import { getSupabase } from '../_supabase.js';

const routes = {
  async me(req, res) {
    // Get the current user from the auth header (Bearer token from frontend session).
    const sb = getSupabase();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return send(res, 200, { user: null });

    try {
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return send(res, 200, { user: null });

      // Fetch the user profile from the profiles table.
      const { data: profile } = await sb.from('profiles').select('id, email, username').eq('id', data.user.id).single();
      return send(res, 200, { user: profile ?? { id: data.user.id, email: data.user.email, username: null } });
    } catch (e) {
      console.error('[auth/me] error:', e);
      return send(res, 200, { user: null });
    }
  },

  async signup(req, res) {
    const b = (await readJson(req)) ?? {};
    const { email, password, username } = b;

    if (typeof email !== 'string' || !email.includes('@')) {
      return send(res, 400, { error: 'Enter a valid email address.' });
    }
    if (typeof username !== 'string' || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return send(res, 400, { error: 'Usernames are 3 to 20 letters, numbers or underscores.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return send(res, 400, { error: 'Passwords need at least 8 characters.' });
    }

    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true, // Auto-confirm in dev.
      });

      if (error) {
        if (error.message.includes('already exists')) {
          return send(res, 409, { error: 'An account with that email already exists. Log in instead.' });
        }
        return send(res, 400, { error: error.message });
      }

      // Create a profile entry.
      const { error: profileError } = await sb.from('profiles').insert([
        { id: data.user.id, email: data.user.email, username: username.toLowerCase().trim() },
      ]);

      if (profileError) {
        if (profileError.message.includes('username')) {
          return send(res, 409, { error: 'That username is taken. Try another one.' });
        }
        throw profileError;
      }

      return send(res, 201, {
        user: { id: data.user.id, email: data.user.email, username: username.toLowerCase().trim() },
      });
    } catch (e) {
      fail(res, e, 'auth/signup');
    }
  },

  async login(req, res) {
    const b = (await readJson(req)) ?? {};
    const { email, password } = b;

    if (typeof email !== 'string' || !email.includes('@')) {
      return send(res, 401, { error: 'Invalid email or password.' });
    }
    if (typeof password !== 'string' || !password) {
      return send(res, 401, { error: 'Invalid email or password.' });
    }

    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.admin.signInWithPassword({ email: email.toLowerCase().trim(), password });

      if (error || !data.user) {
        return send(res, 401, { error: 'Invalid email or password.' });
      }

      // Fetch profile.
      const { data: profile } = await sb.from('profiles').select('id, email, username').eq('id', data.user.id).single();

      return send(res, 200, {
        user: profile ?? { id: data.user.id, email: data.user.email, username: null },
        session: data.session,
      });
    } catch (e) {
      fail(res, e, 'auth/login');
    }
  },

  async logout(req, res) {
    // Logout is client-side (clear the session from Supabase). This is a no-op.
    return send(res, 200, { ok: true });
  },

  async forgot(req, res) {
    const { email } = (await readJson(req)) ?? {};

    if (typeof email !== 'string' || !email.includes('@')) {
      return send(res, 400, { error: 'Enter a valid email address.' });
    }

    try {
      const sb = getSupabase();
      const { error } = await sb.auth.admin.generateLink({
        type: 'recovery',
        email: email.toLowerCase().trim(),
      });

      if (error && !error.message.includes('not found')) {
        throw error;
      }

      // Always return success, whether or not the account exists.
      return send(res, 200, { ok: true });
    } catch (e) {
      fail(res, e, 'auth/forgot');
    }
  },

  async reset(req, res) {
    return send(res, 500, { error: 'Password reset via this endpoint is not supported. Use the recovery link sent by email.' });
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
