import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-oauth";

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    console.error("OAuth URL generation error:", error);
    return NextResponse.json(
      { error: "OAuth URLの生成に失敗しました" },
      { status: 500 }
    );
  }
}
