import { CheckCircle2, ListChecks, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/ResultCard";
import type { AnswerResult } from "@/lib/types";

const ARABIC_ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
] as const;

function questionHeading(index: number) {
  const ordinal = ARABIC_ORDINALS[index];
  return ordinal ? `السؤال ${ordinal}` : `السؤال ${index + 1}`;
}

function isCorrectOption(optionKey: string, answerLetter: string | null) {
  if (!answerLetter) return false;
  return optionKey.trim().toLocaleLowerCase("ar") === answerLetter.trim().toLocaleLowerCase("ar");
}

export function ExamSession({
  results,
  finished,
  examMode,
  showExplanation,
  onNewSession,
}: {
  results: AnswerResult[];
  finished: boolean;
  examMode: boolean;
  showExplanation: boolean;
  onNewSession: () => void;
}) {
  const confirmed = results.filter(
    (result) =>
      result.resolution_status === "supported" ||
      result.resolution_status === "human_verified",
  ).length;
  const unconfirmed = results.length - confirmed;

  return (
    <div className="space-y-5">
      {finished && (
        <div className="surface-panel animate-rise overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
              <ListChecks className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold">ملخص الاختبار</h2>
              <p className="text-sm text-muted-foreground">اكتملت جلسة الاختبار الحالية</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-x-reverse border-b text-center">
            <div className="px-2 py-4">
              <strong className="block text-xl">{results.length}</strong>
              <span className="text-xs text-muted-foreground">إجمالي الأسئلة</span>
            </div>
            <div className="px-2 py-4">
              <strong className="block text-xl text-success">{confirmed}</strong>
              <span className="text-xs text-muted-foreground">مؤكدة</span>
            </div>
            <div className="px-2 py-4">
              <strong className="block text-xl text-warning-foreground">{unconfirmed}</strong>
              <span className="text-xs text-muted-foreground">مرجّحة أو غير محسومة</span>
            </div>
          </div>
          <div className="flex justify-center px-5 py-4">
            <Button onClick={onNewSession}>
              <RotateCcw className="size-4" />
              بدء اختبار جديد
            </Button>
          </div>
        </div>
      )}

      {results.map((result, index) => {
        const options = Object.entries(result.options ?? {});
        return (
          <article key={`${index}-${result.question}`} className="space-y-3">
            <ResultCard
              result={result}
              examMode={examMode}
              showExplanation={showExplanation}
            />
            <div className="surface-panel animate-rise px-5 py-5 text-right sm:px-6">
              <h3 className="font-display text-lg font-bold text-primary">
                {questionHeading(index)}
              </h3>
              <p className="mt-2 text-base font-medium leading-8">{result.question}</p>
              {options.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {options.map(([key, value]) => {
                    const correct = isCorrectOption(key, result.answer_letter);
                    return (
                      <div
                        key={key}
                        className={
                          correct
                            ? "flex items-start gap-3 rounded-md border border-success/40 bg-success/15 px-4 py-3 text-success"
                            : "flex items-start gap-3 rounded-md border bg-secondary/30 px-4 py-3"
                        }
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-bold text-foreground">
                          {key}
                        </span>
                        <span className="flex-1 pt-0.5 leading-6">{value}</span>
                        {correct && <CheckCircle2 className="mt-0.5 size-5 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}