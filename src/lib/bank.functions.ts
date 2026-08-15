import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BankOption = { label: string; text: string };

export type BankRow = {
  id: string;
  question_mode: string;
  question_text: string;
  options: BankOption[] | null;
  correct_answer_label: string | null;
  correct_answer_text: string;
  explanation: string | null;
  source_bag_id: string | null;
  source_bag_name: string | null;
  source_page: number | null;
  confidence: number | null;
  input_type: string;
  verification_status: string;
  times_asked: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
};

export type BankStats = {
  total: number;
  multiple_choice: number;
  true_false: number;
  subjective: number;
  verified: number;
  needs_review: number;
  topBag: { name: string; count: number } | null;
  topQuestion: { text: string; times: number } | null;
};

async function adminClient(supabase: unknown, userId: string) {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: string) => {
          eq: (
            a: string,
            b: string,
          ) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
  };
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("FORBIDDEN");
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  return supabaseAdmin;
}

const listSchema = z.object({
  mode: z.enum(["multiple_choice", "true_false", "subjective", "all"]),
  search: z.string().max(200).default(""),
  bagId: z.string().uuid().nullable().default(null),
  inputType: z.string().max(30).default(""),
  verification: z.string().max(30).default(""),
  minConfidence: z.number().min(0).max(1).default(0),
  fromDate: z.string().max(40).default(""),
  toDate: z.string().max(40).default(""),
  limit: z.number().int().min(1).max(1000).default(300),
});

export const listBankQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ context, data }): Promise<BankRow[]> => {
    const admin = await adminClient(context.supabase, context.userId);
    let query = admin
      .from("question_bank")
      .select(
        "id,question_mode,question_text,options,correct_answer_label,correct_answer_text,explanation,source_bag_id,source_bag_name,source_page,confidence,input_type,verification_status,times_asked,first_seen_at,last_seen_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.mode !== "all") query = query.eq("question_mode", data.mode);
    if (data.bagId) query = query.eq("source_bag_id", data.bagId);
    if (data.inputType) query = query.eq("input_type", data.inputType);
    if (data.verification)
      query = query.eq("verification_status", data.verification);
    if (data.minConfidence > 0)
      query = query.gte("confidence", data.minConfidence);
    if (data.fromDate) query = query.gte("created_at", data.fromDate);
    if (data.toDate) query = query.lte("created_at", `${data.toDate}T23:59:59`);
    if (data.search.trim()) {
      const term = data.search.trim().replace(/[%,()]/g, " ");
      const page = Number(term);
      const parts = [
        `question_text.ilike.%${term}%`,
        `correct_answer_text.ilike.%${term}%`,
        `source_bag_name.ilike.%${term}%`,
      ];
      if (Number.isInteger(page)) parts.push(`source_page.eq.${page}`);
      query = query.or(parts.join(","));
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BankRow[];
  });

export const bankStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BankStats> => {
    const admin = await adminClient(context.supabase, context.userId);
    const { data } = await admin
      .from("question_bank")
      .select(
        "question_mode,verification_status,source_bag_name,question_text,times_asked",
      );
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const countBy = (fn: (r: Record<string, unknown>) => boolean) =>
      rows.filter(fn).length;

    const bagCounts = new Map<string, number>();
    for (const r of rows) {
      const name = String(r["source_bag_name"] ?? "").trim();
      if (!name) continue;
      bagCounts.set(name, (bagCounts.get(name) ?? 0) + 1);
    }
    const topBagEntry = [...bagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topRow = [...rows].sort(
      (a, b) => Number(b["times_asked"] ?? 0) - Number(a["times_asked"] ?? 0),
    )[0];

    return {
      total: rows.length,
      multiple_choice: countBy((r) => r["question_mode"] === "multiple_choice"),
      true_false: countBy((r) => r["question_mode"] === "true_false"),
      subjective: countBy((r) => r["question_mode"] === "subjective"),
      verified: countBy((r) => r["verification_status"] === "verified"),
      needs_review: countBy((r) => r["verification_status"] === "needs_review"),
      topBag: topBagEntry
        ? { name: topBagEntry[0], count: topBagEntry[1] }
        : null,
      topQuestion: topRow
        ? {
            text: String(topRow["question_text"] ?? ""),
            times: Number(topRow["times_asked"] ?? 1),
          }
        : null,
    };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  question_text: z.string().min(3).max(4000),
  options: z
    .array(z.object({ label: z.string().max(10), text: z.string().max(1000) }))
    .nullable(),
  correct_answer_label: z.string().max(10).nullable(),
  correct_answer_text: z.string().max(4000),
  explanation: z.string().max(4000).nullable(),
  source_bag_name: z.string().max(300).nullable(),
  source_page: z.number().int().min(0).max(10000).nullable(),
});

export const updateBankQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ context, data }) => {
    const admin = await adminClient(context.supabase, context.userId);
    const { normalizeQuestion } = await import("./bank.server");
    const { id, ...patch } = data;
    const { error } = await admin
      .from("question_bank")
      .update({
        ...patch,
        options: patch.options as never,
        normalized_text: normalizeQuestion(patch.question_text),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(["auto", "verified", "needs_review"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const admin = await adminClient(context.supabase, context.userId);
    const { error } = await admin
      .from("question_bank")
      .update({ verification_status: data.status })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBankQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const admin = await adminClient(context.supabase, context.userId);
    const { error } = await admin
      .from("question_bank")
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getImageSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await adminClient(context.supabase, context.userId);
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "question_images")
      .maybeSingle();
    const value = (data?.value ?? {}) as { retain?: boolean };
    return { retain: Boolean(value.retain) };
  });

export const setImageSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ retain: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const admin = await adminClient(context.supabase, context.userId);
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: "question_images", value: { retain: data.retain } });
    if (error) throw new Error(error.message);
    return { retain: data.retain };
  });
