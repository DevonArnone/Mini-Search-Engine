import { NextRequest, NextResponse } from "next/server";

import { runAutocomplete } from "@/lib/search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await runAutocomplete(q);
  return NextResponse.json({ suggestions });
}

