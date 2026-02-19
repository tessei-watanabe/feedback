import { google } from "googleapis";
import path from "path";
import type { ReportInput, FeedbackResult, TargetData, CampaignRow, CampaignSummary } from "@/types";

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
            "キャンペーン実績サマリー",
            "振り返り",
            "ネクストアクション",
            "スケジュール",
            "パターン",
            "報告の質(Lv)",
            "具体性(Lv)",
            "判断基準(Lv)",
            "検証設計(Lv)",
            "フェーズ認識(Lv)",
            "適用原則",
            "フィードバック本文",
            "月間達成率(%)",
            "日次達成率(%)",
            "伸長/停滞分類",
            "伸長リソース(Lv)",
            "停滞打開策(Lv)",
            "全体配分(Lv)",
          ],
        ],
      },
    });
  }

  // 「フィードバック」シートも確認（なければ同様に作成しない。日報データにまとめる）
}

function formatScheduleForSheet(schedule: ReportInput["schedule"]): string {
  if (!schedule || schedule.length === 0) return "未設定";
  return schedule
    .map((s) => {
      let line = `${s.startTime}〜${s.endTime}: ${s.title}`;
      if (s.actionPlanIndex != null) line += `（アクション${s.actionPlanIndex + 1}）`;
      if (s.description) line += ` / ${s.description}`;
      return line;
    })
    .join("\n");
}

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

function formatActionPlans(actionPlans: ReportInput["actionPlans"]): string {
  return actionPlans.map((plan, i) => {
    const parts: string[] = [];
    if (actionPlans.length > 1) parts.push(`【アクション${i + 1}】`);
    if (plan.resourceAllocation) parts.push(`リソース配分: ${plan.resourceAllocation}`);
    if (plan.creativeStrategy) parts.push(`CR戦略: ${plan.creativeStrategy}`);
    if (plan.creativeVision) parts.push(`CRイメージ: ${plan.creativeVision}`);
    if (plan.referenceUrls && plan.referenceUrls.length > 0) {
      parts.push(`参考URL: ${plan.referenceUrls.join(" / ")}`);
    }
    return parts.join("\n");
  }).join("\n\n");
}

/**
 * 円表記の文字列を数値に変換（例: "¥40,000,000" → 40000000）
 */
function parseCurrency(value: string | undefined | null): number {
  if (!value) return 0;
  return Number(String(value).replace(/[¥￥,、\s]/g, "")) || 0;
}

/**
 * パーセント文字列を数値に変換（例: "150.5%" → 150.5）
 */
function parsePercentage(value: string | undefined | null): number {
  if (!value) return 0;
  return Number(String(value).replace(/[%％\s]/g, "").replace(/,/g, "")) || 0;
}


const EMPTY_RESULT = { rows: [] as CampaignRow[], summary: { totalSpend: 0, totalCV: 0, totalMCV: 0, totalRevenue: 0, avgROAS: 0, campaignCount: 0 } };
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * スプレッドシートからデータ行を1回取得する
 * 更新中は全セルが空になるため、空データかどうかも返す
 */
async function fetchSheetRows(sheets: ReturnType<typeof getSheets>, spreadsheetId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'DB_今日(1-1-n)'!A:X",
  });
  const allRows = res.data.values || [];
  if (allRows.length <= 1) return { allRows, isEmpty: true };

  // 先頭数行のデータが全て空 → 更新中と判定
  const sampleEmpty = allRows.slice(1, Math.min(6, allRows.length)).every(
    (row) => !row || row.every((cell: string) => !cell)
  );
  return { allRows, isEmpty: sampleEmpty };
}

/**
 * キャンペーンスプレッドシートからデータを取得
 * CP名に今日の日付を含み、CP名にuserNameを含む行をフィルタ
 * 更新中（空データ）の場合は自動リトライする
 */
