"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { FeedbackResult, FiveAxisEvaluation, Layer1Evaluation } from "@/types";

const AXIS_LABELS: { key: keyof FiveAxisEvaluation; label: string; short: string }[] = [
  { key: "reportQuality", label: "報告の質", short: "報告" },
  { key: "actionSpecificity", label: "アクション設計の具体性", short: "具体性" },
  { key: "decisionCriteria", label: "判断基準のルール化", short: "基準" },
  { key: "verificationDesign", label: "検証設計とスケーリング", short: "検証" },
  { key: "phaseRecognition", label: "フェーズ認識と原則理解", short: "フェーズ" },
];

const PATTERN_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  A: { label: "パターンA", color: "bg-green-100 text-green-800", desc: "全軸Lv.3以上: 承認+さらなる高みへの提案" },
  B: { label: "パターンB", color: "bg-yellow-100 text-yellow-800", desc: "1-2軸がLv.2以下: 良い点承認→弱い軸を指摘→改善指示" },
  C: { label: "パターンC", color: "bg-red-100 text-red-800", desc: "3軸以上がLv.2以下: 最重要1軸に絞った深い指導" },
};

const LAYER1_AXIS_LABELS: { key: keyof Pick<Layer1Evaluation, "growingResourceDecision" | "stagnantCountermeasure" | "overallResourceAllocation">; label: string }[] = [
  { key: "growingResourceDecision", label: "伸長案件へのリソース判断" },
  { key: "stagnantCountermeasure", label: "停滞案件への打開策" },
  { key: "overallResourceAllocation", label: "全体リソース配分の合理性" },
];

const LEVEL_COLORS = ["", "bg-red-500", "bg-orange-400", "bg-blue-500", "bg-green-500"];

