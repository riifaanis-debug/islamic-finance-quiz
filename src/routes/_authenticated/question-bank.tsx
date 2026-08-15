import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { listBags } from "@/lib/admin.functions";
import {
  bankStats,
  deleteBankQuestions,
  listBankQuestions,
  setVerification,
  updateBankQuestion,
  type BankRow,
} from "@/lib/bank.functions";

export const Route = createFileRoute("/_authenticated/question-bank")({
  head: () => ({
    meta: [
      { title: "بنك الأسئلة — المساعد التدريبي" },
      {
        name: "description",
        content:
          "بنك أسئلة منظم للاختيارات وصح/خطأ والأسئلة الموضوعية مع البحث والتصدير والطباعة.",
      },
      { property: "og:title", content: "بنك الأسئلة" },
      {
        property: "og:description",
        content: "إدارة الأسئلة المحفوظة وتصديرها وطباعتها.",
      },
    ],
  }),
  component: QuestionBankPage,
});

type Mode = "multiple_choice" | "true_false" | "subjective" | "all";

const TABS: { key: Mode; label: string }[] = [
  { key: "multiple_choice", label: "الاختيارات" },
  { key: "true_false", label: "صح وخطأ" },
  { key: "subjective", label: "موضوعي" },
  { key: "all", label: "الكل" },
];

const ORIGIN_LABEL: Record<string, string> = {
  training_bags: "موثق من الحقائب",
  model_knowledge: "إجابة مرجحة",
  web: "إجابة خارجية",
};

const ORIGIN_CLASS: Record<string, string> = {
  training_bags:
    "inline-block rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success",
  model_knowledge:
    "inline-block rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning-foreground",
  web: "inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground",
};

const VERIFY_LABEL: Record<string, string> = {
  auto: "تلقائي",
  verified: "موثّق",
  needs_review: "يحتاج مراجعة",
};

