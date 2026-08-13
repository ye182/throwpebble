import { useEffect, useState } from "react";
import type { CalendarDayRecord } from "../../lib/calendarMood";
import { listAllCalendarDayRecordsNewestFirst } from "../../lib/calendarMood";
import {
  fetchDiaryComments,
  saveDiaryEntry,
  type DiaryComment,
} from "../../lib/diaryApi";
import { resolveMoodIcon } from "../../lib/moods";
import { getChatRoleKeys } from "../../lib/profileStore";
import { CommentList } from "./CommentList";
import { DiaryEditor, type VisibilityMode } from "./DiaryEditor";
import { MoodBottomDecos } from "./MoodBottomDecos";
import { MoodSelect } from "./MoodSelect";
import { PageFlip } from "./PageFlip";

export type DiaryStep = "mood" | "write" | "comments";

/** Open diary at saved preview (from calendar day → 这一天有记录). */
export type DiaryPreviewSeed = CalendarDayRecord;

/**
 * Calendar「继续记录」 / 「修改」: skip mood cards, open write.
 * With entryId → edit in place; otherwise append a new record for the day.
 */
export type DiaryWriteSeed = {
  mood: string;
  moodId?: string;
  moodIcon?: string;
  /** Day to append / update this save onto (from calendar). */
  dateKey: string;
  /** Prefill body when editing an existing day record. */
  body?: string;
  images?: string[];
  visibilityMode?: VisibilityMode;
  entryId?: string;
  /** Preserve original stamp when editing. */
  createdAt?: string;
};

type Props = {
  onBack: () => void;
  onStepChange?: (step: DiaryStep) => void;
  onSaved?: (mood: string, body: string) => void;
  /** When set, mount directly on comments preview for that day. */
  previewSeed?: DiaryPreviewSeed | null;
  /** When set (and no previewSeed), mount on write step. */
  writeSeed?: DiaryWriteSeed | null;
  /**
   * Calendar「去记录」path: mood cards first, but save still lands on this day.
   * Prefer writeSeed.dateKey when both are set.
   */
  recordDateKey?: string | null;
};

