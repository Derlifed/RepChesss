import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

// Vercel's Postgres integrations (Neon, Supabase, etc.) set one of these.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// The pool connects lazily, so a missing connection string only matters once a query runs.
export const db = drizzle({ connection: { connectionString, max: 1 }, schema });

// Mirrors drizzle/migrations so a fresh database works without a separate migrate step.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS "progress" (
  "user_id" text PRIMARY KEY,
  "data" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "usernames" (
  "user_id" text PRIMARY KEY,
  "username" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "accounts" (
  "user_id" text PRIMARY KEY,
  "password_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "sessions" (
  "token_hash" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
`;

let ready: Promise<unknown> | null = null;
const ensureSchema = () =>
  (ready ??= db.execute(sql.raw(SCHEMA)).catch((e) => {
    ready = null;
    throw e;
  }));

type Handler = (req: Request) => Promise<Response>;

// Wraps an API handler so failures come back as JSON the page can show, instead of a crash.
export const withDb =
  (handler: Handler): Handler =>
  async (req) => {
    if (!connectionString) {
      return Response.json(
        { error: "Accounts aren't set up yet: the site has no database. Set DATABASE_URL and redeploy." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      await ensureSchema();
      return await handler(req);
    } catch (e) {
      console.error(e);
      return Response.json(
        { error: "Could not reach the database. Try again in a moment." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
