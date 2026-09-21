# Binance Pay integration

## Credentials required for live mode (Phase 5)

Set these in `.env.local` — never commit real values:

- `BINANCE_PAY_API_KEY`
- `BINANCE_PAY_API_SECRET`
- `BINANCE_PAY_MERCHANT_ID`

If any value is missing or starts with `PLACEHOLDER`, `createBinancePayClient()` returns the sandbox client automatically.

## Sandbox behavior

- `createOrder` returns `SANDBOX_PREPAY_{merchantTradeNo}`
- `queryOrder` returns `PAID` unless `merchantTradeNo` starts with `FAIL_`
- No network calls are made

## Testing

Use `tests/fixtures/fake-binance.ts` in unit tests. Do not hit Binance from CI.

## Known limitations

- Real signing, certificates, and webhook verification are not implemented in Phase 0
- Paid amount in sandbox is a fixed `10.000000` USDT string for adapter plumbing only; order amounts stay bigint in domain code
