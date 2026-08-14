const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const CHAT_MODEL = "openai/gpt-5.6-sol";
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
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

export async function chatJson<T>(messages: ChatMessage[]): Promise<T> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      reasoning_effort: "none",
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("chat failed", res.status, detail.slice(0, 500));
    throw new Error(res.status === 429 ? "RATE_LIMIT" : `CHAT_FAILED_${res.status}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  return parseJson<T>(raw);
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
