-- TaskMS V1.1: Staff onboarding fields and faster user filtering.
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists joining_date date;
create index if not exists profiles_role_status_idx on public.profiles(role,status);
create index if not exists profiles_full_name_idx on public.profiles(full_name);