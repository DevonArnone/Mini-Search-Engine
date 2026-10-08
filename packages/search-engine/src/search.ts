import { FIELDS, FIELD_COUNT, idf, saturate } from "./bm25";
import { BoundedHeap } from "./heap";
import { buildSnippet, highlight } from "./highlight";
import { InvertedIndex, POSTING_LAST_FLAG, POSTING_MAX_TF, type PostingList, type StoredDocument } from "./inverted-index";
import { tokenizeQuery } from "./tokenizer";
import { findRecoveryCandidates } from "./typo";
import type { MatchMode, SearchHit, SearchOutput, SearchQuery } from "./types";

const DAY_MS = 86_400_000;
const UPDATED_WITHIN_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// Order and wording of the "matched in" labels shown with each result.
const MATCH_LABELS: ReadonlyArray<readonly [field: number, label: string]> = [
  [0, "title"],
  [1, "headings"],
  [5, "section"],
  [2, "description"],
  [3, "body"],
  [6, "source"],
  [4, "tags"],
];

interface Alternative {
  term: string;
  list: PostingList;
  penalty: number;
}

// One query term, or the bounded set of vocabulary terms it was recovered to.
// A document's score for the group is its best alternative.
type TermGroup = Alternative[];

// Per-query accumulators, reused across searches. The engine runs one search
// at a time, so sharing them is safe.
let scores = new Float64Array(0);
let groupScores = new Float64Array(0);
let matchedGroups = new Uint8Array(0);
let fieldMasks = new Uint8Array(0);

function prepareAccumulators(slots: number): void {
  if (scores.length < slots) {
    const capacity = Math.max(slots, scores.length * 2, 1024);
    scores = new Float64Array(capacity);
    groupScores = new Float64Array(capacity);
    matchedGroups = new Uint8Array(capacity);
    fieldMasks = new Uint8Array(capacity);
    return;
  }
  scores.fill(0, 0, slots);
  matchedGroups.fill(0, 0, slots);
  fieldMasks.fill(0, 0, slots);
}

function scoreGroup(index: InvertedIndex, group: TermGroup, norms: Float64Array): void {
  const live = index.live;
  const single = group.length === 1 && group[0].penalty === 1;
  const touched: number[] = [];

  for (const { list, penalty } of group) {
    const termIdf = idf(index.liveCount, list.df) * penalty;
    const docIds = list.docIds;
    const fieldTfs = list.fieldTfs;
    const postings = list.postings;
    let entry = 0;
    for (let i = 0; i < postings; i++) {
      const docNum = docIds[i];
      const base = docNum * FIELD_COUNT;
      let weightedTf = 0;
      let mask = 0;
      let packed: number;
      do {
        packed = fieldTfs[entry++];
        const field = (packed >> 12) & 7;
        weightedTf += (packed & POSTING_MAX_TF) * norms[base + field];
        mask |= 1 << field;
      } while ((packed & POSTING_LAST_FLAG) === 0);
      if (!live[docNum]) continue;

      const score = termIdf * saturate(weightedTf);
      fieldMasks[docNum] |= mask;
      if (single) {
        scores[docNum] += score;
        matchedGroups[docNum]++;
      } else {
        if (groupScores[docNum] === 0) touched.push(docNum);
        if (score > groupScores[docNum]) groupScores[docNum] = score;
      }
    }
  }

  for (const docNum of touched) {
    scores[docNum] += groupScores[docNum];
    groupScores[docNum] = 0;
    matchedGroups[docNum]++;
  }
}

type DocumentFilter = (doc: StoredDocument) => boolean;

function compileFilter(query: SearchQuery): DocumentFilter | null {
  const checks: DocumentFilter[] = [];
  const membership = (values: string[] | undefined, read: (doc: StoredDocument) => string | null) => {
    if (!values?.length) return;
    const allowed = new Set(values);
    checks.push((doc) => {
      const value = read(doc);
      return value !== null && allowed.has(value);
    });
  };
  membership(query.source, (doc) => doc.sourceSlug);
  membership(query.contentType, (doc) => doc.contentType);
  membership(query.domain, (doc) => doc.domain);
  membership(query.language, (doc) => doc.language);
  if (query.tags?.length) {
    const allowed = new Set(query.tags);
    checks.push((doc) => doc.tags.some((tag) => allowed.has(tag)));
  }
  // Undated documents never satisfy a date bound (NaN fails both comparisons).
  if (query.from) {
    const from = Date.parse(`${query.from}T00:00:00.000Z`);
    checks.push((doc) => doc.publishedMs >= from);
  }
  if (query.to) {
    const to = Date.parse(`${query.to}T23:59:59.999Z`);
    checks.push((doc) => doc.publishedMs <= to);
  }
  const days = query.updatedWithin ? UPDATED_WITHIN_DAYS[query.updatedWithin] : undefined;
  if (days) {
    const cutoff = (query.now ?? Date.now()) - days * DAY_MS;
    checks.push((doc) => doc.updatedMs >= cutoff);
  }
  if (checks.length === 0) return null;
  if (checks.length === 1) return checks[0];
  return (doc) => {
    for (const check of checks) if (!check(doc)) return false;
    return true;
  };
}

