import { useState } from "react";
import { BookOpen, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnswerResult } from "@/lib/types";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

export function ResultCard({
  result,
  examMode,
  showExplanation,
}: {
  result: AnswerResult;
  examMode: boolean;
  showExplanation: boolean;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);

  if (!result.found) {
    return (
      <div className="surface-panel animate-rise p-6 text-center">
        <p className="text-lg font-semibold">
          لم أجد إجابة مؤكدة في الحقائب التدريبية.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          جرّب إعادة صياغة السؤال أو إرفاق الخيارات كاملة.
        </p>
      </div>
    );
  }

  const isTrueFalse = result.question_type === "true_false";
  const positive = isTrueFalse ? result.is_true_false !== false : true;
  const detailsVisible = examMode ? sourceOpen : showExplanation;

  return (
    <div className="surface-panel animate-rise overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        {!examMode && (
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            الإجابة الصحيحة
          </span>
        )}
        {result.answer_letter && !isTrueFalse && (
          <span className="gradient-primary flex size-16 items-center justify-center rounded-2xl text-3xl font-bold text-primary-foreground">
            {result.answer_letter}
          </span>
        )}
        <p className="text-2xl font-bold leading-snug sm:text-3xl">
          {result.answer_text}
        </p>
        {result.question_type !== "open_question" && (
        <span
          className={
            positive
              ? "flex size-9 items-center justify-center rounded-full bg-success text-success-foreground"
              : "flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
          }
          aria-hidden
        >
          {positive ? <Check className="size-5" /> : <X className="size-5" />}
        </span>
        )}
      </div>

      {detailsVisible && (
        <div className="space-y-4 border-t bg-secondary/40 px-6 py-5 text-sm">
          {result.explanation && (
            <div>
              <p className="mb-1 font-semibold text-secondary-foreground">لماذا؟</p>
              <p className="leading-relaxed text-muted-foreground">
                {result.explanation}
              </p>
            </div>
          )}
          {result.source_bag && (
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <BookOpen className="size-4" />
              <span className="font-medium text-secondary-foreground">
                {result.source_bag}
              </span>
              {result.source_page !== null && (
                <span>— الصفحة {result.source_page}</span>
              )}
              <span className="mr-auto rounded-full bg-background px-3 py-1 text-xs">
                درجة الثقة: {CONFIDENCE_LABEL[result.confidence_label]}
              </span>
            </div>
          )}
          {result.source_excerpt && (
            <blockquote className="rounded-xl border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              «{result.source_excerpt}…»
            </blockquote>
          )}
        </div>
      )}

      {examMode && !sourceOpen && (
        <div className="border-t px-6 py-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setSourceOpen(true)}>
            عرض المصدر
          </Button>
        </div>
      )}
    </div>
  );
}
