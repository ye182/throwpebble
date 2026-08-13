/**
 * Client for「回信」— mock composer now; swap to POST /api/reply/generate later.
 */

import { getToken } from "./api";
import { listLocalMoodDetailsForSync } from "./calendarMood";
import { buildReplyPromptMessages } from "./replyPrompt";
import {
  appendLetterUserReply,
  getCompanionStyle,
  listReplyLetters,
  patchReplyLetter,
  removeLetterUserReply,
  removeReplyLetter,
  replaceReplyLetter,
  upsertReplyLetter,
} from "./replyLocalStore";
import type {
  CompanionStyleId,
  ReplyGeneratePhase,
  ReplyGenerateRequest,
  ReplyGenerateResponse,
  ReplyLetter,
  ReplyMoodInsight,
  ReplySourceRecord,
} from "./replyTypes";
import { getUserLlmRuntime } from "./userLlmConfig";

export type GenerateProgress = (phase: ReplyGeneratePhase) => void;

function apiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (base && base.trim()) return base.replace(/\/$/, "");
  return "";
}

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Pull 3–5 newest diary rows from local calendar store (synced with server). */
export function collectRecentReplySources(limit = 5): ReplySourceRecord[] {
  const all = listLocalMoodDetailsForSync().sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  return all.slice(0, Math.min(5, Math.max(1, limit))).map((e) => ({
    entryId: e.entryId,
    dateKey: e.dateKey,
    createdAt: e.createdAt,
    mood: e.mood,
    body: e.body,
  }));
}

function mockInsight(records: ReplySourceRecord[]): ReplyMoodInsight {
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

/** Framework placeholder letter — not final AI voice. */
function mockComposeBody(
  _records: ReplySourceRecord[],
  _style: CompanionStyleId
): string {
  return "这是副端框架回信";
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate a reply letter.
 * 1) Prefer server when logged in
 * 2) Fall back to local mock composer (keeps UX offline)
 */
