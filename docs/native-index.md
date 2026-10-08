# Native index: format and operations

The crawler publishes the searchable corpus to a directory that the web server's search engine reads. PostgreSQL remains the source of truth; everything in this directory can be regenerated from it.

## Layout

```text
SEARCH_INDEX_DIR/
  manifest.json                         replaced atomically
  manifest.lock                         present only while a writer is publishing
  batches/<generation>-<seq>.jsonl      immutable, one operation per line
```

Both the crawler and the web server default to `<repository>/data/search-index` when `SEARCH_INDEX_DIR` is unset.

### Manifest

```json
{
  "formatVersion": 1,
  "generation": "g1a1178ade9a2c33d4",
  "revision": 204,
  "updatedAt": "2026-10-07T19:21:01.849Z",
  "batches": [
    { "seq": 1, "file": "batches/g1a1178ade9a2c33d4-00000001.jsonl", "sha256": "…", "bytes": 3481122, "upserts": 212, "deletes": 0, "createdAt": "…" }
  ]
}
```

- `generation` changes when the batch list is rewritten (rebuild, compaction). Readers that see a new generation load it from scratch and swap when done.
- `revision` increases by one on every manifest write.
- `batches[].seq` is contiguous from 1. Readers apply batches in order.

### Batch

UTF-8 JSON Lines, at most 250 operations:

```json
{"op":"upsert","doc":{"id":"…","url":"…","title":"…","headings":["…"],"body":"…","source_slug":"react", "…":"…"}}
{"op":"delete","id":"…"}
```

An upsert replaces any earlier document with the same id. A delete is a tombstone.

## Write protocol

1. Create `manifest.lock` exclusively. A lock older than 60 seconds is treated as abandoned; long operations refresh it.
2. Write each batch to a temporary file, `fsync`, rename into `batches/`, and `fsync` the directory.
3. Write the new manifest the same way and rename it over `manifest.json`.
4. Remove the lock.

A crash at any step leaves the previous manifest in place. Batch files it never referenced are harmless and are removed by pruning.

The production writer is the crawler (`services/crawler/app/indexer/native.py`). `packages/search-engine/src/store.ts` implements the same protocol for tests and tooling, and a test in each language checks that the Node engine reads what Python publishes.

## Read protocol

For each batch the reader checks the byte length and SHA-256 against the manifest and parses every line before applying anything. On failure it keeps its current state, records the error, and retries on the next poll. Batch paths that are absolute or contain `..` are rejected.

## Commands

Run from the repository root with the crawler's environment (`DATABASE_URL`, optionally `SEARCH_INDEX_DIR`).

| Task | Command |
|---|---|
| Publish documents stored but not yet indexed | `python services/crawler/scripts/publish_pending.py` |
| Rebuild the whole index from PostgreSQL (streaming) | `python services/crawler/scripts/rebuild_index.py` |
| Export a deterministic sample elsewhere | `python services/crawler/scripts/rebuild_index.py --limit 5000 --out data/bench/5000` |
| Fold replacements and tombstones into a new generation | `python services/crawler/scripts/compact_index.py` |
| Also delete batch files no manifest references | `python services/crawler/scripts/compact_index.py --prune` |
| Verify every batch and count live documents | `node packages/search-engine/dist/cli.js verify data/search-index` |
| Run one query without the web server | `node packages/search-engine/dist/cli.js search data/search-index "window functions"` |
| Show how a document's score was computed | `node packages/search-engine/dist/cli.js explain data/search-index "<query>" <document id>` |
| Report and reconcile the corpus | `python services/crawler/scripts/corpus_report.py --since <crawl start> --base-url http://localhost:3000` |

`rebuild_index.py` streams rows through a server-side cursor, so memory does not grow with the corpus. A full rebuild of the live index marks the exported documents `indexed`; a sample written with `--out` or `--limit` leaves PostgreSQL untouched.

`--prune` keeps unreferenced files newer than `--grace-seconds` (default one hour) so a reader still loading the previous generation can finish.

## Recovery

| Situation | What happens | What to do |
|---|---|---|
| Crawler interrupted | Fetched documents stay `stored` | Run the crawler again, or `publish_pending.py` |
| Publication failed (disk, permissions) | The batch's documents become `index_failed`; nothing is marked `indexed` | Fix the cause, then `publish_pending.py` |
| Batch file corrupt or truncated | Readers stop at the previous revision and report the error in `/api/status` | `rebuild_index.py` |
| Manifest unreadable | Readers keep serving what they have loaded | `rebuild_index.py` |
| Index directory lost | Search returns `503` (`missing`) | `rebuild_index.py` |
| Many small batches after a long crawl | Startup reads more files than needed | `compact_index.py --prune` |

## Synthetic fixture

`python services/crawler/scripts/generate_demo_corpus.py` writes a deterministic 10,000-document index to `data/search-index-synthetic`. It is generated test data: it never touches PostgreSQL or the real index, every document is labeled synthetic, and it is not evidence of crawl scale. Point `SEARCH_INDEX_DIR` at it to exercise the engine at a fixed size (`scripts/local-demo-10k.sh`).
