import { ReportInput, TargetData, CampaignRow, CampaignSummary, ScheduleEntry, ProgressSnapshot } from "@/types";

const SYSTEM_PROMPT = `あなたは、広告運用チームのマネージャーとして、メンバーの日報に対してフィードバックを行います。

## あなたのフィードバックスタイル
- 無理に褒めない。良い時だけ認める。
- 核心を突く。「なぜそれが問題なのか」まで踏み込む。
- 具体的なアクション指示を必ず含める。
- 重大な判断ミスがある場合、原則レベルまで遡る。
- トーンは親しみやすいが論理的。フランクだが甘くはない。`;

const EVALUATION_RUBRIC = `## 5軸評価フレームワーク

### 軸1: 報告の質（現状報告 vs 構造的分析）
- Lv.1: 事実の羅列のみ。「〜がダメだった」で終わる
- Lv.2: 原因の推測はあるが表面的。報告と分析が未分化
- Lv.3: 原因を構造的に分解し、変数を特定している
- Lv.4: 原因分析+他事例との比較+仮説の精度向上まで

### 軸2: アクション設計の具体性
- Lv.1: 意図・方向性のみ。「頑張る」「通す」レベル
- Lv.2: やることは書いてあるが粒度が粗い
- Lv.3: 媒体+CR形式+制作内容まで特定されている
- Lv.4: Lv.3+参考事例の事前収集+検証後の判断基準

### 軸3: 判断基準のルール化
- Lv.1: 基準なし。「様子を見る」「もう少しやってみる」
- Lv.2: 基準はあるが曖昧。「ダメだったら止める」程度
- Lv.3: 数値基準が明確。「CPA○円超えで損切り」
- Lv.4: 数値基準+条件分岐+時間軸が全て定義

### 軸4: 検証設計とスケーリング判断
- Lv.1: 検証設計なし。同じことを繰り返す
- Lv.2: 検証はするが全力投入。失敗コスト大
- Lv.3: スモールスタートで検証し、傾向確認後に拡大
- Lv.4: 検証設計+撤退基準+拡大条件+フェーズ判断が全て事前定義

### 軸5: フェーズ認識と原則理解
- Lv.1: フェーズ認識なし
- Lv.2: フェーズ認識はあるが感情に引きずられる
- Lv.3: フェーズに応じた優先順位を理解し方向転換できる
- Lv.4: フェーズの原則を自ら定義し判断の一貫性を保てる`;

const PRINCIPLES = `## 原則ライブラリ
P01: 状況報告≠分析 — 「厳しい」「難しい」は分析ではない。「なぜ→何が起きている→だから何をする」まで分解する。
P02: 反省なき前進の危険 — NAなき反省は「頑張っているけど利益が出ない」地獄構造を生む。
P03: ルール化の重要性 — 判断をif-then形式で事前定義する。再現可能な基準が改善サイクルを回す。
P04: 具体性の階層 — 「やること→いつまでに→いくつ→何を基準に→ダメだった場合は」の順で具体化。
P05: スモールスタート検証 — 大量投入前に小規模検証。100個ではなくまず10個で傾向を掴む。
P06: フェーズに応じた優先順位 — 運用は利益が出ている時の拡大手段。赤字フェーズではCR制作に集中。
P07: 事前準備の効率化 — 参考URL・事例・ベンチマークは事前に収集。準備で効率が決まる。

## アンチパターン
AP01: 頑張っているけど利益が出ない構造（P02欠如）
AP02: 同じ方法の反復（P05違反）
AP03: 全力投入検証（P05違反）
AP04: 運用ガチャガチャ（P06違反）
AP05: 基準なき放置（P03違反）`;

const FEEDBACK_STRUCTURE = `## フィードバックパターン
- パターンA（全軸Lv.3以上）: 承認+さらなる高みへの提案。短めでOK。
- パターンB（1-2軸がLv.2以下）: 良い点を承認→弱い軸を指摘→改善アクション指示
- パターンC（3軸以上がLv.2以下）: 最重要1軸に絞った深い指導

## 出力構造（2層構造）
必須レイヤー:
1. 状況認識の表明（冒頭1文）
2. 核心指摘（番号付き、(a)(b)で具体化）
3. 具体的アクション指示

条件付きレイヤー（該当時のみ）:
4. 原則教示（構造的判断ミス時）
5. アンチパターン警告（損失・非効率時）
6. フレームワーク提供（整理不能時）`;

