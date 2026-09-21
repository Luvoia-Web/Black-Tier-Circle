/**
 * Atomically adjusts customer credit by a delta amount.
 * Rejects if result would be negative.
 * Returns the new balance.
 */
create or replace function adjust_customer_credit(
  p_customer_id uuid,
  p_delta       bigint  -- positive = add, negative = deduct
)
returns table(
  success       boolean,
  new_balance   bigint,
  error_code    text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_balance bigint;
begin
  update customers
  set credit_balance = credit_balance + p_delta,
      updated_at = now()
  where id = p_customer_id
    and (credit_balance + p_delta) >= 0  -- reject if would go negative
  returning credit_balance into v_new_balance;

  if not found then
    -- Either customer not found or balance would go negative
    return query select false, 0::bigint, 'INSUFFICIENT_CREDIT_OR_NOT_FOUND';
    return;
  end if;

  return query select true, v_new_balance, null::text;
end;
$$;

revoke all on function adjust_customer_credit(uuid, bigint) from public;
grant execute on function adjust_customer_credit(uuid, bigint) to service_role;
