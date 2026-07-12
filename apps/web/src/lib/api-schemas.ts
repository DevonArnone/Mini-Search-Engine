import { z } from "zod";

const CONTENT_TYPES = ["guide", "reference", "tutorial", "api", "blog"] as const;
const UPDATED_WITHIN = ["7d", "30d", "90d"] as const;
const boundedFilter = z.string().trim().min(1).max(100);
const filterList = z.array(boundedFilter).max(20).default([]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  source: filterList,
  contentType: z.array(z.enum(CONTENT_TYPES)).max(CONTENT_TYPES.length).default([]),
  domain: filterList,
  language: filterList,
  tags: filterList,
  sort: z.enum(["relevance", "newest", "oldest"]).default("relevance"),
  from: isoDate.optional(),
  to: isoDate.optional(),
  updatedWithin: z.enum(UPDATED_WITHIN).optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "The start date must be before the end date.",
  path: ["from"],
});

export const autocompleteSchema = z.object({
  q: z.string().trim().max(100).default(""),
});

export const clickEventSchema = z.object({
  searchId: z.string().uuid(),
  clickedDocumentId: z.string().uuid(),
  resultRank: z.number().int().min(1).max(10_000),
});

export type SearchRequest = z.infer<typeof searchSchema>;
