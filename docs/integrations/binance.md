# Binance Pay (platform docs)

See also `integrations/binance/README.md`.

Phase 0 uses `createSandboxBinancePayClient()` whenever `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`, or `BINANCE_PAY_MERCHANT_ID` is unset or starts with `PLACEHOLDER`.

Live merchant credentials are added in Phase 5. Do not put real keys in git or in logs.
