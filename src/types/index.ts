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

// ===== Layer 1: 目標進捗×リソース配分 =====

export type CampaignTrend = "growing" | "stagnant";

export interface CampaignClassification {
  cpName: string;
  trend: CampaignTrend;
  trendReasoning: string;
}

export interface ProgressSnapshot {
  monthlyTarget: number;
  monthlyActual: number;
  gap: number;
  achievementRate: number;
  todayTotalRevenue: number;
  dailyRequiredAmount: number;
  dailyAchievementRate: number;
}

export interface Layer1Evaluation {
  progressSnapshot: ProgressSnapshot;
  campaignClassifications: CampaignClassification[];
  growingResourceDecision: AxisEvaluation;
  stagnantCountermeasure: AxisEvaluation;
  overallResourceAllocation: AxisEvaluation;
}

export interface FeedbackResult {
  layer1?: Layer1Evaluation;
  evaluation: FiveAxisEvaluation;
  pattern: FeedbackPattern;
  layer1Feedback?: string;
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

// ===== キャンペーンデータの型定義 =====

export type CampaignLabel = "new" | "existing";

export interface CampaignRow {
  cpName: string;
  label?: CampaignLabel;
  spend: number;
  mediaCV: number;
  imp: number;
  click: number;
  cpm: number;
  cpc: number;
  ctr: number;
  mcvr: number;
  cvr: number;
  cv: number;
  mcv: number;
  roas: number;
  productName: string;
  revenue: number;
  /** 新規CP: 何を検証したかったか */
  testPurpose?: string;
  /** 新規CP: 結果どうだったか */
  testResult?: string;
  /** 新規CP: 結果の解釈 */
  interpretation?: string;
  /** 既存CP: どういう変化があったか */
  change?: string;
  /** 既存CP: 翌日のアクション */
  nextAction?: string;
}

export interface CampaignSummary {
  totalSpend: number;
  totalCV: number;
  totalMCV: number;
  totalRevenue: number;
  avgROAS: number;
  campaignCount: number;
}

export interface AnalysisInput {
  campaignData: CampaignRow[];
  campaignSummary: CampaignSummary | null;
}

export interface ActionPlan {
  /** どの案件にリソースを寄せるか */
  resourceAllocation: string;
  /** その案件でどういうCRを作るか */
  creativeStrategy: string;
  /** 具体的なCRイメージ */
  creativeVision: string;
  /** 参考URL（少なくとも1つ必須） */
  referenceUrls: string[];
}

export interface ScheduleEntry {
  title: string;
  startTime: string;       // "HH:MM"
  endTime: string;          // "HH:MM"
  description: string;
  actionPlanIndex?: number; // 紐付くアクションプランの番号
  calendarEventId?: string; // カレンダー登録後に設定
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;  // ISO 8601
  end: string;    // ISO 8601
  description?: string;
}

export interface ReportInput {
  /** Step 1: 目標ダッシュボード（スプレッドシートから自動取得） */
  targetData?: TargetData;
  /** Step 1 (legacy): 数値実績（手入力） */
  metrics: ProjectMetrics[];
  /** Step 2: 実績・振り返り */
  analysis: AnalysisInput;
  /** Step 3: ネクストアクション（複数可） */
  actionPlans: ActionPlan[];
  /** Step 4: 明日のスケジュール */
  schedule: ScheduleEntry[];
}
