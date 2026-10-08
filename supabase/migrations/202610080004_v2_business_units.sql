-- Global Era TaskMS V2: additive multi-business tenancy and workflow models.
-- Existing V1 user/task/project IDs and records are preserved. Applies ONLY to TaskMS database.
create table if not exists public.business_units (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null, description text, color text not null default '#2463eb',
 status text not null default 'Active' check(status in ('Active','Inactive')),
 created_at timestamptz not null default now()
);
create table if not exists public.unit_memberships (
 unit_id uuid not null references public.business_units(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 role text not null default 'staff' check(role in ('unit_admin','manager','staff','viewer')),
 status text not null default 'Active' check(status in ('Active','Inactive')),
 created_at timestamptz not null default now(), primary key(unit_id,user_id)
);
insert into public.business_units(code,name,description,color) values
 ('TRAINING','Global Era Training','Training center operations','#2458a6'),
 ('KITE','KITE Caregiver','Caregiver training and internships','#0f766e'),
 ('FURNITURE','Global Era Furniture','Furniture production and delivery','#9a5a25'),
 ('TRANSPORT','Transport Operations','Task references to RikshaMS','#7c3aed'),
 ('COOPERATIVE','Cooperative','Confidential cooperative operations','#3b6474')
on conflict(code) do nothing;
-- Preserve existing records by assigning the Training unit, not by replacing data.
alter table public.departments add column if not exists unit_id uuid references public.business_units(id);
alter table public.teams add column if not exists unit_id uuid references public.business_units(id);
alter table public.projects add column if not exists unit_id uuid references public.business_units(id);
alter table public.tasks add column if not exists unit_id uuid references public.business_units(id);
alter table public.notices add column if not exists unit_id uuid references public.business_units(id);
update public.departments set unit_id=(select id from public.business_units where code='TRAINING') where unit_id is null;
update public.teams set unit_id=(select id from public.business_units where code='TRAINING') where unit_id is null;
update public.projects set unit_id=(select id from public.business_units where code='TRAINING') where unit_id is null;
update public.tasks set unit_id=(select id from public.business_units where code='TRAINING') where unit_id is null;
update public.notices set unit_id=(select id from public.business_units where code='TRAINING') where unit_id is null;
alter table public.departments alter column unit_id set not null;
alter table public.teams alter column unit_id set not null;
alter table public.projects alter column unit_id set not null;
alter table public.tasks alter column unit_id set not null;
alter table public.notices alter column unit_id set not null;
insert into public.unit_memberships(unit_id,user_id,role)
 select b.id,p.id,case when p.role='admin' then 'unit_admin' when p.role='manager' then 'manager' else 'staff' end
 from public.business_units b cross join public.profiles p where b.code='TRAINING'
on conflict(unit_id,user_id) do nothing;
-- Ensure two departments in separate units may have the same name.
alter table public.departments drop constraint if exists departments_name_key;
create unique index if not exists departments_unit_name_key on public.departments(unit_id,lower(name));
create index if not exists unit_memberships_user_idx on public.unit_memberships(user_id,unit_id);
create index if not exists departments_unit_idx on public.departments(unit_id);
create index if not exists projects_unit_idx on public.projects(unit_id);
create index if not exists tasks_unit_status_idx on public.tasks(unit_id,status,due_date);
create index if not exists notices_unit_idx on public.notices(unit_id);
-- Task work breakdown and evidence references.
create table if not exists public.task_checklist (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete restrict,
 label text not null check(length(trim(label)) between 2 and 400),sort_order integer not null default 0,
 is_done boolean not null default false,done_by uuid references public.profiles(id),done_at timestamptz,
 created_by uuid references public.profiles(id),created_at timestamptz not null default now()
);
create table if not exists public.task_evidence (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete restrict,
 label text not null, url text not null check(length(url)<2049),kind text not null default 'Link',
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create table if not exists public.project_milestones (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete restrict,
 title text not null,due_date date,is_done boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.recurring_rules (
 id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.business_units(id) on delete restrict,
 title text not null,description text,priority text not null default 'Normal',
 assignee_id uuid references public.profiles(id),created_by uuid not null references public.profiles(id),
 frequency text not null check(frequency in ('Daily','Weekly','Monthly')),
 next_run date not null,active boolean not null default true,last_run date,created_at timestamptz default now()
);
create table if not exists public.automation_runs (
 id uuid primary key default gen_random_uuid(),rule_id uuid not null references public.recurring_rules(id),
 run_date date not null,task_id uuid references public.tasks(id),status text not null default 'Created',
 created_at timestamptz default now(),unique(rule_id,run_date)
);
create index if not exists task_checklist_task_idx on public.task_checklist(task_id,sort_order);
create index if not exists task_evidence_task_idx on public.task_evidence(task_id,created_at desc);
create index if not exists milestones_project_idx on public.project_milestones(project_id);
create index if not exists recurring_rules_due_idx on public.recurring_rules(active,next_run);

-- Privileged RLS helpers; business-unit membership is mandatory except Global Admin.
create or replace function private.is_unit_member(p_unit uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and (private.my_role()='admin' or exists(
 select 1 from public.unit_memberships m where m.unit_id=p_unit and m.user_id=auth.uid() and m.status='Active'));
$$;
create or replace function private.can_manage_unit(p_unit uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and (private.my_role()='admin' or exists(
 select 1 from public.unit_memberships m where m.unit_id=p_unit and m.user_id=auth.uid()
 and m.status='Active' and m.role in ('unit_admin','manager')));
$$;
create or replace function private.can_view_user(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and (private.my_role()='admin' or p_user=auth.uid() or exists(
 select 1 from public.unit_memberships me join public.unit_memberships them on them.unit_id=me.unit_id
 where me.user_id=auth.uid() and them.user_id=p_user and me.status='Active' and them.status='Active'));
$$;
create or replace function private.can_access_task(p_task uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and exists(select 1 from public.tasks t where t.id=p_task and
 (private.my_role()='admin' or (private.is_unit_member(t.unit_id) and (
 private.can_manage_unit(t.unit_id) or t.created_by=auth.uid() or t.supervisor_id=auth.uid()
 or exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=auth.uid())
 ))));
$$;
create or replace function private.can_read_notice(p_notice uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active() and exists (
 select 1 from public.notices n join public.profiles me on me.id=auth.uid() where n.id=p_notice
 and (private.my_role()='admin' or (private.is_unit_member(n.unit_id) and
 n.is_active and (n.start_date is null or n.start_date <= (now() at time zone 'Asia/Kathmandu')::date)
 and (n.end_date is null or n.end_date >= (now() at time zone 'Asia/Kathmandu')::date)
 and (n.target_type='all' or (n.target_type='user' and n.target_user_id=auth.uid())
 or (n.target_type='department' and n.target_department_id=me.department_id)
 or (n.target_type='manager_team' and n.target_manager_id in (me.manager_id,auth.uid()))))));
$$;
alter table public.business_units enable row level security;
alter table public.unit_memberships enable row level security;
alter table public.task_checklist enable row level security;
alter table public.task_evidence enable row level security;
alter table public.project_milestones enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.automation_runs enable row level security;
-- Replace V1 read policies that granted entire-workspace visibility.
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using(private.is_unit_member(unit_id));
drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using(private.is_unit_member(unit_id));
drop policy if exists team_members_read on public.team_members;
create policy team_members_read on public.team_members for select to authenticated using(
 exists(select 1 from public.teams t where t.id=team_id and private.is_unit_member(t.unit_id)));
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using(private.is_unit_member(unit_id));
create policy business_units_read on public.business_units for select to authenticated using(private.is_unit_member(id));
create policy unit_memberships_read on public.unit_memberships for select to authenticated using(private.is_unit_member(unit_id));
create policy task_checklist_read on public.task_checklist for select to authenticated using(private.can_access_task(task_id));
create policy task_evidence_read on public.task_evidence for select to authenticated using(private.can_access_task(task_id));
create policy milestones_read on public.project_milestones for select to authenticated using(
 exists(select 1 from public.projects p where p.id=project_id and private.is_unit_member(p.unit_id)));
create policy recurring_read on public.recurring_rules for select to authenticated using(private.is_unit_member(unit_id));
create policy automation_runs_read on public.automation_runs for select to authenticated using(
 exists(select 1 from public.recurring_rules r where r.id=rule_id and private.is_unit_member(r.unit_id)));
-- Existing profile/tasks/notices RLS policies call the replaced security-definer functions above.
-- Direct client mutations remain forbidden (all writes through authorized task-api).
revoke insert,update,delete on public.business_units,public.unit_memberships,public.task_checklist,
 public.task_evidence,public.project_milestones,public.recurring_rules,public.automation_runs from anon,authenticated;
grant select on public.business_units,public.unit_memberships,public.task_checklist,
 public.task_evidence,public.project_milestones,public.recurring_rules,public.automation_runs to authenticated;
grant execute on function private.is_unit_member(uuid),private.can_manage_unit(uuid) to authenticated;