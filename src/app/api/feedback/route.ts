import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ReportInput, FiveAxisEvaluation, FeedbackPattern, Layer1Evaluation, CampaignClassification, ProgressSnapshot } from "@/types";
import {
  buildEvaluationPrompt,
  buildFeedbackPrompt,
} from "@/lib/evaluation/prompts";
import { saveToSpreadsheet } from "@/lib/sheets";

const anthropic = new Anthropic();

const axisSchema = {
  type: "object" as const,
  properties: {
    level: { type: "number" as const, enum: [1, 2, 3, 4] },
    reasoning: { type: "string" as const },
  },
  required: ["level", "reasoning"],
};

const evaluationToolSchema = {
  name: "submit_evaluation",
  description: "Layer 1（目標進捗×リソース配分）+ Layer 2（5軸評価）の結果を提出する",
  input_schema: {
    type: "object" as const,
    properties: {
      // Layer 1
      campaignClassifications: {
        type: "array" as const,
        description: "各キャンペーンの伸長/停滞分類",
        items: {
          type: "object" as const,
          properties: {
            cpName: { type: "string" as const },
            trend: { type: "string" as const, enum: ["growing", "stagnant"] },
            trendReasoning: { type: "string" as const },
          },
          required: ["cpName", "trend", "trendReasoning"],
        },
      },
      growingResourceDecision: {
        ...axisSchema,
        description: "伸長案件へのリソース判断（Lv.1-4）",
      },
      stagnantCountermeasure: {
        ...axisSchema,
        description: "停滞案件への打開策（Lv.1-4）",
      },
      overallResourceAllocation: {
        ...axisSchema,
        description: "全体リソース配分の合理性（Lv.1-4）",
      },
      // Layer 2
      reportQuality: axisSchema,
      actionSpecificity: axisSchema,
      decisionCriteria: axisSchema,
      verificationDesign: axisSchema,
      phaseRecognition: axisSchema,
      feedbackPattern: {
        type: "string" as const,
        enum: ["A", "B", "C"],
      },
      applicablePrinciples: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: ["P01", "P02", "P03", "P04", "P05", "P06", "P07"],
        },
      },
      applicableAntiPatterns: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: ["AP01", "AP02", "AP03", "AP04", "AP05"],
        },
      },
    },
    required: [
      "campaignClassifications",
      "growingResourceDecision",
      "stagnantCountermeasure",
      "overallResourceAllocation",
      "reportQuality",
      "actionSpecificity",
      "decisionCriteria",
      "verificationDesign",
      "phaseRecognition",
      "feedbackPattern",
      "applicablePrinciples",
      "applicableAntiPatterns",
    ],
  },
};

function parseDelimitedFeedback(text: string): { layer1Feedback: string; layer2Feedback: string } {
  const layer1Match = text.match(/【LAYER1_START】([\s\S]*?)【LAYER1_END】/);
  const layer2Match = text.match(/【LAYER2_START】([\s\S]*?)【LAYER2_END】/);

  if (layer1Match && layer2Match) {
    return {
      layer1Feedback: layer1Match[1].trim(),
      layer2Feedback: layer2Match[1].trim(),
    };
  }

  // フォールバック: デリミタ解析失敗時は全文をLayer 2に
  return {
    layer1Feedback: "",
    layer2Feedback: text,
  };
}

