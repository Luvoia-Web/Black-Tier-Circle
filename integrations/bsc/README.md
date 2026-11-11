# BSC / BEP20 USDT verification

Live checks are in `verify.ts`. They use `BSC_RPC_URLS` (public endpoints when that variable is unset) and, only when `ETHERSCAN_API_KEY` is set, Etherscan API V2 for chain id 56. They do not call BscScan V1.

The sandbox client accepts any hash except `0xFAIL` / `FAIL_`. It runs only when `PAYMENT_SANDBOX=true` and `NODE_ENV` is not `production`. A missing API key does not turn the sandbox on.

A transfer is accepted only when the receipt succeeded, the log is from the official BSC USDT contract, the recipient is the store address, the amount is at least the amount due, the block is after the order or top-up was created, and enough blocks have confirmed it.
