import { NextResponse } from "next/server";

import { apiError, ServiceUnavailableError } from "@/lib/api";
import { runFilterQuery } from "@/lib/search";

export async function GET() {
  try {
    return NextResponse.json(await runFilterQuery());
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return apiError("filters_unavailable", "Search filters are temporarily unavailable.", 503);
    }
    return apiError("filters_failed", "Search filters could not be loaded.", 500);
  }
}
