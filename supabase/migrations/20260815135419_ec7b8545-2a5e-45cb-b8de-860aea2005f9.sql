ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS answer_origin text NOT NULL DEFAULT 'training_bags';
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS external_sources jsonb;
ALTER TABLE public.question_history ADD COLUMN IF NOT EXISTS answer_origin text;