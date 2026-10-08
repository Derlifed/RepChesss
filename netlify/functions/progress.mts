import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { getUserId, sameOrigin } from "../../db/auth.js";
import { progress } from "../../db/schema.js";

const MAX_BYTES = 2_000_000;

export default async (req: Request) => {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (req.method === "GET") {
    const [row] = await db.select().from(progress).where(eq(progress.userId, userId));
    return Response.json({ data: row?.data ?? null }, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.text();
    if (body.length > MAX_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
    let data: unknown;
    try {
      data = JSON.parse(body)?.data;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ error: "Invalid progress" }, { status: 400 });
    }
    await db
      .insert(progress)
      .values({ userId, data })
      .onConflictDoUpdate({ target: progress.userId, set: { data, updatedAt: new Date() } });
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/progress",
  method: ["GET", "PUT"],
};