function makeComparator(index: InvertedIndex, sort: SearchQuery["sort"]): (a: number, b: number) => boolean {
  const docs = index.docs as StoredDocument[];
  // Relevance, then authority only among exactly equal scores, then id so
  // the order is total and repeatable.
  const byRelevance = (a: number, b: number): boolean => {
    if (scores[a] !== scores[b]) return scores[a] > scores[b];
    const docA = docs[a];
    const docB = docs[b];
    if (docA.authority !== docB.authority) return docA.authority > docB.authority;
    return docA.id < docB.id;
  };
  if (sort !== "newest" && sort !== "oldest") return byRelevance;

  const direction = sort === "newest" ? 1 : -1;
  return (a, b) => {
    const dateA = docs[a].publishedMs;
    const dateB = docs[b].publishedMs;
    const missingA = Number.isNaN(dateA);
    const missingB = Number.isNaN(dateB);
    // Undated documents sort last in both directions.
    if (missingA !== missingB) return missingB;
    if (!missingA && dateA !== dateB) return direction * (dateA - dateB) > 0;
    return byRelevance(a, b);
  };
}

interface Collected {
  totalHits: number;
  page: number[];
}

function collect(index: InvertedIndex, query: SearchQuery, filter: DocumentFilter | null, required: number): Collected {
  const offset = (query.page - 1) * query.limit;
  const heap = new BoundedHeap<number>(offset + query.limit, makeComparator(index, query.sort));
  const docs = index.docs;
  const live = index.live;
  const slots = index.docSlots;
  let totalHits = 0;
  for (let docNum = 0; docNum < slots; docNum++) {
    if (required > 0 ? matchedGroups[docNum] < required : !live[docNum]) continue;
    if (filter && !filter(docs[docNum] as StoredDocument)) continue;
    totalHits++;
    heap.push(docNum);
  }
  return { totalHits, page: heap.toSortedArray().slice(offset, offset + query.limit) };
}

function run(index: InvertedIndex, query: SearchQuery, filter: DocumentFilter | null, groups: TermGroup[], requireAll: boolean): Collected {
  prepareAccumulators(index.docSlots);
  const norms = index.getNorms();
  for (const group of groups) scoreGroup(index, group, norms);
  return collect(index, query, filter, requireAll ? groups.length : 1);
}

function toHit(index: InvertedIndex, docNum: number, terms: ReadonlySet<string>): SearchHit {
  const doc = index.docs[docNum] as StoredDocument;
  const mask = fieldMasks[docNum];
  const description = doc.metaDescription ?? "";
  const bodySnippet = buildSnippet(index.bodyOf(doc), terms);
  const snippet = !bodySnippet.matched && description ? highlight(description, terms) : bodySnippet.html;
  return {
    id: doc.id,
    title: doc.title || "Untitled",
    url: doc.url,
    domain: doc.domain,
    sourceSlug: doc.sourceSlug,
    sourceName: doc.sourceName,
    contentType: doc.contentType,
    sectionPath: doc.sectionPath,
    snippet,
    highlights: [highlight(doc.title ?? "", terms), highlight(description, terms)].filter(Boolean),
    publishedAt: doc.publishedAt,
    lastUpdatedAt: doc.lastUpdatedAt,
    language: doc.language,
    tags: doc.tags,
    codeBlockCount: doc.codeBlockCount,
    freshnessStatus: doc.freshnessStatus,
    whyMatched: terms.size ? MATCH_LABELS.filter(([field]) => mask & (1 << field)).map(([, label]) => label) : [],
    score: Math.round(scores[docNum] * 1e6) / 1e6,
  };
}

