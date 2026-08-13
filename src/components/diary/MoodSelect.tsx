import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { assetUrl } from "../../lib/assetUrl";
import { MOODS, type MoodOption } from "../../lib/moods";

type Props = {
  /** mood label (+ id) for diary write step */
  onSelect: (moodLabel: string, moodId?: string) => void;
};

type DragState = {
  mood: MoodOption;
  x: number;
  y: number;
  originX: number;
  originY: number;
  homeX: number;
  homeY: number;
  pointerId: number;
  lifted: boolean;
};

type SplashState = {
  x: number;
  y: number;
  key: number;
};

type SinkState = {
  mood: MoodOption;
  x: number;
  y: number;
};

/** Min movement before treat as drag (vs cancel). */
const DRAG_SLOP = 10;
/** Hold briefly so it feels like “pick up”. */
const HOLD_MS = 140;
/** Full fall: splash + sink, then page transition (~0.95s). */
const SPLASH_MS = 950;

/** Natural scatter: % of home page (not a grid). */
type ScatterSpot = { left: string; top?: string; bottom?: string };

const SCATTER: Record<string, ScatterSpot> = {
  // Above the river — irregular scatter (1 soft nestle: wink+loving)
  joyful: { left: "14%", top: "5%" },
  wink: { left: "52%", top: "6.5%" },
  loving: { left: "64%", top: "10%" },
  peaceful: { left: "86%", top: "16%" },
  angry: { left: "8%", top: "18%" },
  frustrated: { left: "36%", top: "23%" },
  // Below the river — airy scatter; only plead+sleepy nestle
  crying: { left: "9%", bottom: "18%" },
  surprised: { left: "36%", bottom: "10%" },
  plead: { left: "14%", bottom: "4%" },
  sleepy: { left: "27%", bottom: "2.5%" },
  gloomy: { left: "58%", bottom: "5%" },
  shy: { left: "78%", bottom: "2%" },
};

const TOP_MOODS = MOODS.slice(0, 6);
const BOTTOM_MOODS = MOODS.slice(6);

/**
 * Home pebble emotions: drag onto river → blue splash → sink → diary.
 */