export async function generateReplyLetter(
  onPhase?: GenerateProgress,
  options?: { style?: CompanionStyleId; recordLimit?: number }
): Promise<ReplyGenerateResponse> {
  const style = options?.style ?? getCompanionStyle();
  onPhase?.("loading_records");
  await wait(280);

  const records = collectRecentReplySources(options?.recordLimit ?? 5);
  if (records.length === 0) {
    onPhase?.("error");
    throw new Error("还没有足够的记录可以回信，先去小屋写几笔吧");
  }

  onPhase?.("analyzing_mood");
  await wait(320);

  const req: ReplyGenerateRequest = {
    records,
    style,
    memory: { preferredStyle: style },
    locale: "zh-CN",
  };

  const prompts = buildReplyPromptMessages(req);
  onPhase?.("composing");

  // Prefer user-configured OpenAI-compatible model (「自定义大模型」).
  const userLlm = getUserLlmRuntime();
  if (userLlm) {
    try {
      const res = await fetch(`${userLlm.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userLlm.apiKey}`,
        },
        body: JSON.stringify({
          model: userLlm.model,
          temperature: userLlm.temperature,
          messages: [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          stream: false,
        }),
      });
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      const body = json.choices?.[0]?.message?.content?.trim();
      if (res.ok && body && body.length >= 12) {
        const insight = mockInsight(records);
        const letter: ReplyLetter = {
          id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          title: "一封信",
          body,
          style,
          sourceEntryIds: records.map((r) => r.entryId),
          insight,
          starred: false,
          feedback: null,
          provider: "llm",
          modelHint: userLlm.model,
        };
        upsertReplyLetter(letter);
        onPhase?.("ready");
        return { letter, phase: "ready" };
      }
    } catch {
      /* fall through */
    }
  }

  if (getToken()) {
    try {
      const res = await fetch(`${apiBase()}/api/reply/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(req),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        data?: ReplyGenerateResponse;
      };
      if (res.ok && json.ok && json.data?.letter) {
        upsertReplyLetter(json.data.letter);
        onPhase?.("ready");
        return json.data;
      }
    } catch {
      /* fall through to mock */
    }
  }

  await wait(360);
  const insight = mockInsight(records);
  const letter: ReplyLetter = {
    id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    title: "一封信",
    body: mockComposeBody(records, style),
    style,
    sourceEntryIds: records.map((r) => r.entryId),
    insight,
    starred: false,
    feedback: null,
    provider: "mock",
    modelHint: "mock-v1",
  };
  upsertReplyLetter(letter);
  onPhase?.("ready");
  return { letter, phase: "ready" };
}

export async function fetchReplyHistory(): Promise<ReplyLetter[]> {
  if (getToken()) {
    try {
      const res = await fetch(`${apiBase()}/api/reply/letters`, {
        headers: authHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { letters?: ReplyLetter[] };
      };
      if (res.ok && json.ok && json.data?.letters) {
        for (const l of json.data.letters) upsertReplyLetter(l);
        return listReplyLetters();
      }
    } catch {
      /* local */
    }
  }
  return listReplyLetters();
}

/**
 * Record a user reply under a letter.
 * Writes local first, then syncs to server when logged in.
 */
export async function sendLetterUserReply(
  letterId: string,
  body: string
): Promise<ReplyLetter | null> {
  const local = appendLetterUserReply(letterId, body);
  if (!local) return null;

  if (!getToken()) return local;

  try {
    const res = await fetch(
      `${apiBase()}/api/reply/letters/${encodeURIComponent(letterId)}/replies`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ body }),
      }
    );
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { letter?: ReplyLetter };
    };
    if (res.ok && json.ok && json.data?.letter) {
      // Server ids are authoritative — replace to avoid duplicate local+remote rows.
      replaceReplyLetter({
        ...local,
        ...json.data.letter,
        userReplies: json.data.letter.userReplies ?? [],
      });
      return listReplyLetters().find((l) => l.id === letterId) ?? local;
    }
  } catch {
    /* keep local record */
  }
  return local;
}

/**
 * Delete one sticky reply under a letter.
 * Updates local first, then syncs to server when logged in.
 */
export async function deleteLetterUserReply(
  letterId: string,
  replyId: string
): Promise<ReplyLetter | null> {
  const local = removeLetterUserReply(letterId, replyId);
  if (!local) return null;

  if (!getToken()) return local;

  try {
    const res = await fetch(
      `${apiBase()}/api/reply/letters/${encodeURIComponent(letterId)}/replies/${encodeURIComponent(replyId)}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { letter?: ReplyLetter };
    };
    if (res.ok && json.ok && json.data?.letter) {
      replaceReplyLetter({
        ...local,
        ...json.data.letter,
        userReplies: json.data.letter.userReplies ?? [],
      });
      return listReplyLetters().find((l) => l.id === letterId) ?? local;
    }
  } catch {
    /* keep local removal */
  }
  return local;
}

/**
 * Delete an entire letter from the archive.
 * Updates local first, then syncs to server when logged in.
 */
export async function deleteReplyLetter(letterId: string): Promise<boolean> {
  const id = letterId.trim();
  if (!id) return false;
  const localOk = removeReplyLetter(id);

  if (!getToken()) return localOk;

  try {
    const res = await fetch(
      `${apiBase()}/api/reply/letters/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );
    const json = (await res.json()) as { ok?: boolean };
    if (res.ok && json.ok) return true;
  } catch {
    /* keep local removal */
  }
  return localOk;
}

export function setLetterStarred(id: string, starred: boolean) {
  return patchReplyLetter(id, { starred });
}

export function setLetterFeedback(
  id: string,
  feedback: ReplyLetter["feedback"]
) {
  return patchReplyLetter(id, { feedback });
}

/** Future: open companion chat seeded by this letter. */
export type ReplyChatSeed = {
  letterId: string;
  openingHint: string;
};
