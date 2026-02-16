import { ReportInput } from "@/types";

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

function formatAnalysisCause(cause: string): string {
  const map: Record<string, string> = {
    creative: "CR（クリエイティブ）の問題",
    operation: "運用設定の問題",
    market: "市場・外部環境の変化",
    resource: "リソース不足",
    unidentified: "まだ特定できていない",
  };
  return map[cause] || cause;
}

function formatPhase(phase: string): string {
  const map: Record<string, string> = {
    creative_production: "CR制作（新しい当たりを見つける段階）",
    operation_optimization: "運用最適化（当たりCRを伸ばす段階）",
    testing: "検証・テスト（仮説を確かめる段階）",
    channel_expansion: "媒体開拓（新しいチャネルを開く段階）",
  };
  return map[phase] || phase;
}

export function formatInputForPrompt(input: ReportInput): string {
  let text = "## メンバーの日報データ\n\n";

  // Step 1: 数値実績
  text += "### 数値実績\n";
  for (const project of input.metrics) {
    text += `\n**${project.projectName}**\n`;
    for (const ch of project.channels) {
      text += `- ${ch.channelName}: 消化${ch.spend.toLocaleString()}円 / 売上${ch.revenue.toLocaleString()}円 / 粗利${ch.grossProfit.toLocaleString()}円\n`;
    }
  }

  // Step 2: 分析
  text += `\n### 分析\n`;
  text += `- 主な原因: ${formatAnalysisCause(input.analysis.primaryCause)}\n`;
  text += `- 詳細: ${input.analysis.detail}\n`;

  // Step 3: 判断基準
  text += `\n### 判断基準\n`;
  if (input.decisionRules.hasNoRules) {
    text += `- **ルールをまだ設定していない**\n`;
  } else {
    if (input.decisionRules.cutLossLine)
      text += `- 損切りライン: ${input.decisionRules.cutLossLine}\n`;
    if (input.decisionRules.dailySpendCap)
      text += `- 1日の消化上限: ${input.decisionRules.dailySpendCap}\n`;
    if (input.decisionRules.scaleUpCondition)
      text += `- 拡大の条件: ${input.decisionRules.scaleUpCondition}\n`;
    if (input.decisionRules.exitCondition)
      text += `- 撤退の条件: ${input.decisionRules.exitCondition}\n`;
  }

  // Step 4: アクション
  text += `\n### 明日のアクション\n`;
  for (const action of input.actions) {
    text += `\n**${action.projectName} / ${action.medium}**\n`;
    text += `- やること: ${action.action}\n`;
    if (action.verificationGoal)
      text += `- 検証したいこと: ${action.verificationGoal}\n`;
    if (action.referenceUrl)
      text += `- 参考事例: ${action.referenceUrl}\n`;
    if (action.successCriteria)
      text += `- 成功基準: ${action.successCriteria}\n`;
    if (action.planB) text += `- プランB: ${action.planB}\n`;
    else text += `- プランB: （未設定）\n`;
  }

  // Step 5: フェーズ認識
  text += `\n### フェーズ認識\n`;
  text += `- 現在のフェーズ: ${formatPhase(input.phaseRecognition.currentPhase)}\n`;
  text += `- 理由: ${input.phaseRecognition.reason}\n`;

  return text;
}

export function buildEvaluationPrompt(input: ReportInput): {
  system: string;
  user: string;
} {
  const formattedInput = formatInputForPrompt(input);

  return {
    system: SYSTEM_PROMPT,
    user: `${EVALUATION_RUBRIC}

${PRINCIPLES}

${formattedInput}

---

上記のメンバー日報データを5軸で評価し、以下のJSON形式で出力してください。
各軸のlevelは1-4の整数、reasoningはその判定理由（メンバーの記述から具体的に引用すること）です。
feedbackPatternは "A", "B", "C" のいずれかです。
applicablePrinciplesは該当する原則ID（P01-P07）の配列です。
applicableAntiPatternsは該当するアンチパターンID（AP01-AP05）の配列です。`,
  };
}

export function buildFeedbackPrompt(
  input: ReportInput,
  evaluationJson: string
): { system: string; user: string } {
  const formattedInput = formatInputForPrompt(input);

  return {
    system: SYSTEM_PROMPT,
    user: `${FEEDBACK_STRUCTURE}

${PRINCIPLES}

${formattedInput}

---

## 5軸評価結果
${evaluationJson}

---

上記の評価結果に基づいて、フィードバックを生成してください。

注意:
- 2層構造（必須レイヤー + 条件付きレイヤー）に従うこと
- 番号付き(1. 2. 3.)で案件・媒体ごとに整理し、(a)(b)の小項目で具体化すること
- メンバーの具体的な記述を参照しながらフィードバックすること
- フィードバックのテキストのみを出力すること（JSON不要）
- 日本語で出力すること`,
  };
}
