-- Wallet top-ups and one-time chain payments.
-- Review and run this yourself after 0028. Do not apply it from the app.
-- Do not apply 0022.
--
-- Money is bigint minor units (1 USDT = 1000000). BSC USDT has 18 decimals.
-- The app converts with raw / 10^12, rounded down, before it calls credit_wallet_topup.
-- A buyer claim is accepted only when that minor amount equals amount_expected_minor.
-- amount_expected_minor is the requested amount plus a tag of 100..9900 minor units,
-- unique among pending top-ups that share pay_to_address.
-- bot_id is null for the owner store. Owner customers already store bot_id as null.

alter table platform_settings
  add column if not exists min_topup_minor bigint not null default 1000000,
  add column if not exists max_topup_minor bigint not null default 10000000000;

alter table tenant_settings
  add column if not exists max_topup_minor bigint not null default 10000000000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'platform_settings_topup_bounds_chk'
  ) then
    alter table platform_settings
      add constraint platform_settings_topup_bounds_chk
      check (min_topup_minor >= 1000000 and max_topup_minor >= min_topup_minor);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_settings_max_topup_chk'
  ) then
    alter table tenant_settings
      add constraint tenant_settings_max_topup_chk
      check (max_topup_minor >= 1000000);
  end if;
end $$;

create table if not exists wallet_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  bot_id uuid references bot_connections(id),
  tenant_id uuid references tenants(id),
  pay_to_address text not null,
  amount_expected_minor bigint not null check (amount_expected_minor > 0),
  credited_amount_minor bigint check (credited_amount_minor is null or credited_amount_minor > 0),
  status text not null default 'pending' check (status in ('pending', 'credited', 'expired', 'failed', 'rejected')),
  tx_hash text,
  network text not null default 'bep20',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  credited_at timestamptz,
  reject_reason text,
  constraint wallet_topups_pay_to_chk check (
    pay_to_address = lower(pay_to_address)
    and pay_to_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint wallet_topups_hash_lower_chk check (tx_hash is null or tx_hash = lower(tx_hash))
);

create unique index if not exists wallet_topups_one_pending
  on wallet_topups (customer_id)
  where status = 'pending';

-- The address matters, not the store. Resellers who share the owner address
-- must not be given the same pending amount.
create unique index if not exists wallet_topups_pending_amount
  on wallet_topups (pay_to_address, amount_expected_minor)
  where status = 'pending';

create index if not exists wallet_topups_pending_expiry
  on wallet_topups (expires_at)
  where status = 'pending';

create index if not exists wallet_topups_store_created
  on wallet_topups (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at desc);

-- One transaction hash can pay only one top-up or order in the whole system.
create table if not exists chain_payments (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  tx_hash text not null,
  purpose text not null check (purpose in ('topup', 'order')),
  reference_id uuid not null,
  customer_id uuid references customers(id),
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  constraint chain_payments_hash_lower_chk check (tx_hash = lower(tx_hash)),
  constraint chain_payments_network_tx_uidx unique (network, tx_hash)
);

create index if not exists chain_payments_reference
  on chain_payments (purpose, reference_id);

alter table wallet_topups enable row level security;
alter table chain_payments enable row level security;

drop policy if exists "wallet_topups_owner_read" on wallet_topups;
create policy "wallet_topups_owner_read" on wallet_topups
  for select
  using (
    tenant_id is null
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

drop policy if exists "wallet_topups_reseller_read" on wallet_topups;
create policy "wallet_topups_reseller_read" on wallet_topups
  for select
  using (
    tenant_id is not null
    and tenant_id in (select id from tenants where owner_user_id = auth.uid())
  );

drop policy if exists "chain_payments_owner_read" on chain_payments;
create policy "chain_payments_owner_read" on chain_payments
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    and (
      exists (
        select 1 from wallet_topups
        where wallet_topups.id = chain_payments.reference_id
          and chain_payments.purpose = 'topup'
          and wallet_topups.tenant_id is null
      )
      or exists (
        select 1 from orders
        where orders.id = chain_payments.reference_id
          and chain_payments.purpose = 'order'
          and orders.tenant_id is null
      )
    )
  );

drop policy if exists "chain_payments_reseller_read" on chain_payments;
create policy "chain_payments_reseller_read" on chain_payments
  for select
  using (
    exists (
      select 1 from wallet_topups
      where wallet_topups.id = chain_payments.reference_id
        and chain_payments.purpose = 'topup'
        and wallet_topups.tenant_id is not null
        and wallet_topups.tenant_id in (select id from tenants where owner_user_id = auth.uid())
    )
    or exists (
      select 1 from orders
      where orders.id = chain_payments.reference_id
        and chain_payments.purpose = 'order'
        and orders.tenant_id is not null
        and orders.tenant_id in (select id from tenants where owner_user_id = auth.uid())
    )
  );

revoke all on table wallet_topups, chain_payments from public, anon, authenticated;
grant select on table wallet_topups, chain_payments to authenticated;
grant all on table wallet_topups, chain_payments to service_role;

-- Credits a pending top-up once. A second call with the same top-up and hash
-- returns success and does not add the balance again.
-- A hash already stored for anything else returns ALREADY_USED and does not credit.
-- p_exact true (buyer claims) requires p_amount_minor = amount_expected_minor and
-- credits that expected amount. p_exact false is only for a manual review after
-- the owner typed the verified amount and a note.
drop function if exists credit_wallet_topup(uuid, text, bigint, text);
drop function if exists credit_wallet_topup(uuid, text, bigint, text, boolean);

