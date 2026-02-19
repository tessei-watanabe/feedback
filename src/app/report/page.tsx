"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ReportInput,
  ProjectMetrics,
  ChannelMetrics,
  TargetData,
  CampaignRow,
  CampaignSummary,
  ScheduleEntry,
  CalendarEvent,
} from "@/types";

const STEPS = [
  "目標状況",
  "実績・振り返り",
  "アクション",
  "明日のスケジュール",
] as const;

function emptyScheduleEntry(): ScheduleEntry {
  return { title: "", startTime: "09:00", endTime: "10:00", description: "" };
}

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyChannel(): ChannelMetrics {
  return { channelName: "", spend: 0, revenue: 0, grossProfit: 0 };
}

function emptyProject(): ProjectMetrics {
  return { projectName: "", channels: [emptyChannel()] };
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

  // Step 2: キャンペーン実績 + 振り返り
  const [campaignUserName, setCampaignUserName] = useState("");
  const [campaignData, setCampaignData] = useState<CampaignRow[]>([]);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignFetched, setCampaignFetched] = useState(false);

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

  // キャンペーン名をlocalStorageから復元
  useEffect(() => {
    const saved = localStorage.getItem("campaignUserName");
    if (saved) setCampaignUserName(saved);
  }, []);

  const fetchCampaignData = async () => {
    if (!campaignUserName.trim()) return;
    localStorage.setItem("campaignUserName", campaignUserName.trim());
    setCampaignLoading(true);
    setCampaignError(null);
    try {
      const res = await fetch(`/api/campaigns?userName=${encodeURIComponent(campaignUserName.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "データの取得に失敗しました");
      setCampaignData(data.rows);
      setCampaignSummary(data.summary);
      setCampaignFetched(true);
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setCampaignLoading(false);
    }
  };

  // Step 3: ネクストアクション（複数）
  const [actionPlans, setActionPlans] = useState([
    { resourceAllocation: "", creativeStrategy: "", creativeVision: "", referenceUrls: [""] },
  ]);

  const updateActionPlan = (idx: number, field: "resourceAllocation" | "creativeStrategy" | "creativeVision", value: string) => {
    setActionPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const updateActionPlanUrl = (planIdx: number, urlIdx: number, value: string) => {
    setActionPlans((prev) =>
      prev.map((p, i) =>
        i === planIdx
          ? { ...p, referenceUrls: p.referenceUrls.map((u, j) => (j === urlIdx ? value : u)) }
          : p
      )
    );
  };

  const addActionPlanUrl = (planIdx: number) => {
    setActionPlans((prev) =>
      prev.map((p, i) => (i === planIdx ? { ...p, referenceUrls: [...p.referenceUrls, ""] } : p))
    );
  };

  const removeActionPlanUrl = (planIdx: number, urlIdx: number) => {
    setActionPlans((prev) =>
      prev.map((p, i) =>
        i === planIdx ? { ...p, referenceUrls: p.referenceUrls.filter((_, j) => j !== urlIdx) } : p
      )
    );
  };

  // Step 2 バリデーション: 全CPにラベル設定 + 振り返り記入済みか
  const isStep2Complete = campaignFetched && campaignData.length > 0 &&
    campaignData.every((r) => {
      if (!r.label) return false;
      if (r.label === "new") {
        return !!(r.testPurpose?.trim() && r.testResult?.trim() && r.interpretation?.trim());
      }
      // existing
      return !!(r.change?.trim() && r.nextAction?.trim());
    });

  // Step 4: スケジュール + カレンダー連携
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([emptyScheduleEntry()]);
  const [scheduleDate, setScheduleDate] = useState(getTomorrowDateString);
  const [calendarAuth, setCalendarAuth] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarRegistering, setCalendarRegistering] = useState(false);
  const [calendarRegistered, setCalendarRegistered] = useState(false);
  const [editingScheduleIdx, setEditingScheduleIdx] = useState<number | null>(null);

  // カレンダー認証状態の確認
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setCalendarAuth(d.authenticated))
      .catch(() => {});
  }, []);

  // OAuth callback後のパラメータ処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_success") === "true") {
      setCalendarAuth(true);
      setCurrentStep(3); // Step 4に移動
      // URLパラメータをクリーンアップ
      window.history.replaceState({}, "", "/report");
    }
    if (params.get("auth_error")) {
      alert("Googleカレンダー連携に失敗しました。再度お試しください。");
      window.history.replaceState({}, "", "/report");
    }
  }, []);

  // 認証済みの場合、対象日の既存予定を取得
  useEffect(() => {
    if (!calendarAuth || !scheduleDate) return;
    setCalendarLoading(true);
    setCalendarEvents([]);
    fetch(`/api/calendar?date=${scheduleDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.events) setCalendarEvents(d.events);
      })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, [calendarAuth, scheduleDate]);

  const handleCalendarConnect = async () => {
    const res = await fetch("/api/auth/google");
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  const handleCalendarRegister = async () => {
    setCalendarRegistering(true);
    try {
      const validEntries = schedule.filter((s) => s.title.trim());
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: validEntries, date: scheduleDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // 登録されたeventIdをscheduleに反映
      setSchedule((prev) =>
        prev.map((s, i) => {
          const result = data.results?.find((r: { title: string }) => r.title === s.title);
          return result ? { ...s, calendarEventId: result.eventId } : s;
        })
      );
      setCalendarRegistered(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "カレンダー登録に失敗しました");
    } finally {
      setCalendarRegistering(false);
    }
  };

  const updateScheduleEntry = (idx: number, field: keyof ScheduleEntry, value: string | number | undefined) => {
    setSchedule((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

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


  const handleSubmit = async () => {
    setIsSubmitting(true);
    const input: ReportInput = {
      targetData: targetData || undefined,
      metrics: projects,
      analysis: {
        campaignData,
        campaignSummary,
      },
      actionPlans: actionPlans.map((p) => ({
        ...p,
        referenceUrls: p.referenceUrls.filter((u) => u.trim()),
      })),
      schedule: schedule.filter((s) => s.title.trim()),
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

        {/* Step 2: キャンペーン実績 + 振り返り */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* フィルターバー */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Step 2: キャンペーン実績・振り返り</CardTitle>
                <p className="text-sm text-gray-500">
                  今日のキャンペーンデータを取得して、振り返りを記入してください
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">名前（商材名に含まれるキーワード）</Label>
                    <Input
                      value={campaignUserName}
                      onChange={(e) => setCampaignUserName(e.target.value)}
                      placeholder="例: だいき"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") fetchCampaignData();
                      }}
                    />
                  </div>
                  <Button
                    onClick={fetchCampaignData}
                    disabled={campaignLoading || !campaignUserName.trim()}
                  >
                    {campaignLoading ? "取得中..." : "データ取得"}
                  </Button>
                </div>
                {campaignError && (
                  <p className="text-sm text-red-600 mt-2">{campaignError}</p>
                )}
              </CardContent>
            </Card>

            {/* キャンペーン実績 */}
            {campaignFetched && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>キャンペーン実績</span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {campaignSummary?.campaignCount || 0}件
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaignSummary && campaignSummary.campaignCount > 0 ? (
                    <>
                      {/* サマリーカード */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-blue-600 font-medium">総消化</p>
                          <p className="text-lg font-bold text-blue-900">
                            {campaignSummary.totalSpend.toLocaleString()}
                            <span className="text-xs font-normal ml-0.5">円</span>
                          </p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-xs text-green-600 font-medium">CV</p>
                          <p className="text-lg font-bold text-green-900">
                            {campaignSummary.totalCV}
                          </p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <p className="text-xs text-purple-600 font-medium">MCV</p>
                          <p className="text-lg font-bold text-purple-900">
                            {campaignSummary.totalMCV}
                          </p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg">
                          <p className="text-xs text-amber-600 font-medium">売上</p>
                          <p className="text-lg font-bold text-amber-900">
                            {campaignSummary.totalRevenue.toLocaleString()}
                            <span className="text-xs font-normal ml-0.5">円</span>
                          </p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-xs text-red-600 font-medium">ROAS</p>
                          <p className="text-lg font-bold text-red-900">
                            {campaignSummary.avgROAS}
                            <span className="text-xs font-normal ml-0.5">%</span>
                          </p>
                        </div>
                      </div>

                      {/* テーブル */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                          <colgroup>
                            <col className="w-[60px]" />
                            <col />
                            <col className="w-[80px]" />
                            <col className="w-[45px]" />
                            <col className="w-[45px]" />
                            <col className="w-[65px]" />
                            <col className="w-[80px]" />
                          </colgroup>
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-2 font-medium">区分</th>
                              <th className="py-2 pr-2 font-medium">CP名</th>
                              <th className="py-2 pr-2 font-medium text-right">消化</th>
                              <th className="py-2 pr-2 font-medium text-right">CV</th>
                              <th className="py-2 pr-2 font-medium text-right">MCV</th>
                              <th className="py-2 pr-2 font-medium text-right">ROAS</th>
                              <th className="py-2 font-medium text-right">売上</th>
                            </tr>
                          </thead>
                          <tbody>
                            {campaignData.map((row, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2 pr-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCampaignData((prev) =>
                                        prev.map((r, idx) =>
                                          idx === i
                                            ? {
                                                ...r,
                                                label:
                                                  r.label === "new"
                                                    ? "existing"
                                                    : r.label === "existing"
                                                      ? undefined
                                                      : "new",
                                              }
                                            : r
                                        )
                                      );
                                    }}
                                    className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                      row.label === "new"
                                        ? "bg-blue-100 border-blue-300 text-blue-700"
                                        : row.label === "existing"
                                          ? "bg-gray-100 border-gray-300 text-gray-700"
                                          : "bg-white border-dashed border-gray-300 text-gray-400"
                                    }`}
                                  >
                                    {row.label === "new"
                                      ? "新規"
                                      : row.label === "existing"
                                        ? "既存"
                                        : "未設定"}
                                  </button>
                                </td>
                                <td className="py-2 pr-2 font-medium text-xs">
                                  {row.cpName}
                                </td>
                                <td className="py-2 pr-2 text-right">
                                  {row.spend.toLocaleString()}
                                </td>
                                <td className="py-2 pr-2 text-right">{row.cv}</td>
                                <td className="py-2 pr-2 text-right">{row.mcv}</td>
                                <td className="py-2 pr-2 text-right">{row.roas}%</td>
                                <td className="py-2 text-right">
                                  {row.revenue.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      今日の日付に該当するキャンペーンデータが見つかりませんでした
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 新規キャンペーン振り返り */}
            {campaignData.filter((r) => r.label === "new").length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    新規キャンペーン振り返り
                  </CardTitle>
                  <p className="text-xs text-gray-500">
                    各キャンペーンの検証目的・結果・解釈を記入してください
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaignData.map((row, i) =>
                    row.label !== "new" ? null : (
                      <div key={i} className="p-4 border border-blue-200 bg-blue-50/30 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{row.cpName}</span>
                          <span className="text-xs text-gray-500">
                            消化{row.spend.toLocaleString()}円 / CV{row.cv} / ROAS{row.roas}%
                          </span>
                        </div>
                        <div>
                          <Label className="text-xs">何を検証したかったか</Label>
                          <Input
                            value={row.testPurpose || ""}
                            onChange={(e) =>
                              setCampaignData((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, testPurpose: e.target.value } : r
                                )
                              )
                            }
                            placeholder="例: 公式風CRのほうが審査通過率が高いか確認"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">結果どうだったか</Label>
                          <Input
                            value={row.testResult || ""}
                            onChange={(e) =>
                              setCampaignData((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, testResult: e.target.value } : r
                                )
                              )
                            }
                            placeholder="例: CTR1.8%で通常CRの1.2%を上回った"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">結果の解釈（どう判断するか）</Label>
                          <Textarea
                            value={row.interpretation || ""}
                            onChange={(e) =>
                              setCampaignData((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, interpretation: e.target.value } : r
                                )
                              )
                            }
                            placeholder="例: CTRは改善したがCVRは低下。クリック先のLPとの整合性が原因の可能性。明日はLP合わせて再テストする。"
                            rows={2}
                          />
                        </div>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            )}

            {/* 既存キャンペーン振り返り */}
            {campaignData.filter((r) => r.label === "existing").length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
                    既存キャンペーン振り返り
                  </CardTitle>
                  <p className="text-xs text-gray-500">
                    変化の内容と翌日のアクションを記入してください
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaignData.map((row, i) =>
                    row.label !== "existing" ? null : (
                      <div key={i} className="p-4 border border-gray-200 bg-gray-50/30 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{row.cpName}</span>
                          <span className="text-xs text-gray-500">
                            消化{row.spend.toLocaleString()}円 / CV{row.cv} / ROAS{row.roas}%
                          </span>
                        </div>
                        <div>
                          <Label className="text-xs">どういう変化があったか（良化/悪化）</Label>
                          <Input
                            value={row.change || ""}
                            onChange={(e) =>
                              setCampaignData((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, change: e.target.value } : r
                                )
                              )
                            }
                            placeholder="例: ROASが150%→200%に改善。CVRが0.5%上昇。"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">翌日のアクション</Label>
                          <Input
                            value={row.nextAction || ""}
                            onChange={(e) =>
                              setCampaignData((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, nextAction: e.target.value } : r
                                )
                              )
                            }
                            placeholder="例: 予算20%アップして継続。損切りラインはCPA3,000円。"
                          />
                        </div>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 3: ネクストアクション */}
        {currentStep === 2 && (
          <div className="space-y-4">
            {/* Step 2 分析結果（数値データ + 振り返り統合表示） */}
            {campaignData.some((r) => r.label) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Step 2 分析結果</CardTitle>
                  <p className="text-xs text-gray-500">キャンペーン数値と振り返りの一覧です</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* サマリー数値 */}
                  {campaignSummary && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="p-2 bg-blue-50 rounded-lg text-center">
                        <p className="text-[10px] text-blue-600 font-medium">総消化</p>
                        <p className="text-sm font-bold text-blue-900">
                          ¥{campaignSummary.totalSpend.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-lg text-center">
                        <p className="text-[10px] text-green-600 font-medium">CV</p>
                        <p className="text-sm font-bold text-green-900">{campaignSummary.totalCV}</p>
                      </div>
                      <div className="p-2 bg-purple-50 rounded-lg text-center">
                        <p className="text-[10px] text-purple-600 font-medium">MCV</p>
                        <p className="text-sm font-bold text-purple-900">{campaignSummary.totalMCV}</p>
                      </div>
                      <div className="p-2 bg-amber-50 rounded-lg text-center">
                        <p className="text-[10px] text-amber-600 font-medium">売上</p>
                        <p className="text-sm font-bold text-amber-900">
                          ¥{campaignSummary.totalRevenue.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-lg text-center">
                        <p className="text-[10px] text-red-600 font-medium">ROAS</p>
                        <p className="text-sm font-bold text-red-900">{campaignSummary.avgROAS}%</p>
                      </div>
                    </div>
                  )}

                  {/* 新規キャンペーン */}
                  {campaignData.filter((r) => r.label === "new").length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs font-medium text-gray-700">新規キャンペーン</span>
                      </div>
                      {campaignData
                        .filter((r) => r.label === "new")
                        .map((r, i) => (
                          <div key={`new-${i}`} className="p-3 border border-blue-200 bg-blue-50/30 rounded-lg text-sm space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">新規</span>
                              <span className="font-medium text-xs truncate">{r.cpName}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                              <span>消化 <span className="font-medium text-gray-900">¥{r.spend.toLocaleString()}</span></span>
                              <span>CV <span className="font-medium text-gray-900">{r.cv}</span></span>
                              <span>MCV <span className="font-medium text-gray-900">{r.mcv}</span></span>
                              <span>ROAS <span className="font-medium text-gray-900">{r.roas}%</span></span>
                            </div>
                            {(r.testPurpose || r.testResult || r.interpretation) && (
                              <div className="pt-1 border-t border-blue-200 space-y-1 text-xs text-gray-700">
                                {r.testPurpose && <p>検証目的: {r.testPurpose}</p>}
                                {r.testResult && <p>結果: {r.testResult}</p>}
                                {r.interpretation && <p>解釈: {r.interpretation}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* 既存キャンペーン */}
                  {campaignData.filter((r) => r.label === "existing").length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
                        <span className="text-xs font-medium text-gray-700">既存キャンペーン</span>
                      </div>
                      {campaignData
                        .filter((r) => r.label === "existing")
                        .map((r, i) => (
                          <div key={`ex-${i}`} className="p-3 border border-gray-200 bg-gray-50/30 rounded-lg text-sm space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">既存</span>
                              <span className="font-medium text-xs truncate">{r.cpName}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                              <span>消化 <span className="font-medium text-gray-900">¥{r.spend.toLocaleString()}</span></span>
                              <span>CV <span className="font-medium text-gray-900">{r.cv}</span></span>
                              <span>MCV <span className="font-medium text-gray-900">{r.mcv}</span></span>
                              <span>ROAS <span className="font-medium text-gray-900">{r.roas}%</span></span>
                            </div>
                            {(r.change || r.nextAction) && (
                              <div className="pt-1 border-t border-gray-200 space-y-1 text-xs text-gray-700">
                                {r.change && <p>変化: {r.change}</p>}
                                {r.nextAction && <p>アクション: {r.nextAction}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* アクション計画 */}
            {actionPlans.map((plan, planIdx) => (
              <Card key={planIdx}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>
                      {actionPlans.length > 1
                        ? `Step 3: ネクストアクション (${planIdx + 1}/${actionPlans.length})`
                        : "Step 3: ネクストアクション"}
                    </span>
                    {actionPlans.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-500"
                        onClick={() =>
                          setActionPlans((prev) => prev.filter((_, i) => i !== planIdx))
                        }
                      >
                        削除
                      </Button>
                    )}
                  </CardTitle>
                  <p className="text-sm text-gray-500">
                    振り返りを踏まえて、明日の行動を具体化してください
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <Label className="font-medium">
                      1. どの案件にリソースを寄せるか
                    </Label>
                    <p className="text-xs text-gray-500 mb-2">
                      目標達成のために、今のリソースをどの案件に集中させるべきか
                    </p>
                    <Textarea
                      value={plan.resourceAllocation}
                      onChange={(e) => updateActionPlan(planIdx, "resourceAllocation", e.target.value)}
                      placeholder="例: ほぐらくケアEXに集中。ROAS150%超で安定しているため予算を2倍に。シボヘールは損切りラインに近いので最小限で維持。"
                      rows={3}
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label className="font-medium">
                      2. その案件でどういうCRを作るか
                    </Label>
                    <p className="text-xs text-gray-500 mb-2">
                      集中させる案件で、どんな方向性のクリエイティブを制作するか
                    </p>
                    <Textarea
                      value={plan.creativeStrategy}
                      onChange={(e) => updateActionPlan(planIdx, "creativeStrategy", e.target.value)}
                      placeholder="例: ほぐらくケアEXで公式風の縦型CRを3本制作。訴求軸は「肩こり」→「姿勢改善」に変更してテスト。"
                      rows={3}
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label className="font-medium">
                      3. 具体的なCRイメージ
                    </Label>
                    <p className="text-xs text-gray-500 mb-2">
                      作るCRの構成・台本・ビジュアルの具体像を持てているか
                    </p>
                    <Textarea
                      value={plan.creativeVision}
                      onChange={(e) => updateActionPlan(planIdx, "creativeVision", e.target.value)}
                      placeholder="例: 冒頭3秒でビフォーアフター画像→「これ、姿勢が原因かも」のテロップ→整体師の解説30秒→商品紹介15秒。"
                      rows={4}
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label className="font-medium">
                      参考URL
                    </Label>
                    <p className="text-xs text-gray-500 mb-2">
                      CRの参考になる事例・競合・ベンチマークのURLを貼ってください（最低1つ必須）
                    </p>
                    <div className="space-y-2">
                      {plan.referenceUrls.map((url, urlIdx) => (
                        <div key={urlIdx} className="flex items-center gap-2">
                          <Input
                            value={url}
                            onChange={(e) => updateActionPlanUrl(planIdx, urlIdx, e.target.value)}
                            placeholder="https://..."
                          />
                          {plan.referenceUrls.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-gray-400 hover:text-red-500 px-2"
                              onClick={() => removeActionPlanUrl(planIdx, urlIdx)}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addActionPlanUrl(planIdx)}
                      >
                        + URLを追加
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() =>
                setActionPlans((prev) => [
                  ...prev,
                  { resourceAllocation: "", creativeStrategy: "", creativeVision: "", referenceUrls: [""] },
                ])
              }
            >
              + アクションを追加
            </Button>
          </div>
        )}

        {/* Step 4: 明日のスケジュール */}
        {currentStep === 3 && (
          <div className="space-y-4">
            {/* アクションプランサマリー */}
            {actionPlans.some((p) => p.resourceAllocation || p.creativeStrategy || p.creativeVision) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">アクションプランサマリー</CardTitle>
                  <p className="text-xs text-gray-500">Step 3で記入した内容の一覧です（スケジュールに紐付けできます）</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {actionPlans.map((plan, i) => (
                    <div key={i} className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          アクション {i + 1}
                        </Badge>
                      </div>
                      {plan.resourceAllocation && (
                        <p className="text-gray-700">リソース: {plan.resourceAllocation}</p>
                      )}
                      {plan.creativeStrategy && (
                        <p className="text-gray-700">CR戦略: {plan.creativeStrategy}</p>
                      )}
                      {plan.creativeVision && (
                        <p className="text-gray-700">CRイメージ: {plan.creativeVision}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Googleカレンダー連携 + 日付選択 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Googleカレンダー連携</span>
                  {calendarAuth && (
                    <Badge className="bg-green-100 text-green-800 border-green-300">
                      連携済み
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!calendarAuth ? (
                  <div>
                    <p className="text-sm text-gray-500 mb-3">
                      連携すると既存予定を確認でき、スケジュールをカレンダーに直接登録できます
                    </p>
                    <Button variant="outline" onClick={handleCalendarConnect}>
                      Googleカレンダーと連携
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 日付選択 */}
                    <div className="flex items-center gap-3">
                      <Label className="text-sm shrink-0">対象日</Label>
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => {
                          setScheduleDate(e.target.value);
                          setCalendarRegistered(false);
                        }}
                        className="w-48"
                      />
                    </div>

                    {/* 統合タイムライン */}
                    {calendarLoading ? (
                      <p className="text-sm text-gray-500">予定を読み込み中...</p>
                    ) : (
                      (() => {
                        const HOUR_HEIGHT = 64;
                        const TIMELINE_START = 7;
                        const TIMELINE_END = 22;

                        // 既存カレンダーイベントを時間に変換
                        const eventsWithTime = calendarEvents
                          .map((ev) => {
                            const s = ev.start ? new Date(ev.start) : null;
                            const e = ev.end ? new Date(ev.end) : null;
                            if (!s || !e) return null;
                            const startMin = s.getHours() * 60 + s.getMinutes();
                            const endMin = e.getHours() * 60 + e.getMinutes();
                            return { ...ev, startMin, endMin, startDate: s, endDate: e };
                          })
                          .filter(Boolean) as (CalendarEvent & { startMin: number; endMin: number; startDate: Date; endDate: Date })[];

                        // 新規スケジュールを時間に変換
                        const scheduleWithTime = schedule
                          .map((entry, idx) => {
                            const [sh, sm] = entry.startTime.split(":").map(Number);
                            const [eh, em] = entry.endTime.split(":").map(Number);
                            return { ...entry, idx, startMin: sh * 60 + (sm || 0), endMin: eh * 60 + (em || 0) };
                          });

                        const hours = Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => TIMELINE_START + i);
                        const totalHeight = hours.length * HOUR_HEIGHT;

                        const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const y = e.clientY - rect.top;
                          const clickedMin = Math.floor((y / HOUR_HEIGHT) * 60) + TIMELINE_START * 60;
                          // 30分単位にスナップ
                          const snappedMin = Math.round(clickedMin / 30) * 30;
                          const startH = Math.floor(snappedMin / 60);
                          const startM = snappedMin % 60;
                          const endH = Math.floor((snappedMin + 60) / 60);
                          const endM = (snappedMin + 60) % 60;
                          const startTime = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
                          const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

                          // 既存の空エントリ(タイトル未入力)があればそれを更新、なければ追加
                          const emptyIdx = schedule.findIndex((s) => !s.title.trim());
                          if (emptyIdx >= 0) {
                            setSchedule((prev) => prev.map((s, i) => i === emptyIdx ? { ...s, startTime, endTime } : s));
                          } else {
                            setSchedule((prev) => [...prev, { title: "", startTime, endTime, description: "" }]);
                          }
                          setEditingScheduleIdx(emptyIdx >= 0 ? emptyIdx : schedule.length);
                        };

                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-gray-500">
                                タイムラインをクリックして予定を追加
                              </p>
                              {calendarEvents.length > 0 && (
                                <p className="text-xs text-gray-400">
                                  既存 {calendarEvents.length}件
                                </p>
                              )}
                            </div>
                            <div
                              className="relative border rounded-lg bg-white overflow-hidden cursor-pointer select-none"
                              style={{ height: totalHeight }}
                              onClick={handleTimelineClick}
                            >
                              {/* 時間グリッド */}
                              {hours.map((h) => (
                                <div
                                  key={h}
                                  className="absolute w-full flex items-start"
                                  style={{ top: (h - TIMELINE_START) * HOUR_HEIGHT }}
                                >
                                  <span className="text-xs text-gray-400 w-10 shrink-0 text-right pr-2 -mt-2">
                                    {h}時
                                  </span>
                                  <div className="flex-1 border-t border-gray-200" />
                                </div>
                              ))}
                              {/* 30分の補助線 */}
                              {hours.map((h) => (
                                <div
                                  key={`half-${h}`}
                                  className="absolute w-full flex items-start"
                                  style={{ top: (h - TIMELINE_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                                >
                                  <span className="w-10 shrink-0" />
                                  <div className="flex-1 border-t border-gray-100 border-dashed" />
                                </div>
                              ))}

                              {/* 既存カレンダーイベント（ティール） */}
                              {eventsWithTime.map((ev) => {
                                const top = ((ev.startMin - TIMELINE_START * 60) / 60) * HOUR_HEIGHT;
                                const durationMin = Math.max(ev.endMin - ev.startMin, 15);
                                const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 24);
                                const startLabel = ev.startDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
                                const endLabel = ev.endDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
                                const isShort = durationMin <= 30;
                                return (
                                  <div
                                    key={ev.id}
                                    className="absolute left-11 bg-teal-600/90 text-white rounded px-2 py-1 overflow-hidden border-l-4 border-teal-800 pointer-events-none"
                                    style={{ top, height, right: "50%" }}
                                    title={`${ev.summary} (${startLabel}〜${endLabel})`}
                                  >
                                    {isShort ? (
                                      <p className="text-xs font-medium truncate">{ev.summary}, {startLabel}</p>
                                    ) : (
                                      <>
                                        <p className="text-xs font-medium truncate">{ev.summary}</p>
                                        <p className="text-xs opacity-80">{startLabel} - {endLabel}</p>
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              {/* 新規スケジュールエントリ（ブルー） */}
                              {scheduleWithTime.map((entry) => {
                                const top = ((entry.startMin - TIMELINE_START * 60) / 60) * HOUR_HEIGHT;
                                const durationMin = Math.max(entry.endMin - entry.startMin, 15);
                                const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 28);
                                const hasExistingEvents = eventsWithTime.length > 0;
                                return (
                                  <div
                                    key={`sched-${entry.idx}`}
                                    className={`absolute rounded px-2 py-1 overflow-hidden border-l-4 cursor-pointer ${
                                      entry.title.trim()
                                        ? "bg-blue-500/90 text-white border-blue-700"
                                        : "bg-blue-200/70 text-blue-800 border-blue-400 border-dashed"
                                    }`}
                                    style={{
                                      top,
                                      height,
                                      left: hasExistingEvents ? "50%" : "2.75rem",
                                      right: "0.5rem",
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingScheduleIdx(editingScheduleIdx === entry.idx ? null : entry.idx);
                                    }}
                                  >
                                    <p className="text-xs font-medium truncate">
                                      {entry.title || "タップして編集"}
                                    </p>
                                    <p className="text-xs opacity-80">
                                      {entry.startTime} - {entry.endTime}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 選択中のスケジュール編集パネル */}
                            {editingScheduleIdx != null && schedule[editingScheduleIdx] && (
                              <div className="mt-3 p-3 border-2 border-blue-300 rounded-lg bg-blue-50/50 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-blue-800">予定を編集</span>
                                  <div className="flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-400 hover:text-red-600 px-2 h-7 text-xs"
                                      onClick={() => {
                                        setSchedule((prev) => prev.filter((_, i) => i !== editingScheduleIdx));
                                        setEditingScheduleIdx(null);
                                      }}
                                    >
                                      削除
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-gray-400 px-2 h-7 text-xs"
                                      onClick={() => setEditingScheduleIdx(null)}
                                    >
                                      閉じる
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="time"
                                    value={schedule[editingScheduleIdx].startTime}
                                    onChange={(e) => updateScheduleEntry(editingScheduleIdx, "startTime", e.target.value)}
                                    className="w-28 h-8 text-sm"
                                  />
                                  <span className="text-gray-400">〜</span>
                                  <Input
                                    type="time"
                                    value={schedule[editingScheduleIdx].endTime}
                                    onChange={(e) => updateScheduleEntry(editingScheduleIdx, "endTime", e.target.value)}
                                    className="w-28 h-8 text-sm"
                                  />
                                </div>
                                <Input
                                  value={schedule[editingScheduleIdx].title}
                                  onChange={(e) => updateScheduleEntry(editingScheduleIdx, "title", e.target.value)}
                                  placeholder="タイトル（例: ほぐらくケアEX CR制作）"
                                  className="h-8 text-sm"
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={schedule[editingScheduleIdx].actionPlanIndex != null ? String(schedule[editingScheduleIdx].actionPlanIndex) : "none"}
                                    onValueChange={(v) =>
                                      updateScheduleEntry(editingScheduleIdx, "actionPlanIndex", v === "none" ? undefined : Number(v))
                                    }
                                  >
                                    <SelectTrigger className="w-44 h-8 text-xs">
                                      <SelectValue placeholder="アクション紐付け" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">なし</SelectItem>
                                      {actionPlans.map((_, i) => (
                                        <SelectItem key={i} value={String(i)}>
                                          アクション {i + 1}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={schedule[editingScheduleIdx].description}
                                    onChange={(e) => updateScheduleEntry(editingScheduleIdx, "description", e.target.value)}
                                    placeholder="メモ"
                                    className="h-8 text-sm flex-1"
                                  />
                                </div>
                              </div>
                            )}

                            {/* カレンダー登録ボタン */}
                            {calendarAuth && schedule.some((s) => s.title.trim()) && (
                              <div className="mt-3">
                                {calendarRegistered ? (
                                  <p className="text-sm text-green-700 font-medium text-center py-2">
                                    カレンダーに登録しました
                                  </p>
                                ) : (
                                  <Button
                                    className="w-full"
                                    onClick={handleCalendarRegister}
                                    disabled={calendarRegistering}
                                  >
                                    {calendarRegistering ? "登録中..." : `${scheduleDate} のカレンダーに登録`}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
            <div className="flex items-center gap-3">
              {currentStep === 1 && !isStep2Complete && campaignFetched && (
                <p className="text-xs text-red-500">
                  全キャンペーンの区分設定と振り返り記入が必要です
                </p>
              )}
              <Button
                onClick={() => setCurrentStep((s) => s + 1)}
                disabled={currentStep === 1 && !isStep2Complete}
              >
                次へ
              </Button>
            </div>
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
