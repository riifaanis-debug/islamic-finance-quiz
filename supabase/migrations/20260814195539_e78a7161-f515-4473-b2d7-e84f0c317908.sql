create extension if not exists vector;

create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.training_bags (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  file_name text not null,
  file_path text,
  total_pages integer not null default 0,
  total_chunks integer not null default 0,
  status text not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.training_bags to authenticated;
grant all on public.training_bags to service_role;
alter table public.training_bags enable row level security;
create policy "admins manage bags" on public.training_bags for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  bag_id uuid not null references public.training_bags(id) on delete cascade,
  page_number integer not null default 1,
  chunk_index integer not null default 0,
  section_title text,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create policy "admins manage chunks" on public.document_chunks for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create index document_chunks_bag_idx on public.document_chunks(bag_id);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);
create index document_chunks_content_idx on public.document_chunks
  using gin (to_tsvector('simple', content));

create table public.question_history (
  id uuid primary key default gen_random_uuid(),
  question_text text,
  question_type text,
  image_url text,
  detected_options jsonb,
  selected_answer text,
  answer_text text,
  source_file text,
  source_page integer,
  confidence numeric,
  processing_time integer,
  created_at timestamptz not null default now()
);
grant all on public.question_history to service_role;
grant select on public.question_history to authenticated;
alter table public.question_history enable row level security;
create policy "admins read history" on public.question_history for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  bag_filter uuid default null
)
returns table (
  id uuid, bag_id uuid, bag_title text, page_number integer,
  section_title text, content text, similarity double precision
)
language sql stable security definer set search_path = public as $$
  select c.id, c.bag_id, b.title_ar, c.page_number, c.section_title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.training_bags b on b.id = c.bag_id
  where b.status = 'ready'
    and c.embedding is not null
    and (bag_filter is null or c.bag_id = bag_filter)
  order by c.embedding <=> query_embedding
  limit match_count
$$;

create or replace function public.keyword_chunks(
  query_text text,
  match_count integer default 8
)
returns table (
  id uuid, bag_id uuid, bag_title text, page_number integer,
  section_title text, content text, rank double precision
)
language sql stable security definer set search_path = public as $$
  select c.id, c.bag_id, b.title_ar, c.page_number, c.section_title, c.content,
         ts_rank(to_tsvector('simple', c.content), websearch_to_tsquery('simple', query_text))::double precision
  from public.document_chunks c
  join public.training_bags b on b.id = c.bag_id
  where b.status = 'ready'
    and to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', query_text)
  order by 7 desc
  limit match_count
$$;