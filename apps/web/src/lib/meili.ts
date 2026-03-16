import { MeiliSearch } from "meilisearch";

import { env } from "@/lib/env";

let client: MeiliSearch | null = null;

export function getMeiliClient() {
  if (!client) {
    client = new MeiliSearch({
      host: env.meiliHost,
      apiKey: env.meiliMasterKey,
    });
  }
  return client;
}

export function getDocumentsIndex() {
  return getMeiliClient().index(env.meiliIndexName);
}
