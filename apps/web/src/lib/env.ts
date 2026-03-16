export const env = {
  meiliHost: process.env.MEILI_HOST ?? "http://localhost:7700",
  meiliMasterKey: process.env.MEILI_MASTER_KEY ?? "mini_search_master_key",
  meiliIndexName: "documents",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://mini_search:mini_search@localhost:5432/mini_search",
};

