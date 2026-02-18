"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  ReportInput,
  ProjectMetrics,
  ChannelMetrics,
  AnalysisCause,
  ActionItem,
  CurrentPhase,
  TargetData,
} from "@/types";

const STEPS = [
  "目標状況",
  "分析",
  "判断基準",
  "アクション",
  "フェーズ認識",
] as const;

const ANALYSIS_CAUSES: { value: AnalysisCause; label: string }[] = [
  { value: "creative", label: "CR（クリエイティブ）の問題" },
  { value: "operation", label: "運用設定の問題" },
  { value: "market", label: "市場・外部環境の変化" },
  { value: "resource", label: "リソース不足" },
  { value: "unidentified", label: "まだ特定できていない" },
];

const PHASE_OPTIONS: { value: CurrentPhase; label: string; desc: string }[] = [
  {
    value: "creative_production",
    label: "CR制作",
    desc: "新しい当たりを見つける段階",
  },
  {
    value: "operation_optimization",
    label: "運用最適化",
    desc: "当たりCRを伸ばす段階",
  },
  { value: "testing", label: "検証・テスト", desc: "仮説を確かめる段階" },
  {
    value: "channel_expansion",
    label: "媒体開拓",
    desc: "新しいチャネルを開く段階",
  },
];

const MEDIUM_OPTIONS = [
  "Meta",
  "X (旧Twitter)",
  "YouTube",
  "TikTok",
  "LINE",
  "Demand Gen",
  "その他",
];

function emptyChannel(): ChannelMetrics {
  return { channelName: "", spend: 0, revenue: 0, grossProfit: 0 };
}

function emptyProject(): ProjectMetrics {
  return { projectName: "", channels: [emptyChannel()] };
}

function emptyAction(): ActionItem {
  return {
    projectName: "",
    medium: "",
    action: "",
    verificationGoal: "",
    referenceUrl: "",
    successCriteria: "",
    planB: "",
  };
}

