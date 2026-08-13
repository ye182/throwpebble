import {
  listAllCalendarDayRecordsNewestFirst,
  toDateKey,
  type CalendarDayRecord,
} from "./calendarMood";
import { resolveMoodIcon } from "./moods";

export type CalendarStatsView = "day" | "month" | "year";

export type EmotionStatRow = {
  key: string;
  mood: string;
  moodId?: string;
  moodIcon: string;
  count: number;
  percent: number;
};

export type EmotionStatsSnapshot = {
  total: number;
  rows: EmotionStatRow[];
};

export type FrequentDayRow = {
  dateKey: string;
  count: number;
};

export type FrequentMonthRow = {
  /** YYYY-MM */
  monthKey: string;
  count: number;
};

export type FrequentPeriodRow = {
  startKey: string;
  endKey: string;
  days: number;
  count: number;
  avgPerDay: number;
};

export type FrequentHourBand = {
  label: string;
  /** e.g. "18:00到24:00" */
  rangeLabel: string;
  count: number;
  percent: number;
  /** One-line insight, e.g. "18:00到24:00为您的最常记录时段，共记录11次，占全部记录73%" */
  summary: string;
};

export type FrequentRecordsSnapshot = {
  total: number;
  /** Top single days by record count (desc). Used in month view. */
  days: FrequentDayRow[];
  /** Top months by record count (desc). Used in year view. */
  months: FrequentMonthRow[];
  /** Hottest multi-day consecutive stretch by total records (if any). */
  hotPeriod: FrequentPeriodRow | null;
  /** Optional peak hour-of-day band. */
  hourBand: FrequentHourBand | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthPrefix(year: number, monthIndex: number) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

function parseDateKey(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function addDays(dateKey: string, delta: number): string | null {
  const dt = parseDateKey(dateKey);
  if (!dt) return null;
  dt.setDate(dt.getDate() + delta);
  return toDateKey(dt);
}

export function moodRecordKey(record: CalendarDayRecord): string {
  const id = record.moodId?.trim();
  if (id) return `id:${id}`;
  return `label:${record.mood.trim() || "今天"}`;
}

/** Format YYYY-MM-DD → `8月12日`. */
export function formatMoodStatDate(dateKey: string): string {
  const dt = parseDateKey(dateKey);
  if (!dt) return dateKey;
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/** Format YYYY-MM → `8月`. */
export function formatMoodStatMonth(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${Number(m[2])}月`;
}

export function formatMoodStatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function listRecordsInRange(input: {
  view: CalendarStatsView;
  selected: Date;
  year: number;
  monthIndex: number;
}): CalendarDayRecord[] {
  const all = listAllCalendarDayRecordsNewestFirst();
  if (input.view === "day") {
    const key = toDateKey(input.selected);
    return all.filter((r) => r.dateKey === key);
  }
  if (input.view === "month") {
    const prefix = monthPrefix(input.year, input.monthIndex);
    return all.filter((r) => r.dateKey.startsWith(prefix));
  }
  const y = String(input.year);
  return all.filter((r) => r.dateKey.startsWith(`${y}-`));
}

export function listRecordsForMoodKey(
  input: {
    view: CalendarStatsView;
    selected: Date;
    year: number;
    monthIndex: number;
  },
  moodKey: string
): CalendarDayRecord[] {
  return listRecordsInRange(input).filter(
    (r) => moodRecordKey(r) === moodKey
  );
}

/**
 * Aggregate emotion counts for the active calendar range.
 * One diary entry = one emotion. Private + explore both count.
 */
export function computeEmotionStats(input: {
  view: CalendarStatsView;
  selected: Date;
  year: number;
  monthIndex: number;
}): EmotionStatsSnapshot {
  const records = listRecordsInRange(input);
  const total = records.length;
  const buckets = new Map<
    string,
    { mood: string; moodId?: string; moodIcon: string; count: number }
  >();

  for (const r of records) {
    const key = moodRecordKey(r);
    const prev = buckets.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.moodIcon && r.moodIcon) {
        prev.moodIcon = resolveMoodIcon(r.moodId, r.mood, r.moodIcon);
      }
    } else {
      buckets.set(key, {
        mood: r.mood.trim() || "今天",
        moodId: r.moodId?.trim() || undefined,
        moodIcon: resolveMoodIcon(r.moodId, r.mood, r.moodIcon),
        count: 1,
      });
    }
  }

  const rows: EmotionStatRow[] = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      mood: b.mood,
      moodId: b.moodId,
      moodIcon: b.moodIcon,
      count: b.count,
      percent: total > 0 ? Math.round((b.count / total) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.mood.localeCompare(b.mood, "zh");
    });

  return { total, rows };
}

function findHottestConsecutivePeriod(
  dayCounts: Map<string, number>
): FrequentPeriodRow | null {
  const keys = [...dayCounts.keys()].sort();
  if (keys.length < 2) return null;

  type Run = {
    start: string;
    end: string;
    days: number;
    count: number;
  };
  const runs: Run[] = [];
  let start = keys[0];
  let end = keys[0];
  let days = 1;
  let count = dayCounts.get(keys[0]) ?? 0;

  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1];
    const cur = keys[i];
    if (addDays(prev, 1) === cur) {
      end = cur;
      days += 1;
      count += dayCounts.get(cur) ?? 0;
    } else {
      if (days >= 2) runs.push({ start, end, days, count });
      start = cur;
      end = cur;
      days = 1;
      count = dayCounts.get(cur) ?? 0;
    }
  }
  if (days >= 2) runs.push({ start, end, days, count });
  if (runs.length === 0) return null;

  let best = runs[0];
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    if (r.count > best.count) best = r;
    else if (r.count === best.count && r.end > best.end) best = r;
  }

  return {
    startKey: best.start,
    endKey: best.end,
    days: best.days,
    count: best.count,
    avgPerDay: Math.round((best.count / best.days) * 10) / 10,
  };
}

function findPeakHourBand(
  records: CalendarDayRecord[]
): FrequentHourBand | null {
  if (records.length === 0) return null;
  const bands: Array<{
    label: string;
    startH: number;
    endH: number;
  }> = [
    { label: "清晨", startH: 5, endH: 9 },
    { label: "上午", startH: 9, endH: 12 },
    { label: "下午", startH: 12, endH: 18 },
    { label: "晚上", startH: 18, endH: 24 },
    { label: "深夜", startH: 0, endH: 5 },
  ];
  const counts = bands.map(() => 0);
  for (const r of records) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getHours();
    const idx = bands.findIndex((b) => h >= b.startH && h < b.endH);
    if (idx >= 0) counts[idx] += 1;
  }
  let best = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[best]) best = i;
  }
  const count = counts[best];
  if (count <= 0) return null;
  const band = bands[best];
  const percent = Math.round((count / records.length) * 100);
  const rangeLabel = `${pad2(band.startH)}:00到${pad2(band.endH === 24 ? 24 : band.endH)}:00`;
  return {
    label: band.label,
    rangeLabel,
    count,
    percent,
    summary: `${rangeLabel}为您的最常记录时段，共记录${count}次，占全部记录${percent}%`,
  };
}

const FREQUENT_DAY_LIMIT = 5;
const FREQUENT_MONTH_LIMIT = 12;

/**
 * Which days / months / hours were written most often in the active range.
 */
export function computeFrequentRecords(input: {
  view: CalendarStatsView;
  selected: Date;
  year: number;
  monthIndex: number;
}): FrequentRecordsSnapshot {
  const records = listRecordsInRange(input);
  const total = records.length;
  const dayCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  for (const r of records) {
    dayCounts.set(r.dateKey, (dayCounts.get(r.dateKey) ?? 0) + 1);
    const monthKey = r.dateKey.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    }
  }

  const days: FrequentDayRow[] = [...dayCounts.entries()]
    .map(([dateKey, count]) => ({ dateKey, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.dateKey.localeCompare(a.dateKey);
    })
    .slice(0, FREQUENT_DAY_LIMIT);

  const months: FrequentMonthRow[] = [...monthCounts.entries()]
    .map(([monthKey, count]) => ({ monthKey, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.monthKey.localeCompare(a.monthKey);
    })
    .slice(0, FREQUENT_MONTH_LIMIT);

  return {
    total,
    days,
    months,
    hotPeriod: findHottestConsecutivePeriod(dayCounts),
    hourBand: findPeakHourBand(records),
  };
}

export function scopeLabel(input: {
  view: CalendarStatsView;
  selected: Date;
  year: number;
  monthIndex: number;
}): string {
  if (input.view === "day") {
    return formatMoodStatDate(toDateKey(input.selected));
  }
  if (input.view === "month") {
    return `${input.year}年${input.monthIndex + 1}月`;
  }
  return `${input.year}年`;
}
