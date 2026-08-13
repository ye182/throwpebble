import { useEffect, useMemo, useState } from "react";
import {
  getCalendarDayRecords,
  listAllCalendarDayRecordsNewestFirst,
  toDateKey,
  type CalendarDayRecord,
} from "../../lib/calendarMood";
import {
  computeFrequentRecords,
  formatMoodStatDate,
  formatMoodStatMonth,
  formatMoodStatTime,
  type CalendarStatsView,
} from "../../lib/calendarMoodStats";
import { StatRecordCard } from "./StatRecordCard";

type Props = {
  view: CalendarStatsView;
  selected: Date;
  year: number;
  monthIndex: number;
  moodTick: number;
  onOpenRecord?: (record: CalendarDayRecord) => void;
};

type RankRow = {
  key: string;
  label: string;
  count: number;
  /** Day key when opening day detail. */
  dateKey: string | null;
  /** Month key (YYYY-MM) when opening month detail. */
  monthKey: string | null;
};

function buildDayTimeRanks(selected: Date): RankRow[] {
  const key = toDateKey(selected);
  const records = listAllCalendarDayRecordsNewestFirst().filter(
    (r) => r.dateKey === key
  );
  const buckets = new Map<string, number>();
  for (const r of records) {
    const t = formatMoodStatTime(r.createdAt) || "—";
    buckets.set(t, (buckets.get(t) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([label, count]) => ({
      key: `t:${label}`,
      label,
      count,
      dateKey: null as string | null,
      monthKey: null as string | null,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 5);
}

export function FrequentRecordsPanel({
  view,
  selected,
  year,
  monthIndex,
  moodTick,
  onOpenRecord,
}: Props) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  const range = useMemo(
    () => ({ view, selected, year, monthIndex }),
    [view, selected, year, monthIndex]
  );
  const rangeKey = `${view}|${selected.getTime()}|${year}|${monthIndex}|${moodTick}`;

  useEffect(() => {
    setActiveDay(null);
    setActiveMonth(null);
  }, [view, selected.getTime(), year, monthIndex]);

  const freq = useMemo(
    () => computeFrequentRecords(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeKey]
  );

  const ranks = useMemo((): RankRow[] => {
    if (view === "day") return buildDayTimeRanks(selected);
    // Year → months; month → days
    if (view === "year") {
      return freq.months.map((m) => ({
        key: m.monthKey,
        label: formatMoodStatMonth(m.monthKey),
        count: m.count,
        dateKey: null,
        monthKey: m.monthKey,
      }));
    }
    return freq.days.map((d) => ({
      key: d.dateKey,
      label: formatMoodStatDate(d.dateKey),
      count: d.count,
      dateKey: d.dateKey,
      monthKey: null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, freq.days, freq.months, view, selected]);

  const dayRecords = useMemo(() => {
    if (!activeDay) return [];
    return getCalendarDayRecords(activeDay).slice().reverse();
  }, [activeDay, moodTick]);

  const monthRecords = useMemo(() => {
    if (!activeMonth) return [];
    return listAllCalendarDayRecordsNewestFirst().filter((r) =>
      r.dateKey.startsWith(activeMonth)
    );
  }, [activeMonth, moodTick]);

  if (activeDay) {
    return (
      <div className="calendar-insight-panel frequent-records-panel is-detail">
        <header className="calendar-insight-header">
          <button
            type="button"
            className="calendar-insight-back"
            onClick={() => setActiveDay(null)}
          >
            ← 返回
          </button>
          <h2 className="calendar-insight-title">
            {formatMoodStatDate(activeDay)}
          </h2>
          <p className="calendar-insight-sub">
            共记录 {dayRecords.length} 次
          </p>
        </header>
        <div className="calendar-insight-body" data-allow-y-scroll>
          {dayRecords.length === 0 ? (
            <p className="calendar-insight-empty">这一天没有记录</p>
          ) : (
            <ul className="stat-record-list">
              {dayRecords.map((r) => (
                <li key={r.entryId}>
                  <StatRecordCard record={r} onOpen={onOpenRecord} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (activeMonth) {
    return (
      <div className="calendar-insight-panel frequent-records-panel is-detail">
        <header className="calendar-insight-header">
          <button
            type="button"
            className="calendar-insight-back"
            onClick={() => setActiveMonth(null)}
          >
            ← 返回
          </button>
          <h2 className="calendar-insight-title">
            {formatMoodStatMonth(activeMonth)}
          </h2>
          <p className="calendar-insight-sub">
            共记录 {monthRecords.length} 次
          </p>
        </header>
        <div className="calendar-insight-body" data-allow-y-scroll>
          {monthRecords.length === 0 ? (
            <p className="calendar-insight-empty">这个月没有记录</p>
          ) : (
            <ul className="stat-record-list">
              {monthRecords.map((r) => (
                <li key={r.entryId}>
                  <StatRecordCard record={r} onOpen={onOpenRecord} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-insight-panel frequent-records-panel">
      <header className="calendar-insight-header">
        <h2 className="calendar-insight-title">记录频次</h2>
      </header>
      <div className="calendar-insight-body" data-allow-y-scroll>
        {freq.total === 0 ? (
          <p className="calendar-insight-empty">
            {view === "day"
              ? "今日暂无情绪记录"
              : "这段时间还没有情绪记录"}
          </p>
        ) : (
          <>
            <ol className="frequent-day-list">
              {ranks.map((row, i) => {
                const clickable = Boolean(row.dateKey || row.monthKey);
                const inner = (
                  <>
                    <span className="frequent-day-rank">
                      {i === 0
                        ? "🥇"
                        : i === 1
                          ? "🥈"
                          : i === 2
                            ? "🥉"
                            : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="frequent-day-main">
                      <span className="frequent-day-date">{row.label}</span>
                      <span className="frequent-day-count">{row.count}次</span>
                    </span>
                  </>
                );
                return (
                  <li key={row.key}>
                    {clickable ? (
                      <button
                        type="button"
                        className="frequent-day-row"
                        onClick={() => {
                          if (row.monthKey) setActiveMonth(row.monthKey);
                          else if (row.dateKey) setActiveDay(row.dateKey);
                        }}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className="frequent-day-row is-static">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ol>

            {freq.hourBand && view !== "day" ? (
              <section className="frequent-hour-band" aria-label="最常记录时段">
                <p className="frequent-hour-summary">{freq.hourBand.summary}</p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
