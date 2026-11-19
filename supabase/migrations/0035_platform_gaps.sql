-- Platform gaps found while rebuilding the dashboard.
-- Not applied. The owner runs this file. Do not edit 0022, 0033, or 0034.

-- Bot Studio "Send test to my Telegram" stores the signed-in user's own chat id.
alter table profiles
  add column if not exists telegram_chat_id text;

comment on column profiles.telegram_chat_id is
  'Numeric Telegram chat id for a test send. Never a bot token.';

-- Platform-wide legal text. Resellers cannot edit or hide these.
alter table platform_settings
  add column if not exists terms_of_service text,
  add column if not exists refund_policy text,
  add column if not exists privacy_policy text,
  add column if not exists legal_version integer not null default 1,
  add column if not exists legal_updated_at timestamptz,
  add column if not exists logo_url text,
  add column if not exists bep20_confirmations integer not null default 12,
  add column if not exists topup_expiry_minutes integer not null default 60,
  add column if not exists alert_failed_order boolean not null default true,
  add column if not exists alert_low_balance boolean not null default true,
  add column if not exists alert_new_reseller boolean not null default true,
  add column if not exists alert_large_topup boolean not null default true,
  add column if not exists quiet_start text,
  add column if not exists quiet_end text;

alter table platform_settings
  drop constraint if exists platform_settings_bep20_confirmations_chk;
alter table platform_settings
  add constraint platform_settings_bep20_confirmations_chk
  check (bep20_confirmations > 0 and topup_expiry_minutes > 0);
