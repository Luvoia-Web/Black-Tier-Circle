-- Bot Studio config. One row per store. NULL tenant_id is the owner store.
-- Review and run this yourself after 0024. Do not apply 0022.

create table if not exists store_config (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,
  version     int not null default 1,
  updated_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint store_config_object_chk check (jsonb_typeof(config) = 'object'),
  constraint store_config_size_chk check (octet_length(config::text) < 65536)
);

create unique index if not exists store_config_one_per_store
  on store_config ((coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)));

alter table store_config enable row level security;

create policy "store_config_owner_all"
  on store_config
  for all
  using (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  )
  with check (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

create policy "store_config_reseller_all"
  on store_config
  for all
  using (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  )
  with check (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  );
