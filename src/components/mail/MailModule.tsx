import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { assetUrl } from "../../lib/assetUrl";
import {
  collectRecentReplySources,
  deleteLetterUserReply,
  deleteReplyLetter,
  fetchReplyHistory,
  generateReplyLetter,
  sendLetterUserReply,
} from "../../lib/replyApi";
import { getReplyLetter } from "../../lib/replyLocalStore";
import type { ReplyLetter, ReplyUserMessage } from "../../lib/replyTypes";

type MailView = "list" | "reader";

/** Horizontal left-swipe distance (px) required to dismiss a sticky. */
const STICKY_SWIPE_THRESHOLD = 72;
/** Fly-away animation length — keep in sync with CSS. */
const STICKY_FLY_MS = 420;
/** Archive list: reveal width for 删除. */
const MAIL_SWIPE_OPEN_X = -76;

function formatLetterDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function letterParagraphs(body: string): string[] {
  return body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Left-swipe archive row: reveal 删除 under the letter card. */
function MailArchiveSwipeRow({
  letter,
  open,
  onOpenChange,
  onOpen,
  onDelete,
}: {
  letter: ReplyLetter;
  open: boolean;
  onOpenChange: (letterId: string | null) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
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
    setOffset(open ? MAIL_SWIPE_OPEN_X : 0);
  }, [open]);

  function settle(next: number) {
    const opened = next < MAIL_SWIPE_OPEN_X / 2;
    setOffset(opened ? MAIL_SWIPE_OPEN_X : 0);
    setDraggingUi(false);
    onOpenChange(opened ? letter.id : null);
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
    const next = Math.min(
      0,
      Math.max(MAIL_SWIPE_OPEN_X, startOffset.current + dx)
    );
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

  const preview =
    letter.body.replace(/\s+/g, " ").slice(0, 64) +
    (letter.body.length > 64 ? "…" : "");

  return (
    <div className="mail-archive-swipe">
      <div
        className={[
          "mail-archive-swipe-actions",
          open || offset < -4 ? "is-visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="mail-archive-swipe-delete"
          tabIndex={open ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(null);
            onDelete(letter.id);
          }}
        >
          删除
        </button>
      </div>
      <div
        className={[
          "mail-archive-swipe-front",
          draggingUi ? "is-dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ transform: `translate3d(${offset}px,0,0)` }}
        role="button"
        tabIndex={0}
        aria-label={`打开信件：${letter.title || "一封信"}`}
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
          onOpen(letter.id);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(letter.id);
          }
        }}
      >
        <div className="mail-archive-item">
          <div className="mail-archive-item-top">
            <span className="mail-archive-item-title">
              {letter.title || "一封信"}
            </span>
            <span className="mail-archive-item-date">
              {formatLetterDate(letter.createdAt)}
            </span>
          </div>
          <p className="mail-archive-item-preview">{preview}</p>
        </div>
      </div>
    </div>
  );
}

type StickyReplyProps = {
  reply: ReplyUserMessage;
  onDismissed: (replyId: string) => void;
};

/**
 * Sticky note with right→left swipe-to-delete (no delete button).
 * Drag follows the finger; past threshold → fly up-left and remove.
 */
function MailStickyReply({ reply, onDismissed }: StickyReplyProps) {
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragRot, setDragRot] = useState(0);
  const [phase, setPhase] = useState<"idle" | "dragging" | "snap" | "fly">(
    "idle"
  );
  const startRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const dragXRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const dismissedRef = useRef(false);
  const flyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  useEffect(() => {
    return () => {
      if (flyTimerRef.current != null) {
        window.clearTimeout(flyTimerRef.current);
      }
    };
  }, []);

  const finishDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (flyTimerRef.current != null) {
      window.clearTimeout(flyTimerRef.current);
      flyTimerRef.current = null;
    }
    onDismissed(reply.id);
  }, [onDismissed, reply.id]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (phaseRef.current === "fly" || e.button !== 0) return;
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    setPhase("dragging");
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId || phaseRef.current !== "dragging") {
      return;
    }
    const dx = e.clientX - startRef.current.x;
    // Only follow leftward swipes (right → left).
    const x = Math.min(0, dx);
    const y = x * 0.18;
    const rot = x * 0.04;
    setDragX(x);
    setDragY(y);
    setDragRot(rot);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    if (phaseRef.current === "fly") return;

    if (-dragXRef.current >= STICKY_SWIPE_THRESHOLD) {
      setPhase("fly");
      flyTimerRef.current = window.setTimeout(finishDismiss, STICKY_FLY_MS);
      return;
    }

    setPhase("snap");
    setDragX(0);
    setDragY(0);
    setDragRot(0);
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    if (phaseRef.current === "fly") return;
    setPhase("snap");
    setDragX(0);
    setDragY(0);
    setDragRot(0);
  }

  const style: CSSProperties =
    phase === "fly"
      ? ({
          ["--fly-x" as string]: `${dragX}px`,
          ["--fly-y" as string]: `${dragY}px`,
          ["--fly-rot" as string]: `${dragRot}deg`,
        } as CSSProperties)
      : {
          transform: `translate(${dragX}px, ${dragY}px) rotate(${dragRot}deg)`,
        };

  return (
    <div
      className={
        phase === "fly"
          ? "mail-user-reply-slot is-flying"
          : phase === "snap"
            ? "mail-user-reply-slot is-snap"
            : phase === "dragging"
              ? "mail-user-reply-slot is-dragging"
              : "mail-user-reply-slot"
      }
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onTransitionEnd={(e) => {
        if (e.propertyName !== "transform") return;
        if (phaseRef.current === "snap") setPhase("idle");
      }}
      onAnimationEnd={(e) => {
        if (e.animationName !== "mail-sticky-fly-away") return;
        finishDismiss();
      }}
    >
      <div className="mail-user-reply">
        <p className="mail-user-reply-text">{reply.body}</p>
      </div>
    </div>
  );
}

