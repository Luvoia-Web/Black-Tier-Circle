# Architecture Decision Records

## ADR 1 — USDT only at launch

**Status:** Accepted

**Decision:** The platform stores, quotes, and settles in USDT only.

**Rationale:** A single currency removes FX conversion, dual-ledger complexity, and rounding between units at launch. Resellers already operate in crypto rails (Binance Pay and BEP20 USDT). Additional currencies can be added later as a separate wallet product, not as a retrofit of this schema.

## ADR 2 — Integer minor units for all money

**Status:** Accepted

**Decision:** Every USDT amount is `bigint` minor units with 6 decimal places (`1 USDT = 1_000_000`). Application code uses `lib/money.ts`. Database columns are `bigint`. JavaScript `number`, `parseFloat`, and `toFixed` on numbers are forbidden for money.

**Rationale:** IEEE-754 floats cannot represent many decimal amounts exactly. Integer minor units make addition, reservation, and ledger balances exact and testable.

## ADR 3 — 12-digit numeric top-up tokens

**Status:** Accepted

**Decision:** Admin-generated wallet top-ups are 12-digit numeric strings with no leading zero, produced with `crypto.randomBytes`.

**Rationale:** Tokens are typed into Telegram chats and dashboards. Digits are easier to read aloud and transcribe than mixed-case secrets. 12 digits with no leading zero yield about 9×10^11 values, which is impractical to guess in combination with one-use server-side redemption.

## ADR 4 — Sandbox-first adapters

**Status:** Accepted

**Decision:** Binance Pay, BSC verification, Telegram send, and supplier fulfill expose real TypeScript interfaces with sandbox implementations. If an env var is missing or starts with `PLACEHOLDER_`, the sandbox client activates. Real clients are wired in Phase 5/4/6.

**Rationale:** Domain logic, tests, and dashboards can be built without live merchant keys or chain access. Development never fails with "missing credentials" when placeholders are set.

## ADR 5 — Append-only ledger

**Status:** Accepted

**Decision:** `ledger_transactions` has no `updated_at` and is never updated or deleted. Corrections insert new reversal or adjustment rows that reference the original.

**Rationale:** Financial history must be reconstructable. Silent in-place edits hide mistakes and make audits impossible.

## ADR 6 — Four order state tracks

**Status:** Accepted

**Decision:** An order has independent `payment_status`, `funding_status`, `fulfillment_status`, and `delivery_status`. Each track has its own legal transitions and `order_events` audit entries.

**Rationale:** Payment can succeed while delivery retries. Wholesale funding can reverse without implying the file was unsent. Independent tracks avoid a single mega-enum that cannot represent real failure combinations.
