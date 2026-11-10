-- Wallet checkout safety. Review and run this yourself. Do not apply 0022.
-- Order: this file alone, after 0023. New enum values are not used inside this file.

alter type order_fulfillment_status add value if not exists 'processing';

alter table products add column if not exists buyer_category text;

create table if not exists customer_credit_entries (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id),
  order_id      uuid not null references orders(id),
  entry_type    text not null check (entry_type in ('debit', 'refund')),
  amount_minor  bigint not null check (amount_minor > 0),
  created_at    timestamptz not null default now(),
  unique (order_id, entry_type)
);

alter table customer_credit_entries enable row level security;

create unique index if not exists orders_idempotency_key_uidx
  on orders (idempotency_key)
  where idempotency_key is not null;

-- One unpaid checkout per customer, bot, and product.
-- If this fails, two awaiting rows already exist for the same buyer and product.
-- Cancel the extra unpaid orders, then run this statement again.
create unique index if not exists orders_one_open_checkout
  on orders (
    customer_id,
    product_id,
    (coalesce(bot_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where payment_status in ('awaiting', 'pending_verification');

-- Debit, mark paid, and keep fulfillment queued in one transaction.
-- A second call sees the row is no longer awaiting and does not debit again.
create or replace function pay_order_from_customer_wallet(
  p_order_id uuid,
  p_customer_id uuid
)
returns table(
  success boolean,
  new_balance bigint,
  amount bigint,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_balance bigint;
  v_price bigint;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if not found or v_order.customer_id is distinct from p_customer_id then
    return query select false, 0::bigint, 0::bigint, 'ORDER_NOT_FOUND';
    return;
  end if;

  if v_order.payment_status = 'verified' then
    return query select false, 0::bigint, 0::bigint, 'ORDER_ALREADY_PAID';
    return;
  end if;

  if v_order.payment_status = 'pending_verification' then
    return query select false, 0::bigint, 0::bigint, 'PAYMENT_IN_PROGRESS';
    return;
  end if;

  if v_order.payment_status <> 'awaiting' then
    return query select false, 0::bigint, 0::bigint, 'ORDER_NOT_PAYABLE';
    return;
  end if;

  if v_order.created_at < now() - interval '15 minutes' then
    return query select false, 0::bigint, 0::bigint, 'ORDER_EXPIRED';
    return;
  end if;

  v_price := v_order.quoted_retail_price;

  update orders
  set payment_status = 'pending_verification',
      payment_method = 'wallet',
      updated_at = now()
  where id = p_order_id
    and payment_status = 'awaiting';

  if not found then
    return query select false, 0::bigint, 0::bigint, 'PAYMENT_IN_PROGRESS';
    return;
  end if;

  select credit_balance into v_balance
  from customers
  where id = p_customer_id
  for update;

  if v_balance is null or v_balance < v_price then
    update orders
    set payment_status = 'awaiting',
        updated_at = now()
    where id = p_order_id
      and payment_status = 'pending_verification';
    return query select false, coalesce(v_balance, 0), v_price, 'INSUFFICIENT_BALANCE';
    return;
  end if;

  insert into customer_credit_entries (customer_id, order_id, entry_type, amount_minor)
  values (p_customer_id, p_order_id, 'debit', v_price);

  update customers
  set credit_balance = credit_balance - v_price,
      updated_at = now()
  where id = p_customer_id
  returning credit_balance into v_balance;

  update orders
  set payment_status = 'verified',
      idempotency_key = 'tg-closed:' || p_order_id::text,
      updated_at = now()
  where id = p_order_id
    and payment_status = 'pending_verification';

  insert into order_events (order_id, track, from_status, to_status, trigger, note)
  values
    (p_order_id, 'payment', 'awaiting', 'pending_verification', 'api', 'wallet payment started'),
    (p_order_id, 'payment', 'pending_verification', 'verified', 'api', 'paid from customer wallet');

  return query select true, v_balance, v_price, null::text;
end;
$$;

revoke all on function pay_order_from_customer_wallet(uuid, uuid) from public;
grant execute on function pay_order_from_customer_wallet(uuid, uuid) to service_role;
