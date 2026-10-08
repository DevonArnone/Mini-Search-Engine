import type { InvertedIndex } from "./inverted-index";

// Recovery is deliberately bounded: it only runs for query terms that match
// no document, only considers vocabulary sharing the term's first character,
// and keeps a handful of candidates per term.

export const MAX_TYPO_CANDIDATES = 4;
export const MAX_PREFIX_CANDIDATES = 8;
export const MAX_PREFIX_EXTENSION = 8;

export const PREFIX_PENALTY = 0.8;
export const TYPO_PENALTIES: readonly number[] = [1, 0.6, 0.4];

export function maxEditDistance(termLength: number): number {
  if (termLength < 4) return 0;
  if (termLength < 8) return 1;
  return 2;
}

// Optimal string alignment distance (insert, delete, substitute, adjacent
// transposition), abandoning as soon as the result must exceed `limit`.
// Returns limit + 1 when the strings are further apart than `limit`.
export function boundedEditDistance(a: string, b: string, limit: number): number {
  const aLength = a.length;
  const bLength = b.length;
  if (Math.abs(aLength - bLength) > limit) return limit + 1;
  if (a === b) return 0;

  let previousPrevious = new Array<number>(bLength + 1).fill(0);
  let previous = new Array<number>(bLength + 1);
  let current = new Array<number>(bLength + 1);
  for (let j = 0; j <= bLength; j++) previous[j] = j;

  for (let i = 1; i <= aLength; i++) {
    current[0] = i;
    let rowMinimum = i;
    const aCode = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLength; j++) {
      const bCode = b.charCodeAt(j - 1);
      const cost = aCode === bCode ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        aCode === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === bCode
      ) {
        value = Math.min(value, previousPrevious[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > limit) return limit + 1;
    [previousPrevious, previous, current] = [previous, current, previousPrevious];
  }
  return Math.min(previous[bLength], limit + 1);
}

export interface RecoveryCandidate {
  term: string;
  penalty: number;
  kind: "prefix" | "typo";
}

export function findRecoveryCandidates(index: InvertedIndex, term: string): RecoveryCandidate[] {
  const first = term[0];
  const length = term.length;
  const dictionary = index.dictionary;
  const candidates: RecoveryCandidate[] = [];
  const chosen = new Set<string>();

  // The query term as an unfinished word: "usest" -> "usestate".
  if (length >= 3) {
    const prefixes: Array<{ term: string; df: number }> = [];
    for (let extra = 1; extra <= MAX_PREFIX_EXTENSION; extra++) {
      const bucket = index.termBuckets.get(first + (length + extra));
      if (!bucket) continue;
      for (const candidate of bucket) {
        if (!candidate.startsWith(term)) continue;
        const df = dictionary.get(candidate)?.df ?? 0;
        if (df > 0) prefixes.push({ term: candidate, df });
      }
    }
    prefixes.sort((a, b) => b.df - a.df || (a.term < b.term ? -1 : 1));
    for (const { term: candidate } of prefixes.slice(0, MAX_PREFIX_CANDIDATES)) {
      chosen.add(candidate);
      candidates.push({ term: candidate, penalty: PREFIX_PENALTY, kind: "prefix" });
    }
  }

  const limit = maxEditDistance(length);
  if (limit > 0) {
    const typos: Array<{ term: string; df: number; distance: number }> = [];
    for (let other = length - limit; other <= length + limit; other++) {
      const bucket = index.termBuckets.get(first + other);
      if (!bucket) continue;
      for (const candidate of bucket) {
        if (chosen.has(candidate)) continue;
        const df = dictionary.get(candidate)?.df ?? 0;
        if (df === 0) continue;
        const distance = boundedEditDistance(term, candidate, limit);
        if (distance <= limit) typos.push({ term: candidate, df, distance });
      }
    }
    typos.sort((a, b) => a.distance - b.distance || b.df - a.df || (a.term < b.term ? -1 : 1));
    // Only the closest spellings are kept: when a term one edit away exists,
    // terms two edits away are not offered alongside it.
    const nearest = typos[0]?.distance;
    for (const { term: candidate, distance } of typos.filter((typo) => typo.distance === nearest).slice(0, MAX_TYPO_CANDIDATES)) {
      candidates.push({ term: candidate, penalty: TYPO_PENALTIES[distance], kind: "typo" });
    }
  }

  return candidates;
}
