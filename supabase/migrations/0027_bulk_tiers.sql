-- Bulk discount tiers. One set per product per store.
-- NULL tenant_id is the owner store. Review and run this yourself after 0026.
-- Do not apply 0022.

create table if not exists product_bulk_tiers (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  tenant_id        uuid references tenants(id) on delete cascade,
  min_qty          int not null check (min_qty >= 2),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists product_bulk_tiers_store_qty
  on product_bulk_tiers (
    product_id,
    (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    min_qty
  );

alter table product_bulk_tiers enable row level security;

drop policy if exists "product_bulk_tiers_owner_read" on product_bulk_tiers;
create policy "product_bulk_tiers_owner_read"
  on product_bulk_tiers
  for select
  using (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

drop policy if exists "product_bulk_tiers_reseller_read" on product_bulk_tiers;
create policy "product_bulk_tiers_reseller_read"
  on product_bulk_tiers
  for select
  using (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  );

revoke all on table product_bulk_tiers from public, anon, authenticated;
grant select on table product_bulk_tiers to authenticated;
grant all on table product_bulk_tiers to service_role;

-- Atomic replace used by the dashboard API. Floor and ordering are checked
-- in the API before this runs. service_role only.
create or replace function replace_product_bulk_tiers(
  p_product_id uuid,
  p_tenant_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_product_id is null then
    raise exception 'product required';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'tiers must be an array';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 5 then
    raise exception 'at most 5 tiers';
  end if;

  if p_tenant_id is null then
    delete from product_bulk_tiers
    where product_id = p_product_id and tenant_id is null;
  else
    delete from product_bulk_tiers
    where product_id = p_product_id and tenant_id = p_tenant_id;
  end if;

  insert into product_bulk_tiers (product_id, tenant_id, min_qty, unit_price_minor)
  select
    p_product_id,
    p_tenant_id,
    (item ->> 'min_qty')::int,
    (item ->> 'unit_price_minor')::bigint
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) item;
end;
$$;

revoke all on function replace_product_bulk_tiers(uuid, uuid, jsonb) from public;
grant execute on function replace_product_bulk_tiers(uuid, uuid, jsonb) to service_role;
