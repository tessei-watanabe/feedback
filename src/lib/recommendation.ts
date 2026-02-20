import type {
  CampaignRow,
  HistoricalCampaignDay,
  ROASTier,
  ROASTrend,
  ChangeLever,
  CampaignRecommendation,
  CampaignGroupRecommendation,
  RestartRecommendation,
  PDCARecommendations,
  CreativeMember,
  CreativeGroupRecommendation,
  CreativeAction,
  CreativeHistoricalMetrics,
  CreativeHistoricalComparison,
  BudgetAction,
  BudgetRecommendation,
} from "@/types";

/**
 * CP名からグループ名を抽出（_tCPA等を除去）
 */
function toGroupName(cpName: string): string {
  return cpName.replace(/[_\s]?t?CPA\d*/i, "").trim();
}

/**
 * ROASTierを判定
 */
function classifyROAS(roas: number): ROASTier {
  if (roas >= 200) return "high";
  if (roas >= 130) return "medium";
  return "low";
}

/**
 * 過去データ + 今日のROASからトレンドを算出
 */
function computeROASTrend(
  history: HistoricalCampaignDay[],
  todayROAS: number
): ROASTrend {
  // 直近3日分を取得（historyは日付昇順）
  const recent3 = history.slice(-3);

  // 3日平均ROAS
  const roasValues = recent3.map((d) => d.roas);
  const avg3Day =
    roasValues.length > 0
      ? Math.round((roasValues.reduce((a, b) => a + b, 0) / roasValues.length) * 100) / 100
      : todayROAS;

  // 前日比変化率
  const yesterday = recent3.length > 0 ? recent3[recent3.length - 1].roas : todayROAS;
  const dayOverDay =
    yesterday > 0
      ? Math.round(((todayROAS - yesterday) / yesterday) * 10000) / 100
      : 0;

  // 3日間変化率（最古の日 → 今日）
  const oldest = recent3.length > 0 ? recent3[0].roas : todayROAS;
  const threeDayChange =
    oldest > 0
      ? Math.round(((todayROAS - oldest) / oldest) * 10000) / 100
      : 0;

  // トレンド判定
  let trend: "up" | "flat" | "down";
  if (dayOverDay > 10) trend = "up";
  else if (dayOverDay < -10) trend = "down";
  else trend = "flat";

  return {
    tier: classifyROAS(avg3Day),
    avg3Day,
    dayOverDay,
    threeDayChange,
    trend,
  };
}

/**
 * レバー判定: 運用要因 or CR要因
 * - CP名に日付パターンがあり直近2日で新しい日付 → 入稿あり
 * - 入稿あり + ROAS下降 → creative
 * - 入稿なし + ROAS変動 → operation
 */
function determineChangeLever(
  cpName: string,
  history: HistoricalCampaignDay[],
  roasTrend: ROASTrend
): { lever: ChangeLever; reasoning: string } {
  // CP名から日付パターンを検出して最新の入稿日を推定
  const datePattern = /(\d{1,2})[/\-](\d{1,2})/g;
  let latestMatch: { m: number; d: number } | null = null;
  let m;
  while ((m = datePattern.exec(cpName)) !== null) {
    latestMatch = { m: parseInt(m[1], 10), d: parseInt(m[2], 10) };
  }

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  // 直近2日以内に入稿があるか判定
  const hasRecentSubmission =
    latestMatch != null &&
    latestMatch.m === todayMonth &&
    (todayDay - latestMatch.d >= 0 && todayDay - latestMatch.d <= 2);

  if (hasRecentSubmission && roasTrend.trend === "down") {
    return {
      lever: "creative",
      reasoning: `直近で新規入稿あり（${latestMatch!.m}/${latestMatch!.d}）、ROAS下降傾向（前日比${roasTrend.dayOverDay > 0 ? "+" : ""}${roasTrend.dayOverDay}%）→ CR側の要因`,
    };
  }

  if (!hasRecentSubmission && (roasTrend.trend === "up" || roasTrend.trend === "down")) {
    return {
      lever: "operation",
      reasoning: `追加入稿なし、ROAS${roasTrend.trend === "up" ? "上昇" : "下降"}傾向（前日比${roasTrend.dayOverDay > 0 ? "+" : ""}${roasTrend.dayOverDay}%）→ 運用側の要因`,
    };
  }

  // デフォルト
  return {
    lever: hasRecentSubmission ? "creative" : "operation",
    reasoning: hasRecentSubmission
      ? `新規入稿あり、ROAS横ばい → CR効果の経過観察中`
      : `追加入稿なし、ROAS横ばい → 運用調整で改善余地を検討`,
  };
}