export async function readCampaignData(userName: string): Promise<{ rows: CampaignRow[]; summary: CampaignSummary }> {
  const spreadsheetId = process.env.GOOGLE_CAMPAIGN_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_CAMPAIGN_SPREADSHEET_ID is not set");

  const sheets = getSheets();

  // リトライ付きでシートデータを取得
  let allRows: string[][] = [];
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await fetchSheetRows(sheets, spreadsheetId);
    if (!result.isEmpty) {
      allRows = result.allRows;
      break;
    }
    // 最終試行でも空なら空のまま返す
    if (attempt === MAX_RETRIES) {
      console.warn(`[readCampaignData] データが空のまま${MAX_RETRIES + 1}回取得。更新中の可能性あり。`);
      return EMPTY_RESULT;
    }
    console.log(`[readCampaignData] 空データ検知（${attempt + 1}回目）。${RETRY_DELAY_MS}ms後にリトライ...`);
    await sleep(RETRY_DELAY_MS);
  }

  if (allRows.length <= 1) return EMPTY_RESULT;

  // ヘッダー行をスキップしてフィルタ
  const filtered: CampaignRow[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row) continue;

    const cpName = String(row[2] || ""); // C列: CP名
    const adsetName = String(row[3] || ""); // D列: アドセット名
    const productName = String(row[22] || ""); // W列: 商材名

    // D列が空の行のみ（CP合計行）。広告別内訳行はスキップして二重計上を防ぐ
    if (adsetName) continue;

    // フィルタ: CP名にuserNameを含む
    if (cpName.lastIndexOf(userName) !== -1) {
      filtered.push({
        cpName,
        spend: parseCurrency(row[5]),       // F列: 消化金額
        mediaCV: Number(row[6] || 0),       // G列: 媒体CV
        imp: Number(row[7] || 0),           // H列: imp
        click: Number(row[8] || 0),         // I列: click
        cpm: parseCurrency(row[14]),        // O列: CPM
        cpc: parseCurrency(row[15]),        // P列: CPC
        ctr: parsePercentage(row[16]),      // Q列: CTR
        mcvr: parsePercentage(row[17]),     // R列: MCVR
        cvr: parsePercentage(row[18]),      // S列: CVR
        cv: Number(row[19] || 0),           // T列: CV
        mcv: Number(row[20] || 0),          // U列: MCV
        roas: parsePercentage(row[21]),     // V列: ROAS
        productName,
        revenue: parseCurrency(row[23]),    // X列: 売上
      });
    }
  }

  // CP名の末尾番号（例: " 1", " 2"）を除いたベース名でグルーピング・合算
  const groupMap = new Map<string, CampaignRow>();
  for (const row of filtered) {
    // 末尾の空白+数字を除去してベース名を取得
    const baseName = row.cpName.replace(/\s+\d+$/, "");
    const existing = groupMap.get(baseName);
    if (existing) {
      existing.spend += row.spend;
      existing.mediaCV += row.mediaCV;
      existing.imp += row.imp;
      existing.click += row.click;
      existing.cv += row.cv;
      existing.mcv += row.mcv;
      existing.revenue += row.revenue;
    } else {
      groupMap.set(baseName, { ...row, cpName: baseName });
    }
  }

  // 合算後の派生指標を再計算
  const aggregated = Array.from(groupMap.values()).map((r) => ({
    ...r,
    cpm: r.imp > 0 ? Math.round((r.spend / r.imp) * 1000) : 0,
    cpc: r.click > 0 ? Math.round(r.spend / r.click) : 0,
    ctr: r.imp > 0 ? Math.round((r.click / r.imp) * 10000) / 100 : 0,
    mcvr: r.click > 0 ? Math.round((r.mcv / r.click) * 10000) / 100 : 0,
    cvr: r.click > 0 ? Math.round((r.cv / r.click) * 10000) / 100 : 0,
    roas: r.spend > 0 ? Math.round((r.revenue / r.spend) * 10000) / 100 : 0,
  }));

  // サマリーを計算
  const totalSpend = aggregated.reduce((sum, r) => sum + r.spend, 0);
  const totalCV = aggregated.reduce((sum, r) => sum + r.cv, 0);
  const totalMCV = aggregated.reduce((sum, r) => sum + r.mcv, 0);
  const totalRevenue = aggregated.reduce((sum, r) => sum + r.revenue, 0);
  const avgROAS = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 10000) / 100 : 0;

  return {
    rows: aggregated,
    summary: {
      totalSpend,
      totalCV,
      totalMCV,
      totalRevenue,
      avgROAS,
      campaignCount: filtered.length,
    },
  };
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

  // Layer 1 データ（O-T列）
  const l1 = result.layer1;
  const layer1Columns = l1
    ? [
        l1.progressSnapshot.achievementRate,
        l1.progressSnapshot.dailyAchievementRate,
        l1.campaignClassifications
          .map((c) => `${c.cpName}:${c.trend}`)
          .join(" / "),
        l1.growingResourceDecision.level,
        l1.stagnantCountermeasure.level,
        l1.overallResourceAllocation.level,
      ]
    : ["", "", "", "", "", ""];

  const row = [
    now,
    formatMetrics(input),
    input.analysis.campaignSummary
      ? `${input.analysis.campaignSummary.campaignCount}件 / 消化${input.analysis.campaignSummary.totalSpend.toLocaleString()}円 / CV${input.analysis.campaignSummary.totalCV} / MCV${input.analysis.campaignSummary.totalMCV} / 売上${input.analysis.campaignSummary.totalRevenue.toLocaleString()}円 / ROAS${input.analysis.campaignSummary.avgROAS}%`
      : "データなし",
    [
      ...input.analysis.campaignData.filter((r) => r.label === "new").map((r) =>
        `【新規】${r.cpName}: 検証=${r.testPurpose || ""} / 結果=${r.testResult || ""} / 解釈=${r.interpretation || ""}`
      ),
      ...input.analysis.campaignData.filter((r) => r.label === "existing").map((r) =>
        `【既存】${r.cpName}: 変化=${r.change || ""} / アクション=${r.nextAction || ""}`
      ),
    ].filter(Boolean).join("\n"),
    formatActionPlans(input.actionPlans),
    formatScheduleForSheet(input.schedule),
    result.pattern,
    result.evaluation.reportQuality.level,
    result.evaluation.actionSpecificity.level,
    result.evaluation.decisionCriteria.level,
    result.evaluation.verificationDesign.level,
    result.evaluation.phaseRecognition.level,
    result.appliedPrinciples.join(", "),
    result.feedback,
    ...layer1Columns,
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
