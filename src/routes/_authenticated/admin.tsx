import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, Trash2, UploadCloud, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  claimFirstAdmin,
  createBag,
  deleteBag,
  getAdminStatus,
  listBags,
  processBag,
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
                  ) : (
                    <Play className="size-4" />
                  )}
                  معالجة
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
        </>
      )}
    </main>
  );
}
