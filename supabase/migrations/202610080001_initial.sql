-- Global Era TaskMS V1 · Dedicated Supabase project ONLY. Never apply to RikshaMS.
create extension if not exists pgcrypto;
create schema if not exists private;

create sequence if not exists public.user_code_seq start 1;
create sequence if not exists public.task_code_seq start 1;
create sequence if not exists public.project_code_seq start 1;

create table public.departments (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 status text not null default 'Active' check(status in ('Active','Inactive')),
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 user_code text not null unique default ('USR-' || lpad(nextval('public.user_code_seq')::text,4,'0')),
 full_name text not null default 'New User', email text not null unique,
 phone text, alternate_phone text, designation text,
 department_id uuid references public.departments(id), manager_id uuid references public.profiles(id),
 role text not null default 'staff' check(role in ('admin','manager','staff')),
 token_valid_after bigint not null default 0,
 status text not null default 'Active' check(status in ('Active','Inactive','Suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 manager_id uuid references public.profiles(id), status text not null default 'Active', created_at timestamptz default now()
);
create table public.team_members (
 team_id uuid not null references public.teams(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 primary key(team_id,user_id)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 project_no text not null unique default ('PRJ-' || lpad(nextval('public.project_code_seq')::text,4,'0')),
 name text not null, description text, manager_id uuid references public.profiles(id),
 status text not null default 'Active' check(status in ('Active','On Hold','Completed','Archived')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 task_no text not null unique default ('TSK-' || lpad(nextval('public.task_code_seq')::text,6,'0')),
 title text not null check(length(trim(title)) between 3 and 220),description text,
 client_request_id uuid unique,
 project_id uuid references public.projects(id), category text,
 priority text not null default 'Normal' check(priority in ('Low','Normal','High','Urgent')),
 status text not null default 'New' check(status in ('New','Assigned','In Progress','Waiting','On Hold','Review','Completed','Cancelled')),
 progress integer not null default 0 check(progress between 0 and 100),
 start_date date, due_date date,due_time time,
 estimated_hours numeric(9,2),actual_hours numeric(9,2),
 created_by uuid not null references public.profiles(id), supervisor_id uuid references public.profiles(id),
 completed_at timestamptz,completed_by uuid references public.profiles(id),final_remarks text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint task_dates_order check(start_date is null or due_date is null or start_date <= due_date)
);
create table public.task_assignees (
 task_id uuid not null references public.tasks(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 progress integer not null default 0 check(progress between 0 and 100),
 assigned_by uuid references public.profiles(id),assigned_at timestamptz not null default now(),
 primary key(task_id,user_id)
);
create table public.task_timeline (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id) on delete restrict,
 entry_type text not null,description text not null,actor_id uuid references public.profiles(id),
 visibility text not null default 'Team' check(visibility in ('Team','Admin')),
 created_at timestamptz not null default now()
);
create table public.task_notes (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id) on delete restrict,
 author_id uuid not null references public.profiles(id),body text not null check(length(trim(body))>0),
 visibility text not null default 'Team' check(visibility in ('Team','Admin')),
 created_at timestamptz not null default now()
);
create table public.task_followups (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id) on delete restrict,
 followup_at timestamptz not null,method text not null default 'Call',
 outcome text,remarks text,created_by uuid not null references public.profiles(id),
 completed_at timestamptz,created_at timestamptz not null default now()
);
create table public.task_reviews (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(id),decision text not null check(decision in ('Approved','Returned')),
 remarks text,created_at timestamptz not null default now()
);
create table public.notices (
 id uuid primary key default gen_random_uuid(),title text not null,message text not null,
 priority text not null default 'Normal' check(priority in ('Normal','Important','Urgent')),
 target_type text not null default 'all' check(target_type in ('all','user','department','manager_team')),
 target_user_id uuid references public.profiles(id),
 target_department_id uuid references public.departments(id),target_manager_id uuid references public.profiles(id),
 start_date date,end_date date,is_active boolean not null default true,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 constraint notice_dates_order check(start_date is null or end_date is null or start_date <= end_date)
);
create table public.notice_reads (
 notice_id uuid not null references public.notices(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 read_at timestamptz not null default now(),primary key(notice_id,user_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete restrict,
 title text not null,body text,kind text not null default 'info',task_id uuid references public.tasks(id),
 read_at timestamptz,created_at timestamptz not null default now()
);
create table public.user_timeline (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
 actor_id uuid references public.profiles(id), entry_type text not null, description text not null,
 visibility text not null default 'User' check(visibility in ('User','Admin')),
 created_at timestamptz not null default now()
);
create index on public.user_timeline(user_id,created_at desc);
create table public.user_access_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references public.profiles(id) on delete restrict,
 nonce text not null,token_hash text not null unique,
 pin_salt text not null,pin_hash text not null,
 failures integer not null default 0 check(failures>=0),locked_until timestamptz,
 is_active boolean not null default true,last_used_at timestamptz,updated_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id),
 action text not null,entity_type text not null,entity_id uuid,details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.app_settings (
 key text primary key,value jsonb not null,updated_at timestamptz not null default now()
);

create index on public.profiles(manager_id);
create index on public.profiles(department_id);
create index on public.tasks(status,due_date);
create index on public.tasks(created_at desc);
create index on public.tasks(project_id);
create index on public.tasks(created_by);
create index on public.task_assignees(user_id,task_id);
create index on public.task_timeline(task_id,created_at desc);
create index on public.task_notes(task_id,created_at desc);
create index on public.task_followups(followup_at);
create index on public.notices(is_active,start_date,end_date);
create index on public.notifications(user_id,read_at);
create index on public.audit_logs(created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

-- Auth-created profiles start as STAFF, regardless of submitted metadata.
create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,email,full_name,role,status)
 values(new.id, new.email, coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''),'New User'),'staff','Active')
 on conflict(id) do nothing;
 return new;
end;$$;
create trigger taskms_auth_user_created after insert on auth.users
for each row execute function public.on_auth_user_created();

create or replace function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and status='Active' and coalesce((auth.jwt()->>'iat')::bigint,0)>token_valid_after); $$;
create or replace function private.my_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id=auth.uid() and status='Active' limit 1; $$;
create or replace function private.can_view_user(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and (
   auth.uid()=p_user or private.my_role()='admin' or
   (private.my_role()='manager' and exists(select 1 from public.profiles p where p.id=p_user and p.manager_id=auth.uid()))
 ); $$;
create or replace function private.can_access_task(p_task uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and (
  private.my_role()='admin' or exists(select 1 from public.tasks t where t.id=p_task and (t.created_by=auth.uid() or t.supervisor_id=auth.uid())) or
  exists(select 1 from public.task_assignees a where a.task_id=p_task and a.user_id=auth.uid()) or
  (private.my_role()='manager' and exists(
    select 1 from public.task_assignees a join public.profiles p on p.id=a.user_id
    where a.task_id=p_task and p.manager_id=auth.uid()
  ))
 ); $$;
create or replace function private.can_read_notice(p_notice uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and exists (
  select 1 from public.notices n join public.profiles me on me.id=auth.uid()
  where n.id=p_notice and (private.my_role()='admin' or (
   n.is_active and (n.start_date is null or n.start_date <= (now() at time zone 'Asia/Kathmandu')::date)
   and (n.end_date is null or n.end_date >= (now() at time zone 'Asia/Kathmandu')::date)
   and (n.target_type='all' or (n.target_type='user' and n.target_user_id=auth.uid())
    or (n.target_type='department' and n.target_department_id=me.department_id)
    or (n.target_type='manager_team' and n.target_manager_id=me.manager_id)
    or (n.target_type='manager_team' and n.target_manager_id=auth.uid()))
  ))
 ); $$;

-- RLS is deliberately read-only for ordinary authenticated clients.
-- ALL privileged mutations go through Edge Functions which independently authorize.
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_timeline enable row level security;
alter table public.task_notes enable row level security;
alter table public.task_followups enable row level security;
alter table public.task_reviews enable row level security;
alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.user_access_links enable row level security;
alter table public.user_timeline enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

create policy departments_read on public.departments for select to authenticated using(private.is_active());
create policy profiles_read on public.profiles for select to authenticated using(private.can_view_user(id));
create policy teams_read on public.teams for select to authenticated using(private.is_active());
create policy team_members_read on public.team_members for select to authenticated using(private.my_role()='admin' or user_id=auth.uid() or exists(select 1 from public.teams t where t.id=team_id and t.manager_id=auth.uid()));
create policy projects_read on public.projects for select to authenticated using(private.is_active());
create policy tasks_read on public.tasks for select to authenticated using(private.can_access_task(id));
create policy task_assignees_read on public.task_assignees for select to authenticated using(private.can_access_task(task_id));
create policy timeline_read on public.task_timeline for select to authenticated using(private.can_access_task(task_id) and (visibility='Team' or private.my_role()='admin'));
create policy notes_read on public.task_notes for select to authenticated using(private.can_access_task(task_id) and (visibility='Team' or private.my_role()='admin'));
create policy followups_read on public.task_followups for select to authenticated using(private.can_access_task(task_id));
create policy reviews_read on public.task_reviews for select to authenticated using(private.can_access_task(task_id));
create policy notices_read on public.notices for select to authenticated using(private.can_read_notice(id));
create policy notice_reads_read on public.notice_reads for select to authenticated using(private.my_role()='admin' or user_id=auth.uid());
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy user_timeline_read on public.user_timeline for select to authenticated using(private.can_view_user(user_id) and (visibility='User' or private.my_role()='admin'));
create policy audit_read on public.audit_logs for select to authenticated using(private.my_role()='admin');
create policy settings_read on public.app_settings for select to authenticated using(private.my_role()='admin');

-- Explicitly block public/authenticated direct writes (even if future grants change).
revoke insert,update,delete on all tables in schema public from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.departments,public.profiles,public.teams,public.team_members,
 public.projects,public.tasks,public.task_assignees,public.task_timeline,public.task_notes,
 public.task_followups,public.task_reviews,public.notices,public.notice_reads,
 public.notifications,public.user_timeline,public.audit_logs,public.app_settings to authenticated;
revoke all on public.user_access_links from anon,authenticated;

-- Atomic increment so simultaneous incorrect PIN attempts cannot bypass the per-link lockout.
create or replace function public.record_staff_pin_failure(p_link_id uuid)
returns table(attempts integer,lock_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
 return query update public.user_access_links l
 set failures=l.failures+1,
     locked_until=case when l.failures+1>=5 then now()+interval '15 minutes' else l.locked_until end,
     updated_at=now()
 where l.id=p_link_id
 returning l.failures,l.locked_until;
end; $$;
revoke all on function public.record_staff_pin_failure(uuid) from public,anon,authenticated;
grant execute on function public.record_staff_pin_failure(uuid) to service_role;

-- Realtime: private broadcast architecture can be deployed later via DB webhooks.
-- V1 uses auth-restricted postgres_changes with RLS; require explicit publication setup.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   alter publication supabase_realtime add table public.tasks,public.notices,public.notifications;
 end if;
exception when duplicate_object then null;
end $$;

comment on schema private is 'Security-definer read permissions; no client direct invocation required';

grant usage on schema private to authenticated;
grant execute on function private.is_active(),private.my_role(),private.can_view_user(uuid),private.can_access_task(uuid),private.can_read_notice(uuid) to authenticated;
