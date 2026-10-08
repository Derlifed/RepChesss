// Password hashing and signed session tokens, using only Node's built-in crypto.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ConfigError } from './_http.js';

const scrypt = promisify(crypto.scrypt);
const N = 2 ** 15, R = 8, P = 3, KEYLEN = 32; // OWASP-recommended scrypt settings (32 MiB)
const run = (password, salt, len, n, r, p) =>
  scrypt(password.normalize('NFKC'), salt, len, { N: n, r, p, maxmem: 256 * n * r });

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Changes whenever the password changes, so old sessions stop working after a reset.
export const fingerprint = (hash) => sha256(hash).slice(0, 16);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await run(password, salt, KEYLEN, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  try {
    const got = await run(password, Buffer.from(salt, 'base64url'), want.length, +n, +r, +p);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

// Checked when an email has no account, so "no such account" takes as long as "wrong password".
let dummy;
export const dummyHash = () => (dummy ??= hashPassword(crypto.randomBytes(16).toString('hex')));

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new ConfigError('AUTH_SECRET is missing or too short (use at least 16 random characters).');
  return s;
};
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function makeToken(userId, passwordHash, days = 30) {
  const body = Buffer.from(
    JSON.stringify({ sub: userId, pv: fingerprint(passwordHash), exp: Math.floor(Date.now() / 1000) + days * 86400 }),
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return t && typeof t.sub === 'string' && t.exp > Date.now() / 1000 ? t : null;
  } catch {
    return null;
  }
}

export const newResetToken = () => crypto.randomBytes(32).toString('base64url');
