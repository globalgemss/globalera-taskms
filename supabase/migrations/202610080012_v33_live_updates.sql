-- Realtime notification for manually published achievements and note activity.
do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='work_achievements') then
   alter publication supabase_realtime add table public.work_achievements;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='task_notes') then
   alter publication supabase_realtime add table public.task_notes;
 end if;
end $$;