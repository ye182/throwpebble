import {
  isStaticDeploy,
  localFetchMe,
  localLogin,
  localLogout,
  localRegister,
} from "./localAuth";

export interface PublicUser {
  id: string;
  nickname: string;
  contact: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

type ApiOk<T> = { ok: true; message?: string; data: T };
type ApiErr = { ok: false; message: string };

/** Stable across fusion — do not rename without migrating clients. */
export const AUTH_TOKEN_KEY = "aimu_p01_token";

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(AUTH_TOKEN_KEY);
  else localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function apiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (base && base.trim()) return base.replace(/\/$/, "");
  return "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (err) {
    throw err;
  }

  let body: ApiOk<T> | ApiErr;
  try {
    body = (await res.json()) as ApiOk<T> | ApiErr;
  } catch {
    throw new Error(`请求失败（HTTP ${res.status}）`);
  }

  if (!res.ok || !body.ok) {
    throw new Error(
      ("message" in body && body.message) || `请求失败（HTTP ${res.status}）`
    );
  }
  return body.data;
}

export async function register(input: {
  contact: string;
  password: string;
}): Promise<AuthResult> {
  if (isStaticDeploy()) {
    const result = await localRegister(input);
    setToken(result.token);
    return result;
  }
  return request<AuthResult>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function login(input: {
  contact: string;
  password: string;
}): Promise<AuthResult> {
  if (isStaticDeploy()) {
    const result = await localLogin(input);
    setToken(result.token);
    return result;
  }
  return request<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMe(): Promise<{ user: PublicUser }> {
  if (isStaticDeploy()) {
    return localFetchMe(getToken());
  }
  return request<{ user: PublicUser }>("/api/auth/me");
}

export async function logout(): Promise<void> {
  if (isStaticDeploy()) {
    localLogout();
    setToken(null);
    return;
  }
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}
