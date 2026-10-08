-- Enable authenticated real-time invalidation for timer changes; read visibility remains RLS-scoped.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='task_timers') then
   alter publication supabase_realtime add table public.task_timers;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='task_timer_events') then
   alter publication supabase_realtime add table public.task_timer_events;
 end if;
end;
$$;