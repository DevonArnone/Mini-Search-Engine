import { NextRequest, NextResponse } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { clickEventSchema } from "@/lib/api-schemas";
import { recordClick } from "@/lib/analytics";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json", "The request body must be valid JSON.", 400);
  }

  const parsed = clickEventSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const sessionId = request.cookies.get("devdocs_session")?.value ?? null;
    const recorded = await recordClick(parsed.data.searchId, sessionId, parsed.data.clickedDocumentId, parsed.data.resultRank);
    if (!recorded) return apiError("unknown_search", "No search event matches this click.", 404);
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("analytics_unavailable", "The analytics event could not be recorded.", 503);
  }
}
