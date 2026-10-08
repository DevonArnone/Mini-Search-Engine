import { env } from "@/lib/env";
import { getNativeEngine } from "@/lib/native-engine";

if (env.searchBackend === "native") {
  try {
    getNativeEngine().start();
  } catch (error) {
    console.error("search engine worker failed to start", error);
  }
}
