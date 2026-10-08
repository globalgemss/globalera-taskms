-- V3.3: independently accessible achievement feed and auditable task-note enhancements.
-- Existing task completion remains derived from tasks.status / completed_at.
create table if not exists public.work_achievements (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.business_units(id) on delete restrict,
  title text not null check(length(trim(title)) between 3 and 220),
  description text not null default '',
  achieved_at timestamptz not null default now(),
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  evidence_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  request_id uuid unique,
  constraint achievement_evidence_secure check(evidence_url is null or evidence_url like 'https://%')
);
create index if not exists work_achievements_unit_date_idx on public.work_achievements(unit_id,achieved_at desc);
alter table public.work_achievements enable row level security;
drop policy if exists work_achievements_read on public.work_achievements;
create policy work_achievements_read on public.work_achievements for select to authenticated using (
  private.is_active() and (
    private.my_role()='admin' or (private.my_role()='manager' and private.can_manage_unit(unit_id))
  )
);
revoke all on public.work_achievements from anon;
grant select on public.work_achievements to authenticated;

alter table public.task_notes add column if not exists note_type text not null default 'General';
alter table public.task_notes add column if not exists is_pinned boolean not null default false;
alter table public.task_notes add column if not exists attachment_url text;
alter table public.task_notes add column if not exists edited_at timestamptz;
alter table public.task_notes drop constraint if exists task_notes_visibility_check;
alter table public.task_notes add constraint task_notes_visibility_check check(visibility in ('Team','Manager','Admin'));
alter table public.task_notes drop constraint if exists task_notes_type_check;
alter table public.task_notes add constraint task_notes_type_check check(note_type in ('General','Work Update','Issue','Instruction','Follow-up','Important'));
alter table public.task_notes drop constraint if exists task_notes_attachment_check;
alter table public.task_notes add constraint task_notes_attachment_check check(attachment_url is null or attachment_url like 'https://%');
drop policy if exists notes_read on public.task_notes;
create policy notes_read on public.task_notes for select to authenticated using (
  private.can_access_task(task_id) and (
    visibility='Team' or (visibility='Manager' and private.my_role() in ('admin','manager'))
    or (visibility='Admin' and private.my_role()='admin')
  )
);

create table if not exists public.task_note_edits (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.task_notes(id) on delete restrict,
  editor_id uuid not null references public.profiles(id),
  old_body text not null,
  new_body text not null,
  edited_at timestamptz not null default now()
);
create index if not exists note_edits_note_idx on public.task_note_edits(note_id,edited_at desc);
alter table public.task_note_edits enable row level security;
drop policy if exists task_note_edits_read on public.task_note_edits;
create policy task_note_edits_read on public.task_note_edits for select to authenticated using (
  exists(select 1 from public.task_notes n where n.id=note_id and private.can_access_task(n.task_id)
  and (n.visibility='Team' or n.visibility='Manager' and private.my_role() in ('admin','manager')
       or n.visibility='Admin' and private.my_role()='admin'))
);
revoke all on public.task_note_edits from anon;
grant select on public.task_note_edits to authenticated;

-- Avoid publishing the details of private notes in the generic public activity timeline.
-- Existing historical events remain intact, and are still governed by RLS visibility.
drop policy if exists timeline_read on public.task_timeline;
create policy timeline_read on public.task_timeline for select to authenticated using (
 private.can_access_task(task_id) and (visibility='Team' or visibility='Manager' and private.my_role() in ('admin','manager')
 or visibility='Admin' and private.my_role()='admin')
);