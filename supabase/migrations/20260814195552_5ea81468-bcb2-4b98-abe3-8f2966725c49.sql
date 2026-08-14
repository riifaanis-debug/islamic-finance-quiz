revoke all on function public.match_chunks(vector,integer,uuid) from anon, authenticated, public;
revoke all on function public.keyword_chunks(text,integer) from anon, authenticated, public;
grant execute on function public.match_chunks(vector,integer,uuid) to service_role;
grant execute on function public.keyword_chunks(text,integer) to service_role;
revoke all on function public.has_role(uuid, public.app_role) from anon, public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;