/**
 * Extensible prompt assembly for「回信」.
 * Swap `buildReplySystemPrompt` / `buildReplyUserPrompt` when wiring a real LLM.
 */

import type {
  CompanionStyleId,
  ReplyGenerateRequest,
  ReplySourceRecord,
} from "./replyTypes";

const STYLE_VOICE: Record<CompanionStyleId, string> = {
  warm_friend: "像一位懂对方的朋友：自然、有温度、不说教。",
  gentle_quiet: "语气更轻、更慢；少提建议，多陪伴与确认感受。",
  playful_light: "可带一点轻松可爱的表达，但仍真诚，不油腻。",
  steady_ground: "稳住、踏实；承认压力，强调「你不是一个人」。",
};

/** System instructions — versioned for A/B and model swaps. */
export function buildReplySystemPrompt(style: CompanionStyleId): string {
  return [
    "你是 Aimu 日记森林里的陪伴者，正在给用户写一封短回信。",
    "目标：让对方感到被看见、被理解；帮助轻轻回顾近几天的情绪变化；给予温暖积极的反馈。",
    "要求：安抚但不做机械心理咨询；有总结但不冰冷；语言灵动自然，避免模板腔与「根据你的记录」。",
    `语气偏好：${STYLE_VOICE[style]}`,
    "输出：一封中文书信正文（可分段），不要标题元数据，不要列表式诊断。",
  ].join("\n");
}

function formatRecord(r: ReplySourceRecord, index: number): string {
  const events =
    r.events && r.events.length > 0 ? `；事件线索：${r.events.join("、")}` : "";
  return [
    `#${index + 1}`,
    `时间：${r.dateKey} (${r.createdAt})`,
    `情绪：${r.mood}`,
    `正文：${r.body.slice(0, 600)}${r.body.length > 600 ? "…" : ""}${events}`,
  ].join("\n");
}

/** User message with recent records + memory hooks. */
export function buildReplyUserPrompt(req: ReplyGenerateRequest): string {
  const slice = req.records.slice(0, 5);
  const memoryBits: string[] = [];
  if (req.memory?.notes?.length) {
    memoryBits.push(`用户备注：${req.memory.notes.join("；")}`);
  }
  if (req.memory?.summaryHints?.length) {
    memoryBits.push(`长期摘要线索：${req.memory.summaryHints.join("；")}`);
  }
  const ext =
    req.extensions && Object.keys(req.extensions).length > 0
      ? `\n扩展字段：${JSON.stringify(req.extensions)}`
      : "";

  return [
    `请根据最近 ${slice.length} 条记录写回信。`,
    memoryBits.length ? memoryBits.join("\n") : "（暂无长期记忆）",
    "",
    "记录：",
    ...slice.map((r, i) => formatRecord(r, i)),
    ext,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Full chat-completions style payload for future providers. */
export function buildReplyPromptMessages(req: ReplyGenerateRequest): {
  system: string;
  user: string;
  meta: { style: CompanionStyleId; recordCount: number; version: string };
} {
  return {
    system: buildReplySystemPrompt(req.style),
    user: buildReplyUserPrompt(req),
    meta: {
      style: req.style,
      recordCount: Math.min(req.records.length, 5),
      version: "reply-prompt-v1",
    },
  };
}
