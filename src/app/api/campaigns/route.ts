import { NextRequest, NextResponse } from "next/server";
import { readCampaignData, readHistoricalCampaignData } from "@/lib/sheets";
import { generatePDCARecommendations } from "@/lib/recommendation";

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

    // 今日のデータと過去データを並列取得
    const [todayData, historyMap] = await Promise.all([
      readCampaignData(userName),
      readHistoricalCampaignData(userName, 7).catch((err) => {
        console.warn("[campaigns] 過去データ取得失敗（グレースフルデグレード）:", err.message);
        return new Map();
      }),
    ]);

    // 過去データがあればレコメンド生成
    let recommendations = null;
    if (historyMap.size > 0) {
      recommendations = generatePDCARecommendations(todayData.rows, historyMap);
    }

    return NextResponse.json({
      rows: todayData.rows,
      summary: todayData.summary,
      recommendations,
    });
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
