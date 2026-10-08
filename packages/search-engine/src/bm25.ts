// Field-weighted BM25 (BM25F, Robertson & Zaragoza).
//
// For a query term t and document d:
//
//   tf'(t, d) = sum over fields f of  w_f * tf(t, d, f) / (1 - b + b * len(d, f) / avglen(f))
//   idf(t)    = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
//   score     = sum over query terms of  idf(t) * tf'(t, d) * (k1 + 1) / (k1 + tf'(t, d))
//
// Field weights are applied before saturation, so a title hit counts as four
// body hits but repeated hits still saturate once per term, not once per field.

export const K1 = 1.2;
export const B = 0.75;

export const FIELDS = ["title", "headings", "description", "body", "tags", "section", "source"] as const;
export type FieldName = (typeof FIELDS)[number];
export const FIELD_COUNT = FIELDS.length;

export const FIELD_WEIGHTS: Readonly<Record<FieldName, number>> = {
  title: 4,
  headings: 2,
  description: 2,
  body: 1,
  tags: 1,
  section: 1,
  source: 1,
};

export const FIELD_WEIGHT_LIST: readonly number[] = FIELDS.map((field) => FIELD_WEIGHTS[field]);

export function idf(documentCount: number, documentFrequency: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

// w_f / (1 - b + b * len / avglen). A field nobody has populated has avglen 0
// and contributes no length normalization.
export function fieldNorm(weight: number, fieldLength: number, averageFieldLength: number): number {
  if (averageFieldLength <= 0) return weight;
  return weight / (1 - B + (B * fieldLength) / averageFieldLength);
}

export function saturate(weightedTf: number): number {
  return (weightedTf * (K1 + 1)) / (K1 + weightedTf);
}
