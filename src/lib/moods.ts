import { assetUrl } from "./assetUrl";

export type MoodOption = {
  id: string;
  label: string;
  icon: string;
};

/**
 * Home emotion grid — sheet is 4×3; UI shows 3×4 in the same row-major order.
 */
const V = "v=pebble1";

export const MOODS: MoodOption[] = [
  { id: "joyful", label: "开心", icon: assetUrl(`assets/emotions/joyful.png?${V}`) },
  { id: "wink", label: "俏皮", icon: assetUrl(`assets/emotions/wink.png?${V}`) },
  { id: "loving", label: "爱心", icon: assetUrl(`assets/emotions/loving.png?${V}`) },
  { id: "peaceful", label: "平静", icon: assetUrl(`assets/emotions/peaceful.png?${V}`) },
  { id: "angry", label: "生气", icon: assetUrl(`assets/emotions/angry.png?${V}`) },
  { id: "frustrated", label: "烦躁", icon: assetUrl(`assets/emotions/frustrated.png?${V}`) },
  { id: "surprised", label: "惊讶", icon: assetUrl(`assets/emotions/surprised.png?${V}`) },
  { id: "gloomy", label: "阴郁", icon: assetUrl(`assets/emotions/gloomy.png?${V}`) },
  { id: "crying", label: "大哭", icon: assetUrl(`assets/emotions/crying.png?${V}`) },
  { id: "plead", label: "委屈", icon: assetUrl(`assets/emotions/plead.png?${V}`) },
  { id: "sleepy", label: "困困", icon: assetUrl(`assets/emotions/sleepy.png?${V}`) },
  { id: "shy", label: "害羞", icon: assetUrl(`assets/emotions/shy.png?${V}`) },
];

export function findMoodById(id: string | undefined | null): MoodOption | null {
  const key = id?.trim();
  if (!key) return null;
  return MOODS.find((m) => m.id === key) ?? null;
}

export function findMoodByLabel(
  label: string | undefined | null
): MoodOption | null {
  const key = label?.trim();
  if (!key) return null;
  return MOODS.find((m) => m.label === key) ?? null;
}

/** Resolve pebble icon for calendar / save — prefer stored, then id, then label. */
export function resolveMoodIcon(
  moodId?: string | null,
  moodLabel?: string | null,
  storedIcon?: string | null
): string {
  const stored = storedIcon?.trim();
  if (stored) return stored;
  return (
    findMoodById(moodId)?.icon ?? findMoodByLabel(moodLabel)?.icon ?? ""
  );
}
