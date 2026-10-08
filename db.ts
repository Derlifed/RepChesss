import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { authConfigured } from "./auth.js";

// Postgres on Neon, added to the Vercel project from the Marketplace, which sets DATABASE_URL.
// Migrations live in netlify/database/migrations and are applied with `npm run db:migrate`.
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

// The placeholder only keeps the module loadable; withDb answers 503 before any query runs without a real URL.
export const db = drizzle(DATABASE_URL || "postgresql://unset@localhost/unset", { schema });

type Handler = (req: Request) => Promise<Response>;

// Wraps an API handler so missing setup and failures come back as JSON the page can show, instead of a crash.
export const withDb =
  (handler: Handler): Handler =>
  async (req) => {
    if (!authConfigured()) {
      return Response.json(
        { error: "Accounts aren't set up yet: set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY and redeploy." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!DATABASE_URL) {
      return Response.json(
        { error: "The database isn't set up yet: connect a Neon Postgres database to the Vercel project and redeploy." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      return await handler(req);
    } catch (e) {
      console.error(e);
      return Response.json(
        { error: "Could not reach the database. Try again in a moment." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
