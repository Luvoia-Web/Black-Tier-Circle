# Binance Pay integration

## Credentials required for live mode

Save the merchant id, API key, and API secret from the owner dashboard (or a reseller dashboard for that bot). They are encrypted in the database.

If credentials are missing, order creation uses the sandbox client.

## Sandbox behavior

- `createOrder` returns `SANDBOX_PREPAY_{merchantTradeNo}`
- `queryOrder` returns `PAID` unless `merchantTradeNo` starts with `FAIL_`
- No network calls are made

## Testing

Use `tests/fixtures/fake-binance.ts` in unit tests. Do not hit Binance from CI.

## Known limitations

- Real signing, certificates, and webhook verification are not implemented in Phase 0
- Paid amount in sandbox is a fixed `10.000000` USDT string for adapter plumbing only; order amounts stay bigint in domain code
