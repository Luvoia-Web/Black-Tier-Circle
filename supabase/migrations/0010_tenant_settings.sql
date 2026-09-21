-- Per-tenant store configuration (reseller dashboard settings).
-- Binance API credentials are stored encrypted, never plaintext.

create table tenant_settings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) unique,
  store_name      text,
  store_status    text not null default 'open',
  maintenance_msg text,
  support_contact text,
  support_chat_url text,
  support_phone   text,
  support_message text,
  terms_of_service text,
  refund_policy   text,
  privacy_policy  text,
  binance_merchant_uid text,
  binance_api_key_encrypted text,
  binance_api_secret_encrypted text,
  usdt_wallet_bep20 text,
  usdt_minimum_bep20 numeric(18,6) default 1.0,
  reseller_signup_enabled boolean default false,
  reseller_signup_message text,
  markup_percent  numeric(5,2) default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tenant_settings_store_status_chk check (store_status in ('open', 'maintenance'))
);

alter table tenant_settings enable row level security;
create index idx_tenant_settings_tenant on tenant_settings(tenant_id);

-- Individual retail overrides take precedence over bulk markup.
alter table reseller_listings
  add column if not exists price_override boolean not null default false;

-- Buyer "wallet" credit mapped onto customers (no separate buyer wallet table).
alter table customers
  add column if not exists credit_balance bigint not null default 0;
