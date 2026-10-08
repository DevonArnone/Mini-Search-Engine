import React from "react";

import { SOURCE_BY_SLUG } from "@/lib/sources";

const SIZES = {
  sm: "h-6 min-w-6 px-1 text-[0.625rem]",
  md: "h-8 min-w-8 px-1.5 text-2xs",
  lg: "h-11 min-w-11 px-2 text-xs",
} as const;

// A swatch of the source's bookcloth stamped with its short mark.
export function SourceMark({ slug, size = "md" }: { slug: string; size?: keyof typeof SIZES }) {
  const source = SOURCE_BY_SLUG.get(slug);
  return (
    <span aria-hidden className={`cloth-mark ${SIZES[size]}`} data-source={slug}>
      {source?.mark ?? slug.slice(0, 2).toUpperCase()}
    </span>
  );
}
