const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const CHAT_MODEL = "openai/gpt-6-astra";
export const EMBED_MODEL = "google/gemini-embedding-2";
export const EMBED_DIM = 1536;

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI_KEY_MISSING");
  return key;
}

/** Truncate a Matryoshka embedding to EMBED_DIM and re-normalize. */
function shrink(vec: number[]): number[] {
  const cut = vec.slice(0, EMBED_DIM);
  const norm = Math.sqrt(cut.reduce((s, v) => s + v * v, 0)) || 1;
  return cut.map((v) => v / norm);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`EMBED_FAILED_${res.status}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => shrink(d.embedding));
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string } };


export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

export async function chatJson<T>(
  messages: ChatMessage[],
  model: string = CHAT_MODEL,
): Promise<T> {
  if (model !== CHAT_MODEL) throw new Error("UNSUPPORTED_CHAT_MODEL");
  const input = messages.map((message) => ({
    role: message.role === "system" ? "developer" : message.role,
    content:
      typeof message.content === "string"
        ? [{ type: "input_text", text: message.content }]
        : message.content.map((part) =>
            part.type === "image_url"
              ? { type: "input_image", image_url: part.image_url.url }
              : part.type === "file"
                ? {
                    type: "input_file",
                    filename: part.file.filename,
                    file_data: part.file.file_data,
                  }
                : { type: "input_text", text: part.text },
          ),
  }));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${GATEWAY}/responses`, {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey(),
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_object" } },
      }),
    });
    if (res.ok) {
      if (!res.body) throw new Error("EMPTY_AI_STREAM");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type?: string;
              delta?: string;
              response?: { output_text?: string };
            };
            if (event.type === "response.output_text.delta") raw += event.delta ?? "";
            if (!raw && event.type === "response.completed") {
              raw = event.response?.output_text ?? "";
            }
          } catch {
            // Ignore keep-alive or incomplete SSE frames.
          }
        }
      }
      if (!raw.trim()) throw new Error("EMPTY_AI_RESPONSE");
      return parseJson<T>(raw);
    }

    const detail = await res.text();
    console.error("chat failed", res.status, detail.slice(0, 500));
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 2) {
      if (res.status === 402) throw new Error(`CHAT_FAILED_402:${detail.slice(0, 240)}`);
      if (res.status === 403) throw new Error(`CHAT_FAILED_403:${detail.slice(0, 240)}`);
      throw new Error(res.status === 429 ? "RATE_LIMIT" : `CHAT_FAILED_${res.status}`);
    }
    const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    const delay = retryAfter > 0 ? retryAfter * 1000 : 750 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("CHAT_FAILED");
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("BAD_JSON");
  }
}
