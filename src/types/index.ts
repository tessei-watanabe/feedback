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
  /** PDCAレコメンド */
  recommendation?: CampaignRecommendation;
}

// ===== PDCA自動レコメンド型定義 =====

export interface HistoricalCampaignDay {
  date: string;         // "2026/02/18"
  cpName: string;
  spend: number;
  cv: number;
  mcv: number;
  roas: number;
  imp: number;
  click: number;
  cpa: number;
}

export type ROASTier = "high" | "medium" | "low";

export interface ROASTrend {
  tier: ROASTier;
  avg3Day: number;
  dayOverDay: number;     // 前日比変化率(%)
  threeDayChange: number; // 3日間変化率(%)
  trend: "up" | "flat" | "down";
}

export type ChangeLever = "operation" | "creative";

export interface CampaignRecommendation {
  cpName: string;
  roasTrend: ROASTrend;
  lever: ChangeLever;
  leverReasoning: string;
  change: string;          // 自動生成「変化」テキスト
  nextAction: string;      // 自動生成「アクション」テキスト
  isStandout: boolean;     // グループ内で特に好調な個別CP
  groupName?: string;
  history: HistoricalCampaignDay[];
}

export interface CampaignGroupRecommendation {
  groupName: string;
  members: string[];
  groupROASTrend: ROASTrend;
  lever: ChangeLever;
  groupChange: string;
  groupAction: string;
}

export interface CreativeMember {
  cpName: string;
  submissionDates: string[];
  isRecent: boolean;
  spend: number;
  cv: number;
  revenue: number;
  roas: number;
}

export type CreativeAction = "keep_old" | "add_new" | "stop_new" | "scale_both" | "monitor";

export interface CreativeHistoricalMetrics {
  spend: number;
  cv: number;
  revenue: number;
  roas: number;
}

export interface CreativeHistoricalComparison {
  avg7Day: CreativeHistoricalMetrics | null;
  avg3Day: CreativeHistoricalMetrics | null;
  yesterday: CreativeHistoricalMetrics | null;
  today: CreativeHistoricalMetrics;
}

export type BudgetAction = "increase" | "decrease" | "maintain" | "stop";

export interface BudgetRecommendation {
  action: BudgetAction;
  percentChange: number;
  targetSpend: number;
  reasoning: string;
}

export interface CreativeGroupRecommendation {
  creativeKey: string;
  productName: string;
  creativeName: string;
  members: CreativeMember[];
  combinedSpend: number;
  combinedRevenue: number;
  combinedROAS: number;
  combinedCV: number;
  oldMetrics: { spend: number; revenue: number; roas: number; cv: number } | null;
  newMetrics: { spend: number; revenue: number; roas: number; cv: number } | null;
  action: CreativeAction;
  recommendation: string;
  historicalComparison: CreativeHistoricalComparison | null;
  budgetRecommendation: BudgetRecommendation | null;
  autoChange: string;
  autoNextAction: string;
}

export interface RestartRecommendation {
  cpName: string;
  lastActiveDate: string;
  peakROAS: number;
  avgROAS7Day: number;
  reason: string;
}

export interface PDCARecommendations {
  generatedAt: string;
  campaignRecommendations: CampaignRecommendation[];
  groupRecommendations: CampaignGroupRecommendation[];
  creativeGroupRecommendations: CreativeGroupRecommendation[];
  restartRecommendations: RestartRecommendation[];
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
