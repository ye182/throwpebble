import type { ReactNode } from "react";

type Props = {
  flipping: boolean;
  onFlipEnd?: () => void;
  children: ReactNode;
};

/** CSS 3D page-turn wrapper; fires onFlipEnd when transform transition completes. */
export function PageFlip({ flipping, onFlipEnd, children }: Props) {
  return (
    <div className={`page-flip ${flipping ? "is-flipping" : ""}`}>
      <div
        className="page-flip-inner"
        onTransitionEnd={(e) => {
          if (e.propertyName === "opacity" && flipping) onFlipEnd?.();
        }}
      >
        {children}
      </div>
    </div>
  );
}
