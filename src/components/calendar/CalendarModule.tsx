import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getCalendarDayRecords,
  getMoodDateSet,
  groupCalendarDayRecordsByMood,
  MOOD_UPDATED_EVENT,
  toDateKey,
  type CalendarDayRecord,
} from "../../lib/calendarMood";
import {
  deleteDiaryEntry,
  syncDiaryEntriesToCalendar,
} from "../../lib/diaryApi";
import { assetUrl } from "../../lib/assetUrl";
import { calendarDaySublabel } from "../../lib/lunarLabel";
import { resolveMoodIcon } from "../../lib/moods";
import { EmotionStatsPanel } from "./EmotionStatsPanel";
import { FrequentRecordsPanel } from "./FrequentRecordsPanel";

/** Horizontal pan threshold to change day/month/year on the calendar block. */
const RANGE_SWIPE_PX = 56;

/** Total reveal width for clustered 修改 / 删除 group. */
const SWIPE_OPEN_X = -132;

/** Left-swipe row: reveal 修改 / 删除 under a day-record body. */
function DayRecordSwipeRow({
  record,
  open,
  onOpenChange,
  onOpenPreview,
  onEdit,
  onDelete,
}: {
  record: CalendarDayRecord;
  open: boolean;
  onOpenChange: (entryId: string | null) => void;
  onOpenPreview?: (record: CalendarDayRecord) => void;
  onEdit?: (record: CalendarDayRecord) => void;
  onDelete: (record: CalendarDayRecord) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [draggingUi, setDraggingUi] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    setOffset(open ? SWIPE_OPEN_X : 0);
  }, [open]);

  function settle(next: number) {
    const opened = next < SWIPE_OPEN_X / 2;
    setOffset(opened ? SWIPE_OPEN_X : 0);
    setDraggingUi(false);
    onOpenChange(opened ? record.entryId : null);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true;
    setDraggingUi(true);
    axis.current = null;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (axis.current == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis.current === "v") {
        dragging.current = false;
        setDraggingUi(false);
        return;
      }
    }
    if (axis.current !== "h") return;
    e.preventDefault();
    const next = Math.min(0, Math.max(SWIPE_OPEN_X, startOffset.current + dx));
    setOffset(next);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current && axis.current !== "h") {
      dragging.current = false;
      setDraggingUi(false);
      axis.current = null;
      return;
    }
    const wasH = axis.current === "h";
    dragging.current = false;
    axis.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!wasH) {
      setDraggingUi(false);
      return;
    }
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 8 || Math.abs(offset - startOffset.current) > 8) {
      suppressClick.current = true;
    }
    settle(offset);
  }

  const previewText =
    record.body.trim().slice(0, 80) ||
    (record.images.length > 0 ? "留下了一张图片印记。" : "留下过一段心情印记。");

  return (
    <div className="calendar-day-swipe">
      <div
        className={[
          "calendar-day-swipe-actions",
          open || offset < -4 ? "is-visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={!open}
      >
        <div className="calendar-day-swipe-action-cluster">
          <button
            type="button"
            className="calendar-day-swipe-btn is-edit"
            tabIndex={open ? 0 : -1}
            disabled={!onEdit}
            onClick={(e) => {
              e.stopPropagation();
              if (!onEdit) return;
              onOpenChange(null);
              onEdit(record);
            }}
          >
            修改
          </button>
          <button
            type="button"
            className="calendar-day-swipe-btn is-delete"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(null);
              onDelete(record);
            }}
          >
            删除
          </button>
        </div>
      </div>
      <div
        className={[
          "calendar-day-swipe-front",
          onOpenPreview ? "is-openable" : "",
          draggingUi ? "is-dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ transform: `translate3d(${offset}px,0,0)` }}
        role={onOpenPreview ? "button" : undefined}
        tabIndex={onOpenPreview ? 0 : undefined}
        aria-label={
          onOpenPreview ? `查看日记预览：${record.mood}` : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (offset < -8) {
            settle(0);
            return;
          }
          onOpenPreview?.(record);
        }}
        onKeyDown={(e) => {
          if (!onOpenPreview) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenPreview(record);
          }
        }}
      >
        <p className="calendar-day-preview">{previewText}</p>
        {record.images.length > 0 && (
          <div className="calendar-day-preview-thumbs" aria-hidden>
            {record.images.slice(0, 3).map((src, i) => (
              <img
                key={`${record.entryId}-img-${i}`}
                src={src}
                alt=""
                className="calendar-day-preview-thumb"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type ViewMode = "year" | "month" | "day";

export type CalendarRestore = {
  dateKey: string;
  view: ViewMode;
};

function dateFromKey(dateKey: string): Date | null {
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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_EN = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May.",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
] as const;

/** Hand-drawn day mark — solid stroke; mood red / today·pick green. Never a geometric circle. */
function SelectedDateDecoration({
  variant,
}: {
  variant: "mood" | "today" | "pick";
}) {
  return (
    <svg
      className={`calendar-mood-ring is-${variant}`}
      viewBox="0 0 44 44"
      aria-hidden
    >
      <path
        d="M12.2 21.5
           C10.5 12.8, 16.2 8.4, 22.8 8.1
           C30.8 7.8, 35.6 12.2, 36.2 20.4
           C36.8 28.8, 31.4 35.6, 22.6 36.1
           C14.2 36.6, 8.8 31.2, 9.4 22.8
           C9.6 20.2, 10.8 17.5, 12.2 21.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DateHeader({
  monthIndex,
  year,
  dayOfMonth,
}: {
  monthIndex: number;
  year: number;
  /** Day view: show DD as the hero number instead of month. */
  dayOfMonth?: number;
}) {
  const hero =
    dayOfMonth != null
      ? String(dayOfMonth).padStart(2, "0")
      : String(monthIndex + 1).padStart(2, "0");
  return (
    <div className="calendar-date-info">
      <p className="calendar-hero-num">{hero}</p>
      <p className="calendar-hero-en">
        {MONTH_EN[monthIndex]}
        <span className="calendar-hero-year">{year}</span>
      </p>
    </div>
  );
}

function IllustrationArea({
  src = assetUrl("assets/calendar-companion.png?v=kitten-water-2"),
  caption,
}: {
  src?: string;
  /** Optional muted line under the image (day-view record count). */
  caption?: ReactNode;
}) {
  return (
    <div className="calendar-illustration">
      {/*
        Box size locked in CSS (.calendar-illustration-avatar).
        Only swap src — do not change header grid / margins.
      */}
      <img
        className="calendar-illustration-avatar"
        src={src}
        alt=""
        draggable={false}
        aria-hidden
      />
      {caption}
    </div>
  );
}

function WeekHeader() {
  return (
    <div className="calendar-weekdays" aria-hidden>
      {WEEKDAYS.map((w, i) => (
        <span
          key={w}
          className={
            i >= 5 ? "calendar-weekday is-weekend" : "calendar-weekday"
          }
        >
          {w}
        </span>
      ))}
    </div>
  );
}

function buildMonthCells(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < mondayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIndex, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthHasMood(
  year: number,
  monthIndex: number,
  moodSet: Set<string>
): boolean {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (moodSet.has(toDateKey(new Date(year, monthIndex, d)))) return true;
  }
  return false;
}

type GridProps = {
  year: number;
  monthIndex: number;
  moodSet: Set<string>;
  todayKey: string;
  /** Ephemeral click mark (dashed). Cleared when returning month ← day. */
  monthPickKey: string | null;
  onPick: (d: Date) => void;
};

function CalendarGrid({
  year,
  monthIndex,
  moodSet,
  todayKey,
  monthPickKey,
  onPick,
}: GridProps) {
  const cells = useMemo(
    () => buildMonthCells(year, monthIndex),
    [year, monthIndex]
  );


  return (
    <div className="calendar-grid" role="grid" aria-label="月历">
      {cells.map((d, i) => {
        if (!d) {
          return <div key={`e-${i}`} className="calendar-cell is-empty" />;
        }
        const key = toDateKey(d);
        const dow = d.getDay();
        const weekend = dow === 0 || dow === 6;
        const hasMood = moodSet.has(key);
        const isToday = key === todayKey;
        const isPick = monthPickKey != null && key === monthPickKey;
        const ringVariant: "mood" | "today" | "pick" | null = hasMood
          ? "mood"
          : isPick
            ? "pick"
            : isToday
              ? "today"
              : null;
        return (
          <button
            key={key}
            type="button"
            role="gridcell"
            className={[
              "calendar-cell",
              weekend ? "is-weekend" : "",
              hasMood ? "has-mood" : "",
              isToday ? "is-today" : "",
              isPick ? "is-month-pick" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onPick(d)}
          >
            <span className="calendar-cell-main">
              {ringVariant ? (
                <SelectedDateDecoration variant={ringVariant} />
              ) : null}
              <span className="calendar-cell-num">{d.getDate()}</span>
            </span>
            <span className="calendar-cell-sub">
              {calendarDaySublabel(d)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Calendar content module only — lives inside existing AppShell / nav.
 * Does not restyle global background, theme, or navigation.
 */
export function CalendarModule({
  refreshToken = 0,
  restore = null,
  onOpenDayRecord,
  onGoRecord,
  onEditDayRecord,
}: {
  /** Bump from DiaryApp when switching to calendar tab to re-read storage. */
  refreshToken?: number;
  /** Restore day/month/year + selected date after Back from diary preview. */
  restore?: CalendarRestore | null;
  /** Open diary preview for a specific day record (私密 / 探索). */
  onOpenDayRecord?: (record: CalendarDayRecord) => void;
  /**
   * pick = 去记录 → mood cards; continue = 继续记录 → write page.
   * Back returns to this day view.
   */
  onGoRecord?: (dateKey: string, mode: "pick" | "continue") => void;
  /** Swipe「修改」→ diary write prefilled for in-place update. */
  onEditDayRecord?: (record: CalendarDayRecord) => void;
} = {}) {
  const today = useMemo(() => new Date(), []);
  const initialRestore = restore ? dateFromKey(restore.dateKey) : null;
  const [view, setView] = useState<ViewMode>(
    () => restore?.view ?? "month"
  );
  const [cursor, setCursor] = useState(() => {
    if (initialRestore) {
      return new Date(
        initialRestore.getFullYear(),
        initialRestore.getMonth(),
        1
      );
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(
    () => initialRestore ?? today
  );
  /** Bump so localStorage mood marks/details re-read. */
  const [moodTick, setMoodTick] = useState(0);
  /** Only one swipe-open row at a time. */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  /** Month: dashed pick ring; cleared when day → month so today mark restores. */
  const [monthPickKey, setMonthPickKey] = useState<string | null>(null);
  useEffect(() => {
    setMoodTick((t) => t + 1);
  }, [refreshToken]);

  // Pull server diary rows (same login) into local calendar — fixes Android lagging iOS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await syncDiaryEntriesToCalendar();
      if (!cancelled) setMoodTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    const refresh = () => setMoodTick((t) => t + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", refresh);
    window.addEventListener(MOOD_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(MOOD_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const moodSet = useMemo(() => getMoodDateSet(year), [year, moodTick]);
  const selectedKey = toDateKey(selected);
  const todayKey = toDateKey(today);
  // All reopenable records for the day (morning → night); empty → empty day copy.
  const dayRecords = useMemo(
    () => getCalendarDayRecords(selectedKey),
    [selectedKey, moodTick]
  );
  const recordCount = dayRecords.length;
  const previewSections = useMemo(
    () => groupCalendarDayRecordsByMood(dayRecords),
    [dayRecords]
  );

  useEffect(() => {
    setOpenSwipeId(null);
  }, [selectedKey]);


  function openDayPreview(record: CalendarDayRecord) {
    if (!onOpenDayRecord) return;
    setOpenSwipeId(null);
    onOpenDayRecord(record);
  }

  async function handleDeleteRecord(record: CalendarDayRecord) {
    await deleteDiaryEntry(record.entryId);
    setOpenSwipeId(null);
    setMoodTick((t) => t + 1);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function shiftYear(delta: number) {
    setCursor((c) => new Date(c.getFullYear() + delta, c.getMonth(), 1));
  }

  function shiftDay(delta: number) {
    setSelected((s) => {
      const next = new Date(s);
      next.setDate(next.getDate() + delta);
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
      setMonthPickKey(toDateKey(next));
      return next;
    });
    setMoodTick((t) => t + 1);
  }

  /** ← / 右滑 = -1; → / 左滑 = +1 */
  function shiftRange(delta: number) {
    if (view === "year") shiftYear(delta);
    else if (view === "month") shiftMonth(delta);
    else shiftDay(delta);
  }

  function pickDay(d: Date) {
    const key = toDateKey(d);
    setMonthPickKey(key);
    setSelected(d);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setMoodTick((t) => t + 1);
    setView("day");
  }

  function switchView(id: ViewMode) {
    if (id === "month") {
      const now = new Date();
      setMonthPickKey(null);
      setSelected(now);
      setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    }
    if (id === "day") setMoodTick((t) => t + 1);
    setView(id);
  }

  const rangeSwipeRef = useRef<{
    id: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  function onRangePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (
      t?.closest(
        "input, textarea, select, .calendar-day-swipe, .calendar-day-swipe-front"
      )
    ) {
      return;
    }
    rangeSwipeRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: true,
    };
  }

  function onRangePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const st = rangeSwipeRef.current;
    if (!st?.active || st.id !== e.pointerId) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.15) {
      st.active = false;
      return;
    }
  }

  function onRangePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const st = rangeSwipeRef.current;
    if (!st || st.id !== e.pointerId) return;
    rangeSwipeRef.current = null;
    if (!st.active) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dx) < RANGE_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) {
      return;
    }
    shiftRange(dx < 0 ? 1 : -1);
  }

  return (
    <div className="calendar-module">
      <div className="calendar-content">
        <div
          className="calendar-surface"
          onPointerDown={onRangePointerDown}
          onPointerMove={onRangePointerMove}
          onPointerUp={onRangePointerUp}
          onPointerCancel={onRangePointerUp}
        >
          <div className="calendar-toolbar">
            <div
              className="calendar-view-switch"
              role="tablist"
              aria-label="日历视图"
            >
              {(
                [
                  ["year", "年"],
                  ["month", "月"],
                  ["day", "日"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className={
                    view === id
                      ? "calendar-view-btn is-active"
                      : "calendar-view-btn"
                  }
                  onClick={() => switchView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="calendar-nav-arrows">
              <button
                type="button"
                className="calendar-arrow"
                aria-label={
                  view === "year"
                    ? "上一年"
                    : view === "day"
                      ? "上一天"
                      : "上一月"
                }
                onClick={() => shiftRange(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="calendar-arrow"
                aria-label={
                  view === "year"
                    ? "下一年"
                    : view === "day"
                      ? "下一天"
                      : "下一月"
                }
                onClick={() => shiftRange(1)}
              >
                ›
              </button>
            </div>
          </div>

          {view === "month" && (
            <div className="calendar-month">
              <header className="calendar-header">
                <DateHeader monthIndex={monthIndex} year={year} />
                <IllustrationArea />
              </header>
              <div className="calendar-body">
                <WeekHeader />
                <CalendarGrid
                  year={year}
                  monthIndex={monthIndex}
                  moodSet={moodSet}
                  todayKey={todayKey}
                  monthPickKey={monthPickKey}
                  onPick={pickDay}
                />
              </div>
            </div>
          )}

          {view === "year" && (
            <div className="calendar-year">
              <h2 className="calendar-year-title">{year}</h2>
              <div className="calendar-year-grid">
                {Array.from({ length: 12 }, (_, mi) => {
                  const cells = buildMonthCells(year, mi);
                  const lit = monthHasMood(year, mi, moodSet);
                  return (
                    <button
                      key={mi}
                      type="button"
                      className={
                        lit
                          ? "calendar-year-card has-mood"
                          : "calendar-year-card"
                      }
                      onClick={() => {
                        setCursor(new Date(year, mi, 1));
                        setView("month");
                      }}
                    >
                      <span className="calendar-year-card-label">
                        {MONTH_EN[mi]}
                        {lit ? (
                          <i className="calendar-year-dot" aria-hidden />
                        ) : null}
                      </span>
                      <div className="calendar-year-mini" aria-hidden>
                        {cells.map((d, i) => (
                          <span
                            key={i}
                            className={
                              d && moodSet.has(toDateKey(d))
                                ? "calendar-year-mini-day is-mood"
                                : "calendar-year-mini-day"
                            }
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "day" && (
            <div className="calendar-day">
              <header className="calendar-header calendar-header--day">
                <DateHeader
                  monthIndex={selected.getMonth()}
                  year={selected.getFullYear()}
                  dayOfMonth={selected.getDate()}
                />
                <IllustrationArea
                  src={assetUrl("assets/calendar-water-sakura.png")}
                  caption={
                    <div
                      className={
                        recordCount > 0
                          ? "calendar-illustration-caption"
                          : "calendar-illustration-caption is-empty"
                      }
                    >
                      {recordCount > 0 ? (
                        <p className="calendar-day-count" aria-live="polite">
                          这一天有 {recordCount} 条记录…
                        </p>
                      ) : null}
                      {onGoRecord ? (
                        <button
                          type="button"
                          className="calendar-day-count-action"
                          onClick={() =>
                            onGoRecord(
                              selectedKey,
                              recordCount > 0 ? "continue" : "pick"
                            )
                          }
                        >
                          {recordCount > 0 ? "继续记录…" : "去记录…"}
                        </button>
                      ) : null}
                    </div>
                  }
                />
              </header>
              {recordCount > 0 ? (
                <div className="calendar-day-previews">
                  {previewSections.map((section) => (
                    <section
                      key={`${section.mood}-${section.records[0]?.entryId ?? "x"}`}
                      className="calendar-day-mood-section"
                    >
                      <p className="calendar-day-mood">
                        {(() => {
                          const icon = resolveMoodIcon(
                            section.moodId,
                            section.mood,
                            section.moodIcon
                          );
                          return (
                            <>
                              {icon ? (
                                <img
                                  className="calendar-day-mood-icon"
                                  src={icon}
                                  alt=""
                                />
                              ) : null}
                              <span>{section.mood}</span>
                            </>
                          );
                        })()}
                      </p>
                      {section.records.map((record) => (
                        <DayRecordSwipeRow
                          key={record.entryId}
                          record={record}
                          open={openSwipeId === record.entryId}
                          onOpenChange={setOpenSwipeId}
                          onOpenPreview={
                            onOpenDayRecord ? openDayPreview : undefined
                          }
                          onEdit={onEditDayRecord}
                          onDelete={handleDeleteRecord}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="calendar-day-empty">这一天还没有情绪记录…</p>
              )}
            </div>
          )}
        </div>

        <div className="calendar-section-spacer" aria-hidden />

        <EmotionStatsPanel
          view={view}
          selected={selected}
          year={year}
          monthIndex={monthIndex}
          moodTick={moodTick}
          onOpenRecord={onOpenDayRecord}
        />

        <div className="calendar-section-spacer" aria-hidden />

        <FrequentRecordsPanel
          view={view}
          selected={selected}
          year={year}
          monthIndex={monthIndex}
          moodTick={moodTick}
          onOpenRecord={onOpenDayRecord}
        />
      </div>
    </div>
  );
}

/** @deprecated use CalendarModule — kept for existing imports */
export function CalendarWall() {
  return <CalendarModule />;
}
