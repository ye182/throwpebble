/** Local mood-record dates for the calendar wall (YYYY-MM-DD). */

/** Legacy (pre-user-scope) keys — migrated into per-user keys on bind. */
const LEGACY_STORAGE_KEY = "aimu_mood_dates_v1";
const LEGACY_DETAIL_KEY = "aimu_mood_details_v1";
const OWNER_KEY = "aimu_mood_owner_v1";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Active account for local mood isolation (null = logged out / unbound). */
let activeMoodUserId: string | null = null;

function scopedKey(base: string, userId: string): string {
  return `${base}__u_${userId}`;
}

function storageKey(): string {
  return activeMoodUserId
    ? scopedKey(LEGACY_STORAGE_KEY, activeMoodUserId)
    : LEGACY_STORAGE_KEY;
}

function detailKey(): string {
  return activeMoodUserId
    ? scopedKey(LEGACY_DETAIL_KEY, activeMoodUserId)
    : LEGACY_DETAIL_KEY;
}

/**
 * Bind local mood/calendar storage to the logged-in user.
 * Migrates legacy unscoped keys into that user's scope when safe
 * (no owner, or owner matches). Never copies another account's data.
 * Does not delete other users' scoped keys.
 */
export function bindMoodStorageToUser(userId: string | null) {
  const next = userId?.trim() || null;
  if (next === activeMoodUserId) return;
  activeMoodUserId = next;
  if (!next) return;
  try {
    const scopedDates = localStorage.getItem(scopedKey(LEGACY_STORAGE_KEY, next));
    const scopedDetails = localStorage.getItem(scopedKey(LEGACY_DETAIL_KEY, next));
    const hasScoped =
      (scopedDates != null && scopedDates !== "" && scopedDates !== "[]") ||
      (scopedDetails != null &&
        scopedDetails !== "" &&
        scopedDetails !== "{}");
    if (hasScoped) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    const owner = localStorage.getItem(OWNER_KEY)?.trim() || "";
    const legacyDates = localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacyDetails = localStorage.getItem(LEGACY_DETAIL_KEY);
    const hasLegacy =
      (legacyDates != null && legacyDates !== "" && legacyDates !== "[]") ||
      (legacyDetails != null &&
        legacyDetails !== "" &&
        legacyDetails !== "{}");
    if (!hasLegacy) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    // Only claim legacy blob for this user when unowned or already theirs.
    if (owner && owner !== next) return;
    if (legacyDates != null) {
      localStorage.setItem(scopedKey(LEGACY_STORAGE_KEY, next), legacyDates);
    }
    if (legacyDetails != null) {
      localStorage.setItem(scopedKey(LEGACY_DETAIL_KEY, next), legacyDetails);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DETAIL_KEY);
    localStorage.setItem(OWNER_KEY, next);
  } catch {
    /* ignore */
  }
}

/** Same-tab signal: localStorage `storage` events do not fire in the writer tab. */
export const MOOD_UPDATED_EVENT = "aimu-mood-updated";

export function notifyMoodUpdated() {
  try {
    window.dispatchEvent(new CustomEvent(MOOD_UPDATED_EVENT));
  } catch {
    /* ignore */
  }
}

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeStored(dates: string[]) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify([...new Set(dates)]));
    if (activeMoodUserId) {
      localStorage.setItem(OWNER_KEY, activeMoodUserId);
    }
  } catch {
    /* ignore quota */
  }
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalize to local YYYY-MM-DD.
 * Already-formed date keys are kept as-is (do not re-parse via Date — UTC shift).
 */
function normalizeDateKey(isoOrDate: string | Date): string | null {
  if (typeof isoOrDate === "string") {
    if (DATE_KEY_RE.test(isoOrDate)) {
      const [y, m, d] = isoOrDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      if (
        dt.getFullYear() !== y ||
        dt.getMonth() !== m - 1 ||
        dt.getDate() !== d
      ) {
        return null;
      }
      return isoOrDate;
    }
    const dt = new Date(isoOrDate);
    if (Number.isNaN(dt.getTime())) return null;
    return toDateKey(dt);
  }
  if (Number.isNaN(isoOrDate.getTime())) return null;
  return toDateKey(isoOrDate);
}

/** Record that a diary/mood entry exists on this calendar day. */
export function recordMoodDate(isoOrDate: string | Date = new Date()) {
  const key = normalizeDateKey(isoOrDate);
  if (!key) return;
  const next = readStored();
  if (!next.includes(key)) {
    next.push(key);
    writeStored(next);
  }
}

