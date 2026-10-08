-- Fix ambiguous PL/pgSQL record variable in snapshot generator.
create or replace function private.taskms_close_work_period(p_type text)
returns integer language plpgsql security definer set search_path='' as $$
declare p record; m record; today_nepal date:=(now() at time zone 'Asia/Kathmandu')::date; planned integer;done integer;reviewing integer;sent integer:=0; key text;
begin
 if p_type not in ('Daily','Weekly','Monthly') then raise exception 'Invalid period';end if;
 for p in select * from public.work_plans where status='Published' and period_type=p_type and period_end<=today_nepal loop
  if exists(select 1 from public.work_period_snapshots where plan_id=p.id and period_end=p.period_end) then continue;end if;
  select count(*)::integer,count(*) filter(where t.status='Completed')::integer,count(*) filter(where t.status='Review')::integer
   into planned,done,reviewing
   from public.work_plan_items i join public.tasks t on t.id=i.task_id where i.plan_id=p.id;
  insert into public.work_period_snapshots(unit_id,plan_id,period_type,period_end,planned_count,completed_count,review_count,incomplete_count)
  values(p.unit_id,p.id,p.period_type,p.period_end,planned,done,reviewing,planned-done)
  on conflict(plan_id,period_end) do nothing;
  for m in select user_id from public.unit_memberships where unit_id=p.unit_id and status='Active' and role in ('manager','unit_admin') loop
   key:='period-summary:'||p.id::text||':'||m.user_id::text;
   insert into public.automation_dispatches(event_key,unit_id,event_type,target_user_id)
    values(key,p.unit_id,'plan-summary',m.user_id) on conflict do nothing;
   if found then
    insert into public.notifications(user_id,title,body,kind)
    values(m.user_id,p.period_type||' work plan summary',p.title||': '||done||'/'||planned||' approved; '||reviewing||' in review.','system');
    sent:=sent+1;
   end if;
  end loop;
 end loop;
 return sent;
end;$$;