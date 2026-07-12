import { NextResponse } from "next/server";

import { getSources } from "@/lib/sources-service";

export async function GET() {
  return NextResponse.json(await getSources());
}
