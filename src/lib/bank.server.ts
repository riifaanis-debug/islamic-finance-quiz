import type { AnswerResult, QuestionMode } from "./types";

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/** Normalize Arabic question text for duplicate detection (search only). */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function optionsToJson(
  options: Record<string, string>,
): { label: string; text: string }[] | null {
  const entries = Object.entries(options).filter(([, v]) => v?.trim());
  if (entries.length === 0) return null;
  return entries.map(([label, text]) => ({ label, text: text.trim() }));
}

const PIPELINE_VERSION = "evidence-consensus-v1";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDecisionKey(
  question: string,
  mode: QuestionMode,
  options: Record<string, string>,
): Promise<string> {
  const normalizedOptions = Object.entries(options)
    .map(([label, text]) => `${normalizeQuestion(label)}:${normalizeQuestion(text)}`)
    .join("|");
  return sha256(`${mode}|${normalizeQuestion(question)}|${normalizedOptions}`);
}

export async function getKnowledgeVersion(admin: SupabaseAdmin): Promise<string> {
  const { data, error } = await admin
    .from("training_bags")
    .select("id,updated_at,total_chunks,status")
    .eq("status", "ready")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return sha256(
    (data ?? [])
      .map((row) => `${row.id}:${row.updated_at}:${row.total_chunks}:${row.status}`)
      .join("|"),
  );
}

function rowToResult(row: Record<string, unknown>): AnswerResult {
  const optionRows = Array.isArray(row["options"])
    ? (row["options"] as Array<{ label?: unknown; text?: unknown }>)
    : [];
  const options = Object.fromEntries(
    optionRows
      .filter((item) => typeof item.label === "string" && typeof item.text === "string")
      .map((item) => [String(item.label), String(item.text)]),
  );
  const confidence = Number(row["confidence"] ?? 0);
  const status = String(row["resolution_status"] ?? "insufficient") as AnswerResult["resolution_status"];
  const origin = String(row["answer_origin"] ?? "model_knowledge") as AnswerResult["answer_origin"];
  return {
    question: String(row["question_text"] ?? ""),
    question_type:
      row["question_mode"] === "subjective"
        ? "open_question"
        : (String(row["question_mode"]) as AnswerResult["question_type"]),
    options,
    answer_letter: typeof row["correct_answer_label"] === "string" ? row["correct_answer_label"] : null,
    answer_text: String(row["correct_answer_text"] ?? ""),
    is_true_false: typeof row["is_true_false"] === "boolean" ? row["is_true_false"] : null,
    explanation: typeof row["explanation"] === "string" ? row["explanation"] : null,
    source_bag: typeof row["source_bag_name"] === "string" ? row["source_bag_name"] : null,
    source_bag_id: typeof row["source_bag_id"] === "string" ? row["source_bag_id"] : null,
    source_page: typeof row["source_page"] === "number" ? row["source_page"] : null,
    source_excerpt: typeof row["source_excerpt"] === "string" ? row["source_excerpt"] : null,
    confidence,
    confidence_label: confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low",
    found: status === "supported" || status === "human_verified" || status === "fallback",
    answer_status: origin === "training_bags" ? "answered" : "fallback",
    answer_origin: origin,
    warning: origin === "training_bags" ? null : "لم يتم تأكيد هذه الإجابة من الحقائب التدريبية.",
    external_sources: Array.isArray(row["external_sources"])
      ? (row["external_sources"] as AnswerResult["external_sources"])
      : null,
    resolution_status: status,
    evidence_chunk_id: typeof row["evidence_chunk_id"] === "string" ? row["evidence_chunk_id"] : null,
    evidence_quote: typeof row["evidence_quote"] === "string" ? row["evidence_quote"] : null,
    verification_reason:
      typeof (row["verification_details"] as { reason?: unknown } | null)?.reason === "string"
        ? String((row["verification_details"] as { reason: string }).reason)
        : null,
  };
}

export async function findSavedDecision(
  admin: SupabaseAdmin,
  decisionKey: string,
  knowledgeVersion: string,
): Promise<AnswerResult | null> {
  const { data, error } = await admin
    .from("question_bank")
    .select("*")
    .eq("decision_key", decisionKey)
    .eq("knowledge_version", knowledgeVersion)
    .eq("pipeline_version", PIPELINE_VERSION)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToResult(data as Record<string, unknown>) : null;
}

