/**
 * Local profile / companion prefs for「我的」中心（mock-friendly, per-user）.
 */

import { assetUrl } from "./assetUrl";
import { CHARACTERS, type CharacterId } from "./characters";
import { listLocalMoodDetailsForSync } from "./calendarMood";

const PROFILE_KEY = "aimu_profile_v1";
const OWNER_KEY = "aimu_profile_owner_v1";

let activeUserId: string | null = null;

export type ProfileMemory = {
  id: string;
  text: string;
  createdAt: string;
};

/** User-created AI companion role (not limited to built-in templates). */
export type CustomAiRole = {
  id: string;
  name: string;
  avatarUrl: string;
  intro: string;
  personality: string;
  speechStyle: string;
  relation: string;
  background: string;
  notes: string;
  /** Optional uploaded setting text / file name */
  sourceFileName?: string;
  sourceText?: string;
  createdAt: string;
};

export type ProfileLocal = {
  nickname: string;
  bio: string;
  avatarUrl: string;
  /** Built-in id or custom role id (legacy single companion). */
  activeCompanionKey: string;
  companionDisplayName: string;
  customRoles: CustomAiRole[];
  /** Roles that may reply under diary comments (built-in + custom ids). */
  chatRoleKeys: string[];
  longTermMemory: boolean;
  customMode: boolean;
  speechSoftness: number;
  personalityWarmth: number;
  proactivity: number;
  memories: ProfileMemory[];
  notifyDiary: boolean;
  notifyLetter: boolean;
  privacyHideExplore: boolean;
};

export type UsageStats = {
  daysUsed: number;
  chatCount: number;
  companionMinutes: number;
  meetDays: number;
};

const DEFAULT_MEMORIES: ProfileMemory[] = [
  {
    id: "mem_1",
    text: "你喜欢在傍晚写日记，情绪会慢慢松下来。",
    createdAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "mem_2",
    text: "你说过陪伴的语气让你觉得被轻轻抱住。",
    createdAt: "2026-08-05T14:20:00.000Z",
  },
  {
    id: "mem_3",
    text: "最近更常提到「想被安静地陪着」。",
    createdAt: "2026-08-10T09:12:00.000Z",
  },
];

function scopedKey(userId: string) {
  return `${PROFILE_KEY}__u_${userId}`;
}

function storageKey(): string {
  return activeUserId ? scopedKey(activeUserId) : PROFILE_KEY;
}

function defaultProfile(seedNickname = "旅人"): ProfileLocal {
  return {
    nickname: seedNickname,
    bio: "",
    avatarUrl: "",
    activeCompanionKey: "tuanzi",
    companionDisplayName: CHARACTERS.tuanzi.name,
    customRoles: [],
    chatRoleKeys: ["huaihuai", "ying", "tuanzi"],
    longTermMemory: true,
    customMode: false,
    speechSoftness: 70,
    personalityWarmth: 75,
    proactivity: 40,
    memories: DEFAULT_MEMORIES.map((m) => ({ ...m })),
    notifyDiary: true,
    notifyLetter: true,
    privacyHideExplore: false,
  };
}

function migrate(raw: Partial<ProfileLocal> & { companionId?: string }): ProfileLocal {
  const base = defaultProfile();
  const merged = { ...base, ...raw };
  if (!merged.activeCompanionKey && raw.companionId) {
    merged.activeCompanionKey = raw.companionId;
  }
  if (!Array.isArray(merged.customRoles)) merged.customRoles = [];
  if (!Array.isArray(merged.chatRoleKeys) || merged.chatRoleKeys.length === 0) {
    merged.chatRoleKeys = merged.activeCompanionKey
      ? [merged.activeCompanionKey]
      : [...base.chatRoleKeys];
  }
  return merged;
}

export function bindProfileStorageToUser(userId: string | null) {
  const next = userId?.trim() || null;
  if (next === activeUserId) return;
  activeUserId = next;
  if (!next) return;
  try {
    const scoped = localStorage.getItem(scopedKey(next));
    if (scoped) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    const owner = localStorage.getItem(OWNER_KEY)?.trim() || "";
    const legacy = localStorage.getItem(PROFILE_KEY);
    if (!legacy) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    if (owner && owner !== next) return;
    localStorage.setItem(scopedKey(next), legacy);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.setItem(OWNER_KEY, next);
  } catch {
    /* ignore */
  }
}

export function readProfile(seedNickname?: string): ProfileLocal {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return defaultProfile(seedNickname);
    return migrate(JSON.parse(raw) as Partial<ProfileLocal>);
  } catch {
    return defaultProfile(seedNickname);
  }
}

