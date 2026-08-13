/**
 * Browser-only auth for static hosting (GitHub Pages).
 * Users / sessions live in localStorage — no server.
 */

import type { AuthResult, PublicUser } from "./api";

const USERS_KEY = "aimu_static_users_v1";
const SESSION_KEY = "aimu_static_session_v1";

type StoredUser = {
  id: string;
  nickname: string;
  contact: string;
  createdAt: string;
  passwordHash: string;
};

type Session = {
  token: string;
  userId: string;
};

function normalizeContact(contact: string): string {
  return contact.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function toPublic(u: StoredUser): PublicUser {
  return {
    id: u.id,
    nickname: u.nickname,
    contact: u.contact,
    createdAt: u.createdAt,
  };
}

function ensureSeedUser(users: StoredUser[]): StoredUser[] {
  const seedContact = "111111";
  if (users.some((u) => normalizeContact(u.contact) === seedContact)) {
    return users;
  }
  // Seed QA account (same as local server) — password hashed at first use below.
  return users;
}

/** Ensure demo account exists with known password hash. */
async function withSeed(users: StoredUser[]): Promise<StoredUser[]> {
  const seedContact = "111111";
  if (users.some((u) => normalizeContact(u.contact) === seedContact)) {
    return users;
  }
  const passwordHash = await hashPassword("111111");
  const seeded: StoredUser = {
    id: `local_${crypto.randomUUID()}`,
    nickname: "演示用户",
    contact: seedContact,
    createdAt: new Date().toISOString(),
    passwordHash,
  };
  const next = [...users, seeded];
  writeUsers(next);
  return next;
}

function newToken(): string {
  return `static_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function localRegister(input: {
  contact: string;
  password: string;
}): Promise<AuthResult> {
  const contact = input.contact.trim();
  if (!contact || input.password.length < 6) {
    throw new Error("请填写用户名，密码至少 6 位");
  }
  let users = await withSeed(ensureSeedUser(readUsers()));
  const key = normalizeContact(contact);
  if (users.some((u) => normalizeContact(u.contact) === key)) {
    throw new Error("该用户名已注册");
  }
  const passwordHash = await hashPassword(input.password);
  const user: StoredUser = {
    id: `local_${crypto.randomUUID()}`,
    nickname: contact.slice(0, 12),
    contact,
    createdAt: new Date().toISOString(),
    passwordHash,
  };
  users = [...users, user];
  writeUsers(users);
  const token = newToken();
  writeSession({ token, userId: user.id });
  return { token, user: toPublic(user) };
}

export async function localLogin(input: {
  contact: string;
  password: string;
}): Promise<AuthResult> {
  const users = await withSeed(ensureSeedUser(readUsers()));
  const key = normalizeContact(input.contact);
  const user = users.find((u) => normalizeContact(u.contact) === key);
  if (!user) throw new Error("用户名或密码错误");
  const passwordHash = await hashPassword(input.password);
  if (passwordHash !== user.passwordHash) {
    throw new Error("用户名或密码错误");
  }
  const token = newToken();
  writeSession({ token, userId: user.id });
  return { token, user: toPublic(user) };
}

export async function localFetchMe(token: string | null): Promise<{ user: PublicUser }> {
  if (!token) throw new Error("未登录");
  const session = readSession();
  if (!session || session.token !== token) throw new Error("登录已失效");
  const users = await withSeed(ensureSeedUser(readUsers()));
  const user = users.find((u) => u.id === session.userId);
  if (!user) throw new Error("登录已失效");
  return { user: toPublic(user) };
}

export function localLogout(): void {
  writeSession(null);
}

export function isStaticDeploy(): boolean {
  return import.meta.env.VITE_STATIC_DEPLOY === "true";
}
