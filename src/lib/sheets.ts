import { google } from "googleapis";
import path from "path";
import type { ReportInput, FeedbackResult, TargetData } from "@/types";

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

function formatMetrics(input: ReportInput): string {
  const parts: string[] = [];

  // 目標データ（スプレッドシート連携）
  if (input.targetData) {
    const t = input.targetData;
    parts.push(`【${t.month} 月間】目標${t.summary.target.toLocaleString()} / 実績${t.summary.actual.toLocaleString()} / 差分${t.summary.gap.toLocaleString()}`);
    for (const p of t.projects) {
      parts.push(`  ${p.name}(${p.medium}): 月目標${p.monthlyTarget.toLocaleString()} / 実績${p.monthlyActual.toLocaleString()}`);
    }
  }

  // 手入力数値（legacy）
  if (input.metrics && input.metrics.length > 0 && input.metrics[0].projectName) {
    for (const project of input.metrics) {
      const channels = project.channels
        .map(
          (ch) =>
            `  ${ch.channelName}: 消化${ch.spend} / 売上${ch.revenue} / 粗利${ch.grossProfit}`
        )
        .join("\n");
      parts.push(`【${project.projectName}】\n${channels}`);
    }
  }

  return parts.join("\n");
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
 * 円表記の文字列を数値に変換（例: "¥40,000,000" → 40000000）
 */
function parseCurrency(value: string | undefined | null): number {
  if (!value) return 0;
  return Number(String(value).replace(/[¥￥,、\s]/g, "")) || 0;
}

/**
 * 目標スプレッドシートからデータを取得
 */
export async function readTargetData(): Promise<TargetData> {
  const spreadsheetId = process.env.GOOGLE_TARGET_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_TARGET_SPREADSHEET_ID is not set");

  const sheets = getSheets();

  // シート全体を取得（A1:G50の範囲で十分）
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "目標!A1:G50",
  });

  const rows = res.data.values || [];

  // Row 2 (index 1): 月合計サマリー
  // B: "2月合計", C: 目標, D: 実績, E: 差分, F: 残日数あたり
  const summaryRow = rows[1] || [];
  const monthLabel = String(summaryRow[1] || "");
  // 月名を抽出（例: "2月合計" → "2026年02月"）
  const now = new Date();
  const monthMatch = monthLabel.match(/(\d+)月/);
  const monthNum = monthMatch ? parseInt(monthMatch[1]) : now.getMonth() + 1;
  const month = `${now.getFullYear()}年${String(monthNum).padStart(2, "0")}月`;

  const summary = {
    target: parseCurrency(summaryRow[2]),
    actual: parseCurrency(summaryRow[3]),
    gap: parseCurrency(summaryRow[4]),
    perRemainingDay: parseCurrency(summaryRow[5]),
  };

  // Row 3-6 (index 2-5): 週別データ
  const weekly = [];
  for (let i = 2; i <= 5; i++) {
    const row = rows[i];
    if (!row || !row[1]) break;
    const period = String(row[1] || "");
    // 空行や非週データをスキップ
    if (!period.includes("〜") && !period.includes("~")) break;
    weekly.push({
      period,
      target: parseCurrency(row[2]),
      actual: parseCurrency(row[3]),
      gap: parseCurrency(row[4]),
    });
  }

  // Row 10以降 (index 9~): 案件別データ
  // Row 9 (index 8): ヘッダー: A:案件名, B:媒体, C:月目標, D:週目標, E:日目標, F:月実績, G:残日数あたり
  // Row 10 (index 9): 合計行（スキップ）
  const projects = [];
  for (let i = 10; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) break; // 空行で終了
    projects.push({
      name: String(row[0] || ""),
      medium: String(row[1] || ""),
      monthlyTarget: parseCurrency(row[2]),
      weeklyTarget: parseCurrency(row[3]),
      dailyTarget: parseCurrency(row[4]),
      monthlyActual: parseCurrency(row[5]),
      perRemainingDay: parseCurrency(row[6]),
    });
  }

  return { month, summary, weekly, projects };
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
    formatMetrics(input),
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
