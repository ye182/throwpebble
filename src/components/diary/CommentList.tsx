import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  commentsToChatMessages,
  requestExploreTurn,
  type DiaryComment,
  type ExploreChatMessage,
} from "../../lib/diaryApi";
import { resolveChatActor } from "../../lib/profileStore";

type Props = {
  body: string;
  images?: string[];
  /** Diary entry id for explore turn API. */
  entryId: string | null;
  mood: string;
  moodIcon?: string;
  comments: DiaryComment[];
  /** Only exploration mode shows character conversation. */
  showConversation: boolean;
  /** Local system time when the note was saved. */
  updatedAt: Date | null;
  fullscreenOpen: boolean;
  onFullscreenOpenChange: (open: boolean) => void;
  /** Vertical history: swipe up = older, down = newer. */
  onHistorySwipe?: (direction: "older" | "newer") => void;
};

const COMMENT_ANIM_MS = 450;
const COMMENT_STAGGER_S = 0.35;
const COMMENT_BASE_DELAY_S = 0.15;
const DRAG_THRESHOLD = 8;
/** Yellow-zone preview shows at most this many recent pins. */
const PIN_PREVIEW_LIMIT = 1;

function formatYmdHm(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}年${m}月${d}日 ${h}:${min}`;
}

type SavedBodyProps = {
  body: string;
  images?: string[];
  mood?: string;
  moodIcon?: string;
  pinned: ExploreChatMessage[];
  updatedAt?: Date | null;
  /** Extra pins not shown in preview (yellow zone only). */
  pinnedMoreCount?: number;
  onPinnedOpen?: (msg: ExploreChatMessage) => void;
};

type SavedStampProps = {
  updatedAt: Date | null;
  className?: string;
};

function SavedStamp({ updatedAt, className }: SavedStampProps) {
  if (!updatedAt) return null;
  return (
    <time
      className={className ?? "record-stamp"}
      dateTime={updatedAt.toISOString()}
    >
      记录于{formatYmdHm(updatedAt)}
    </time>
  );
}

function PinnedReplyItem({
  msg,
  onOpen,
}: {
  msg: ExploreChatMessage;
  onOpen?: (msg: ExploreChatMessage) => void;
}) {
  const stamped = (() => {
    const d = new Date(msg.createdAt);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  function open() {
    onOpen?.(msg);
  }

  return (
    <li
      className="pinned-reply-item"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? "查看收藏消息全文" : undefined}
      onClick={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        open();
      }}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }}
    >
      {/* text → time (meta) → yellow border on li */}
      <div className="pinned-reply-card">
        <p className="pinned-reply-text">{msg.content}</p>
        {stamped && (
          <div className="pinned-reply-meta">
            <time
              className="record-stamp"
              dateTime={stamped.toISOString()}
            >
              {formatYmdHm(stamped)}
            </time>
          </div>
        )}
      </div>
    </li>
  );
}

function SavedBodyOnly({
  body,
  images = [],
  mood,
  moodIcon,
  pinned,
  updatedAt = null,
  pinnedMoreCount = 0,
  onPinnedOpen,
}: SavedBodyProps) {
  return (
    <>
      {(mood || moodIcon) && (
        <p className="saved-mood-row">
          {moodIcon ? (
            <img className="saved-mood-icon" src={moodIcon} alt="" />
          ) : null}
          {mood ? <span className="saved-mood-label">{mood}</span> : null}
        </p>
      )}
      {body.trim() ? <p className="saved-body">{body}</p> : null}
      {images.length > 0 && (
        <ul className="saved-image-list" aria-label="记录图片">
          {images.map((src, i) => (
            <li key={`saved-img-${i}`} className="saved-image-item">
              <img src={src} alt="" className="saved-image" />
            </li>
          ))}
        </ul>
      )}
      {/* Diary time follows body only — never abspos on the yellow zone */}
      <SavedStamp
        updatedAt={updatedAt}
        className="record-stamp record-stamp--after-body"
      />
      {pinned.length > 0 && (
        <ul className="pinned-reply-list">
          {pinned.map((r) => (
            <PinnedReplyItem key={r.id} msg={r} onOpen={onPinnedOpen} />
          ))}
        </ul>
      )}
      {pinnedMoreCount > 0 && (
        <p className="pinned-preview-more">还有 {pinnedMoreCount} 条收藏</p>
      )}
    </>
  );
}

function SavedContentBlock({
  body,
  images = [],
  mood,
  moodIcon,
  pinned,
  updatedAt = null,
  pinnedMoreCount = 0,
  onPinnedOpen,
}: SavedBodyProps) {
  return (
    <div className="saved-content-block">
      <SavedBodyOnly
        body={body}
        images={images}
        mood={mood}
        moodIcon={moodIcon}
        pinned={pinned}
        updatedAt={updatedAt}
        pinnedMoreCount={pinnedMoreCount}
        onPinnedOpen={onPinnedOpen}
      />
    </div>
  );
}

function openPreviewKeyDown(
  e: ReactKeyboardEvent<HTMLDivElement>,
  open: () => void
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}

export function CommentList({
  body,
  images = [],
  entryId,
  mood,
  moodIcon,
  comments,
  showConversation,
  updatedAt,
  fullscreenOpen,
  onFullscreenOpenChange,
  onHistorySwipe,
}: Props) {
  const [messages, setMessages] = useState<ExploreChatMessage[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [focusedPinned, setFocusedPinned] =
    useState<ExploreChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [composerReady, setComposerReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [turnError, setTurnError] = useState("");
  const [yellowDropActive, setYellowDropActive] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  const yellowRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const turnRoundRef = useRef(0);

  useEffect(() => {
    if (!showConversation) {
      setMessages([]);
      setComposerReady(false);
      turnRoundRef.current = 0;
      return;
    }
    const opening = commentsToChatMessages(comments, 0);
    setMessages(opening);
    setFreshIds(new Set(opening.map((m) => m.id)));
    turnRoundRef.current = 0;
    setPinnedIds([]);
    setFocusedPinned(null);
    setTurnError("");
  }, [showConversation, comments]);

  useEffect(() => {
    if (!showConversation || comments.length === 0) {
      setComposerReady(false);
      return;
    }
    const lastIndex = comments.length - 1;
    const delayMs =
      (COMMENT_BASE_DELAY_S + lastIndex * COMMENT_STAGGER_S) * 1000 +
      COMMENT_ANIM_MS +
      80;
    const t = window.setTimeout(() => setComposerReady(true), delayMs);
    return () => window.clearTimeout(t);
  }, [showConversation, comments.length]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  useEffect(() => {
    if (!fullscreenOpen && !focusedPinned) return;
    function onKey(e: Event) {
      if ((e as globalThis.KeyboardEvent).key !== "Escape") return;
      if (focusedPinned) {
        setFocusedPinned(null);
        return;
      }
      if (fullscreenOpen) onFullscreenOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreenOpen, focusedPinned, onFullscreenOpenChange]);

  const clearGhost = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
  }, []);

  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      const id = dragIdRef.current;
      const moved = draggingRef.current;
      dragIdRef.current = null;
      pointerIdRef.current = null;
      draggingRef.current = false;
      setYellowDropActive(false);
      clearGhost();

      if (!moved || !id) return;

      const zone = yellowRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (!inside) return;
      setPinnedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    },
    [clearGhost]
  );

  function onUserPointerDown(
    e: ReactPointerEvent<HTMLLIElement>,
    replyId: string
  ) {
    if (e.button !== 0 || sending) return;
    dragIdRef.current = replyId;
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    draggingRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onUserPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    if (pointerIdRef.current !== e.pointerId || !dragIdRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (!draggingRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      draggingRef.current = true;
      const source = e.currentTarget;
      const ghost = document.createElement("div");
      ghost.className = "comment-drag-ghost";
      ghost.textContent =
        source.querySelector(".comment-text")?.textContent ?? "";
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
    }

    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.left = `${e.clientX + 8}px`;
      ghost.style.top = `${e.clientY + 8}px`;
    }

    const zone = yellowRef.current;
    if (zone) {
      const rect = zone.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      setYellowDropActive(inside);
    }
  }

  function onUserPointerUp(e: ReactPointerEvent<HTMLLIElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    endDrag(e.clientX, e.clientY);
  }

  function onUserPointerCancel(e: ReactPointerEvent<HTMLLIElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    dragIdRef.current = null;
    pointerIdRef.current = null;
    draggingRef.current = false;
    setYellowDropActive(false);
    clearGhost();
  }

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending || !entryId) return;

    const round = turnRoundRef.current + 1;
    const userMsg: ExploreChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      round,
    };

    const historyBefore = messages;
    setMessages((list) => [...list, userMsg]);
    setDraft("");
    setSending(true);
    setTurnError("");

    try {
      const { replies } = await requestExploreTurn({
        entryId,
        mood,
        diaryBody: body,
        userMessage: text,
        history: [...historyBefore, userMsg],
        round,
      });
      turnRoundRef.current = round;
      const characterMsgs = commentsToChatMessages(replies, round);
      setFreshIds(new Set(characterMsgs.map((m) => m.id)));
      setMessages((list) => [...list, ...characterMsgs]);
    } catch (err) {
      setTurnError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setSending(false);
    }
  }

  const pinnedMessages = messages.filter(
    (m) => m.role === "user" && pinnedIds.includes(m.id)
  );
  // Keep originals in the thread; yellow zone shows pin copies only.
  // Preview: latest N only so the yellow card does not crowd the reply thread.
  const pinnedPreview = pinnedMessages.slice(-PIN_PREVIEW_LIMIT);
  const pinnedMoreCount = Math.max(
    0,
    pinnedMessages.length - PIN_PREVIEW_LIMIT
  );

  const openPinnedFullscreen = useCallback((msg: ExploreChatMessage) => {
    setFocusedPinned(msg);
  }, []);

  const openFullscreen = () => onFullscreenOpenChange(true);

  const historySwipeRef = useRef<{
    id: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const suppressHistoryClickRef = useRef(false);

  function onHistoryPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!onHistorySwipe || e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, a, input, textarea, .reply-composer")) return;
    historySwipeRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: true,
    };
  }

  function onHistoryPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const st = historySwipeRef.current;
    if (!st?.active || st.id !== e.pointerId) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    // Prefer vertical; abandon if clearly horizontal
    if (Math.abs(dx) > Math.abs(dy) * 1.15) {
      st.active = false;
    }
  }

  function onHistoryPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const st = historySwipeRef.current;
    if (!st || st.id !== e.pointerId) return;
    historySwipeRef.current = null;
    if (!st.active || !onHistorySwipe) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dy) < 56 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    suppressHistoryClickRef.current = true;
    // Finger up → older; finger down → newer
    onHistorySwipe(dy < 0 ? "older" : "newer");
  }

  function openPreviewUnlessSwiped() {
    if (suppressHistoryClickRef.current) {
      suppressHistoryClickRef.current = false;
      return;
    }
    openFullscreen();
  }

  const historySwipeProps = onHistorySwipe
    ? {
        onPointerDown: onHistoryPointerDown,
        onPointerMove: onHistoryPointerMove,
        onPointerUp: onHistoryPointerUp,
        onPointerCancel: onHistoryPointerUp,
      }
    : {};

  // Portal to body — escape .diary-stage overflow / containing block for fixed
  const fullscreenLayer =
    fullscreenOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="saved-fullscreen"
            role="dialog"
            aria-modal="true"
            aria-label="完整保存内容"
            onClick={() => onFullscreenOpenChange(false)}
            {...historySwipeProps}
          >
            <div
              className="saved-fullscreen-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="back-btn saved-fullscreen-back"
                onClick={() => onFullscreenOpenChange(false)}
              >
                ← 返回
              </button>
              <div className="saved-fullscreen-scroll">
                <SavedBodyOnly
                  body={body}
                  images={images}
                  mood={mood}
                  moodIcon={moodIcon}
                  pinned={showConversation ? pinnedMessages : []}
                  updatedAt={updatedAt}
                  onPinnedOpen={
                    showConversation ? openPinnedFullscreen : undefined
                  }
                />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const pinnedFullscreenLayer =
    focusedPinned && typeof document !== "undefined"
      ? createPortal(
          <div
            className="saved-fullscreen is-pinned-focus"
            role="dialog"
            aria-modal="true"
            aria-label="收藏消息全文"
            onClick={() => setFocusedPinned(null)}
          >
            <div
              className="saved-fullscreen-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="back-btn saved-fullscreen-back"
                onClick={() => setFocusedPinned(null)}
              >
                ← 返回
              </button>
              <div className="saved-fullscreen-scroll">
                <p className="pinned-fullscreen-body">
                  {focusedPinned.content}
                </p>
                {(() => {
                  const d = new Date(focusedPinned.createdAt);
                  if (Number.isNaN(d.getTime())) return null;
                  return (
                    <time
                      className="record-stamp record-stamp--flow"
                      dateTime={d.toISOString()}
                    >
                      {formatYmdHm(d)}
                    </time>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (!showConversation) {
    return (
      <div className="diary-panel comments-panel" {...historySwipeProps}>
        <div
          className="editor-paper comments-paper saved-preview-frame"
          role="button"
          tabIndex={0}
          aria-label="查看完整保存内容"
          onKeyDown={(e) => openPreviewKeyDown(e, openFullscreen)}
          onClick={openPreviewUnlessSwiped}
        >
          <SavedContentBlock
            body={body}
            images={images}
            mood={mood}
            moodIcon={moodIcon}
            pinned={[]}
            updatedAt={updatedAt}
          />
        </div>
        {fullscreenLayer}
        {pinnedFullscreenLayer}
      </div>
    );
  }

  return (
    <div className="comments-panel is-explore-thread" {...historySwipeProps}>
      <div
        ref={yellowRef}
        className={
          yellowDropActive
            ? "saved-yellow-zone is-drop-active"
            : "saved-yellow-zone"
        }
        /* region — not role=button: pin items inside are buttons */
        role="region"
        tabIndex={0}
        aria-label="日记黄区，点击空白处查看全文"
        onKeyDown={(e) => openPreviewKeyDown(e, openFullscreen)}
        onClick={openPreviewUnlessSwiped}
      >
        <SavedContentBlock
          body={body}
          images={images}
          mood={mood}
          moodIcon={moodIcon}
          pinned={pinnedPreview}
          pinnedMoreCount={pinnedMoreCount}
          updatedAt={updatedAt}
          onPinnedOpen={openPinnedFullscreen}
        />
      </div>

      <div className="comments-divider" aria-hidden />

      <div className="comments-page-thread" ref={threadRef}>
        <ul className="comment-list">
          {messages.map((m) => {
            if (m.role === "character" && m.characterId) {
              const actor = resolveChatActor(m.characterId);
              const animate = freshIds.has(m.id);
              const freshIndex = animate
                ? [...freshIds].indexOf(m.id)
                : 0;
              return (
                <li
                  key={m.id}
                  className={
                    animate
                      ? "comment-item is-character"
                      : "comment-item is-character is-settled"
                  }
                  style={
                    animate
                      ? {
                          animationDelay: `${COMMENT_BASE_DELAY_S + freshIndex * COMMENT_STAGGER_S}s`,
                        }
                      : undefined
                  }
                >
                  <img
                    src={actor.avatarUrl}
                    alt=""
                    className="comment-avatar"
                    draggable={false}
                  />
                  <div className="comment-body">
                    <div className="comment-meta">
                      <strong>{actor.name}</strong>
                    </div>
                    <p className="comment-text">{m.content}</p>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={m.id}
                className="comment-item is-user is-draggable"
                onPointerDown={(e) => onUserPointerDown(e, m.id)}
                onPointerMove={onUserPointerMove}
                onPointerUp={onUserPointerUp}
                onPointerCancel={onUserPointerCancel}
              >
                <div className="comment-body">
                  <div className="comment-meta">
                    <strong>我</strong>
                    <span>拖到上方黄区可收藏</span>
                  </div>
                  <p className="comment-text">{m.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {sending && (
          <p className="explore-turn-pending" aria-live="polite">
            角色们正在回复…
          </p>
        )}
        {turnError && (
          <p className="explore-turn-error" role="alert">
            {turnError}
          </p>
        )}
      </div>

      {composerReady && (
        <form
          className="reply-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void sendReply();
          }}
        >
          <input
            type="text"
            className="reply-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="回复一条消息…"
            aria-label="回复消息"
            disabled={sending || !entryId}
          />
          <button
            type="submit"
            className="reply-send"
            disabled={!draft.trim() || sending || !entryId}
          >
            {sending ? "…" : "发送"}
          </button>
        </form>
      )}

      {fullscreenLayer}
      {pinnedFullscreenLayer}
    </div>
  );
}
