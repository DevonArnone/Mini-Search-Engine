// Token normalization shared by indexing, querying, and highlighting.
//
// A token is a maximal run of letters and digits. ASCII is lowercased directly;
// anything else is NFKD-folded so "café" and "cafe" meet at the same term.
// Underscores, dots, and hyphens split, so `pg_stat_activity` and
// `Array.prototype.map` are searchable by their parts.

export const MAX_TOKEN_LENGTH = 64;

const NON_ASCII_WORD = /[\p{L}\p{N}]/u;
const COMBINING_MARKS = /\p{M}+/gu;
const NOT_WORD = /[^\p{L}\p{N}]+/gu;

function isAsciiWord(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) // A-Z
  );
}

function fold(raw: string, ascii: boolean): string {
  if (ascii) return raw.toLowerCase();
  return raw.normalize("NFKD").replace(COMBINING_MARKS, "").replace(NOT_WORD, "").toLowerCase();
}

export interface TokenSpan {
  term: string;
  start: number;
  end: number;
}

function scan(text: string, emit: (term: string, start: number, end: number) => void): void {
  const length = text.length;
  let start = -1;
  let ascii = true;
  for (let i = 0; i <= length; i++) {
    let word = false;
    if (i < length) {
      const code = text.charCodeAt(i);
      if (code < 128) {
        word = isAsciiWord(code);
      } else if (NON_ASCII_WORD.test(text[i])) {
        word = true;
        ascii = false;
      }
    }
    if (word) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      if (i - start <= MAX_TOKEN_LENGTH) {
        const term = fold(text.slice(start, i), ascii);
        if (term) emit(term, start, i);
      }
      start = -1;
      ascii = true;
    }
  }
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const terms: string[] = [];
  scan(text, (term) => terms.push(term));
  return terms;
}

export function tokenizeWithOffsets(text: string | null | undefined): TokenSpan[] {
  if (!text) return [];
  const spans: TokenSpan[] = [];
  scan(text, (term, start, end) => spans.push({ term, start, end }));
  return spans;
}

// Query terms keep first-seen order and are deduplicated: BM25 here does not
// weight repeated query terms.
export function tokenizeQuery(query: string): string[] {
  return Array.from(new Set(tokenize(query)));
}
