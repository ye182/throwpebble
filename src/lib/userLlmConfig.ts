/**
 * User-configured OpenAI-compatible LLM for AI 陪伴.
 * Key is obfuscated at rest; UI never shows the full secret after save.
 */

const LLM_KEY = "aimu_user_llm_v1";
const OWNER_KEY = "aimu_user_llm_owner_v1";
const OBFUSCATE_PREFIX = "v1:";

let activeUserId: string | null = null;

export type UserLlmConfig = {
  endpoint: string;
  /** Obfuscated secret; empty if not set */
  apiKeyEnc: string;
  /** Last 4 chars for masked display */
  apiKeyHint: string;
  model: string;
  temperature: number;
  updatedAt: string;
  lastTestOk?: boolean;
  lastTestAt?: string;
  lastTestMessage?: string;
};

export type UserLlmRuntime = {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
};

function scopedKey(userId: string) {
  return `${LLM_KEY}__u_${userId}`;
}

function storageKey(): string {
  return activeUserId ? scopedKey(activeUserId) : LLM_KEY;
}

function defaultConfig(): UserLlmConfig {
  return {
    endpoint: "",
    apiKeyEnc: "",
    apiKeyHint: "",
    model: "",
    temperature: 0.85,
    updatedAt: "",
  };
}

/** Lightweight obfuscation (not a substitute for server-side secrets). */
function encodeKey(plain: string): string {
  const bytes = new TextEncoder().encode(plain);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b ^ 0x5a);
  return OBFUSCATE_PREFIX + btoa(bin);
}

function decodeKey(enc: string): string {
  if (!enc.startsWith(OBFUSCATE_PREFIX)) return "";
  try {
    const bin = atob(enc.slice(OBFUSCATE_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ 0x5a;
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function maskApiKey(hint: string): string {
  if (!hint) return "未设置";
  return `••••••••${hint}`;
}

export function bindUserLlmStorageToUser(userId: string | null) {
  const next = userId?.trim() || null;
  if (next === activeUserId) return;
  activeUserId = next;
  if (!next) return;
  try {
    if (localStorage.getItem(scopedKey(next))) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    const owner = localStorage.getItem(OWNER_KEY)?.trim() || "";
    const legacy = localStorage.getItem(LLM_KEY);
    if (!legacy) {
      localStorage.setItem(OWNER_KEY, next);
      return;
    }
    if (owner && owner !== next) return;
    localStorage.setItem(scopedKey(next), legacy);
    localStorage.removeItem(LLM_KEY);
    localStorage.setItem(OWNER_KEY, next);
  } catch {
    /* ignore */
  }
}

export function readUserLlmConfig(): UserLlmConfig {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return defaultConfig();
    return { ...defaultConfig(), ...(JSON.parse(raw) as Partial<UserLlmConfig>) };
  } catch {
    return defaultConfig();
  }
}

export function writeUserLlmConfig(
  patch: Partial<UserLlmConfig> & { apiKeyPlain?: string }
): UserLlmConfig {
  const cur = readUserLlmConfig();
  const next: UserLlmConfig = {
    ...cur,
    endpoint: patch.endpoint?.trim() ?? cur.endpoint,
    model: patch.model?.trim() ?? cur.model,
    temperature:
      typeof patch.temperature === "number" ? patch.temperature : cur.temperature,
    updatedAt: new Date().toISOString(),
    lastTestOk: patch.lastTestOk ?? cur.lastTestOk,
    lastTestAt: patch.lastTestAt ?? cur.lastTestAt,
    lastTestMessage: patch.lastTestMessage ?? cur.lastTestMessage,
    apiKeyEnc: cur.apiKeyEnc,
    apiKeyHint: cur.apiKeyHint,
  };

  if (typeof patch.apiKeyPlain === "string") {
    const plain = patch.apiKeyPlain.trim();
    if (plain) {
      next.apiKeyEnc = encodeKey(plain);
      next.apiKeyHint = plain.slice(-4);
    }
  }
  if (patch.apiKeyEnc === "" && patch.apiKeyHint === "") {
    next.apiKeyEnc = "";
    next.apiKeyHint = "";
  }

  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function clearUserLlmConfig(): UserLlmConfig {
  const empty = defaultConfig();
  try {
    localStorage.setItem(storageKey(), JSON.stringify(empty));
  } catch {
    /* ignore */
  }
  return empty;
}

/** Runtime credentials for chat / letter compose when user model is enabled. */
export function getUserLlmRuntime(): UserLlmRuntime | null {
  const cfg = readUserLlmConfig();
  const apiKey = decodeKey(cfg.apiKeyEnc);
  const endpoint = cfg.endpoint.replace(/\/$/, "");
  if (!endpoint || !apiKey || !cfg.model) return null;
  return {
    endpoint,
    apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
  };
}

export type LlmTestResult = {
  ok: boolean;
  message: string;
};

/** Probe OpenAI-compatible chat.completions with a tiny request. */
export async function testUserLlmConnection(input?: {
  endpoint?: string;
  apiKeyPlain?: string;
  model?: string;
}): Promise<LlmTestResult> {
  const saved = readUserLlmConfig();
  const endpoint = (input?.endpoint ?? saved.endpoint).trim().replace(/\/$/, "");
  const model = (input?.model ?? saved.model).trim();
  const apiKey =
    (input?.apiKeyPlain && input.apiKeyPlain.trim()) ||
    decodeKey(saved.apiKeyEnc);

  if (!endpoint) return { ok: false, message: "请填写 API Endpoint" };
  if (!apiKey) return { ok: false, message: "请填写 API Key" };
  if (!model) return { ok: false, message: "请填写 Model 名称" };

  const url = `${endpoint}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: unknown[];
    };
    if (!res.ok) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      writeUserLlmConfig({
        lastTestOk: false,
        lastTestAt: new Date().toISOString(),
        lastTestMessage: msg,
      });
      return { ok: false, message: msg };
    }
    writeUserLlmConfig({
      lastTestOk: true,
      lastTestAt: new Date().toISOString(),
      lastTestMessage: "连接成功",
    });
    return { ok: true, message: "连接成功，可以用于陪伴对话" };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "连接超时"
          : err.message
        : "连接失败";
    writeUserLlmConfig({
      lastTestOk: false,
      lastTestAt: new Date().toISOString(),
      lastTestMessage: message,
    });
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}
