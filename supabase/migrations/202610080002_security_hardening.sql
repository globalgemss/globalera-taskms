-- TaskMS V1 hardening: default trigger EXECUTE access and search_path
revoke execute on function public.on_auth_user_created() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = '';
-- user_access_links intentionally has no client RLS policies.
