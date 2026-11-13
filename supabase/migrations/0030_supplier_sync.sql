-- Supplier catalog sync: owner markup and stock/price write-back.
-- Review and run this yourself. Do not apply it from the app.
-- Do not apply 0022. 0029 is already applied.
--
-- Money stays bigint minor units (1 USDT = 1000000).
-- default_markup_percent and products.markup_percent are percents, not money.
-- No new RLS policies. platform_settings and products already have RLS.
-- Sync and publish write these columns with the service role, which bypasses RLS.
-- Anon and authenticated clients keep the access they already have.

alter table platform_settings
  add column if not exists default_markup_percent numeric(6,2) not null default 50,
  add column if not exists min_margin_percent numeric(6,2) not null default 10,
  add column if not exists auto_stock_sync boolean not null default true,
  add column if not exists auto_reprice_on_cost_change boolean not null default true;

alter table products
  add column if not exists pricing_mode text not null default 'manual',
  add column if not exists markup_percent numeric(6,2),
  add column if not exists supplier_in_stock boolean not null default true,
  add column if not exists supplier_cost_changed_at timestamptz,
  add column if not exists auto_paused_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'platform_settings_markup_bounds_chk'
  ) then
    alter table platform_settings
      add constraint platform_settings_markup_bounds_chk
      check (
        default_markup_percent >= 0
        and default_markup_percent <= 999.99
        and min_margin_percent >= 0
        and min_margin_percent <= 100
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'products_pricing_mode_chk'
  ) then
    alter table products
      add constraint products_pricing_mode_chk
      check (pricing_mode in ('manual', 'markup'));
  end if;
end $$;

-- Day one: a published supplier product inherits the supplier row's current stock.
update products as catalog
set supplier_in_stock = source.in_stock
from supplier_products as source
where catalog.supplier_id is not null
  and source.supplier_id = catalog.supplier_id
  and source.supplier_sku = catalog.supplier_sku;

-- idx_products_supplier is (supplier_id) only.
-- idx_products_supplier_sku is (supplier_sku) only.
-- This pair is what sync uses to find the linked catalog row.
create index if not exists idx_products_supplier_id_sku
  on products (supplier_id, supplier_sku)
  where supplier_id is not null;
