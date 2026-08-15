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
  inputType: "text" | "camera" | "image_upload",
  originalImagePath: string | null = null,
): Promise<void> {
  try {
    const questionText = (result.question ?? "").trim();
    if (questionText.length < 3) return;
    const normalized = normalizeQuestion(questionText);
    if (!normalized) return;

    const answerText = answerTextOf(result, mode);
    const verification =
      result.found && result.confidence >= 0.75 ? "auto" : "needs_review";

    const { data: existing } = await admin
      .from("question_bank")
      .select("id,times_asked,correct_answer_text,verification_status")
      .eq("question_mode", mode)
      .eq("normalized_text", normalized)
      .maybeSingle();

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
    });
  } catch (error) {
    console.error("question bank save failed", error);
  }
}
