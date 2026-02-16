import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ReportInput, FiveAxisEvaluation, FeedbackPattern } from "@/types";
import {
  buildEvaluationPrompt,
  buildFeedbackPrompt,
} from "@/lib/evaluation/prompts";
import { saveToSpreadsheet } from "@/lib/sheets";

const anthropic = new Anthropic();

const evaluationToolSchema = {
  name: "submit_evaluation",
  description: "5軸評価の結果を提出する",
  input_schema: {
    type: "object" as const,
    properties: {
      reportQuality: {
        type: "object" as const,
        properties: {
          level: { type: "number" as const, enum: [1, 2, 3, 4] },
          reasoning: { type: "string" as const },
        },
        required: ["level", "reasoning"],
      },
      actionSpecificity: {
        type: "object" as const,
        properties: {
          level: { type: "number" as const, enum: [1, 2, 3, 4] },
          reasoning: { type: "string" as const },
        },
        required: ["level", "reasoning"],
      },
      decisionCriteria: {
        type: "object" as const,
        properties: {
          level: { type: "number" as const, enum: [1, 2, 3, 4] },
          reasoning: { type: "string" as const },
        },
        required: ["level", "reasoning"],
      },
      verificationDesign: {
        type: "object" as const,
        properties: {
          level: { type: "number" as const, enum: [1, 2, 3, 4] },
          reasoning: { type: "string" as const },
        },
        required: ["level", "reasoning"],
      },
      phaseRecognition: {
        type: "object" as const,
        properties: {
          level: { type: "number" as const, enum: [1, 2, 3, 4] },
          reasoning: { type: "string" as const },
        },
        required: ["level", "reasoning"],
      },
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

export async function POST(request: NextRequest) {
  try {
    const input: ReportInput = await request.json();

    // Step 1: 5軸評価
    const evalPrompt = buildEvaluationPrompt(input);
    const evalResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
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
      reportQuality: { level: number; reasoning: string };
      actionSpecificity: { level: number; reasoning: string };
      decisionCriteria: { level: number; reasoning: string };
      verificationDesign: { level: number; reasoning: string };
      phaseRecognition: { level: number; reasoning: string };
      feedbackPattern: string;
      applicablePrinciples: string[];
      applicableAntiPatterns: string[];
    };

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
    const fbPrompt = buildFeedbackPrompt(input, evalJson);

    const fbResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: fbPrompt.system,
      messages: [{ role: "user", content: fbPrompt.user }],
    });

    const feedbackText =
      fbResponse.content[0].type === "text" ? fbResponse.content[0].text : "";

    // Determine conditional layers
    const lowestLevel = Math.min(
      evaluation.reportQuality.level,
      evaluation.actionSpecificity.level,
      evaluation.decisionCriteria.level,
      evaluation.verificationDesign.level,
      evaluation.phaseRecognition.level
    );

    const feedbackResult = {
      evaluation,
      pattern,
      feedback: feedbackText,
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
