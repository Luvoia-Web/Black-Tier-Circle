# BSC BEP20 USDT (platform docs)

See also `integrations/bsc/README.md`.

Phase 0 uses `createSandboxBscClient()` whenever `BSCSCAN_API_KEY` is unset or starts with `PLACEHOLDER`. `BSC_RPC_URL` may point at a public seed node in local env; the sandbox client still does not call it.

Live transfer verification (token contract, amount, window, uniqueness) is Phase 5.