function savedAtFromSeed(seed: DiaryPreviewSeed): Date {
  const d = new Date(seed.createdAt);
  if (!Number.isNaN(d.getTime())) return d;
  const fallback = new Date(`${seed.dateKey}T12:00:00`);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function DiaryFlow({
  onBack,
  onStepChange,
  onSaved,
  previewSeed = null,
  writeSeed = null,
  recordDateKey = null,
}: Props) {
  const [step, setStep] = useState<DiaryStep>(() => {
    if (previewSeed) return "comments";
    if (writeSeed) return "write";
    return "mood";
  });
  const [mood, setMood] = useState(
    () => previewSeed?.mood ?? writeSeed?.mood ?? ""
  );
  /** Pebble emotion id from home drag (e.g. joyful); label stays in `mood`. */
  const [moodId, setMoodId] = useState(
    () => previewSeed?.moodId ?? writeSeed?.moodId ?? ""
  );
  const [moodIcon, setMoodIcon] = useState(
    () =>
      previewSeed?.moodIcon ??
      writeSeed?.moodIcon ??
      resolveMoodIcon(
        previewSeed?.moodId ?? writeSeed?.moodId,
        previewSeed?.mood ?? writeSeed?.mood
      )
  );
  const [body, setBody] = useState(
    () => previewSeed?.body ?? writeSeed?.body ?? ""
  );
  const [images, setImages] = useState<string[]>(
    () => previewSeed?.images ?? writeSeed?.images ?? []
  );
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>(
    () =>
      previewSeed?.visibilityMode ?? writeSeed?.visibilityMode ?? "private"
  );
  const [flipping, setFlipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<DiaryComment[]>([]);
  const [entryId, setEntryId] = useState<string | null>(
    () => previewSeed?.entryId ?? writeSeed?.entryId ?? null
  );
  const [savedAt, setSavedAt] = useState<Date | null>(() => {
    if (previewSeed) return savedAtFromSeed(previewSeed);
    if (writeSeed?.createdAt) {
      const d = new Date(writeSeed.createdAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  });
  const [error, setError] = useState("");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Preview reopen: reload opening replies from chat-role pool (explore + private).
  useEffect(() => {
    if (!previewSeed || getChatRoleKeys().length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchDiaryComments(previewSeed.entryId, {
          mood: previewSeed.mood,
          body: previewSeed.body,
        });
        if (!cancelled) setComments(list);
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSeed]);

  function handleMood(label: string, emotionId?: string) {
    if (flipping) return;
    setMood(label);
    setMoodId(emotionId ?? "");
    setMoodIcon(resolveMoodIcon(emotionId, label));
    setFlipping(true);
  }

  function onFlipEnd() {
    setFlipping(false);
    setStep("write");
  }

  function handleBack() {
    if (fullscreenOpen) {
      setFullscreenOpen(false);
      return;
    }
    // Saved preview: leave the flow (home/mood remount). Entry was already
    // persisted on Save — this only resets the UI, it does not unsaved content.
    if (step === "comments") {
      setFullscreenOpen(false);
      onBack();
      return;
    }
    if (step === "write") {
      // Calendar「继续记录」skipped mood pick — Back leaves the flow.
      if (writeSeed) {
        onBack();
        return;
      }
      setFlipping(false);
      setStep("mood");
      return;
    }
    onBack();
  }

  async function handleSave() {
    if ((!body.trim() && images.length === 0) || saving) return;
    setSaving(true);
    setError("");
    try {
      const dateKey = writeSeed?.dateKey ?? recordDateKey ?? undefined;
      const icon =
        moodIcon || resolveMoodIcon(moodId, mood) || undefined;
      const entry = await saveDiaryEntry({
        mood,
        moodId: moodId || undefined,
        moodIcon: icon,
        body: body.trim(),
        images,
        visibilityMode,
        dateKey,
        entryId: writeSeed?.entryId ?? entryId ?? undefined,
        createdAt: writeSeed?.createdAt ?? undefined,
      });
      const stamp = new Date(entry.createdAt);
      setSavedAt(Number.isNaN(stamp.getTime()) ? new Date() : stamp);
      setEntryId(entry.id);
      if (entry.moodId) setMoodId(entry.moodId);
      if (entry.moodIcon) setMoodIcon(entry.moodIcon);
      setVisibilityMode(entry.visibilityMode ?? visibilityMode);
      // Opening replies only for explore mode.
      if (
        (entry.visibilityMode ?? visibilityMode) === "explore" &&
        getChatRoleKeys().length > 0
      ) {
        try {
          const list = await fetchDiaryComments(entry.id, {
            mood: entry.mood,
            body: entry.body,
          });
          setComments(list);
        } catch {
          setComments([]);
        }
      } else {
        setComments([]);
      }
      setStep("comments");
      onSaved?.(entry.mood, entry.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const showBackHeader = step === "write" || step === "comments";
  const showConversation =
    visibilityMode === "explore" &&
    getChatRoleKeys().length > 0 &&
    comments.length > 0;

  function applyHistoryRecord(record: CalendarDayRecord) {
    setMood(record.mood);
    setMoodId(record.moodId ?? "");
    setMoodIcon(
      resolveMoodIcon(record.moodId, record.mood, record.moodIcon)
    );
    setBody(record.body);
    setImages(record.images ?? []);
    setVisibilityMode(record.visibilityMode);
    setEntryId(record.entryId);
    const stamp = new Date(record.createdAt);
    setSavedAt(Number.isNaN(stamp.getTime()) ? null : stamp);
    setComments([]);
    if (
      record.visibilityMode === "explore" &&
      getChatRoleKeys().length > 0
    ) {
      void (async () => {
        try {
          const list = await fetchDiaryComments(record.entryId, {
            mood: record.mood,
            body: record.body,
          });
          setComments(list);
        } catch {
          setComments([]);
        }
      })();
    }
  }

  function handleHistorySwipe(direction: "older" | "newer") {
    const timeline = listAllCalendarDayRecordsNewestFirst();
    if (timeline.length === 0) return;
    const currentId = entryId?.trim() || "";
    let idx = currentId
      ? timeline.findIndex((r) => r.entryId === currentId)
      : -1;
    if (idx < 0) {
      // Fallback: match by date + mood + body snippet
      idx = timeline.findIndex(
        (r) =>
          r.mood === mood &&
          r.body === body &&
          (r.images?.length ?? 0) === images.length
      );
    }
    if (idx < 0) idx = 0;
    // newest → oldest: older = +1, newer = -1
    const nextIdx = direction === "older" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= timeline.length) return;
    applyHistoryRecord(timeline[nextIdx]);
  }

  return (
    <div className="diary-flow">
      {showBackHeader && (
        <header
          className={
            fullscreenOpen ? "sub-header is-over-fullscreen" : "sub-header"
          }
        >
          <button type="button" className="back-btn" onClick={handleBack}>
            ← 返回
          </button>
          <span className="sub-header-title" />
          <span className="sub-header-spacer" />
        </header>
      )}

      {error && (
        <p className="diary-error" role="alert">
          {error}
        </p>
      )}

      <div className="diary-stage">
        {step === "mood" && (
          <PageFlip flipping={flipping} onFlipEnd={onFlipEnd}>
            <MoodSelect onSelect={handleMood} />
          </PageFlip>
        )}
        {step === "write" && (
          <div
            className={
              visibilityMode === "private"
                ? "diary-write-page diary-panel-enter is-private"
                : "diary-write-page diary-panel-enter is-explore"
            }
            data-mood-id={moodId || undefined}
            data-mood-label={mood || undefined}
            data-mood-icon={moodIcon || undefined}
          >
            <DiaryEditor
              body={body}
              onChange={setBody}
              images={images}
              onImagesChange={setImages}
              onSave={handleSave}
              saving={saving}
              visibilityMode={visibilityMode}
              onVisibilityModeChange={setVisibilityMode}
            />
            <div className="mood-bottom-decos-slot" aria-hidden={visibilityMode === "private"}>
              <MoodBottomDecos />
            </div>
          </div>
        )}
        {step === "comments" && (
          <div
            className={
              visibilityMode === "private"
                ? "diary-write-page diary-panel-enter is-private"
                : "diary-write-page diary-panel-enter is-explore"
            }
          >
            <CommentList
              body={body}
              images={images}
              entryId={entryId}
              mood={mood}
              moodIcon={moodIcon || resolveMoodIcon(moodId, mood)}
              comments={comments}
              showConversation={showConversation}
              updatedAt={savedAt}
              fullscreenOpen={fullscreenOpen}
              onFullscreenOpenChange={setFullscreenOpen}
              onHistorySwipe={handleHistorySwipe}
            />
            {/* Conversation view: no bottom kitten. Private without comments keeps slot. */}
            {visibilityMode === "private" && !showConversation && (
              <div className="mood-bottom-decos-slot" aria-hidden>
                <MoodBottomDecos />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
