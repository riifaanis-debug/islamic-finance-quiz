ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS decision_key text,
  ADD COLUMN IF NOT EXISTS knowledge_version text,
  ADD COLUMN IF NOT EXISTS pipeline_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'insufficient',
  ADD COLUMN IF NOT EXISTS evidence_chunk_id uuid REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_quote text,
  ADD COLUMN IF NOT EXISTS source_excerpt text,
  ADD COLUMN IF NOT EXISTS is_true_false boolean,
  ADD COLUMN IF NOT EXISTS verification_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retrieved_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS public.question_bank_unique_norm;
CREATE INDEX IF NOT EXISTS question_bank_normalized_idx
  ON public.question_bank (question_mode, normalized_text);
CREATE UNIQUE INDEX IF NOT EXISTS question_bank_unique_decision
  ON public.question_bank (question_mode, decision_key)
  WHERE decision_key IS NOT NULL;

ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS question_bank_resolution_status_check;
ALTER TABLE public.question_bank ADD CONSTRAINT question_bank_resolution_status_check
  CHECK (resolution_status IN ('supported', 'conflict', 'insufficient', 'fallback', 'human_verified'));

ALTER TABLE public.question_history
  ADD COLUMN IF NOT EXISTS decision_key text,
  ADD COLUMN IF NOT EXISTS resolution_status text,
  ADD COLUMN IF NOT EXISTS evidence_chunk_id uuid REFERENCES public.document_chunks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS question_history_decision_idx
  ON public.question_history (decision_key, created_at DESC);