import { useEffect, type ReactNode } from "react";
import { BottomNav, type TabId } from "./BottomNav";

type Props = {
  tab: TabId;
  onTabChange: (id: TabId) => void;
  showNav: boolean;
  children: ReactNode;
};

export function AppShell({ tab, onTabChange, showNav, children }: Props) {
  useEffect(() => {
    // Keep diary shell pinned while soft keyboard is open (no page pan)
    const killPan = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    killPan();

    const onFocusIn = () => killPan();
    const onVv = () => killPan();
    const onScroll = () => killPan();
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", onVv);
    window.visualViewport?.addEventListener("scroll", onVv);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", onVv);
      window.visualViewport?.removeEventListener("scroll", onVv);
    };
  }, []);

  return (
    <div className="app-root">
      <div className={`stage ${showNav ? "has-nav" : "no-nav"}`}>
        <div className="stage-bg" aria-hidden />
        <div className="stage-content">{children}</div>
        {showNav && <BottomNav active={tab} onChange={onTabChange} />}
      </div>
    </div>
  );
}
