import { assetUrl } from "../lib/assetUrl";

export type TabId = "home" | "calendar" | "mail" | "paws";

/** Cache-bust so browser loads latest replaced icons. */
const ICON_V = "20260812-line";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "小屋", icon: assetUrl(`assets/nav-home.png?v=${ICON_V}`) },
  { id: "calendar", label: "日历", icon: assetUrl(`assets/nav-calendar.png?v=${ICON_V}`) },
  { id: "mail", label: "信件", icon: assetUrl(`assets/nav-mail.png?v=${ICON_V}`) },
  { id: "paws", label: "我的", icon: assetUrl(`assets/nav-paws.png?v=${ICON_V}`) },
];

type Props = {
  active: TabId;
  onChange: (id: TabId) => void;
};

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`nav-item ${active === tab.id ? "is-active" : ""}`}
          onClick={() => onChange(tab.id)}
          aria-label={tab.label}
          aria-current={active === tab.id ? "page" : undefined}
        >
          <img src={tab.icon} alt="" draggable={false} />
        </button>
      ))}
    </nav>
  );
}
