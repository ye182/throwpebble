import { useEffect, useMemo, useState } from "react";
import type { CalendarDayRecord } from "../../lib/calendarMood";
import {
  computeEmotionStats,
  listRecordsForMoodKey,
  scopeLabel,
  type CalendarStatsView,
  type EmotionStatRow,
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

export function EmotionStatsPanel({
  view,
  selected,
  year,
  monthIndex,
  moodTick,
  onOpenRecord,
}: Props) {
  const [activeMood, setActiveMood] = useState<EmotionStatRow | null>(null);

  const rangeKey = `${view}|${selected.getTime()}|${year}|${monthIndex}|${moodTick}`;

  const range = useMemo(
    () => ({ view, selected, year, monthIndex }),
    [view, selected, year, monthIndex]
  );

  useEffect(() => {
    setActiveMood(null);
  }, [view, selected.getTime(), year, monthIndex]);

  const stats = useMemo(
    () => computeEmotionStats(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeKey]
  );

  const scope = useMemo(() => scopeLabel(range), [range]);

  const moodRecords = useMemo(() => {
    if (!activeMood) return [];
    return listRecordsForMoodKey(range, activeMood.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMood, rangeKey]);

  if (activeMood) {
    return (
      <div className="calendar-insight-panel emotion-stats-panel is-detail">
        <header className="calendar-insight-header">
          <button
            type="button"
            className="calendar-insight-back"
            onClick={() => setActiveMood(null)}
          >
            ← 返回
          </button>
          <h2 className="calendar-insight-title">{activeMood.mood}</h2>
          <p className="calendar-insight-sub">
            {scope} · 共记录 {activeMood.count} 次
          </p>
        </header>
        <div className="calendar-insight-body" data-allow-y-scroll>
          {moodRecords.length === 0 ? (
            <p className="calendar-insight-empty">没有找到相关记录</p>
          ) : (
            <ul className="stat-record-list">
              {moodRecords.map((r) => (
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
    <div className="calendar-insight-panel emotion-stats-panel">
      <header className="calendar-insight-header">
        <h2 className="calendar-insight-title">情绪统计</h2>
      </header>
      <div className="calendar-insight-body" data-allow-y-scroll>
        {stats.total === 0 ? (
          <p className="calendar-insight-empty">
            {view === "day"
              ? "今日暂无情绪记录"
              : "这段时间还没有情绪记录"}
          </p>
        ) : (
          <ul className="emotion-stats-list">
            {stats.rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className="emotion-stats-row is-button"
                  onClick={() => setActiveMood(row)}
                >
                  <div className="emotion-stats-row-head">
                    {row.moodIcon ? (
                      <img
                        className="emotion-stats-icon"
                        src={row.moodIcon}
                        alt=""
                      />
                    ) : (
                      <span
                        className="emotion-stats-icon is-empty"
                        aria-hidden
                      />
                    )}
                    <span className="emotion-stats-label">{row.mood}</span>
                    <span className="emotion-stats-meta">
                      {row.count}次 · {row.percent}%
                    </span>
                  </div>
                  <div
                    className="emotion-stats-bar-track"
                    aria-hidden
                    data-mood={row.moodId || ""}
                  >
                    <div
                      className="emotion-stats-bar-fill"
                      style={{ width: `${Math.max(row.percent, 2)}%` }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
