-- TaskMS V3: auditable, transactional task time tracking; preserves existing data.
create table if not exists public.task_timers (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.business_units(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  state text not null default 'ready' check(state in ('ready','running','paused','stopped')),
  elapsed_seconds bigint not null default 0 check (elapsed_seconds>=0),
  started_at timestamptz,
  last_resumed_at timestamptz,
  ended_at timestamptz,
  estimate_minutes integer not null default 0 check(estimate_minutes between 0 and 100000),
  updated_at timestamptz not null default now(),
  unique(task_id,user_id),
  check((state='running' and last_resumed_at is not null) or (state<>'running' and last_resumed_at is null))
);
create unique index if not exists only_one_running_timer_per_user on public.task_timers(user_id) where state='running';
create index if not exists timer_unit_state_idx on public.task_timers(unit_id,state);
create index if not exists timer_task_idx on public.task_timers(task_id);
create index if not exists timer_user_idx on public.task_timers(user_id);

create table if not exists public.task_timer_events (
 id uuid primary key default gen_random_uuid(),
 timer_id uuid not null references public.task_timers(id) on delete cascade,
 task_id uuid not null references public.tasks(id),
 unit_id uuid not null references public.business_units(id),
 user_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 event_type text not null check(event_type in ('started','paused','resumed','stopped')),
 reason text,
 seconds_total bigint not null default 0,
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
create index if not exists timer_events_task_created_idx on public.task_timer_events(task_id,created_at desc);

create table if not exists public.task_time_reviews (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.tasks(id),
 user_id uuid not null references public.profiles(id),
 reviewer_id uuid not null references public.profiles(id),
 logged_seconds bigint not null,
 verified_seconds bigint not null,
 remarks text,
 reviewed_at timestamptz not null default now()
);
create index if not exists timer_reviews_task_idx on public.task_time_reviews(task_id,reviewed_at desc);

alter table public.task_timers enable row level security;
alter table public.task_timer_events enable row level security;
alter table public.task_time_reviews enable row level security;
drop policy if exists timer_read on public.task_timers;
create policy timer_read on public.task_timers for select to authenticated using(private.can_access_task(task_id));
drop policy if exists timer_events_read on public.task_timer_events;
create policy timer_events_read on public.task_timer_events for select to authenticated using(private.can_access_task(task_id));
drop policy if exists timer_reviews_read on public.task_time_reviews;
create policy timer_reviews_read on public.task_time_reviews for select to authenticated using(private.can_access_task(task_id));
revoke all on public.task_timers,public.task_timer_events,public.task_time_reviews from anon;
revoke insert,update,delete on public.task_timers,public.task_timer_events,public.task_time_reviews from authenticated;
grant select on public.task_timers,public.task_timer_events,public.task_time_reviews to authenticated;

-- Only backend service_role can mutate timer state. The Edge API also authenticates
-- actor and performs role/unit checks before calling this atomic database transition.
create or replace function public.taskms_timer_transition(
 p_task_id uuid, p_user_id uuid, p_actor_id uuid, p_action text,
 p_reason text default null, p_request_id uuid default null
) returns public.task_timers
language plpgsql security definer set search_path = ''
as $$
declare
 t public.tasks%rowtype;
 u public.profiles%rowtype;
 r public.task_timers%rowtype;
 stamp timestamptz:=clock_timestamp();
 seconds bigint;
 rid uuid:=coalesce(p_request_id,gen_random_uuid());
 old_event public.task_timer_events%rowtype;
begin
 if p_action not in ('start','pause','resume','stop') then raise exception 'Invalid timer action';end if;
 select * into t from public.tasks where id=p_task_id for update;
 if not found then raise exception 'Task not found';end if;
 if t.status in ('Cancelled','Completed','Review') then raise exception 'Timer cannot change while task is %',t.status;end if;
 -- Serialize starts/resumes across every task for the same person.
 select * into u from public.profiles where id=p_user_id and status='Active' for update;
 if not found then raise exception 'Staff account is inactive or missing';end if;
 if not exists(select 1 from public.task_assignees where task_id=p_task_id and user_id=p_user_id) then raise exception 'Staff is not assigned to this task';end if;
 select * into old_event from public.task_timer_events where request_id=rid;
 if found then
   if old_event.task_id<>p_task_id or old_event.user_id<>p_user_id or old_event.event_type<>(case p_action when 'start' then 'started' when 'pause' then 'paused' when 'resume' then 'resumed' else 'stopped' end) then raise exception 'Request identifier was reused'; end if;
   select * into r from public.task_timers where id=old_event.timer_id;
   return r;
 end if;
 select * into r from public.task_timers where task_id=p_task_id and user_id=p_user_id for update;
 if p_action='start' then
   if r.id is not null and r.state not in ('ready','stopped') then raise exception 'Timer has already started; use Resume if paused'; end if;
   if exists(select 1 from public.task_timers where user_id=p_user_id and state='running') then raise exception 'This staff member already has a running timer';end if;
   if r.id is null then
    insert into public.task_timers(unit_id,task_id,user_id,state,started_at,last_resumed_at,updated_at,estimate_minutes)
    values(t.unit_id,p_task_id,p_user_id,'running',stamp,stamp,stamp,t.estimated_minutes) returning * into r;
   else
    update public.task_timers set state='running',started_at=coalesce(started_at,stamp),last_resumed_at=stamp,ended_at=null,estimate_minutes=t.estimated_minutes,updated_at=stamp where id=r.id returning * into r;
   end if;
   if t.status in ('Assigned','Waiting','On Hold') then
     update public.tasks set status='In Progress' where id=t.id;
   end if;
 elsif p_action='pause' then
   if r.id is null or r.state<>'running' then raise exception 'Timer is not running';end if;
   seconds:=greatest(0,floor(extract(epoch from stamp-r.last_resumed_at))::bigint);
   update public.task_timers set elapsed_seconds=elapsed_seconds+seconds,state='paused',last_resumed_at=null,updated_at=stamp where id=r.id returning * into r;
 elsif p_action='resume' then
   if r.id is null or r.state<>'paused' then raise exception 'Timer is not paused';end if;
   if exists(select 1 from public.task_timers where user_id=p_user_id and state='running') then raise exception 'This staff member already has a running timer';end if;
   update public.task_timers set state='running',last_resumed_at=stamp,updated_at=stamp where id=r.id returning * into r;
 elsif p_action='stop' then
   if r.id is null or r.state not in ('paused','running') then raise exception 'Timer is not active';end if;
   seconds:=case when r.state='running' then greatest(0,floor(extract(epoch from stamp-r.last_resumed_at))::bigint) else 0 end;
   update public.task_timers set elapsed_seconds=elapsed_seconds+seconds,state='stopped',last_resumed_at=null,ended_at=stamp,updated_at=stamp where id=r.id returning * into r;
 end if;
 insert into public.task_timer_events(timer_id,task_id,unit_id,user_id,actor_id,event_type,reason,seconds_total,request_id)
 values(r.id,p_task_id,t.unit_id,p_user_id,p_actor_id,
 case p_action when 'start' then 'started' when 'pause' then 'paused' when 'resume' then 'resumed' else 'stopped' end,
 nullif(left(coalesce(p_reason,''),500),''),r.elapsed_seconds,rid);
 insert into public.task_timeline(task_id,actor_id,entry_type,description,visibility)
 values(p_task_id,p_actor_id,'Timer '||initcap(p_action),'Work timer '||p_action||' for staff '||u.full_name||coalesce(' · '||nullif(left(p_reason,150),''),''),'Team');
 return r;
end;
$$;
revoke all on function public.taskms_timer_transition(uuid,uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.taskms_timer_transition(uuid,uuid,uuid,text,text,uuid) to service_role;

-- Atomic stop of all running/paused timers when a task is submitted for review.
create or replace function public.taskms_stop_task_timers(p_task_id uuid,p_actor_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer; stamp timestamptz:=clock_timestamp();
begin
 perform 1 from public.tasks where id=p_task_id for update;
 with halted as (
  update public.task_timers r set state='stopped',
    elapsed_seconds=r.elapsed_seconds + case when r.state='running' then greatest(0,floor(extract(epoch from stamp-r.last_resumed_at))::bigint) else 0 end,
    last_resumed_at=null,ended_at=stamp,updated_at=stamp
  where task_id=p_task_id and state in ('running','paused')
  returning r.*
 )
 insert into public.task_timer_events(timer_id,task_id,unit_id,user_id,actor_id,event_type,reason,seconds_total,request_id)
 select id,task_id,unit_id,user_id,p_actor_id,'stopped','Submitted for review',elapsed_seconds,gen_random_uuid() from halted;
 get diagnostics n = row_count;
 return n;
end;
$$;
revoke all on function public.taskms_stop_task_timers(uuid,uuid) from public, anon, authenticated;
grant execute on function public.taskms_stop_task_timers(uuid,uuid) to service_role;

alter table public.tasks add column if not exists estimated_minutes integer not null default 0 check(estimated_minutes between 0 and 100000);

-- Allow an authorized manager to restart a previously stopped timer on a returned task.
create or replace function public.taskms_submit_for_review(p_task_id uuid,p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id=p_task_id for update;
  if not found or t.status<>'In Progress' then raise exception 'Task must be In Progress to submit'; end if;
  perform public.taskms_stop_task_timers(p_task_id,p_actor_id);
  update public.tasks set status='Review' where id=p_task_id;
  insert into public.task_timeline(task_id,actor_id,entry_type,description,visibility)
  values(p_task_id,p_actor_id,'Submitted for Review','Work completed; all active timers stopped','Team');
  return true;
end;
$$;
revoke all on function public.taskms_submit_for_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.taskms_submit_for_review(uuid,uuid) to service_role;