const LAYER1_RUBRIC = `## Layer 1: 目標進捗×リソース配分 評価フレームワーク

### キャンペーン分類指示
各キャンペーンを以下の基準で「伸長(growing)」または「停滞(stagnant)」に分類してください:
- **伸長(growing)**: ROAS・CV・売上が目標以上、または上昇トレンドにある案件
- **停滞(stagnant)**: ROAS・CV・売上が目標未達、または下降・横ばいトレンドの案件

### (2) 伸長案件へのリソース判断
- Lv.1: 伸長案件の認識なし、または言及なし
- Lv.2: 認識あるが「もっと予算を増やす」等の抽象的記述のみ
- Lv.3: 具体的な配分量（予算額・比率）+根拠（数値ベース）が明示されている
- Lv.4: Lv.3に加え、持続条件の定義+拡大ステップがif-then形式で記述されている

### (3) 停滞案件への打開策
- Lv.1: 対策なし、または「様子を見る」のみ
- Lv.2: 変更意思はあるが施策の粒度が不足（「クリエイティブを変える」等）
- Lv.3: 原因仮説が明確+具体的施策+損切り基準が定義されている
- Lv.4: Lv.3に加え、タイムライン+複数シナリオ+撤退後のリソース再配置まで記述

### (4) 全体リソース配分の合理性
- Lv.1: 全体像への言及なし。個別案件の記述のみ
- Lv.2: 全体のバランスを意識しているが比率・数値が不明確
- Lv.3: 数値根拠に基づく配分（例: 伸長70%/停滞20%/新規10%）が明示されている
- Lv.4: Lv.3に加え、トリガー条件（配分変更のif-then）+月間目標からの逆算が統合されている`;


function formatCampaignData(rows: CampaignRow[], summary: CampaignSummary | null): string {
  let text = "";

  if (summary) {
    text += `**キャンペーン実績サマリー（${summary.campaignCount}件）**\n`;
    text += `- 総消化: ${summary.totalSpend.toLocaleString()}円\n`;
    text += `- 総CV: ${summary.totalCV}\n`;
    text += `- 総MCV: ${summary.totalMCV}\n`;
    text += `- 総売上: ${summary.totalRevenue.toLocaleString()}円\n`;
    text += `- 平均ROAS: ${summary.avgROAS}%\n`;
  }

  const newCPs = rows.filter((r) => r.label === "new");
  const existingCPs = rows.filter((r) => r.label === "existing");
  const unlabeled = rows.filter((r) => !r.label);

  if (newCPs.length > 0) {
    text += `\n**新規キャンペーン（${newCPs.length}件）**\n`;
    for (const r of newCPs) {
      text += `\n- ${r.cpName}: 消化${r.spend.toLocaleString()}円 / CV${r.cv} / MCV${r.mcv} / ROAS${r.roas}% / 売上${r.revenue.toLocaleString()}円\n`;
      if (r.testPurpose) text += `  - 検証目的: ${r.testPurpose}\n`;
      if (r.testResult) text += `  - 結果: ${r.testResult}\n`;
      if (r.interpretation) text += `  - 解釈: ${r.interpretation}\n`;
    }
  }

  if (existingCPs.length > 0) {
    text += `\n**既存キャンペーン（${existingCPs.length}件）**\n`;
    for (const r of existingCPs) {
      text += `\n- ${r.cpName}: 消化${r.spend.toLocaleString()}円 / CV${r.cv} / MCV${r.mcv} / ROAS${r.roas}% / 売上${r.revenue.toLocaleString()}円\n`;
      if (r.change) text += `  - 変化: ${r.change}\n`;
      if (r.nextAction) text += `  - 翌日アクション: ${r.nextAction}\n`;
    }
  }

  if (unlabeled.length > 0) {
    text += `\n**未分類キャンペーン（${unlabeled.length}件）**\n`;
    for (const r of unlabeled) {
      text += `- ${r.cpName}: 消化${r.spend.toLocaleString()}円 / CV${r.cv} / MCV${r.mcv} / ROAS${r.roas}% / 売上${r.revenue.toLocaleString()}円\n`;
    }
  }

  return text;
}

function formatSchedule(schedule: ScheduleEntry[], actionPlans: ReportInput["actionPlans"]): string {
  if (!schedule || schedule.length === 0) return "スケジュール: 未設定\n";
  let text = "";
  for (const entry of schedule) {
    text += `- ${entry.startTime}〜${entry.endTime}: ${entry.title}`;
    if (entry.actionPlanIndex != null && actionPlans[entry.actionPlanIndex]) {
      text += `（アクション${entry.actionPlanIndex + 1}に紐付き）`;
    }
    text += "\n";
    if (entry.description) {
      text += `  メモ: ${entry.description}\n`;
    }
  }
  return text;
}

