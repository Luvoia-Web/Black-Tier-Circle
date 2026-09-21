# BSC / BEP20 USDT verification

## Credentials required for live mode (Phase 5)

- `BSC_RPC_URL` — HTTPS endpoint for BSC JSON-RPC
- `BSCSCAN_API_KEY` — BscScan (or compatible) API key
- `PLATFORM_USDT_WALLET_ADDRESS` — platform receiving address for USDT (BEP20)

If `BSCSCAN_API_KEY` is missing or starts with `PLACEHOLDER`, `createBscClient()` returns the sandbox client.

## Sandbox behavior

- Hashes starting with `FAIL_` return `verified: false`
- All other hashes return a successful transfer to the expected address
- No RPC calls are made

## Verification rules (Phase 5)

Live verification must confirm:

1. Transaction succeeded on chain
2. Token is USDT BEP20
3. `to` matches `PLATFORM_USDT_WALLET_ADDRESS`
4. Amount equals the order amount in minor units
5. Block time is within `windowSeconds` of `orderCreatedAt`
6. The hash has not already been used for another order
