import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, encryptTokens } from "@/lib/google-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(`${appUrl}/report?auth_error=no_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const encrypted = encryptTokens(tokens);

    const response = NextResponse.redirect(`${appUrl}/report?auth_success=true`);
    response.cookies.set("google_calendar_tokens", encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(`${appUrl}/report?auth_error=token_exchange`);
  }
}
