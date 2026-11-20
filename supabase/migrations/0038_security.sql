-- Migration 0038: Phase L security hardening
-- Review and apply manually in Supabase SQL Editor. Do not edit 0025 or 0020.

-- 1. Replace FOR ALL RLS policies on store_config (from 0025_bot_studio.sql)
--    with select-only policies matching 0034_platform_final.sql.
--    All writes go through server routes using the service_role client.
alter table store_config enable row level security;

drop policy if exists "store_config_owner_all" on store_config;
drop policy if exists "store_config_reseller_all" on store_config;

drop policy if exists "store_config_owner_read" on store_config;
create policy "store_config_owner_read"
  on store_config
  for select
  using (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

drop policy if exists "store_config_reseller_read" on store_config;
create policy "store_config_reseller_read"
  on store_config
  for select
  using (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  );

revoke all on table store_config from public, anon, authenticated;
grant select on table store_config to authenticated;
grant all on table store_config to service_role;

-- 2. Explicit owner-controlled payment mode switch (default false = Live).
--    In NODE_ENV=production, application code still refuses Demo mode unless
--    PAYMENT_DEMO_ALLOW_PROD=true is explicitly set on the server.
alter table platform_settings
  add column if not exists payment_demo_mode boolean not null default false;

comment on column platform_settings.payment_demo_mode is
  'Owner-controlled Demo payment mode toggle (false = Live). Ignored in production unless PAYMENT_DEMO_ALLOW_PROD=true.';

-- 3. Security, audit, and high-row-count tenant-scoped indexes.
create index if not exists idx_audit_log_action_created_at
  on audit_log (action, created_at desc);

create index if not exists idx_orders_tenant_payment_created
  on orders (tenant_id, payment_status, created_at desc);

create index if not exists idx_customers_bot_created
  on customers (bot_id, created_at desc);

create index if not exists idx_broadcasts_status_scheduled
  on broadcasts (status, scheduled_for)
  where status = 'scheduled';
