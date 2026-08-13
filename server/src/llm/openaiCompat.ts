/**
 * Minimal OpenAI-compatible chat.completions client (no SDK).
 * Works with 腾讯混元 OpenAI 兼容接口 and other providers that share the shape.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  model?: string;
};

export async function chatCompletions(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  temperature?: number;
}): Promise<ChatCompletionResult> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
        stream: false,
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as {
      error?: { message?: string };
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    if (!res.ok) {
      throw new Error(
        json.error?.message || `LLM HTTP ${res.status}`
      );
    }
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("LLM 返回为空");
    }
    return { content, model: json.model || options.model };
  } finally {
    clearTimeout(timer);
  }
}
