import { Pool, type PoolClient } from "pg";

import { env } from "@/lib/env";
import { withTimeout } from "@/lib/api";

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: env.databaseTimeoutMs,
      statement_timeout: env.databaseTimeoutMs,
    });
  }
  return pool;
}

export async function withDb<T>(handler: (client: PoolClient) => Promise<T>) {
  const client = await withTimeout(getPool().connect(), env.databaseTimeoutMs, "database");
  try {
    return await withTimeout(handler(client), env.databaseTimeoutMs, "database");
  } finally {
    client.release();
  }
}

export async function closeDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