function formatTargetData(data: TargetData): string {
  let text = "### 目標状況（スプレッドシートから自動取得）\n\n";

  text += `**${data.month} 月間サマリー**\n`;
  text += `- 月間目標: ${data.summary.target.toLocaleString()}円\n`;
  text += `- 実績: ${data.summary.actual.toLocaleString()}円\n`;
  text += `- 差分: ${data.summary.gap.toLocaleString()}円\n`;
  text += `- 残日数あたり必要額: ${data.summary.perRemainingDay.toLocaleString()}円\n`;
  const pct = data.summary.target > 0
    ? Math.round((data.summary.actual / data.summary.target) * 100)
    : 0;
  text += `- 達成率: ${pct}%\n`;

  if (data.weekly.length > 0) {
    text += `\n**週別推移**\n`;
    for (const w of data.weekly) {
      const wPct = w.target > 0 ? Math.round((w.actual / w.target) * 100) : 0;
      text += `- ${w.period}: 目標${w.target.toLocaleString()}円 / 実績${w.actual.toLocaleString()}円（${wPct}%）\n`;
    }
  }

  if (data.projects.length > 0) {
    text += `\n**案件別実績**\n`;
    for (const p of data.projects) {
      text += `- ${p.name}（${p.medium}）: 月目標${p.monthlyTarget.toLocaleString()}円 / 実績${p.monthlyActual.toLocaleString()}円 / 残日数あたり${p.perRemainingDay.toLocaleString()}円\n`;
    }
  }

  return text;
}

export function formatInputForPrompt(input: ReportInput): string {
  let text = "## メンバーの日報データ\n\n";

  // Step 1: 目標データ（スプレッドシート連携）
  if (input.targetData) {
    text += formatTargetData(input.targetData);
    text += "\n";
  }

  // Step 1 (legacy): 数値実績（手入力）
  if (input.metrics && input.metrics.length > 0 && input.metrics[0].projectName) {
    text += "### 数値実績\n";
    for (const project of input.metrics) {
      text += `\n**${project.projectName}**\n`;
      for (const ch of project.channels) {
        text += `- ${ch.channelName}: 消化${ch.spend.toLocaleString()}円 / 売上${ch.revenue.toLocaleString()}円 / 粗利${ch.grossProfit.toLocaleString()}円\n`;
      }
    }
  }

  // Step 2: キャンペーン実績 + 振り返り
  text += `\n### キャンペーン実績・振り返り\n`;
  if (input.analysis.campaignData.length > 0 || input.analysis.campaignSummary) {
    text += formatCampaignData(input.analysis.campaignData, input.analysis.campaignSummary);
  } else {
    text += `- キャンペーンデータ: なし\n`;
  }

  // Step 3: ネクストアクション
  text += `\n### ネクストアクション\n`;
  for (let i = 0; i < input.actionPlans.length; i++) {
    const plan = input.actionPlans[i];
    if (input.actionPlans.length > 1) {
      text += `\n**アクション${i + 1}**\n`;
    }
    if (plan.resourceAllocation) {
      text += `- リソース配分: ${plan.resourceAllocation}\n`;
    }
    if (plan.creativeStrategy) {
      text += `- CR戦略: ${plan.creativeStrategy}\n`;
    }
    if (plan.creativeVision) {
      text += `- 具体的CRイメージ: ${plan.creativeVision}\n`;
    }
    if (plan.referenceUrls && plan.referenceUrls.length > 0) {
      text += `- 参考URL:\n`;
      for (const url of plan.referenceUrls) {
        text += `  - ${url}\n`;
      }
    }
  }

  // Step 4: 明日のスケジュール
  text += `\n### 明日のスケジュール\n`;
  text += formatSchedule(input.schedule, input.actionPlans);

  return text;
}

export function buildProgressSnapshot(input: ReportInput): ProgressSnapshot | null {
  const target = input.targetData;
  const summary = input.analysis.campaignSummary;

  if (!target) return null;

  const monthlyTarget = target.summary.target;
  const monthlyActual = target.summary.actual;
  const gap = target.summary.gap;
  const achievementRate = monthlyTarget > 0
    ? Math.round((monthlyActual / monthlyTarget) * 1000) / 10
    : 0;
  const todayTotalRevenue = summary ? summary.totalRevenue : 0;
  const dailyRequiredAmount = target.summary.perRemainingDay;
  const dailyAchievementRate = dailyRequiredAmount > 0
    ? Math.round((todayTotalRevenue / dailyRequiredAmount) * 1000) / 10
    : 0;

  return {
    monthlyTarget,
    monthlyActual,
    gap,
    achievementRate,
    todayTotalRevenue,
    dailyRequiredAmount,
    dailyAchievementRate,
  };
}

