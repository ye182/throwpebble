import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { type TabId } from "./components/BottomNav";
import {
  CalendarModule,
  type CalendarRestore,
} from "./components/calendar/CalendarModule";
import {
  DiaryFlow,
  type DiaryPreviewSeed,
  type DiaryStep,
  type DiaryWriteSeed,
} from "./components/diary/DiaryFlow";
import { MailModule } from "./components/mail/MailModule";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  getMoodDetail,
  type CalendarDayRecord,
} from "./lib/calendarMood";
import { syncDiaryEntriesToCalendar } from "./lib/diaryApi";
import { MOODS } from "./lib/moods";

type Props = {
  onLoggedOut: () => void;
};

/** Where Back should land. Empty stack → home. */
type BackTarget = {
  tab: "calendar";
  restore: CalendarRestore;
};

export function DiaryApp({ onLoggedOut }: Props) {
  const [tab, setTab] = useState<TabId>("home");
  const [diaryStep, setDiaryStep] = useState<DiaryStep>("mood");
  const [remountKey, setRemountKey] = useState(0);
  /** Bump when entering calendar so day/month mood lists re-read storage. */
  const [calendarRefresh, setCalendarRefresh] = useState(0);
  const [calendarRestore, setCalendarRestore] =
    useState<CalendarRestore | null>(null);
  const [previewSeed, setPreviewSeed] = useState<DiaryPreviewSeed | null>(
    null
  );
  const [writeSeed, setWriteSeed] = useState<DiaryWriteSeed | null>(null);
  /** Calendar「去记录」: keep target day through mood → write → save. */
  const [recordDateKey, setRecordDateKey] = useState<string | null>(null);
  const [backStack, setBackStack] = useState<BackTarget[]>([]);

  const onStepChange = useCallback((step: DiaryStep) => {
    setDiaryStep(step);
  }, []);

  // Warm calendar cache after login / app enter (iOS ↔ Android same account).
  useEffect(() => {
    void syncDiaryEntriesToCalendar();
  }, []);

  const showNav =
    tab !== "home" ||
    diaryStep === "mood" ||
    diaryStep === "write" ||
    diaryStep === "comments";

  function goHomeFresh() {
    setPreviewSeed(null);
    setWriteSeed(null);
    setRecordDateKey(null);
    setCalendarRestore(null);
    setBackStack([]);
    setTab("home");
    setDiaryStep("mood");
    setRemountKey((k) => k + 1);
  }

  /** Back: previous page if any, otherwise home. */
  function handleDiaryBack() {
    setPreviewSeed(null);
    setWriteSeed(null);
    setRecordDateKey(null);
    const prev = backStack[backStack.length - 1];
    if (!prev) {
      goHomeFresh();
      return;
    }
    setBackStack((s) => s.slice(0, -1));
    if (prev.tab === "calendar") {
      setCalendarRestore(prev.restore);
      setTab("calendar");
      setCalendarRefresh((k) => k + 1);
      return;
    }
    goHomeFresh();
  }

  function handleTabChange(id: TabId) {
    setBackStack([]);
    setPreviewSeed(null);
    setWriteSeed(null);
    setRecordDateKey(null);
    setCalendarRestore(null);
    setTab(id);
    if (id === "home") {
      setDiaryStep("mood");
      setRemountKey((k) => k + 1);
    }
    if (id === "calendar") {
      setCalendarRefresh((k) => k + 1);
    }
  }

  /** Calendar day record → diary preview; Back returns to that day view. */
  function handleOpenDayRecord(seed: DiaryPreviewSeed) {
    setBackStack((s) => [
      ...s,
      {
        tab: "calendar",
        restore: { dateKey: seed.dateKey, view: "day" },
      },
    ]);
    setWriteSeed(null);
    setRecordDateKey(null);
    setPreviewSeed(seed);
    setDiaryStep("comments");
    setTab("home");
    setRemountKey((k) => k + 1);
  }

  /**
   * pick → mood cards; continue → write with latest mood for that day
   * (fallback first mood card). Back returns to that calendar day.
   */
  function handleGoRecord(dateKey: string, mode: "pick" | "continue") {
    setBackStack((s) => [
      ...s,
      {
        tab: "calendar",
        restore: { dateKey, view: "day" },
      },
    ]);
    setPreviewSeed(null);
    setCalendarRestore(null);
    setRecordDateKey(dateKey);
    if (mode === "continue") {
      const latest = getMoodDetail(dateKey);
      const mood = latest?.mood?.trim() || MOODS[0].label;
      setWriteSeed({
        mood,
        moodId: latest?.moodId,
        moodIcon: latest?.moodIcon,
        dateKey,
      });
      setDiaryStep("write");
    } else {
      setWriteSeed(null);
      setDiaryStep("mood");
    }
    setTab("home");
    setRemountKey((k) => k + 1);
  }

  /** Calendar swipe「修改」→ write page prefilled; save updates by entryId. */
  function handleEditDayRecord(record: CalendarDayRecord) {
    setBackStack((s) => [
      ...s,
      {
        tab: "calendar",
        restore: { dateKey: record.dateKey, view: "day" },
      },
    ]);
    setPreviewSeed(null);
    setCalendarRestore(null);
    setRecordDateKey(record.dateKey);
    setWriteSeed({
      mood: record.mood,
      moodId: record.moodId,
      moodIcon: record.moodIcon,
      dateKey: record.dateKey,
      body: record.body,
      images: record.images,
      visibilityMode: record.visibilityMode,
      entryId: record.entryId,
      createdAt: record.createdAt,
    });
    setDiaryStep("write");
    setTab("home");
    setRemountKey((k) => k + 1);
  }

  return (
    <AppShell tab={tab} onTabChange={handleTabChange} showNav={showNav}>
      {tab === "home" ? (
        <DiaryFlow
          key={remountKey}
          onBack={handleDiaryBack}
          onStepChange={onStepChange}
          previewSeed={previewSeed}
          writeSeed={writeSeed}
          recordDateKey={recordDateKey}
        />
      ) : null}
      {tab === "calendar" ? (
        <CalendarModule
          key={calendarRefresh}
          refreshToken={calendarRefresh}
          restore={calendarRestore}
          onOpenDayRecord={handleOpenDayRecord}
          onGoRecord={handleGoRecord}
          onEditDayRecord={handleEditDayRecord}
        />
      ) : null}
      {tab === "mail" ? <MailModule /> : null}
      {/* Keep Profile mounted across tab switches so stack state / scroll persist */}
      <div
        className="tab-pane"
        hidden={tab !== "paws"}
        aria-hidden={tab !== "paws"}
      >
        <SettingsPanel onLoggedOut={onLoggedOut} />
      </div>
    </AppShell>
  );
}
