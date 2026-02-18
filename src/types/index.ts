// ===== 5軸評価モデルの型定義 =====

export type AxisLevel = 1 | 2 | 3 | 4;

export interface AxisEvaluation {
  level: AxisLevel;
  reasoning: string;
}

export interface FiveAxisEvaluation {
  /** 軸1: 報告の質（現状報告 vs 構造的分析） */
  reportQuality: AxisEvaluation;
  /** 軸2: アクション設計の具体性 */
  actionSpecificity: AxisEvaluation;
  /** 軸3: 判断基準のルール化 */
  decisionCriteria: AxisEvaluation;
  /** 軸4: 検証設計とスケーリング判断 */
  verificationDesign: AxisEvaluation;
  /** 軸5: フェーズ認識と原則理解 */
  phaseRecognition: AxisEvaluation;
}

export type FeedbackPattern = "A" | "B" | "C";

export interface FeedbackResult {
  evaluation: FiveAxisEvaluation;
  pattern: FeedbackPattern;
  feedback: string;
  appliedPrinciples: string[];
  conditionalLayers: {
    principleTeaching: boolean;
    antiPatternWarning: boolean;
    frameworkProvision: boolean;
  };
}

// ===== 目標データの型定義 =====

export interface TargetSummary {
  target: number;
  actual: number;
  gap: number;
  perRemainingDay: number;
}

export interface WeeklyTarget {
  period: string;
  target: number;
  actual: number;
  gap: number;
}

export interface ProjectTarget {
  name: string;
  medium: string;
  monthlyTarget: number;
  weeklyTarget: number;
  dailyTarget: number;
  monthlyActual: number;
  perRemainingDay: number;
}

export interface TargetData {
  month: string;
  summary: TargetSummary;
  weekly: WeeklyTarget[];
  projects: ProjectTarget[];
}

// ===== 入力フォームの型定義 =====

export interface ChannelMetrics {
  channelName: string;
  spend: number;
  revenue: number;
  grossProfit: number;
}

export interface ProjectMetrics {
  projectName: string;
  channels: ChannelMetrics[];
}

export type AnalysisCause =
  | "creative"
  | "operation"
  | "market"
  | "resource"
  | "unidentified";

export interface AnalysisInput {
  primaryCause: AnalysisCause;
  detail: string;
}

export interface DecisionRule {
  cutLossLine: string;
  dailySpendCap: string;
  scaleUpCondition: string;
  exitCondition: string;
  hasNoRules: boolean;
}

export interface ActionItem {
  projectName: string;
  medium: string;
  action: string;
  verificationGoal: string;
  referenceUrl: string;
  successCriteria: string;
  planB: string;
}

export type CurrentPhase =
  | "creative_production"
  | "operation_optimization"
  | "testing"
  | "channel_expansion";

export interface PhaseRecognition {
  currentPhase: CurrentPhase;
  reason: string;
}

export interface ReportInput {
  /** Step 1: 目標ダッシュボード（スプレッドシートから自動取得） */
  targetData?: TargetData;
  /** Step 1 (legacy): 数値実績（手入力） */
  metrics: ProjectMetrics[];
  /** Step 2: 分析 */
  analysis: AnalysisInput;
  /** Step 3: 判断基準 */
  decisionRules: DecisionRule;
  /** Step 4: アクション */
  actions: ActionItem[];
  /** Step 5: フェーズ認識 */
  phaseRecognition: PhaseRecognition;
}
