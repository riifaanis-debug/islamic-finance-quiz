import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  LogOut,
  Trash2,
  UploadCloud,
  Play,
  RefreshCw,
  Search,
  Stethoscope,
  FileSearch,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import {
  claimFirstAdmin,
  knowledgeHealth,
  testSearch,
  createBag,
  deleteBag,
  getAdminStatus,
  listBags,
  processBag,
  getPagePreview,
  type PagePreview,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "إدارة الحقائب التدريبية — المساعد التدريبي" },
      {
        name: "description",
        content:
          "رفع ملفات الحقائب التدريبية بصيغة PDF ومعالجتها لبناء قاعدة معرفة المساعد.",
      },
      { property: "og:title", content: "إدارة الحقائب التدريبية" },
      {
        property: "og:description",
        content: "لوحة المشرف لرفع الحقائب التدريبية ومتابعة حالة المعالجة.",
      },
    ],
  }),
  component: AdminPage,
});

const QUALITY_LABEL: Record<string, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "بانتظار المعالجة",
  extracting: "جاري استخراج النص",
  chunking: "جاري التقسيم",
  embedding: "جاري بناء الفهرس",
  ready: "جاهزة",
  failed: "فشلت",
};

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useServerFn(getAdminStatus);
  const claim = useServerFn(claimFirstAdmin);
  const fetchBags = useServerFn(listBags);
  const addBag = useServerFn(createBag);
  const removeBag = useServerFn(deleteBag);
  const runProcess = useServerFn(processBag);
  const runHealth = useServerFn(knowledgeHealth);
  const runSearch = useServerFn(testSearch);
  const runPreview = useServerFn(getPagePreview);

  const [previewBag, setPreviewBag] = useState("");
  const [previewPage, setPreviewPage] = useState("1");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PagePreview | null>(null);

  const loadPreview = async () => {
    const page = Number(previewPage);
    if (!previewBag || !Number.isFinite(page) || page < 1) {
      toast.error("اختر الحقيبة ورقم الصفحة.");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await runPreview({
        data: { bag_id: previewBag, page_number: page },
      });
      setPreview(result);
      if (!result) toast.error("لا توجد بيانات لهذه الصفحة.");
    } catch {
      toast.error("تعذر جلب الصفحة.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const [health, setHealth] = useState<Awaited<
    ReturnType<typeof knowledgeHealth>
  > | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBag, setSearchBag] = useState<string>("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Awaited<
    ReturnType<typeof testSearch>
  > | null>(null);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      setHealth(await runHealth({}));
    } catch {
      toast.error("تعذر فحص قاعدة المعرفة.");
    } finally {
      setHealthLoading(false);
    }
  };

  const doSearch = async () => {
    if (searchQuery.trim().length < 2) {
      toast.error("اكتب كلمة للبحث.");
      return;
    }
    setSearchLoading(true);
    try {
      setSearchResults(
        await runSearch({
          data: {
            query: searchQuery.trim(),
            bag_id: searchBag ? searchBag : null,
          },
        }),
      );
    } catch {
      toast.error("تعذر تنفيذ البحث.");
    } finally {
      setSearchLoading(false);
    }
  };

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const adminQuery = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => status({}),
  });

  const isAdmin = adminQuery.data?.isAdmin ?? false;

  useEffect(() => {
    if (adminQuery.data && !adminQuery.data.isAdmin) {
      void claim({})
        .then((res) => {
          if (res.granted) void queryClient.invalidateQueries();
        })
        .catch(() => undefined);
    }
  }, [adminQuery.data, claim, queryClient]);

  const bagsQuery = useQuery({
    queryKey: ["bags"],
    queryFn: () => fetchBags({}),
    enabled: isAdmin,
    refetchInterval: 5000,
  });

  const upload = async () => {
    if (!file || title.trim().length < 2) {
      toast.error("أدخل اسم الحقيبة واختر ملف PDF.");
      return;
    }
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage
        .from("training-pdfs")
        .upload(path, file, { contentType: "application/pdf" });
      if (error) throw error;
      await addBag({
        data: { title_ar: title.trim(), file_name: file.name, file_path: path },
      });
      setTitle("");
      setFile(null);
      toast.success("تم رفع الحقيبة. اضغط «معالجة» لبناء الفهرس.");
      void queryClient.invalidateQueries({ queryKey: ["bags"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الرفع.");
    } finally {
      setUploading(false);
    }
  };

  const process = async (id: string) => {
    setBusyId(id);
    try {
      const res = await runProcess({ data: { id } });
      if (res.ok) toast.success(`تمت المعالجة: ${res.chunks} مقطعًا.`);
      else toast.error(`فشلت المعالجة: ${res.error}`);
    } catch {
      toast.error("فشلت المعالجة.");
    } finally {
      setBusyId(null);
      void queryClient.invalidateQueries({ queryKey: ["bags"] });
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await removeBag({ data: { id } });
      void queryClient.invalidateQueries({ queryKey: ["bags"] });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">إدارة الحقائب التدريبية</h1>
        <a
          href="/question-bank"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          بنك الأسئلة
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            void navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-4" />
          خروج
        </Button>
      </header>

      {adminQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : !isAdmin ? (
        <div className="surface-panel p-8 text-center text-sm text-muted-foreground">
          حسابك ليس لديه صلاحية إدارة. تواصل مع مشرف المنصة.
        </div>
      ) : (
        <>
          <section className="surface-panel space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="bag-title">اسم الحقيبة</Label>
              <Input
                id="bag-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: مبادئ المصرفية الإسلامية"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bag-file">ملف PDF</Label>
              <Input
                id="bag-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              رفع الحقيبة
            </Button>
          </section>

          <section className="mt-6 space-y-3">
            {(bagsQuery.data ?? []).map((bag) => (
              <div
                key={bag.id}
                className="surface-panel flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{bag.title_ar}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {STATUS_LABEL[bag.status] ?? bag.status}
                    {bag.status !== "ready" &&
                      bag.status !== "uploaded" &&
                      bag.status !== "failed" &&
                      ` — ${bag.processing_progress}%`}
                    {bag.status === "ready" &&
                      ` — ${bag.total_pages} صفحة / ${bag.total_chunks} مقطع`}
                    {bag.error_message ? ` — ${bag.error_message}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === bag.id}
                  onClick={() => void process(bag.id)}
                >
                  {busyId === bag.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : bag.status === "ready" || bag.status === "failed" ? (
                    <RefreshCw className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {bag.status === "ready" || bag.status === "failed"
                    ? "إعادة معالجة"
                    : "معالجة"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === bag.id}
                  onClick={() => void remove(bag.id)}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {bagsQuery.data?.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                لا توجد حقائب بعد.
              </p>
            )}
          </section>

          <section className="surface-panel mt-6 space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">حالة قاعدة المعرفة</h2>
              <Button size="sm" variant="secondary" onClick={() => void checkHealth()}>
                {healthLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Stethoscope className="size-4" />
                )}
                فحص قاعدة المعرفة
              </Button>
            </div>
            {health && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["الحقائب", health.totals.bags],
                    ["جاهزة", health.totals.ready],
                    ["قيد المعالجة", health.totals.processing],
                    ["فاشلة", health.totals.failed],
                    ["الصفحات", health.totals.pages],
                    ["المقاطع", health.totals.chunks],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <p
                  className={
                    health.healthy
                      ? "font-semibold text-success"
                      : "font-semibold text-destructive"
                  }
                >
                  {health.healthy ? "Healthy — كل شيء سليم" : "Needs Attention"}
                </p>
                {health.issues.length > 0 && (
                  <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
                    {health.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
                {health.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    آخر تحديث: {new Date(health.updatedAt).toLocaleString("ar")}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="surface-panel mt-6 space-y-3 p-5">
            <h2 className="font-semibold">اختبار البحث في المحتوى</h2>
            <Textarea
              dir="rtl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="مثال: قبول الودائع"
              className="min-h-20 resize-none"
            />
            <select
              value={searchBag}
              onChange={(e) => setSearchBag(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">كل الحقائب</option>
              {(bagsQuery.data ?? [])
                .filter((b) => b.status === "ready")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title_ar}
                  </option>
                ))}
            </select>
            <Button onClick={() => void doSearch()} disabled={searchLoading}>
              {searchLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              بحث
            </Button>
            <div className="space-y-2">
              {searchResults?.map((row) => (
                <div key={row.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">
                    {row.bag_title} — الصفحة {row.page_number}
                    <span className="mr-2 text-xs text-muted-foreground">
                      درجة التطابق: {row.score}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {row.preview}…
                  </p>
                </div>
              ))}
              {searchResults?.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
              )}
            </div>
          </section>

          <section className="surface-panel mt-6 space-y-3 p-5">
            <h2 className="font-semibold">معاينة الصفحة المستخرجة</h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={previewBag}
                onChange={(e) => setPreviewBag(e.target.value)}
                className="h-10 min-w-40 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">اختر الحقيبة</option>
                {(bagsQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title_ar}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                value={previewPage}
                onChange={(e) => setPreviewPage(e.target.value)}
                placeholder="رقم الصفحة"
                className="h-10 w-32"
              />
              <Button onClick={() => void loadPreview()} disabled={previewLoading}>
                {previewLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileSearch className="size-4" />
                )}
                عرض
              </Button>
            </div>
            {preview && (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  الصفحة {preview.page_number} من {preview.total_pages} — جودة
                  الاستخراج:{" "}
                  <span
                    className={
                      preview.extraction_quality === "low"
                        ? "font-semibold text-destructive"
                        : "font-semibold"
                    }
                  >
                    {QUALITY_LABEL[preview.extraction_quality] ??
                      preview.extraction_quality}
                  </span>{" "}
                  — الطريقة:{" "}
                  {preview.extraction_method === "vision"
                    ? "قراءة بصرية"
                    : "تحليل تخطيط"}
                </p>
                {preview.blocks.length > 0 ? (
                  <div className="space-y-2">
                    {preview.blocks.map((block: PagePreview["blocks"][number], i: number) => (
                      <div key={i} className="rounded-xl border p-3">
                        {block.title && (
                          <p className="font-semibold">{block.title}</p>
                        )}
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {block.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap rounded-xl border p-3 text-xs leading-relaxed">
                    {preview.structured_text || "لا يوجد نص."}
                  </p>
                )}
              </div>
            )}
          </section>

        </>
      )}
    </main>
  );
}
