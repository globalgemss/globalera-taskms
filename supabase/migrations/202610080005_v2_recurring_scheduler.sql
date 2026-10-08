-- V2 scheduling. The scheduler executes DB-side, avoiding public automation endpoints.
create extension if not exists pg_cron;
create or replace function private.generate_recurring_tasks()
returns integer language plpgsql security definer set search_path='' as $$
declare
 r record; job uuid; created_task uuid; total integer:=0;
 today_nepal date:=(now() at time zone 'Asia/Kathmandu')::date;
 next_date date;
begin
 for r in select * from public.recurring_rules where active and next_run<=today_nepal order by next_run for update skip locked loop
  -- Do not assign work to inactive users or former unit members.
  if not exists(select 1 from public.profiles p join public.unit_memberships m on m.user_id=p.id
   where p.id=r.assignee_id and p.status='Active' and m.unit_id=r.unit_id and m.status='Active') then
   continue;
  end if;
  job:=null;
  insert into public.automation_runs(rule_id,run_date,status) values(r.id,r.next_run,'Pending')
  on conflict(rule_id,run_date) do nothing returning id into job;
  if job is null then continue; end if;
  insert into public.tasks(title,description,unit_id,priority,created_by,supervisor_id,status,due_date)
  values(r.title,r.description,r.unit_id,r.priority,r.created_by,r.created_by,'Assigned',r.next_run)
  returning id into created_task;
  insert into public.task_assignees(task_id,user_id,assigned_by)values(created_task,r.assignee_id,r.created_by);
  insert into public.task_timeline(task_id,entry_type,description,actor_id)
  values(created_task,'Recurring Task Created','Created by scheduled recurring rule',r.created_by);
  insert into public.notifications(user_id,title,body,kind,task_id)
  values(r.assignee_id,'Recurring task assigned',r.title,'task',created_task);
  if r.frequency='Daily' then next_date:=r.next_run+1;
  elsif r.frequency='Weekly' then next_date:=r.next_run+7;
  else
   -- Last-day-safe monthly recurrence.
   next_date:=(date_trunc('month',r.next_run::timestamp)+interval '1 month')::date +
    least(extract(day from r.next_run)::int,
      extract(day from (date_trunc('month',r.next_run::timestamp)+interval '2 months' -interval '1 day'))::int)::int-1;
  end if;
  update public.recurring_rules set next_run=next_date,last_run=r.next_run where id=r.id;
  update public.automation_runs set status='Created',task_id=created_task where id=job;
  total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function private.generate_recurring_tasks() from public,anon,authenticated;
-- Daily 01:00 UTC (06:45 Nepal); PostgreSQL cron uses the DB server time zone.
select cron.schedule('globalera-taskms-recurring-daily','0 1 * * *',
 'select private.generate_recurring_tasks();');