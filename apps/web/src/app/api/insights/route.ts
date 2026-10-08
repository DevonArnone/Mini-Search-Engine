import { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getInsights, parseInsightsPeriod } from "@/lib/insights";

export async function GET(request: NextRequest) {
  const period = parseInsightsPeriod(request.nextUrl.searchParams.get("period"));
  if (period === null) {
    return apiError("invalid_request", "period must be 7d, 30d, or 90d.", 400, { period: ["Expected 7d, 30d, or 90d"] });
  }
  return NextResponse.json(await getInsights(period));
}
