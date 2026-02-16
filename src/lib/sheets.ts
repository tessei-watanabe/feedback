import { google } from "googleapis";
import path from "path";
import type { ReportInput, FeedbackResult } from "@/types";

function getAuth() {
  // Vercel: 環境変数にJSON文字列として格納
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return auth;
  }

  // ローカル: ファイルから読み込み
  const credentialsPath =
    process.env.GOOGLE_CREDENTIALS_PATH || "./feedback-487523-c7a1be5a16c7.json";
  const absolutePath = path.resolve(credentialsPath);

  const auth = new google.auth.GoogleAuth({
    keyFile: absolutePath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth;
}

function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

/**
 * スプレッドシートの初期化（ヘッダー行がなければ作成）
 */
async function ensureHeaders(sheets: ReturnType<typeof getSheets>) {
  if (!SPREADSHEET_ID) throw new Error("GOOGLE_SPREADSHEET_ID is not set");

  // シート一覧を取得
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheetNames = spreadsheet.data.sheets?.map(
    (s) => s.properties?.title
  ) || [];

  // 「日報データ」シートがなければ作成
  if (!sheetNames.includes("日報データ")) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: "日報データ" },
            },
          },
        ],
      },
    });

    // ヘッダー行を追加
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "日報データ!A1:T1",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "日時",
            "案件・数値実績",
            "分析（主因）",
            "分析（詳細）",
            "損切りライン",
            "日次消化上限",
            "拡大条件",
            "撤退条件",
            "ルール未設定",
            "アクション一覧",
            "フェーズ",
            "フェーズ理由",
            "パターン",
            "報告の質(Lv)",
            "具体性(Lv)",
            "判断基準(Lv)",
            "検証設計(Lv)",
            "フェーズ認識(Lv)",
            "適用原則",
            "フィードバック本文",
          ],
        ],
      },
    });
  }

  // 「フィードバック」シートも確認（なければ同様に作成しない。日報データにまとめる）
}

const CAUSE_LABELS: Record<string, string> = {
  creative: "CR（クリエイティブ）の問題",
  operation: "運用設定の問題",
  market: "市場・外部環境の変化",
  resource: "リソース不足",
  unidentified: "まだ特定できていない",
};

const PHASE_LABELS: Record<string, string> = {
  creative_production: "CR制作（新しい当たりを見つける段階）",
  operation_optimization: "運用最適化（当たりCRを伸ばす段階）",
  testing: "検証・テスト（仮説を確かめる段階）",
  channel_expansion: "媒体開拓（新しいチャネルを開く段階）",
};

function formatMetrics(metrics: ReportInput["metrics"]): string {
  return metrics
    .map((project) => {
      const channels = project.channels
        .map(
          (ch) =>
            `  ${ch.channelName}: 消化${ch.spend} / 売上${ch.revenue} / 粗利${ch.grossProfit}`
        )
        .join("\n");
      return `【${project.projectName}】\n${channels}`;
    })
    .join("\n");
}

function formatActions(actions: ReportInput["actions"]): string {
  return actions
    .map(
      (a, i) =>
        `[${i + 1}] ${a.projectName} / ${a.medium}: ${a.action}（検証: ${a.verificationGoal}）`
    )
    .join("\n");
}

/**
 * 日報の入力データとフィードバック結果をスプレッドシートに保存
 */
export async function saveToSpreadsheet(
  input: ReportInput,
  result: FeedbackResult
): Promise<void> {
  if (!SPREADSHEET_ID) {
    console.warn("GOOGLE_SPREADSHEET_ID is not set, skipping save");
    return;
  }

  const sheets = getSheets();

  // ヘッダーの存在を確認・作成
  await ensureHeaders(sheets);

  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const row = [
    now,
    formatMetrics(input.metrics),
    CAUSE_LABELS[input.analysis.primaryCause] || input.analysis.primaryCause,
    input.analysis.detail,
    input.decisionRules.cutLossLine,
    input.decisionRules.dailySpendCap,
    input.decisionRules.scaleUpCondition,
    input.decisionRules.exitCondition,
    input.decisionRules.hasNoRules ? "はい" : "いいえ",
    formatActions(input.actions),
    PHASE_LABELS[input.phaseRecognition.currentPhase] ||
      input.phaseRecognition.currentPhase,
    input.phaseRecognition.reason,
    result.pattern,
    result.evaluation.reportQuality.level,
    result.evaluation.actionSpecificity.level,
    result.evaluation.decisionCriteria.level,
    result.evaluation.verificationDesign.level,
    result.evaluation.phaseRecognition.level,
    result.appliedPrinciples.join(", "),
    result.feedback,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "日報データ!A:T",
    valueInputOption: "RAW",
    requestBody: {
      values: [row],
    },
  });
}
