-- V3.2: unit-scoped planning, Nepal work calendars, dual clocks and break history.
-- Additive migration: no existing tasks, staff timers or business units are removed.
create table if not exists public.working_calendars (
 unit_id uuid primary key references public.business_units(id) on delete restrict,
 weekly_off integer[] not null default array[6]::integer[],
 timezone text not null default 'Asia/Kathmandu',
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 check(weekly_off <@ array[0,1,2,3,4,5,6]::integer[])
);
insert into public.working_calendars(unit_id) select id from public.business_units on conflict(unit_id) do nothing;
create table if not exists public.work_holidays (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.business_units(id),
 title text not null check(length(trim(title)) between 2 and 180),
 start_date date not null, end_date date not null,
 notes text, active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check(end_date >= start_date), check(end_date-start_date <= 366)
);
create index if not exists work_holidays_unit_dates on public.work_holidays(unit_id,start_date,end_date);
create table if not exists public.holiday_work_authorizations (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.business_units(id),
 task_id uuid not null references public.tasks(id),
 user_id uuid not null references public.profiles(id),
 work_date date not null,
 reason text not null,
 authorized_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(task_id,user_id,work_date)
);
create index if not exists holiday_work_authorizations_unit_date on public.holiday_work_authorizations(unit_id,work_date);

-- A calendar-elapsed clock is independent from per-staff active-work timers.
create table if not exists public.task_elapsed_clocks (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.business_units(id),
 task_id uuid not null references public.tasks(id),
 cycle integer not null default 1 check(cycle>=1),
 started_at timestamptz not null default clock_timestamp(),
 stopped_at timestamptz,
 stop_reason text,
 unique(task_id,cycle)
);
create unique index if not exists one_open_elapsed_clock_per_task on public.task_elapsed_clocks(task_id) where stopped_at is null;
create index if not exists task_elapsed_clock_unit on public.task_elapsed_clocks(unit_id,started_at desc);
create table if not exists public.staff_break_intervals (
 id uuid primary key default gen_random_uuid(),
 timer_id uuid not null references public.task_timers(id),
 task_id uuid not null references public.tasks(id),
 unit_id uuid not null references public.business_units(id),
 user_id uuid not null references public.profiles(id),
 started_at timestamptz not null,
 ended_at timestamptz,
 reason text not null default 'Break',
 check(ended_at is null or ended_at >= started_at)
);
create unique index if not exists one_open_break_per_timer on public.staff_break_intervals(timer_id) where ended_at is null;
create index if not exists staff_break_intervals_task on public.staff_break_intervals(task_id,started_at desc);

