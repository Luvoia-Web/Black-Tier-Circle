-- Platform polish columns for Phase P0.
-- Not applied. The owner runs this file. Do not edit 0022, 0033, 0034, or 0035.

alter table platform_settings
  add column if not exists owner_bot_paused boolean not null default false,
  add column if not exists bot_show_reseller_signup boolean not null default false,
  add column if not exists bot_show_my_api boolean not null default false;

comment on column platform_settings.owner_bot_paused is
  'Pauses owner bot webhook handling without violating platform_settings_bot_status_chk.';
comment on column platform_settings.bot_show_reseller_signup is
  'Owner toggle for showing Become a Reseller in the buyer bot menu. Off by default.';
comment on column platform_settings.bot_show_my_api is
  'Owner toggle for showing My API in the buyer bot menu. Off by default.';
