import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { InvertedIndex } from "../src/inverted-index";
import type { IndexDocument } from "../src/types";

export function doc(id: string, fields: Partial<IndexDocument> = {}): IndexDocument {
  return {
    id,
    url: `https://docs.example.test/${id}`,
    domain: "docs.example.test",
    source_slug: null,
    source_name: null,
    content_type: null,
    section_path: null,
    title: null,
    meta_description: null,
    headings: [],
    body: "",
    language: null,
    published_at: null,
    last_updated_at: null,
    tags: [],
    authority_score: 0,
    ...fields,
  };
}

export function buildIndex(documents: IndexDocument[]): InvertedIndex {
  const index = new InvertedIndex();
  for (const document of documents) index.upsert(document);
  return index;
}

export function tempIndexDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "search-index-test-"));
}

export const ids = (hits: Array<{ id: string }>) => hits.map((hit) => hit.id);
