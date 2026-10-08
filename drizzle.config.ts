// A plain config object, so loading this file doesn't depend on resolving drizzle-kit itself.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export default {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "drizzle/migrations",
  ...(url ? { dbCredentials: { url } } : {}),
};
