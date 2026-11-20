import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

// Next.js evaluates route modules while collecting build metadata. Do not
// require production secrets during this phase; the Worker still requires
// DATABASE_URL before it can serve database-backed requests.
if (!databaseUrl && !isNextBuild) {
  throw new Error("DATABASE_URL is required at runtime");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool(
    databaseUrl
      ? { connectionString: databaseUrl, max: 5 }
      : { max: 1 },
  );

// Reuse the pool within a Worker isolate / Node.js process.
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