/**
 * 项目四「信件」— 列表 → 阅读；正文下可回复；空列表时可触发生成（服务端 LLM / mock）。
 */
export function MailModule() {
  const [view, setView] = useState<MailView>("list");
  const [letters, setLetters] = useState<ReplyLetter[]>([]);
  const [letter, setLetter] = useState<ReplyLetter | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState(false);
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const letterScrollRef = useRef<HTMLElement | null>(null);
  const deliverAttemptedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchReplyHistory();
      setLetters(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await refresh();
      if (cancelled || deliverAttemptedRef.current) return;
      if (list.length > 0) return;
      const sources = collectRecentReplySources(5);
      if (sources.length === 0) return;
      deliverAttemptedRef.current = true;
      setDelivering(true);
      try {
        await generateReplyLetter();
        if (!cancelled) await refresh();
      } catch {
        /* keep empty — user still sees soft empty copy */
      } finally {
        if (!cancelled) setDelivering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function openLetter(id: string) {
    setSwipeOpenId(null);
    const hit =
      getReplyLetter(id) ?? letters.find((h) => h.id === id) ?? null;
    if (!hit) return;
    setLetter(hit);
    setDraft("");
    setView("reader");
  }

  function onDeleteLetter(id: string) {
    setSwipeOpenId(null);
    setLetters((prev) => prev.filter((l) => l.id !== id));
    void deleteReplyLetter(id).then((ok) => {
      if (!ok) void refresh();
    });
  }

  function sendReply() {
    if (!letter) return;
    const text = draft.trim();
    if (!text) return;
    const letterId = letter.id;
    setDraft("");
    void sendLetterUserReply(letterId, text).then((next) => {
      if (!next) return;
      setLetter(next);
      setLetters((prev) =>
        prev.map((l) => (l.id === next.id ? next : l))
      );
      requestAnimationFrame(() => {
        const el = letterScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  function onStickyDismissed(replyId: string) {
    if (!letter) return;
    const letterId = letter.id;
    void deleteLetterUserReply(letterId, replyId).then((next) => {
      if (!next) return;
      setLetter(next);
      setLetters((prev) =>
        prev.map((l) => (l.id === next.id ? next : l))
      );
    });
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  return (
    <div className="mail-module">
      {view === "list" && (
        <section className="mail-archive">
          <header className="mail-archive-header">
            <div className="mail-archive-heading">
              <h1 className="mail-archive-title">信件</h1>
              <p className="mail-archive-lead">看看今天有什么收获</p>
            </div>
            <figure className="mail-archive-art" aria-hidden>
              <img
                className="mail-archive-art-img"
                src={assetUrl("assets/mail-cat-mailbox.png?v=watercolor-2")}
                alt=""
                draggable={false}
              />
            </figure>
          </header>

          <div className="mail-archive-scroll">
            {loading || delivering ? (
              <p className="mail-empty">
                {delivering ? "有一封信在路上…" : "加载中…"}
              </p>
            ) : letters.length === 0 ? (
              <p className="mail-empty">
                还没有收到信件。
                <br />
                当你留下足够的痕迹后，会有信慢慢寄到这里。
              </p>
            ) : (
              <ul className="mail-archive-list">
                {letters.map((h) => (
                  <li key={h.id}>
                    <MailArchiveSwipeRow
                      letter={h}
                      open={swipeOpenId === h.id}
                      onOpenChange={setSwipeOpenId}
                      onOpen={openLetter}
                      onDelete={onDeleteLetter}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {view === "reader" && letter && (
        <section className="mail-reader">
          <header className="mail-reader-top">
            <button
              type="button"
              className="mail-text-btn"
              onClick={() => {
                setView("list");
                setDraft("");
                void refresh();
              }}
            >
              ← 返回
            </button>
          </header>

          <article className="mail-letter" ref={letterScrollRef}>
            <h2 className="mail-letter-title">
              {letter.title || "一封信"}
            </h2>
            <div className="mail-letter-body">
              {letterParagraphs(letter.body).map((para, i) => (
                <p key={`p-${i}`}>{para}</p>
              ))}
            </div>

            {(letter.userReplies?.length ?? 0) > 0 ? (
              <div className="mail-user-replies">
                {letter.userReplies!.map((r) => (
                  <MailStickyReply
                    key={r.id}
                    reply={r}
                    onDismissed={onStickyDismissed}
                  />
                ))}
              </div>
            ) : null}
          </article>

          <footer className="mail-reader-footer mail-composer">
            <textarea
              className="mail-composer-input"
              rows={1}
              value={draft}
              placeholder="回复"
              aria-label="回复这封信"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <button
              type="button"
              className="mail-composer-send"
              disabled={!draft.trim()}
              onClick={sendReply}
            >
              发送
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
