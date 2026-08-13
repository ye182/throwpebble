/**
 * LLM settings for 项目四「信件」generation on the Node server
 * (Tencent Cloud 轻量服务器). Keys never ship to the browser / COS.
 */

export type LlmConfig = {
  /** Empty / unset → mock composer (local & before key is configured). */
  apiKey: string;
  /** OpenAI-compatible base, e.g. https://api.hunyuan.cloud.tencent.com/v1 */
  baseUrl: string;
  /** Model id, e.g. hunyuan-turbos-latest */
  model: string;
  timeoutMs: number;
};

export function loadLlmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LlmConfig {
  const apiKey = (env.LLM_API_KEY || env.HUNYUAN_API_KEY || "").trim();
  const baseUrl = (
    env.LLM_BASE_URL ||
    "https://api.hunyuan.cloud.tencent.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (env.LLM_MODEL || "hunyuan-turbos-latest").trim();
  const timeoutRaw = Number(env.LLM_TIMEOUT_MS || 45000);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 5000 ? timeoutRaw : 45000;
  return { apiKey, baseUrl, model, timeoutMs };
}

export function isLlmConfigured(cfg: LlmConfig): boolean {
  return Boolean(cfg.apiKey);
}
