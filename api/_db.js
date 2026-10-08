// Neon Postgres access. Tables are created on first use, so there is nothing to run by hand.
import { neon } from '@neondatabase/serverless';
import { ConfigError } from './_http.js';
import { sha256 } from './_crypto.js';

let sql, ready;

export async function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new ConfigError('DATABASE_URL is not set. Add a Neon Postgres database to the Vercel project.');
  sql ??= neon(url);
  ready ??= sql
    .transaction([
      sql`CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS usernames (
        user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        username text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS progress (
        user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS password_resets (
        token_hash text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS rate_limits (
        key text PRIMARY KEY,
        hits integer NOT NULL,
        reset_at timestamptz NOT NULL)`,
    ])
    .catch((e) => {
      ready = undefined;
      throw new ConfigError(`Could not set up the database: ${e.message}`);
    });
  await ready;
  return sql;
}

export async function findUserByEmail(sql, email) {
  const [u] = await sql`SELECT u.id, u.email, u.password_hash, n.username
    FROM users u LEFT JOIN usernames n ON n.user_id = u.id WHERE u.email = ${email}`;
  return u ?? null;
}

export async function findUserById(sql, id) {
  const [u] = await sql`SELECT u.id, u.email, u.password_hash, n.username
    FROM users u LEFT JOIN usernames n ON n.user_id = u.id WHERE u.id = ${id}`;
  return u ?? null;
}

export const publicUser = (u) => ({ id: u.id, email: u.email, username: u.username ?? null });

// Count an attempt under `key`. Returns true once more than `max` attempts happened inside `windowSec`.
// Keys are hashed, so no raw IPs or emails are kept in this table.
export async function limited(sql, key, max, windowSec) {
  const [row] = await sql`
    INSERT INTO rate_limits (key, hits, reset_at)
    VALUES (${sha256(key)}, 1, now() + ${windowSec}::int * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now()
        THEN now() + ${windowSec}::int * interval '1 second' ELSE rate_limits.reset_at END
    RETURNING hits`;
  if (Math.random() < 0.02) await sql`DELETE FROM rate_limits WHERE reset_at < now()`;
  return row.hits > max;
}