create table if not exists public.work_plans (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.business_units(id),
 title text not null check(length(trim(title)) between 2 and 180),
 period_type text not null check(period_type in ('Daily','Weekly','Monthly')),
 period_start date not null, period_end date not null,
 status text not null default 'Draft' check(status in ('Draft','Published','Archived')),
 description text, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(period_end>=period_start), check(period_end-period_start<=32)
);
create index if not exists work_plans_unit_dates on public.work_plans(unit_id,period_type,period_start desc);
create table if not exists public.work_plan_items (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.work_plans(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete restrict,
 planned_date date not null,
 planned_minutes integer not null default 0 check(planned_minutes between 0 and 100000),
 target_outcome text,
 carried_from_id uuid references public.work_plan_items(id),
 created_at timestamptz not null default now(),
 unique(plan_id,task_id)
);
create index if not exists work_plan_items_task on public.work_plan_items(task_id);
create table if not exists public.work_plan_revisions (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.work_plans(id),
 item_id uuid references public.work_plan_items(id),
 changed_by uuid not null references public.profiles(id),
 description text not null,
 changed_at timestamptz not null default now()
);
create table if not exists public.automation_dispatches (
 event_key text primary key,
 unit_id uuid not null references public.business_units(id),
 event_type text not null,
 target_user_id uuid references public.profiles(id),
 task_id uuid references public.tasks(id),
 status text not null default 'Sent',
 created_at timestamptz not null default now()
);

-- Helpers for weekday and manual closures; default Saturday off even if a unit calendar was not created.
create or replace function private.taskms_is_holiday(p_unit uuid,p_day date)
returns boolean language sql stable security definer set search_path='' as $$
 select extract(dow from p_day)::integer = any(coalesce((select weekly_off from public.working_calendars where unit_id=p_unit), array[6]::integer[]))
 or exists(select 1 from public.work_holidays h where h.unit_id=p_unit and h.active and p_day between h.start_date and h.end_date);
$$;
revoke all on function private.taskms_is_holiday(uuid,date) from public,anon,authenticated;

-- Auto-start elapsed clock when the first person is assigned, including recurring tasks.
create or replace function private.taskms_open_task_clock()
returns trigger language plpgsql security definer set search_path='' as $$
declare t record;
begin
 select id,unit_id,status,created_at into t from public.tasks where id=new.task_id;
 if t.status not in ('Completed','Cancelled') and not exists(select 1 from public.task_elapsed_clocks c where c.task_id=new.task_id and c.stopped_at is null) then
  insert into public.task_elapsed_clocks(task_id,unit_id,cycle,started_at)
  values(new.task_id,t.unit_id,coalesce((select max(cycle)+1 from public.task_elapsed_clocks where task_id=new.task_id),1),clock_timestamp());
 end if;
 return new;
end;$$;
drop trigger if exists taskms_open_clock_on_assignee on public.task_assignees;
create trigger taskms_open_clock_on_assignee after insert on public.task_assignees
for each row execute function private.taskms_open_task_clock();

-- Completed/Cancelled stops elapsed clock; reopen starts a fresh measured cycle.
create or replace function private.taskms_elapsed_clock_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('Completed','Cancelled') and old.status is distinct from new.status then
  update public.task_elapsed_clocks set stopped_at=coalesce(new.completed_at,clock_timestamp()),stop_reason=new.status
   where task_id=new.id and stopped_at is null;
 elsif old.status in ('Completed','Cancelled') and new.status not in ('Completed','Cancelled') then
  insert into public.task_elapsed_clocks(task_id,unit_id,cycle,started_at)
  values(new.id,new.unit_id,coalesce((select max(cycle)+1 from public.task_elapsed_clocks where task_id=new.id),1),clock_timestamp());
 end if;
 return new;
end;$$;
drop trigger if exists taskms_elapsed_clock_status_trigger on public.tasks;
create trigger taskms_elapsed_clock_status_trigger after update of status on public.tasks
for each row execute function private.taskms_elapsed_clock_status();
-- Existing active tasks: start at original assignment/task creation timestamp; no task is changed.
insert into public.task_elapsed_clocks(task_id,unit_id,cycle,started_at,stopped_at,stop_reason)
select t.id,t.unit_id,1,t.created_at,
 case when t.status in ('Completed','Cancelled') then coalesce(t.completed_at,t.updated_at) end,
 case when t.status in ('Completed','Cancelled') then t.status end
from public.tasks t where exists(select 1 from public.task_assignees a where a.task_id=t.id)
 and not exists(select 1 from public.task_elapsed_clocks c where c.task_id=t.id);

-- Track breaks as intervals without changing the existing staff work-timer contract.
create or replace function private.taskms_capture_break()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='paused' then
  insert into public.staff_break_intervals(timer_id,task_id,unit_id,user_id,started_at,reason)
  values(new.timer_id,new.task_id,new.unit_id,new.user_id,new.created_at,coalesce(nullif(new.reason,''),'Break'))
  on conflict do nothing;
 elsif new.event_type in ('resumed','stopped') then
  update public.staff_break_intervals set ended_at=new.created_at where timer_id=new.timer_id and ended_at is null;
 end if;
 return new;
end;$$;
drop trigger if exists taskms_break_event_trigger on public.task_timer_events;
create trigger taskms_break_event_trigger after insert on public.task_timer_events
for each row execute function private.taskms_capture_break();
-- Recover any pauses created by the previous V3 (no duplicate rows).
insert into public.staff_break_intervals(timer_id,task_id,unit_id,user_id,started_at,ended_at,reason)
select e.timer_id,e.task_id,e.unit_id,e.user_id,e.created_at,
 (select min(e2.created_at) from public.task_timer_events e2 where e2.timer_id=e.timer_id and e2.created_at>e.created_at and e2.event_type in ('resumed','stopped')),
 coalesce(nullif(e.reason,''),'Break')
from public.task_timer_events e where e.event_type='paused'
 and not exists(select 1 from public.staff_break_intervals b where b.timer_id=e.timer_id and b.started_at=e.created_at);

-- Replace V3 transition function while preserving the RPC signature and idempotency.
-- Staff may start their own work; API verifies authority and holiday authorization.
create or replace function public.taskms_timer_transition(
 p_task_id uuid,p_user_id uuid,p_actor_id uuid,p_action text,p_reason text default null,p_request_id uuid default null
) returns public.task_timers language plpgsql security definer set search_path='' as $$
declare
 t public.tasks%rowtype; u public.profiles%rowtype; r public.task_timers%rowtype;
 stamp timestamptz:=clock_timestamp(); secs bigint; rid uuid:=coalesce(p_request_id,gen_random_uuid());
 old_event public.task_timer_events%rowtype; event_text text;
begin
 if p_action not in ('start','pause','resume','stop') then raise exception 'Invalid timer action';end if;
 select * into t from public.tasks where id=p_task_id for update;
 if not found then raise exception 'Task not found';end if;
 if t.status in ('Cancelled','Completed','Review') then raise exception 'Timer cannot change while task is %',t.status;end if;
 select * into u from public.profiles where id=p_user_id and status='Active' for update;
 if not found then raise exception 'Staff inactive or missing';end if;
 if not exists(select 1 from public.task_assignees where task_id=p_task_id and user_id=p_user_id) then raise exception 'Staff is not assigned';end if;
 event_text:=case p_action when 'start' then 'started' when 'pause' then 'paused' when 'resume' then 'resumed' else 'stopped' end;
 select * into old_event from public.task_timer_events where request_id=rid;
 if found then
  if old_event.task_id<>p_task_id or old_event.user_id<>p_user_id or old_event.event_type<>event_text then raise exception 'Request identifier reused';end if;
  select * into r from public.task_timers where id=old_event.timer_id;
  return r;
 end if;
 if p_action in ('start','resume') and private.taskms_is_holiday(t.unit_id,(stamp at time zone 'Asia/Kathmandu')::date) and
 not exists(select 1 from public.holiday_work_authorizations a where a.task_id=p_task_id and a.user_id=p_user_id and a.work_date=(stamp at time zone 'Asia/Kathmandu')::date) then
   raise exception 'Holiday work must be approved before starting or resuming';
 end if;
 select * into r from public.task_timers where task_id=p_task_id and user_id=p_user_id for update;
 if p_action='start' then
  if r.id is not null and r.state not in ('ready','stopped') then raise exception 'Timer already started; resume if paused';end if;
  if exists(select 1 from public.task_timers where user_id=p_user_id and state='running') then raise exception 'Another work timer is running';end if;
  if r.id is null then
   insert into public.task_timers(unit_id,task_id,user_id,state,started_at,last_resumed_at,updated_at,estimate_minutes)
   values(t.unit_id,p_task_id,p_user_id,'running',stamp,stamp,stamp,t.estimated_minutes) returning * into r;
  else
   update public.task_timers set state='running',started_at=coalesce(started_at,stamp),last_resumed_at=stamp,ended_at=null,estimate_minutes=t.estimated_minutes,updated_at=stamp where id=r.id returning * into r;
  end if;
  if t.status in ('Assigned','Waiting','On Hold') then update public.tasks set status='In Progress' where id=t.id;end if;
 elsif p_action='pause' then
  if r.id is null or r.state<>'running' then raise exception 'Timer not running';end if;
  secs:=greatest(0,floor(extract(epoch from stamp-r.last_resumed_at))::bigint);
  update public.task_timers set elapsed_seconds=elapsed_seconds+secs,state='paused',last_resumed_at=null,updated_at=stamp where id=r.id returning * into r;
 elsif p_action='resume' then
  if r.id is null or r.state<>'paused' then raise exception 'Timer not paused';end if;
  if exists(select 1 from public.task_timers where user_id=p_user_id and state='running') then raise exception 'Another work timer is running';end if;
  update public.task_timers set state='running',last_resumed_at=stamp,updated_at=stamp where id=r.id returning * into r;
 elsif p_action='stop' then
  if r.id is null or r.state not in ('paused','running') then raise exception 'Timer not active';end if;
  secs:=case when r.state='running' then greatest(0,floor(extract(epoch from stamp-r.last_resumed_at))::bigint) else 0 end;
  update public.task_timers set elapsed_seconds=elapsed_seconds+secs,state='stopped',last_resumed_at=null,ended_at=stamp,updated_at=stamp where id=r.id returning * into r;
 end if;
 insert into public.task_timer_events(timer_id,task_id,unit_id,user_id,actor_id,event_type,reason,seconds_total,request_id)
 values(r.id,p_task_id,t.unit_id,p_user_id,p_actor_id,event_text,nullif(left(coalesce(p_reason,''),500),''),r.elapsed_seconds,rid);
 insert into public.task_timeline(task_id,actor_id,entry_type,description,visibility)
 values(p_task_id,p_actor_id,'Timer '||initcap(p_action),'Work timer '||p_action||' for staff '||u.full_name||coalesce(' · '||nullif(left(coalesce(p_reason,''),150),''),''),'Team');
 return r;
end;$$;
revoke all on function public.taskms_timer_transition(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.taskms_timer_transition(uuid,uuid,uuid,text,text,uuid) to service_role;

-- Holiday-aware calendar cutoff of running work sessions; clock still runs.
-- Called every 15 minutes, limits billed working time crossing midnight without authorization.
create or replace function private.taskms_pause_unapproved_holiday_work()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; stamp timestamptz:=clock_timestamp(); n integer:=0; cutoff timestamptz; secs bigint;
begin
 for r in select tm.* from public.task_timers tm where tm.state='running' for update skip locked loop
  if private.taskms_is_holiday(r.unit_id,(stamp at time zone 'Asia/Kathmandu')::date)
   and not exists(select 1 from public.holiday_work_authorizations a where a.task_id=r.task_id and a.user_id=r.user_id and a.work_date=(stamp at time zone 'Asia/Kathmandu')::date) then
    cutoff:=((stamp at time zone 'Asia/Kathmandu')::date::timestamp at time zone 'Asia/Kathmandu');
    -- Keep all time up to the holiday start, but none of the unapproved holiday period.
    secs:=greatest(0,floor(extract(epoch from greatest(r.last_resumed_at,cutoff)-r.last_resumed_at))::bigint);
    update public.task_timers set state='paused',elapsed_seconds=elapsed_seconds+secs,last_resumed_at=null,updated_at=stamp where id=r.id;
    insert into public.task_timer_events(timer_id,task_id,unit_id,user_id,actor_id,event_type,reason,seconds_total,request_id)
     values(r.id,r.task_id,r.unit_id,r.user_id,r.user_id,'paused','Automatic pause: holiday work not authorized',r.elapsed_seconds+secs,gen_random_uuid());
    n:=n+1;
  end if;
 end loop;
 return n;
end;$$;
revoke all on function private.taskms_pause_unapproved_holiday_work() from public,anon,authenticated;

-- Work plans and holiday data are read-only from the browser; mutations use the Edge API.
do $$ declare t text; begin
 foreach t in array array['working_calendars','work_holidays','holiday_work_authorizations','task_elapsed_clocks','staff_break_intervals','work_plans','work_plan_items','work_plan_revisions','automation_dispatches'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy working_calendars_read on public.working_calendars for select to authenticated using(private.is_unit_member(unit_id));
create policy work_holidays_read on public.work_holidays for select to authenticated using(private.is_unit_member(unit_id));
create policy holiday_work_read on public.holiday_work_authorizations for select to authenticated using(private.is_unit_member(unit_id) and (private.can_manage_unit(unit_id) or user_id=auth.uid()));
create policy elapsed_clocks_read on public.task_elapsed_clocks for select to authenticated using(private.can_access_task(task_id));
create policy staff_breaks_read on public.staff_break_intervals for select to authenticated using(private.can_access_task(task_id));
create policy work_plans_read on public.work_plans for select to authenticated using(private.is_unit_member(unit_id));
create policy work_plan_items_read on public.work_plan_items for select to authenticated using(exists(select 1 from public.work_plans p where p.id=plan_id and private.is_unit_member(p.unit_id)));
create policy work_plan_revisions_read on public.work_plan_revisions for select to authenticated using(exists(select 1 from public.work_plans p where p.id=plan_id and private.is_unit_member(p.unit_id)));
create policy automation_dispatches_read on public.automation_dispatches for select to authenticated using(private.can_manage_unit(unit_id));
do $$ declare t text; begin
 foreach t in array array['working_calendars','work_holidays','holiday_work_authorizations','task_elapsed_clocks','staff_break_intervals','work_plans','work_plan_items','work_plan_revisions','automation_dispatches'] loop
  execute format('revoke all on public.%I from anon',t);
  execute format('revoke insert,update,delete on public.%I from authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Hourly idempotent in-app automation: assignments/reviews keep existing event behavior.
-- Deadlines and overdue alerts skip holiday days for routine notices.
create or replace function private.taskms_process_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; today_nepal date:=(now() at time zone 'Asia/Kathmandu')::date; n integer:=0; key text; manager_id uuid;
begin
 for r in select t.* from public.tasks t where t.status not in ('Completed','Cancelled') and t.due_date is not null
 and t.due_date between today_nepal-30 and today_nepal+1 loop
  if private.taskms_is_holiday(r.unit_id,today_nepal) then continue;end if;
  for manager_id in select distinct a.user_id from public.task_assignees a where a.task_id=r.id loop
   key:=r.id::text||':'||manager_id::text||':'||today_nepal::text||':'||case when r.due_date<today_nepal then 'overdue' else 'due' end;
   insert into public.automation_dispatches(event_key,unit_id,event_type,target_user_id,task_id)
    values(key,r.unit_id,case when r.due_date<today_nepal then 'overdue' else 'due' end,manager_id,r.id) on conflict do nothing;
   if found then
    insert into public.notifications(user_id,title,body,kind,task_id)
    values(manager_id,case when r.due_date<today_nepal then 'Overdue task' else 'Task due soon' end,r.title,'task',r.id);
    n:=n+1;
   end if;
  end loop;
  if r.due_date<today_nepal and r.supervisor_id is not null then
   key:=r.id::text||':'||r.supervisor_id::text||':'||today_nepal::text||':manager-overdue';
   insert into public.automation_dispatches(event_key,unit_id,event_type,target_user_id,task_id)
    values(key,r.unit_id,'manager-overdue',r.supervisor_id,r.id) on conflict do nothing;
   if found then
    insert into public.notifications(user_id,title,body,kind,task_id) values(r.supervisor_id,'Team task overdue',r.title,'task',r.id);n:=n+1;
   end if;
  end if;
 end loop;
 return n;
end;$$;
revoke all on function private.taskms_process_reminders() from public,anon,authenticated;
select cron.schedule('globalera-taskms-reminders-hourly','0 * * * *','select private.taskms_process_reminders();');
select cron.schedule('globalera-taskms-holiday-pause','*/15 * * * *','select private.taskms_pause_unapproved_holiday_work();');