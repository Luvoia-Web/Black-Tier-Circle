/**
 * Platform-wide settings — one row, managed by owner from dashboard.
 * Replaces all env vars that should be configurable at runtime.
 */
create table platform_settings (
  id                          uuid primary key default gen_random_uuid(),

  -- Owner bot (replaces OWNER_BOT_TOKEN env var)
  owner_bot_token_encrypted   text,           -- encrypted with BOT_TOKEN_ENCRYPTION_KEY
  owner_bot_username          text,
  owner_bot_id                text,
  owner_bot_webhook_secret    text,
  owner_bot_status            text default 'disconnected',
  owner_bot_last_health_at    timestamptz,

  -- Platform payment settings (replaces BINANCE_PAY_* env vars)
  platform_usdt_wallet_bep20  text,           -- platform USDT receiving wallet
  binance_pay_api_key_encrypted text,
  binance_pay_api_secret_encrypted text,
  binance_pay_merchant_id     text,
  binance_pay_enabled         boolean default false,
  bep20_enabled               boolean default true,

  -- Platform info
  platform_name               text default 'Black Tier Circle',
  support_contact             text,
  support_telegram            text,

  -- Created/updated
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint platform_settings_bot_status_chk
    check (owner_bot_status in ('connected', 'disconnected', 'error'))
);

-- Only one row ever
create unique index platform_settings_singleton on platform_settings ((true));

insert into platform_settings (id) values (gen_random_uuid())
on conflict do nothing;

alter table platform_settings enable row level security;

-- Only service role can access (owner dashboard uses service role via API routes).
-- No policies: anon and authenticated clients cannot read or write this table.

-- Reseller payment toggles. Credentials stay in the existing encrypted columns.
alter table tenant_settings
  add column if not exists binance_pay_enabled boolean not null default false,
  add column if not exists use_own_usdt_wallet boolean not null default false;
