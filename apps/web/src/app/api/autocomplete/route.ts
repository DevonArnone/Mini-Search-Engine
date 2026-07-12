import { NextRequest, NextResponse } from "next/server";

import { apiError, ServiceUnavailableError, validationError } from "@/lib/api";
import { autocompleteSchema } from "@/lib/api-schemas";
import { runAutocomplete } from "@/lib/search";

export async function GET(request: NextRequest) {
  const parsed = autocompleteSchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success) return validationError(parsed.error);

  try {
    const suggestions = await runAutocomplete(parsed.data.q);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return apiError("autocomplete_unavailable", "Suggestions are temporarily unavailable.", 503);
    }
    return apiError("autocomplete_failed", "Suggestions could not be loaded.", 500);
  }
}