function formatProgressSnapshot(snapshot: ProgressSnapshot): string {
  return `### 進捗スナップショット（自動算出）
- 月間目標: ${snapshot.monthlyTarget.toLocaleString()}円
- 月間実績: ${snapshot.monthlyActual.toLocaleString()}円
- 差分: ${snapshot.gap.toLocaleString()}円
- 月間達成率: ${snapshot.achievementRate}%
- 本日売上合計: ${snapshot.todayTotalRevenue.toLocaleString()}円
- 日次必要額: ${snapshot.dailyRequiredAmount.toLocaleString()}円
- 日次達成率: ${snapshot.dailyAchievementRate}%`;
}

export function buildEvaluationPrompt(input: ReportInput): {
  system: string;
  user: string;
  progressSnapshot: ProgressSnapshot | null;
} {
  const formattedInput = formatInputForPrompt(input);
  const snapshot = buildProgressSnapshot(input);

  const snapshotContext = snapshot
    ? `\n\n${formatProgressSnapshot(snapshot)}\n`
    : "";

  return {
    system: SYSTEM_PROMPT,
    progressSnapshot: snapshot,
    user: `${LAYER1_RUBRIC}

${EVALUATION_RUBRIC}

${PRINCIPLES}

${formattedInput}
${snapshotContext}
---

上記のメンバー日報データを**Layer 1（目標進捗×リソース配分）+ Layer 2（5軸評価）**の2レイヤーで評価してください。

**Layer 1:**
- 各キャンペーンを「伸長(growing)」「停滞(stagnant)」に分類し、分類理由を記述
- (2) 伸長案件へのリソース判断: Lv.1-4で評価
- (3) 停滞案件への打開策: Lv.1-4で評価
- (4) 全体リソース配分の合理性: Lv.1-4で評価

**Layer 2:**
各軸のlevelは1-4の整数、reasoningはその判定理由（メンバーの記述から具体的に引用すること）です。
feedbackPatternは "A", "B", "C" のいずれかです。
applicablePrinciplesは該当する原則ID（P01-P07）の配列です。
applicableAntiPatternsは該当するアンチパターンID（AP01-AP05）の配列です。`,
  };
}

export function buildFeedbackPrompt(
  input: ReportInput,
  evaluationJson: string,
  progressSnapshot: ProgressSnapshot | null
): { system: string; user: string } {
  const formattedInput = formatInputForPrompt(input);
  const snapshotContext = progressSnapshot
    ? `\n\n${formatProgressSnapshot(progressSnapshot)}\n`
    : "";

  const hasLayer1 = progressSnapshot !== null;

  const outputInstructions = hasLayer1
    ? `上記の評価結果に基づいて、フィードバックを生成してください。

**出力形式:**
以下の2セクションに分けて出力すること:

【LAYER1_START】
Layer 1フィードバック:
- 進捗認識（月間・日次の達成状況への言及）
- キャンペーン分類に基づくリソース配分の指導
- 伸長案件への投資判断と停滞案件への打開策
- 全体リソース配分の改善提案
【LAYER1_END】

【LAYER2_START】
Layer 2フィードバック:
- 2層構造（必須レイヤー + 条件付きレイヤー）に従うこと
- 番号付き(1. 2. 3.)で案件・媒体ごとに整理し、(a)(b)の小項目で具体化すること
- メンバーの具体的な記述を参照しながらフィードバックすること
【LAYER2_END】

注意:
- 必ず【LAYER1_START】【LAYER1_END】【LAYER2_START】【LAYER2_END】のデリミタを使用すること
- フィードバックのテキストのみを出力すること（JSON不要）
- 日本語で出力すること`
    : `上記の評価結果に基づいて、フィードバックを生成してください。

注意:
- 2層構造（必須レイヤー + 条件付きレイヤー）に従うこと
- 番号付き(1. 2. 3.)で案件・媒体ごとに整理し、(a)(b)の小項目で具体化すること
- メンバーの具体的な記述を参照しながらフィードバックすること
- フィードバックのテキストのみを出力すること（JSON不要）
- 日本語で出力すること`;

  return {
    system: SYSTEM_PROMPT,
    user: `${FEEDBACK_STRUCTURE}

${PRINCIPLES}

${formattedInput}
${snapshotContext}
---

## 評価結果（Layer 1 + Layer 2）
${evaluationJson}

---

${outputInstructions}`,
  };
}
