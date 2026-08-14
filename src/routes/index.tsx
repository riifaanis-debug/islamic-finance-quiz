import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImageUp, Loader2, Send, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CameraCapture } from "@/components/CameraCapture";
import { ResultCard } from "@/components/ResultCard";
import { askImage, askQuestion } from "@/lib/ask.functions";
import { toCompressedDataUrl } from "@/lib/image";
import type { AnswerResult, AskResponse } from "@/lib/types";

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

const ERROR_TEXT: Record<string, string> = {
  unreadable_image: "لم أتمكن من قراءة الصورة بوضوح.",
  no_knowledge: "لم تُضف أي حقيبة تدريبية جاهزة بعد إلى قاعدة المعرفة.",
  failed: "تعذر تحليل السؤال، حاول مرة أخرى.",
};

function Home() {
  const ask = useServerFn(askQuestion);
  const askImg = useServerFn(askImage);

  const [question, setQuestion] = useState("");
  const [examMode, setExamMode] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const run = async (fn: () => Promise<AskResponse>) => {
    setLoading(true);
    setResult(null);
    setPhase(0);
    const timer1 = setTimeout(() => setPhase(1), 900);
    const timer2 = setTimeout(() => setPhase(2), 4500);
    try {
      const response = await fn();
      if (response.ok) {
        setResult(response.result);
      } else {
        toast.error(ERROR_TEXT[response.error] ?? ERROR_TEXT["failed"]!);
      }
    } catch {
      toast.error(ERROR_TEXT["failed"]!);
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoading(false);
    }
  };

  const submitText = () => {
    if (question.trim().length < 3) {
      toast.error("اكتب السؤال أولًا.");
      return;
    }
    void run(() => ask({ data: { question: question.trim() } }));
  };

  const submitImage = (dataUrl: string) => {
    setCameraOpen(false);
    void run(() => askImg({ data: { image: dataUrl } }));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      submitImage(await toCompressedDataUrl(file));
    } catch {
      toast.error(ERROR_TEXT["unreadable_image"]!);
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
        <Textarea
          dir="rtl"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="اكتب أو الصق السؤال والاختيارات هنا…"
          className="min-h-40 resize-none border-0 bg-transparent px-1 text-base leading-8 shadow-none focus-visible:ring-0 sm:text-lg"
        />

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
        </div>
      </section>

      <section className="mt-6">
        {loading && (
          <div className="surface-panel animate-rise flex items-center justify-center gap-3 p-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm">{PHASES[phase]}</span>
          </div>
        )}

        {!loading && result && (
          <>
            <ResultCard
              result={result}
              examMode={examMode}
              showExplanation={showExplanation}
            />
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => setCameraOpen(true)}>
                <Camera className="size-4" />
                تصوير السؤال التالي
              </Button>
            </div>
          </>
        )}

        {!loading && !result && (
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
      />
    </main>
  );
}
