-- ============================================================
-- WALLET FUNCTIONS
-- All amounts in USDT minor units (bigint).
-- These functions are the ONLY way to mutate wallet balances.
-- Application code must never UPDATE wallets directly.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Initialize wallet for a new tenant
-- Called once when a tenant is created and activated
-- ────────────────────────────────────────────────────────────
create or replace function create_wallet(p_tenant_id uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
begin
  insert into wallets (tenant_id, balance_total, balance_reserved)
  values (p_tenant_id, 0, 0)
  on conflict (tenant_id) do nothing
  returning id into v_wallet_id;

  -- If wallet already existed, fetch its id
  if v_wallet_id is null then
    select id into v_wallet_id from wallets where tenant_id = p_tenant_id;
  end if;

  return v_wallet_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Credit wallet via top-up token redemption
-- Atomically: validate token → credit wallet → record ledger entry → burn token
-- ────────────────────────────────────────────────────────────
create or replace function redeem_topup_token(
  p_token        char(12),
  p_tenant_id    uuid,
  p_redeemed_by  uuid
)
returns table(
  success        boolean,
  amount_credited bigint,
  new_balance    bigint,
  error_code     text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_token_row    topup_tokens%rowtype;
  v_wallet_id    uuid;
  v_new_balance  bigint;
begin
  -- Lock the token row to prevent concurrent redemption
  select * into v_token_row
  from topup_tokens
  where token = p_token
  for update;

  -- Validate token exists
  if not found then
    return query select false, 0::bigint, 0::bigint, 'TOKEN_NOT_FOUND';
    return;
  end if;

  -- Validate token is active
  if v_token_row.status != 'active' then
    return query select false, 0::bigint, 0::bigint, 'TOKEN_' || upper(v_token_row.status::text);
    return;
  end if;

  -- Validate token not expired
  if v_token_row.expires_at is not null and v_token_row.expires_at < now() then
    -- Mark as expired
    update topup_tokens set status = 'expired' where id = v_token_row.id;
    return query select false, 0::bigint, 0::bigint, 'TOKEN_EXPIRED';
    return;
  end if;

  -- Validate tenant restriction (if token was created for a specific tenant)
  if v_token_row.tenant_id is not null and v_token_row.tenant_id != p_tenant_id then
    return query select false, 0::bigint, 0::bigint, 'TOKEN_WRONG_TENANT';
    return;
  end if;

  -- Get wallet ID (must exist — wallet created when tenant activated)
  select id into v_wallet_id from wallets where tenant_id = p_tenant_id for update;

  if not found then
    return query select false, 0::bigint, 0::bigint, 'WALLET_NOT_FOUND';
    return;
  end if;

  -- Credit the wallet
  update wallets
  set balance_total = balance_total + v_token_row.amount_usdt,
      updated_at = now()
  where id = v_wallet_id
  returning balance_total into v_new_balance;

  -- Write immutable ledger entry
  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_id, reference_type, actor_id, note
  ) values (
    v_wallet_id,
    'top_up_credit',
    v_token_row.amount_usdt,  -- positive = credit
    v_new_balance,
    v_token_row.token,
    'topup_token',
    p_redeemed_by,
    'Top-up token redeemed'
  );

  -- Burn the token (mark redeemed — never delete)
  update topup_tokens
  set status = 'redeemed',
      redeemed_by = p_redeemed_by,
      redeemed_at = now()
  where id = v_token_row.id;

  return query select true, v_token_row.amount_usdt, v_new_balance, null::text;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Reserve funds for a pending order
-- Atomically: check available balance → lock funds → record ledger entry
-- ────────────────────────────────────────────────────────────
create or replace function reserve_wallet_funds(
  p_wallet_id      uuid,
  p_order_id       uuid,
  p_amount         bigint,
  p_expires_at     timestamptz
)
returns table(
  success          boolean,
  error_code       text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_wallet         wallets%rowtype;
  v_available      bigint;
  v_new_reserved   bigint;
  v_existing       wallet_reservations%rowtype;
begin
  if p_amount <= 0 then
    return query select false, 'AMOUNT_MUST_BE_POSITIVE';
    return;
  end if;

  -- Idempotent: an order may only hold one reservation
  select * into v_existing
  from wallet_reservations
  where order_id = p_order_id
  for update;

  if found then
    if v_existing.status = 'active' and v_existing.amount = p_amount and v_existing.wallet_id = p_wallet_id then
      return query select true, null::text;
      return;
    end if;
    return query select false, 'RESERVATION_EXISTS';
    return;
  end if;

  -- Lock wallet row
  select * into v_wallet from wallets where id = p_wallet_id for update;

  if not found then
    return query select false, 'WALLET_NOT_FOUND';
    return;
  end if;

  -- Calculate available balance
  v_available := v_wallet.balance_total - v_wallet.balance_reserved;

  -- Check sufficient funds
  if v_available < p_amount then
    return query select false, 'INSUFFICIENT_FUNDS';
    return;
  end if;

  -- Increase reserved amount (does NOT reduce total balance)
  v_new_reserved := v_wallet.balance_reserved + p_amount;

  update wallets
  set balance_reserved = v_new_reserved,
      updated_at = now()
  where id = p_wallet_id;

  -- Write ledger entry for the reservation
  -- Amount is 0 (no balance change) but reserved increases
  -- We record it for audit trail
  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_id, reference_type, note
  ) values (
    p_wallet_id,
    'reservation',
    0,  -- no change to total balance
    v_wallet.balance_total,  -- total balance unchanged
    p_order_id::text,
    'order',
    'Funds reserved for order ' || p_order_id::text
  );

  -- Create reservation record
  insert into wallet_reservations (
    wallet_id, order_id, amount, status, expires_at
  ) values (
    p_wallet_id, p_order_id, p_amount, 'active', p_expires_at
  );

  return query select true, null::text;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Consume a reservation (order fulfilled — debit the wallet)
-- ────────────────────────────────────────────────────────────
create or replace function consume_wallet_reservation(
  p_order_id  uuid
)
returns table(
  success     boolean,
  error_code  text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_reservation  wallet_reservations%rowtype;
  v_wallet       wallets%rowtype;
  v_new_total    bigint;
  v_new_reserved bigint;
begin
  -- Lock the reservation
  select * into v_reservation
  from wallet_reservations
  where order_id = p_order_id and status = 'active'
  for update;

  if not found then
    return query select false, 'RESERVATION_NOT_FOUND';
    return;
  end if;

  -- Lock wallet
  select * into v_wallet from wallets where id = v_reservation.wallet_id for update;

  if not found then
    return query select false, 'WALLET_NOT_FOUND';
    return;
  end if;

  -- Debit: reduce both total and reserved
  v_new_total    := v_wallet.balance_total - v_reservation.amount;
  v_new_reserved := v_wallet.balance_reserved - v_reservation.amount;

  -- Safety check — should never happen if reserve was called correctly
  if v_new_total < 0 or v_new_reserved < 0 then
    return query select false, 'BALANCE_INTEGRITY_ERROR';
    return;
  end if;

  update wallets
  set balance_total = v_new_total,
      balance_reserved = v_new_reserved,
      updated_at = now()
  where id = v_reservation.wallet_id;

  -- Mark reservation consumed
  update wallet_reservations
  set status = 'consumed', updated_at = now()
  where id = v_reservation.id;

  -- Immutable ledger entry: debit
  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_id, reference_type, note
  ) values (
    v_reservation.wallet_id,
    'wholesale_debit',
    -v_reservation.amount,  -- negative = debit
    v_new_total,
    p_order_id::text,
    'order',
    'Wholesale debit for fulfilled order ' || p_order_id::text
  );

  return query select true, null::text;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Release a reservation (order failed/cancelled — return funds)
-- ────────────────────────────────────────────────────────────
create or replace function release_wallet_reservation(
  p_order_id  uuid,
  p_reason    text default 'Order cancelled'
)
returns table(
  success     boolean,
  error_code  text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_reservation  wallet_reservations%rowtype;
  v_wallet       wallets%rowtype;
  v_new_reserved bigint;
begin
  select * into v_reservation
  from wallet_reservations
  where order_id = p_order_id and status = 'active'
  for update;

  if not found then
    return query select false, 'RESERVATION_NOT_FOUND';
    return;
  end if;

  select * into v_wallet from wallets where id = v_reservation.wallet_id for update;

  if not found then
    return query select false, 'WALLET_NOT_FOUND';
    return;
  end if;

  v_new_reserved := v_wallet.balance_reserved - v_reservation.amount;
  if v_new_reserved < 0 then
    return query select false, 'BALANCE_INTEGRITY_ERROR';
    return;
  end if;

  -- Reduce reserved amount (total balance unchanged — funds never left)
  update wallets
  set balance_reserved = v_new_reserved,
      updated_at = now()
  where id = v_reservation.wallet_id;

  -- Mark reservation released
  update wallet_reservations
  set status = 'released', updated_at = now()
  where id = v_reservation.id;

  -- Immutable ledger entry
  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_id, reference_type, note
  ) values (
    v_reservation.wallet_id,
    'reservation_release',
    0,  -- total balance unchanged
    v_wallet.balance_total,
    p_order_id::text,
    'order',
    p_reason
  );

  return query select true, null::text;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Manual credit (owner adjusts reseller balance directly)
-- ────────────────────────────────────────────────────────────
create or replace function manual_wallet_credit(
  p_wallet_id  uuid,
  p_amount     bigint,
  p_actor_id   uuid,
  p_note       text
)
returns table(
  success      boolean,
  new_balance  bigint,
  error_code   text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_wallet      wallets%rowtype;
  v_new_balance bigint;
begin
  if p_amount <= 0 then
    return query select false, 0::bigint, 'AMOUNT_MUST_BE_POSITIVE';
    return;
  end if;

  select * into v_wallet from wallets where id = p_wallet_id for update;

  if not found then
    return query select false, 0::bigint, 'WALLET_NOT_FOUND';
    return;
  end if;

  update wallets
  set balance_total = balance_total + p_amount,
      updated_at = now()
  where id = p_wallet_id
  returning balance_total into v_new_balance;

  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_type, actor_id, note
  ) values (
    p_wallet_id, 'manual_credit', p_amount, v_new_balance,
    'manual', p_actor_id, p_note
  );

  return query select true, v_new_balance, null::text;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Manual debit (owner corrects an overpayment etc.)
-- ────────────────────────────────────────────────────────────
create or replace function manual_wallet_debit(
  p_wallet_id  uuid,
  p_amount     bigint,
  p_actor_id   uuid,
  p_note       text
)
returns table(
  success      boolean,
  new_balance  bigint,
  error_code   text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_wallet      wallets%rowtype;
  v_available   bigint;
  v_new_balance bigint;
begin
  if p_amount <= 0 then
    return query select false, 0::bigint, 'AMOUNT_MUST_BE_POSITIVE';
    return;
  end if;

  select * into v_wallet from wallets where id = p_wallet_id for update;

  if not found then
    return query select false, 0::bigint, 'WALLET_NOT_FOUND';
    return;
  end if;

  v_available := v_wallet.balance_total - v_wallet.balance_reserved;

  if v_available < p_amount then
    return query select false, 0::bigint, 'INSUFFICIENT_AVAILABLE_FUNDS';
    return;
  end if;

  update wallets
  set balance_total = balance_total - p_amount,
      updated_at = now()
  where id = p_wallet_id
  returning balance_total into v_new_balance;

  insert into ledger_transactions (
    wallet_id, entry_type, amount, balance_after,
    reference_type, actor_id, note
  ) values (
    p_wallet_id, 'manual_debit', -p_amount, v_new_balance,
    'manual', p_actor_id, p_note
  );

  return query select true, v_new_balance, null::text;
end;
$$;

revoke all on function create_wallet(uuid) from public;
revoke all on function redeem_topup_token(char, uuid, uuid) from public;
revoke all on function reserve_wallet_funds(uuid, uuid, bigint, timestamptz) from public;
revoke all on function consume_wallet_reservation(uuid) from public;
revoke all on function release_wallet_reservation(uuid, text) from public;
revoke all on function manual_wallet_credit(uuid, bigint, uuid, text) from public;
revoke all on function manual_wallet_debit(uuid, bigint, uuid, text) from public;

grant execute on function create_wallet(uuid) to service_role;
grant execute on function redeem_topup_token(char, uuid, uuid) to service_role;
grant execute on function reserve_wallet_funds(uuid, uuid, bigint, timestamptz) to service_role;
grant execute on function consume_wallet_reservation(uuid) to service_role;
grant execute on function release_wallet_reservation(uuid, text) to service_role;
grant execute on function manual_wallet_credit(uuid, bigint, uuid, text) to service_role;
grant execute on function manual_wallet_debit(uuid, bigint, uuid, text) to service_role;

-- Read policies. Mutations go through security definer RPCs only.
create policy "wallets_select_own"
  on wallets for select
  using (tenant_id in (select id from tenants where owner_user_id = auth.uid()));

create policy "wallets_select_owner"
  on wallets for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "ledger_select_own"
  on ledger_transactions for select
  using (
    wallet_id in (
      select id from wallets
      where tenant_id in (select id from tenants where owner_user_id = auth.uid())
    )
  );

create policy "ledger_select_owner"
  on ledger_transactions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "topup_tokens_select_owner"
  on topup_tokens for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

create policy "reservations_select_own"
  on wallet_reservations for select
  using (
    wallet_id in (
      select id from wallets
      where tenant_id in (select id from tenants where owner_user_id = auth.uid())
    )
  );

create policy "reservations_select_owner"
  on wallet_reservations for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');
