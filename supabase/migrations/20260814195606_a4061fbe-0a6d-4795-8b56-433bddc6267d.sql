create policy "admins read pdfs" on storage.objects for select to authenticated
  using (bucket_id = 'training-pdfs' and public.has_role(auth.uid(),'admin'));
create policy "admins upload pdfs" on storage.objects for insert to authenticated
  with check (bucket_id = 'training-pdfs' and public.has_role(auth.uid(),'admin'));
create policy "admins delete pdfs" on storage.objects for delete to authenticated
  using (bucket_id = 'training-pdfs' and public.has_role(auth.uid(),'admin'));