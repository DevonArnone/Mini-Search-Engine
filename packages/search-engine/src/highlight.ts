import { tokenizeWithOffsets, type TokenSpan } from "./tokenizer";

// Every string returned from here is HTML-escaped source text plus literal
// <em> tags. Nothing from a crawled page can reach the client as markup.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function render(text: string, spans: TokenSpan[], from: number, to: number, terms: ReadonlySet<string>): string {
  let out = "";
  let cursor = from;
  for (const span of spans) {
    if (span.start < from || span.end > to || !terms.has(span.term)) continue;
    out += escapeHtml(text.slice(cursor, span.start));
    out += `<em>${escapeHtml(text.slice(span.start, span.end))}</em>`;
    cursor = span.end;
  }
  return out + escapeHtml(text.slice(cursor, to));
}

export function highlight(text: string, terms: ReadonlySet<string>): string {
  if (!text) return "";
  if (terms.size === 0) return escapeHtml(text);
  return render(text, tokenizeWithOffsets(text), 0, text.length, terms);
}

export const SNIPPET_TOKENS = 35;
const SNIPPET_SCAN_CHARS = 60_000;

export interface Snippet {
  html: string;
  matched: boolean;
}

// Picks the window of SNIPPET_TOKENS tokens covering the most distinct query
// terms (then the most occurrences, then the earliest position).
export function buildSnippet(text: string, terms: ReadonlySet<string>): Snippet {
  if (!text) return { html: "", matched: false };
  const scanned = text.length > SNIPPET_SCAN_CHARS ? text.slice(0, SNIPPET_SCAN_CHARS) : text;
  const spans = tokenizeWithOffsets(scanned);
  if (spans.length === 0) return { html: "", matched: false };

  const hits: number[] = [];
  if (terms.size > 0) {
    for (let i = 0; i < spans.length; i++) {
      if (terms.has(spans[i].term)) hits.push(i);
    }
  }

  let first = 0;
  if (hits.length > 0) {
    let bestDistinct = 0;
    let bestCount = 0;
    let bestStart = hits[0];
    let right = 0;
    const inWindow = new Map<string, number>();
    for (let left = 0; left < hits.length; left++) {
      while (right < hits.length && hits[right] - hits[left] < SNIPPET_TOKENS) {
        const term = spans[hits[right]].term;
        inWindow.set(term, (inWindow.get(term) ?? 0) + 1);
        right++;
      }
      const count = right - left;
      if (inWindow.size > bestDistinct || (inWindow.size === bestDistinct && count > bestCount)) {
        bestDistinct = inWindow.size;
        bestCount = count;
        bestStart = hits[left];
      }
      const leaving = spans[hits[left]].term;
      const remaining = (inWindow.get(leaving) ?? 1) - 1;
      if (remaining === 0) inWindow.delete(leaving);
      else inWindow.set(leaving, remaining);
    }
    // Lead in with a little context before the first hit.
    first = Math.max(0, bestStart - 5);
  }

  const last = Math.min(spans.length, first + SNIPPET_TOKENS) - 1;
  if (last - first + 1 < SNIPPET_TOKENS) first = Math.max(0, last - SNIPPET_TOKENS + 1);
  const from = spans[first].start;
  const to = spans[last].end;
  const html =
    (first > 0 ? "…" : "") +
    render(scanned, spans, from, to, terms) +
    (last < spans.length - 1 || scanned.length < text.length ? "…" : "");
  return { html, matched: hits.length > 0 };
}
