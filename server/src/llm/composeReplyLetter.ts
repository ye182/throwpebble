import type { LlmConfig } from "./config.js";
import { isLlmConfigured } from "./config.js";
import { chatCompletions } from "./openaiCompat.js";
import {
  buildReplySystemPrompt,
  buildReplyUserPrompt,
  type CompanionStyleId,
  type ReplySourceRecord,
} from "./replyPrompt.js";

export type ComposeInsight = {
  dominantMoods: string[];
  trendLabel: string;
  energy?: "low" | "mixed" | "lifted";
};

export type ComposeResult = {
  title: string;
  body: string;
  insight: ComposeInsight;
  provider: "mock" | "llm";
  modelHint: string;
  warning?: string;
};

function mockBody(
  _records: ReplySourceRecord[],
  _style: CompanionStyleId
): string {
  return "这是副端框架回信";
}

function buildInsight(records: ReplySourceRecord[]): ComposeInsight {
  const moods = [...new Set(records.map((r) => r.mood))];
  return {
    dominantMoods: moods.slice(0, 3),
    trendLabel:
      moods.length <= 1
        ? "这几天情绪比较集中在同一种感觉里"
        : "情绪有起伏，像天气一样在轻轻变换",
    energy: moods.some((m) => /雨|阴|爆炸|累|焦虑/.test(m))
      ? "mixed"
      : "lifted",
  };
}

function sanitizeLetterBody(raw: string): string {
  return raw
    .replace(/^```[\w]*\n?/g, "")
    .replace(/\n?```$/g, "")
    .trim();
}

/**
 * Compose a companion letter. Uses Hunyuan (or any OpenAI-compatible LLM)
 * when configured; otherwise falls back to the mock body so deploy never hard-fails.
 */
export async function composeReplyLetter(input: {
  llm: LlmConfig;
  style: CompanionStyleId;
  records: ReplySourceRecord[];
  notes?: string[];
  summaryHints?: string[];
}): Promise<ComposeResult> {
  const records = input.records.slice(0, 5);
  const insight = buildInsight(records);

  if (!isLlmConfigured(input.llm)) {
    return {
      title: "一封信",
      body: mockBody(records, input.style),
      insight,
      provider: "mock",
      modelHint: "server-mock-v1",
    };
  }

  try {
    const result = await chatCompletions({
      baseUrl: input.llm.baseUrl,
      apiKey: input.llm.apiKey,
      model: input.llm.model,
      timeoutMs: input.llm.timeoutMs,
      messages: [
        { role: "system", content: buildReplySystemPrompt(input.style) },
        {
          role: "user",
          content: buildReplyUserPrompt({
            records,
            notes: input.notes,
            summaryHints: input.summaryHints,
          }),
        },
      ],
    });
    const body = sanitizeLetterBody(result.content);
    if (body.length < 12) {
      throw new Error("LLM 正文过短");
    }
    return {
      title: "一封信",
      body,
      insight,
      provider: "llm",
      modelHint: result.model || input.llm.model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[aimu-llm] compose failed, using mock:", message);
    return {
      title: "一封信",
      body: mockBody(records, input.style),
      insight,
      provider: "mock",
      modelHint: "server-mock-fallback",
      warning: "模型暂时不可用，已使用占位信件",
    };
  }
}
