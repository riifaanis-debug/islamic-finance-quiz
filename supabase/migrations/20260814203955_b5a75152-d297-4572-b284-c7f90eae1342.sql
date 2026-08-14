ALTER TABLE public.training_bags
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS processing_progress integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_id uuid NOT NULL REFERENCES public.training_bags(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  page_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bag_id, page_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pages TO authenticated;
GRANT ALL ON public.document_pages TO service_role;

ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage pages" ON public.document_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS document_pages_bag_idx ON public.document_pages (bag_id, page_number);

ALTER TABLE public.question_history
  ADD COLUMN IF NOT EXISTS answer_status text,
  ADD COLUMN IF NOT EXISTS input_type text;

CREATE OR REPLACE FUNCTION public.keyword_chunks(query_text text, match_count integer, bag_filter uuid)
RETURNS TABLE(id uuid, bag_id uuid, bag_title text, page_number integer, section_title text, content text, rank double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select c.id, c.bag_id, b.title_ar, c.page_number, c.section_title, c.content,
         ts_rank(to_tsvector('simple', c.content), websearch_to_tsquery('simple', query_text))::double precision
  from public.document_chunks c
  join public.training_bags b on b.id = c.bag_id
  where b.status = 'ready'
    and (bag_filter is null or c.bag_id = bag_filter)
    and to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', query_text)
  order by 7 desc
  limit match_count
$function$;

REVOKE ALL ON FUNCTION public.keyword_chunks(text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keyword_chunks(text, integer, uuid) TO service_role;