export type MoodVisibilityMode = "private" | "explore";

export type MoodDayInfo = {
  dateKey: string;
  mood?: string;
  /** Pebble emotion id (e.g. joyful). */
  moodId?: string;
  /** Pebble icon URL chosen at record time. */
  moodIcon?: string;
  /** Truncated preview for day-card copy. */
  bodyPreview?: string;
  /** Full diary body — preferred when reopening preview. */
  body?: string;
  /** Optional image data-URLs / URLs attached to this entry. */
  images?: string[];
  visibilityMode?: MoodVisibilityMode;
  entryId?: string;
  createdAt?: string;
};

/** Enough data to reopen diary preview (私密 / 探索) from calendar day view. */
export type CalendarDayRecord = {
  dateKey: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images: string[];
  visibilityMode: MoodVisibilityMode;
  entryId: string;
  createdAt: string;
};

/**
 * Storage shape for mood details (per-user key `aimu_mood_details_v1__u_<userId>`,
 * or legacy unscoped `aimu_mood_details_v1` before bind):
 * `{ [dateKey]: MoodDayInfo[] }` — unlimited records per day.
 * Legacy single-object-per-day values are coerced to a one-element array on read.
 */
type DetailsMap = Record<string, MoodDayInfo[]>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceEntry(raw: unknown, dateKey: string): MoodDayInfo | null {
  if (!isPlainObject(raw)) return null;
  const imagesRaw = raw.images;
  const images = Array.isArray(imagesRaw)
    ? imagesRaw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : undefined;
  return {
    dateKey:
      typeof raw.dateKey === "string" && DATE_KEY_RE.test(raw.dateKey)
        ? raw.dateKey
        : dateKey,
    mood: typeof raw.mood === "string" ? raw.mood : undefined,
    moodId: typeof raw.moodId === "string" ? raw.moodId : undefined,
    moodIcon: typeof raw.moodIcon === "string" ? raw.moodIcon : undefined,
    bodyPreview:
      typeof raw.bodyPreview === "string" ? raw.bodyPreview : undefined,
    body: typeof raw.body === "string" ? raw.body : undefined,
    images: images && images.length > 0 ? images : undefined,
    visibilityMode:
      raw.visibilityMode === "private" || raw.visibilityMode === "explore"
        ? raw.visibilityMode
        : undefined,
    entryId: typeof raw.entryId === "string" ? raw.entryId : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
  };
}

/** Migrate legacy single object → `[entry]`; keep arrays as-is. */
function coerceDayList(raw: unknown, dateKey: string): MoodDayInfo[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => coerceEntry(item, dateKey))
      .filter((x): x is MoodDayInfo => !!x);
  }
  const single = coerceEntry(raw, dateKey);
  return single ? [single] : [];
}

function createdAtMs(entry: { createdAt?: string }): number {
  const t = entry.createdAt ? Date.parse(entry.createdAt) : 0;
  return Number.isFinite(t) ? t : 0;
}

function sortNewestFirst(entries: MoodDayInfo[]): MoodDayInfo[] {
  return [...entries].sort((a, b) => createdAtMs(b) - createdAtMs(a));
}

function sortOldestFirst(entries: MoodDayInfo[]): MoodDayInfo[] {
  return [...entries].sort((a, b) => createdAtMs(a) - createdAtMs(b));
}

function resolveEntryId(detail: MoodDayInfo, dateKey: string): string {
  return (
    detail.entryId?.trim() ||
    `entry_day_${dateKey}_${detail.createdAt?.trim() || "legacy"}`
  );
}