create or replace function credit_wallet_topup(
  p_topup_id uuid,
  p_tx_hash text,
  p_amount_minor bigint,
  p_network text,
  p_exact boolean default true
)
returns table (
  success boolean,
  new_balance bigint,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup wallet_topups%rowtype;
  v_hash text;
  v_network text;
  v_balance bigint;
  v_credit bigint;
  v_exact boolean;
begin
  if p_topup_id is null then
    return query select false, 0::bigint, 'NOT_FOUND';
    return;
  end if;

  select * into v_topup
  from wallet_topups
  where id = p_topup_id
  for update;

  if not found then
    return query select false, 0::bigint, 'NOT_FOUND';
    return;
  end if;

  v_hash := lower(btrim(coalesce(p_tx_hash, '')));
  v_network := lower(btrim(coalesce(p_network, 'bep20')));
  if v_network = '' then
    v_network := 'bep20';
  end if;

  if v_topup.status = 'credited' and v_topup.tx_hash is not null and v_topup.tx_hash = v_hash then
    select credit_balance into v_balance
    from customers
    where id = v_topup.customer_id
    for update;
    return query select true, coalesce(v_balance, 0), null::text;
    return;
  end if;

  if v_topup.status = 'credited' then
    return query select false, 0::bigint, 'ALREADY_CREDITED';
    return;
  end if;

  if v_topup.status <> 'pending' then
    return query select false, 0::bigint, 'NOT_PENDING';
    return;
  end if;

  if v_topup.expires_at <= now() then
    update wallet_topups
    set status = 'expired',
        reject_reason = 'EXPIRED'
    where id = v_topup.id
      and status = 'pending';
    return query select false, 0::bigint, 'EXPIRED';
    return;
  end if;

  if v_network <> 'bep20' then
    return query select false, 0::bigint, 'UNSUPPORTED_NETWORK';
    return;
  end if;

  if v_hash !~ '^0x[0-9a-f]{64}$'
     and v_hash !~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return query select false, 0::bigint, 'INVALID_HASH';
    return;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    return query select false, 0::bigint, 'INVALID_AMOUNT';
    return;
  end if;

  v_exact := coalesce(p_exact, true);
  if v_exact and p_amount_minor <> v_topup.amount_expected_minor then
    return query select false, 0::bigint, 'AMOUNT_MISMATCH';
    return;
  end if;
  v_credit := case when v_exact then v_topup.amount_expected_minor else p_amount_minor end;

  select credit_balance into v_balance
  from customers
  where id = v_topup.customer_id
  for update;

  if not found then
    return query select false, 0::bigint, 'CUSTOMER_NOT_FOUND';
    return;
  end if;

  begin
    insert into chain_payments (network, tx_hash, purpose, reference_id, customer_id, amount_minor)
    values (v_network, v_hash, 'topup', v_topup.id, v_topup.customer_id, v_credit);
  exception
    when unique_violation then
      return query select false, coalesce(v_balance, 0), 'ALREADY_USED';
      return;
  end;

  update customers
  set credit_balance = credit_balance + v_credit,
      updated_at = now()
  where id = v_topup.customer_id
    and credit_balance + v_credit >= 0
  returning credit_balance into v_balance;

  if not found then
    raise exception 'wallet top-up credit failed';
  end if;

  update wallet_topups
  set status = 'credited',
      credited_amount_minor = v_credit,
      tx_hash = v_hash,
      network = v_network,
      credited_at = now(),
      reject_reason = null
  where id = v_topup.id
    and status = 'pending';

  if not found then
    raise exception 'wallet top-up status update failed';
  end if;

  return query select true, v_balance, null::text;
end;
$$;

revoke all on function credit_wallet_topup(uuid, text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function credit_wallet_topup(uuid, text, bigint, text, boolean) to service_role;

-- Records an order (or any) chain payment without crediting a wallet.
-- The same hash and reference returns success. Any other use returns ALREADY_USED.
create or replace function record_chain_payment(
  p_network text,
  p_tx_hash text,
  p_purpose text,
  p_reference_id uuid,
  p_customer_id uuid,
  p_amount_minor bigint
)
returns table (
  success boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_network text;
  v_purpose text;
  v_reference uuid;
begin
  v_hash := lower(btrim(coalesce(p_tx_hash, '')));
  v_network := lower(btrim(coalesce(p_network, '')));
  if v_hash !~ '^0x[0-9a-f]{64}$' then
    return query select false, 'INVALID_HASH';
    return;
  end if;
  if v_network <> 'bep20' then
    return query select false, 'UNSUPPORTED_NETWORK';
    return;
  end if;
  if p_purpose not in ('topup', 'order') then
    return query select false, 'INVALID_PURPOSE';
    return;
  end if;
  if p_reference_id is null or p_amount_minor is null or p_amount_minor <= 0 then
    return query select false, 'INVALID_AMOUNT';
    return;
  end if;

  begin
    insert into chain_payments (network, tx_hash, purpose, reference_id, customer_id, amount_minor)
    values (v_network, v_hash, p_purpose, p_reference_id, p_customer_id, p_amount_minor);
  exception
    when unique_violation then
      select purpose, reference_id into v_purpose, v_reference
      from chain_payments
      where network = v_network
        and tx_hash = v_hash;
      if v_purpose = p_purpose and v_reference = p_reference_id then
        return query select true, null::text;
        return;
      end if;
      return query select false, 'ALREADY_USED';
      return;
  end;

  return query select true, null::text;
end;
$$;

revoke all on function record_chain_payment(text, text, text, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function record_chain_payment(text, text, text, uuid, uuid, bigint) to service_role;
