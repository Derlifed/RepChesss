import { defineConfig } from "drizzle-kit";

// Use the non-pooled Vercel Postgres connection for migrations. The pooled
// Prisma URL can negotiate a non-SSL connection with drizzle-kit, while the
// database requires SSL for every connection.
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

function requireSsl(url: string) {
  if (!url) return url;
  if (/[?&]sslmode=/i.test(url)) {
    return url.replace(/([?&]sslmode=)[^&]*/i, "$1require");
  }
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: { url: requireSsl(databaseUrl) },
});
