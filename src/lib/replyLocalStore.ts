import type {
  CompanionStyleId,
  ReplyLetter,
  ReplyUserMessage,
} from "./replyTypes";

const LEGACY_LETTERS_KEY = "aimu_reply_letters_v1";
const LEGACY_STYLE_KEY = "aimu_reply_style_v1";
const OWNER_KEY = "aimu_reply_owner_v1";

/** Active account for local letter isolation (null = logged out / unbound). */
let activeReplyUserId: string | null = null;

function scopedKey(base: string, userId: string): string {
  return `${base}__u_${userId}`;
}

function lettersKey(): string {
  return activeReplyUserId
    ? scopedKey(LEGACY_LETTERS_KEY, activeReplyUserId)
    : LEGACY_LETTERS_KEY;
}

function styleKey(): string {
  return activeReplyUserId
    ? scopedKey(LEGACY_STYLE_KEY, activeReplyUserId)
    : LEGACY_STYLE_KEY;
}

/**
 * Bind local letter / companion-style storage to the logged-in user.
 * Migrates legacy unscoped keys when safe. Never copies another account's data.
 */
export function bindReplyStorageToUser(userId: string | null) {
  const next = userId?.trim() || null;
  if (next === activeReplyUserId) return;
  activeReplyUserId = next;
  if (!next) return;
  try {
    const scopedLetters = localStorage.getItem(
      scopedKey(LEGACY_LETTERS_KEY, next)
    );
    const hasScoped =
      scopedLetters != null &&
      scopedLetters !== "" &&
      scopedLetters !== "[]";
    if (hasScoped) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    const owner = localStorage.getItem(OWNER_KEY)?.trim() || "";
    const legacyLetters = localStorage.getItem(LEGACY_LETTERS_KEY);
    const hasLegacy =
      legacyLetters != null &&
      legacyLetters !== "" &&
      legacyLetters !== "[]";
    if (!hasLegacy) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    if (owner && owner !== next) return;
    localStorage.setItem(scopedKey(LEGACY_LETTERS_KEY, next), legacyLetters!);
    const legacyStyle = localStorage.getItem(LEGACY_STYLE_KEY);
    if (legacyStyle != null) {
      localStorage.setItem(scopedKey(LEGACY_STYLE_KEY, next), legacyStyle);
    }
    localStorage.removeItem(LEGACY_LETTERS_KEY);
    localStorage.removeItem(LEGACY_STYLE_KEY);
    localStorage.setItem(OWNER_KEY, next);
  } catch {
    /* ignore */
  }
}

function readLetters(): ReplyLetter[] {
  try {
    const raw = localStorage.getItem(lettersKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ReplyLetter[];
  } catch {
    return [];
  }
}

function writeLetters(list: ReplyLetter[]) {
  try {
    localStorage.setItem(lettersKey(), JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function listReplyLetters(): ReplyLetter[] {
  return readLetters().sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export function getReplyLetter(id: string): ReplyLetter | null {
  return readLetters().find((l) => l.id === id) ?? null;
}

function mergeUserReplies(
  local?: ReplyUserMessage[],
  remote?: ReplyUserMessage[]
): ReplyUserMessage[] | undefined {
  if (!local?.length && !remote?.length) return remote ?? local;
  const byId = new Map<string, ReplyUserMessage>();
  for (const m of local ?? []) byId.set(m.id, m);
  for (const m of remote ?? []) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}

export function upsertReplyLetter(letter: ReplyLetter) {
  const list = readLetters();
  const i = list.findIndex((l) => l.id === letter.id);
  if (i >= 0) {
    const prev = list[i];
    list[i] = {
      ...prev,
      ...letter,
      userReplies: mergeUserReplies(prev.userReplies, letter.userReplies),
    };
  } else {
    list.unshift(letter);
  }
  writeLetters(list);
}

/** Overwrite a letter as-is (e.g. after server confirms a new reply). */
export function replaceReplyLetter(letter: ReplyLetter) {
  const list = readLetters();
  const i = list.findIndex((l) => l.id === letter.id);
  if (i >= 0) list[i] = letter;
  else list.unshift(letter);
  writeLetters(list);
}

export function patchReplyLetter(
  id: string,
  patch: Partial<
    Pick<ReplyLetter, "starred" | "feedback" | "body" | "title" | "userReplies">
  >
): ReplyLetter | null {
  const list = readLetters();
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  writeLetters(list);
  return list[i];
}

/** Append a user reply under a letter (persisted locally). */
export function appendLetterUserReply(
  letterId: string,
  body: string
): ReplyLetter | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const list = readLetters();
  const i = list.findIndex((l) => l.id === letterId);
  if (i < 0) return null;
  const msg: ReplyUserMessage = {
    id: `ureply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  const prev = list[i].userReplies ?? [];
  list[i] = { ...list[i], userReplies: [...prev, msg] };
  writeLetters(list);
  return list[i];
}

/** Remove one sticky reply under a letter (persisted locally). */
export function removeLetterUserReply(
  letterId: string,
  replyId: string
): ReplyLetter | null {
  const list = readLetters();
  const i = list.findIndex((l) => l.id === letterId);
  if (i < 0) return null;
  const prev = list[i].userReplies ?? [];
  if (!prev.some((r) => r.id === replyId)) return list[i];
  list[i] = {
    ...list[i],
    userReplies: prev.filter((r) => r.id !== replyId),
  };
  writeLetters(list);
  return list[i];
}

/** Delete an entire letter locally. */
export function removeReplyLetter(id: string): boolean {
  const list = readLetters();
  const next = list.filter((l) => l.id !== id);
  if (next.length === list.length) return false;
  writeLetters(next);
  return true;
}

export function getCompanionStyle(): CompanionStyleId {
  try {
    const v = localStorage.getItem(styleKey());
    if (
      v === "warm_friend" ||
      v === "gentle_quiet" ||
      v === "playful_light" ||
      v === "steady_ground"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "warm_friend";
}

export function setCompanionStyle(style: CompanionStyleId) {
  try {
    localStorage.setItem(styleKey(), style);
  } catch {
    /* ignore */
  }
}
