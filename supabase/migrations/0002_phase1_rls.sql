-- Phase 1 RLS: profiles, tenants, invitations.
-- Role checks use JWT app_metadata to avoid recursive policies on profiles.

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_select_owner"
  on profiles for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "tenants_select_own"
  on tenants for select
  using (owner_user_id = auth.uid());

create policy "tenants_select_owner"
  on tenants for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "invitations_select_owner"
  on invitations for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "invitations_insert_owner"
  on invitations for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');
