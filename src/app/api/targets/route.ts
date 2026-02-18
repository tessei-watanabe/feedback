import { NextResponse } from "next/server";
import { readTargetData } from "@/lib/sheets";

export async function GET() {
  try {
    const data = await readTargetData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Target data fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "目標データの取得中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
