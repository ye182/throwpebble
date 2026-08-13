import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../lib/assetUrl";

type Phase = "ready" | "throwing" | "splash" | "done";

type Props = {
  onReadyForAuth: () => void;
  visible: boolean;
};

/** Throw flight duration (ms). */
const THROW_MS = 1650;
/** Splash hold before auth handoff (ms). */
const SPLASH_MS = 680;
const SETTLE_MS = 320;

type Pt = { x: number; y: number };

/** Quadratic Bezier: near-front (large) → arc → far water (small). */
function bezier(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * White splash: pebble thrown near→far (no trail), splash, then login.
 */
export function StoneSplash({ onReadyForAuth, visible }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const stoneRef = useRef<HTMLDivElement>(null);
  const splashFxRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const finishedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const reduceMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  function clearTimers() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("done");
    onReadyForAuth();
  }

  function runThrow() {
    const stage = stageRef.current;
    const stone = stoneRef.current;
    if (!stage || !stone) {
      finish();
      return;
    }

    const w = stage.clientWidth || 390;
    const h = stage.clientHeight || 844;

    // Near (lower-right front) → high arc → far (upper-left water)
    const p0: Pt = { x: w * 0.9, y: h * 0.84 };
    const p1: Pt = { x: w * 0.42, y: h * -0.02 };
    const p2: Pt = { x: w * 0.16, y: h * 0.26 };
    const startScale = 1;
    const endScale = 0.28;
    // ~20% smaller than prior pebble for a finer throw silhouette (aspect kept 1:1 box + contain)
    const baseSize = Math.min(w * 0.176, 76);

    stone.style.width = `${baseSize}px`;
    stone.style.height = `${baseSize}px`;
    stone.style.opacity = "1";
    stone.style.transform = `translate3d(${p0.x}px, ${p0.y}px, 0) translate(-50%, -50%) rotate(16deg) scale(${startScale})`;

    if (splashFxRef.current) {
      splashFxRef.current.style.left = `${p2.x}px`;
      splashFxRef.current.style.top = `${p2.y}px`;
    }

    const start = performance.now();
    setPhase("throwing");

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / THROW_MS);
      const t = easeInOut(raw);
      const pos = bezier(p0, p1, p2, t);
      const scale = startScale + (endScale - startScale) * t;
      const rot = 16 - t * 48;

      stone.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      stone.style.opacity = "0";
      setPhase("splash");
      later(finish, SPLASH_MS);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (!visible) {
      clearTimers();
      finishedRef.current = false;
      setPhase("ready");
      return;
    }

    finishedRef.current = false;
    clearTimers();

    if (reduceMotion) {
      later(finish, 120);
      return () => clearTimers();
    }

    setPhase("ready");
    later(runThrow, SETTLE_MS);

    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="intro-shell stone-splash-shell"
      aria-hidden={phase === "done"}
    >
      <div
        ref={stageRef}
        className={`entry-stage stone-splash-stage is-${phase}`}
        role="img"
        aria-label="石子抛向远处落入水中"
      >
        <div className="stone-splash-sky" />

        <div ref={stoneRef} className="stone-actor-slot">
          <img
            className="stone-actor"
            src={assetUrl("assets/splash-stone.png?v=manga-pebble-20260813")}
            alt=""
            draggable={false}
          />
        </div>

        <div ref={splashFxRef} className="stone-splash-fx" aria-hidden>
          <span className="stone-ripple stone-ripple-a" />
          <span className="stone-ripple stone-ripple-b" />
          <span className="stone-ripple stone-ripple-c" />
          <span className="stone-drop stone-drop-1" />
          <span className="stone-drop stone-drop-2" />
          <span className="stone-drop stone-drop-3" />
          <span className="stone-drop stone-drop-4" />
          <span className="stone-drop stone-drop-5" />
        </div>
      </div>
    </div>
  );
}
