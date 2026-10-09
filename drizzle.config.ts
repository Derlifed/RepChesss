import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: { url: process.env.DATABASE_URL || process.env.POSTGRES_URL || "" },
});
