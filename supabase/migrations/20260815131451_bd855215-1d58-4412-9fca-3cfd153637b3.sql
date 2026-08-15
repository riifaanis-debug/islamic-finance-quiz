CREATE OR REPLACE FUNCTION public.normalize_question_text(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(_t,'')), 'أإآٱىﻻةﻷ', 'اااايلاهلا'),
      '[^[:alnum:][:space:]\u0600-\u06FF]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_mode text NOT NULL,
  question_text text NOT NULL,
  normalized_text text NOT NULL,
  options jsonb,
  correct_answer_label text,
  correct_answer_text text NOT NULL DEFAULT '',
  explanation text,
  source_bag_id uuid REFERENCES public.training_bags(id) ON DELETE SET NULL,
  source_bag_name text,
  source_page integer,
  source_pages jsonb,
  confidence numeric,
  input_type text NOT NULL DEFAULT 'text',
  original_image_path text,
  verification_status text NOT NULL DEFAULT 'auto',
  times_asked integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX question_bank_unique_norm
  ON public.question_bank (question_mode, normalized_text);
CREATE INDEX question_bank_mode_idx ON public.question_bank (question_mode, created_at DESC);
CREATE INDEX question_bank_bag_idx ON public.question_bank (source_bag_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage question bank" ON public.question_bank
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (key, value)
VALUES ('question_images', '{"retain": false}'::jsonb);

CREATE TRIGGER question_bank_updated_at BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();