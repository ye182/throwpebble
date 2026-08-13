/**
 * 「回信」模块领域类型 — 前端 / 后端 / Prompt 共用契约。
 * 当前阶段以框架为主；AI 正文由后续模型填充。
 */

/** Companion tone preference (user-adjustable). */
export type CompanionStyleId =
  | "warm_friend"
  | "gentle_quiet"
  | "playful_light"
  | "steady_ground";

export type ReplyFeedback = "like" | "dislike" | null;

/** Generation pipeline status for UI + API. */
export type ReplyGeneratePhase =
  | "idle"
  | "loading_records"
  | "analyzing_mood"
  | "composing"
  | "ready"
  | "error";

/** One diary/mood record fed into the reply model. */
export type ReplySourceRecord = {
  entryId: string;
  dateKey: string;
  createdAt: string;
  mood: string;
  body: string;
  /** Optional structured hints for future NLP. */
  events?: string[];
  thoughts?: string[];
};

/** Long-term memory / preference hooks (future). */
export type ReplyUserMemory = {
  preferredStyle: CompanionStyleId;
  /** Free-form notes the model may use later. */
  notes?: string[];
  /** Reserved: embeddings / summary blobs. */
  summaryHints?: string[];
};

/** Payload assembled for LLM / mock composer. */
export type ReplyGenerateRequest = {
  userId?: string;
  /** Prefer 3–5 recent records, newest-first or oldest-first — server normalizes. */
  records: ReplySourceRecord[];
  memory?: ReplyUserMemory;
  style: CompanionStyleId;
  /** Locale / voice knobs. */
  locale?: string;
  /** Extensible prompt extras without breaking clients. */
  extensions?: Record<string, unknown>;
};

/** Structured analysis the model (or mock) may return alongside letter text. */
export type ReplyMoodInsight = {
  dominantMoods: string[];
  /** Short human-readable trend, e.g. "从紧绷慢慢松了一点". */
  trendLabel: string;
  energy?: "low" | "mixed" | "lifted";
};

/** User message written under a letter on the reader page. */
export type ReplyUserMessage = {
  id: string;
  body: string;
  createdAt: string;
};

export type ReplyLetter = {
  id: string;
  createdAt: string;
  /** Display-ready letter body (markdown-ish plain text for now). */
  body: string;
  /** Optional title line shown above the letter. */
  title?: string;
  style: CompanionStyleId;
  sourceEntryIds: string[];
  insight?: ReplyMoodInsight;
  starred: boolean;
  feedback: ReplyFeedback;
  /** User replies shown below the letter body. */
  userReplies?: ReplyUserMessage[];
  /** Model / mock provenance for debugging. */
  provider?: "mock" | "llm";
  modelHint?: string;
};

export type ReplyGenerateResponse = {
  letter: ReplyLetter;
  phase: ReplyGeneratePhase;
  /** Soft errors that still return a fallback letter. */
  warning?: string;
};

export type ReplyHistoryItem = Pick<
  ReplyLetter,
  "id" | "createdAt" | "title" | "starred" | "feedback" | "style"
> & {
  preview: string;
};

export const COMPANION_STYLES: {
  id: CompanionStyleId;
  label: string;
  hint: string;
}[] = [
  {
    id: "warm_friend",
    label: "温暖朋友",
    hint: "像懂你的朋友，轻松又贴心拍拍你",
  },
  {
    id: "gentle_quiet",
    label: "柔声陪伴",
    hint: "话少一点、更轻柔，适合低落的时候",
  },
  {
    id: "playful_light",
    label: "轻快活泼",
    hint: "多一点俏皮与可爱，开心时更合拍",
  },
  {
    id: "steady_ground",
    label: "稳住节奏",
    hint: "压力大时多一点踏实与陪伴感",
  },
];