function readDetailsMap(): DetailsMap {
  try {
    const raw = localStorage.getItem(detailKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: DetailsMap = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!DATE_KEY_RE.test(key)) continue;
      const list = coerceDayList(value, key);
      if (list.length > 0) out[key] = list;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDetailsMap(map: DetailsMap) {
  try {
    localStorage.setItem(detailKey(), JSON.stringify(map));
    if (activeMoodUserId) {
      localStorage.setItem(OWNER_KEY, activeMoodUserId);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Dates with mood/diary records for calendar red circles.
 * Merges localStorage date marks and detail keys (array length ≥ 1).
 */
export function getMoodDateSet(viewYear?: number): Set<string> {
  void viewYear;
  const set = new Set<string>(readStored());
  for (const [key, list] of Object.entries(readDetailsMap())) {
    if (DATE_KEY_RE.test(key) && list.length >= 1) set.add(key);
  }
  return set;
}

/** All mood/diary details for a day, newest first. */
export function getMoodDetails(dateKey: string): MoodDayInfo[] {
  const key = normalizeDateKey(dateKey);
  if (!key) return [];
  return sortNewestFirst(readDetailsMap()[key] ?? []);
}

/**
 * Latest detail for a day (compat). Prefer `getMoodDetails` for multi-record UI.
 */
export function getMoodDetail(dateKey: string): MoodDayInfo | null {
  const list = getMoodDetails(dateKey);
  return list[0] ?? null;
}

/** Append a diary/mood detail for the day (does not overwrite prior entries). */
export function recordMoodDetail(input: {
  dateKey: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  visibilityMode?: MoodVisibilityMode;
  entryId?: string;
  createdAt?: string;
}) {
  const dateKey = normalizeDateKey(input.dateKey);
  if (!dateKey) return;
  recordMoodDate(dateKey);
  try {
    const map = readDetailsMap();
    const trimmed = input.body.trim();
    const images = (input.images ?? []).filter((x) => x.trim().length > 0);
    const list = [...(map[dateKey] ?? [])];
    const mode: MoodVisibilityMode =
      input.visibilityMode === "explore" ? "explore" : "private";
    const next: MoodDayInfo = {
      dateKey,
      mood: input.mood,
      moodId: input.moodId?.trim() || undefined,
      moodIcon: input.moodIcon?.trim() || undefined,
      body: trimmed,
      bodyPreview: trimmed.slice(0, 80),
      images: images.length > 0 ? images : undefined,
      visibilityMode: mode,
      entryId: input.entryId,
      createdAt: input.createdAt,
    };
    // Idempotent by resolved entryId (covers legacy rows with no stored entryId).
    const existingIdx =
      input.entryId != null && input.entryId !== ""
        ? list.findIndex(
            (e) => resolveEntryId(e, dateKey) === input.entryId
          )
        : -1;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      list[existingIdx] = {
        ...prev,
        ...next,
        // Stamp id onto legacy rows so later raw-id matches stay stable.
        entryId: input.entryId || prev.entryId,
        createdAt: next.createdAt || prev.createdAt,
        moodId: next.moodId || prev.moodId,
        moodIcon: next.moodIcon || prev.moodIcon,
        images: next.images ?? prev.images,
        // Never drop an explicit mode when a partial update omits it.
        visibilityMode: next.visibilityMode ?? prev.visibilityMode ?? "private",
      };
    } else {
      list.push(next);
    }
    map[dateKey] = list;
    writeDetailsMap(map);
    notifyMoodUpdated();
  } catch {
    /* ignore */
  }
}

/**
 * Merge remote diary rows into local calendar storage (idempotent by entryId).
 * Used when pulling server entries onto Android / another browser.
 */
export function mergeMoodDetailsFromRemote(
  entries: Array<{
    dateKey: string;
    mood: string;
    moodId?: string;
    moodIcon?: string;
    body: string;
    images?: string[];
    visibilityMode?: MoodVisibilityMode;
    entryId?: string;
    createdAt?: string;
  }>
) {
  for (const e of entries) {
    recordMoodDetail({
      dateKey: e.dateKey,
      mood: e.mood,
      moodId: e.moodId,
      moodIcon: e.moodIcon,
      body: e.body,
      images: e.images,
      visibilityMode: e.visibilityMode,
      entryId: e.entryId,
      createdAt: e.createdAt,
    });
  }
  notifyMoodUpdated();
}

/** Flatten local day arrays for upload / sync (newest not required). */
export function listLocalMoodDetailsForSync(): Array<{
  dateKey: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images: string[];
  visibilityMode: MoodVisibilityMode;
  entryId: string;
  createdAt: string;
}> {
  const out: Array<{
    dateKey: string;
    mood: string;
    moodId?: string;
    moodIcon?: string;
    body: string;
    images: string[];
    visibilityMode: MoodVisibilityMode;
    entryId: string;
    createdAt: string;
  }> = [];
  for (const [dateKey, list] of Object.entries(readDetailsMap())) {
    for (const d of list) {
      const body = (d.body ?? d.bodyPreview ?? "").trim();
      const images = d.images ?? [];
      if (!body && images.length === 0) continue;
      out.push({
        dateKey,
        mood: d.mood?.trim() || "今天",
        moodId: d.moodId,
        moodIcon: d.moodIcon,
        body,
        images,
        visibilityMode: d.visibilityMode === "explore" ? "explore" : "private",
        entryId: resolveEntryId(d, dateKey),
        createdAt: d.createdAt?.trim() || `${dateKey}T12:00:00.000`,
      });
    }
  }
  return out;
}

function detailToCalendarRecord(
  detail: MoodDayInfo
): CalendarDayRecord | null {
  const body = (detail.body ?? detail.bodyPreview ?? "").trim();
  const images = detail.images ?? [];
  if (!body && images.length === 0) return null;
  const mode: MoodVisibilityMode =
    detail.visibilityMode === "explore" ? "explore" : "private";
  const dateKey = detail.dateKey;
  return {
    dateKey,
    mood: detail.mood?.trim() || "今天",
    moodId: detail.moodId?.trim() || undefined,
    moodIcon: detail.moodIcon?.trim() || undefined,
    body,
    images,
    visibilityMode: mode,
    entryId: resolveEntryId(detail, dateKey),
    createdAt: detail.createdAt?.trim() || `${dateKey}T12:00:00.000`,
  };
}

/**
 * All reopenable day records for a date, morning → night (createdAt ascending).
 * Older rows may only have bodyPreview / lack mode — backfill defaults.
 */
export function getCalendarDayRecords(dateKey: string): CalendarDayRecord[] {
  const key = normalizeDateKey(dateKey);
  if (!key) return [];
  return sortOldestFirst(readDetailsMap()[key] ?? [])
    .map(detailToCalendarRecord)
    .filter((r): r is CalendarDayRecord => !!r);
}

/** Consecutive same-mood sections for day preview (records already morning→night). */
export type CalendarMoodSection = {
  mood: string;
  moodId?: string;
  moodIcon?: string;
  records: CalendarDayRecord[];
};

export function groupCalendarDayRecordsByMood(
  records: CalendarDayRecord[]
): CalendarMoodSection[] {
  const sections: CalendarMoodSection[] = [];
  for (const r of records) {
    const last = sections[sections.length - 1];
    const sameMood =
      last &&
      last.mood === r.mood &&
      (last.moodId || "") === (r.moodId || "");
    if (sameMood && last) {
      last.records.push(r);
      if (!last.moodIcon && r.moodIcon) last.moodIcon = r.moodIcon;
    } else {
      sections.push({
        mood: r.mood,
        moodId: r.moodId,
        moodIcon: r.moodIcon,
        records: [r],
      });
    }
  }
  return sections;
}

/**
 * All reopenable diary records across days, newest → oldest.
 * Used for vertical history browsing (skip empty days).
 */
export function listAllCalendarDayRecordsNewestFirst(): CalendarDayRecord[] {
  const out: CalendarDayRecord[] = [];
  for (const list of Object.values(readDetailsMap())) {
    for (const d of list) {
      const rec = detailToCalendarRecord(d);
      if (rec) out.push(rec);
    }
  }
  return out.sort((a, b) => {
    const tb = Date.parse(b.createdAt) || 0;
    const ta = Date.parse(a.createdAt) || 0;
    if (tb !== ta) return tb - ta;
    return b.entryId.localeCompare(a.entryId);
  });
}

/**
 * Resolve the latest stored day record for diary preview reopen.
 * Prefer `getCalendarDayRecords` when the day may have multiple entries.
 */
export function getCalendarDayRecord(
  dateKey: string
): CalendarDayRecord | null {
  const newest = getMoodDetails(dateKey)
    .map(detailToCalendarRecord)
    .filter((r): r is CalendarDayRecord => !!r);
  return newest[0] ?? null;
}

/**
 * Remove one day record by entryId from local calendar storage.
 * Clears the date mark when the day becomes empty.
 */
export function deleteMoodDetailByEntryId(entryId: string): boolean {
  const id = entryId.trim();
  if (!id) return false;
  try {
    const map = readDetailsMap();
    let removed = false;
    let emptiedKey: string | null = null;
    for (const [dateKey, list] of Object.entries(map)) {
      const idx = list.findIndex((e) => resolveEntryId(e, dateKey) === id);
      if (idx < 0) continue;
      const next = [...list.slice(0, idx), ...list.slice(idx + 1)];
      if (next.length === 0) {
        delete map[dateKey];
        emptiedKey = dateKey;
      } else {
        map[dateKey] = next;
      }
      removed = true;
      break;
    }
    if (!removed) return false;
    writeDetailsMap(map);
    if (emptiedKey) {
      writeStored(readStored().filter((k) => k !== emptiedKey));
    }
    notifyMoodUpdated();
    return true;
  } catch {
    return false;
  }
}
