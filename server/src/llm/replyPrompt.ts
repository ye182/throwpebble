/**
 * Server-side prompt for 项目四信件（keep in sync with src/lib/replyPrompt.ts）.
 */

export type CompanionStyleId =
  | "warm_friend"
  | "gentle_quiet"
  | "playful_light"
  | "steady_ground";

export type ReplySourceRecord = {
  entryId: string;
  dateKey: string;
  createdAt: string;
  mood: string;
  body: string;
  events?: string[];
  thoughts?: string[];
};

const STYLE_VOICE: Record<CompanionStyleId, string> = {
  warm_friend: "像一位懂对方的朋友：自然、有温度、不说教。",
  gentle_quiet: "语气更轻、更慢；少提建议，多陪伴与确认感受。",
  playful_light: "可带一点轻松可爱的表达，但仍真诚，不油腻。",
  steady_ground: "稳住、踏实；承认压力，强调「你不是一个人」。",
};

export function buildReplySystemPrompt(style: CompanionStyleId): string {
  return [
    "你是 Aimu 日记森林里的陪伴者，正在给用户写一封短信。",
    "目标：让对方感到被看见、被理解；帮助轻轻回顾近几天的情绪变化；给予温暖积极的反馈。",
    "要求：安抚但不做机械心理咨询；有总结但不冰冷；语言灵动自然，避免模板腔与「根据你的记录」。",
    `语气偏好：${STYLE_VOICE[style]}`,
    "输出：一封中文书信正文（可分段），不要标题元数据，不要列表式诊断，不要自称 AI。",
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

export function buildReplyUserPrompt(input: {
  records: ReplySourceRecord[];
  notes?: string[];
  summaryHints?: string[];
}): string {
  const slice = input.records.slice(0, 5);
  const memoryBits: string[] = [];
  if (input.notes?.length) {
    memoryBits.push(`用户备注：${input.notes.join("；")}`);
  }
  if (input.summaryHints?.length) {
    memoryBits.push(`长期摘要线索：${input.summaryHints.join("；")}`);
  }
  return [
    `请根据最近 ${slice.length} 条记录写一封信。`,
    memoryBits.length ? memoryBits.join("\n") : "（暂无长期记忆）",
    "",
    "记录：",
    ...slice.map((r, i) => formatRecord(r, i)),
  ]
    .filter(Boolean)
    .join("\n");
}
