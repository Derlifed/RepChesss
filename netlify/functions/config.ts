import type { Config } from "@netlify/functions";
import { PUBLISHABLE_KEY, json } from "../../lib/auth.js";

// GET /api/config  ->  { publishableKey } so the static page can load Clerk.
// The publishable key is public by design; the secret key never leaves the server.
export default async () =>
  PUBLISHABLE_KEY ? json({ publishableKey: PUBLISHABLE_KEY }) : json({ error: "Accounts aren't set up yet." }, 503);

export const config: Config = { path: "/api/config" };