/**
 * ROASTierに基づく変化サマリーテキスト生成
 */
function generateChangeText(
  cpName: string,
  roasTrend: ROASTrend,
  todayROAS: number,
  lever: ChangeLever
): string {
  const trendLabel = roasTrend.trend === "up" ? "上昇" : roasTrend.trend === "down" ? "下降" : "横ばい";
  const parts: string[] = [];

  parts.push(`ROAS ${roasTrend.avg3Day}%（3日平均）→ 今日${todayROAS}%（${trendLabel}）`);

  if (roasTrend.dayOverDay !== 0) {
    parts.push(`前日比${roasTrend.dayOverDay > 0 ? "+" : ""}${roasTrend.dayOverDay}%`);
  }

  parts.push(`要因: ${lever === "creative" ? "CR側" : "運用側"}`);

  return parts.join("。");
}

/**
 * ROASTierに基づくアクションテキスト生成
 */
function generateActionText(
  roasTrend: ROASTrend,
  lever: ChangeLever
): string {
  const actions: Record<ROASTier, Record<ChangeLever, string>> = {
    high: {
      operation: "予算増額を検討。tCPA引上げで配信量拡大。好調維持のため大幅な変更は控える。",
      creative: "好調CRの横展開・追加投入。予算増額で配信量を拡大。",
    },
    medium: {
      operation: "予算据え置き。tCPA微減で利益率改善を図る。配信面の最適化を確認。",
      creative: "CR刷新でCTR/CVR改善を狙う。A/Bテスト継続。",
    },
    low: {
      operation: "tCPA引下げ。追加入稿は控え、既存CRの精査。損切りライン確認。",
      creative: "CR刷新注力。訴求軸・構成の抜本的見直し。追加入稿なしで既存を最適化。",
    },
  };

  return actions[roasTrend.tier][lever];
}

// ===== クリエイティブ単位グルーピング =====

/**
 * CP名からクリエイティブキーを抽出（日付・入札戦略・末尾サフィックスを除去）
 */
export function extractCreativeKey(cpName: string): string {
  // ASC入札戦略の検出（スタンドアロン or CVMAX/tCPAとの連結）
  // ※ SBHASCall, ASCMDOまとめ等のCR名一部は検出しない
  const hasASC = /(^|\s)ASC(?=\s|$|CVMAX|tCPA)/i.test(cpName);

  const key = cpName
    .replace(/\d{1,2}\/\d{1,2}/g, "")          // 日付パターン M/D 除去
    .replace(/CVMAX/g, "")                      // CVMAX除去 (グローバル: ASCCVMAX等の連結対応)
    .replace(/\sASC(?=\s|$)/g, "")              // スタンドアロンASC除去
    .replace(/(?:^|\s)tCPA[=＝]?\d*/g, "")      // tCPA=XXXX除去
    .replace(/CPA\d+/g, "")                     // 埋め込みCPA入札額除去 (RectCPA2400LINE → RectLINE)
    .replace(/類似/g, "")                        // 「類似」除去 (辞表漫画LINE類似 → 辞表漫画LINE)
    .replace(/LINE\S+/g, "LINE")                // LINE後の任意サフィックス除去 (RectLINEtest → RectLINE)
    .replace(/\d+%/g, "")                       // パーセンテージ除去 (3%等の入札パラメータ)
    .replace(/\s+[\da-zA-Z]+$/, "")             // 末尾の英数字サフィックス除去
    .replace(/\s+/g, " ")
    .trim();

  return hasASC ? `${key} ASC` : key;
}