export default function ReportPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: 目標ダッシュボード
  const [targetData, setTargetData] = useState<TargetData | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Step 1 (legacy): 数値実績
  const [projects, setProjects] = useState<ProjectMetrics[]>([emptyProject()]);

  // Step 2: 分析
  const [analysisCause, setAnalysisCause] =
    useState<AnalysisCause>("creative");
  const [analysisDetail, setAnalysisDetail] = useState("");

  // Step 3: 判断基準
  const [hasNoRules, setHasNoRules] = useState(false);
  const [cutLossLine, setCutLossLine] = useState("");
  const [dailySpendCap, setDailySpendCap] = useState("");
  const [scaleUpCondition, setScaleUpCondition] = useState("");
  const [exitCondition, setExitCondition] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);

  // 目標データを取得
  useEffect(() => {
    async function fetchTargets() {
      try {
        const res = await fetch("/api/targets");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "データの取得に失敗しました");
        }
        const data: TargetData = await res.json();
        setTargetData(data);
      } catch (err) {
        setTargetError(
          err instanceof Error ? err.message : "データの取得に失敗しました"
        );
      } finally {
        setTargetLoading(false);
      }
    }
    fetchTargets();
  }, []);

  // 判断基準をlocalStorageから復元
  useEffect(() => {
    const saved = localStorage.getItem("decisionRules");
    if (saved) {
      const rules = JSON.parse(saved);
      setHasNoRules(rules.hasNoRules || false);
      setCutLossLine(rules.cutLossLine || "");
      setDailySpendCap(rules.dailySpendCap || "");
      setScaleUpCondition(rules.scaleUpCondition || "");
      setExitCondition(rules.exitCondition || "");
    }
  }, []);

  const saveDecisionRules = () => {
    localStorage.setItem(
      "decisionRules",
      JSON.stringify({ hasNoRules, cutLossLine, dailySpendCap, scaleUpCondition, exitCondition })
    );
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  // Step 4: アクション
  const [actions, setActions] = useState<ActionItem[]>([emptyAction()]);

  // Step 5: フェーズ認識
  const [currentPhase, setCurrentPhase] =
    useState<CurrentPhase>("creative_production");
  const [phaseReason, setPhaseReason] = useState("");

  const updateProject = (
    idx: number,
    field: keyof ProjectMetrics,
    value: string | ChannelMetrics[]
  ) => {
    setProjects((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const updateChannel = (
    projIdx: number,
    chIdx: number,
    field: keyof ChannelMetrics,
    value: string | number
  ) => {
    setProjects((prev) =>
      prev.map((p, pi) =>
        pi === projIdx
          ? {
              ...p,
              channels: p.channels.map((c, ci) =>
                ci === chIdx ? { ...c, [field]: value } : c
              ),
            }
          : p
      )
    );
  };

  const addChannel = (projIdx: number) => {
    setProjects((prev) =>
      prev.map((p, i) =>
        i === projIdx ? { ...p, channels: [...p.channels, emptyChannel()] } : p
      )
    );
  };

  const updateAction = (idx: number, field: keyof ActionItem, value: string) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };

  const handleSubmit = async () => {
    const missingFields = actions.some((a) => !a.referenceUrl || !a.planB);
    if (missingFields) {
      alert("アクションの「参考事例・URL」と「ダメだった場合の次の手」をすべて入力してください");
      setCurrentStep(3);
      return;
    }
    setIsSubmitting(true);
    const input: ReportInput = {
      targetData: targetData || undefined,
      metrics: projects,
      analysis: { primaryCause: analysisCause, detail: analysisDetail },
      decisionRules: {
        cutLossLine,
        dailySpendCap,
        scaleUpCondition,
        exitCondition,
        hasNoRules,
      },
      actions,
      phaseRecognition: { currentPhase, reason: phaseReason },
    };

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem("feedbackResult", JSON.stringify(data));
      router.push("/result");
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "エラーが発生しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-2">日報フィードバックシステム</h1>
        <p className="text-gray-500 mb-6">
          日報を入力すると、5軸評価に基づいたフィードバックが生成されます
        </p>

        {/* Step Indicator */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((step, i) => (
            <button
              key={step}
              onClick={() => setCurrentStep(i)}
              className={`flex-1 text-center py-2 px-1 rounded-lg text-sm font-medium transition-colors ${
                i === currentStep
                  ? "bg-black text-white"
                  : i < currentStep
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              {i + 1}. {step}
            </button>
          ))}
        </div>

        {/* Step 1: 目標ダッシュボード */}
        {currentStep === 0 && (
          <div className="space-y-4">
            {targetLoading && (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto" />
                    <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
                  </div>
                  <p className="mt-4">目標データを読み込み中...</p>
                </CardContent>
              </Card>
            )}

            {targetError && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-red-600 font-medium mb-2">データ取得エラー</p>
                  <p className="text-sm text-gray-500 mb-4">{targetError}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTargetError(null);
                      setTargetLoading(true);
                      fetch("/api/targets")
                        .then((r) => r.json())
                        .then((d) => {
                          if (d.error) throw new Error(d.error);
                          setTargetData(d);
                        })
                        .catch((e) => setTargetError(e.message))
                        .finally(() => setTargetLoading(false));
                    }}
                  >
                    再読み込み
                  </Button>
                </CardContent>
              </Card>
            )}

            {targetData && !targetLoading && (
              <>
                {/* 月間サマリーカード */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span>Step 1: {targetData.month} 目標状況</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        スプレッドシート連携
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* サマリー数値 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-600 font-medium">月間目標</p>
                        <p className="text-lg font-bold text-blue-900">
                          {targetData.summary.target.toLocaleString()}
                          <span className="text-xs font-normal ml-0.5">円</span>
                        </p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600 font-medium">実績</p>
                        <p className="text-lg font-bold text-green-900">
                          {targetData.summary.actual.toLocaleString()}
                          <span className="text-xs font-normal ml-0.5">円</span>
                        </p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600 font-medium">差分</p>
                        <p className="text-lg font-bold text-red-900">
                          {targetData.summary.gap.toLocaleString()}
                          <span className="text-xs font-normal ml-0.5">円</span>
                        </p>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs text-amber-600 font-medium">残日数あたり</p>
                        <p className="text-lg font-bold text-amber-900">
                          {targetData.summary.perRemainingDay.toLocaleString()}
                          <span className="text-xs font-normal ml-0.5">円</span>
                        </p>
                      </div>
                    </div>

                    {/* 進捗バー */}
                    {targetData.summary.target > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>達成率</span>
                          <span>
                            {Math.round(
                              (targetData.summary.actual / targetData.summary.target) * 100
                            )}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-blue-600 h-3 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (targetData.summary.actual / targetData.summary.target) * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 週別推移 */}
                {targetData.weekly.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">週別推移</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {targetData.weekly.map((w, i) => {
                          const pct =
                            w.target > 0
                              ? Math.round((w.actual / w.target) * 100)
                              : 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-700">{w.period}</span>
                                <span className="text-gray-500">
                                  {w.actual.toLocaleString()} / {w.target.toLocaleString()}円
                                  <span className="ml-2 font-medium">
                                    ({pct}%)
                                  </span>
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    pct >= 100
                                      ? "bg-green-500"
                                      : pct >= 70
                                        ? "bg-blue-500"
                                        : "bg-red-400"
                                  }`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 案件別テーブル */}
                {targetData.projects.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">案件別実績</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-2 font-medium">案件名</th>
                              <th className="py-2 pr-2 font-medium">媒体</th>
                              <th className="py-2 pr-2 font-medium text-right">月目標</th>
                              <th className="py-2 pr-2 font-medium text-right">月実績</th>
                              <th className="py-2 font-medium text-right">残日数あたり</th>
                            </tr>
                          </thead>
                          <tbody>
                            {targetData.projects.map((p, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2 pr-2 font-medium">{p.name}</td>
                                <td className="py-2 pr-2 text-gray-600">{p.medium}</td>
                                <td className="py-2 pr-2 text-right">
                                  {p.monthlyTarget.toLocaleString()}
                                </td>
                                <td className="py-2 pr-2 text-right">
                                  {p.monthlyActual.toLocaleString()}
                                </td>
                                <td className="py-2 text-right text-amber-700 font-medium">
                                  {p.perRemainingDay.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: 分析 */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: 分析</CardTitle>
              <p className="text-sm text-gray-500">
                この結果の主な原因は何だと考えていますか？
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={analysisCause}
                onValueChange={(v) => setAnalysisCause(v as AnalysisCause)}
              >
                {ANALYSIS_CAUSES.map((cause) => (
                  <div key={cause.value} className="flex items-center space-x-3">
                    <RadioGroupItem
                      value={cause.value}
                      id={`cause-${cause.value}`}
                    />
                    <Label
                      htmlFor={`cause-${cause.value}`}
                      className="cursor-pointer"
                    >
                      {cause.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {analysisCause === "unidentified" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  原因が特定できていない場合、フィードバックで分析の深掘りを促します
                </div>
              )}
              <Separator />
              <div>
                <Label>具体的に何が起きているか（補足）</Label>
                <Textarea
                  value={analysisDetail}
                  onChange={(e) => setAnalysisDetail(e.target.value)}
                  placeholder="例: YouTubeのレギュレーション変更で主力CRが出せなくなった"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: 判断基準 */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: 判断基準</CardTitle>
              <p className="text-sm text-gray-500">
                現在適用している運用ルールを入力してください
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="no-rules"
                  checked={hasNoRules}
                  onChange={(e) => setHasNoRules(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="no-rules" className="cursor-pointer">
                  ルールをまだ設定していない
                </Label>
              </div>
              {hasNoRules && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  判断基準が未設定の場合、フィードバックでルール化を促します
                </div>
              )}
              {!hasNoRules && (
                <div className="space-y-4">
                  <div>
                    <Label>損切りライン</Label>
                    <Input
                      value={cutLossLine}
                      onChange={(e) => setCutLossLine(e.target.value)}
                      placeholder="例: CPA3,000円超えで損切り"
                    />
                  </div>
                  <div>
                    <Label>1日の消化上限</Label>
                    <Input
                      value={dailySpendCap}
                      onChange={(e) => setDailySpendCap(e.target.value)}
                      placeholder="例: 10万円/日"
                    />
                  </div>
                  <div>
                    <Label>拡大の条件</Label>
                    <Input
                      value={scaleUpCondition}
                      onChange={(e) => setScaleUpCondition(e.target.value)}
                      placeholder="例: 3CV以上で予算20%アップ"
                    />
                  </div>
                  <div>
                    <Label>撤退の条件</Label>
                    <Input
                      value={exitCondition}
                      onChange={(e) => setExitCondition(e.target.value)}
                      placeholder="例: 3日連続ROAS100%未満で停止"
                    />
                  </div>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      onClick={saveDecisionRules}
                      className={rulesSaved ? "border-green-500 text-green-600" : ""}
                    >
                      {rulesSaved ? "保存しました" : "この判断基準を保存する"}
                    </Button>
                    <p className="text-xs text-gray-400 mt-1">
                      保存すると次回以降、自動で入力されます
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: アクション */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 4: 明日のアクション</CardTitle>
              <p className="text-sm text-gray-500">
                具体的に「何を作るか」レベルまで記述してください
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {actions.map((action, i) => (
                <div key={i} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">アクション {i + 1}</Badge>
                    {actions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setActions((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-red-500 text-xs"
                      >
                        削除
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">案件名</Label>
                      <Input
                        value={action.projectName}
                        onChange={(e) =>
                          updateAction(i, "projectName", e.target.value)
                        }
                        placeholder="オリパ"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">媒体</Label>
                      <select
                        value={action.medium}
                        onChange={(e) =>
                          updateAction(i, "medium", e.target.value)
                        }
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value="">選択してください</option>
                        {MEDIUM_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">
                      具体的にやること（何を作るかレベルまで）
                    </Label>
                    <Textarea
                      value={action.action}
                      onChange={(e) => updateAction(i, "action", e.target.value)}
                      placeholder="例: 公式風の横型CRを1アド作成。台本は○○をベースに冒頭をカット。"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">この行動で検証したいこと</Label>
                    <Input
                      value={action.verificationGoal}
                      onChange={(e) =>
                        updateAction(i, "verificationGoal", e.target.value)
                      }
                      placeholder="例: 公式風CRのほうが審査通過率が高いかを確認"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">成功基準</Label>
                    <Input
                      value={action.successCriteria}
                      onChange={(e) =>
                        updateAction(i, "successCriteria", e.target.value)
                      }
                      placeholder="例: CPA2,000円以下で獲得10CV以上"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">参考事例・URL</Label>
                    <Input
                      value={action.referenceUrl}
                      onChange={(e) =>
                        updateAction(i, "referenceUrl", e.target.value)
                      }
                      placeholder="例: https://... またはテキストで参考事例を記述"
                    />
                    {!action.referenceUrl && (
                      <p className="text-xs text-red-500 mt-1">
                        参考事例またはURLを入力してください
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">
                      ダメだった場合の次の手
                    </Label>
                    <Input
                      value={action.planB}
                      onChange={(e) => updateAction(i, "planB", e.target.value)}
                      placeholder="例: バナー形式に切り替えてテスト"
                    />
                    {!action.planB && (
                      <p className="text-xs text-red-500 mt-1">
                        次の手を入力してください
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => setActions((prev) => [...prev, emptyAction()])}
              >
                + アクションを追加
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 5: フェーズ認識 */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 5: フェーズ認識</CardTitle>
              <p className="text-sm text-gray-500">
                今の最優先事項は何ですか？
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={currentPhase}
                onValueChange={(v) => setCurrentPhase(v as CurrentPhase)}
              >
                {PHASE_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`phase-${opt.value}`}
                      className="mt-0.5"
                    />
                    <div>
                      <Label
                        htmlFor={`phase-${opt.value}`}
                        className="cursor-pointer font-medium"
                      >
                        {opt.label}
                      </Label>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
              <Separator />
              <div>
                <Label>なぜそれが最優先か？</Label>
                <Textarea
                  value={phaseReason}
                  onChange={(e) => setPhaseReason(e.target.value)}
                  placeholder="例: まだ当たりCRが見つかっていないため、運用よりもCR制作に集中すべきフェーズ"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep((s) => s - 1)}
            disabled={currentStep === 0}
          >
            戻る
          </Button>
          {currentStep < STEPS.length - 1 ? (
            <Button onClick={() => setCurrentStep((s) => s + 1)}>次へ</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "フィードバック生成中..." : "フィードバックを生成"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
