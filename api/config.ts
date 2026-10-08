import { PUBLISHABLE_KEY, json } from "../auth.js";

// GET /api/config  ->  { publishableKey } so the static page can load Clerk.
// The publishable key is public by design; the secret key never leaves the server.
export const GET = () =>
  PUBLISHABLE_KEY ? json({ publishableKey: PUBLISHABLE_KEY }) : json({ error: "Accounts aren't set up yet." }, 503);
