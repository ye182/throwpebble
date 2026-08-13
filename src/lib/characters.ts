import { assetUrl } from "./assetUrl";

export type CharacterId = "tuanzi" | "huaihuai" | "ying";

export type Character = {
  id: CharacterId;
  name: string;
  title: string;
  avatar: string;
  tone: string;
};

export const CHARACTERS: Record<CharacterId, Character> = {
  tuanzi: {
    id: "tuanzi",
    name: "小团子",
    title: "温暖天使",
    avatar: assetUrl("assets/char-tuanzi.png?v=20260809d"),
    tone: "encouraging",
  },
  huaihuai: {
    id: "huaihuai",
    name: "小坏坏",
    title: "调皮傲娇",
    avatar: assetUrl("assets/char-huaihuai.png?v=20260809d"),
    tone: "tsundere",
  },
  ying: {
    id: "ying",
    name: "小樱",
    title: "理性调解",
    avatar: assetUrl("assets/char-ying.png?v=20260809d"),
    tone: "thoughtful",
  },
};

/** Display order in comment stream after save */
export const COMMENT_ORDER: CharacterId[] = ["huaihuai", "ying", "tuanzi"];