export function MoodSelect({ onSelect }: Props) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const riverRef = useRef<HTMLImageElement | null>(null);
  const riverCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sink, setSink] = useState<SinkState | null>(null);
  const [splash, setSplash] = useState<SplashState | null>(null);
  const [returning, setReturning] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lockedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const splashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current);
      }
      if (splashTimerRef.current != null) {
        window.clearTimeout(splashTimerRef.current);
      }
    };
  }, []);

  /** Cache river pixels for “drop on water” hit-testing (object-fit: cover). */
  const paintRiverCanvas = useCallback(() => {
    const page = pageRef.current;
    const img = riverRef.current;
    if (!page || !img || !img.complete || img.naturalWidth < 1) return;
    const pr = page.getBoundingClientRect();
    const w = Math.max(1, Math.round(pr.width));
    const h = Math.max(1, Math.round(pr.height));
    let canvas = riverCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      riverCanvasRef.current = canvas;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.max(w / nw, h / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    // Matches CSS object-position: 50% 46%
    const ox = (w - dw) * 0.5;
    const oy = (h - dh) * 0.46;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, ox, oy, dw, dh);
  }, []);

  useEffect(() => {
    const img = riverRef.current;
    const onReady = () => paintRiverCanvas();
    if (img?.complete) onReady();
    else img?.addEventListener("load", onReady);
    window.addEventListener("resize", onReady);
    return () => {
      img?.removeEventListener("load", onReady);
      window.removeEventListener("resize", onReady);
    };
  }, [paintRiverCanvas]);

  /** True when finger is over river blue (not foliage / paper white). */
  const isRiverDrop = useCallback(
    (clientX: number, clientY: number) => {
      const page = pageRef.current;
      if (!page) return false;
      const pr = page.getBoundingClientRect();
      if (
        clientX < pr.left ||
        clientX > pr.right ||
        clientY < pr.top ||
        clientY > pr.bottom
      ) {
        return false;
      }

      if (!riverCanvasRef.current) paintRiverCanvas();
      const canvas = riverCanvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !ctx || canvas.width < 2) {
        // Fallback: diagonal river band (mid-left → bottom-right)
        const xPct = ((clientX - pr.left) / pr.width) * 100;
        const yPct = ((clientY - pr.top) / pr.height) * 100;
        const shoreMid = 42 + xPct * 0.28;
        return yPct > shoreMid - 10 && yPct < shoreMid + 14;
      }

      const x = Math.round(clientX - pr.left);
      const y = Math.round(clientY - pr.top);
      // Sample a small neighborhood for soft watercolor edges
      let waterHits = 0;
      const rad = 4;
      for (let dy = -rad; dy <= rad; dy += 2) {
        for (let dx = -rad; dx <= rad; dx += 2) {
          const sx = Math.min(canvas.width - 1, Math.max(0, x + dx));
          const sy = Math.min(canvas.height - 1, Math.max(0, y + dy));
          const p = ctx.getImageData(sx, sy, 1, 1).data;
          const r = p[0];
          const g = p[1];
          const b = p[2];
          const a = p[3];
          if (a < 40) continue;
          // Light river blue / cyan wash — exclude green bushes & paper
          const isBlueWater =
            b > r + 6 &&
            b > 120 &&
            b >= g - 8 &&
            !(g > b + 12 && g > r + 18);
          if (isBlueWater) waterHits += 1;
        }
      }
      return waterHits >= 4;
    },
    [paintRiverCanvas]
  );

  const beginSplash = useCallback(
    (mood: MoodOption, x: number, y: number) => {
      lockedRef.current = true;
      setDrag(null);
      setReturning(null);
      setSink({ mood, x, y });
      // Splash slightly after contact so sink starts first
      if (splashTimerRef.current != null) {
        window.clearTimeout(splashTimerRef.current);
      }
      splashTimerRef.current = window.setTimeout(() => {
        setSplash({ x, y, key: Date.now() });
      }, 140);

      window.setTimeout(() => {
        onSelect(mood.label, mood.id);
      }, SPLASH_MS);
    },
    [onSelect]
  );

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onIconPointerDown(
    e: ReactPointerEvent<HTMLButtonElement>,
    mood: MoodOption
  ) {
    if (lockedRef.current || e.button !== 0) return;
    e.preventDefault();
    const btn = e.currentTarget;
    btn.setPointerCapture(e.pointerId);
    const rect = btn.getBoundingClientRect();
    const homeX = rect.left + rect.width / 2;
    const homeY = rect.top + rect.height / 2;
    const next: DragState = {
      mood,
      x: e.clientX,
      y: e.clientY,
      originX: e.clientX,
      originY: e.clientY,
      homeX,
      homeY,
      pointerId: e.pointerId,
      lifted: false,
    };
    dragRef.current = next;
    setDrag(next);
    setReturning(null);

    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      const cur = dragRef.current;
      if (!cur || cur.pointerId !== e.pointerId || lockedRef.current) return;
      const lifted = { ...cur, lifted: true };
      dragRef.current = lifted;
      setDrag(lifted);
    }, HOLD_MS);
  }

  function onIconPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const cur = dragRef.current;
    if (!cur || cur.pointerId !== e.pointerId || lockedRef.current) return;
    const dist = Math.hypot(e.clientX - cur.originX, e.clientY - cur.originY);
    let next: DragState = {
      ...cur,
      x: e.clientX,
      y: e.clientY,
    };
    if (!cur.lifted && dist >= DRAG_SLOP) {
      clearHoldTimer();
      next = { ...next, lifted: true };
    }
    dragRef.current = next;
    setDrag(next);
  }

  function onIconPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const cur = dragRef.current;
    if (!cur || cur.pointerId !== e.pointerId || lockedRef.current) return;
    clearHoldTimer();
    dragRef.current = null;

    const moved = Math.hypot(e.clientX - cur.originX, e.clientY - cur.originY);
    const valid =
      cur.lifted && moved >= DRAG_SLOP && isRiverDrop(e.clientX, e.clientY);

    if (valid) {
      beginSplash(cur.mood, e.clientX, e.clientY);
      return;
    }

    // Snap back home from current finger position
    setDrag(null);
    if (!cur.lifted || moved < DRAG_SLOP) {
      setReturning(null);
      return;
    }
    const from: DragState = {
      ...cur,
      x: e.clientX,
      y: e.clientY,
      lifted: true,
    };
    setReturning(from);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReturning({
          ...from,
          x: cur.homeX,
          y: cur.homeY,
          lifted: false,
        });
      });
    });
  }

  function onIconPointerCancel(e: ReactPointerEvent<HTMLButtonElement>) {
    const cur = dragRef.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    clearHoldTimer();
    dragRef.current = null;
    if (!lockedRef.current) {
      setDrag(null);
      setReturning(null);
    }
  }

  const ghostStyle: CSSProperties | undefined = drag?.lifted
    ? {
        left: drag.x,
        top: drag.y,
        transform: "translate(-50%, -50%) scale(1.05)",
      }
    : returning
      ? {
          left: returning.x,
          top: returning.y,
          transform: returning.lifted
            ? "translate(-50%, -50%) scale(1.05)"
            : "translate(-50%, -50%) scale(1)",
          transition:
            "left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s ease",
        }
      : undefined;

  function renderIcon(mood: MoodOption) {
    const spot = SCATTER[mood.id] ?? { left: "50%", top: "50%" };
    const lifted =
      (drag?.lifted && drag.mood.id === mood.id) ||
      sink?.mood.id === mood.id ||
      returning?.mood.id === mood.id;

    const posStyle: CSSProperties = {
      left: spot.left,
      ...(spot.bottom != null
        ? {
            top: "auto",
            bottom: spot.bottom,
            /* bottom edge = CSS bottom; don't also shift up by 50% height */
            transform: "translateX(-50%)",
          }
        : { top: spot.top }),
    };

    return (
      <button
        key={mood.id}
        type="button"
        data-mood-id={mood.id}
        className={lifted ? "emotion-icon is-lifted" : "emotion-icon"}
        style={posStyle}
        aria-label={mood.label}
        onPointerDown={(e) => onIconPointerDown(e, mood)}
        onPointerMove={onIconPointerMove}
        onPointerUp={onIconPointerUp}
        onPointerCancel={onIconPointerCancel}
      >
        <img src={mood.icon} alt="" draggable={false} />
      </button>
    );
  }

  return (
    <div className="mood-page mood-page--emotions" ref={pageRef}>
      <img
        className="mood-river-bg"
        ref={riverRef}
        src={assetUrl("assets/home-river.png")}
        alt=""
        draggable={false}
        aria-hidden
      />

      <div
        className="emotion-banks"
        aria-label="长按拖动小石子到河流，松手落水记录情绪"
      >
        <div className="emotion-bank emotion-bank--above">
          {TOP_MOODS.map(renderIcon)}
        </div>
        <div className="emotion-bank emotion-bank--below">
          {BOTTOM_MOODS.map(renderIcon)}
        </div>
      </div>

      {drag?.lifted && (
        <img
          className="emotion-drag-ghost is-held"
          src={drag.mood.icon}
          alt=""
          draggable={false}
          style={ghostStyle}
        />
      )}

      {returning && (
        <img
          className="emotion-drag-ghost is-returning"
          src={returning.mood.icon}
          alt=""
          draggable={false}
          style={ghostStyle}
          onTransitionEnd={() => setReturning(null)}
        />
      )}

      {sink && (
        <img
          className="emotion-drag-ghost is-sinking"
          src={sink.mood.icon}
          alt=""
          draggable={false}
          style={{ left: sink.x, top: sink.y }}
        />
      )}

      {splash && (
        <div
          key={splash.key}
          className="emotion-splash emotion-splash--river"
          style={{ left: splash.x, top: splash.y }}
          aria-hidden
        >
          <span className="emotion-splash-ring emotion-splash-ring-a" />
          <span className="emotion-splash-ring emotion-splash-ring-b" />
          <span className="emotion-splash-drop emotion-splash-drop-1" />
          <span className="emotion-splash-drop emotion-splash-drop-2" />
          <span className="emotion-splash-drop emotion-splash-drop-3" />
          <span className="emotion-splash-drop emotion-splash-drop-4" />
        </div>
      )}
    </div>
  );
}
