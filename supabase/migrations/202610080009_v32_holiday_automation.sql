-- V3.2 holidays and published work-plan notification summaries.
alter table public.recurring_rules add column if not exists holiday_behavior text not null default 'Next Working Day'
 check(holiday_behavior in ('Next Working Day','Skip'));

-- Replace V2 generator, avoiding creation of routine work on closed days.
create or replace function private.generate_recurring_tasks()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; job uuid; task_uuid uuid; total integer:=0;
 today_nepal date:=(now() at time zone 'Asia/Kathmandu')::date; next_date date; is_off boolean;
begin
 for r in select * from public.recurring_rules where active and next_run<=today_nepal order by next_run for update skip locked loop
  if not exists(select 1 from public.profiles p join public.unit_memberships m on m.user_id=p.id
   where p.id=r.assignee_id and p.status='Active' and m.unit_id=r.unit_id and m.status='Active') then continue;end if;
  is_off:=private.taskms_is_holiday(r.unit_id,r.next_run);
  -- Next Working Day defers the due occurrence without generating a task.
  if is_off and r.holiday_behavior='Next Working Day' then
    update public.recurring_rules set next_run=r.next_run+1 where id=r.id;
    continue;
  end if;
  if r.frequency='Daily' then next_date:=r.next_run+1;
  elsif r.frequency='Weekly' then next_date:=r.next_run+7;
  else
   next_date:=(date_trunc('month',r.next_run::timestamp)+interval '1 month')::date +
    least(extract(day from r.next_run)::integer,
     extract(day from (date_trunc('month',r.next_run::timestamp)+interval '2 months' -interval '1 day'))::integer)-1;
  end if;
  job:=null;
  insert into public.automation_runs(rule_id,run_date,status)
  values(r.id,r.next_run,case when is_off then 'Skipped Holiday' else 'Pending' end)
  on conflict(rule_id,run_date) do nothing returning id into job;
  if job is null then
   update public.recurring_rules set next_run=next_date where id=r.id;
   continue;
  end if;
  if not is_off then
   insert into public.tasks(title,description,unit_id,priority,created_by,supervisor_id,status,due_date)
   values(r.title,r.description,r.unit_id,r.priority,r.created_by,r.created_by,'Assigned',r.next_run)
   returning id into task_uuid;
   insert into public.task_assignees(task_id,user_id,assigned_by) values(task_uuid,r.assignee_id,r.created_by);
   insert into public.task_timeline(task_id,actor_id,entry_type,description)
   values(task_uuid,r.created_by,'Recurring Task Created','Scheduled and assigned by automation');
   insert into public.notifications(user_id,title,body,kind,task_id)
   values(r.assignee_id,'Recurring task assigned',r.title,'task',task_uuid);
   update public.automation_runs set status='Created',task_id=task_uuid where id=job;
   total:=total+1;
  end if;
  update public.recurring_rules set next_run=next_date,last_run=r.next_run where id=r.id;
 end loop;
 return total;
end;$$;
revoke all on function private.generate_recurring_tasks() from public,anon,authenticated;

create table if not exists public.work_period_snapshots(
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.business_units(id),
 plan_id uuid not null references public.work_plans(id),
 period_type text not null check(period_type in ('Daily','Weekly','Monthly')),
 period_end date not null,
 planned_count integer not null,
 completed_count integer not null,
 review_count integer not null,
 incomplete_count integer not null,
 created_at timestamptz not null default now(),
 unique(plan_id,period_end)
);
alter table public.work_period_snapshots enable row level security;
create policy work_period_snapshots_read on public.work_period_snapshots for select to authenticated using(private.can_manage_unit(unit_id));
revoke all on public.work_period_snapshots from anon;
revoke insert,update,delete on public.work_period_snapshots from authenticated;
grant select on public.work_period_snapshots to authenticated;

create or replace function private.taskms_close_work_period(p_type text)
returns integer language plpgsql security definer set search_path='' as $$
declare p record; m record; t record; today_nepal date:=(now() at time zone 'Asia/Kathmandu')::date; planned integer;done integer;reviewing integer;sent integer:=0; key text;
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
revoke all on function private.taskms_close_work_period(text) from public,anon,authenticated;
-- Every evening 17:00 Nepal time. Weekly/monthly plans close at their chosen period end.
select cron.schedule('globalera-taskms-planning-summaries','15 11 * * *',
 $$select private.taskms_close_work_period('Daily'); select private.taskms_close_work_period('Weekly'); select private.taskms_close_work_period('Monthly');$$);

create or replace function public.taskms_run_due_recurring_rules() returns integer
language sql security definer set search_path='' as $$select private.generate_recurring_tasks();$$;
revoke all on function public.taskms_run_due_recurring_rules() from public,anon,authenticated;
grant execute on function public.taskms_run_due_recurring_rules() to service_role;