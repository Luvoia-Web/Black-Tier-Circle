# Black Tier MemoryOS — Architecture

Black Tier MemoryOS is a three-layer commerce intelligence system where customers develop relationship memory, resellers develop institutional business memory, and the platform develops operational memory — while Supabase maintains current transactional truth and Hindsight accumulates experience from what previously happened.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BLACK TIER MEMORYOS                             │
├─────────────────────────────────────────────────────────────────────┤
│  CUSTOMER LAYER                                                     │
│  btc-prod:tenant:{id}:customer:{id}                                 │
│  - Preferences, objections, interaction history                     │
│  - AI recommendation at purchase moment                             │
│  - Outcome learning (converted / rejected)                          │
│                                                                     │
│  RESELLER / TENANT LAYER                                            │
│  btc-prod:tenant:{id}                                               │
│  - Business policies, pricing rules, seller instructions            │
│  - Store incidents + recovery patterns                              │
│  - Cross-customer pattern recognition                               │
│                                                                     │
│  PLATFORM LAYER                                                     │
│  btc-prod:platform                                                  │
│  - System-wide operational patterns                                 │
│  - Infrastructure health history                                    │
│  - Global commerce anomaly detection                                │
├─────────────────────────────────────────────────────────────────────┤
│  DATA FLOW                                                          │
│  Telegram Bot → Supabase (System of Record)                         │
│       ├──► Hindsight Retain (after every event)                     │
│       └──► Hindsight Recall + Reflect (before decisions)            │
├─────────────────────────────────────────────────────────────────────┤
│  API ROUTES                                                         │
│  POST /api/intelligence/customer   — Customer intelligence          │
│  GET  /api/intelligence/customer   — Memory Inspector               │
│  POST /api/intelligence/store      — Store intelligence             │
│  POST /api/intelligence/recovery   — Commerce recovery              │
│  POST /api/intelligence/outcome    — Outcome recording              │
│  POST /api/assistant               — Grok AI + memory context       │
├─────────────────────────────────────────────────────────────────────┤
│  MEMORY PRIMITIVES                                                  │
│  retain(bankId, content, options)  — Store an experience            │
│  recall(bankId, query, options)    — Retrieve relevant memories     │
│  reflect(bankId, query, options)   — Generate insight from memory   │
│  Bank isolation: hard boundary — zero cross-tenant leakage          │
│  Fail-open: commerce never blocked if Hindsight is unavailable      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Why bank IDs enforce tenant isolation

Tags are filters. A missing tag, a loose match mode, or a query that forgets to pass tags can return another tenant's facts from the same bank. Bank IDs are the storage boundary. Hindsight recall and reflect run inside one bank. A customer fact written to `btc-prod:tenant:{tenantA}:customer:{customerId}` is not addressable from `btc-prod:tenant:{tenantB}:customer:{customerId}`, even when the customer id string is identical. The resolver functions build those ids only from a tenant id taken from the authenticated session. Callers never choose another tenant's bank by sending a tenant id in the request body.

### Why Supabase is System of Record and Hindsight is System of Experience

Supabase holds the current truth: orders, payments, fulfillment status, wallets, and catalog prices. Those rows must be exact, queryable, and authoritative for money movement. Hindsight holds what those events meant over time: a price objection, a recovered supplier outage, a seller instruction that converted. Experience is lossy, consolidated, and retrieved by meaning. Mixing the two would either weaken the ledger or flatten memory into a log table that cannot reflect. The order row stays in Supabase. The purchase narrative is retained into Hindsight after fulfillment succeeds.

### Why fail-open: memory enriches, never gates

A recommendation is an enrichment of a checkout that already has a price, a product, and a payment state. If Hindsight is disabled, slow, or returning an error, retain and recall return empty results and the commerce path continues. Intelligence routes respond with `degraded: true` and status 200 instead of failing the request that a reseller is waiting on. Fulfillment schedules memory retention without awaiting it. The assistant still answers if recall returns nothing. Memory can be absent. Payment, delivery, and order state cannot be.

### Why documentId is mandatory on every retain call

Hindsight upserts by `documentId`. The same purchase, decision, or outcome written again with a new id becomes a second document and a second set of facts. Stable ids — `customer-interaction:{orderId}`, `preference:{orderId}`, `outcome:{decisionId}`, `chat-{timestamp}` — make a repeat of the same event replace the previous document instead of stacking duplicates. Without a document id, the bank cannot tell a correction from a new experience, and later recall surfaces both.

## Bank Isolation Proof

`npm run memory:smoke` runs three recalls against the seeded demo banks:

1. The demo-store-1 customer bank returns the seeded memories.
2. The demo-store-2 customer bank, using the same customer id, returns 0 memories.
3. The platform bank returns 0 memories.

A passing run is 3 PASS. The second and third cases are the proof: identical customer identity and a shared platform namespace do not leak customer experience across banks.