/**
 * CP名からM/Dパターンの日付を全抽出
 */
function extractSubmissionDates(cpName: string): string[] {
  const dates: string[] = [];
  const pattern = /(\d{1,2})\/(\d{1,2})/g;
  let m;
  while ((m = pattern.exec(cpName)) !== null) {
    dates.push(`${m[1]}/${m[2]}`);
  }
  return dates;
}

/**
 * 日付群のうち、直近N日以内の入稿があるか判定
 */
function isRecentSubmission(dates: string[], thresholdDays = 2): boolean {
  if (dates.length === 0) return false;
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  return dates.some((d) => {
    const parts = d.split("/");
    const m = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    return m === todayMonth && todayDay - day >= 0 && todayDay - day <= thresholdDays;
  });
}

/**
 * クリエイティブキーでグルーピング
 */
function groupByCreative(
  todayCampaigns: CampaignRow[]
): Map<string, CampaignRow[]> {
  const groups = new Map<string, CampaignRow[]>();
  for (const cp of todayCampaigns) {
    const key = extractCreativeKey(cp.cpName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cp);
  }
  return groups;
}

/**
 * 履歴データをクリエイティブキーで再集約
 */
function aggregateHistoryByCreativeKey(
  historyMap: Map<string, HistoricalCampaignDay[]>
): Map<string, HistoricalCampaignDay[]> {
  // クリエイティブキー → 日付 → 合算データ
  const result = new Map<string, Map<string, HistoricalCampaignDay>>();

  for (const [baseName, days] of historyMap) {
    const creativeKey = extractCreativeKey(baseName);
    if (!result.has(creativeKey)) result.set(creativeKey, new Map());
    const dateMap = result.get(creativeKey)!;

    for (const day of days) {
      const existing = dateMap.get(day.date);
      if (existing) {
        const existRev = existing.spend * existing.roas / 100;
        const newRev = day.spend * day.roas / 100;
        existing.spend += day.spend;
        existing.cv += day.cv;
        existing.mcv += day.mcv;
        existing.imp += day.imp;
        existing.click += day.click;
        const totalRev = existRev + newRev;
        existing.roas = existing.spend > 0 ? Math.round((totalRev / existing.spend) * 10000) / 100 : 0;
        existing.cpa = existing.cv > 0 ? Math.round(existing.spend / existing.cv) : 0;
      } else {
        dateMap.set(day.date, { ...day, cpName: creativeKey });
      }
    }
  }

  const output = new Map<string, HistoricalCampaignDay[]>();
  for (const [key, dateMap] of result) {
    output.set(key, Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return output;
}

/**
 * 履歴比較データを算出
 */
function computeCreativeHistoricalComparison(
  history: HistoricalCampaignDay[],
  todayMetrics: { spend: number; cv: number; revenue: number; roas: number }
): CreativeHistoricalComparison | null {
  if (history.length === 0) return null;

  const calcMetrics = (days: HistoricalCampaignDay[]): CreativeHistoricalMetrics | null => {
    if (days.length === 0) return null;
    const totalSpend = days.reduce((s, d) => s + d.spend, 0);
    const totalCv = days.reduce((s, d) => s + d.cv, 0);
    const totalRevenue = days.reduce((s, d) => s + d.spend * d.roas / 100, 0);
    const avgSpend = Math.round(totalSpend / days.length);
    const avgCv = Math.round((totalCv / days.length) * 10) / 10;
    const avgRevenue = Math.round(totalRevenue / days.length);
    const roas = avgSpend > 0 ? Math.round((avgRevenue / avgSpend) * 10000) / 100 : 0;
    return { spend: avgSpend, cv: avgCv, revenue: avgRevenue, roas };
  };

  const avg7Day = calcMetrics(history);
  const recent3 = history.slice(-3);
  const avg3Day = calcMetrics(recent3);
  const yesterdayData = history.length > 0 ? history[history.length - 1] : null;
  const yesterday: CreativeHistoricalMetrics | null = yesterdayData
    ? {
        spend: yesterdayData.spend,
        cv: yesterdayData.cv,
        revenue: Math.round(yesterdayData.spend * yesterdayData.roas / 100),
        roas: yesterdayData.roas,
      }
    : null;

  return {
    avg7Day,
    avg3Day,
    yesterday,
    today: todayMetrics,
  };
}

/**
 * 予算レコメンド判定
 */
function computeBudgetRecommendation(
  comparison: CreativeHistoricalComparison,
  todaySpend: number
): BudgetRecommendation {
  const roasToday = comparison.today.roas;
  const roas3d = comparison.avg3Day?.roas ?? roasToday;
  const roas7d = comparison.avg7Day?.roas ?? roasToday;

  // 1. 赤字 → STOP
  if (roasToday < 100 && roas3d < 100) {
    return {
      action: "stop",
      percentChange: -100,
      targetSpend: 0,
      reasoning: `今日ROAS ${roasToday}%、3日平均 ${roas3d}%。赤字のため配信停止推奨。`,
    };
  }

  // 2. 7日好調だが直近悪化 → DECREASE
  if (roas7d >= 150 && roas3d < roas7d * 0.8) {
    const target = Math.round(todaySpend * 0.8);
    return {
      action: "decrease",
      percentChange: -20,
      targetSpend: target,
      reasoning: `7日平均ROAS ${roas7d}%は好調だが、3日平均 ${roas3d}%に悪化。CR疲弊の可能性。`,
    };
  }

  // 3. 利益率低い → DECREASE
  if (roasToday < 130 && roas3d < 130) {
    const target = Math.round(todaySpend * 0.85);
    return {
      action: "decrease",
      percentChange: -15,
      targetSpend: target,
      reasoning: `今日ROAS ${roasToday}%、3日平均 ${roas3d}%。利益率が低いため予算縮小推奨。`,
    };
  }

  // 4. 好調 → INCREASE
  if (roasToday >= 200 && roas3d >= 180) {
    const pct = roasToday >= 250 ? 30 : 20;
    const target = Math.round(todaySpend * (1 + pct / 100));
    return {
      action: "increase",
      percentChange: pct,
      targetSpend: target,
      reasoning: `今日ROAS ${roasToday}%、3日平均 ${roas3d}%。好調のため積極投資推奨。`,
    };
  }

  // 5. 現状維持
  return {
    action: "maintain",
    percentChange: 0,
    targetSpend: todaySpend,
    reasoning: `今日ROAS ${roasToday}%、3日平均 ${roas3d}%、7日平均 ${roas7d}%。現状維持。`,
  };
}

/**
 * 自動changeテキスト生成
 */
function generateAutoChangeText(
  comparison: CreativeHistoricalComparison
): string {
  const t = comparison.today;
  const y = comparison.yesterday;
  const avg7 = comparison.avg7Day;
  const avg3 = comparison.avg3Day;

  let changeVsYesterday = "";
  if (y) {
    const pct = y.spend > 0 ? Math.round(((t.spend - y.spend) / y.spend) * 100) : 0;
    changeVsYesterday = ` (${pct >= 0 ? "+" : ""}${pct}% vs 昨日)`;
  }

  const parts = [`本日消化¥${t.spend.toLocaleString()}${changeVsYesterday}`];
  parts.push(`ROAS: 今日${t.roas}%`);
  if (avg7) parts[parts.length - 1] += `, 7日平均${avg7.roas}%`;
  if (avg3) parts[parts.length - 1] += `, 3日平均${avg3.roas}%`;
  parts.push(`CV ${t.cv}件`);

  return parts.join("。");
}

/**
 * 自動nextActionテキスト生成
 */
function generateAutoNextActionText(
  budget: BudgetRecommendation,
  crAction: CreativeAction
): string {
  const budgetText: Record<BudgetAction, string> = {
    increase: `予算増額(+${budget.percentChange}%)、目安消化¥${budget.targetSpend.toLocaleString()}`,
    decrease: `予算縮小(${budget.percentChange}%)、目安消化¥${budget.targetSpend.toLocaleString()}`,
    maintain: `予算現状維持、消化¥${budget.targetSpend.toLocaleString()}`,
    stop: "配信停止推奨",
  };

  const crText: Record<CreativeAction, string> = {
    keep_old: "既存CR維持、追加入稿は控える",
    add_new: "追加入稿を継続",
    stop_new: "新規入稿停止、既存CRの精査",
    scale_both: "新旧両方の予算拡大",
    monitor: "経過観察",
  };

  return `${budgetText[budget.action]}。${crText[crAction]}。${budget.reasoning}`;
}

/**
 * クリエイティブグループのレコメンドを生成
 */
function generateCreativeRecommendation(
  creativeKey: string,
  members: CampaignRow[],
  history: HistoricalCampaignDay[]
): CreativeGroupRecommendation {
  // メンバー情報を構築
  const creativeMembers: CreativeMember[] = members.map((cp) => {
    const dates = extractSubmissionDates(cp.cpName);
    return {
      cpName: cp.cpName,
      submissionDates: dates,
      isRecent: isRecentSubmission(dates),
      spend: cp.spend,
      cv: cp.cv,
      revenue: cp.revenue,
      roas: cp.roas,
    };
  });

  // 商材名（最初のメンバーから）
  const productName = members[0]?.productName || "";

  // クリエイティブ名 = キーから商材名プレフィックスを除去した部分
  const creativeName = creativeKey.startsWith(productName)
    ? creativeKey.slice(productName.length).trim()
    : creativeKey;

  // 合算指標
  const combinedSpend = members.reduce((s, m) => s + m.spend, 0);
  const combinedRevenue = members.reduce((s, m) => s + m.revenue, 0);
  const combinedCV = members.reduce((s, m) => s + m.cv, 0);
  const combinedROAS = combinedSpend > 0
    ? Math.round((combinedRevenue / combinedSpend) * 10000) / 100
    : 0;

  // 新旧分割
  const oldMembers = creativeMembers.filter((m) => !m.isRecent);
  const newMembers = creativeMembers.filter((m) => m.isRecent);

  const calcMetrics = (list: CreativeMember[]) => {
    if (list.length === 0) return null;
    const spend = list.reduce((s, m) => s + m.spend, 0);
    const revenue = list.reduce((s, m) => s + m.revenue, 0);
    const cv = list.reduce((s, m) => s + m.cv, 0);
    const roas = spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : 0;
    return { spend, revenue, cv, roas };
  };

  const oldMetrics = calcMetrics(oldMembers);
  const newMetrics = calcMetrics(newMembers);

  // レコメンドロジック
  let action: CreativeAction = "monitor";
  let recommendation = "";

  const oldROAS = oldMetrics?.roas ?? 0;
  const newROAS = newMetrics?.roas ?? 0;

  if (oldMetrics && newMetrics) {
    // 新旧両方ある場合
    if (oldROAS >= 200 && newROAS < oldROAS * 0.7) {
      action = "keep_old";
      recommendation = `過去CPが好調（ROAS ${oldROAS}%）。新規入稿（ROAS ${newROAS}%）のインパクトは薄い。過去CPは学習蓄積により安定。追加入稿より既存CPの予算拡大を推奨。`;
    } else if (oldROAS >= 200 && newROAS >= oldROAS * 0.7) {
      action = "scale_both";
      recommendation = `過去CP（ROAS ${oldROAS}%）・新規入稿（ROAS ${newROAS}%）ともに好調。両方の予算拡大を推奨。`;
    } else if (newROAS > oldROAS && newROAS >= 150) {
      action = "add_new";
      recommendation = `新規入稿（ROAS ${newROAS}%）が過去CP（ROAS ${oldROAS}%）を上回っている。追加入稿を継続推奨。ただし過去CPの学習蓄積効果が低下した可能性も考慮。`;
    } else if (newROAS < 100) {
      action = "stop_new";
      recommendation = `新規入稿のROAS ${newROAS}%が低迷。追加入稿を停止し、既存CRの精査を推奨。`;
    } else {
      action = "monitor";
      recommendation = `経過観察。合算ROAS ${combinedROAS}%。新旧の差分は軽微。`;
    }
  } else if (oldMetrics && !newMetrics) {
    // 過去CPのみ
    if (oldROAS >= 200) {
      action = "keep_old";
      recommendation = `過去CPのみ稼働中（ROAS ${oldROAS}%）。好調維持。予算拡大を検討。`;
    } else {
      action = "monitor";
      recommendation = `過去CPのみ稼働中（ROAS ${oldROAS}%）。経過観察。`;
    }
  } else if (!oldMetrics && newMetrics) {
    // 新規入稿のみ
    if (newROAS >= 150) {
      action = "add_new";
      recommendation = `新規入稿のみ（ROAS ${newROAS}%）。好調なため継続推奨。`;
    } else if (newROAS < 100) {
      action = "stop_new";
      recommendation = `新規入稿のみ（ROAS ${newROAS}%）。低迷のため精査推奨。`;
    } else {
      action = "monitor";
      recommendation = `新規入稿のみ（ROAS ${newROAS}%）。経過観察。`;
    }
  }

  // 履歴比較 & 予算レコメンド
  const todayMetrics = { spend: combinedSpend, cv: combinedCV, revenue: combinedRevenue, roas: combinedROAS };
  const historicalComparison = computeCreativeHistoricalComparison(history, todayMetrics);
  const budgetRecommendation = historicalComparison
    ? computeBudgetRecommendation(historicalComparison, combinedSpend)
    : null;
  const autoChange = historicalComparison
    ? generateAutoChangeText(historicalComparison)
    : `本日消化¥${combinedSpend.toLocaleString()}。ROAS: 今日${combinedROAS}%。CV ${combinedCV}件`;
  const autoNextAction = budgetRecommendation
    ? generateAutoNextActionText(budgetRecommendation, action)
    : recommendation;

  return {
    creativeKey,
    productName,
    creativeName,
    members: creativeMembers,
    combinedSpend,
    combinedRevenue,
    combinedROAS,
    combinedCV,
    oldMetrics,
    newMetrics,
    action,
    recommendation,
    historicalComparison,
    budgetRecommendation,
    autoChange,
    autoNextAction,
  };
}

/**
 * キャンペーングルーピング（旧: tCPA除去ベース）
 */
function groupCampaigns(
  todayCampaigns: CampaignRow[]
): Map<string, CampaignRow[]> {
  const groups = new Map<string, CampaignRow[]>();
  for (const cp of todayCampaigns) {
    const groupName = toGroupName(cp.cpName);
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(cp);
  }
  return groups;
}

/**
 * 停止CP再開候補を検出
 * 過去7日にデータがあるが今日のデータがないCP
 */
function findRestartCandidates(
  todayCampaigns: CampaignRow[],
  historyMap: Map<string, HistoricalCampaignDay[]>
): RestartRecommendation[] {
  const todayNames = new Set(todayCampaigns.map((c) => c.cpName));
  // tCPA除去したグループ名でも今日のデータがあればスキップ
  const todayGroupNames = new Set(todayCampaigns.map((c) => toGroupName(c.cpName)));

  const restarts: RestartRecommendation[] = [];

  for (const [baseName, days] of historyMap) {
    // 今日のデータがあればスキップ
    if (todayNames.has(baseName) || todayGroupNames.has(toGroupName(baseName))) continue;

    if (days.length === 0) continue;

    const avgROAS =
      Math.round(
        (days.reduce((sum, d) => sum + d.roas, 0) / days.length) * 100
      ) / 100;
    const peakROAS = Math.max(...days.map((d) => d.roas));
    const lastDay = days[days.length - 1];

    // 7日平均ROASが130%以上なら再開推奨
    if (avgROAS >= 130) {
      restarts.push({
        cpName: baseName,
        lastActiveDate: lastDay.date,
        peakROAS,
        avgROAS7Day: avgROAS,
        reason: `過去7日平均ROAS ${avgROAS}%（ピーク${peakROAS}%）。停止中だが再開検討の余地あり。`,
      });
    }
  }

  return restarts.sort((a, b) => b.avgROAS7Day - a.avgROAS7Day);
}

/**
 * PDCAレコメンドを生成するメインエントリポイント
 */
export function generatePDCARecommendations(
  todayCampaigns: CampaignRow[],
  historyMap: Map<string, HistoricalCampaignDay[]>
): PDCARecommendations {
  // 個別CPレコメンド
  const campaignRecommendations: CampaignRecommendation[] = [];
  const groups = groupCampaigns(todayCampaigns);

  for (const cp of todayCampaigns) {
    // 過去データを取得（ベース名とグループ名の両方で探す）
    const history =
      historyMap.get(cp.cpName) ||
      historyMap.get(toGroupName(cp.cpName)) ||
      [];

    const roasTrend = computeROASTrend(history, cp.roas);
    const { lever, reasoning } = determineChangeLever(cp.cpName, history, roasTrend);
    const change = generateChangeText(cp.cpName, roasTrend, cp.roas, lever);
    const nextAction = generateActionText(roasTrend, lever);

    // グループ内スタンドアウト判定
    const groupName = toGroupName(cp.cpName);
    const groupMembers = groups.get(groupName) || [cp];
    const isStandout =
      groupMembers.length > 1 && cp.roas >= 200 && roasTrend.tier === "high";

    campaignRecommendations.push({
      cpName: cp.cpName,
      roasTrend,
      lever,
      leverReasoning: reasoning,
      change,
      nextAction,
      isStandout,
      groupName: groupMembers.length > 1 ? groupName : undefined,
      history,
    });
  }

  // グループレコメンド（2CP以上のグループのみ）
  const groupRecommendations: CampaignGroupRecommendation[] = [];
  for (const [groupName, members] of groups) {
    if (members.length < 2) continue;

    // グループ全体のROASを加重平均
    const totalSpend = members.reduce((s, m) => s + m.spend, 0);
    const totalRevenue = members.reduce((s, m) => s + m.revenue, 0);
    const groupROAS = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 10000) / 100 : 0;

    // グループとしての過去データを集約
    const allHistory: HistoricalCampaignDay[] = [];
    for (const m of members) {
      const h = historyMap.get(m.cpName) || historyMap.get(toGroupName(m.cpName)) || [];
      allHistory.push(...h);
    }
    // 日付でユニーク化＆合算
    const dateMap = new Map<string, HistoricalCampaignDay>();
    for (const d of allHistory) {
      const existing = dateMap.get(d.date);
      if (existing) {
        const existRev = existing.spend * existing.roas / 100;
        const newRev = d.spend * d.roas / 100;
        existing.spend += d.spend;
        existing.cv += d.cv;
        existing.mcv += d.mcv;
        existing.imp += d.imp;
        existing.click += d.click;
        const totalRev = existRev + newRev;
        existing.roas = existing.spend > 0 ? Math.round((totalRev / existing.spend) * 10000) / 100 : 0;
      } else {
        dateMap.set(d.date, { ...d, cpName: groupName });
      }
    }
    const groupHistory = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const groupROASTrend = computeROASTrend(groupHistory, groupROAS);
    const lever = groupROASTrend.trend === "down" ? "creative" as ChangeLever : "operation" as ChangeLever;

    groupRecommendations.push({
      groupName,
      members: members.map((m) => m.cpName),
      groupROASTrend,
      lever,
      groupChange: generateChangeText(groupName, groupROASTrend, groupROAS, lever),
      groupAction: generateActionText(groupROASTrend, lever),
    });
  }

  // クリエイティブ単位グルーピング（単独CPも含む）
  const creativeHistoryMap = aggregateHistoryByCreativeKey(historyMap);
  const creativeGroups = groupByCreative(todayCampaigns);
  const creativeGroupRecommendations: CreativeGroupRecommendation[] = [];
  for (const [key, members] of creativeGroups) {
    const history = creativeHistoryMap.get(key) || [];
    creativeGroupRecommendations.push(generateCreativeRecommendation(key, members, history));
  }

  // 停止CP再開推奨
  const restartRecommendations = findRestartCandidates(todayCampaigns, historyMap);

  return {
    generatedAt: new Date().toISOString(),
    campaignRecommendations,
    groupRecommendations,
    creativeGroupRecommendations,
    restartRecommendations,
  };
}
