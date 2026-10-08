import { FIELD_COUNT, FIELD_WEIGHT_LIST, fieldNorm } from "./bm25";
import { tokenize } from "./tokenizer";
import type { FacetCounts, FacetOption, IndexDocument } from "./types";

// Field slots, in the order of bm25.FIELDS.
const TITLE = 0;
const HEADINGS = 1;
const DESCRIPTION = 2;
const BODY = 3;
const TAGS = 4;
const SECTION = 5;
const SOURCE = 6;

// A posting's per-field term frequencies are packed into 16-bit entries:
//   bit 15      last entry for this posting
//   bits 12-14  field slot
//   bits 0-11   term frequency, capped at 4095
const LAST_FLAG = 0x8000;
const MAX_TF = 0x0fff;

export class PostingList {
  docIds = new Int32Array(2);
  fieldTfs = new Uint16Array(2);
  postings = 0;
  entries = 0;
  // Live documents containing the term. Tombstoned postings stay in the
  // arrays until the index is rebuilt, so this is tracked separately.
  df = 0;

  add(docNum: number, counts: Int32Array, base: number): void {
    if (this.postings === this.docIds.length) {
      const grown = new Int32Array(this.docIds.length * 2);
      grown.set(this.docIds);
      this.docIds = grown;
    }
    this.docIds[this.postings++] = docNum;

    let last = -1;
    for (let field = 0; field < FIELD_COUNT; field++) {
      const tf = counts[base + field];
      if (tf === 0) continue;
      if (this.entries === this.fieldTfs.length) {
        const grown = new Uint16Array(this.fieldTfs.length * 2);
        grown.set(this.fieldTfs);
        this.fieldTfs = grown;
      }
      last = this.entries;
      this.fieldTfs[this.entries++] = (field << 12) | Math.min(tf, MAX_TF);
    }
    this.fieldTfs[last] |= LAST_FLAG;
    this.df++;
  }
}

export interface StoredDocument {
  id: string;
  url: string;
  domain: string;
  sourceSlug: string | null;
  sourceName: string | null;
  contentType: string | null;
  sectionPath: string | null;
  title: string | null;
  metaDescription: string | null;
  headings: string[];
  // Bodies are kept as UTF-8 off the V8 heap and decoded only for the handful
  // of documents on a result page.
  bodyUtf8: Buffer;
  language: string | null;
  publishedAt: string | null;
  lastUpdatedAt: string | null;
  publishedMs: number;
  updatedMs: number;
  tags: string[];
  codeBlockCount: number;
  freshnessStatus: string;
  authority: number;
  // Fields carried through untouched so an in-memory rebuild is lossless.
  canonicalUrl: string | null;
  wordCount: number | null;
  boostScore: number | null;
}

function toMillis(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  // The crawler emits naive ISO timestamps; treat them as UTC.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return Date.parse(hasZone || !value.includes("T") ? value : `${value}Z`);
}

function fieldTexts(doc: StoredDocument, body: string): string[][] {
  const texts: string[][] = new Array(FIELD_COUNT);
  texts[TITLE] = tokenize(doc.title);
  texts[HEADINGS] = tokenize(doc.headings.join("\n"));
  texts[DESCRIPTION] = tokenize(doc.metaDescription);
  texts[BODY] = tokenize(body);
  texts[TAGS] = tokenize(doc.tags.join("\n"));
  texts[SECTION] = tokenize(doc.sectionPath);
  texts[SOURCE] = tokenize(doc.sourceName);
  return texts;
}

function topFacet(counts: Map<string, number>, limit: number): FacetOption[] {
  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1))
    .slice(0, limit);
}

export class InvertedIndex {
  readonly dictionary = new Map<string, PostingList>();
  readonly docs: Array<StoredDocument | null> = [];
  readonly docNumById = new Map<string, number>();

  live = new Uint8Array(1024);
  fieldLengths = new Uint32Array(1024 * FIELD_COUNT);
  readonly fieldLengthTotals = new Float64Array(FIELD_COUNT);
  liveCount = 0;
  deadCount = 0;

  // Vocabulary bucketed by first character and length, so typo and prefix
  // recovery inspect a bounded slice instead of every term.
  readonly termBuckets = new Map<string, string[]>();
  // Title term -> documents, for prefix autocomplete over titles.
  readonly titleTerms = new Map<string, number[]>();
  private sortedTitleTerms: string[] | null = null;

