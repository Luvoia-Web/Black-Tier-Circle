-- 0023_profile_role_guard.sql
--
-- Stops signed-in users from changing their own account role or status.
--
-- Why: the "profiles_update_own" policy (migration 0002) lets a user update
-- their own profiles row but does not limit which columns. Without this guard
-- a pending reseller could set role = 'owner' or status = 'active' on their own
-- row straight from the browser and skip owner approval.
--
-- How: a trigger rejects any change to role or status made through the public
-- API roles (anon, authenticated). Server code uses the service role and the
-- Supabase SQL editor uses postgres, so owner approval keeps working.
--
-- Note: number 0022 is intentionally skipped (reserved, never applied).

create or replace function public.guard_profile_role_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- SECURITY: current_user is the API role of the caller. Do NOT make this
  -- function SECURITY DEFINER, or current_user would be the function owner.
  if current_user in ('anon', 'authenticated')
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'role and status can only be changed by the platform owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_status on public.profiles;

create trigger profiles_guard_role_status
  before update on public.profiles
  for each row
  execute function public.guard_profile_role_status();
