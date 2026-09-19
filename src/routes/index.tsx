import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  ClipboardCheck,
  FileUp,
  ImageUp,
  Loader2,
  Send,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CameraCapture } from "@/components/CameraCapture";
import { ExamSession } from "@/components/ExamSession";
import { ResultCard } from "@/components/ResultCard";
import { askImage, askPdf, askQuestion } from "@/lib/ask.functions";
import { toCompressedDataUrl } from "@/lib/image";
import type { AnswerResult, AskResponse, QuestionMode } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "المساعد التدريبي — أسئلة الحقائب في المالية الإسلامية" },
      {
        name: "description",
        content:
          "اكتب السؤال أو صوّره، وسيبحث المساعد داخل الحقائب التدريبية المعتمدة ويعرض الإجابة الصحيحة مع المصدر والصفحة.",
      },
      {
        property: "og:title",
        content: "المساعد التدريبي — أسئلة الحقائب في المالية الإسلامية",
      },
      {
        property: "og:description",
        content:
          "إجابات فورية لأسئلة الاختيار من متعدد وصح/خطأ مستندة حصريًا إلى محتوى الحقائب التدريبية.",
      },
    ],
  }),
  component: Home,
});

const PHASES = [
  "جاري قراءة السؤال…",
  "جاري البحث في الحقائب…",
  "تم العثور على الإجابة.",
];

const MODES: { value: QuestionMode; label: string }[] = [
  { value: "true_false", label: "صح وخطأ" },
  { value: "multiple_choice", label: "اختيارات" },
  { value: "subjective", label: "موضوعي" },
];

const PLACEHOLDER: Record<QuestionMode, string> = {
  true_false: "اكتب العبارة أو صوّرها…",
  multiple_choice: "اكتب أو الصق السؤال والاختيارات هنا…",
  subjective: "اكتب سؤالك هنا…",
};

const CAMERA_HINT: Record<QuestionMode, string> = {
  true_false: "ضع العبارة داخل الإطار",
  multiple_choice: "ضع السؤال وجميع الاختيارات داخل الإطار",
  subjective: "ضع السؤال داخل الإطار",
};

const MODE_STORAGE_KEY = "question-mode";