export function writeProfile(patch: Partial<ProfileLocal>): ProfileLocal {
  const next = migrate({ ...readProfile(), ...patch });
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function removeMemory(id: string): ProfileLocal {
  const cur = readProfile();
  return writeProfile({
    memories: cur.memories.filter((m) => m.id !== id),
  });
}

export function upsertCustomRole(role: CustomAiRole): ProfileLocal {
  const cur = readProfile();
  const i = cur.customRoles.findIndex((r) => r.id === role.id);
  const list = [...cur.customRoles];
  if (i >= 0) list[i] = role;
  else list.unshift(role);
  return writeProfile({ customRoles: list });
}

export function deleteCustomRole(id: string): ProfileLocal {
  const cur = readProfile();
  const nextRoles = cur.customRoles.filter((r) => r.id !== id);
  const nextChat = (cur.chatRoleKeys ?? []).filter((k) => k !== id);
  const patch: Partial<ProfileLocal> = {
    customRoles: nextRoles,
    chatRoleKeys: nextChat.length > 0 ? nextChat : ["tuanzi"],
  };
  if (cur.activeCompanionKey === id) {
    patch.activeCompanionKey = patch.chatRoleKeys![0] || "tuanzi";
    const builtIn = CHARACTERS[patch.activeCompanionKey as CharacterId];
    patch.companionDisplayName = builtIn?.name || CHARACTERS.tuanzi.name;
  }
  return writeProfile(patch);
}

/** Valid chat role ids currently selected (falls back to built-in trio). */
export function getChatRoleKeys(profile = readProfile()): string[] {
  const valid = new Set<string>([
    ...Object.keys(CHARACTERS),
    ...profile.customRoles.map((r) => r.id),
  ]);
  const keys = (profile.chatRoleKeys ?? []).filter((k) => valid.has(k));
  if (keys.length === 0) return ["huaihuai", "ying", "tuanzi"];
  return keys;
}

/** Toggle a role in/out of the diary comment pool; keeps at least one. */
export function toggleChatRoleKey(id: string): ProfileLocal {
  const cur = readProfile();
  const valid = new Set<string>([
    ...Object.keys(CHARACTERS),
    ...cur.customRoles.map((r) => r.id),
  ]);
  if (!valid.has(id)) return cur;
  const prev = getChatRoleKeys(cur);
  const has = prev.includes(id);
  let next: string[];
  if (has) {
    next = prev.filter((k) => k !== id);
    if (next.length === 0) next = prev;
  } else {
    next = [...prev, id];
  }
  const builtIn = CHARACTERS[next[0] as CharacterId];
  const custom = cur.customRoles.find((r) => r.id === next[0]);
  return writeProfile({
    chatRoleKeys: next,
    activeCompanionKey: next[0],
    companionDisplayName:
      builtIn?.name || custom?.name || cur.companionDisplayName,
  });
}

export function resolveChatActor(id: string): {
  name: string;
  avatarUrl: string;
} {
  const builtIn = CHARACTERS[id as CharacterId];
  if (builtIn) {
    return { name: builtIn.name, avatarUrl: builtIn.avatar };
  }
  const custom = readProfile().customRoles.find((r) => r.id === id);
  if (custom) {
    return {
      name: custom.name,
      avatarUrl: custom.avatarUrl || assetUrl("assets/char-tuanzi.png?v=20260809d"),
    };
  }
  return {
    name: "陪伴",
    avatarUrl: assetUrl("assets/char-tuanzi.png?v=20260809d"),
  };
}

export type ActiveCompanion = {
  key: string;
  name: string;
  avatarUrl: string;
  isCustom: boolean;
  title?: string;
  custom?: CustomAiRole;
};

export function getActiveCompanion(profile = readProfile()): ActiveCompanion {
  const builtIn = CHARACTERS[profile.activeCompanionKey as CharacterId];
  if (builtIn) {
    return {
      key: builtIn.id,
      name: profile.companionDisplayName || builtIn.name,
      avatarUrl: builtIn.avatar,
      isCustom: false,
      title: builtIn.title,
    };
  }
  const custom = profile.customRoles.find(
    (r) => r.id === profile.activeCompanionKey
  );
  if (custom) {
    return {
      key: custom.id,
      name: profile.companionDisplayName || custom.name,
      avatarUrl: custom.avatarUrl || assetUrl("assets/char-tuanzi.png?v=20260809d"),
      isCustom: true,
      custom,
    };
  }
  return {
    key: "tuanzi",
    name: CHARACTERS.tuanzi.name,
    avatarUrl: CHARACTERS.tuanzi.avatar,
    isCustom: false,
    title: CHARACTERS.tuanzi.title,
  };
}

export function getUsageStats(createdAtIso?: string): UsageStats {
  const details = listLocalMoodDetailsForSync();
  const daySet = new Set(details.map((d) => d.dateKey));
  const daysUsed = Math.max(1, daySet.size || 1);
  const chatCount = Math.max(details.length * 3, 12);
  const companionMinutes = Math.max(details.length * 8, 36);
  let meetDays = 30;
  if (createdAtIso) {
    const t = Date.parse(createdAtIso);
    if (!Number.isNaN(t)) {
      meetDays = Math.max(
        1,
        Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)) + 1
      );
    }
  }
  return { daysUsed, chatCount, companionMinutes, meetDays };
}
