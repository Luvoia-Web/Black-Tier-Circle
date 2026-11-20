-- Scheduled buyer broadcasts for Phase J.
-- Not applied. The owner runs this file. Do not edit 0022, 0033, 0034, or 0035.
-- Send now works without this table. Scheduling needs it.

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  body text not null,
  image_url text,
  audience text not null default 'all',
  status text not null default 'scheduled',
  scheduled_for timestamptz not null,
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcasts_body_chk check (char_length(body) between 1 and 4096),
  constraint broadcasts_audience_chk check (audience in ('all', 'buyers', 'inactive')),
  constraint broadcasts_status_chk check (status in ('scheduled', 'sending', 'sent', 'canceled', 'failed')),
  constraint broadcasts_counts_chk check (recipients >= 0 and sent >= 0 and failed >= 0)
);

create index if not exists broadcasts_due_idx
  on broadcasts (status, scheduled_for);

create index if not exists broadcasts_tenant_idx
  on broadcasts (tenant_id, created_at desc);

-- select-only RLS. All writes go through the service role on the server.
alter table broadcasts enable row level security;

drop policy if exists "broadcasts_owner_read" on broadcasts;
create policy "broadcasts_owner_read" on broadcasts
  for select
  using (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

drop policy if exists "broadcasts_reseller_read" on broadcasts;
create policy "broadcasts_reseller_read" on broadcasts
  for select
  using (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  );

revoke all on table broadcasts from anon, authenticated;
grant select on table broadcasts to authenticated;
grant all on table broadcasts to service_role;