export async function POST(request: NextRequest) {
  try {
    const input: ReportInput = await request.json();

    // Step 1: Layer 1 + Layer 2 評価
    const evalPrompt = buildEvaluationPrompt(input);
    const progressSnapshot = evalPrompt.progressSnapshot;

    const evalResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3000,
      system: evalPrompt.system,
      tools: [evaluationToolSchema],
      tool_choice: { type: "tool", name: "submit_evaluation" },
      messages: [{ role: "user", content: evalPrompt.user }],
    });

    // Extract tool use result
    const toolUseBlock = evalResponse.content.find(
      (block) => block.type === "tool_use"
    );
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new Error("Evaluation did not return structured output");
    }

    const evalResult = toolUseBlock.input as {
      // Layer 1
      campaignClassifications: { cpName: string; trend: "growing" | "stagnant"; trendReasoning: string }[];
      growingResourceDecision: { level: number; reasoning: string };
      stagnantCountermeasure: { level: number; reasoning: string };
      overallResourceAllocation: { level: number; reasoning: string };
      // Layer 2
      reportQuality: { level: number; reasoning: string };
      actionSpecificity: { level: number; reasoning: string };
      decisionCriteria: { level: number; reasoning: string };
      verificationDesign: { level: number; reasoning: string };
      phaseRecognition: { level: number; reasoning: string };
      feedbackPattern: string;
      applicablePrinciples: string[];
      applicableAntiPatterns: string[];
    };

    // Layer 1 構築
    const layer1: Layer1Evaluation | undefined = progressSnapshot
      ? {
          progressSnapshot,
          campaignClassifications: evalResult.campaignClassifications || [],
          growingResourceDecision: {
            level: evalResult.growingResourceDecision.level as 1 | 2 | 3 | 4,
            reasoning: evalResult.growingResourceDecision.reasoning,
          },
          stagnantCountermeasure: {
            level: evalResult.stagnantCountermeasure.level as 1 | 2 | 3 | 4,
            reasoning: evalResult.stagnantCountermeasure.reasoning,
          },
          overallResourceAllocation: {
            level: evalResult.overallResourceAllocation.level as 1 | 2 | 3 | 4,
            reasoning: evalResult.overallResourceAllocation.reasoning,
          },
        }
      : undefined;

    // Layer 2 構築
    const evaluation: FiveAxisEvaluation = {
      reportQuality: {
        level: evalResult.reportQuality.level as 1 | 2 | 3 | 4,
        reasoning: evalResult.reportQuality.reasoning,
      },
      actionSpecificity: {
        level: evalResult.actionSpecificity.level as 1 | 2 | 3 | 4,
        reasoning: evalResult.actionSpecificity.reasoning,
      },
      decisionCriteria: {
        level: evalResult.decisionCriteria.level as 1 | 2 | 3 | 4,
        reasoning: evalResult.decisionCriteria.reasoning,
      },
      verificationDesign: {
        level: evalResult.verificationDesign.level as 1 | 2 | 3 | 4,
        reasoning: evalResult.verificationDesign.reasoning,
      },
      phaseRecognition: {
        level: evalResult.phaseRecognition.level as 1 | 2 | 3 | 4,
        reasoning: evalResult.phaseRecognition.reasoning,
      },
    };

    const pattern = evalResult.feedbackPattern as FeedbackPattern;

    // Step 2: フィードバック生成
    const evalJson = JSON.stringify(evalResult, null, 2);
    const fbPrompt = buildFeedbackPrompt(input, evalJson, progressSnapshot);

    const fbResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3000,
      system: fbPrompt.system,
      messages: [{ role: "user", content: fbPrompt.user }],
    });

    const rawFeedbackText =
      fbResponse.content[0].type === "text" ? fbResponse.content[0].text : "";

    // デリミタでLayer 1/Layer 2を分離
    const { layer1Feedback, layer2Feedback } = progressSnapshot
      ? parseDelimitedFeedback(rawFeedbackText)
      : { layer1Feedback: "", layer2Feedback: rawFeedbackText };

    // Determine conditional layers
    const lowestLevel = Math.min(
      evaluation.reportQuality.level,
      evaluation.actionSpecificity.level,
      evaluation.decisionCriteria.level,
      evaluation.verificationDesign.level,
      evaluation.phaseRecognition.level
    );

    const feedbackResult = {
      layer1,
      evaluation,
      pattern,
      layer1Feedback: layer1Feedback || undefined,
      feedback: layer2Feedback,
      appliedPrinciples: evalResult.applicablePrinciples,
      conditionalLayers: {
        principleTeaching: lowestLevel <= 2,
        antiPatternWarning: evalResult.applicableAntiPatterns.length > 0,
        frameworkProvision: lowestLevel <= 1,
      },
    };

    // Step 3: スプレッドシートに保存（失敗してもレスポンスは返す）
    try {
      await saveToSpreadsheet(input, feedbackResult);
    } catch (sheetError) {
      console.error("Spreadsheet save error:", sheetError);
    }

    return NextResponse.json(feedbackResult);
  } catch (error) {
    console.error("Feedback generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "フィードバック生成中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
