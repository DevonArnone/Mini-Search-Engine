import type { InvertedIndex, StoredDocument } from "./inverted-index";
import { tokenize } from "./tokenizer";

export const MAX_SUGGESTIONS = 6;
const MAX_PREFIX_TERMS = 200;
const MAX_CANDIDATE_DOCS = 5000;

function lowerBound(sorted: string[], target: string): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Suggests document titles. Every completed word must appear in the title and
// the word being typed must be the prefix of a title word.
export function autocomplete(index: InvertedIndex, q: string, limit = MAX_SUGGESTIONS): string[] {
  const terms = tokenize(q);
  if (terms.length === 0) return [];
  const typing = /[\p{L}\p{N}]$/u.test(q) ? (terms.pop() as string) : null;

  let candidates: Set<number> | null = null;
  const intersect = (docNums: Iterable<number>) => {
    const next = new Set<number>();
    for (const docNum of docNums) {
      if (!index.live[docNum]) continue;
      if (candidates && !candidates.has(docNum)) continue;
      next.add(docNum);
      if (next.size >= MAX_CANDIDATE_DOCS) break;
    }
    candidates = next;
  };

  for (const term of new Set(terms)) {
    intersect(index.titleTerms.get(term) ?? []);
    if ((candidates as Set<number> | null)?.size === 0) return [];
  }

  if (typing !== null) {
    const sorted = index.getSortedTitleTerms();
    const matching: number[] = [];
    const end = Math.min(sorted.length, lowerBound(sorted, typing) + MAX_PREFIX_TERMS);
    for (let i = lowerBound(sorted, typing); i < end && sorted[i].startsWith(typing); i++) {
      for (const docNum of index.titleTerms.get(sorted[i]) as number[]) matching.push(docNum);
    }
    intersect(matching);
  }

  const normalizedQuery = tokenize(q).join(" ");
  const ranked: Array<{ doc: StoredDocument; leading: boolean }> = [];
  for (const docNum of candidates ?? []) {
    const doc = index.docs[docNum];
    if (!doc?.title?.trim()) continue;
    ranked.push({ doc, leading: tokenize(doc.title).join(" ").startsWith(normalizedQuery) });
  }
  ranked.sort(
    (a, b) =>
      Number(b.leading) - Number(a.leading) ||
      b.doc.authority - a.doc.authority ||
      (a.doc.title as string).length - (b.doc.title as string).length ||
      ((a.doc.title as string) < (b.doc.title as string) ? -1 : (a.doc.title as string) > (b.doc.title as string) ? 1 : 0),
  );

  const suggestions: string[] = [];
  const seen = new Set<string>();
  for (const { doc } of ranked) {
    const title = (doc.title as string).trim();
    if (seen.has(title)) continue;
    seen.add(title);
    suggestions.push(title);
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
