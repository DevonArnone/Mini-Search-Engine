import { NextResponse } from "next/server";

import { getInsights } from "@/lib/insights";

export async function GET() {
  return NextResponse.json(await getInsights());
}
