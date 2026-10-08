import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// A small, fixed index for browser tests, written with the engine's own
// writer so the tests exercise the real native backend. Test data only.
export const FIXTURE_INDEX_DIR = path.resolve(__dirname, "../../.playwright-index");

const SOURCES = [
  { slug: "react", name: "React Docs", domain: "react.dev", authority: 9 },
  { slug: "mdn", name: "MDN Web Docs", domain: "developer.mozilla.org", authority: 10 },
  { slug: "postgresql", name: "PostgreSQL Docs", domain: "www.postgresql.org", authority: 8 },
];

function document(number: number, source: (typeof SOURCES)[number], title: string, body: string, contentType = "reference") {
  const id = `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  return {
    id,
    url: `https://${source.domain}/fixture/${number}`,
    domain: source.domain,
    source_slug: source.slug,
    source_name: source.name,
    content_type: contentType,
    section_path: `Fixture > ${source.name}`,
    title,
    meta_description: `${title}. Browser-test fixture document ${number}.`,
    headings: [title],
    body,
    language: "en",
    published_at: `2026-0${(number % 9) + 1}-10T00:00:00Z`,
    last_updated_at: "2026-09-20T00:00:00Z",
    word_count: body.split(" ").length,
    code_block_count: number % 4,
    tags: [],
    authority_score: source.authority,
    freshness_status: "fresh",
  };
}

export default function globalSetup() {
  const require = createRequire(__filename);
  const { IndexWriter } = require(path.resolve(__dirname, "../../../../packages/search-engine/dist/store.js"));
  rmSync(FIXTURE_INDEX_DIR, { recursive: true, force: true });
  mkdirSync(FIXTURE_INDEX_DIR, { recursive: true });

  const [react, mdn, postgresql] = SOURCES;
  const documents = [
    document(1, react, "useState – React", "useState is a React Hook that lets you add a state variable to your component. Call useState at the top level."),
    document(2, react, "useEffect – React", "useEffect is a React Hook that lets you synchronize a component with an external system and return a cleanup function."),
    document(3, mdn, "Array.prototype.map() – MDN", "The map method of Array instances creates a new array populated with the results of calling a function on every element. State is not involved."),
    document(4, postgresql, "Window Functions – PostgreSQL", "A window function performs a calculation across a set of table rows that are related to the current row."),
    // Enough matches for "hook" to need a second page.
    ...Array.from({ length: 23 }, (_, index) => document(10 + index, react, `Hook pattern ${index + 1} – React`, `A guide to hook pattern ${index + 1} covering state and effects in a component.`, "guide")),
  ];
  new IndexWriter(FIXTURE_INDEX_DIR).replace(documents.map((doc) => ({ op: "upsert", doc })));
}
