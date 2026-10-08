import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";

function requireSsl(url: string) {
  if (!url || /[?&]sslmode=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: { url: requireSsl(databaseUrl) },
});
