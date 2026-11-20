import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type HyperdriveBinding = { connectionString: string };

declare global {
  // Set by the Cloudflare Worker entrypoint before a request or scheduled job runs.
  // Local Next.js development continues to use DATABASE_URL.
  var __cryptoSignalHyperdrive: HyperdriveBinding | undefined;
  var __cryptoSignalPool: Pool | undefined;
  var __cryptoSignalDb: ReturnType<typeof drizzle> | undefined;
}

function getDatabase() {
  if (globalThis.__cryptoSignalDb) return globalThis.__cryptoSignalDb;

  const connectionString =
    globalThis.__cryptoSignalHyperdrive?.connectionString ??
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Database connection is unavailable. Bind HYPERDRIVE on Cloudflare or set DATABASE_URL for local development.",
    );
  }

  const pool =
    globalThis.__cryptoSignalPool ??
    new Pool({
      connectionString,
      // Hyperdrive manages the origin-side pool. Keep the per-isolate client
      // pool small so Worker scaling does not create unnecessary connections.
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

  globalThis.__cryptoSignalPool = pool;
  globalThis.__cryptoSignalDb = drizzle(pool);
  return globalThis.__cryptoSignalDb;
}

// Delay database initialization until a query is actually made. This prevents
// build-time route analysis from requiring production credentials.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
