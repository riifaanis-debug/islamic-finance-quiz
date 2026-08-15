export type QuestionMode = "true_false" | "multiple_choice" | "subjective";

export type QuestionType = "multiple_choice" | "true_false" | "open_question";

export type ParsedQuestion = {
  question: string;
  question_type: QuestionType;
  options: Record<string, string>;
};

export type AnswerResult = {
  question: string;
  question_type: QuestionType;
  options: Record<string, string>;
  answer_letter: string | null;
  answer_text: string;
  is_true_false: boolean | null;
  explanation: string | null;
  source_bag: string | null;
  source_bag_id: string | null;
  source_page: number | null;
  source_excerpt: string | null;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  found: boolean;
};

export type AskResponse =
  | { ok: true; result: AnswerResult }
  | {
      ok: false;
      error: "unreadable_image" | "no_knowledge" | "failed" | "missing_options";
    };

export const BAG_TITLES = [
  "مبادئ المصرفية الإسلامية",
  "مبادئ خدمات شركات الوساطة المالية",
  "مبادئ التأمين التعاوني",
  "مبادئ محاسبة الزكاة",
  "مفهوم الرقابة الشرعية وتطبيقاتها",
  "تطبيقات الاستشارات الشرعية",
] as const;
