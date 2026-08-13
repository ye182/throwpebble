import type { CalendarDayRecord } from "../../lib/calendarMood";
import {
  formatMoodStatDate,
  formatMoodStatTime,
} from "../../lib/calendarMoodStats";
import { resolveMoodIcon } from "../../lib/moods";

type Props = {
  record: CalendarDayRecord;
  onOpen?: (record: CalendarDayRecord) => void;
};

/** Full record card for emotion / frequent drill-down lists. */
export function StatRecordCard({ record, onOpen }: Props) {
  const icon = resolveMoodIcon(
    record.moodId,
    record.mood,
    record.moodIcon
  );
  const time = formatMoodStatTime(record.createdAt);
  const modeLabel =
    record.visibilityMode === "explore" ? "探索" : "私密";

  return (
    <article
      className={
        onOpen ? "stat-record-card is-openable" : "stat-record-card"
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(record)}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(record);
        }
      }}
    >
      <header className="stat-record-head">
        <p className="stat-record-date">
          {formatMoodStatDate(record.dateKey)}
          {time ? <span className="stat-record-time"> · {time}</span> : null}
        </p>
        <span className="stat-record-mode">{modeLabel}</span>
      </header>
      <p className="stat-record-mood">
        {icon ? (
          <img className="stat-record-mood-icon" src={icon} alt="" />
        ) : null}
        <span>{record.mood}</span>
      </p>
      {record.body.trim() ? (
        <p className="stat-record-body">{record.body}</p>
      ) : null}
      {record.images.length > 0 ? (
        <ul className="stat-record-images" aria-label="记录图片">
          {record.images.map((src, i) => (
            <li key={`${record.entryId}-img-${i}`}>
              <img src={src} alt="" className="stat-record-image" />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