  private norms: Float64Array | null = null;
  private facets: FacetCounts | null = null;
  // Reused while counting one document's terms.
  private scratch = new Int32Array(4096 * FIELD_COUNT);

  get docSlots(): number {
    return this.docs.length;
  }

  averageFieldLength(field: number): number {
    return this.liveCount ? this.fieldLengthTotals[field] / this.liveCount : 0;
  }

  bodyOf(doc: StoredDocument): string {
    return doc.bodyUtf8.toString("utf8");
  }

  upsert(input: IndexDocument): void {
    this.remove(input.id);

    const doc: StoredDocument = {
      id: input.id,
      url: input.url ?? "",
      domain: input.domain ?? "",
      sourceSlug: input.source_slug ?? null,
      sourceName: input.source_name ?? null,
      contentType: input.content_type ?? null,
      sectionPath: input.section_path ?? null,
      title: input.title ?? null,
      metaDescription: input.meta_description ?? null,
      headings: Array.isArray(input.headings) ? input.headings.map(String) : [],
      bodyUtf8: Buffer.from(input.body ?? "", "utf8"),
      language: input.language ?? null,
      publishedAt: input.published_at ?? null,
      lastUpdatedAt: input.last_updated_at ?? null,
      publishedMs: toMillis(input.published_at),
      updatedMs: toMillis(input.last_updated_at),
      tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      codeBlockCount: Number(input.code_block_count ?? 0),
      freshnessStatus: input.freshness_status ?? "unknown",
      authority: Number(input.authority_score ?? 0),
      canonicalUrl: input.canonical_url ?? null,
      wordCount: input.word_count ?? null,
      boostScore: input.boost_score ?? null,
    };

    const docNum = this.docs.length;
    this.docs.push(doc);
    this.docNumById.set(doc.id, docNum);
    this.ensureCapacity(docNum + 1);
    this.live[docNum] = 1;
    this.liveCount++;

    const texts = fieldTexts(doc, input.body ?? "");
    const termSlots = new Map<string, number>();
    let scratch = this.scratch;
    for (let field = 0; field < FIELD_COUNT; field++) {
      const terms = texts[field];
      this.fieldLengths[docNum * FIELD_COUNT + field] = terms.length;
      this.fieldLengthTotals[field] += terms.length;
      for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        let slot = termSlots.get(term);
        if (slot === undefined) {
          slot = termSlots.size;
          termSlots.set(term, slot);
          if ((slot + 1) * FIELD_COUNT > scratch.length) {
            const grown = new Int32Array(scratch.length * 2);
            grown.set(scratch);
            this.scratch = scratch = grown;
          }
        }
        scratch[slot * FIELD_COUNT + field]++;
      }
    }

