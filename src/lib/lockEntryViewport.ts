/**
 * Lock the app chrome to the pre-keyboard viewport size.
 * Android often shrinks layout/`dvh` when the soft keyboard opens; that
 * must not resize `.stage`, the yellow diary sheet, or the bottom nav.
 * Width/height refresh only on orientation / real width changes — never
 * adopt a shorter height from keyboard resize.
 */
export function lockEntryViewport() {
  const root = document.documentElement;
  let lockedW = 0;
  let lockedH = 0;

  const publish = () => {
    root.style.setProperty("--entry-w", `${lockedW}px`);
    root.style.setProperty("--entry-h", `${lockedH}px`);
    root.style.setProperty("--app-w", `${lockedW}px`);
    root.style.setProperty("--app-h", `${lockedH}px`);
  };

  lockedW = window.innerWidth;
  lockedH = window.innerHeight;
  publish();

  // Prefer overlay keyboard so the OS does not resize the layout viewport
  const vk = (
    navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean };
    }
  ).virtualKeyboard;
  if (vk) vk.overlaysContent = true;

  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => {
      lockedW = window.innerWidth;
      lockedH = Math.max(lockedH, window.innerHeight);
      publish();
    }, 350);
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(w - lockedW) >= 40) {
      // Width changed: update width, keep the taller height
      lockedW = w;
      lockedH = Math.max(lockedH, h);
      publish();
      return;
    }
    if (h > lockedH + 24) {
      // Viewport grew (keyboard closed): allow grow only
      lockedH = h;
      publish();
    }
  });
}
