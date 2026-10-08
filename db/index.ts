import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";
import { authConfigured } from "../lib/auth.js";

// Netlify Database: the connection is configured automatically and migrations in
// netlify/database/migrations are applied on deploy.
export const db = drizzle({ schema });

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