export function search(index: InvertedIndex, query: SearchQuery): SearchOutput {
  const filter = compileFilter(query);
  const terms = tokenizeQuery(query.q);
  const corrections: Record<string, string[]> = {};

  let matchMode: MatchMode = "browse";
  let collected: Collected;
  let groups: TermGroup[] = [];

  if (terms.length === 0 && query.q.trim() !== "") {
    // Something was typed, but none of it is a searchable term (punctuation,
    // or a token past the length limit). That matches nothing; it is not a
    // request to browse everything.
    matchMode = "all";
    collected = { totalHits: 0, page: [] };
  } else if (terms.length === 0) {
    prepareAccumulators(index.docSlots);
    collected = collect(index, query, filter, 0);
  } else {
    const exact: TermGroup[] = [];
    const unknown: string[] = [];
    for (const term of terms) {
      const list = index.dictionary.get(term);
      if (list && list.df > 0) exact.push([{ term, list, penalty: 1 }]);
      else unknown.push(term);
    }

    matchMode = "all";
    groups = exact;
    collected = unknown.length === 0 ? run(index, query, filter, groups, true) : { totalHits: 0, page: [] };

    // Exact matches take precedence: recovery only starts once no document
    // holds every term as typed, and only rewrites terms the index has never seen.
    if (collected.totalHits === 0) {
      const recovered: TermGroup[] = [];
      for (const term of unknown) {
        const candidates = findRecoveryCandidates(index, term);
        if (candidates.length === 0) continue;
        corrections[term] = candidates.map((candidate) => candidate.term);
        recovered.push(
          candidates.map((candidate) => ({
            term: candidate.term,
            list: index.dictionary.get(candidate.term) as PostingList,
            penalty: candidate.penalty,
          })),
        );
      }
      groups = [...exact, ...recovered];

      if (unknown.length > 0 && recovered.length === unknown.length) {
        matchMode = "corrected";
        collected = run(index, query, filter, groups, true);
      }
      if (collected.totalHits === 0 && groups.length > 0) {
        matchMode = "any";
        collected = run(index, query, filter, groups, false);
      }
    }
  }

  const highlightTerms = new Set<string>();
  for (const group of groups) for (const alternative of group) highlightTerms.add(alternative.term);

  return {
    totalHits: collected.totalHits,
    matchMode,
    corrections,
    hits: collected.page.map((docNum) => toHit(index, docNum, highlightTerms)),
  };
}

// ---------------------------------------------------------------------------
// Score inspection
// ---------------------------------------------------------------------------

export interface TermExplanation {
  term: string;
  documentFrequency: number;
  idf: number;
  weightedTf: number;
  score: number;
  fields: Partial<Record<(typeof FIELDS)[number], { tf: number; length: number; averageLength: number; norm: number }>>;
}

export interface ScoreExplanation {
  documentCount: number;
  score: number;
  terms: TermExplanation[];
}

// Recomputes one document's exact-match score term by term, exposing every
// input to the formula. Used to check rankings by hand.
export function explain(index: InvertedIndex, q: string, id: string): ScoreExplanation | null {
  const docNum = index.docNumById.get(id);
  if (docNum === undefined) return null;
  const norms = index.getNorms();
  const explanation: ScoreExplanation = { documentCount: index.liveCount, score: 0, terms: [] };

  for (const term of tokenizeQuery(q)) {
    const list = index.dictionary.get(term);
    if (!list || list.df === 0) continue;
    let entry = 0;
    for (let i = 0; i < list.postings; i++) {
      const start = entry;
      while ((list.fieldTfs[entry++] & POSTING_LAST_FLAG) === 0);
      if (list.docIds[i] !== docNum) continue;

      const fields: TermExplanation["fields"] = {};
      let weightedTf = 0;
      for (let cursor = start; cursor < entry; cursor++) {
        const packed = list.fieldTfs[cursor];
        const field = (packed >> 12) & 7;
        const tf = packed & POSTING_MAX_TF;
        const norm = norms[docNum * FIELD_COUNT + field];
        weightedTf += tf * norm;
        fields[FIELDS[field]] = {
          tf,
          length: index.fieldLengths[docNum * FIELD_COUNT + field],
          averageLength: index.averageFieldLength(field),
          norm,
        };
      }
      const termIdf = idf(index.liveCount, list.df);
      const score = termIdf * saturate(weightedTf);
      explanation.terms.push({ term, documentFrequency: list.df, idf: termIdf, weightedTf, score, fields });
      explanation.score += score;
      break;
    }
  }
  return explanation;
}
