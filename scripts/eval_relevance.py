#!/usr/bin/env python3
"""
Relevance evaluation harness for DevDocs Search.

Runs a fixed set of representative queries against the live search API and
checks whether expected top-k documents appear in the results. Outputs a
summary with per-query pass/fail, overall NDCG-like hit rate, and exits
with code 1 if the pass rate falls below a configurable threshold.

Usage:
    python scripts/eval_relevance.py [--base-url http://localhost:3000] [--threshold 0.7]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Evaluation dataset
# Each entry defines:
#   query        - the search query string
#   source       - optional source filter slug
#   expected_urls - URL fragments that must appear in the top-k results
#   top_k        - how many results to consider (default 5)
#   note         - optional human-readable note
# ---------------------------------------------------------------------------

EVAL_QUERIES: list[dict[str, Any]] = [
    # MDN — JavaScript
    {
        "query": "Array map method",
        "source": "mdn",
        "expected_urls": ["Array/map"],
        "top_k": 5,
        "note": "MDN Array.prototype.map reference",
    },
    {
        "query": "fetch API",
        "source": "mdn",
        "expected_urls": ["fetch", "Fetch_API"],
        "top_k": 5,
        "note": "MDN Fetch API reference",
    },
    {
        "query": "CSS flexbox",
        "source": "mdn",
        "expected_urls": ["flexbox", "CSS_Flexible_Box_Layout", "flex"],
        "top_k": 5,
        "note": "MDN flexbox guide",
    },
    {
        "query": "Promise all",
        "source": "mdn",
        "expected_urls": ["Promise/all", "Promise"],
        "top_k": 5,
        "note": "MDN Promise.all",
    },
    # React
    {
        "query": "useState hook",
        "source": "react",
        "expected_urls": ["useState", "hooks"],
        "top_k": 5,
        "note": "React useState reference",
    },
    {
        "query": "useEffect",
        "source": "react",
        "expected_urls": ["useEffect"],
        "top_k": 5,
        "note": "React useEffect hook",
    },
    {
        "query": "Server Components",
        "source": "react",
        "expected_urls": ["server", "Server_Component", "rsc"],
        "top_k": 5,
        "note": "React Server Components docs",
    },
    # Next.js
    {
        "query": "App Router",
        "source": "nextjs",
        "expected_urls": ["app", "router"],
        "top_k": 5,
        "note": "Next.js App Router",
    },
    {
        "query": "Next.js middleware",
        "source": "nextjs",
        "expected_urls": ["middleware"],
        "top_k": 5,
        "note": "Next.js middleware",
    },
    {
        "query": "Image component",
        "source": "nextjs",
        "expected_urls": ["image", "Image"],
        "top_k": 5,
        "note": "Next.js Image component",
    },
    # TypeScript
    {
        "query": "TypeScript generics",
        "source": "typescript",
        "expected_urls": ["generics", "Generics"],
        "top_k": 5,
        "note": "TypeScript generics handbook",
    },
    {
        "query": "utility types",
        "source": "typescript",
        "expected_urls": ["utility-types", "Utility_Types"],
        "top_k": 5,
        "note": "TypeScript utility types",
    },
    {
        "query": "TypeScript interfaces",
        "source": "typescript",
        "expected_urls": ["interfaces", "Interfaces"],
        "top_k": 5,
        "note": "TypeScript interfaces",
    },
    # PostgreSQL
    {
        "query": "PostgreSQL indexes",
        "source": "postgresql",
        "expected_urls": ["indexes", "index"],
        "top_k": 5,
        "note": "PostgreSQL index types",
    },
    {
        "query": "EXPLAIN ANALYZE",
        "source": "postgresql",
        "expected_urls": ["explain", "EXPLAIN"],
        "top_k": 5,
        "note": "PostgreSQL EXPLAIN command",
    },
    {
        "query": "window functions",
        "source": "postgresql",
        "expected_urls": ["window", "functions"],
        "top_k": 5,
        "note": "PostgreSQL window functions",
    },
    # Cross-source queries (no source filter)
    {
        "query": "async await",
        "source": None,
        "expected_urls": ["async", "await", "Promise"],
        "top_k": 10,
        "note": "async/await across MDN and TypeScript",
    },
    {
        "query": "SQL JOIN",
        "source": "postgresql",
        "expected_urls": ["join", "JOIN"],
        "top_k": 5,
        "note": "PostgreSQL JOIN documentation",
    },
]


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def fetch_search(base_url: str, query: str, source: str | None, limit: int) -> dict[str, Any]:
    params = f"q={urllib.parse.quote(query)}&limit={limit}"
    if source:
        params += f"&source={source}"
    url = f"{base_url}/api/search?{params}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


# ---------------------------------------------------------------------------
# Evaluation logic
# ---------------------------------------------------------------------------

@dataclass
class QueryResult:
    query: str
    source: str | None
    note: str
    expected_urls: list[str]
    top_k: int
    passed: bool
    matched_url: str | None
    result_urls: list[str]
    latency_ms: int
    total_hits: int
    mode: str


def evaluate_query(base_url: str, spec: dict[str, Any]) -> QueryResult:
    query = spec["query"]
    source = spec.get("source")
    expected_url_fragments = spec["expected_urls"]
    top_k = spec.get("top_k", 5)

    start = time.monotonic()
    try:
        data = fetch_search(base_url, query, source, top_k)
    except Exception as exc:
        return QueryResult(
            query=query,
            source=source,
            note=spec.get("note", ""),
            expected_urls=expected_url_fragments,
            top_k=top_k,
            passed=False,
            matched_url=None,
            result_urls=[],
            latency_ms=0,
            total_hits=0,
            mode="error",
        )
    latency_ms = int((time.monotonic() - start) * 1000)

    result_urls = [r.get("url", "") for r in data.get("results", [])][:top_k]
    mode = data.get("mode", "unknown")
    total_hits = data.get("totalHits", 0)

    # A query passes if any expected fragment appears in any result URL
    matched_url = None
    for result_url in result_urls:
        for fragment in expected_url_fragments:
            if fragment.lower() in result_url.lower():
                matched_url = result_url
                break
        if matched_url:
            break

    return QueryResult(
        query=query,
        source=source,
        note=spec.get("note", ""),
        expected_urls=expected_url_fragments,
        top_k=top_k,
        passed=matched_url is not None,
        matched_url=matched_url,
        result_urls=result_urls,
        latency_ms=latency_ms,
        total_hits=total_hits,
        mode=mode,
    )


def run_evaluation(base_url: str, threshold: float, verbose: bool) -> bool:
    print(f"\nDevDocs Search — Relevance Evaluation")
    print(f"Base URL : {base_url}")
    print(f"Queries  : {len(EVAL_QUERIES)}")
    print(f"Threshold: {threshold:.0%}")
    print("=" * 70)

    results: list[QueryResult] = []
    for spec in EVAL_QUERIES:
        result = evaluate_query(base_url, spec)
        results.append(result)
        status = "PASS" if result.passed else "FAIL"
        source_label = f"[{result.source}]" if result.source else "[all]"
        print(f"  {status}  {source_label:14} {result.query!r:40} {result.latency_ms:4}ms  hits={result.total_hits}")
        if verbose and not result.passed:
            print(f"         Expected fragments: {result.expected_urls}")
            print(f"         Got URLs: {result.result_urls[:3]}")

    passed = sum(1 for r in results if r.passed)
    total = len(results)
    pass_rate = passed / total if total else 0
    avg_latency = sum(r.latency_ms for r in results) / total if total else 0
    demo_count = sum(1 for r in results if r.mode == "demo")

    print("=" * 70)
    print(f"Passed     : {passed}/{total} ({pass_rate:.1%})")
    print(f"Avg latency: {avg_latency:.0f}ms")
    if demo_count > 0:
        print(f"WARNING    : {demo_count}/{total} queries returned demo results (Meilisearch unavailable)")
    print()

    per_source: dict[str, tuple[int, int]] = {}
    for r in results:
        key = r.source or "all"
        p, t = per_source.get(key, (0, 0))
        per_source[key] = (p + (1 if r.passed else 0), t + 1)
    print("By source:")
    for source, (p, t) in sorted(per_source.items()):
        print(f"  {source:15} {p}/{t} ({p/t:.0%})")
    print()

    ok = pass_rate >= threshold
    if ok:
        print(f"Result: PASSED (>= {threshold:.0%} threshold)")
    else:
        print(f"Result: FAILED (< {threshold:.0%} threshold — got {pass_rate:.1%})")
    return ok


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

import urllib.parse


def main() -> None:
    parser = argparse.ArgumentParser(description="DevDocs Search relevance evaluation")
    parser.add_argument("--base-url", default="http://localhost:3000", help="API base URL")
    parser.add_argument("--threshold", type=float, default=0.70, help="Minimum pass rate (0-1)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show failed result URLs")
    args = parser.parse_args()

    ok = run_evaluation(args.base_url, args.threshold, args.verbose)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
