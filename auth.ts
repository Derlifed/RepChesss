// Clerk handles sign up, log in, passwords and sessions. The page loads Clerk's browser SDK
// and sends the session token with every API call; these helpers verify it on the server.
import { createClerkClient } from "@clerk/backend";

const SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
// Accepts the Next.js-style name too, since Clerk's dashboard hands out keys under that name.
export const PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

const clerk = createClerkClient({ secretKey: SECRET_KEY, publishableKey: PUBLISHABLE_KEY });

export const authConfigured = () => Boolean(SECRET_KEY && PUBLISHABLE_KEY);

// Returns the signed-in Clerk user id, or null. Reads the `Authorization: Bearer` header
// (or Clerk's `__session` cookie) and only accepts tokens issued for this site's origin.
export async function getUserId(req: Request): Promise<string | null> {
  const state = await clerk.authenticateRequest(req, { authorizedParties: [new URL(req.url).origin] });
  return state.isAuthenticated ? state.toAuth().userId : null;
}

// ---- Responses ----

// JSON response that is never cached.
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (error: string, status: number) => json({ error }, status);

// Rejects state-changing requests sent from other sites.
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

// Reads a JSON body, returning {} when it's missing or invalid.
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
