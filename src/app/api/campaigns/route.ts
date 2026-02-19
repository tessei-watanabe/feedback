import { NextRequest, NextResponse } from "next/server";
import { readCampaignData } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userName = searchParams.get("userName");

    if (!userName) {
      return NextResponse.json(
        { error: "userName パラメータが必要です" },
        { status: 400 }
      );
    }

    const data = await readCampaignData(userName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Campaign data fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "キャンペーンデータの取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