    for (const [term, slot] of termSlots) {
      let list = this.dictionary.get(term);
      if (!list) {
        list = new PostingList();
        this.dictionary.set(term, list);
        const key = term[0] + term.length;
        const bucket = this.termBuckets.get(key);
        if (bucket) bucket.push(term);
        else this.termBuckets.set(key, [term]);
      }
      const base = slot * FIELD_COUNT;
      list.add(docNum, scratch, base);
      if (scratch[base + TITLE] > 0) {
        const titleDocs = this.titleTerms.get(term);
        if (titleDocs) titleDocs.push(docNum);
        else {
          this.titleTerms.set(term, [docNum]);
          this.sortedTitleTerms = null;
        }
      }
    }
    scratch.fill(0, 0, termSlots.size * FIELD_COUNT);
    this.invalidate();
  }

  remove(id: string): boolean {
    const docNum = this.docNumById.get(id);
    if (docNum === undefined) return false;
    const doc = this.docs[docNum];
    if (!doc) return false;

    // Postings are left in place and skipped through `live`; only the
    // statistics BM25 depends on are corrected here.
    const seen = new Set<string>();
    const texts = fieldTexts(doc, this.bodyOf(doc));
    for (let field = 0; field < FIELD_COUNT; field++) {
      this.fieldLengthTotals[field] -= this.fieldLengths[docNum * FIELD_COUNT + field];
      for (const term of texts[field]) {
        if (seen.has(term)) continue;
        seen.add(term);
        const list = this.dictionary.get(term);
        if (list) list.df--;
      }
    }

    this.live[docNum] = 0;
    this.docs[docNum] = null;
    this.docNumById.delete(id);
    this.liveCount--;
    this.deadCount++;
    this.invalidate();
    return true;
  }

  // norms[docNum * FIELD_COUNT + field] = w_f / (1 - b + b * len / avglen).
  // Average lengths move with every mutation, so this is rebuilt lazily.
  getNorms(): Float64Array {
    if (this.norms) return this.norms;
    const slots = this.docs.length;
    const norms = new Float64Array(slots * FIELD_COUNT);
    for (let field = 0; field < FIELD_COUNT; field++) {
      const average = this.averageFieldLength(field);
      const weight = FIELD_WEIGHT_LIST[field];
      for (let docNum = 0; docNum < slots; docNum++) {
        if (!this.live[docNum]) continue;
        const offset = docNum * FIELD_COUNT + field;
        norms[offset] = fieldNorm(weight, this.fieldLengths[offset], average);
      }
    }
    this.norms = norms;
    return norms;
  }

  getSortedTitleTerms(): string[] {
    if (!this.sortedTitleTerms) this.sortedTitleTerms = Array.from(this.titleTerms.keys()).sort();
    return this.sortedTitleTerms;
  }

  getFacets(): FacetCounts {
    if (this.facets) return this.facets;
    const sources = new Map<string, number>();
    const contentTypes = new Map<string, number>();
    const domains = new Map<string, number>();
    const languages = new Map<string, number>();
    const tags = new Map<string, number>();
    const bump = (map: Map<string, number>, value: string | null) => {
      if (value) map.set(value, (map.get(value) ?? 0) + 1);
    };
    for (const doc of this.docs) {
      if (!doc) continue;
      bump(sources, doc.sourceSlug);
      bump(contentTypes, doc.contentType);
      bump(domains, doc.domain);
      bump(languages, doc.language);
      for (const tag of doc.tags) bump(tags, tag);
    }
    this.facets = {
      sources: topFacet(sources, 50),
      contentTypes: topFacet(contentTypes, 50),
      domains: topFacet(domains, 50),
      languages: topFacet(languages, 50),
      tags: topFacet(tags, 50),
    };
    return this.facets;
  }

  // Rebuilds without tombstoned postings. Used when dead documents make up a
  // large share of the postings lists.
  compacted(): InvertedIndex {
    const fresh = new InvertedIndex();
    for (const doc of this.docs) {
      if (doc) fresh.upsert(toIndexDocument(doc));
    }
    return fresh;
  }

  private invalidate(): void {
    this.norms = null;
    this.facets = null;
  }

  private ensureCapacity(slots: number): void {
    if (slots <= this.live.length) return;
    const capacity = Math.max(slots, this.live.length * 2);
    const live = new Uint8Array(capacity);
    live.set(this.live);
    this.live = live;
    const lengths = new Uint32Array(capacity * FIELD_COUNT);
    lengths.set(this.fieldLengths);
    this.fieldLengths = lengths;
  }
}

export function toIndexDocument(doc: StoredDocument): IndexDocument {
  return {
    id: doc.id,
    url: doc.url,
    canonical_url: doc.canonicalUrl,
    domain: doc.domain,
    source_slug: doc.sourceSlug,
    source_name: doc.sourceName,
    content_type: doc.contentType,
    section_path: doc.sectionPath,
    title: doc.title,
    meta_description: doc.metaDescription,
    headings: doc.headings,
    body: doc.bodyUtf8.toString("utf8"),
    language: doc.language,
    published_at: doc.publishedAt,
    last_updated_at: doc.lastUpdatedAt,
    word_count: doc.wordCount,
    code_block_count: doc.codeBlockCount,
    tags: doc.tags,
    boost_score: doc.boostScore,
    authority_score: doc.authority,
    freshness_status: doc.freshnessStatus,
  };
}

export const FIELD_SLOTS = { TITLE, HEADINGS, DESCRIPTION, BODY, TAGS, SECTION, SOURCE } as const;
export const POSTING_LAST_FLAG = LAST_FLAG;
export const POSTING_MAX_TF = MAX_TF;
