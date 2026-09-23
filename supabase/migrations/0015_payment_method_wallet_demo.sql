-- Customer wallet and demo checkout need their own payment_method values.
-- New enum values cannot be used in the same transaction that adds them.
alter type payment_method add value if not exists 'wallet';
alter type payment_method add value if not exists 'demo';
