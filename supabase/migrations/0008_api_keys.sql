-- API keys for public reseller API access.
-- One key per reseller per environment (live/test).
-- Keys are hashed before storage — raw key shown only once at creation.

create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  -- Key hash stored (SHA-256 of raw key) — raw key never stored
  key_hash        text not null unique,
  -- Key prefix stored for identification (e.g. btc_live_abc1) — not the full key
  key_prefix      text not null,
  label           text not null,
  environment     text not null default 'test',
  scopes          text[] not null default array['orders:read', 'orders:write', 'products:read'],
  is_active       boolean not null default true,
  last_used_at    timestamptz,
  expires_at      timestamptz,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      uuid references profiles(id)
);

create index idx_api_keys_hash on api_keys(key_hash) where is_active = true;
create index idx_api_keys_tenant on api_keys(tenant_id);

alter table api_keys enable row level security;

create table webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  url             text not null check (url like 'https://%'),
  events          text[] not null,
  -- Encrypted HMAC secret; raw secret shown once at creation
  secret          text not null,
  secret_hash     text not null,
  secret_prefix   text not null,
  is_active       boolean not null default true,
  failure_count   int not null default 0,
  last_triggered_at timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_webhooks_tenant on webhook_endpoints(tenant_id) where is_active = true;
alter table webhook_endpoints enable row level security;
