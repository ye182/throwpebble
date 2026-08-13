/**
 * Diary + explore-chat API contract for project-02.
 *
 * Default: USE_MOCK = true.
 * Later: set VITE_DIARY_API_BASE and flip USE_MOCK to false.
 *
 * Explore chat rounds:
 * - Round 0 (opening): after save → selected chat roles reply.
 * - Round 1+: each user send → POST turn; server/AI picks who replies
 *   from the user's chat-role pool (may be 1–N, not always everyone).
 */

import { getToken } from "./api";
import { COMMENT_ORDER } from "./characters";
import {
  deleteMoodDetailByEntryId,
  listLocalMoodDetailsForSync,
  mergeMoodDetailsFromRemote,
  recordMoodDetail,
  toDateKey,
  type MoodVisibilityMode,
} from "./calendarMood";
import { getChatRoleKeys, resolveChatActor } from "./profileStore";

export type VisibilityMode = "private" | "explore";

export type DiaryEntry = {
  id: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  createdAt: string;
  /** Stored for a future explore/cut page; mock keeps the field. */
  visibilityMode?: VisibilityMode;
};

export type DiaryComment = {
  id: string;
  /** Built-in CharacterId or custom role id. */
  characterId: string;
  content: string;
  createdAt: string;
  /** Opening = 0; each user-triggered turn increments. */
  round?: number;
};

/** Unified thread item for the explore chat UI. */
export type ExploreChatMessage = {
  id: string;
  role: "user" | "character";
  characterId?: string;
  content: string;
  createdAt: string;
  round: number;
};

export type SaveDiaryInput = {
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  visibilityMode?: VisibilityMode;
  /** Calendar day to attach (YYYY-MM-DD). Defaults to today when omitted. */
  dateKey?: string;
  /** When set, update that entry in place (idempotent by entryId). */
  entryId?: string;
  /** Preserve original createdAt when editing. */
  createdAt?: string;
};

/**
 * POST /api/diary/entries/:entryId/explore/turns
 * Body sent when the user sends a chat message after the opening round.
 */
export type ExploreTurnRequest = {
  entryId: string;
  mood: string;
  diaryBody: string;
  userMessage: string;
  /** Conversation so far (opening replies + prior turns). */
  history: ExploreChatMessage[];
  /** 1-based turn index after opening (first user send → 1). */
  round: number;
};

export type ExploreTurnResponse = {
  /** Characters the model chose for this turn. */
  selectedCharacterIds: string[];
  replies: DiaryComment[];
};

const USE_MOCK = true;

function apiBase(): string {
  const base = import.meta.env.VITE_DIARY_API_BASE;
  if (base && String(base).trim()) return String(base).replace(/\/$/, "");
  return "";
}

function mockCommentFor(
  characterId: string,
  mood: string,
  body: string
): string {
  const snippet = body.trim().slice(0, 18) || "今天";
  switch (characterId) {
    case "tuanzi":
      return `喵~你把「${mood}」写下来啦，真棒！${snippet}…也请对自己温柔一点哦❤️`;
    case "huaihuai":
      return `哼，居然认真写了「${mood}」？勉勉强强给个爪爪印🐾 不过…还行啦。`;
    case "ying":
      return `看到你记录「${mood}」。写下来本身就是照顾自己的一步——我们一起慢慢看清就好。`;
    default: {
      const actor = resolveChatActor(characterId);
      return `${actor.name}：看到你记下「${mood}」了。${snippet}…我在这儿陪着你。`;
    }
  }
}

/** Mock follow-up lines; real API will generate from model + user text. */
function mockFollowUpFor(
  characterId: string,
  userMessage: string
): string {
  const snippet = userMessage.trim().slice(0, 16) || "这句话";
  switch (characterId) {
    case "tuanzi":
      return `喵…听到你说「${snippet}」，我在这儿陪你～`;
    case "huaihuai":
      return `切，「${snippet}」啊…也不是不能懂啦。`;
    case "ying":
      return `关于「${snippet}」，你愿意多说一点感受吗？我们可以一起理一理。`;
    default: {
      const actor = resolveChatActor(characterId);
      return `${actor.name}听见了「${snippet}」。继续说也没关系。`;
    }
  }
}

/**
 * Mock stand-in for AI speaker selection within the user's chat-role pool.
 */
function mockSelectSpeakers(
  userMessage: string,
  round: number,
  pool: string[]
): string[] {
  const text = userMessage.trim();
  const order = pool.length > 0 ? pool : [...COMMENT_ORDER];
  if (!text) return [order[0]];

  const picked = new Set<string>();
  if (/坏|傲娇|哼|讨厌|算了/.test(text) && order.includes("huaihuai")) {
    picked.add("huaihuai");
  }
  if (/温柔|难过|哭|安慰|怕|累/.test(text) && order.includes("tuanzi")) {
    picked.add("tuanzi");
  }
  if (
    /为什么|怎么|想想|分析|道理|怎么办/.test(text) &&
    order.includes("ying")
  ) {
    picked.add("ying");
  }

  if (picked.size === 0) {
    const start = (round - 1) % order.length;
    picked.add(order[start]);
    if (text.length > 12 || round % 2 === 0) {
      picked.add(order[(start + 1) % order.length]);
    }
  }

  return order.filter((id) => picked.has(id));
}

