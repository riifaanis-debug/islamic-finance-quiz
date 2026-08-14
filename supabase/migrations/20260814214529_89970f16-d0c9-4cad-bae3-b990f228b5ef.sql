ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS raw_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS structured_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS layout_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_quality text NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS extraction_method text NOT NULL DEFAULT 'layout';

ALTER TABLE public.document_pages
  DROP CONSTRAINT IF EXISTS document_pages_extraction_quality_check;
ALTER TABLE public.document_pages
  ADD CONSTRAINT document_pages_extraction_quality_check
  CHECK (extraction_quality IN ('high','medium','low'));

CREATE INDEX IF NOT EXISTS document_pages_bag_page_idx
  ON public.document_pages (bag_id, page_number);

ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS block_index integer NOT NULL DEFAULT 0;