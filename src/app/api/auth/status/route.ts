import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tokens = request.cookies.get("google_calendar_tokens");
  return NextResponse.json({ authenticated: !!tokens?.value });
}
