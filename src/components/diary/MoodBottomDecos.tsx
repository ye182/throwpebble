import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../../lib/assetUrl";

const BUBBLE_MS = 1600;
/** Original right-kitten height — cluster row height (sizes unchanged). */
const CLUSTER_H = 160;

/**
 * Shared bottom kittens + orbiting icons (mood page & write page).
 * Icon sizes unchanged; fixed px gaps inside a 340px cluster; JS places
 * the cluster vertically in the midpoint between card bottom and nav top.
 */
export function MoodBottomDecos() {
  const clusterRef = useRef<HTMLDivElement | null>(null);
  const [showLeftBubble, setShowLeftBubble] = useState(false);
  const [showRightBubble, setShowRightBubble] = useState(false);
  const leftTimerRef = useRef<number | null>(null);
  const rightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leftTimerRef.current != null) window.clearTimeout(leftTimerRef.current);
      if (rightTimerRef.current != null)
        window.clearTimeout(rightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    const place = () => {
      const host =
        (cluster.closest(".mood-page, .diary-write-page") as HTMLElement | null) ??
        (cluster.offsetParent as HTMLElement | null);
      if (!host) return;

      const stack = host.querySelector(
        ".mood-stack, .editor-paper, .comments-paper, .saved-yellow-zone"
      ) as HTMLElement | null;
      const nav = document.querySelector(".bottom-nav") as HTMLElement | null;

      const hostRect = host.getBoundingClientRect();
      const upper = stack ? stack.getBoundingClientRect().bottom : hostRect.top;
      const lower = nav
        ? nav.getBoundingClientRect().top
        : hostRect.bottom;

      const gap = lower - upper;
      if (gap < 8) return;

      const mid = (upper + lower) / 2;
      const h = cluster.offsetHeight || CLUSTER_H;
      let top = mid - hostRect.top - h / 2;
      // Keep fully inside the gap
      const maxTop = Math.max(0, lower - hostRect.top - h);
      const minTop = Math.max(0, upper - hostRect.top);
      top = Math.min(Math.max(top, minTop), maxTop);

      cluster.style.top = `${top}px`;
      cluster.style.bottom = "auto";
    };

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    schedule();
    // Re-run after images paint so icon midlines are accurate
    window.setTimeout(schedule, 120);

    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    const host =
      (cluster.closest(".mood-page, .diary-write-page") as HTMLElement | null) ??
      undefined;
    if (host) ro.observe(host);
    const stack = host?.querySelector(".mood-stack");
    if (stack) ro.observe(stack);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);

  function flashBubble(
    setShow: (v: boolean) => void,
    timerRef: { current: number | null }
  ) {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setShow(true);
    timerRef.current = window.setTimeout(() => {
      setShow(false);
      timerRef.current = null;
    }, BUBBLE_MS);
  }

  return (
    <div className="mood-bottom-cluster" ref={clusterRef}>
      <button
        type="button"
        className="mood-kitten-left-hit"
        onClick={() => flashBubble(setShowLeftBubble, leftTimerRef)}
        aria-label="白猫"
      >
        <img
          className="mood-kitten mood-kitten-left"
          src={assetUrl("assets/mood-kitten-left.png")}
          alt=""
          draggable={false}
        />
        {showLeftBubble && (
          <span className="kitten-meow-bubble kitten-meow-bubble-left" role="status">
            喵喵喵~
          </span>
        )}
      </button>
      <div className="mood-deco-orbit" aria-hidden>
        <img
          className="mood-deco mood-deco-a"
          src={assetUrl("assets/deco-sparkle.png")}
          alt=""
          draggable={false}
        />
        <img
          className="mood-deco mood-deco-b"
          src={assetUrl("assets/deco-butterflies.png")}
          alt=""
          draggable={false}
        />
        <img
          className="mood-deco mood-deco-c"
          src={assetUrl("assets/deco-blossoms.png")}
          alt=""
          draggable={false}
        />
      </div>
      <button
        type="button"
        className="mood-kitten-right-hit"
        onClick={() => flashBubble(setShowRightBubble, rightTimerRef)}
        aria-label="小猫"
      >
        <img
          className="mood-kitten mood-kitten-right"
          src={assetUrl("assets/mood-kitten.png")}
          alt=""
          draggable={false}
        />
        {showRightBubble && (
          <span
            className="kitten-meow-bubble kitten-meow-bubble-right"
            role="status"
          >
            困觉呢，干嘛！
          </span>
        )}
      </button>
    </div>
  );
}
