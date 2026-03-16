import { Client } from "pg";

import { env } from "@/lib/env";

export async function withDb<T>(handler: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    return await handler(client);
  } finally {
    await client.end();
  }
}

