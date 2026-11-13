-- Independent wholesale and retail markups. Percent or a fixed amount.
-- Review and run this yourself. Do not apply it from the app.
-- Do not apply 0022. Migrations through 0030 are already applied.
--
-- Money stays bigint minor units (1 USDT = 1000000).
-- Percent columns are percents, not money. Fixed columns are minor units.
-- products.markup_percent and products.pricing_mode stay. They are the 0030 values.
-- No new RLS policies. Sync and product writes use the service role, which bypasses RLS.

alter table products
  add column if not exists wholesale_markup_kind text not null default 'percent',
  add column if not exists wholesale_markup_percent numeric(6,2),
  add column if not exists wholesale_markup_minor bigint,
  add column if not exists retail_markup_kind text not null default 'percent',
  add column if not exists retail_markup_percent numeric(6,2),
  add column if not exists retail_markup_minor bigint;

alter table platform_settings
  add column if not exists default_wholesale_markup_kind text not null default 'percent',
  add column if not exists default_wholesale_markup_percent numeric(6,2),
  add column if not exists default_wholesale_markup_minor bigint,
  add column if not exists default_retail_markup_kind text not null default 'percent',
  add column if not exists default_retail_markup_percent numeric(6,2),
  add column if not exists default_retail_markup_minor bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_markup_rules_chk'
  ) then
    alter table products
      add constraint products_markup_rules_chk
      check (
        wholesale_markup_kind in ('percent', 'fixed')
        and retail_markup_kind in ('percent', 'fixed')
        and (wholesale_markup_percent is null or (wholesale_markup_percent >= 0 and wholesale_markup_percent <= 999.99))
        and (retail_markup_percent is null or (retail_markup_percent >= 0 and retail_markup_percent <= 999.99))
        and (wholesale_markup_minor is null or wholesale_markup_minor >= 0)
        and (retail_markup_minor is null or retail_markup_minor >= 0)
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'platform_settings_markup_rules_chk'
  ) then
    alter table platform_settings
      add constraint platform_settings_markup_rules_chk
      check (
        default_wholesale_markup_kind in ('percent', 'fixed')
        and default_retail_markup_kind in ('percent', 'fixed')
        and (default_wholesale_markup_percent is null or (default_wholesale_markup_percent >= 0 and default_wholesale_markup_percent <= 999.99))
        and (default_retail_markup_percent is null or (default_retail_markup_percent >= 0 and default_retail_markup_percent <= 999.99))
        and (default_wholesale_markup_minor is null or default_wholesale_markup_minor >= 0)
        and (default_retail_markup_minor is null or default_retail_markup_minor >= 0)
      );
  end if;
end $$;

-- Day one: a markup product keeps today's single percent on both sides.
update products
set wholesale_markup_kind = 'percent',
    retail_markup_kind = 'percent',
    wholesale_markup_percent = markup_percent,
    retail_markup_percent = markup_percent
where pricing_mode = 'markup'
  and markup_percent is not null;
