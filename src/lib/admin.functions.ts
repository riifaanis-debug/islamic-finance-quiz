import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BagRow = {
  id: string;
  title_ar: string;
  file_name: string;
  file_path: string | null;
  total_pages: number;
  total_chunks: number;
  status: string;
  processing_progress: number;
  error_message: string | null;
  created_at: string;
};

async function assertAdmin(
  supabase: Awaited<
    ReturnType<typeof import("@supabase/supabase-js").createClient>
  >,
  userId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("FORBIDDEN");
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

/** Bootstrap: the first signed-in user can claim admin when no admin exists. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (count && count > 0) return { granted: false };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { granted: true };
  });

export const listBags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BagRow[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("training_bags")
      .select(
        "id,title_ar,file_name,file_path,total_pages,total_chunks,status,processing_progress,error_message,created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BagRow[];
  });

export const createBag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title_ar: z.string().min(2).max(200),
        file_name: z.string().min(3).max(300),
        file_path: z.string().min(3).max(400),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabaseAdmin
      .from("training_bags")
      .insert({ ...data, status: "uploaded" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteBag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: bag } = await supabaseAdmin
      .from("training_bags")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (bag?.file_path) {
      await supabaseAdmin.storage.from("training-pdfs").remove([bag.file_path]);
    }
    const { error } = await supabaseAdmin
      .from("training_bags")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const processBag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { chunkPages, extractPdfPages, embedInBatches } = await import(
      "./pdf.server"
    );

    const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
      await supabaseAdmin
        .from("training_bags")
        .update({ status, updated_at: new Date().toISOString(), ...extra })
        .eq("id", data.id);
    };

    try {
      const { data: bag, error: bagError } = await supabaseAdmin
        .from("training_bags")
        .select("id,file_path")
        .eq("id", data.id)
        .single();
      if (bagError || !bag?.file_path) throw new Error("FILE_MISSING");

      await setStatus("extracting", { error_message: null, processing_progress: 5 });
      const download = await supabaseAdmin.storage
        .from("training-pdfs")
        .download(bag.file_path as string);
      if (download.error || !download.data) throw new Error("DOWNLOAD_FAILED");
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const pages = await extractPdfPages(bytes);

      await setStatus("chunking", {
        total_pages: pages.length,
        processing_progress: 35,
      });

      // Persist the real per-page text so page numbers are never guessed.
      await supabaseAdmin.from("document_pages").delete().eq("bag_id", data.id);
      const pageRows = pages.map((text, index) => ({
        bag_id: data.id,
        page_number: index + 1,
        page_text: text ?? "",
      }));
      for (let i = 0; i < pageRows.length; i += 200) {
        await supabaseAdmin
          .from("document_pages")
          .insert(pageRows.slice(i, i + 200) as never);
      }

      const chunks = chunkPages(pages);
      if (chunks.length === 0) throw new Error("NO_TEXT_FOUND");

      await setStatus("embedding", {
        total_chunks: chunks.length,
        processing_progress: 55,
      });
      await supabaseAdmin.from("document_chunks").delete().eq("bag_id", data.id);

      const embeddings = await embedInBatches(chunks.map((c) => c.content));
      const rows = chunks.map((c, i) => ({
        bag_id: data.id,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        section_title: c.section_title,
        content: c.content,
        embedding: JSON.stringify(embeddings[i]),
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabaseAdmin
          .from("document_chunks")
          .insert(rows.slice(i, i + 100) as never);
        if (error) throw new Error(error.message);
        await setStatus("embedding", {
          processing_progress: Math.min(
            99,
            55 + Math.round(((i + 100) / rows.length) * 44),
          ),
        });
      }

      await setStatus("ready", { processing_progress: 100 });
      return { ok: true, pages: pages.length, chunks: chunks.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      await setStatus("failed", { error_message: message });
      return { ok: false, error: message };
    }
  });


export const testSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().min(2).max(500),
        bag_id: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { retrieveChunks } = await import("./rag.server");
    const chunks = await retrieveChunks(
      supabaseAdmin,
      data.query,
      10,
      data.bag_id ?? null,
      8,
    );
    return chunks.map((c) => ({
      id: c.id,
      bag_title: c.bag_title,
      page_number: c.page_number,
      score: Number(c.score.toFixed(4)),
      preview: c.content.slice(0, 220),
    }));
  });

export const knowledgeHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [bags, pages, chunks, missingEmbedding] = await Promise.all([
      supabaseAdmin
        .from("training_bags")
        .select("id,title_ar,status,total_pages,total_chunks,updated_at"),
      supabaseAdmin
        .from("document_pages")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("document_chunks")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .is("embedding", null),
    ]);

    const rows = (bags.data ?? []) as Array<Record<string, unknown>>;
    const ready = rows.filter((r) => r["status"] === "ready");
    const issues: string[] = [];

    for (const bag of ready) {
      if (!Number(bag["total_pages"])) {
        issues.push(`الحقيبة «${bag["title_ar"]}» لا تحتوي صفحات مستخرجة.`);
      }
      if (!Number(bag["total_chunks"])) {
        issues.push(`الحقيبة «${bag["title_ar"]}» لا تحتوي مقاطع مفهرسة.`);
      }
    }
    if ((missingEmbedding.count ?? 0) > 0) {
      issues.push(`${missingEmbedding.count} مقطعًا بدون متجه بحث.`);
    }
    const failed = rows.filter((r) => r["status"] === "failed");
    for (const bag of failed) {
      issues.push(`فشلت معالجة الحقيبة «${bag["title_ar"]}».`);
    }

    let searchWorks = false;
    if (ready.length > 0) {
      try {
        const { retrieveChunks } = await import("./rag.server");
        const probe = await retrieveChunks(supabaseAdmin, "التمويل", 5, null, 3);
        searchWorks = probe.length > 0;
      } catch {
        searchWorks = false;
      }
      if (!searchWorks) issues.push("بحث المتجهات لم يُرجع أي نتيجة.");
    } else {
      issues.push("لا توجد حقيبة جاهزة في قاعدة المعرفة.");
    }

    const updatedAt = rows
      .map((r) => String(r["updated_at"] ?? ""))
      .sort()
      .at(-1) ?? null;

    return {
      healthy: issues.length === 0,
      issues,
      searchWorks,
      totals: {
        bags: rows.length,
        ready: ready.length,
        processing: rows.filter(
          (r) => !["ready", "failed"].includes(String(r["status"])),
        ).length,
        failed: failed.length,
        pages: pages.count ?? 0,
        chunks: chunks.count ?? 0,
      },
      updatedAt,
    };
  });
