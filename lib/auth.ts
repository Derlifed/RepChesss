// Supabase Auth, called through its REST API so no extra dependency is needed.
// The browser never sees Supabase tokens: they live in HttpOnly cookies set by this site's API routes.

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const ACCESS = "sb_access";
const REFRESH = "sb_refresh";
const REFRESH_DAYS = 30;

export type AuthUser = { id: string; email: string };

type Tokens = { access_token: string; refresh_token: string; expires_in: number; user: AuthUser };

type Result = { ok: boolean; status: number; data: any };

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase hashes passwords with bcrypt, which only uses the first 72 bytes.
export const PASSWORD_MSG = "Passwords need 8 to 72 characters.";
export const okPassword = (v: unknown): v is string => typeof v === "string" && v.length >= 8 && v.length <= 72;

export const authConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// One call to Supabase Auth (GoTrue). Never throws for HTTP errors; check `ok`.
async function gotrue(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<Result> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// Turns a Supabase Auth error into a message that's fine to show people.
export function authError(r: Result) {
  const code = r.data?.error_code || r.data?.code;
  const messages: Record<string, string> = {
    invalid_credentials: "Invalid email or password.",
    email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
    user_already_exists: "An account with that email already exists. Try logging in.",
    email_exists: "An account with that email already exists. Try logging in.",
    weak_password: "That password is too weak. Try a longer one.",
    email_address_invalid: "That email address doesn't look right.",
    over_email_send_rate_limit: "Too many emails sent. Wait a minute and try again.",
    over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
    signup_disabled: "Sign ups are turned off right now.",
  };
  if (messages[code]) return messages[code];
  if (r.status === 429) return messages.over_request_rate_limit;
  return r.data?.msg || r.data?.error_description || r.data?.message || "Something went wrong. Try again.";
}

export const signUp = (email: string, password: string, username: string, redirectTo: string) =>
  gotrue(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: { email, password, data: { username } },
  });

export const signIn = (email: string, password: string) =>
  gotrue("/token?grant_type=password", { method: "POST", body: { email, password } });

export const updatePassword = (token: string, password: string) =>
  gotrue("/user", { method: "PUT", token, body: { password } });

// scope "global" signs out every device, "others" every device except this one.
export const signOut = (token: string, scope: "global" | "local" | "others" = "local") =>
  gotrue(`/logout?scope=${scope}`, { method: "POST", token });

// ---- Cookies ----

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function cookie(req: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Set-Cookie values that store a Supabase session.
export const sessionCookies = (req: Request, t: Tokens) => [
  cookie(req, ACCESS, t.access_token, t.expires_in),
  cookie(req, REFRESH, t.refresh_token, REFRESH_DAYS * 86400),
];

// Set-Cookie values that clear the session.
export const clearCookies = (req: Request) => [cookie(req, ACCESS, "", 0), cookie(req, REFRESH, "", 0)];

// ---- Sessions ----

export type Session = {
  user: AuthUser;
  token: string;
  // Set-Cookie values to send back when the access token was refreshed during this request.
  cookies: string[];
};

// Returns the signed-in user, refreshing an expired access token when needed, or null.
export async function getSession(req: Request): Promise<Session | null> {
  const access = readCookie(req, ACCESS);
  if (access) {
    const r = await gotrue("/user", { token: access });
    if (r.ok && r.data?.id) return { user: r.data, token: access, cookies: [] };
  }
  const refresh = readCookie(req, REFRESH);
  if (!refresh) return null;
  const r = await gotrue("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refresh } });
  if (!r.ok || !r.data?.access_token) return null;
  return { user: r.data.user, token: r.data.access_token, cookies: sessionCookies(req, r.data) };
}

// ---- Responses ----

// JSON response that is never cached and can carry several Set-Cookie headers.
export function json(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return Response.json(body, { status, headers });
}

export const fail = (error: string, status: number, cookies: string[] = []) => json({ error }, status, cookies);

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