const ERROR_TEXT: Record<string, string> = {
  unreadable_image: "لم أتمكن من قراءة الصورة بوضوح.",
  missing_options: "تأكد من ظهور السؤال وجميع الاختيارات في الصورة.",
  no_knowledge: "لم تُضف أي حقيبة تدريبية جاهزة بعد إلى قاعدة المعرفة.",
  no_questions_found: "لم أعثر على سؤال واضح في المحتوى المرسل.",
  no_credits: "انتهى رصيد الذكاء الاصطناعي، يرجى شحن الرصيد ثم إعادة المحاولة.",
  rate_limit: "الطلبات كثيرة حاليًا، انتظر قليلًا ثم أعد المحاولة.",
  scanned_pdf:
    "هذا الملف ممسوح ضوئيًا (صور بلا نص). ارفع ملف PDF نصيًا أو استخدم خيار رفع الصورة.",
  pdf_too_large: "حجم الملف كبير جدًا، الحد الأقصى 15 ميجابايت.",
  bad_pdf: "تعذر فتح ملف PDF، تأكد من سلامة الملف.",
  failed: "تعذر تحليل السؤال، حاول مرة أخرى.",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function Home() {
  const ask = useServerFn(askQuestion);
  const askImg = useServerFn(askImage);
  const askDoc = useServerFn(askPdf);

  const [mode, setMode] = useState<QuestionMode>("multiple_choice");
  const [question, setQuestion] = useState("");
  const [examMode, setExamMode] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [testSessionActive, setTestSessionActive] = useState(false);
  const [testSessionFinished, setTestSessionFinished] = useState(false);
  const [testSessionResults, setTestSessionResults] = useState<AnswerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pdfRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(MODE_STORAGE_KEY) as QuestionMode | null;
    if (saved && MODES.some((m) => m.value === saved)) setMode(saved);
  }, []);

  const pickMode = (value: QuestionMode) => {
    setMode(value);
    sessionStorage.setItem(MODE_STORAGE_KEY, value);
  };

  const run = async (fn: () => Promise<AskResponse>) => {
    setLoading(true);
    setResults([]);
    setPhase(0);
    const timer1 = setTimeout(() => setPhase(1), 900);
    const timer2 = setTimeout(() => setPhase(2), 4500);
    try {
      const response = await fn();
      if (response.ok) {
        setResults(response.results);
        if (testSessionActive) {
          setTestSessionResults((current) => [...current, ...response.results]);
        }
        const expected = response.expected ?? response.results.length;
        if (expected > 1) {
          toast.success(
            `تم استخراج ${response.results.length} من ${expected} سؤالًا`,
          );
        }
      } else {
        toast.error(ERROR_TEXT[response.error] ?? ERROR_TEXT["failed"]!);
      }
    } catch {
      toast.error(ERROR_TEXT["failed"]!);
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoading(false);
      setPastedPreview(null);
    }
  };

  const startTestSession = () => {
    setTestSessionResults([]);
    setResults([]);
    setTestSessionFinished(false);
    setTestSessionActive(true);
  };

  const finishTestSession = () => {
    setTestSessionActive(false);
    setTestSessionFinished(true);
  };


  const submitText = () => {
    if (question.trim().length < 3) {
      toast.error("اكتب السؤال أولًا.");
      return;
    }
    void run(() =>
      ask({ data: { question: question.trim(), questionMode: mode } }),
    );
  };

  const submitImage = (
    dataUrl: string,
    source: "camera" | "image_upload" = "camera",
  ) => {
    setCameraOpen(false);
    void run(() =>
      askImg({ data: { image: dataUrl, questionMode: mode, source } }),
    );
  };

  const onFile = async (file: File | undefined, showPreview = false) => {
    if (!file) return;
    try {
      const dataUrl = await toCompressedDataUrl(file);
      if (showPreview) setPastedPreview(dataUrl);
      submitImage(dataUrl, "image_upload");
    } catch {
      setPastedPreview(null);
      toast.error(ERROR_TEXT["unreadable_image"]!);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.items).filter(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (images.length === 0) return;
    event.preventDefault();
    if (loading) {
      toast.error("انتظر انتهاء التحليل الحالي.");
      return;
    }
    if (images.length > 1) {
      toast.info("تم لصق أكثر من صورة، ستُعالَج الصورة الأولى فقط.");
    }
    const file = images[0]!.getAsFile();
    if (!file) {
      toast.error("تعذر قراءة الصورة الملصوقة.");
      return;
    }
    void onFile(file, true);
  };

  const onPdf = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error(ERROR_TEXT["pdf_too_large"]!);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      void run(() => askDoc({ data: { file: base64, questionMode: mode } }));
    } catch {
      toast.error(ERROR_TEXT["bad_pdf"]!);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="gradient-primary flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <ScrollText className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">
            المساعد التدريبي
          </span>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          المالية الإسلامية
        </span>
      </header>

      <section className="mt-10 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">اسأل المساعد التدريبي</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          اكتب السؤال أو صوّره وسأبحث عن الإجابة داخل الحقائب التدريبية.
        </p>
      </section>

      <section className="surface-panel mt-6 p-4 sm:p-5">
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            نوع السؤال
          </p>
          <div
            role="radiogroup"
            aria-label="نوع السؤال"
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {MODES.map((item) => (
              <Button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={mode === item.value}
                variant={mode === item.value ? "default" : "outline"}
                className="w-full"
                onClick={() => pickMode(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {pastedPreview && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border p-2">
            <img
              src={pastedPreview}
              alt="معاينة الصورة الملصوقة"
              className="h-16 w-24 rounded-lg object-cover"
            />
            <span className="flex-1 text-sm text-muted-foreground">
              صورة ملصوقة
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPastedPreview(null)}
            >
              إزالة
            </Button>
          </div>
        )}

        <Textarea
          dir="rtl"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onPaste={onPaste}
          placeholder={PLACEHOLDER[mode]}
          className="min-h-40 resize-none border-0 bg-transparent px-1 text-base leading-8 shadow-none focus-visible:ring-0 sm:text-lg"
        />
        <p className="px-1 text-xs text-muted-foreground">
          يمكنك لصق لقطة الشاشة مباشرة هنا
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            size="lg"
            className="min-w-32 flex-1 sm:flex-none"
            onClick={submitText}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            إجابة
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setCameraOpen(true)}
            disabled={loading}
          >
            <Camera className="size-4" />
            تصوير السؤال
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
          >
            <ImageUp className="size-4" />
            رفع صورة
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/*"
            className="hidden"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="lg"
            onClick={() => pdfRef.current?.click()}
            disabled={loading}
          >
            <FileUp className="size-4" />
            رفع ملف PDF
          </Button>
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              void onPdf(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>


        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={examMode} onCheckedChange={setExamMode} />
            <span>وضع الاختبار السريع</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={showExplanation}
              onCheckedChange={setShowExplanation}
              disabled={examMode}
            />
            <span className={examMode ? "text-muted-foreground" : undefined}>
              إظهار التفسير والمصدر
            </span>
          </label>
          {testSessionActive ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={finishTestSession}
              disabled={loading}
            >
              <ClipboardCheck className="size-4" />
              إنهاء وضع الاختبار
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startTestSession}
              disabled={loading}
            >
              <ClipboardCheck className="size-4" />
              تفعيل وضع الاختبار
            </Button>
          )}
        </div>
      </section>

      <section className="mt-6">
        {loading && (
          <div className="surface-panel animate-rise flex items-center justify-center gap-3 p-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm">{PHASES[phase]}</span>
          </div>
        )}

        {!loading && (testSessionActive || testSessionFinished) && testSessionResults.length > 0 && (
          <>
            <ExamSession
              results={testSessionResults}
              finished={testSessionFinished}
              examMode={examMode}
              showExplanation={showExplanation}
              onNewSession={startTestSession}
            />
            {testSessionActive && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => setCameraOpen(true)}>
                  <Camera className="size-4" />
                  تصوير السؤال التالي
                </Button>
              </div>
            )}
          </>
        )}

        {!loading && !testSessionActive && !testSessionFinished && results.length > 0 && (
          <>
            {results.length > 1 && (
              <div className="surface-panel mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">
                  تم تحليل {results.length} أسئلة
                </span>
                <span className="text-muted-foreground">
                  {results.filter((r) => r.answer_status !== "fallback").length}{" "}
                  مؤكدة من الحقائب •{" "}
                  {results.filter((r) => r.answer_status === "fallback").length}{" "}
                  مرجّحة
                </span>
              </div>
            )}
            <div className="space-y-5">
              {results.map((item, index) => (
                <div key={`${index}-${item.question}`}>
                  {results.length > 1 && (
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {item.question_type === "true_false"
                          ? "صح وخطأ"
                          : item.question_type === "multiple_choice"
                            ? "اختيارات"
                            : "موضوعي"}
                      </span>
                      <span>
                        السؤال {item.question_number ?? index + 1} من{" "}
                        {results.length} — {item.question}
                      </span>
                    </p>
                  )}
                  <ResultCard
                    result={item}
                    examMode={examMode}
                    showExplanation={showExplanation}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => setCameraOpen(true)}>
                <Camera className="size-4" />
                تصوير السؤال التالي
              </Button>
            </div>
          </>
        )}

        {!loading && results.length === 0 && testSessionResults.length === 0 && (

          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {[
              "الصق سؤال اختيار من متعدد",
              "صوّر السؤال من شاشة الكمبيوتر",
              "ارفع Screenshot من جوالك",
            ].map((hint) => (
              <li
                key={hint}
                className="rounded-xl border border-dashed px-3 py-3 text-center"
              >
                {hint}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={submitImage}
        hint={CAMERA_HINT[mode]}
      />
    </main>
  );
}