const INPUT_LABEL: Record<string, string> = {
  text: "كتابة",
  camera: "كاميرا",
  image_upload: "رفع صورة",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function answerOf(row: BankRow) {
  const label = row.correct_answer_label ? `${row.correct_answer_label} — ` : "";
  return `${label}${row.correct_answer_text || "—"}`;
}

function buildHtml(rows: BankRow[], withAnswers: boolean, title: string) {
  const body = rows
    .map((row, index) => {
      const opts =
        row.question_mode === "multiple_choice" && row.options?.length
          ? row.options
              .map((o) => `<p class="opt">${escapeHtml(o.label)}) ${escapeHtml(o.text)}</p>`)
              .join("")
          : row.question_mode === "true_false"
            ? `<p class="opt">☐ صح</p><p class="opt">☐ خطأ</p>`
            : "";
      const answer = withAnswers
        ? `<p class="ans">الإجابة الصحيحة: ${escapeHtml(answerOf(row))}</p>${
            row.source_bag_name
              ? `<p class="src">المصدر: ${escapeHtml(row.source_bag_name)}${
                  row.source_page ? ` — صفحة ${row.source_page}` : ""
                }</p>`
              : ""
          }`
        : "";
      return `<div class="q"><p class="qt">${index + 1}. ${escapeHtml(
        row.question_text,
      )}</p>${opts}${answer}</div>`;
    })
    .join("");
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>
body{font-family:"Times New Roman","Traditional Arabic",serif;direction:rtl;text-align:right;padding:24px;line-height:1.9}
h1{font-size:20px;margin-bottom:18px}
.q{margin-bottom:16px;page-break-inside:avoid}
.qt{font-weight:bold;margin:0 0 6px}
.opt{margin:0 18px 2px 0}
.ans{margin:6px 0 0;color:#0a6b3d;font-weight:bold}
.src{margin:0;font-size:12px;color:#555}
</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob(["\uFEFF" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: BankRow[], withAnswers: boolean) {
  const head = [
    "#",
    "النوع",
    "السؤال",
    "الخيارات",
    ...(withAnswers ? ["الإجابة الصحيحة"] : []),
    "الحقيبة",
    "الصفحة",
    "التكرار",
    "الثقة",
    "الحالة",
    "التاريخ",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((row, i) =>
    [
      String(i + 1),
      row.question_mode,
      row.question_text,
      (row.options ?? []).map((o) => `${o.label}) ${o.text}`).join(" | "),
      ...(withAnswers ? [answerOf(row)] : []),
      row.source_bag_name ?? "",
      row.source_page ? String(row.source_page) : "",
      String(row.times_asked),
      row.confidence ? row.confidence.toFixed(2) : "",
      VERIFY_LABEL[row.verification_status] ?? row.verification_status,
      new Date(row.created_at).toLocaleDateString("ar"),
    ]
      .map(esc)
      .join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

function printHtml(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("امنع حظر النوافذ المنبثقة للطباعة.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function QuestionBankPage() {
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listBankQuestions);
  const fetchStats = useServerFn(bankStats);
  const fetchBags = useServerFn(listBags);
  const saveRow = useServerFn(updateBankQuestion);
  const verifyRows = useServerFn(setVerification);
  const removeRows = useServerFn(deleteBankQuestions);

  const [mode, setMode] = useState<Mode>("multiple_choice");
  const [search, setSearch] = useState("");
  const [bagId, setBagId] = useState("");
  const [inputType, setInputType] = useState("");
  const [verification, setVerificationFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState("0");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [withAnswers, setWithAnswers] = useState(true);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [mcqCount, setMcqCount] = useState("20");
  const [tfCount, setTfCount] = useState("20");

  const filters = {
    mode,
    search,
    bagId: bagId ? bagId : null,
    inputType,
    verification,
    minConfidence: Number(minConfidence) || 0,
    fromDate,
    toDate,
    limit: 300,
  };

  const rowsQuery = useQuery({
    queryKey: ["bank", filters],
    queryFn: () => fetchRows({ data: filters }),
  });
  const statsQuery = useQuery({
    queryKey: ["bank-stats"],
    queryFn: () => fetchStats({}),
  });
  const bagsQuery = useQuery({ queryKey: ["bags"], queryFn: () => fetchBags({}) });

  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const selectedRows = rows.filter((r) => selected[r.id]);
  const targetRows = selectedRows.length > 0 ? selectedRows : rows;
  const allChecked = rows.length > 0 && selectedRows.length === rows.length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["bank"] });
    void queryClient.invalidateQueries({ queryKey: ["bank-stats"] });
  };

  const exportAs = (kind: "pdf" | "word" | "excel" | "csv") => {
    if (targetRows.length === 0) {
      toast.error("لا توجد أسئلة للتصدير.");
      return;
    }
    const title = `بنك الأسئلة — ${TABS.find((t) => t.key === mode)?.label ?? ""}`;
    if (kind === "csv") {
      downloadBlob(toCsv(targetRows, withAnswers), "question-bank.csv", "text/csv;charset=utf-8");
    } else if (kind === "excel") {
      downloadBlob(toCsv(targetRows, withAnswers), "question-bank.xls", "application/vnd.ms-excel");
    } else if (kind === "word") {
      downloadBlob(
        buildHtml(targetRows, withAnswers, title),
        "question-bank.doc",
        "application/msword",
      );
    } else {
      printHtml(buildHtml(targetRows, withAnswers, title));
    }
  };

  const printAnswerKey = () => {
    if (targetRows.length === 0) return;
    const items = targetRows
      .map(
        (row, i) =>
          `<p>${i + 1} — ${escapeHtml(
            row.question_mode === "true_false"
              ? row.correct_answer_text || "—"
              : answerOf(row),
          )}</p>`,
      )
      .join("");
    printHtml(
      `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>نموذج الإجابة</title><style>body{font-family:"Times New Roman",serif;direction:rtl;padding:24px;line-height:2}</style></head><body><h1>نموذج الإجابة</h1>${items}</body></html>`,
    );
  };

  const buildExam = async () => {
    const nM = Number(mcqCount) || 0;
    const nT = Number(tfCount) || 0;
    const pick = async (m: Mode, n: number) => {
      if (n <= 0) return [] as BankRow[];
      const data = await fetchRows({ data: { ...filters, mode: m, limit: 300 } });
      return [...data].sort(() => Math.random() - 0.5).slice(0, n);
    };
    const exam = [
      ...(await pick("multiple_choice", nM)),
      ...(await pick("true_false", nT)),
    ];
    if (exam.length === 0) {
      toast.error("لا توجد أسئلة كافية.");
      return;
    }
    printHtml(buildHtml(exam, withAnswers, withAnswers ? "نموذج الإجابة" : "ورقة الاختبار"));
  };

  const commitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await saveRow({
        data: {
          id: editing.id,
          question_text: editing.question_text,
          options: editing.options,
          correct_answer_label: editing.correct_answer_label,
          correct_answer_text: editing.correct_answer_text,
          explanation: editing.explanation,
          source_bag_name: editing.source_bag_name,
          source_page: editing.source_page,
        },
      });
      toast.success("تم حفظ التعديلات.");
      setEditing(null);
      refresh();
    } catch {
      toast.error("تعذر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    if (!window.confirm(`سيتم حذف ${ids.length} سؤالًا نهائيًا. متابعة؟`)) return;
    await removeRows({ data: { ids } });
    setSelected({});
    toast.success("تم الحذف.");
    refresh();
  };

  const doVerify = async () => {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) {
      toast.error("حدد أسئلة أولًا.");
      return;
    }
    await verifyRows({ data: { ids, status: "verified" } });
    toast.success("تم توثيق الأسئلة.");
    refresh();
  };

  const stats = statsQuery.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">بنك الأسئلة</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowRight className="size-4" />
            لوحة الإدارة
          </Link>
        </Button>
      </header>

      {stats && (
        <section className="surface-panel mb-6 grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-3">
          <Stat label="إجمالي الأسئلة" value={stats.total} />
          <Stat label="اختيارات" value={stats.multiple_choice} />
          <Stat label="صح وخطأ" value={stats.true_false} />
          <Stat label="موضوعي" value={stats.subjective} />
          <Stat label="موثقة" value={stats.verified} />
          <Stat label="تحتاج مراجعة" value={stats.needs_review} />
          <p className="col-span-2 text-xs text-muted-foreground sm:col-span-3">
            أكثر حقيبة: {stats.topBag ? `${stats.topBag.name} (${stats.topBag.count})` : "—"}
            {" · "}
            أكثر سؤال تكرارًا:{" "}
            {stats.topQuestion
              ? `${stats.topQuestion.text.slice(0, 60)} (${stats.topQuestion.times})`
              : "—"}
          </p>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={mode === tab.key ? "default" : "outline"}
            onClick={() => {
              setMode(tab.key);
              setSelected({});
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <section className="surface-panel mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="bank-search">بحث في بنك الأسئلة</Label>
          <Input
            id="bank-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="كلمة من السؤال أو الإجابة أو اسم الحقيبة أو رقم الصفحة"
          />
        </div>
        <select
          value={bagId}
          onChange={(e) => setBagId(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">كل الحقائب</option>
          {(bagsQuery.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.title_ar}
            </option>
          ))}
        </select>
        <select
          value={inputType}
          onChange={(e) => setInputType(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">كل طرق الإدخال</option>
          <option value="text">كتابة</option>
          <option value="camera">كاميرا</option>
          <option value="image_upload">رفع صورة</option>
        </select>
        <select
          value={verification}
          onChange={(e) => setVerificationFilter(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="verified">موثّق</option>
          <option value="auto">تلقائي</option>
          <option value="needs_review">يحتاج مراجعة</option>
        </select>
        <select
          value={minConfidence}
          onChange={(e) => setMinConfidence(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="0">كل درجات الثقة</option>
          <option value="0.5">ثقة 50% فأكثر</option>
          <option value="0.75">ثقة 75% فأكثر</option>
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </section>

      <section className="surface-panel mb-4 flex flex-wrap items-center gap-2 p-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(v) =>
              setSelected(
                v ? Object.fromEntries(rows.map((r) => [r.id, true])) : {},
              )
            }
          />
          تحديد الكل ({selectedRows.length}/{rows.length})
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={withAnswers}
            onCheckedChange={(v) => setWithAnswers(Boolean(v))}
          />
          تضمين الإجابات الصحيحة
        </label>
        <Button size="sm" variant="outline" onClick={() => exportAs("pdf")}>
          <Download className="size-4" /> PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("word")}>
          <Download className="size-4" /> Word
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("excel")}>
          <Download className="size-4" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("csv")}>
          <Download className="size-4" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("pdf")}>
          <Printer className="size-4" /> طباعة
        </Button>
        <Button size="sm" variant="outline" onClick={printAnswerKey}>
          <Printer className="size-4" /> نموذج الإجابة
        </Button>
        <Button size="sm" variant="outline" onClick={() => void doVerify()}>
          <CheckCircle2 className="size-4" /> تم التحقق
        </Button>
        <Button size="sm" variant="destructive" onClick={() => void doDelete()}>
          <Trash2 className="size-4" /> حذف
        </Button>
      </section>

      <section className="surface-panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label htmlFor="exam-mcq">عدد أسئلة الاختيارات</Label>
          <Input
            id="exam-mcq"
            className="w-28"
            value={mcqCount}
            onChange={(e) => setMcqCount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="exam-tf">عدد أسئلة صح وخطأ</Label>
          <Input
            id="exam-tf"
            className="w-28"
            value={tfCount}
            onChange={(e) => setTfCount(e.target.value)}
          />
        </div>
        <Button onClick={() => void buildExam()}>إنشاء اختبار</Button>
      </section>

      {rowsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="surface-panel p-8 text-center text-sm text-muted-foreground">
          لا توجد أسئلة محفوظة في هذا القسم بعد.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <article key={row.id} className="surface-panel space-y-2 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={!!selected[row.id]}
                  onCheckedChange={(v) =>
                    setSelected((s) => ({ ...s, [row.id]: Boolean(v) }))
                  }
                />
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground">سؤال {index + 1}</p>
                  <p className="font-semibold leading-relaxed">{row.question_text}</p>
                  {row.question_mode === "multiple_choice" &&
                    row.options?.map((o) => (
                      <p key={o.label} className="pr-3 text-muted-foreground">
                        {o.label}) {o.text}
                      </p>
                    ))}
                  <p className="font-medium text-primary">
                    {row.answer_origin && row.answer_origin !== "training_bags"
                      ? "الإجابة الأرجح: "
                      : "الإجابة الصحيحة: "}
                    {answerOf(row)}
                  </p>
                  <span className={ORIGIN_CLASS[row.answer_origin ?? "training_bags"]}>
                    {ORIGIN_LABEL[row.answer_origin ?? "training_bags"]}
                  </span>
                  {row.explanation && (
                    <p className="text-xs text-muted-foreground">{row.explanation}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    المصدر: {row.source_bag_name ?? "—"}
                    {row.source_page ? ` — صفحة ${row.source_page}` : ""} · تكرار:{" "}
                    {row.times_asked} · {INPUT_LABEL[row.input_type] ?? row.input_type} ·{" "}
                    {VERIFY_LABEL[row.verification_status] ?? row.verification_status} ·{" "}
                    {new Date(row.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                  تعديل
                </Button>
              </div>

              {editing?.id === row.id && (
                <div className="space-y-2 rounded-xl border p-3">
                  <Textarea
                    value={editing.question_text}
                    onChange={(e) =>
                      setEditing({ ...editing, question_text: e.target.value })
                    }
                  />
                  {editing.options?.map((o, i) => (
                    <Input
                      key={i}
                      value={`${o.label}) ${o.text}`}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const m = raw.match(/^\s*([^)]{1,6})\)\s*(.*)$/);
                        const next = [...(editing.options ?? [])];
                        next[i] = m
                          ? { label: m[1]!.trim(), text: m[2]! }
                          : { label: o.label, text: raw };
                        setEditing({ ...editing, options: next });
                      }}
                    />
                  ))}
                  <div className="flex gap-2">
                    <Input
                      className="w-24"
                      placeholder="الرمز"
                      value={editing.correct_answer_label ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, correct_answer_label: e.target.value })
                      }
                    />
                    <Input
                      placeholder="نص الإجابة"
                      value={editing.correct_answer_text}
                      onChange={(e) =>
                        setEditing({ ...editing, correct_answer_text: e.target.value })
                      }
                    />
                  </div>
                  <Textarea
                    placeholder="التفسير"
                    value={editing.explanation ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, explanation: e.target.value })
                    }
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="اسم الحقيبة"
                      value={editing.source_bag_name ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, source_bag_name: e.target.value })
                      }
                    />
                    <Input
                      className="w-28"
                      type="number"
                      placeholder="الصفحة"
                      value={editing.source_page ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          source_page: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void commitEdit()} disabled={saving}>
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      حفظ التعديلات
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
