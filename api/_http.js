// Helpers shared by the API routes. Files starting with "_" are not deployed as routes.

export class ConfigError extends Error {}

export const SESSION = 'rc_session';

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function fail(res, err, tag) {
  if (err instanceof ConfigError) {
    console.error(`[${tag}] not configured: ${err.message}`);
    return send(res, 503, { error: 'Accounts are not available right now. Try again later.' });
  }
  console.error(`[${tag}] unexpected error:`, err);
  return send(res, 500, { error: 'Something went wrong. Try again.' });
}

// Vercel parses JSON bodies into req.body; fall back to reading the stream otherwise.
export async function readJson(req) {
  try {
    let body = req.body;
    if (body === undefined) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks).toString('utf8');
    }
    if (typeof body === 'string' || Buffer.isBuffer(body)) body = JSON.parse(String(body));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

const first = (v) => String(v ?? '').split(',')[0].trim();
export const hostOf = (req) => first(req.headers['x-forwarded-host']) || first(req.headers.host);
export const isHttps = (req) => first(req.headers['x-forwarded-proto']) === 'https';
export const clientIp = (req) =>
  first(req.headers['x-real-ip']) || first(req.headers['x-forwarded-for']) || req.socket?.remoteAddress || 'unknown';

// Reject cross-site requests that change state (the session cookie is also SameSite=Lax).
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === hostOf(req);
    } catch {
      return false;
    }
  }
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

export function getCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export const sessionCookie = (req, value, maxAge) =>
  `${SESSION}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

// Public origin of the site: SITE_URL, else the project's production domain on Vercel, else this request's host.
export function siteUrl(req) {
  const env = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (env) return /^https?:\/\//i.test(env) ? env : `https://${env}`;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `${isHttps(req) ? 'https' : 'http'}://${hostOf(req) || 'localhost:3000'}`;
}