function answerTextOf(result: AnswerResult, mode: QuestionMode): string {
  if (mode === "true_false") {
    if (typeof result.is_true_false === "boolean") {
      return result.is_true_false ? "صح" : "خطأ";
    }
  }
  return result.answer_text ?? "";
}

/**
 * Upsert the answered question into the reusable question bank.
 * Duplicates (same mode + normalized text) bump times_asked instead.
 */
export async function saveToBank(
  admin: SupabaseAdmin,
  result: AnswerResult,
  mode: QuestionMode,
  inputType: "text" | "camera" | "image_upload" | "pdf",
  originalImagePath: string | null = null,
  decision?: {
    key: string;
    knowledgeVersion: string;
    retrievedChunkIds: string[];
  },
): Promise<void> {
  try {
    const questionText = (result.question ?? "").trim();
    if (questionText.length < 3) return;
    const normalized = normalizeQuestion(questionText);
    if (!normalized) return;

    const answerText = answerTextOf(result, mode);
    const fromBags = result.answer_origin === "training_bags";
    const verification =
      fromBags && result.resolution_status === "supported"
        ? "auto"
        : "needs_review";

    const existingQuery = admin
      .from("question_bank")
      .select("id,times_asked,correct_answer_text,verification_status")
      .eq("question_mode", mode);
    const { data: existing } = decision
      ? await existingQuery.eq("decision_key", decision.key).maybeSingle()
      : await existingQuery.eq("normalized_text", normalized).limit(1).maybeSingle();

    if (existing) {
      const row = existing as Record<string, unknown>;
      const patch: Record<string, unknown> = {
        times_asked: Number(row["times_asked"] ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      };
      // Only enrich an empty record; never silently overwrite verified edits.
      if (
        row["verification_status"] !== "verified" &&
        !String(row["correct_answer_text"] ?? "").trim() &&
        answerText
      ) {
        patch["correct_answer_text"] = answerText;
        patch["correct_answer_label"] = result.answer_letter;
        patch["explanation"] = result.explanation;
        patch["source_bag_name"] = result.source_bag;
        patch["source_bag_id"] = result.source_bag_id;
        patch["source_page"] = result.source_page;
        patch["confidence"] = result.confidence;
        patch["verification_status"] = verification;
        patch["answer_origin"] = result.answer_origin;
        patch["external_sources"] = result.external_sources;
      }
      if (decision && row["verification_status"] !== "verified") {
        patch["decision_key"] = decision.key;
        patch["knowledge_version"] = decision.knowledgeVersion;
        patch["pipeline_version"] = PIPELINE_VERSION;
        patch["resolution_status"] = result.resolution_status;
        patch["evidence_chunk_id"] = result.evidence_chunk_id;
        patch["evidence_quote"] = result.evidence_quote;
        patch["source_excerpt"] = result.source_excerpt;
        patch["is_true_false"] = result.is_true_false;
        patch["verification_details"] = {
          reason: result.verification_reason,
        };
        patch["retrieved_chunk_ids"] = decision.retrievedChunkIds;
      }
      await admin
        .from("question_bank")
        .update(patch as never)
        .eq("id", String(row["id"]));
      return;
    }

    await admin.from("question_bank").insert({
      question_mode: mode,
      question_text: questionText,
      normalized_text: normalized,
      options: optionsToJson(result.options ?? {}),
      correct_answer_label: result.answer_letter,
      correct_answer_text: answerText,
      explanation: result.explanation,
      source_bag_id: result.source_bag_id,
      source_bag_name: result.source_bag,
      source_page: result.source_page,
      source_pages: result.source_page ? [result.source_page] : null,
      confidence: result.confidence,
      input_type: inputType,
      original_image_path: originalImagePath,
      verification_status: verification,
      answer_origin: result.answer_origin,
      external_sources: result.external_sources,
      decision_key: decision?.key ?? null,
      knowledge_version: decision?.knowledgeVersion ?? null,
      pipeline_version: decision ? PIPELINE_VERSION : "legacy",
      resolution_status: result.resolution_status,
      evidence_chunk_id: result.evidence_chunk_id,
      evidence_quote: result.evidence_quote,
      source_excerpt: result.source_excerpt,
      is_true_false: result.is_true_false,
      verification_details: { reason: result.verification_reason },
      retrieved_chunk_ids: decision?.retrievedChunkIds ?? [],
    });
  } catch (error) {
    console.error("question bank save failed", error);
  }
}
