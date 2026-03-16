import { NextResponse } from "next/server";

import { runFilterQuery } from "@/lib/search";

export async function GET() {
  const filters = await runFilterQuery();
  return NextResponse.json(filters);
}