type ServerDiaryEntry = {
  id: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  dateKey: string;
  visibilityMode?: VisibilityMode;
  createdAt: string;
};

function authHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/**
 * Push / pull diary rows via auth API so iOS and Android (same login) share calendar.
 * Explore character replies still use USE_MOCK locally.
 */
async function persistEntryToServer(entry: {
  id: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  dateKey: string;
  visibilityMode: VisibilityMode;
  createdAt: string;
}): Promise<ServerDiaryEntry | null> {
  if (!getToken()) return null;
  try {
    const res = await fetch(`${apiBase()}/api/diary/entries`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: entry.id,
        mood: entry.mood,
        moodId: entry.moodId,
        moodIcon: entry.moodIcon,
        body: entry.body,
        images: entry.images,
        dateKey: entry.dateKey,
        visibilityMode: entry.visibilityMode,
        createdAt: entry.createdAt,
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      message?: string;
      data?: ServerDiaryEntry;
    };
    if (!res.ok || !json.ok || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Bidirectional calendar sync for the logged-in account:
 * 1) Upload local-only rows (e.g. older iOS saves) to the server
 * 2) Pull all server rows into this device's calendar storage
 */
export async function syncDiaryEntriesToCalendar(): Promise<number> {
  if (!getToken()) return 0;
  try {
    const res = await fetch(`${apiBase()}/api/diary/entries`, {
      headers: authHeaders(),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { entries?: ServerDiaryEntry[] };
    };
    if (!res.ok || !json.ok || !json.data?.entries) return 0;
    const remote = json.data.entries;
    const remoteIds = new Set(remote.map((e) => e.id));

    // Push local rows the server does not have yet (cross-device catch-up).
    for (const local of listLocalMoodDetailsForSync()) {
      if (remoteIds.has(local.entryId)) continue;
      const saved = await persistEntryToServer({
        id: local.entryId,
        mood: local.mood,
        moodId: local.moodId,
        moodIcon: local.moodIcon,
        body: local.body,
        images: local.images,
        dateKey: local.dateKey,
        visibilityMode: local.visibilityMode,
        createdAt: local.createdAt,
      });
      if (saved) remoteIds.add(saved.id);
    }

    const after = await fetch(`${apiBase()}/api/diary/entries`, {
      headers: authHeaders(),
    });
    const afterJson = (await after.json()) as {
      ok?: boolean;
      data?: { entries?: ServerDiaryEntry[] };
    };
    const rows =
      after.ok && afterJson.ok && afterJson.data?.entries
        ? afterJson.data.entries
        : remote;

    mergeMoodDetailsFromRemote(
      rows.map((e) => ({
        dateKey: e.dateKey,
        mood: e.mood,
        moodId: e.moodId,
        moodIcon: e.moodIcon,
        body: e.body,
        images: e.images,
        visibilityMode: (e.visibilityMode === "explore"
          ? "explore"
          : "private") as MoodVisibilityMode,
        entryId: e.id,
        createdAt: e.createdAt,
      }))
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * POST /api/diary/entries (+ local calendar mark).
 * Always writes local calendar first (private + explore), then syncs to server when logged in.
 */
export async function saveDiaryEntry(input: SaveDiaryInput): Promise<DiaryEntry> {
  const todayKey = toDateKey(new Date());
  const dateKey =
    typeof input.dateKey === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)
      ? input.dateKey
      : todayKey;
  const visibilityMode: VisibilityMode = input.visibilityMode ?? "private";
  const editingId = input.entryId?.trim() || "";
  const createdAt =
    (editingId && input.createdAt?.trim()) || new Date().toISOString();
  let entry: DiaryEntry = {
    id:
      editingId ||
      `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mood: input.mood,
    moodId: input.moodId?.trim() || undefined,
    moodIcon: input.moodIcon?.trim() || undefined,
    body: input.body,
    images: (input.images ?? []).filter((x) => x.trim().length > 0),
    createdAt,
    visibilityMode,
  };


  // Local calendar immediately — do not wait on network / explore comments.
  recordMoodDetail({
    dateKey,
    mood: entry.mood,
    moodId: entry.moodId,
    moodIcon: entry.moodIcon,
    body: entry.body,
    images: entry.images,
    visibilityMode,
    entryId: entry.id,
    createdAt: entry.createdAt,
  });


  if (!USE_MOCK) {
    const res = await fetch(`${apiBase()}/api/diary/entries`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: entry.id,
        mood: entry.mood,
        moodId: entry.moodId,
        moodIcon: entry.moodIcon,
        body: entry.body,
        images: entry.images,
        dateKey,
        visibilityMode,
        createdAt: entry.createdAt,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "保存失败");
    }
    const data = json.data as ServerDiaryEntry;
    entry = {
      id: data.id,
      mood: data.mood,
      moodId: data.moodId ?? entry.moodId,
      moodIcon: data.moodIcon ?? entry.moodIcon,
      body: data.body,
      images: data.images ?? entry.images,
      createdAt: data.createdAt,
      visibilityMode: data.visibilityMode ?? visibilityMode,
    };
    recordMoodDetail({
      dateKey: data.dateKey || dateKey,
      mood: entry.mood,
      moodId: entry.moodId,
      moodIcon: entry.moodIcon,
      body: entry.body,
      images: entry.images,
      visibilityMode: entry.visibilityMode,
      entryId: entry.id,
      createdAt: entry.createdAt,
    });
    return entry;
  }

  // Mock explore replies, but still cloud-sync calendar when authenticated.
  const remote = await persistEntryToServer({
    id: entry.id,
    mood: entry.mood,
    moodId: entry.moodId,
    moodIcon: entry.moodIcon,
    body: entry.body,
    images: entry.images,
    dateKey,
    visibilityMode,
    createdAt: entry.createdAt,
  });
  if (remote) {
    entry = {
      id: remote.id,
      mood: remote.mood,
      moodId: remote.moodId ?? entry.moodId,
      moodIcon: remote.moodIcon ?? entry.moodIcon,
      body: remote.body,
      images: remote.images ?? entry.images,
      createdAt: remote.createdAt,
      visibilityMode: remote.visibilityMode ?? visibilityMode,
    };
    recordMoodDetail({
      dateKey: remote.dateKey || dateKey,
      mood: entry.mood,
      moodId: entry.moodId,
      moodIcon: entry.moodIcon,
      body: entry.body,
      images: entry.images,
      visibilityMode: entry.visibilityMode,
      entryId: entry.id,
      createdAt: entry.createdAt,
    });
  }
  return entry;
}

/**
 * Delete a diary entry from local calendar (+ server when logged in).
 */
export async function deleteDiaryEntry(entryId: string): Promise<boolean> {
  const id = entryId.trim();
  if (!id) return false;
  const localOk = deleteMoodDetailByEntryId(id);
  if (!getToken()) return localOk;
  try {
    const res = await fetch(`${apiBase()}/api/diary/entries/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const json = (await res.json()) as { ok?: boolean };
    if (!res.ok || !json.ok) {
      // Local already removed; server miss is non-fatal (e.g. never synced).
      return localOk;
    }
    return true;
  } catch {
    return localOk;
  }
}

/**
 * Opening explore replies after save (round 0).
 * GET /api/diary/entries/:id/comments
 * Speakers come from profile「聊天角色」selection.
 */
export async function fetchDiaryComments(
  entryId: string,
  context?: { mood: string; body: string }
): Promise<DiaryComment[]> {
  if (!USE_MOCK) {
    const res = await fetch(
      `${apiBase()}/api/diary/entries/${entryId}/comments`
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "评论加载失败");
    }
    return (json.data as DiaryComment[]).map((c) => ({
      ...c,
      round: c.round ?? 0,
    }));
  }

  const mood = context?.mood ?? "今天";
  const body = context?.body ?? "";
  const now = Date.now();
  const speakers = getChatRoleKeys();
  return speakers.map((characterId, i) => ({
    id: `c_${entryId}_${characterId}_r0`,
    characterId,
    content: mockCommentFor(characterId, mood, body),
    createdAt: new Date(now + i * 1000).toISOString(),
    round: 0,
  }));
}

/**
 * Follow-up turn after the user sends a chat message.
 * POST /api/diary/entries/:entryId/explore/turns
 *
 * Real API should:
 * - read diary + history + userMessage
 * - choose suitable characterId(s) from the user's chat-role pool
 * - return their reply texts
 */
export async function requestExploreTurn(
  input: ExploreTurnRequest
): Promise<ExploreTurnResponse> {
  if (!USE_MOCK) {
    const res = await fetch(
      `${apiBase()}/api/diary/entries/${input.entryId}/explore/turns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "回复生成失败");
    }
    return json.data as ExploreTurnResponse;
  }

  await new Promise((r) => setTimeout(r, 280));

  const pool = getChatRoleKeys();
  const selectedCharacterIds = mockSelectSpeakers(
    input.userMessage,
    input.round,
    pool
  );
  const now = Date.now();
  const replies: DiaryComment[] = selectedCharacterIds.map(
    (characterId, i) => ({
      id: `c_${input.entryId}_${characterId}_r${input.round}_${now}`,
      characterId,
      content: mockFollowUpFor(characterId, input.userMessage),
      createdAt: new Date(now + i * 400).toISOString(),
      round: input.round,
    })
  );

  return { selectedCharacterIds, replies };
}

export function commentsToChatMessages(
  comments: DiaryComment[],
  round = 0
): ExploreChatMessage[] {
  return comments.map((c) => ({
    id: c.id,
    role: "character" as const,
    characterId: c.characterId,
    content: c.content,
    createdAt: c.createdAt,
    round: c.round ?? round,
  }));
}