function RadarChart({ evaluation }: { evaluation: FiveAxisEvaluation }) {
  const size = 300;
  const center = size / 2;
  const maxRadius = 120;

  const axes = AXIS_LABELS.map((axis) => ({
    ...axis,
    level: evaluation[axis.key].level,
  }));

  const angleStep = (2 * Math.PI) / axes.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, level: number) => {
    const angle = startAngle + index * angleStep;
    const radius = (level / 4) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Grid lines
  const gridLines = [1, 2, 3, 4].map((level) => {
    const points = axes
      .map((_, i) => {
        const p = getPoint(i, level);
        return `${p.x},${p.y}`;
      })
      .join(" ");
    return points;
  });

  // Data polygon
  const dataPoints = axes
    .map((_, i) => {
      const p = getPoint(i, axes[i].level);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Axis lines and labels
  const axisLines = axes.map((axis, i) => {
    const outerPoint = getPoint(i, 4);
    const labelPoint = getPoint(i, 4.8);
    return { axis, outerPoint, labelPoint };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] mx-auto">
      {/* Grid */}
      {gridLines.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {axisLines.map(({ outerPoint }, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={outerPoint.x}
          y2={outerPoint.y}
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="rgba(59, 130, 246, 0.2)"
        stroke="rgb(59, 130, 246)"
        strokeWidth="2"
      />

      {/* Data points */}
      {axes.map((_, i) => {
        const p = getPoint(i, axes[i].level);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="rgb(59, 130, 246)"
          />
        );
      })}

      {/* Labels */}
      {axisLines.map(({ axis, labelPoint }, i) => (
        <text
          key={i}
          x={labelPoint.x}
          y={labelPoint.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fill="#374151"
          fontWeight="500"
        >
          {axis.short}
        </text>
      ))}

      {/* Level numbers */}
      {[1, 2, 3, 4].map((level) => {
        const p = getPoint(0, level);
        return (
          <text
            key={level}
            x={p.x + 10}
            y={p.y}
            fontSize="9"
            fill="#9ca3af"
            dominantBaseline="middle"
          >
            {level}
          </text>
        );
      })}
    </svg>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<FeedbackResult | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("feedbackResult");
    if (stored) {
      setResult(JSON.parse(stored));
    }
  }, []);

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500 mb-4">フィードバック結果がありません</p>
            <Button onClick={() => router.push("/report")}>
              日報を入力する
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const patternInfo = PATTERN_LABELS[result.pattern];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">フィードバック結果</h1>
          <Button variant="outline" onClick={() => router.push("/report")}>
            新しい日報を入力
          </Button>
        </div>

        {/* ===== Layer 1: 目標進捗×リソース配分 ===== */}
        {result.layer1 && (
          <>
            {/* 進捗スナップショット */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Layer 1: 目標進捗×リソース配分</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">月間達成率</div>
                    <div className={`text-2xl font-bold ${
                      result.layer1.progressSnapshot.achievementRate >= 100
                        ? "text-green-600"
                        : result.layer1.progressSnapshot.achievementRate >= 70
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}>
                      {result.layer1.progressSnapshot.achievementRate}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {result.layer1.progressSnapshot.monthlyActual.toLocaleString()}円 / {result.layer1.progressSnapshot.monthlyTarget.toLocaleString()}円
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">日次達成率</div>
                    <div className={`text-2xl font-bold ${
                      result.layer1.progressSnapshot.dailyAchievementRate >= 100
                        ? "text-green-600"
                        : result.layer1.progressSnapshot.dailyAchievementRate >= 70
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}>
                      {result.layer1.progressSnapshot.dailyAchievementRate}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {result.layer1.progressSnapshot.todayTotalRevenue.toLocaleString()}円 / {result.layer1.progressSnapshot.dailyRequiredAmount.toLocaleString()}円
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">月間差分</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {result.layer1.progressSnapshot.gap.toLocaleString()}円
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">日次必要額</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {result.layer1.progressSnapshot.dailyRequiredAmount.toLocaleString()}円
                    </div>
                  </div>
                </div>

                {/* キャンペーン分類 */}
                {result.layer1.campaignClassifications.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium mb-2">キャンペーン分類</h3>
                    <div className="space-y-2">
                      {result.layer1.campaignClassifications.map((cp, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Badge className={
                            cp.trend === "growing"
                              ? "bg-green-100 text-green-800 shrink-0"
                              : "bg-red-100 text-red-800 shrink-0"
                          }>
                            {cp.trend === "growing" ? "伸長" : "停滞"}
                          </Badge>
                          <span className="font-medium shrink-0">{cp.cpName}</span>
                          <span className="text-gray-500">{cp.trendReasoning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layer 1 3軸評価 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">リソース配分評価</h3>
                  {LAYER1_AXIS_LABELS.map((axis, idx) => {
                    const axisEval = result.layer1![axis.key];
                    return (
                      <div key={axis.key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{axis.label}</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4].map((lv) => (
                              <div
                                key={lv}
                                className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                  lv <= axisEval.level
                                    ? `${LEVEL_COLORS[axisEval.level]} text-white`
                                    : "bg-gray-100 text-gray-400"
                                }`}
                              >
                                {lv}
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{axisEval.reasoning}</p>
                        {idx < LAYER1_AXIS_LABELS.length - 1 && (
                          <Separator className="mt-3" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Layer 1 フィードバック */}
            {result.layer1Feedback && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">目標進捗フィードバック</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                    {result.layer1Feedback}
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator className="mb-6" />
          </>
        )}

        {/* ===== Layer 2: 5軸評価 ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* レーダーチャート */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">5軸評価</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className={patternInfo.color}>{patternInfo.label}</Badge>
                <span className="text-xs text-gray-500">{patternInfo.desc}</span>
              </div>
            </CardHeader>
            <CardContent>
              <RadarChart evaluation={result.evaluation} />
            </CardContent>
          </Card>

          {/* 軸別詳細 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">軸別評価詳細</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {AXIS_LABELS.map((axis) => {
                const axisEval = result.evaluation[axis.key];
                return (
                  <div key={axis.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{axis.label}</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4].map((lv) => (
                          <div
                            key={lv}
                            className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                              lv <= axisEval.level
                                ? `${LEVEL_COLORS[axisEval.level]} text-white`
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {lv}
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">{axisEval.reasoning}</p>
                    {axis.key !==
                      AXIS_LABELS[AXIS_LABELS.length - 1].key && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* フィードバック本文 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">フィードバック</CardTitle>
            <div className="flex gap-2 flex-wrap">
              {result.appliedPrinciples.map((p) => (
                <Badge key={p} variant="outline" className="text-xs">
                  {p}
                </Badge>
              ))}
              {result.conditionalLayers.antiPatternWarning && (
                <Badge variant="destructive" className="text-xs">
                  アンチパターン検出
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
              {result.feedback}
            </div>
          </CardContent>
        </Card>

        {/* 条件付きレイヤーの表示 */}
        {(result.conditionalLayers.principleTeaching ||
          result.conditionalLayers.antiPatternWarning ||
          result.conditionalLayers.frameworkProvision) && (
          <Card className="mt-6 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-lg">改善ポイント</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {result.conditionalLayers.principleTeaching && (
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">原則</span>
                  <span>構造的な判断の見直しが必要なポイントがあります</span>
                </div>
              )}
              {result.conditionalLayers.antiPatternWarning && (
                <div className="flex items-start gap-2">
                  <span className="text-red-600 font-bold">警告</span>
                  <span>非効率または損失につながるパターンが検出されました</span>
                </div>
              )}
              {result.conditionalLayers.frameworkProvision && (
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">補助</span>
                  <span>思考の整理を助けるフレームワークが提供されています</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
