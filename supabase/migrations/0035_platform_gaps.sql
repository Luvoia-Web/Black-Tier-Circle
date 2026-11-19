-- Platform gaps found while rebuilding the dashboard.
-- Not applied. The owner runs this file. Do not edit 0022, 0033, or 0034.

-- Bot Studio "Send test to my Telegram" stores the signed-in user's own chat id.
alter table profiles
  add column if not exists telegram_chat_id text;

comment on column profiles.telegram_chat_id is
  'Numeric Telegram chat id for a test send. Never a bot token.';
